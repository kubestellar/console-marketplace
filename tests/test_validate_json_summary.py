"""Unit tests for scripts/validate_json_summary.py.

Covers the standalone CI-observability summary script for the
`validate-json.yml` gap tracked in issue #621 (same gap class as fuzz.yml
#597). The script is not wired into any workflow (see
runbooks/validate-json-ci-summary-gap.md for why), so these tests exercise
it directly against synthetic fixture repos.
"""
import importlib.util
import json
import os
import sys
import tempfile

import pytest


def _load_module():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_json_summary",
        os.path.join(scripts_dir, "validate_json_summary.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    # dataclasses' field-type resolution needs the module registered in
    # sys.modules *before* exec, otherwise it can't resolve its own module
    # globals for postponed annotations (`from __future__ import annotations`).
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


_mod = _load_module()


def _write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)


def _make_repo(tmp_path, registry, dashboards=None):
    root = str(tmp_path)
    _write(os.path.join(root, "registry.json"), json.dumps(registry))
    for name, contents in (dashboards or {}).items():
        _write(
            os.path.join(root, "dashboards", name, "dashboard.json"),
            contents if isinstance(contents, str) else json.dumps(contents),
        )
    return root


# ── Happy path ────────────────────────────────────────────────────────────


class TestValidRepo:
    def test_empty_registry_no_dashboards_passes(self, tmp_path):
        root = _make_repo(tmp_path, {"items": [], "presets": []})
        result = _mod.run_validation(root)
        assert result.status == "pass"
        assert result.error_count == 0
        assert result.registry_entries_checked == 0
        assert result.dashboards_checked == 0

    def test_valid_dashboard_and_registry_entry_passes(self, tmp_path):
        dash = {
            "format": "kc-dashboard-v1",
            "name": "Test",
            "cards": [{"card_type": "cluster_health", "position": {"x": 0, "y": 0}}],
        }
        registry = {
            "items": [{"id": "test", "type": "dashboard"}],
            "presets": [],
        }
        root = _make_repo(tmp_path, registry, dashboards={"test": dash})
        result = _mod.run_validation(root)
        assert result.status == "pass"
        assert result.dashboards_checked == 1
        assert result.registry_entries_checked == 1


# ── Registry JSON parse failures ─────────────────────────────────────────


class TestRegistryJsonErrors:
    def test_malformed_registry_json_records_error(self, tmp_path):
        root = str(tmp_path)
        _write(os.path.join(root, "registry.json"), "{not valid json")
        result = _mod.run_validation(root)
        assert result.status == "fail"
        assert any("registry.json" in e for e in result.errors)

    def test_malformed_registry_json_skips_entry_check(self, tmp_path):
        root = str(tmp_path)
        _write(os.path.join(root, "registry.json"), "{not valid json")
        result = _mod.run_validation(root)
        assert result.registry_entries_checked == 0


# ── Dashboard schema failures ─────────────────────────────────────────────


class TestDashboardSchemaErrors:
    def test_malformed_dashboard_json_records_error(self, tmp_path):
        root = _make_repo(tmp_path, {"items": [], "presets": []})
        _write(os.path.join(root, "dashboards", "bad", "dashboard.json"), "{broken")
        result = _mod.run_validation(root)
        assert result.status == "fail"
        assert result.dashboards_checked == 1
        assert any("invalid JSON" in e for e in result.errors)

    def test_wrong_format_field_records_error(self, tmp_path):
        dash = {"format": "wrong-format", "name": "Test", "cards": []}
        root = _make_repo(tmp_path, {"items": [], "presets": []}, {"bad": dash})
        result = _mod.run_validation(root)
        assert any("format" in e for e in result.errors)

    def test_missing_name_records_error(self, tmp_path):
        dash = {"format": "kc-dashboard-v1", "cards": []}
        root = _make_repo(tmp_path, {"items": [], "presets": []}, {"bad": dash})
        result = _mod.run_validation(root)
        assert any("'name'" in e for e in result.errors)

    def test_missing_cards_array_records_error(self, tmp_path):
        dash = {"format": "kc-dashboard-v1", "name": "Test"}
        root = _make_repo(tmp_path, {"items": [], "presets": []}, {"bad": dash})
        result = _mod.run_validation(root)
        assert any("'cards'" in e for e in result.errors)

    def test_card_missing_card_type_records_error(self, tmp_path):
        dash = {
            "format": "kc-dashboard-v1",
            "name": "Test",
            "cards": [{"position": {"x": 0, "y": 0}}],
        }
        root = _make_repo(tmp_path, {"items": [], "presets": []}, {"bad": dash})
        result = _mod.run_validation(root)
        assert any("card_type" in e for e in result.errors)

    def test_card_missing_position_records_error(self, tmp_path):
        dash = {
            "format": "kc-dashboard-v1",
            "name": "Test",
            "cards": [{"card_type": "cluster_health"}],
        }
        root = _make_repo(tmp_path, {"items": [], "presets": []}, {"bad": dash})
        result = _mod.run_validation(root)
        assert any("position" in e for e in result.errors)


