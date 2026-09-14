"""Unit tests for scripts/fuzz_summary.py.

Covers the standalone CI-observability summary script for the `fuzz.yml`
gap tracked in issue #597 (same gap class as validate-json.yml #621). The
script is not wired into any workflow (see
runbooks/fuzz-yml-ci-summary-gap.md for why), so these tests exercise it
directly against synthetic fixture repos and the fixed edge-case list.
"""
import importlib.util
import json
import os
import sys

import pytest


def _load_module():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "fuzz_summary",
        os.path.join(scripts_dir, "fuzz_summary.py"),
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


def _make_repo(tmp_path, files):
    root = str(tmp_path)
    for rel, content in files.items():
        _write(os.path.join(root, rel), content)
    return root


# ── Corpus fuzzing ──────────────────────────────────────────────────────


class TestCorpusFuzzing:
    def test_no_corpus_files_counts_zero(self, tmp_path):
        root = _make_repo(tmp_path, {})
        result = _mod.FuzzResult()
        _mod.run_corpus_fuzzing(root, result)
        assert result.corpus_count == 0
        assert result.corpus_failed == 0

    def test_valid_registry_json_passes(self, tmp_path):
        root = _make_repo(tmp_path, {"registry.json": json.dumps({"items": []})})
        result = _mod.FuzzResult()
        _mod.run_corpus_fuzzing(root, result)
        assert result.corpus_count == 1
        assert result.corpus_failed == 0
        assert result.errors == []

    def test_valid_dashboard_and_preset_files_all_counted(self, tmp_path):
        root = _make_repo(
            tmp_path,
            {
                "registry.json": json.dumps({"items": []}),
                "dashboards/sre/dashboard.json": json.dumps({"format": "kc-dashboard-v1"}),
                "presets/cncf-argo.json": json.dumps({"card_type": "x"}),
                "card-presets/cluster-overview.json": json.dumps({"card_type": "y"}),
            },
        )
        result = _mod.FuzzResult()
        _mod.run_corpus_fuzzing(root, result)
        assert result.corpus_count == 4
        assert result.corpus_failed == 0

    def test_invalid_json_corpus_file_is_a_failure(self, tmp_path):
        root = _make_repo(tmp_path, {"registry.json": "{not valid json"})
        result = _mod.FuzzResult()
        _mod.run_corpus_fuzzing(root, result)
        assert result.corpus_count == 1
        assert result.corpus_failed == 1
        assert "registry.json" in result.errors[0]

    def test_short_content_skips_truncation_mutation_without_erroring(self, tmp_path):
        # len(content) <= 10 -- the truncation loop is skipped entirely, but
        # append/prepend mutations still run and must not raise anomalies.
        root = _make_repo(tmp_path, {"registry.json": "{}"})
        result = _mod.FuzzResult()
        _mod.run_corpus_fuzzing(root, result)
        assert result.corpus_failed == 0


# ── Mutation anomaly detection ───────────────────────────────────────────


class TestMutationAnomaly:
    def test_well_formed_json_has_no_anomaly(self):
        content = json.dumps({"a": 1, "b": [1, 2, 3], "c": {"nested": True}})
        assert _mod._mutation_anomaly(content) is False

    def test_large_nested_content_has_no_anomaly(self):
        content = json.dumps({"array": [{"id": i} for i in range(50)]})
        assert _mod._mutation_anomaly(content) is False


# ── Edge cases ────────────────────────────────────────────────────────────


class TestEdgeCases:
    def test_all_fixed_edge_cases_pass(self):
        result = _mod.FuzzResult()
        _mod.run_edge_cases(result)
        assert result.edge_case_count == len(_mod.EDGE_CASES)
        assert result.edge_case_failed == 0
        assert result.status == "pass"

    def test_edge_case_count_is_bounded_and_fixed(self):
        # Guards against the list silently growing unbounded / becoming
        # input-derived in a future edit.
        assert len(_mod.EDGE_CASES) == 9


# ── Overall status ───────────────────────────────────────────────────────


