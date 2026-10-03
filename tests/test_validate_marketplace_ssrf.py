"""SSRF defenses in ``scripts/validate-marketplace.py``.

Covers ``_is_safe_download_url`` URL vetting, ``_classify_ip_literal``
address classification, ``_is_safe_resolved_host`` DNS vetting, the
no-redirect opener, the pinned HTTPS connection (DNS-rebinding guard) and
``check_download_urls`` in both static and network modes.
"""
from __future__ import annotations

from io import BytesIO
import io
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import textwrap
from unittest import mock
import unittest
from unittest.mock import MagicMock, patch
import urllib.error
import urllib.request

import pytest

from .validate_helpers import Results as Results_themes, _messages, _mod as _mod_themes, _write
from tests.conftest import load_validate_marketplace
from tests.conftest import load_validate_marketplace as _load_mod


# ── helpers from test_validate_marketplace.py ──
_mod = load_validate_marketplace()

_is_safe = _mod._is_safe_download_url


# ── helpers from test_validate_edge_cases.py ──
_mod_edge = load_validate_marketplace()

_is_safe_edge = _mod_edge._is_safe_download_url

_classify = _mod_edge._classify_ip_literal


# ── helpers from test_validate_coverage_gaps.py ──
_mod_gaps = load_validate_marketplace()

_classify_gaps = _mod_gaps._classify_ip_literal

_is_safe_gaps = _mod_gaps._is_safe_download_url


# ── helpers from test_validate_ssrf_dns_and_report.py ──
_mod_dns = load_validate_marketplace()

_is_safe_resolved_host = _mod_dns._is_safe_resolved_host

_NoRedirectHandler = _mod_dns._NoRedirectHandler

_no_redirect_opener = _mod_dns._no_redirect_opener

check_download_urls = _mod_dns.check_download_urls

Results_dns = _mod_dns.Results

def _addrinfo(addr, family=socket.AF_INET):
    """Build a minimal getaddrinfo return list for a single address."""
    return [(family, socket.SOCK_STREAM, 0, "", (addr, 0))]


# ── helpers from test_validate_ssrf_connect_pinning.py ──
_mod_pinning = load_validate_marketplace()

_PinnedHTTPSConnection = _mod_pinning._PinnedHTTPSConnection

_PinnedHTTPSHandler = _mod_pinning._PinnedHTTPSHandler

_no_redirect_opener_pinning = _mod_pinning._no_redirect_opener

DisallowedAddressError = _mod_pinning.DisallowedAddressError

check_download_urls_pinning = _mod_pinning.check_download_urls

Results_pinning = _mod_pinning.Results

PUBLIC_IP = "93.184.216.34"

METADATA_IP = "169.254.169.254"

HOST = "releases.example.com"

URL = f"https://{HOST}/v1.tar.gz"

def _addrinfo_pinning(addr, port=0, family=socket.AF_INET):
    return [(family, socket.SOCK_STREAM, 6, "", (addr, port))]

def _write_registry(base, url, item_id="item-1"):
    with open(os.path.join(base, "registry.json"), "w") as f:
        json.dump({"items": [{"id": item_id, "downloadUrl": url}]}, f)


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


