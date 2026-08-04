"""Fixture-driven unit tests for the top-level ``check_*`` validator functions
in ``scripts/validate-marketplace.py``.

The previously untested validators are the CI/CD quality gate protecting the
marketplace registry from schema drift, so silent no-ops here would let broken
registries merge without CI catching them (see issue #441).

Each test writes a minimal marketplace layout (registry.json + presets/themes/
dashboards) into ``tmp_path`` and asserts that the validator produces the
expected error / warning / ok records via the ``Results`` container.

The disk-based approach mirrors how the validators are invoked from CI — no
production code refactor is required.
"""
import importlib.util
import json
import os
from datetime import datetime, timedelta, timezone

import pytest


def _load_module():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate-marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_mod = _load_module()
Results = _mod.Results


def _write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj))


def _categories(records):
    return {c for c, _ in records}


def _messages(records):
    return [m for _, m in records]


# ── Results container ──────────────────────────────────────────────


class TestResults:
    def test_exit_code_ok(self):
        r = Results()
        r.ok("cat", "ok")
        assert r.exit_code == 0

    def test_exit_code_warning(self):
        r = Results()
        r.warn("cat", "warn")
        assert r.exit_code == 2

    def test_exit_code_error_wins(self):
        r = Results()
        r.warn("cat", "warn")
        r.error("cat", "err")
        assert r.exit_code == 1

    def test_to_json_shape(self):
        r = Results()
        r.error("a", "e")
        r.warn("b", "w")
        r.note("c", "n")
        r.ok("d", "o")
        payload = r.to_json()
        assert payload["exit_code"] == 1
        assert payload["errors"] == [{"category": "a", "message": "e"}]
        assert payload["warnings"] == [{"category": "b", "message": "w"}]
        assert payload["info"] == [{"category": "c", "message": "n"}]
        assert payload["passes"] == [{"category": "d", "message": "o"}]

    def test_summary_md_contains_sections(self):
        r = Results()
        r.error("cat", "boom")
        r.warn("cat", "meh")
        r.note("cat", "fyi")
        md = r.summary_md()
        assert "Errors" in md and "boom" in md
        assert "Warnings" in md and "meh" in md
        assert "Info" in md and "fyi" in md

    def test_print_summary_runs(self, capsys):
        r = Results()
        r.error("cat", "boom")
        r.warn("cat", "meh")
        r.note("cat", "fyi")
        r.ok("cat", "yay")
        r.print_summary()
        out = capsys.readouterr().out
        assert "ERROR" in out and "WARN" in out and "INFO" in out and "OK" in out


# ── load_json / find_json_files ────────────────────────────────────


class TestLoadHelpers:
    def test_load_json_ok(self, tmp_path):
        p = tmp_path / "f.json"
        p.write_text('{"a": 1}')
        data, err = _mod.load_json(str(p))
        assert data == {"a": 1}
        assert err is None

    def test_load_json_bad(self, tmp_path):
        p = tmp_path / "f.json"
        p.write_text("{not json")
        data, err = _mod.load_json(str(p))
        assert data is None
        assert "Invalid JSON" in err

    def test_load_json_missing(self, tmp_path):
        data, err = _mod.load_json(str(tmp_path / "nope.json"))
        assert data is None
        assert "not found" in err

    def test_find_json_files(self, tmp_path):
        (tmp_path / "presets").mkdir()
        (tmp_path / "presets" / "a.json").write_text("{}")
        (tmp_path / "presets" / "b.json").write_text("{}")
        (tmp_path / "themes").mkdir()
        (tmp_path / "themes" / "t.json").write_text("{}")
        found = _mod.find_json_files(str(tmp_path), ["presets/*.json"])
        assert len(found) == 2
        assert all(f.endswith(".json") for f in found)


# ── check_json_syntax ──────────────────────────────────────────────


class TestJsonSyntax:
    def test_valid_and_invalid(self, tmp_path):
        (tmp_path / "themes").mkdir()
        (tmp_path / "themes" / "good.json").write_text("{}")
        (tmp_path / "themes" / "bad.json").write_text("{oops")
        r = Results()
        _mod.check_json_syntax(str(tmp_path), r)
        assert any("bad.json" in m for m in _messages(r.errors))
        assert any("good.json" in m for m in _messages(r.passes))

    def test_no_files(self, tmp_path):
        r = Results()
        _mod.check_json_syntax(str(tmp_path), r)
        assert not r.errors
        assert not r.passes


# ── check_preset_schema ────────────────────────────────────────────


class TestPresetSchema:
    def _valid(self):
        return {
            "format": "kc-card-preset-v1",
            "card_type": "cpu_usage",
            "title": "CPU Usage",
        }

    def test_happy_path(self, tmp_path):
        _write(tmp_path / "presets" / "cpu.json", self._valid())
        r = Results()
        _mod.check_preset_schema(str(tmp_path), r)
        assert not r.errors

    def test_wrong_format(self, tmp_path):
        p = self._valid()
        p["format"] = "kc-card-preset-v0"
        _write(tmp_path / "presets" / "cpu.json", p)
        r = Results()
        _mod.check_preset_schema(str(tmp_path), r)
        assert any("format" in m for m in _messages(r.errors))

    def test_missing_card_type_and_title(self, tmp_path):
        _write(tmp_path / "presets" / "bad.json", {"format": "kc-card-preset-v1"})
        r = Results()
        _mod.check_preset_schema(str(tmp_path), r)
        cats = _messages(r.errors)
        assert any("card_type" in m for m in cats)
        assert any("title" in m for m in cats)

    def test_card_presets_directory(self, tmp_path):
        _write(tmp_path / "card-presets" / "cpu.json", self._valid())
        r = Results()
        _mod.check_preset_schema(str(tmp_path), r)
        assert not r.errors

    def test_syntax_error_is_skipped(self, tmp_path):
        (tmp_path / "presets").mkdir()
        (tmp_path / "presets" / "broken.json").write_text("{not json")
        r = Results()
        _mod.check_preset_schema(str(tmp_path), r)
        assert not r.errors  # json-syntax owns this error