class TestOverallStatus:
    def test_status_pass_when_no_failures_and_fuzzer_passed(self):
        result = _mod.FuzzResult(fuzzer_status="pass")
        assert result.status == "pass"

    def test_status_fail_when_fuzzer_failed(self):
        result = _mod.FuzzResult(fuzzer_status="fail")
        assert result.status == "fail"

    def test_status_fail_when_corpus_failed(self):
        result = _mod.FuzzResult(fuzzer_status="pass", corpus_failed=1)
        assert result.status == "fail"

    def test_status_fail_when_edge_case_failed(self):
        result = _mod.FuzzResult(fuzzer_status="pass", edge_case_failed=1)
        assert result.status == "fail"

    def test_status_pass_with_unknown_fuzzer_status_and_no_failures(self):
        # Standalone runs (script not yet wired into fuzz.yml) default to
        # fuzzer_status="unknown" and should still report pass if the parts
        # this script *can* check found nothing wrong.
        result = _mod.FuzzResult()
        assert result.fuzzer_status == "unknown"
        assert result.status == "pass"


# ── Rendering ─────────────────────────────────────────────────────────────


class TestRendering:
    def test_summary_md_contains_all_fields(self):
        result = _mod.FuzzResult(
            corpus_count=4,
            corpus_failed=0,
            edge_case_count=9,
            edge_case_failed=0,
            fuzzer_status="pass",
        )
        md = _mod.render_summary_md(result)
        assert "### JSON Fuzzing Summary" in md
        assert "| Corpus files fuzzed | 4 |" in md
        assert "| Overall status | pass |" in md

    def test_summary_md_lists_errors_when_present(self):
        result = _mod.FuzzResult(corpus_failed=1, errors=["registry.json: boom"])
        md = _mod.render_summary_md(result)
        assert "**Errors:**" in md
        assert "registry.json: boom" in md

    def test_summary_json_is_single_line_with_fixed_keys(self):
        result = _mod.FuzzResult(
            corpus_count=4,
            corpus_failed=0,
            edge_case_count=9,
            edge_case_failed=0,
            fuzzer_status="pass",
        )
        line = _mod.render_summary_json(result)
        assert line.startswith("FUZZ_SUMMARY: ")
        assert "\n" not in line
        record = json.loads(line[len("FUZZ_SUMMARY: "):])
        assert set(record.keys()) == {
            "corpus_count",
            "corpus_failed",
            "edge_case_count",
            "edge_case_failed",
            "fuzzer_status",
            "overall_status",
        }


# ── CLI / main ────────────────────────────────────────────────────────────


class TestMain:
    def test_main_returns_zero_on_clean_repo(self, tmp_path, capsys):
        root = _make_repo(tmp_path, {"registry.json": json.dumps({"items": []})})
        rc = _mod.main(["--repo-root", root])
        assert rc == 0
        out = capsys.readouterr().out
        assert "FUZZ_SUMMARY: " in out

    def test_main_returns_one_when_corpus_file_invalid(self, tmp_path, capsys):
        root = _make_repo(tmp_path, {"registry.json": "{broken"})
        rc = _mod.main(["--repo-root", root])
        assert rc == 1

    def test_main_returns_one_when_fuzzer_status_fail(self, tmp_path, capsys):
        root = _make_repo(tmp_path, {"registry.json": json.dumps({"items": []})})
        rc = _mod.main(["--repo-root", root, "--fuzzer-status", "fail"])
        assert rc == 1

    def test_main_writes_to_github_step_summary_when_set(self, tmp_path, monkeypatch):
        root = _make_repo(tmp_path, {"registry.json": json.dumps({"items": []})})
        summary_file = tmp_path / "step_summary.md"
        monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary_file))
        rc = _mod.main(["--repo-root", root])
        assert rc == 0
        content = summary_file.read_text(encoding="utf-8")
        assert "### JSON Fuzzing Summary" in content

    def test_main_rejects_invalid_fuzzer_status(self, tmp_path):
        root = _make_repo(tmp_path, {"registry.json": json.dumps({"items": []})})
        with pytest.raises(SystemExit):
            _mod.main(["--repo-root", root, "--fuzzer-status", "bogus"])
