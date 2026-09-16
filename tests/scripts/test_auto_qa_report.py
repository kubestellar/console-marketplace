"""Unit tests for scripts/auto_qa_report.py.

Covers the report-shaping logic extracted from the ~55-line Python heredoc
that used to live in `.github/workflows/marketplace-auto-qa.yml`'s "Run
full quality scan" step (see issue #583): grouping scan errors/warnings by
category, per-category and combined-summary truncation (with "... and N
more" math), the empty errors/warnings case, and the manifest shape.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys

import pytest


def _load_module():
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    scripts_dir = os.path.join(repo_root, "scripts")
    spec = importlib.util.spec_from_file_location(
        "auto_qa_report",
        os.path.join(scripts_dir, "auto_qa_report.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


_mod = _load_module()


def _finding(category, message):
    return {"category": category, "message": message}


# ── Grouping ─────────────────────────────────────────────────────────


class TestGroupByCategory:
    def test_groups_errors_and_warnings_by_category(self):
        scan_data = {
            "errors": [_finding("schema", "bad schema"), _finding("assets", "missing icon")],
            "warnings": [_finding("schema", "loose type")],
        }
        groups = _mod.group_by_category(scan_data)
        assert set(groups.keys()) == {"schema", "assets"}
        assert groups["schema"]["errors"] == ["bad schema"]
        assert groups["schema"]["warnings"] == ["loose type"]
        assert groups["assets"]["errors"] == ["missing icon"]
        assert groups["assets"]["warnings"] == []

    def test_empty_errors_and_warnings_produces_no_groups(self):
        groups = _mod.group_by_category({"errors": [], "warnings": []})
        assert groups == {}

    def test_missing_keys_default_to_empty(self):
        groups = _mod.group_by_category({})
        assert groups == {}


# ── Per-category rendering ───────────────────────────────────────────


class TestRenderCategoryMd:
    def test_renders_errors_then_warnings(self):
        items = {"errors": ["e1"], "warnings": ["w1"]}
        md = _mod.render_category_md(items, limit=30)
        assert md == "- :x: e1\n- :warning: w1\n"

    def test_truncates_at_limit_with_more_count(self):
        items = {"errors": [f"e{i}" for i in range(35)], "warnings": []}
        md = _mod.render_category_md(items, limit=30)
        lines = md.splitlines()
        assert len(lines) == 31  # 30 shown + 1 "more" line
        assert lines[-1] == "- ... and 5 more"

    def test_no_more_line_when_under_limit(self):
        items = {"errors": ["e1"], "warnings": ["w1"]}
        md = _mod.render_category_md(items, limit=30)
        assert "more" not in md

    def test_more_count_combines_errors_and_warnings_overflow(self):
        items = {"errors": [f"e{i}" for i in range(20)], "warnings": [f"w{i}" for i in range(20)]}
        md = _mod.render_category_md(items, limit=10)
        # 10 errors + 10 warnings shown, (20-10)+(20-10)=20 more
        assert "- ... and 20 more" in md.splitlines()[-1]


# ── Combined summary rendering ───────────────────────────────────────


class TestRenderGroupedSummaryMd:
    def test_sorted_by_category_name(self):
        groups = {
            "zeta": {"errors": ["e1"], "warnings": []},
            "alpha": {"errors": [], "warnings": ["w1"]},
        }
        md = _mod.render_grouped_summary_md(groups, limit=20)
        assert md.index("**alpha**") < md.index("**zeta**")

    def test_finding_count_in_header(self):
        groups = {"cat": {"errors": ["e1", "e2"], "warnings": ["w1"]}}
        md = _mod.render_grouped_summary_md(groups, limit=20)
        assert "**cat** (3 finding(s))" in md

    def test_uses_summary_limit_distinct_from_category_limit(self):
        groups = {"cat": {"errors": [f"e{i}" for i in range(25)], "warnings": []}}
        md = _mod.render_grouped_summary_md(groups, limit=20)
        assert "- ... and 5 more" in md

    def test_empty_groups_renders_empty_string(self):
        assert _mod.render_grouped_summary_md({}, limit=20) == ""


# ── Manifest ─────────────────────────────────────────────────────────


class TestBuildManifest:
    def test_manifest_has_error_and_warning_counts_per_category(self):
        groups = {
            "schema": {"errors": ["e1", "e2"], "warnings": ["w1"]},
            "assets": {"errors": [], "warnings": []},
        }
        manifest = _mod.build_manifest(groups)
        assert manifest == {
            "schema": {"errors": 2, "warnings": 1},
            "assets": {"errors": 0, "warnings": 0},
        }

    def test_empty_groups_produces_empty_manifest(self):
        assert _mod.build_manifest({}) == {}


# ── write_report (file outputs) ──────────────────────────────────────


class TestWriteReport:
    def test_writes_per_category_grouped_and_manifest_files(self, tmp_path):
        scan_data = {
            "errors": [_finding("schema", "bad schema")],
            "warnings": [_finding("assets", "missing icon")],
        }
        manifest = _mod.write_report(scan_data, str(tmp_path))

        assert manifest == {
            "schema": {"errors": 1, "warnings": 0},
            "assets": {"errors": 0, "warnings": 1},
        }

        schema_md = (tmp_path / "scan-category-schema.md").read_text()
        assert "- :x: bad schema" in schema_md

        assets_md = (tmp_path / "scan-category-assets.md").read_text()
        assert "- :warning: missing icon" in assets_md

        grouped_md = (tmp_path / "scan-grouped.md").read_text()
        assert "**assets**" in grouped_md
        assert "**schema**" in grouped_md

        manifest_on_disk = json.loads((tmp_path / "scan-categories.json").read_text())
        assert manifest_on_disk == manifest

    def test_no_findings_writes_empty_grouped_and_manifest(self, tmp_path):
        manifest = _mod.write_report({"errors": [], "warnings": []}, str(tmp_path))
        assert manifest == {}
        assert (tmp_path / "scan-grouped.md").read_text() == ""
        assert json.loads((tmp_path / "scan-categories.json").read_text()) == {}
        assert not list(tmp_path.glob("scan-category-*.md"))


# ── main() CLI entrypoint ─────────────────────────────────────────────


class TestMain:
    def test_writes_reports_and_prints_counts(self, tmp_path, capsys):
        scan_json = tmp_path / "scan.json"
        scan_json.write_text(json.dumps({
            "errors": [_finding("schema", "bad schema")],
            "warnings": [_finding("schema", "loose type"), _finding("assets", "missing icon")],
        }))
        out_dir = tmp_path / "out"
        out_dir.mkdir()

        exit_code = _mod.main([str(scan_json), str(out_dir)])

        assert exit_code == 0
        captured = capsys.readouterr()
        assert "error_count=1" in captured.out
        assert "warn_count=2" in captured.out
        assert (out_dir / "scan-categories.json").exists()

    def test_writes_github_output_and_step_summary_when_set(self, tmp_path, monkeypatch):
        scan_json = tmp_path / "scan.json"
        scan_json.write_text(json.dumps({"errors": [], "warnings": []}))
        out_dir = tmp_path / "out"
        out_dir.mkdir()

        github_output = tmp_path / "github_output.txt"
        step_summary = tmp_path / "step_summary.md"
        monkeypatch.setenv("GITHUB_OUTPUT", str(github_output))
        monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(step_summary))

        exit_code = _mod.main([str(scan_json), str(out_dir)])

        assert exit_code == 0
        assert "error_count=0" in github_output.read_text()
        assert "warn_count=0" in github_output.read_text()
        assert "Marketplace Auto-QA: 0 error(s), 0 warning(s)" in step_summary.read_text()

    def test_wrong_arg_count_returns_usage_error(self):
        assert _mod.main([]) == 2
        assert _mod.main(["only-one-arg"]) == 2

    def test_invalid_scan_json_path_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            _mod.main([str(tmp_path / "does-not-exist.json"), str(tmp_path)])
