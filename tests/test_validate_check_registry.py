"""Registry validator tests: naming conventions, ``get_registry_entries``,
``check_registry_consistency`` and ``check_registry_staleness`` from
``scripts/validate-marketplace.py``.

Split from test_validate_check_functions.py (issue #554). Shared fixtures
live in ``validate_helpers``.
"""
from datetime import datetime, timedelta, timezone

from .validate_helpers import Results, _categories, _messages, _mod, _write

# ── check_naming_conventions ───────────────────────────────────────


class TestNamingConventions:
    def test_hyphen_in_card_type_flagged(self, tmp_path):
        _write(
            tmp_path / "presets" / "bad.json",
            {"format": "kc-card-preset-v1", "card_type": "cpu-usage", "title": "T"},
        )
        r = Results()
        _mod.check_naming_conventions(str(tmp_path), r)
        assert any("cpu_usage" in m for m in _messages(r.errors))

    def test_snake_case_ok(self, tmp_path):
        _write(
            tmp_path / "presets" / "ok.json",
            {"format": "kc-card-preset-v1", "card_type": "cpu_usage", "title": "T"},
        )
        r = Results()
        _mod.check_naming_conventions(str(tmp_path), r)
        assert not r.errors

    def test_dashboard_cards_checked(self, tmp_path):
        _write(
            tmp_path / "dashboards" / "d" / "dashboard.json",
            {
                "format": "kc-dashboard-v1",
                "name": "D",
                "cards": [{"card_type": "bad-name", "position": {"x": 0, "y": 0, "w": 1, "h": 1}}],
            },
        )
        r = Results()
        _mod.check_naming_conventions(str(tmp_path), r)
        assert any("bad_name" in m for m in _messages(r.errors))


# ── get_registry_entries ───────────────────────────────────────────


class TestRegistryEntries:
    def test_combines_items_and_presets(self):
        data = {"items": [{"id": "a"}], "presets": [{"id": "b"}]}
        entries = _mod.get_registry_entries(data)
        assert [e["id"] for e in entries] == ["a", "b"]

    def test_empty(self):
        assert _mod.get_registry_entries({}) == []


# ── check_registry_consistency ─────────────────────────────────────


class TestRegistryConsistency:
    def test_missing_registry_file(self, tmp_path):
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        assert any("registry.json" in m for m in _messages(r.errors))

    def test_dashboard_missing_file(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {"items": [{"id": "missing-dash", "type": "dashboard"}]},
        )
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        assert any("dashboards/missing-dash" in m for m in _messages(r.errors))

    def test_dashboard_present(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {"items": [{"id": "overview", "type": "dashboard"}]},
        )
        _write(tmp_path / "dashboards" / "overview" / "dashboard.json", {})
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        assert not r.errors

    def test_card_preset_present_in_either_dir(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {"id": "one", "type": "card-preset"},
                    {"id": "two", "type": "card-preset"},
                ]
            },
        )
        _write(tmp_path / "presets" / "one.json", {})
        _write(tmp_path / "card-presets" / "two.json", {})
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        assert not r.errors

    def test_card_preset_missing_in_both_dirs(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {"items": [{"id": "ghost", "type": "card-preset"}]},
        )
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        assert any("presets/ or card-presets/" in m for m in _messages(r.errors))

    def test_theme_missing_file(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {"items": [{"id": "dark", "type": "theme"}]},
        )
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        assert any("themes/dark.json" in m for m in _messages(r.errors))

    def test_duplicate_id(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {"id": "dup", "type": "theme"},
                    {"id": "dup", "type": "theme"},
                ]
            },
        )
        _write(tmp_path / "themes" / "dup.json", {})
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        assert any("Duplicate id" in m for m in _messages(r.errors))

    def test_download_url_path_missing(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "dark",
                        "type": "theme",
                        "downloadUrl": "https://raw.githubusercontent.com/o/r/main/themes/ghost.json",
                    }
                ]
            },
        )
        _write(tmp_path / "themes" / "dark.json", {})
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        assert any("downloadUrl" in m and "themes/ghost.json" in m for m in _messages(r.errors))

    def test_download_url_path_present(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "dark",
                        "type": "theme",
                        "downloadUrl": "https://raw.githubusercontent.com/o/r/main/themes/dark.json",
                    }
                ]
            },
        )
        _write(tmp_path / "themes" / "dark.json", {})
        (tmp_path / "themes" / "dark.json").write_text("{}")
        # File already written above by _write; ensure it exists.
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        assert not r.errors
        assert "registry" in _categories(r.passes)

    def test_summary_ok_message(self, tmp_path):
        _write(tmp_path / "registry.json", {"items": [], "presets": []})
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        assert any("Checked 0 registry entries" in m for m in _messages(r.passes))


# ── check_registry_staleness ───────────────────────────────────────


class TestRegistryStaleness:
    def test_missing_registry(self, tmp_path):
        r = Results()
        _mod.check_registry_staleness(str(tmp_path), r)
        # Silently returns — check_registry_consistency owns the error
        assert not r.errors
        assert not r.warnings

    def test_missing_updated_at(self, tmp_path):
        _write(tmp_path / "registry.json", {})
        r = Results()
        _mod.check_registry_staleness(str(tmp_path), r)
        assert any("missing 'updatedAt'" in m for m in _messages(r.warnings))

    def test_invalid_updated_at(self, tmp_path):
        _write(tmp_path / "registry.json", {"updatedAt": "not-a-date"})
        r = Results()
        _mod.check_registry_staleness(str(tmp_path), r)
        assert any("not valid ISO" in m for m in _messages(r.warnings))

    def test_fresh(self, tmp_path):
        fresh = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat().replace("+00:00", "Z")
        _write(tmp_path / "registry.json", {"updatedAt": fresh})
        r = Results()
        _mod.check_registry_staleness(str(tmp_path), r)
        assert "staleness" in _categories(r.passes)

    def test_stale(self, tmp_path):
        stale = (datetime.now(timezone.utc) - timedelta(days=45)).isoformat().replace("+00:00", "Z")
        _write(tmp_path / "registry.json", {"updatedAt": stale})
        r = Results()
        _mod.check_registry_staleness(str(tmp_path), r)
        assert any("days old" in m for m in _messages(r.warnings))

