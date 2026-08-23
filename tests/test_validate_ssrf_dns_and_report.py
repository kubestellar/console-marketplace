"""Unit tests for SSRF DNS guard, no-redirect handler, check_download_urls HTTP
branches, and generate_quality_table in scripts/validate-marketplace.py.

All tests are offline-safe: socket.getaddrinfo and urllib opener are stubbed
via unittest.mock — no real network calls are made.
"""
import importlib.util
import os
import socket
import unittest
import urllib.error
import urllib.request
from io import BytesIO
from unittest.mock import MagicMock, patch


def _load_mod():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate-marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_mod = _load_mod()
_is_safe_resolved_host = _mod._is_safe_resolved_host
_NoRedirectHandler = _mod._NoRedirectHandler
_no_redirect_opener = _mod._no_redirect_opener
check_download_urls = _mod.check_download_urls
generate_quality_table = _mod.generate_quality_table
Results = _mod.Results


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _addrinfo(addr, family=socket.AF_INET):
    """Build a minimal getaddrinfo return list for a single address."""
    return [(family, socket.SOCK_STREAM, 0, "", (addr, 0))]


# ---------------------------------------------------------------------------
# TestIsSafeResolvedHost  (7 tests)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# TestNoRedirectHandler  (6 tests)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# TestCheckDownloadUrlsNetwork  (5 tests)
# ---------------------------------------------------------------------------

def _registry_json_for(url, item_id="test-item"):
    """Create minimal registry.json content for check_download_urls tests."""
    import json
    return json.dumps({"items": [{"id": item_id, "downloadUrl": url}]})


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
            results = Results()
            resp = MagicMock()
            resp.status = 200
            with (
                patch("socket.getaddrinfo",
                      return_value=_addrinfo("93.184.216.34")),
                patch.object(_mod._no_redirect_opener, "open", return_value=resp),
            ):
                check_download_urls(base, results)
            self.assertEqual(len(results.errors), 0)
            self.assertTrue(any("URL OK" in msg for _, msg in results.passes))

    def test_3xx_records_warning(self):
        import tempfile
        with tempfile.TemporaryDirectory() as base:
            self._setup_base(base, "https://releases.example.com/v1.tar.gz")
            results = Results()
            resp = MagicMock()
            resp.status = 302
            with (
                patch("socket.getaddrinfo",
                      return_value=_addrinfo("93.184.216.34")),
                patch.object(_mod._no_redirect_opener, "open", return_value=resp),
            ):
                check_download_urls(base, results)
            self.assertTrue(any("302" in msg for _, msg in results.warnings))

    def test_http_error_records_error(self):
        import tempfile
        with tempfile.TemporaryDirectory() as base:
            self._setup_base(base, "https://releases.example.com/v1.tar.gz")
            results = Results()
            with (
                patch("socket.getaddrinfo",
                      return_value=_addrinfo("93.184.216.34")),
                patch.object(
                    _mod._no_redirect_opener,
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
            results = Results()
            with (
                patch("socket.getaddrinfo",
                      return_value=_addrinfo("93.184.216.34")),
                patch.object(
                    _mod._no_redirect_opener,
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
            results = Results()
            opener_open = MagicMock()
            with (
                patch("socket.getaddrinfo",
                      return_value=_addrinfo("192.168.1.1")),
                patch.object(_mod._no_redirect_opener, "open", opener_open),
            ):
                check_download_urls(base, results)
            opener_open.assert_not_called()
            self.assertTrue(any("rejected" in msg for _, msg in results.errors))


# ---------------------------------------------------------------------------
# TestGenerateQualityTable  (4 tests)
# ---------------------------------------------------------------------------

class TestGenerateQualityTable(unittest.TestCase):

    def test_empty_when_console_path_missing(self):
        results = Results()
        out = generate_quality_table("/some/base", "", set(), results)
        self.assertEqual(out, "")

    def test_empty_when_registry_ts_absent(self):
        import tempfile
        with tempfile.TemporaryDirectory() as base:
            with tempfile.TemporaryDirectory() as console_path:
                results = Results()
                out = generate_quality_table(base, console_path, set(), results)
                self.assertEqual(out, "")

    def test_header_and_row_rendered_when_card_type_present(self):
        import tempfile
        import json
        with tempfile.TemporaryDirectory() as base:
            with tempfile.TemporaryDirectory() as console_path:
                # Create cardRegistry.ts so the path check passes
                cards_dir = os.path.join(console_path, "web", "src", "components", "cards")
                os.makedirs(cards_dir, exist_ok=True)
                with open(os.path.join(cards_dir, "cardRegistry.ts"), "w") as f:
                    f.write("// registry\n")

                # get_all_marketplace_card_types reads from preset JSON files
                presets_dir = os.path.join(base, "presets")
                os.makedirs(presets_dir, exist_ok=True)
                with open(os.path.join(presets_dir, "p1.json"), "w") as f:
                    json.dump({"card_type": "events"}, f)

                results = Results()
                out = generate_quality_table(base, console_path, {"events"}, results)
                self.assertIn("Card Quality Matrix", out)
                self.assertIn("`events`", out)

    def test_n_marking_for_demo_data_warning(self):
        """When results carries a demo-data warning mentioning a card type,
        the demo_data column shows 'N'."""
        import tempfile
        import json
        with tempfile.TemporaryDirectory() as base:
            with tempfile.TemporaryDirectory() as console_path:
                cards_dir = os.path.join(console_path, "web", "src", "components", "cards")
                os.makedirs(cards_dir, exist_ok=True)
                with open(os.path.join(cards_dir, "cardRegistry.ts"), "w") as f:
                    f.write("// registry\n")

                registry = {"items": [{"id": "p1", "card_type": "events"}]}
                with open(os.path.join(base, "registry.json"), "w") as f:
                    json.dump(registry, f)

                results = Results()
                results.warn("demo-data", "events card type is missing demo-data")
                out = generate_quality_table(base, console_path, {"events"}, results)
                # The demo column for 'events' should be 'N' due to the warning
                self.assertIn("N", out)


if __name__ == "__main__":
    unittest.main()