class TestMissingHost:
    def test_empty_url_rejected(self):
        ok, reason = _is_safe("")
        assert not ok

    def test_https_no_host_rejected(self):
        ok, reason = _is_safe("https:///path/to/file")
        assert not ok
        assert "host" in reason


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
        "https://[::ffff:127.0.0.1]/file",       # IPv4-mapped loopback
        "https://[::ffff:127.1.2.3]/file",
    ])
    def test_ipv4_mapped_loopback_rejected(self, url):
        ok, reason = _is_safe(url)
        assert not ok, f"{url!r} should be rejected"
        assert "loopback" in reason

    @pytest.mark.parametrize("url", [
        "https://[fc00::1]/file",   # ULA
        "https://[fd00::1]/file",   # ULA
    ])
    def test_ipv6_ula_rejected(self, url):
        ok, reason = _is_safe(url)
        assert not ok, f"{url!r} should be rejected"
        assert "private" in reason

    def test_ipv6_link_local_rejected(self):
        ok, reason = _is_safe("https://[fe80::1]/file")
        assert not ok
        assert "link-local" in reason

    def test_ipv6_unspecified_rejected(self):
        ok, reason = _is_safe("https://[::]/file")
        assert not ok
        # ipaddress marks :: as unspecified and also is_private on newer Python.
        assert any(k in reason for k in ("unspecified", "reserved", "private"))

    def test_ipv4_unspecified_rejected(self):
        ok, reason = _is_safe("https://0.0.0.0/file")
        assert not ok
        # 0.0.0.0 is unspecified (v4). ipaddress marks it is_unspecified.
        assert "unspecified" in reason or "reserved" in reason or "private" in reason

    @pytest.mark.parametrize("url", [
        "https://metadata.google.internal/computeMetadata/v1/",
        "https://Metadata.Google.Internal/latest/",  # case-insensitive
        "https://metadata.azure.com/",
        "https://metadata.oraclecloud.com/",
    ])
    def test_metadata_hostnames_rejected(self, url):
        ok, reason = _is_safe(url)
        assert not ok, f"{url!r} should be rejected"
        assert "metadata" in reason

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


class TestClassifyIpLiteralMulticast(unittest.TestCase):
    """The ``is_multicast`` branch in ``_classify_ip_literal``."""

    def test_ipv4_multicast_classified_as_multicast(self):
        ok, reason = _classify("224.0.0.1")
        self.assertFalse(ok)
        self.assertIn("multicast", reason)

    def test_ipv4_high_multicast_classified_as_multicast(self):
        ok, reason = _classify("239.255.255.250")  # SSDP
        self.assertFalse(ok)
        self.assertIn("multicast", reason)

    def test_multicast_rejected_via_public_entry_point(self):
        # End-to-end via the public function.
        ok, reason = _is_safe_edge("https://224.0.0.1/file")
        self.assertFalse(ok)
        self.assertIn("multicast", reason)


class TestIsSafeDownloadUrlMalformed172(unittest.TestCase):
    """Malformed ``172.<non-numeric>.x.x`` triggers the ``except ValueError``
    fallthrough in ``_is_safe_download_url``. The host is not treated as a
    private literal and is instead handed to ``_classify_ip_literal`` (which
    also can't parse it), so it is allowed as a public hostname.
    """

    def test_172_hostname_with_non_numeric_second_octet_allowed(self):
        # e.g. `172.example.com` — starts with `172.` but the second segment
        # isn't an integer, so the private-range check must not misclassify it.
        ok, reason = _is_safe_edge("https://172.example.com/file")
        self.assertTrue(ok, msg=reason)

    def test_172_hostname_with_empty_second_segment_allowed(self):
        # `172..example.com` — degenerate but must not crash.
        ok, _reason = _is_safe_edge("https://172..example.com/file")
        self.assertTrue(ok)


class TestClassifyIpLiteralReserved(unittest.TestCase):
    """The ``is_reserved`` branch in ``_classify_ip_literal`` (line 912).

    On the ``ipaddress`` classifications supplied by CPython, most reserved
    ranges also test as ``is_private=True`` (e.g. IPv4 240.0.0.0/4, the IPv6
    unspecified address ``::``). The ``is_reserved`` branch is therefore
    only reachable via an IPv6 address that lives in a reserved block but
    is NOT marked private — the IETF-reserved ``fe00::/9`` range is the
    canonical example.
    """

    def test_ipv6_reserved_fe00_classified_as_reserved(self):
        # fe00::1 lives in the IETF-reserved fe00::/9 block. On modern
        # CPython it is is_reserved=True, is_private=False, so it hits
        # the reserved branch before any other classifier.
        ok, reason = _classify_gaps("fe00::1")
        self.assertFalse(ok)
        self.assertIn("reserved", reason)

    def test_ipv6_reserved_rejected_via_public_entry_point(self):
        # End-to-end via the public SSRF guard.
        ok, reason = _is_safe_gaps("https://[fe00::1]/malicious")
        self.assertFalse(ok)
        self.assertIn("reserved", reason)

    def test_non_ip_hostname_returns_ok_from_classifier(self):
        # ``_classify_ip_literal`` is a no-op for non-IP hosts — DNS
        # resolution is handled separately in ``_is_safe_resolved_host``.
        ok, reason = _classify_gaps("github.com")
        self.assertTrue(ok)
        self.assertEqual(reason, "")

    def test_ipv6_mapped_v4_is_reclassified_via_embedded_v4(self):
        # ::ffff:127.0.0.1 must be reclassified as loopback (v4), not
        # treated as a public v6 address.
        ok, reason = _classify_gaps("::ffff:127.0.0.1")
        self.assertFalse(ok)
        self.assertIn("loopback", reason)