# ── Registry entry consistency ────────────────────────────────────────────


class TestRegistryEntryConsistency:
    def test_duplicate_ids_records_error(self, tmp_path):
        registry = {
            "items": [
                {"id": "dup", "type": "card-preset"},
                {"id": "dup", "type": "card-preset"},
            ],
            "presets": [],
        }
        root = _make_repo(tmp_path, registry)
        _write(os.path.join(root, "presets", "dup.json"), "{}")
        result = _mod.run_validation(root)
        assert any("duplicate registry id" in e for e in result.errors)

    def test_missing_matching_file_records_error(self, tmp_path):
        registry = {
            "items": [{"id": "missing", "type": "card-preset"}],
            "presets": [],
        }
        root = _make_repo(tmp_path, registry)
        result = _mod.run_validation(root)
        assert any("no matching file" in e for e in result.errors)

    def test_download_url_path_mismatch_records_error(self, tmp_path):
        registry = {
            "items": [
                {
                    "id": "x",
                    "type": "unknown",
                    "downloadUrl": "https://raw.githubusercontent.com/o/r/main/does/not/exist.json",
                }
            ],
            "presets": [],
        }
        root = _make_repo(tmp_path, registry)
        result = _mod.run_validation(root)
        assert any("downloadUrl path" in e for e in result.errors)


# ── Summary rendering ──────────────────────────────────────────────────────


class TestSummaryRendering:
    def test_markdown_summary_contains_bounded_fields(self, tmp_path):
        root = _make_repo(tmp_path, {"items": [], "presets": []})
        result = _mod.run_validation(root)
        md = _mod.render_summary_md(result)
        assert "Registry entries checked | 0" in md
        assert "Dashboards checked | 0" in md
        assert "Status | pass" in md

    def test_markdown_summary_lists_errors_when_present(self, tmp_path):
        root = str(tmp_path)
        _write(os.path.join(root, "registry.json"), "{not valid json")
        result = _mod.run_validation(root)
        md = _mod.render_summary_md(result)
        assert "**Errors:**" in md
        assert "registry.json" in md

    def test_json_summary_is_single_bounded_line(self, tmp_path):
        root = _make_repo(tmp_path, {"items": [], "presets": []})
        result = _mod.run_validation(root)
        line = _mod.render_summary_json(result)
        assert line.startswith("VALIDATE_JSON_SUMMARY: ")
        payload = json.loads(line[len("VALIDATE_JSON_SUMMARY: "):])
        assert set(payload.keys()) == {
            "registry_entries_checked",
            "dashboards_checked",
            "error_count",
            "status",
        }


# ── CLI / main() ────────────────────────────────────────────────────────


class TestMain:
    def test_main_returns_zero_on_success(self, tmp_path, capsys):
        root = _make_repo(tmp_path, {"items": [], "presets": []})
        rc = _mod.main(["--repo-root", root])
        assert rc == 0
        captured = capsys.readouterr()
        assert "VALIDATE_JSON_SUMMARY:" in captured.out

    def test_main_returns_one_on_failure(self, tmp_path, capsys):
        root = str(tmp_path)
        _write(os.path.join(root, "registry.json"), "{not valid json")
        rc = _mod.main(["--repo-root", root])
        assert rc == 1

    def test_main_writes_to_github_step_summary_when_set(self, tmp_path, monkeypatch):
        root = _make_repo(tmp_path, {"items": [], "presets": []})
        step_summary_path = os.path.join(str(tmp_path), "step-summary.md")
        monkeypatch.setenv("GITHUB_STEP_SUMMARY", step_summary_path)
        _mod.main(["--repo-root", root])
        with open(step_summary_path, encoding="utf-8") as fh:
            content = fh.read()
        assert "Validate JSON Summary" in content