# ── check_dashboard_schema ─────────────────────────────────────────


class TestDashboardSchema:
    def _valid(self):
        return {
            "format": "kc-dashboard-v1",
            "name": "Overview",
            "cards": [
                {"card_type": "cpu_usage", "position": {"x": 0, "y": 0, "w": 6, "h": 4}},
            ],
        }

    def test_happy_path(self, tmp_path):
        _write(tmp_path / "dashboards" / "overview" / "dashboard.json", self._valid())
        r = Results()
        _mod.check_dashboard_schema(str(tmp_path), r)
        assert not r.errors

    def test_wrong_format_and_missing_name(self, tmp_path):
        d = self._valid()
        d["format"] = "kc-dashboard-v0"
        d.pop("name")
        _write(tmp_path / "dashboards" / "bad" / "dashboard.json", d)
        r = Results()
        _mod.check_dashboard_schema(str(tmp_path), r)
        msgs = _messages(r.errors)
        assert any("format" in m for m in msgs)
        assert any("name" in m for m in msgs)

    def test_cards_not_a_list(self, tmp_path):
        d = self._valid()
        d["cards"] = "nope"
        _write(tmp_path / "dashboards" / "bad" / "dashboard.json", d)
        r = Results()
        _mod.check_dashboard_schema(str(tmp_path), r)
        assert any("array" in m for m in _messages(r.errors))

    def test_card_missing_card_type_and_position(self, tmp_path):
        d = self._valid()
        d["cards"] = [{}]
        _write(tmp_path / "dashboards" / "bad" / "dashboard.json", d)
        r = Results()
        _mod.check_dashboard_schema(str(tmp_path), r)
        msgs = _messages(r.errors)
        assert any("card_type" in m for m in msgs)
        assert any("position" in m for m in msgs)

    def test_position_missing_key(self, tmp_path):
        d = self._valid()
        d["cards"] = [{"card_type": "cpu_usage", "position": {"x": 0, "y": 0, "w": 6}}]
        _write(tmp_path / "dashboards" / "bad" / "dashboard.json", d)
        r = Results()
        _mod.check_dashboard_schema(str(tmp_path), r)
        assert any("'h'" in m for m in _messages(r.errors))

    def test_grid_overflow(self, tmp_path):
        d = self._valid()
        d["cards"] = [{"card_type": "cpu_usage", "position": {"x": 8, "y": 0, "w": 6, "h": 4}}]
        _write(tmp_path / "dashboards" / "overflow" / "dashboard.json", d)
        r = Results()
        _mod.check_dashboard_schema(str(tmp_path), r)
        assert "dashboard-grid" in _categories(r.errors)


# ── check_theme_schema ─────────────────────────────────────────────


class TestThemeSchema:
    REQUIRED_COLORS = [
        "background", "foreground", "card", "primary", "secondary",
        "muted", "accent", "destructive", "border", "input", "ring",
    ]

    def _valid(self):
        colors = {k: "#000000" for k in self.REQUIRED_COLORS}
        colors["brandPrimary"] = "#123456"
        colors["chartColors"] = ["#111", "#222", "#333", "#444"]
        return {
            "id": "dark",
            "name": "Dark",
            "dark": True,
            "colors": colors,
            "font": {"family": "Inter", "monoFamily": "Fira"},
        }

    def test_happy_path(self, tmp_path):
        _write(tmp_path / "themes" / "dark.json", self._valid())
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        assert not r.errors
        assert not r.warnings

    def test_missing_top_level_keys(self, tmp_path):
        t = self._valid()
        t.pop("id")
        t.pop("dark")
        _write(tmp_path / "themes" / "bad.json", t)
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        msgs = _messages(r.errors)
        assert any("'id'" in m for m in msgs)
        assert any("'dark'" in m for m in msgs)

    def test_colors_not_an_object(self, tmp_path):
        t = self._valid()
        t["colors"] = ["nope"]
        _write(tmp_path / "themes" / "bad.json", t)
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        assert any("must be an object" in m for m in _messages(r.errors))

    def test_missing_required_color(self, tmp_path):
        t = self._valid()
        del t["colors"]["primary"]
        _write(tmp_path / "themes" / "bad.json", t)
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        assert any("'primary'" in m for m in _messages(r.errors))

    def test_missing_brand_primary_warns(self, tmp_path):
        t = self._valid()
        del t["colors"]["brandPrimary"]
        _write(tmp_path / "themes" / "bad.json", t)
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        assert any("brandPrimary" in m for m in _messages(r.warnings))

    def test_chart_colors_too_few(self, tmp_path):
        t = self._valid()
        t["colors"]["chartColors"] = ["#111", "#222"]
        _write(tmp_path / "themes" / "bad.json", t)
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        assert any("chartColors" in m for m in _messages(r.warnings))

    def test_font_missing_families_warns(self, tmp_path):
        t = self._valid()
        t["font"] = {}
        _write(tmp_path / "themes" / "bad.json", t)
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        msgs = _messages(r.warnings)
        assert any("font.family" in m for m in msgs)
        assert any("monoFamily" in m for m in msgs)


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