class ClassifyIpUnspecifiedTest(unittest.TestCase):
    """Cover the unspecified-address return branch at line 914.

    In current Python, ``ipaddress.ip_address('0.0.0.0').is_private`` is
    True (RFC 6890), so the ``is_unspecified`` arm below it is
    unreachable from any real literal. We patch ``ipaddress.ip_address``
    to return a mock IP with the exact shape a future
    semantics-change would produce, so the guard is exercised without
    lying about how CPython currently classifies the address.
    """

    def _mock_ip(self, **flags):
        """Build a Mock IP with every classifier flag defaulting False."""
        defaults = dict(
            is_loopback=False,
            is_link_local=False,
            is_private=False,
            is_reserved=False,
            is_unspecified=False,
            is_multicast=False,
        )
        defaults.update(flags)
        m = mock.MagicMock()
        for k, v in defaults.items():
            setattr(m, k, v)
        # Not an IPv6Address subclass, so the ipv4_mapped normalisation
        # inside _classify_ip_literal is skipped.
        m.__class__ = mock.MagicMock
        return m

    def test_unspecified_only_hits_the_dedicated_arm(self):
        mod = _load_mod()
        fake_ip = self._mock_ip(is_unspecified=True)
        with mock.patch.object(mod.ipaddress, "ip_address", return_value=fake_ip):
            ok, reason = mod._classify_ip_literal("0.0.0.0")
        self.assertFalse(ok)
        self.assertIn("unspecified", reason)
        self.assertIn("0.0.0.0", reason)

    def test_unspecified_arm_reached_only_after_earlier_arms_pass(self):
        # Lock the switch ordering: if ``is_loopback`` / ``is_link_local``
        # / ``is_private`` / ``is_reserved`` are all False but
        # ``is_unspecified`` is True, the unspecified message must win
        # over ``is_multicast``. A regression that reordered the arms
        # (e.g. lifting multicast above unspecified) would flip the
        # reason string and fail this test.
        mod = _load_mod()
        fake_ip = self._mock_ip(is_unspecified=True, is_multicast=True)
        with mock.patch.object(mod.ipaddress, "ip_address", return_value=fake_ip):
            _, reason = mod._classify_ip_literal("0.0.0.0")
        self.assertIn("unspecified", reason)
        self.assertNotIn("multicast", reason)

    def test_real_zero_zero_zero_zero_is_still_rejected_today(self):
        # Sanity check that today the private-arm rejection still fires
        # for 0.0.0.0 — so the defense-in-depth arm above isn't the only
        # thing standing between an SSRF and success on current CPython.
        mod = _load_mod()
        ok, reason = mod._classify_ip_literal("0.0.0.0")
        self.assertFalse(ok)
        self.assertIn("private", reason)


