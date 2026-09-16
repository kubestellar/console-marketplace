"""SSRF-safe download URL validation for the marketplace quality gate.

Extracted from scripts/validate-marketplace.py (see issue #670).
"""
import ipaddress
import os
import socket
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

from .checks_schema import get_registry_entries
from .ts_parsing import load_json


def _is_safe_download_url(url):
    """Return (ok, reason) — reject non-HTTPS and private/loopback targets (SSRF guard).

    This is the offline, string-based first line of defense: it only inspects
    the parsed URL and does not perform DNS resolution or network I/O, so it is
    safe to unit-test without network access. The runtime path in
    ``check_download_urls`` additionally applies DNS-resolution-based checks
    (see :func:`_is_safe_resolved_host`) and disables redirect follows so a
    hostname that resolves to a private address, or a 3xx redirect to one,
    cannot bypass this guard.
    """
    parsed = urlparse(url)
    if parsed.scheme != "https":
        return False, f"scheme {parsed.scheme!r} is not allowed; only https:// is permitted"
    host = parsed.hostname or ""
    if not host:
        return False, "URL has no host"

    host_lc = host.lower()

    # Reject well-known cloud metadata service hostnames (defense in depth —
    # DNS resolution below also catches the underlying link-local IPs).
    METADATA_HOSTS = {
        "metadata.google.internal",
        "metadata.goog",
        "metadata.azure.com",
        "metadata.oraclecloud.com",
        "metadata.tencentyun.com",
        "metadata.aliyuncs.com",
    }
    if host_lc in METADATA_HOSTS:
        return False, f"host {host!r} is a cloud metadata service endpoint"

    # String-prefix guards that pre-date this change — retained so tests such
    # as ``10.example.com`` continue to be rejected without DNS.
    if host_lc == "localhost" or host_lc.startswith("localhost."):
        return False, f"host {host!r} is a loopback/link-local address"
    if host_lc.startswith("127.") or host_lc.startswith("169.254."):
        return False, f"host {host!r} is a loopback/link-local address"
    if host_lc.startswith("10.") or host_lc.startswith("192.168."):
        return False, f"host {host!r} is a private address"
    parts = host_lc.split(".")
    if len(parts) >= 2 and parts[0] == "172":
        try:
            second = int(parts[1])
            if 16 <= second <= 31:
                return False, f"host {host!r} is a private address (172.16–31.x)"
        except ValueError:
            pass

    # If the host is a parseable IP literal (v4 or v6), classify it via
    # ipaddress. This catches ::1, ::ffff:127.0.0.1, fc00::/7, fe80::/10,
    # 0.0.0.0, 100.64.0.0/10 CGNAT, multicast, reserved, etc.
    ok, reason = _classify_ip_literal(host_lc)
    if not ok:
        return False, reason

    return True, ""


def _classify_ip_literal(host):
    """If ``host`` is a numeric IP literal, reject private/loopback/reserved.

    Returns (ok, reason). Non-IP hostnames return (True, "") — DNS resolution
    is handled separately in :func:`_is_safe_resolved_host`.
    """
    # Strip square brackets from IPv6 literals (urlparse.hostname already does,
    # but be defensive).
    candidate = host.strip("[]")
    try:
        ip = ipaddress.ip_address(candidate)
    except ValueError:
        return True, ""

    # For IPv4-mapped IPv6 (::ffff:a.b.c.d), classify the embedded v4.
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped

    if ip.is_loopback:
        return False, f"host {host!r} is a loopback address"
    if ip.is_link_local:
        return False, f"host {host!r} is a link-local address"
    if ip.is_private:
        return False, f"host {host!r} is a private address"
    if ip.is_reserved:
        return False, f"host {host!r} is a reserved address"
    if ip.is_unspecified:
        return False, f"host {host!r} is the unspecified address"
    if ip.is_multicast:
        return False, f"host {host!r} is a multicast address"
    return True, ""


def _is_safe_resolved_host(host):
    """Resolve ``host`` and reject if any resolved address is private/loopback.

    Fail-closed on resolution failure. Called from :func:`check_download_urls`
    (not from :func:`_is_safe_download_url`) so unit tests of the offline
    guard do not require network access.
    """
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        return False, f"host {host!r} did not resolve: {e}"

    for info in infos:
        addr = info[4][0]
        ok, reason = _classify_ip_literal(addr)
        if not ok:
            return False, f"host {host!r} resolved to disallowed address: {reason}"
    return True, ""


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Handler that turns 3xx responses into the response itself instead of
    following them. ``check_download_urls`` treats any non-2xx status as a
    warning, so silently refusing to follow is the correct behavior — the
    SSRF risk is that the redirect target hasn't been vetted by our URL
    guard or DNS-resolution guard.
    """

    def http_error_301(self, req, fp, code, msg, headers):
        return fp

    http_error_302 = http_error_301
    http_error_303 = http_error_301
    http_error_307 = http_error_301
    http_error_308 = http_error_301


_no_redirect_opener = urllib.request.build_opener(_NoRedirectHandler())


def check_download_urls(base, results):
    """HTTP HEAD to each downloadUrl in registry.json (SSRF-hardened).

    Hardening layers, in order:
    1. Offline URL guard (:func:`_is_safe_download_url`) — scheme + IP-literal
       + metadata-host + string-prefix checks.
    2. DNS-resolution guard (:func:`_is_safe_resolved_host`) — every A/AAAA
       record for the host must be a public address.
    3. Redirect follow disabled — a 3xx response is treated as a non-200
       result rather than being followed, so the guard cannot be bypassed by
       an attacker-controlled 302 to an internal target.
    """
    data, err = load_json(os.path.join(base, "registry.json"))
    if err:
        return

    for item in get_registry_entries(data):
        url = item.get("downloadUrl", "")
        item_id = item.get("id", "?")
        if not url:
            results.warn("download-url", f"'{item_id}' has no downloadUrl")
            continue

        ok, reason = _is_safe_download_url(url)
        if not ok:
            results.error("download-url",
                          f"'{item_id}' downloadUrl rejected: {reason}")
            continue

        host = urlparse(url).hostname or ""
        ok, reason = _is_safe_resolved_host(host)
        if not ok:
            results.error("download-url",
                          f"'{item_id}' downloadUrl rejected: {reason}")
            continue

        try:
            req = urllib.request.Request(url, method="HEAD")
            resp = _no_redirect_opener.open(req, timeout=10)
            if resp.status == 200:
                results.ok("download-url", f"'{item_id}' URL OK (200)")
            else:
                results.warn("download-url",
                            f"'{item_id}' URL returned {resp.status}: {url}")
        except urllib.error.HTTPError as e:
            results.error("download-url",
                         f"'{item_id}' URL returned {e.code}: {url}")
        except Exception as e:
            results.warn("download-url",
                        f"'{item_id}' URL unreachable: {e}")
