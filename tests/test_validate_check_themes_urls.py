"""Theme-consistency and static download-URL validator tests from
``scripts/validate-marketplace.py``.

Split from test_validate_check_functions.py (issue #554). Shared fixtures
live in ``validate_helpers``.
"""
from .validate_helpers import Results, _messages, _mod, _write

# ── check_theme_consistency ────────────────────────────────────────


class TestThemeConsistency:
    def test_single_theme_note(self, tmp_path):
        _write(tmp_path / "themes" / "one.json", {"colors": {"a": "#000"}})
        r = Results()
        _mod.check_theme_consistency(str(tmp_path), r)
        assert any("nothing to compare" in m for m in _messages(r.info))

    def test_matching_keys(self, tmp_path):
        colors = {"a": "#000", "b": "#111"}
        _write(tmp_path / "themes" / "one.json", {"colors": colors})
        _write(tmp_path / "themes" / "two.json", {"colors": dict(colors)})
        r = Results()
        _mod.check_theme_consistency(str(tmp_path), r)
        assert not r.warnings

    def test_missing_key_warns(self, tmp_path):
        _write(tmp_path / "themes" / "one.json", {"colors": {"a": "#000", "b": "#111"}})
        _write(tmp_path / "themes" / "two.json", {"colors": {"a": "#000"}})
        r = Results()
        _mod.check_theme_consistency(str(tmp_path), r)
        assert any("missing color keys" in m for m in _messages(r.warnings))

    def test_extra_key_notes(self, tmp_path):
        _write(tmp_path / "themes" / "one.json", {"colors": {"a": "#000"}})
        _write(tmp_path / "themes" / "two.json", {"colors": {"a": "#000", "c": "#222"}})
        r = Results()
        _mod.check_theme_consistency(str(tmp_path), r)
        assert any("extra color keys" in m for m in _messages(r.info))


# ── check_download_urls (SSRF rejection paths, no network) ─────────


class TestDownloadUrlsStatic:
    """Only exercise the code paths that never issue a network request —
    missing url, and URLs the SSRF guard already rejects.  Full network
    tests would flake in CI."""

    def test_missing_url_warns(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {"items": [{"id": "no-url", "type": "theme"}]},
        )
        r = Results()
        _mod.check_download_urls(str(tmp_path), r)
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
        r = Results()
        _mod.check_download_urls(str(tmp_path), r)
        rejected = [m for _, m in r.errors]
        assert any("loop" in m for m in rejected)
        assert any("meta" in m for m in rejected)
        assert any("priv" in m for m in rejected)
        assert any("sch" in m for m in rejected)

    def test_missing_registry_silent(self, tmp_path):
        r = Results()
        _mod.check_download_urls(str(tmp_path), r)
        assert not r.errors
        assert not r.warnings