class TestIsSafeResolvedHost(unittest.TestCase):

    def test_public_ipv4_accepted(self):
        with patch("socket.getaddrinfo", return_value=_addrinfo("93.184.216.34")):
            ok, reason = _is_safe_resolved_host("example.com")
        self.assertTrue(ok)
        self.assertEqual(reason, "")

    def test_loopback_rejected(self):
        with patch("socket.getaddrinfo", return_value=_addrinfo("127.0.0.1")):
            ok, reason = _is_safe_resolved_host("localhost")
        self.assertFalse(ok)
        self.assertIn("127.0.0.1", reason)

    def test_rfc1918_10_rejected(self):
        with patch("socket.getaddrinfo", return_value=_addrinfo("10.0.0.1")):
            ok, reason = _is_safe_resolved_host("internal.example.com")
        self.assertFalse(ok)

    def test_rfc1918_172_rejected(self):
        with patch("socket.getaddrinfo", return_value=_addrinfo("172.16.5.4")):
            ok, reason = _is_safe_resolved_host("internal.example.com")
        self.assertFalse(ok)

    def test_link_local_metadata_rejected(self):
        """169.254.169.254 is the AWS/GCP/Azure metadata endpoint."""
        with patch("socket.getaddrinfo", return_value=_addrinfo("169.254.169.254")):
            ok, reason = _is_safe_resolved_host("metadata.internal")
        self.assertFalse(ok)

    def test_ipv6_loopback_rejected(self):
        with patch("socket.getaddrinfo",
                   return_value=_addrinfo("::1", socket.AF_INET6)):
            ok, reason = _is_safe_resolved_host("ip6-localhost")
        self.assertFalse(ok)

    def test_gaierror_fails_closed(self):
        with patch("socket.getaddrinfo",
                   side_effect=socket.gaierror("name or service not known")):
            ok, reason = _is_safe_resolved_host("nonexistent.example.invalid")
        self.assertFalse(ok)
        self.assertIn("did not resolve", reason)


class TestNoRedirectHandler(unittest.TestCase):

    def _make_req(self, url="http://example.com/"):
        return urllib.request.Request(url)

    def _make_fp(self):
        fp = MagicMock()
        fp.read.return_value = b""
        return fp

    def test_301_returns_fp_unchanged(self):
        handler = _NoRedirectHandler()
        fp = self._make_fp()
        result = handler.http_error_301(self._make_req(), fp, 301, "Moved", {})
        self.assertIs(result, fp)

    def test_302_returns_fp_unchanged(self):
        handler = _NoRedirectHandler()
        fp = self._make_fp()
        result = handler.http_error_302(self._make_req(), fp, 302, "Found", {})
        self.assertIs(result, fp)

    def test_303_returns_fp_unchanged(self):
        handler = _NoRedirectHandler()
        fp = self._make_fp()
        result = handler.http_error_303(self._make_req(), fp, 303, "See Other", {})
        self.assertIs(result, fp)

    def test_307_returns_fp_unchanged(self):
        handler = _NoRedirectHandler()
        fp = self._make_fp()
        result = handler.http_error_307(self._make_req(), fp, 307, "Temporary Redirect", {})
        self.assertIs(result, fp)

    def test_308_returns_fp_unchanged(self):
        handler = _NoRedirectHandler()
        fp = self._make_fp()
        result = handler.http_error_308(self._make_req(), fp, 308, "Permanent Redirect", {})
        self.assertIs(result, fp)

    def test_module_level_opener_has_no_redirect_handler(self):
        """Verify the module-level _no_redirect_opener has the handler installed."""
        handlers = [type(h).__name__ for h in _no_redirect_opener.handlers]
        self.assertIn("_NoRedirectHandler", handlers)


