"""Regression tests for the connect-time address pinning in
scripts/validate_marketplace_lib/url_safety.py (DNS-rebinding SSRF, issue #814).

The pre-flight DNS guard (``_is_safe_resolved_host``) and the transport's own
lookup are two separate ``getaddrinfo`` calls. A rebinding resolver answers
the first with a public address and the second with a private one. These
tests stub ``socket.getaddrinfo`` with *different* answers per call and assert
the transport never opens a socket to the second answer.

All tests are offline-safe: ``socket.getaddrinfo``, ``socket.socket`` and the
TLS ``wrap_socket`` are stubbed via unittest.mock.
"""
import json
import os
import socket
import tempfile
import unittest
import urllib.request
from unittest.mock import MagicMock, patch

from tests.conftest import load_validate_marketplace

_mod = load_validate_marketplace()
_PinnedHTTPSConnection = _mod._PinnedHTTPSConnection
_PinnedHTTPSHandler = _mod._PinnedHTTPSHandler
_no_redirect_opener = _mod._no_redirect_opener
DisallowedAddressError = _mod.DisallowedAddressError
check_download_urls = _mod.check_download_urls
Results = _mod.Results

PUBLIC_IP = "93.184.216.34"
METADATA_IP = "169.254.169.254"
HOST = "releases.example.com"
URL = f"https://{HOST}/v1.tar.gz"


def _addrinfo(addr, port=0, family=socket.AF_INET):
    return [(family, socket.SOCK_STREAM, 6, "", (addr, port))]


def _write_registry(base, url, item_id="item-1"):
    with open(os.path.join(base, "registry.json"), "w") as f:
        json.dump({"items": [{"id": item_id, "downloadUrl": url}]}, f)


class TestOpenerWiring(unittest.TestCase):

    def test_opener_uses_pinned_https_handler(self):
        handlers = [type(h).__name__ for h in _no_redirect_opener.handlers]
        self.assertIn("_PinnedHTTPSHandler", handlers)
        # The stock handler must be displaced, otherwise urllib may pick it.
        self.assertNotIn("HTTPSHandler", handlers)

    def test_opener_has_no_environment_proxy_handler(self):
        # ``ProxyHandler({})`` displaces build_opener's default, env-driven
        # ProxyHandler; with no proxies configured it registers no
        # ``*_open`` methods, so no ProxyHandler may remain in the chain.
        handlers = [type(h).__name__ for h in _no_redirect_opener.handlers]
        self.assertNotIn("ProxyHandler", handlers)

    def test_https_proxy_env_does_not_redirect_pinned_connection(self):
        # With HTTPS_PROXY exported, a default opener would resolve and
        # connect to the proxy; ours must still resolve and pin the origin.
        req = urllib.request.Request(URL, method="HEAD")
        with (
            patch.dict(os.environ, {"HTTPS_PROXY": "http://127.0.0.1:3128",
                                    "https_proxy": "http://127.0.0.1:3128"}),
            patch("socket.getaddrinfo", return_value=_addrinfo(PUBLIC_IP, 443)) as gai,
            patch("socket.socket") as sock_cls,
            patch.object(_PinnedHTTPSConnection, "getresponse") as getresponse,
        ):
            resp = MagicMock()
            resp.status = 200
            resp.reason = "OK"
            resp.msg = {}
            resp.read.return_value = b""
            getresponse.return_value = resp
            handler = next(h for h in _no_redirect_opener.handlers
                           if isinstance(h, _PinnedHTTPSHandler))
            handler._context = MagicMock()
            handler._context.wrap_socket.return_value = MagicMock()
            try:
                _no_redirect_opener.open(req, timeout=10)
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
            patch("socket.getaddrinfo", return_value=_addrinfo(PUBLIC_IP, 443)) as gai,
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
            patch("socket.getaddrinfo", return_value=_addrinfo(METADATA_IP, 443)),
            patch("socket.socket") as sock_ctor,
        ):
            with self.assertRaises(DisallowedAddressError) as cm:
                conn.connect()
        sock_ctor.assert_not_called()
        self.assertIn("connect time", str(cm.exception))
        self.assertIn("link-local", str(cm.exception))

    def test_mixed_public_and_private_answers_fail_closed(self):
        conn = self._conn()
        infos = _addrinfo(PUBLIC_IP, 443) + _addrinfo("10.0.0.5", 443)
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
        infos = _addrinfo(PUBLIC_IP, 443) + _addrinfo("93.184.216.35", 443)
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
            patch("socket.getaddrinfo", return_value=_addrinfo(PUBLIC_IP, 443)),
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
            + _addrinfo(PUBLIC_IP, 443)
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
            patch("socket.getaddrinfo", return_value=_addrinfo(PUBLIC_IP, 443)),
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
            patch("socket.getaddrinfo", return_value=_addrinfo("151.101.1.69", 3128)) as gai,
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
            results = Results()
            answers = [_addrinfo(PUBLIC_IP), _addrinfo(METADATA_IP, 443)]
            with (
                patch("socket.getaddrinfo", side_effect=answers) as gai,
                patch("socket.socket") as sock_ctor,
            ):
                check_download_urls(base, results)

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
            results = Results()
            answers = [_addrinfo(PUBLIC_IP), _addrinfo("192.168.1.10", 443)]
            with (
                patch("socket.getaddrinfo", side_effect=answers),
                patch("socket.socket") as sock_ctor,
            ):
                check_download_urls(base, results)
            sock_ctor.assert_not_called()
            self.assertTrue(any("private" in msg for _, msg in results.errors))

    def test_stable_public_answer_connects_to_that_address(self):
        with tempfile.TemporaryDirectory() as base:
            _write_registry(base, URL)
            results = Results()
            raw_sock = MagicMock()
            response = MagicMock()
            response.status = 200
            response.code = 200
            response.reason = "OK"
            response.msg = "OK"
            answers = [_addrinfo(PUBLIC_IP), _addrinfo(PUBLIC_IP, 443)]
            with (
                patch("socket.getaddrinfo", side_effect=answers),
                patch("socket.socket", return_value=raw_sock),
                patch.object(_PinnedHTTPSConnection, "getresponse",
                             return_value=response),
            ):
                # Neutralise TLS wrapping on the handler's real ssl context;
                # request bytes land in the MagicMock and are discarded.
                handler = next(h for h in _no_redirect_opener.handlers
                               if type(h).__name__ == "_PinnedHTTPSHandler")
                with patch.object(handler._context, "wrap_socket",
                                  return_value=MagicMock()) as wrap:
                    check_download_urls(base, results)

            raw_sock.connect.assert_called_once_with((PUBLIC_IP, 443))
            wrap.assert_called_once_with(raw_sock, server_hostname=HOST)
            self.assertEqual(len(results.errors), 0)
            self.assertTrue(any("URL OK" in msg for _, msg in results.passes))


if __name__ == "__main__":
    unittest.main()
