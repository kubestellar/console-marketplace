"""Tests for i18n and CORS proxy checks.

Covers the following validators:
- check_i18n_keys: validates that i18n translations exist for all card types
- check_cors_proxy: ensures direct external API calls use the CORS proxy
"""
import json

from .conftest_cross_repo import _make_console, _make_marketplace, _messages, _mod


class TestCheckI18nKeys:
    def test_missing_cards_json_skipped_with_warn(self, tmp_path):
        # Console exists but no cards.json — expected to warn once and return.
        console = _make_console(tmp_path, card_types=["cluster_health"])
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_i18n_keys(str(base), str(console),
                             {"cluster_health"}, r)
        msgs = _messages(r.warnings)
        assert any("skipping i18n check" in m for m in msgs)
        # And no per-card warning should have been raised for the skip case.
        assert not any("cluster_health" in m for m in msgs)

    def test_missing_translation_key_warns(self, tmp_path):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            i18n_keys={"other_card": {"title": "x"}},
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_i18n_keys(str(base), str(console),
                             {"cluster_health"}, r)
        assert any("cluster_health" in m and "no translation keys" in m
                   for m in _messages(r.warnings))

    def test_exact_key_match_no_warn(self, tmp_path):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            i18n_keys={"cluster_health": {"title": "OK"}},
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_i18n_keys(str(base), str(console),
                             {"cluster_health"}, r)
        assert not any("cluster_health" in m for m in _messages(r.warnings))

    def test_nested_prefix_match_no_warn(self, tmp_path):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            i18n_keys={"cluster_health": {"title": "OK", "sub": {"label": "x"}}},
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_i18n_keys(str(base), str(console),
                             {"cluster_health"}, r)
        assert not any("cluster_health" in m for m in _messages(r.warnings))

    def test_marketplace_local_cards_json_merged(self, tmp_path):
        # Console cards.json absent, but marketplace-local one covers the key.
        base = _make_marketplace(tmp_path)
        mp_cards = base / "web/src/locales/en/cards.json"
        mp_cards.parent.mkdir(parents=True, exist_ok=True)
        mp_cards.write_text(json.dumps({"cluster_health": {"title": "x"}}))
        console = _make_console(tmp_path, card_types=["cluster_health"])
        r = _mod.Results()
        _mod.check_i18n_keys(str(base), str(console),
                             {"cluster_health"}, r)
        assert not any("cluster_health" in m for m in _messages(r.warnings))
        # And the "skipping" warning should not be raised when a local file exists.
        assert not any("skipping i18n check" in m for m in _messages(r.warnings))

    def test_invalid_cards_json_warns_but_does_not_raise(self, tmp_path):
        console = _make_console(tmp_path, card_types=["cluster_health"])
        cards_json = console / "web/src/locales/en/cards.json"
        cards_json.parent.mkdir(parents=True, exist_ok=True)
        cards_json.write_text("{not-json")
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_i18n_keys(str(base), str(console),
                             {"cluster_health"}, r)
        assert any("Failed to parse" in m for m in _messages(r.warnings))


class TestCheckCorsProxy:
    def test_no_hooks_dir_warn_skip(self, tmp_path):
        base = _make_marketplace(tmp_path)
        console = _make_console(tmp_path, card_types=[])
        r = _mod.Results()
        _mod.check_cors_proxy(str(base), str(console), set(), r)
        assert any("No hooks directory found" in m for m in _messages(r.warnings))

    def test_direct_fetch_flagged(self, tmp_path):
        hook_src = (
            "export function useThing(){\n"
            "  return fetch('https://api.example.com/data');\n"
            "}\n"
        )
        base = _make_marketplace(tmp_path, hooks={"useThing.ts": hook_src})
        console = _make_console(tmp_path, card_types=[])
        r = _mod.Results()
        _mod.check_cors_proxy(str(base), str(console), set(), r)
        assert any("direct external fetch" in m and "useThing.ts" in m
                   for m in _messages(r.warnings))

    def test_direct_axios_flagged(self, tmp_path):
        hook_src = "axios.get('https://foo.example.com/x')\n"
        base = _make_marketplace(tmp_path, hooks={"useAx.ts": hook_src})
        console = _make_console(tmp_path, card_types=[])
        r = _mod.Results()
        _mod.check_cors_proxy(str(base), str(console), set(), r)
        assert any("useAx.ts" in m for m in _messages(r.warnings))

    def test_localhost_and_proxy_not_flagged(self, tmp_path):
        hook_src = (
            "fetch('http://localhost:3000/x');\n"
            "fetch('/api/proxy/things');\n"
            "fetch('http://127.0.0.1:8080/y');\n"
        )
        base = _make_marketplace(tmp_path, hooks={"useSafe.ts": hook_src})
        console = _make_console(tmp_path, card_types=[])
        r = _mod.Results()
        _mod.check_cors_proxy(str(base), str(console), set(), r)
        assert not any("useSafe.ts" in m for m in _messages(r.warnings))


# ── Coverage-gap regression tests for CORS proxy ─────────────────────────────


class TestCheckCorsProxyCoverage:
    def test_unreadable_hook_file_is_swallowed(self, tmp_path, monkeypatch):
        # A marketplace hook with a fetch() call would normally trigger a
        # CORS warning; if the file can't be read, the OSError branch must
        # swallow the failure without warning or crash.
        console = _make_console(tmp_path, card_types=[])
        base = _make_marketplace(
            tmp_path,
            hooks={"useThing.ts": "fetch('https://direct.example.com/api')\n"},
        )
        target = str(base / "web/src/hooks/useThing.ts")

        import builtins
        real_open = builtins.open

        def fake_open(path, *a, **kw):
            if str(path) == target:
                raise OSError("boom")
            return real_open(path, *a, **kw)

        monkeypatch.setattr(builtins, "open", fake_open)
        r = _mod.Results()
        _mod.check_cors_proxy(str(base), str(console), set(), r)
        # No CORS warning because the file couldn't be scanned.
        assert not any("cors" in cat for cat, _ in r.warnings)