class TestCheckDownloadUrlsNetwork(unittest.TestCase):

    def _setup_base(self, tmp_path, url, item_id="item-1"):
        import json
        registry = {"items": [{"id": item_id, "downloadUrl": url}]}
        with open(os.path.join(tmp_path, "registry.json"), "w") as f:
            json.dump(registry, f)

    def test_200_records_ok(self):
        import tempfile
        with tempfile.TemporaryDirectory() as base:
            self._setup_base(base, "https://releases.example.com/v1.tar.gz")
            results = Results_dns()
            resp = MagicMock()
            resp.status = 200
            with (
                patch("socket.getaddrinfo",
                      return_value=_addrinfo("93.184.216.34")),
                patch.object(_mod_dns._no_redirect_opener, "open", return_value=resp),
            ):
                check_download_urls(base, results)
            self.assertEqual(len(results.errors), 0)
            self.assertTrue(any("URL OK" in msg for _, msg in results.passes))

    def test_3xx_records_warning(self):
        import tempfile
        with tempfile.TemporaryDirectory() as base:
            self._setup_base(base, "https://releases.example.com/v1.tar.gz")
            results = Results_dns()
            resp = MagicMock()
            resp.status = 302
            with (
                patch("socket.getaddrinfo",
                      return_value=_addrinfo("93.184.216.34")),
                patch.object(_mod_dns._no_redirect_opener, "open", return_value=resp),
            ):
                check_download_urls(base, results)
            self.assertTrue(any("302" in msg for _, msg in results.warnings))

    def test_http_error_records_error(self):
        import tempfile
        with tempfile.TemporaryDirectory() as base:
            self._setup_base(base, "https://releases.example.com/v1.tar.gz")
            results = Results_dns()
            with (
                patch("socket.getaddrinfo",
                      return_value=_addrinfo("93.184.216.34")),
                patch.object(
                    _mod_dns._no_redirect_opener,
                    "open",
                    side_effect=urllib.error.HTTPError(
                        "https://releases.example.com/v1.tar.gz",
                        404, "Not Found", {}, None,
                    ),
                ),
            ):
                check_download_urls(base, results)
            self.assertTrue(any("404" in msg for _, msg in results.errors))

    def test_other_exception_records_warning(self):
        import tempfile
        with tempfile.TemporaryDirectory() as base:
            self._setup_base(base, "https://releases.example.com/v1.tar.gz")
            results = Results_dns()
            with (
                patch("socket.getaddrinfo",
                      return_value=_addrinfo("93.184.216.34")),
                patch.object(
                    _mod_dns._no_redirect_opener,
                    "open",
                    side_effect=OSError("connection timed out"),
                ),
            ):
                check_download_urls(base, results)
            self.assertTrue(any("unreachable" in msg for _, msg in results.warnings))

    def test_dns_guard_short_circuits_before_http(self):
        """When DNS resolves to a private address, no HTTP request is made."""
        import tempfile
        with tempfile.TemporaryDirectory() as base:
            self._setup_base(base, "https://sneaky.example.com/evil.tar.gz")
            results = Results_dns()
            opener_open = MagicMock()
            with (
                patch("socket.getaddrinfo",
                      return_value=_addrinfo("192.168.1.1")),
                patch.object(_mod_dns._no_redirect_opener, "open", opener_open),
            ):
                check_download_urls(base, results)
            opener_open.assert_not_called()
            self.assertTrue(any("rejected" in msg for _, msg in results.errors))


