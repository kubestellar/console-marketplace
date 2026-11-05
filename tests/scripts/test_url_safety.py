"""Unit tests for scripts/validate_marketplace_lib/url_safety.py.

Covers SSRF guards, hostname validation, and the pinned HTTPS connection
that vets and pins the address at connect time.
"""
from __future__ import annotations

import socket
from unittest import mock

import pytest

from scripts.validate_marketplace_lib import url_safety as _mod


class TestPinnedHTTPSConnectionDefaultTimeout:
    """Test that _PinnedHTTPSConnection.connect() handles the default timeout sentinel.

    When no explicit timeout is passed to urlopen/open, http.client sets
    self.timeout to socket._GLOBAL_DEFAULT_TIMEOUT (a sentinel object, not
    None). Stock HTTPConnection.connect() passes it through socket.create_connection(),
    which special-cases the sentinel. This test ensures our override does not
    call sock.settimeout() with the sentinel, which would raise TypeError.
    """

    def test_connect_without_explicit_timeout_does_not_raise(self):
        """Construct connection without explicit timeout and verify connect() succeeds."""
        conn = _mod._PinnedHTTPSConnection("example.invalid")

        # At this point, conn.timeout is socket._GLOBAL_DEFAULT_TIMEOUT (the sentinel)
        # because no explicit timeout was passed to the constructor.
        assert conn.timeout is socket._GLOBAL_DEFAULT_TIMEOUT

        # Create a stub socket that will record settimeout calls.
        settimeout_calls = []

        def stub_settimeout(value):
            settimeout_calls.append(value)
            if value is socket._GLOBAL_DEFAULT_TIMEOUT:
                raise TypeError(f"settimeout() does not accept sentinel: {value!r}")

        stub_sock = mock.MagicMock()
        stub_sock.settimeout = stub_settimeout

        # Monkeypatch getaddrinfo to return a single valid address.
        public_addr = ("203.0.113.1", 443)  # TEST-NET-3 (not private)
        fake_infos = [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (public_addr, 443))]

        with mock.patch("socket.getaddrinfo", return_value=fake_infos):
            with mock.patch("socket.socket", return_value=stub_sock):
                with mock.patch.object(conn._context, "wrap_socket", return_value=stub_sock):
                    # This should not raise TypeError on settimeout().
                    conn.connect()

        # Verify that settimeout was never called with the sentinel.
        for call in settimeout_calls:
            assert call is not socket._GLOBAL_DEFAULT_TIMEOUT, \
                "settimeout() was called with the default-timeout sentinel"

    def test_connect_with_explicit_timeout_passes_timeout(self):
        """Construct connection with explicit timeout and verify settimeout is called."""
        conn = _mod._PinnedHTTPSConnection("example.invalid", timeout=5.0)

        # At this point, conn.timeout is 5.0 (explicit).
        assert conn.timeout == 5.0

        settimeout_calls = []

        def stub_settimeout(value):
            settimeout_calls.append(value)

        stub_sock = mock.MagicMock()
        stub_sock.settimeout = stub_settimeout

        public_addr = ("203.0.113.1", 443)
        fake_infos = [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (public_addr, 443))]

        with mock.patch("socket.getaddrinfo", return_value=fake_infos):
            with mock.patch("socket.socket", return_value=stub_sock):
                with mock.patch.object(conn._context, "wrap_socket", return_value=stub_sock):
                    conn.connect()

        # Verify that settimeout was called with the explicit timeout.
        assert settimeout_calls == [5.0], f"Expected [5.0], got {settimeout_calls}"

    def test_connect_with_none_timeout_passes_none(self):
        """Construct connection with timeout=None (blocking) and verify settimeout(None) is called.

        This distinguishes None (blocking mode) from the sentinel (use system default).
        """
        conn = _mod._PinnedHTTPSConnection("example.invalid", timeout=None)

        # At this point, conn.timeout is None (explicitly blocking).
        assert conn.timeout is None

        settimeout_calls = []

        def stub_settimeout(value):
            settimeout_calls.append(value)

        stub_sock = mock.MagicMock()
        stub_sock.settimeout = stub_settimeout

        public_addr = ("203.0.113.1", 443)
        fake_infos = [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (public_addr, 443))]

        with mock.patch("socket.getaddrinfo", return_value=fake_infos):
            with mock.patch("socket.socket", return_value=stub_sock):
                with mock.patch.object(conn._context, "wrap_socket", return_value=stub_sock):
                    conn.connect()

        # Verify that settimeout was called with None.
        assert settimeout_calls == [None], f"Expected [None], got {settimeout_calls}"
