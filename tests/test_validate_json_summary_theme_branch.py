"""Branch-coverage tests for `_validate_registry_entries` in
scripts/validate_json_summary.py.

The main test suite (test_validate_json_summary.py) covers the
`dashboard` and `card-preset` type arms of the item_type dispatch,
but the `theme` arm (validate_json_summary.py:125) was never hit —
`--cov-branch` reported it and its dependent expected_paths check
uncovered on 2026-09-11 (`97%` branch, missing `125` and `140->108`).

A silent regression that dropped or narrowed the `theme` arm would
let every theme registry entry silently pass — the file-existence
check on themes/<id>.json is the only regression guard the summary
script has for theme installability. That is a real invariant, so
the arm needs a runtime test regardless of how small it looks.
"""
import importlib.util
import json
import os
import sys


def _load_module():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_json_summary_theme",
        os.path.join(scripts_dir, "validate_json_summary.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


_mod = _load_module()


def _write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)


def _make_repo_with_registry(tmp_path, registry, extra_files=None):
    root = str(tmp_path)
    _write(os.path.join(root, "registry.json"), json.dumps(registry))
    for path, contents in (extra_files or {}).items():
        _write(os.path.join(root, path), contents)
    return root


# ── Theme type arm ────────────────────────────────────────────────────


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


# ── Loop-continuation branch (140 -> 108) ─────────────────────────────


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