class TestOpenerWiring(unittest.TestCase):

    def test_opener_uses_pinned_https_handler(self):
        handlers = [type(h).__name__ for h in _no_redirect_opener_pinning.handlers]
        self.assertIn("_PinnedHTTPSHandler", handlers)
        # The stock handler must be displaced, otherwise urllib may pick it.
        self.assertNotIn("HTTPSHandler", handlers)

    def test_opener_has_no_environment_proxy_handler(self):
        # ``ProxyHandler({})`` displaces build_opener's default, env-driven
        # ProxyHandler; with no proxies configured it registers no
        # ``*_open`` methods, so no ProxyHandler may remain in the chain.
        handlers = [type(h).__name__ for h in _no_redirect_opener_pinning.handlers]
        self.assertNotIn("ProxyHandler", handlers)

    def test_https_proxy_env_does_not_redirect_pinned_connection(self):
        # With HTTPS_PROXY exported, a default opener would resolve and
        # connect to the proxy; ours must still resolve and pin the origin.
        req = urllib.request.Request(URL, method="HEAD")
        with (
            patch.dict(os.environ, {"HTTPS_PROXY": "http://127.0.0.1:3128",
                                    "https_proxy": "http://127.0.0.1:3128"}),
            patch("socket.getaddrinfo", return_value=_addrinfo_pinning(PUBLIC_IP, 443)) as gai,
            patch("socket.socket") as sock_cls,
            patch.object(_PinnedHTTPSConnection, "getresponse") as getresponse,
        ):
            resp = MagicMock()
            resp.status = 200
            resp.reason = "OK"
            resp.msg = {}
            resp.read.return_value = b""
            getresponse.return_value = resp
            handler = next(h for h in _no_redirect_opener_pinning.handlers
                           if isinstance(h, _PinnedHTTPSHandler))
            handler._context = MagicMock()
            handler._context.wrap_socket.return_value = MagicMock()
            try:
                _no_redirect_opener_pinning.open(req, timeout=10)
            except Exception:
                pass  # only the connection target matters here
        self.assertEqual(gai.call_args.args[0], HOST)
        sock_cls.return_value.connect.assert_called_once_with((PUBLIC_IP, 443))

    def test_handler_opens_with_pinned_connection_class(self):
        handler = _PinnedHTTPSHandler(context=MagicMock())
        req = urllib.request.Request(URL, method="HEAD")
        with patch.object(handler, "do_open", return_value="resp") as do_open:
            out = handler.https_open(req)
        self.assertEqual(out, "resp")
        self.assertIs(do_open.call_args.args[0], _PinnedHTTPSConnection)

    def test_disallowed_address_error_is_not_oserror(self):
        # urllib wraps OSError into URLError; the SSRF rejection must not be
        # downgraded to a soft "unreachable" warning that way.
        self.assertFalse(issubclass(DisallowedAddressError, OSError))


