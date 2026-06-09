"""Unit tests for _is_safe_download_url SSRF guard in scripts/validate-marketplace.py.

The function protects the nightly check_download_urls() check from being used
as an SSRF vector via malicious downloadUrl values in registry.json.
"""
import importlib.util
import os
import sys

import pytest


def _load_validate_marketplace():
    """Load the validate-marketplace module (hyphenated filename requires importlib)."""
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate-marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_mod = _load_validate_marketplace()
_is_safe = _mod._is_safe_download_url


# ── Valid URLs ──────────────────────────────────────────────────────────────

class TestValidUrls:
    def test_valid_https_public(self):
        ok, reason = _is_safe("https://github.com/kubestellar/console/releases/download/v1.0/asset.tar.gz")
        assert ok, f"expected safe, got: {reason}"

    def test_valid_https_with_port(self):
        ok, reason = _is_safe("https://releases.example.com:8443/path/to/file.zip")
        assert ok, f"expected safe, got: {reason}"

    def test_valid_https_cdn(self):
        ok, reason = _is_safe("https://cdn.jsdelivr.net/npm/some-package@1.0/dist/file.js")
        assert ok, f"expected safe, got: {reason}"


# ── Scheme rejection ───────────────────────────────────────────────────────

class TestSchemeRejection:
    def test_http_rejected(self):
        ok, reason = _is_safe("http://example.com/file.tar.gz")
        assert not ok
        assert "https" in reason

    def test_ftp_rejected(self):
        ok, reason = _is_safe("ftp://example.com/file.tar.gz")
        assert not ok

    def test_file_scheme_rejected(self):
        ok, reason = _is_safe("file:///etc/passwd")
        assert not ok

    def test_data_uri_rejected(self):
        ok, reason = _is_safe("data:text/html,<h1>xss</h1>")
        assert not ok

    def test_no_scheme_rejected(self):
        ok, reason = _is_safe("example.com/file.tar.gz")
        assert not ok


# ── Missing host ────────────────────────────────────────────────────────────

class TestMissingHost:
    def test_empty_url_rejected(self):
        ok, reason = _is_safe("")
        assert not ok

    def test_https_no_host_rejected(self):
        ok, reason = _is_safe("https:///path/to/file")
        assert not ok
        assert "host" in reason


# ── Loopback and link-local ─────────────────────────────────────────────────

class TestLoopbackRejection:
    @pytest.mark.parametrize("url", [
        "https://127.0.0.1/file",
        "https://127.1.2.3/file",
        "https://127.255.255.255/file",
        "https://localhost/file",
        "https://localhost:8080/file",
    ])
    def test_loopback_ipv4_rejected(self, url):
        ok, reason = _is_safe(url)
        assert not ok, f"{url!r} should be rejected"
        assert "loopback" in reason

    def test_ipv6_loopback_rejected(self):
        ok, reason = _is_safe("https://[::1]/file")
        assert not ok
        assert "loopback" in reason

    @pytest.mark.parametrize("url", [
        "https://169.254.0.1/file",
        "https://169.254.169.254/latest/meta-data/",  # AWS metadata endpoint
        "https://169.254.169.254:80/computeMetadata/",  # GCP metadata endpoint
        "https://169.254.255.255/file",
    ])
    def test_link_local_rejected(self, url):
        ok, reason = _is_safe(url)
        assert not ok, f"{url!r} should be rejected (link-local)"
        assert "loopback" in reason or "link-local" in reason


# ── RFC-1918 private ranges ──────────────────────────────────────────────────

class TestPrivateRangesRejection:
    @pytest.mark.parametrize("url", [
        "https://10.0.0.1/file",
        "https://10.255.255.255/file",
        "https://10.0.0.1:443/path",
    ])
    def test_10_range_rejected(self, url):
        ok, reason = _is_safe(url)
        assert not ok, f"{url!r} should be rejected (10.x)"
        assert "private" in reason

    @pytest.mark.parametrize("url", [
        "https://192.168.0.1/file",
        "https://192.168.1.100/file",
        "https://192.168.255.255/file",
    ])
    def test_192_168_range_rejected(self, url):
        ok, reason = _is_safe(url)
        assert not ok, f"{url!r} should be rejected (192.168.x)"
        assert "private" in reason

    @pytest.mark.parametrize("second_octet", [16, 17, 20, 31])
    def test_172_16_to_31_rejected(self, second_octet):
        url = f"https://172.{second_octet}.0.1/file"
        ok, reason = _is_safe(url)
        assert not ok, f"{url!r} should be rejected (172.{second_octet}.x)"
        assert "private" in reason

    @pytest.mark.parametrize("second_octet", [0, 1, 15, 32, 33, 100])
    def test_172_outside_range_allowed(self, second_octet):
        """172.0-15.x and 172.32-255.x are public addresses."""
        url = f"https://172.{second_octet}.0.1/file"
        ok, _reason = _is_safe(url)
        assert ok, f"{url!r} should be allowed (172.{second_octet} is public)"


# ── Edge cases ───────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_hostname_that_looks_like_10_dot_prefix(self):
        """10.example.com — hostname starts with '10.' but is not an IP."""
        # The current implementation blocks by string prefix, so this tests
        # existing behaviour: '10.' prefix is rejected regardless of whether
        # it's a hostname or IP.  Document the behaviour rather than change it.
        ok, reason = _is_safe("https://10.example.com/file")
        # Current implementation rejects on '10.' prefix — document this.
        assert not ok  # intentional: string-prefix check

    def test_unusual_port_allowed(self):
        """Public HTTPS host with non-standard port is fine."""
        ok, reason = _is_safe("https://releases.example.org:9443/asset")
        assert ok, f"expected safe, got: {reason}"

    def test_query_string_preserved(self):
        ok, reason = _is_safe("https://example.com/file?token=abc&v=1")
        assert ok, f"expected safe, got: {reason}"
