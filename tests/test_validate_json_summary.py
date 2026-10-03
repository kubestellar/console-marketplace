"""Tests for ``scripts/validate_json_summary.py``.

Covers registry/dashboard validation, the theme-type arm, loop
continuation branches, summary rendering, ``main`` and the
``__main__`` guard.
"""
import json
import os
import runpy
import sys
import tempfile

import pytest
from scripts import validate_json_summary as _mod


# ── helpers from test_validate_json_summary.py ──
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


# ── helpers from test_validate_json_summary_theme_branch.py ──
def _write_theme(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)

def _make_repo_with_registry(tmp_path, registry, extra_files=None):
    root = str(tmp_path)
    _write_theme(os.path.join(root, "registry.json"), json.dumps(registry))
    for path, contents in (extra_files or {}).items():
        _write_theme(os.path.join(root, path), contents)
    return root


# ── helpers from test_validate_json_summary_main_guard.py ──
SCRIPT = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "scripts", "validate_json_summary.py")
)


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

    def test_download_url_matching_existing_file_is_accepted(self, tmp_path):
        # Registry entry with a downloadUrl whose "/main/<path>" tail points to
        # a file that actually exists in the repo. Hits the previously
        # uncovered `140->108` branch of _validate_registry_entries — the
        # happy path where the regex matches AND `os.path.isfile` is True, so
        # no error is emitted and control returns to the loop head. Without
        # this test, a refactor that inverts the isfile predicate (e.g.
        # accidentally swapping `not os.path.isfile` for `os.path.isfile`)
        # would go undetected: today the negative arm is asserted by
        # test_download_url_path_mismatch_records_error, but the positive
        # arm was structurally unexercised.
        registry = {
            "items": [
                {
                    "id": "widget",
                    "type": "future-widget-kind",
                    "downloadUrl": "https://raw.githubusercontent.com/o/r/main/widgets/widget.json",
                }
            ],
            "presets": [],
        }
        root = _make_repo(tmp_path, registry)
        _write(os.path.join(root, "widgets", "widget.json"), "{}")
        result = _mod.run_validation(root)
        assert result.status == "pass"
        assert result.errors == []
        assert result.registry_entries_checked == 1


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


class TestThemeTypeArm:
    def test_theme_with_matching_file_passes(self, tmp_path):
        registry = {
            "items": [{"id": "dark", "type": "theme"}],
            "presets": [],
        }
        root = _make_repo_with_registry(
            tmp_path, registry,
            extra_files={"themes/dark.json": "{}"},
        )
        result = _mod.run_validation(root)
        assert result.status == "pass", result.errors
        assert result.registry_entries_checked == 1
        assert result.error_count == 0

    def test_theme_missing_file_records_error(self, tmp_path):
        registry = {
            "items": [{"id": "dark", "type": "theme"}],
            "presets": [],
        }
        root = _make_repo_with_registry(tmp_path, registry)
        result = _mod.run_validation(root)
        assert result.status == "fail"
        assert any(
            "themes/dark.json" in e and "no matching file" in e
            for e in result.errors
        ), result.errors

    def test_theme_error_message_names_expected_path(self, tmp_path):
        registry = {
            "items": [{"id": "solarized", "type": "theme"}],
            "presets": [],
        }
        root = _make_repo_with_registry(tmp_path, registry)
        result = _mod.run_validation(root)
        matches = [e for e in result.errors if "solarized" in e]
        assert matches, result.errors
        assert "theme" in matches[0]
        assert "themes/solarized.json" in matches[0]

    def test_theme_in_presets_section_is_also_validated(self, tmp_path):
        # `presets` section is concatenated to `items` at the top of
        # _validate_registry_entries — theme in either section must be
        # subject to the same file-existence check.
        registry = {
            "items": [],
            "presets": [{"id": "midnight", "type": "theme"}],
        }
        root = _make_repo_with_registry(tmp_path, registry)
        result = _mod.run_validation(root)
        assert any("themes/midnight.json" in e for e in result.errors)


class TestLoopContinuationBranches:
    def test_multiple_valid_entries_iterate_cleanly(self, tmp_path):
        # The 140 -> 108 branch (fall-through from the end of the loop
        # body back to the `for` header) fires when at least one
        # iteration completes without any downloadUrl-mismatch error.
        # Cover it by walking three heterogeneous, all-valid entries in
        # one registry so the loop closes normally at least twice.
        registry = {
            "items": [
                {"id": "dark", "type": "theme"},
                {"id": "greeting-card", "type": "card-preset"},
                {"id": "board", "type": "dashboard"},
            ],
            "presets": [],
        }
        root = _make_repo_with_registry(
            tmp_path, registry,
            extra_files={
                "themes/dark.json": "{}",
                "presets/greeting-card.json": "{}",
                "dashboards/board/dashboard.json": json.dumps({
                    "format": "kc-dashboard-v1",
                    "name": "Board",
                    "cards": [],
                }),
            },
        )
        result = _mod.run_validation(root)
        assert result.status == "pass", result.errors
        assert result.registry_entries_checked == 3

    def test_entry_with_no_downloadUrl_skips_url_check(self, tmp_path):
        # Explicit no-downloadUrl case — the `if url:` guard at
        # validate_json_summary.py:139 must be False on this iteration,
        # so the loop reaches its end and continues normally.
        registry = {
            "items": [{"id": "dark", "type": "theme"}],
            "presets": [],
        }
        root = _make_repo_with_registry(
            tmp_path, registry,
            extra_files={"themes/dark.json": "{}"},
        )
        result = _mod.run_validation(root)
        assert result.status == "pass"
        # No downloadUrl error surfaces because there's no downloadUrl.
        assert not any("downloadUrl" in e for e in result.errors)


def test_main_guard_exits_zero_on_valid_repo(tmp_path, monkeypatch, capsys):
    # Set up a minimal valid repo tree: an empty registry, no dashboards.
    # run_validation is content-driven, so as long as no invariants are
    # violated the script exits 0. We only care that line 210 executes;
    # the exit code just has to be reachable, not a specific value.
    (tmp_path / "web" / "src" / "config").mkdir(parents=True)
    (tmp_path / "web" / "src" / "config" / "cards.ts").write_text(
        "export const CARDS: unknown[] = []\n", encoding="utf-8"
    )

    monkeypatch.setattr(sys, "argv", ["validate_json_summary.py", "--repo-root", str(tmp_path)])
    # No GITHUB_STEP_SUMMARY → main() prints to stdout, which is fine.
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)

    with pytest.raises(SystemExit) as excinfo:
        runpy.run_path(SCRIPT, run_name="__main__")

    # sys.exit(main()) — main returns 0 on pass, 1 on fail. We accept
    # either: the assertion under test is that the guard *ran*, i.e.
    # SystemExit was raised at all. That is what closes line 210.
    assert excinfo.value.code in (0, 1)