class TestPinnedConnection(unittest.TestCase):

    def _conn(self):
        conn = _PinnedHTTPSConnection(HOST, 443, timeout=10)
        conn._context = MagicMock()
        return conn

    def test_connects_to_vetted_numeric_address_with_sni_hostname(self):
        conn = self._conn()
        raw_sock = MagicMock()
        tls_sock = MagicMock()
        conn._context.wrap_socket.return_value = tls_sock
        with (
            patch("socket.getaddrinfo", return_value=_addrinfo_pinning(PUBLIC_IP, 443)) as gai,
            patch("socket.socket", return_value=raw_sock) as sock_ctor,
        ):
            conn.connect()

        gai.assert_called_once()
        self.assertEqual(gai.call_args.args[0], HOST)
        sock_ctor.assert_called_once_with(socket.AF_INET, socket.SOCK_STREAM, 6)
        raw_sock.settimeout.assert_called_once_with(10)
        raw_sock.connect.assert_called_once_with((PUBLIC_IP, 443))
        conn._context.wrap_socket.assert_called_once_with(
            raw_sock, server_hostname=HOST)
        self.assertIs(conn.sock, tls_sock)

    def test_private_answer_raises_before_any_socket(self):
        conn = self._conn()
        with (
            patch("socket.getaddrinfo", return_value=_addrinfo_pinning(METADATA_IP, 443)),
            patch("socket.socket") as sock_ctor,
        ):
            with self.assertRaises(DisallowedAddressError) as cm:
                conn.connect()
        sock_ctor.assert_not_called()
        self.assertIn("connect time", str(cm.exception))
        self.assertIn("link-local", str(cm.exception))

    def test_mixed_public_and_private_answers_fail_closed(self):
        conn = self._conn()
        infos = _addrinfo_pinning(PUBLIC_IP, 443) + _addrinfo_pinning("10.0.0.5", 443)
        with (
            patch("socket.getaddrinfo", return_value=infos),
            patch("socket.socket") as sock_ctor,
        ):
            with self.assertRaises(DisallowedAddressError):
                conn.connect()
        sock_ctor.assert_not_called()

    def test_ipv6_loopback_answer_rejected(self):
        conn = self._conn()
        infos = [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::1", 443, 0, 0))]
        with (
            patch("socket.getaddrinfo", return_value=infos),
            patch("socket.socket") as sock_ctor,
        ):
            with self.assertRaises(DisallowedAddressError):
                conn.connect()
        sock_ctor.assert_not_called()

    def test_empty_resolution_fails_closed(self):
        conn = self._conn()
        with (
            patch("socket.getaddrinfo", return_value=[]),
            patch("socket.socket") as sock_ctor,
        ):
            with self.assertRaises(DisallowedAddressError):
                conn.connect()
        sock_ctor.assert_not_called()

    def test_falls_through_to_next_vetted_address_on_connect_failure(self):
        conn = self._conn()
        bad_sock = MagicMock()
        bad_sock.connect.side_effect = OSError("refused")
        good_sock = MagicMock()
        conn._context.wrap_socket.return_value = MagicMock()
        infos = _addrinfo_pinning(PUBLIC_IP, 443) + _addrinfo_pinning("93.184.216.35", 443)
        with (
            patch("socket.getaddrinfo", return_value=infos),
            patch("socket.socket", side_effect=[bad_sock, good_sock]),
        ):
            conn.connect()
        bad_sock.close.assert_called_once()
        good_sock.connect.assert_called_once_with(("93.184.216.35", 443))

    def test_all_connects_failing_reraises_oserror(self):
        conn = self._conn()
        bad_sock = MagicMock()
        bad_sock.connect.side_effect = OSError("refused")
        with (
            patch("socket.getaddrinfo", return_value=_addrinfo_pinning(PUBLIC_IP, 443)),
            patch("socket.socket", return_value=bad_sock),
        ):
            with self.assertRaises(OSError):
                conn.connect()

    def test_socket_constructor_failure_is_skipped_without_close(self):
        # socket.socket() itself raising leaves nothing to close; the loop
        # must move on to the next vetted address rather than crash.
        conn = self._conn()
        good_sock = MagicMock()
        conn._context.wrap_socket.return_value = MagicMock()
        infos = (
            [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("2606:2800:220:1:248:1893:25c8:1946", 443, 0, 0))]
            + _addrinfo_pinning(PUBLIC_IP, 443)
        )
        with (
            patch("socket.getaddrinfo", return_value=infos),
            patch("socket.socket",
                  side_effect=[OSError("address family not supported"), good_sock]),
        ):
            conn.connect()
        good_sock.connect.assert_called_once_with((PUBLIC_IP, 443))

    def test_no_timeout_and_source_address_are_honoured(self):
        conn = _PinnedHTTPSConnection(HOST, 443, timeout=None,
                                      source_address=("0.0.0.0", 0))
        conn._context = MagicMock()
        raw_sock = MagicMock()
        with (
            patch("socket.getaddrinfo", return_value=_addrinfo_pinning(PUBLIC_IP, 443)),
            patch("socket.socket", return_value=raw_sock),
        ):
            conn.connect()
        raw_sock.settimeout.assert_not_called()
        raw_sock.bind.assert_called_once_with(("0.0.0.0", 0))

    def test_proxy_tunnel_pins_proxy_and_uses_origin_for_sni(self):
        # With an HTTPS proxy, urllib connects to the proxy host and CONNECTs
        # to the origin. The *proxy* address is what gets vetted and pinned;
        # SNI/cert verification must still name the origin host.
        conn = _PinnedHTTPSConnection("proxy.example.net", 3128, timeout=10)
        conn._context = MagicMock()
        conn.set_tunnel(HOST, 443)
        raw_sock = MagicMock()
        with (
            patch("socket.getaddrinfo", return_value=_addrinfo_pinning("151.101.1.69", 3128)) as gai,
            patch("socket.socket", return_value=raw_sock),
            patch.object(conn, "_tunnel") as tunnel,
        ):
            conn.connect()
        self.assertEqual(gai.call_args.args[0], "proxy.example.net")
        raw_sock.connect.assert_called_once_with(("151.101.1.69", 3128))
        tunnel.assert_called_once()
        conn._context.wrap_socket.assert_called_once_with(
            raw_sock, server_hostname=HOST)


