"""Unit tests for _is_safe_download_url() SSRF guard.

Validates that the function correctly blocks:
- Non-HTTPS schemes (http, ftp, file, data, javascript)
- Loopback addresses (localhost, 127.x.x.x, ::1)
- Link-local addresses (169.254.x.x)
- RFC-1918 private ranges (10.x, 172.16-31.x, 192.168.x)
- URLs with empty/missing hosts

And allows:
- Valid HTTPS URLs with public hosts
"""

import importlib.util
import os
import sys

import pytest

# Import the validate script as a module so we can test _is_safe_download_url
_SCRIPT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "scripts", "validate-marketplace.py"
)
spec = importlib.util.spec_from_file_location("validate_marketplace", _SCRIPT_PATH)
validate_marketplace = importlib.util.module_from_spec(spec)

# The script uses argparse at module level and calls sys.exit — we must
# prevent it from executing main() on import.  We patch sys.argv and
# catch SystemExit.
_orig_argv = sys.argv
sys.argv = ["validate-marketplace.py", "--help"]
try:
    spec.loader.exec_module(validate_marketplace)
except SystemExit:
    pass
finally:
    sys.argv = _orig_argv

_is_safe_download_url = validate_marketplace._is_safe_download_url


class TestAllowsValidHTTPS:
    """Test that legitimate HTTPS URLs are accepted."""

    @pytest.mark.parametrize(
        "url",
        [
            "https://github.com/kubestellar/console/releases/download/v1.0.0/app.tar.gz",
            "https://objects.githubusercontent.com/some-asset",
            "https://registry.npmjs.org/@scope/pkg/-/pkg-1.0.0.tgz",
            "https://cdn.example.com/path/to/file.zip",
            "https://203.0.113.50/public-asset.bin",
        ],
    )
    def test_valid_https_allowed(self, url):
        ok, reason = _is_safe_download_url(url)
        assert ok is True, f"Expected {url} to be allowed, got rejection: {reason}"


class TestBlocksNonHTTPS:
    """Test that non-HTTPS schemes are rejected."""

    @pytest.mark.parametrize(
        "url,expected_scheme",
        [
            ("http://example.com/file.tar.gz", "http"),
            ("ftp://files.example.com/archive.zip", "ftp"),
            ("file:///etc/passwd", "file"),
            ("data:text/plain;base64,SGVsbG8=", "data"),
            ("javascript:alert(1)", "javascript"),
            ("gopher://evil.com/path", "gopher"),
        ],
    )
    def test_non_https_rejected(self, url, expected_scheme):
        ok, reason = _is_safe_download_url(url)
        assert ok is False
        assert expected_scheme in reason


class TestBlocksLoopback:
    """Test that loopback and localhost addresses are blocked."""

    @pytest.mark.parametrize(
        "url",
        [
            "https://localhost/secret",
            "https://127.0.0.1/admin",
            "https://127.0.0.2/internal",
            "https://127.255.255.254/path",
            "https://[::1]/metadata",
        ],
    )
    def test_loopback_rejected(self, url):
        ok, reason = _is_safe_download_url(url)
        assert ok is False
        assert "loopback" in reason.lower() or "link-local" in reason.lower()


class TestBlocksLinkLocal:
    """Test that link-local (169.254.x.x) addresses are blocked."""

    @pytest.mark.parametrize(
        "url",
        [
            "https://169.254.169.254/latest/meta-data/",  # AWS IMDS
            "https://169.254.0.1/path",
        ],
    )
    def test_link_local_rejected(self, url):
        ok, reason = _is_safe_download_url(url)
        assert ok is False
        assert "loopback" in reason.lower() or "link-local" in reason.lower()


class TestBlocksRFC1918:
    """Test that RFC-1918 private address ranges are blocked."""

    @pytest.mark.parametrize(
        "url",
        [
            # 10.0.0.0/8
            "https://10.0.0.1/internal-api",
            "https://10.255.255.255/path",
            # 192.168.0.0/16
            "https://192.168.1.1/admin",
            "https://192.168.0.100/secret",
            # 172.16.0.0/12
            "https://172.16.0.1/service",
            "https://172.31.255.255/data",
            "https://172.20.0.50/path",
        ],
    )
    def test_private_range_rejected(self, url):
        ok, reason = _is_safe_download_url(url)
        assert ok is False
        assert "private" in reason.lower()


class TestBlocksEmptyHost:
    """Test that URLs with missing or empty hosts are blocked."""

    @pytest.mark.parametrize(
        "url",
        [
            "https:///path/only",
            "https://:8080/no-host",
        ],
    )
    def test_empty_host_rejected(self, url):
        ok, reason = _is_safe_download_url(url)
        assert ok is False
        assert "no host" in reason.lower() or "loopback" in reason.lower()


class TestEdgeCases:
    """Test boundary conditions and edge cases."""

    def test_172_15_allowed(self):
        """172.15.x.x is NOT in the 172.16-31.x range — should be allowed."""
        ok, reason = _is_safe_download_url("https://172.15.0.1/path")
        assert ok is True, f"172.15.x.x should be allowed, got: {reason}"

    def test_172_32_allowed(self):
        """172.32.x.x is NOT in the 172.16-31.x range — should be allowed."""
        ok, reason = _is_safe_download_url("https://172.32.0.1/path")
        assert ok is True, f"172.32.x.x should be allowed, got: {reason}"

    def test_non_numeric_172_second_octet(self):
        """172.abc.x.x — non-numeric second octet should not crash."""
        ok, reason = _is_safe_download_url("https://172.abc.0.1/path")
        assert ok is True  # Not a recognized private range

    def test_public_ip_allowed(self):
        """Public IP like 8.8.8.8 should be allowed."""
        ok, reason = _is_safe_download_url("https://8.8.8.8/dns-query")
        assert ok is True, f"Public IP should be allowed, got: {reason}"