class TestCheckDownloadUrlsRebinding(unittest.TestCase):
    """End-to-end through the real opener: first lookup public, second private."""

    def test_rebinding_to_metadata_endpoint_is_rejected_as_error(self):
        with tempfile.TemporaryDirectory() as base:
            _write_registry(base, URL)
            results = Results_pinning()
            answers = [_addrinfo_pinning(PUBLIC_IP), _addrinfo_pinning(METADATA_IP, 443)]
            with (
                patch("socket.getaddrinfo", side_effect=answers) as gai,
                patch("socket.socket") as sock_ctor,
            ):
                check_download_urls_pinning(base, results)

            self.assertEqual(gai.call_count, 2)
            sock_ctor.assert_not_called()
            self.assertEqual(len(results.warnings), 0)
            self.assertTrue(
                any("rejected" in msg and "connect time" in msg
                    for _, msg in results.errors),
                results.errors,
            )

    def test_rebinding_to_rfc1918_is_rejected_as_error(self):
        with tempfile.TemporaryDirectory() as base:
            _write_registry(base, URL)
            results = Results_pinning()
            answers = [_addrinfo_pinning(PUBLIC_IP), _addrinfo_pinning("192.168.1.10", 443)]
            with (
                patch("socket.getaddrinfo", side_effect=answers),
                patch("socket.socket") as sock_ctor,
            ):
                check_download_urls_pinning(base, results)
            sock_ctor.assert_not_called()
            self.assertTrue(any("private" in msg for _, msg in results.errors))

    def test_stable_public_answer_connects_to_that_address(self):
        with tempfile.TemporaryDirectory() as base:
            _write_registry(base, URL)
            results = Results_pinning()
            raw_sock = MagicMock()
            response = MagicMock()
            response.status = 200
            response.code = 200
            response.reason = "OK"
            response.msg = "OK"
            answers = [_addrinfo_pinning(PUBLIC_IP), _addrinfo_pinning(PUBLIC_IP, 443)]
            with (
                patch("socket.getaddrinfo", side_effect=answers),
                patch("socket.socket", return_value=raw_sock),
                patch.object(_PinnedHTTPSConnection, "getresponse",
                             return_value=response),
            ):
                # Neutralise TLS wrapping on the handler's real ssl context;
                # request bytes land in the MagicMock and are discarded.
                handler = next(h for h in _no_redirect_opener_pinning.handlers
                               if type(h).__name__ == "_PinnedHTTPSHandler")
                with patch.object(handler._context, "wrap_socket",
                                  return_value=MagicMock()) as wrap:
                    check_download_urls_pinning(base, results)

            raw_sock.connect.assert_called_once_with((PUBLIC_IP, 443))
            wrap.assert_called_once_with(raw_sock, server_hostname=HOST)
            self.assertEqual(len(results.errors), 0)
            self.assertTrue(any("URL OK" in msg for _, msg in results.passes))


class TestDownloadUrlsStatic:
    """Only exercise the code paths that never issue a network request —
    missing url, and URLs the SSRF guard already rejects.  Full network
    tests would flake in CI."""

    def test_missing_url_warns(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {"items": [{"id": "no-url", "type": "theme"}]},
        )
        r = Results_themes()
        _mod_themes.check_download_urls(str(tmp_path), r)
        assert any("no downloadUrl" in m for m in _messages(r.warnings))

    def test_ssrf_url_rejected(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {"id": "loop", "type": "theme", "downloadUrl": "https://127.0.0.1/x"},
                    {"id": "meta", "type": "theme", "downloadUrl": "https://169.254.169.254/x"},
                    {"id": "priv", "type": "theme", "downloadUrl": "https://10.0.0.1/x"},
                    {"id": "sch", "type": "theme", "downloadUrl": "http://example.com/x"},
                ]
            },
        )
        r = Results_themes()
        _mod_themes.check_download_urls(str(tmp_path), r)
        rejected = [m for _, m in r.errors]
        assert any("loop" in m for m in rejected)
        assert any("meta" in m for m in rejected)
        assert any("priv" in m for m in rejected)
        assert any("sch" in m for m in rejected)

    def test_missing_registry_silent(self, tmp_path):
        r = Results_themes()
        _mod_themes.check_download_urls(str(tmp_path), r)
        assert not r.errors
        assert not r.warnings


if __name__ == "__main__":
    unittest.main()
