"""Unit tests for scripts/ts_unit_tests_summary.py.

Covers the standalone CI-observability summary script for the
`ts-unit-tests.yml` gap tracked in issue #636 (same gap class as
fuzz.yml #597, validate-json.yml #621, and python-unit-tests.yml, see
`scripts/python_unit_tests_summary.py`). The script is not wired into any
workflow (see runbooks/python-ts-unit-tests-ci-summary-gap.md for why), so
these tests exercise its parsing/rendering functions directly against
synthetic vitest console output.
"""
import importlib.util
import json
import os
import sys


def _load_module():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "ts_unit_tests_summary",
        os.path.join(scripts_dir, "ts_unit_tests_summary.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


_mod = _load_module()

_ALL_PASSED_OUTPUT = """
 Test Files  12 passed (12)
      Tests  145 passed (145)
   Start at  10:00:00
   Duration  5.32s

 % Coverage report from v8
-----------|---------|----------|---------|---------|-------------------
File       | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------|---------|----------|---------|---------|-------------------
All files  |   92.34 |    85.71 |   90.00 |   92.34 |
-----------|---------|----------|---------|---------|-------------------
"""

_WITH_FAILURES_OUTPUT = """
 Test Files  1 failed | 11 passed (12)
      Tests  2 failed | 143 passed (145)
   Duration  6.10s
"""


# ── parse_vitest_output ───────────────────────────────────────────────

def test_parse_vitest_all_passed():
    result = _mod.parse_vitest_output(_ALL_PASSED_OUTPUT)
    assert result.ran is True
    assert result.test_files_passed == 12
    assert result.test_files_failed == 0
    assert result.tests_passed == 145
    assert result.tests_failed == 0
    assert result.duration_seconds == 5.32
    assert result.status == "pass"


def test_parse_vitest_with_failures():
    result = _mod.parse_vitest_output(_WITH_FAILURES_OUTPUT)
    assert result.test_files_failed == 1
    assert result.test_files_passed == 11
    assert result.tests_failed == 2
    assert result.tests_passed == 143
    assert result.duration_seconds == 6.10
    assert result.status == "fail"


def test_parse_vitest_no_summary_block():
    result = _mod.parse_vitest_output("no recognizable output here")
    assert result.ran is False
    assert result.status == "unknown"


# ── parse_coverage_output ─────────────────────────────────────────────

def test_parse_coverage_output_present():
    result = _mod.parse_coverage_output(_ALL_PASSED_OUTPUT)
    assert result.percent == 92.34


def test_parse_coverage_output_missing():
    result = _mod.parse_coverage_output("no coverage table here")
    assert result.percent is None
    assert result.threshold_met is True


# ── render_summary_md / render_summary_json ──────────────────────────

def test_render_summary_md_pass():
    vitest_result = _mod.parse_vitest_output(_ALL_PASSED_OUTPUT)
    coverage_result = _mod.parse_coverage_output(_ALL_PASSED_OUTPUT)
    md = _mod.render_summary_md(vitest_result, coverage_result)
    assert "### TypeScript Unit Tests Summary" in md
    assert "| Tests passed | 145 |" in md
    assert "| Coverage % | 92.34 |" in md
    assert "| Status | pass |" in md


def test_render_summary_json_shape():
    vitest_result = _mod.parse_vitest_output(_ALL_PASSED_OUTPUT)
    coverage_result = _mod.parse_coverage_output(_ALL_PASSED_OUTPUT)
    line = _mod.render_summary_json(vitest_result, coverage_result)
    assert line.startswith("TS_UNIT_TESTS_SUMMARY: ")
    record = json.loads(line[len("TS_UNIT_TESTS_SUMMARY: "):])
    assert record == {
        "test_files_passed": 12,
        "test_files_failed": 0,
        "tests_passed": 145,
        "tests_failed": 0,
        "duration_seconds": 5.32,
        "coverage_percent": 92.34,
        "status": "pass",
    }


def test_render_summary_json_fail_on_test_failure():
    vitest_result = _mod.parse_vitest_output(_WITH_FAILURES_OUTPUT)
    coverage_result = _mod.parse_coverage_output(_WITH_FAILURES_OUTPUT)
    line = _mod.render_summary_json(vitest_result, coverage_result)
    assert '"status": "fail"' in line


# ── main() (stdin/--input and step-summary file handling) ────────────

def test_main_reads_from_input_file_and_writes_step_summary(tmp_path, monkeypatch):
    input_path = tmp_path / "vitest_output.txt"
    input_path.write_text(_ALL_PASSED_OUTPUT, encoding="utf-8")
    summary_path = tmp_path / "step_summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary_path))

    exit_code = _mod.main(["--input", str(input_path)])

    assert exit_code == 0
    content = summary_path.read_text(encoding="utf-8")
    assert "### TypeScript Unit Tests Summary" in content


def test_main_returns_nonzero_on_failure(tmp_path, monkeypatch, capsys):
    input_path = tmp_path / "vitest_output.txt"
    input_path.write_text(_WITH_FAILURES_OUTPUT, encoding="utf-8")
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)

    exit_code = _mod.main(["--input", str(input_path)])

    assert exit_code == 1
    captured = capsys.readouterr()
    assert "TS_UNIT_TESTS_SUMMARY:" in captured.out


def test_main_reads_from_stdin(monkeypatch, capsys):
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
    monkeypatch.setattr(sys, "stdin", __import__("io").StringIO(_ALL_PASSED_OUTPUT))

    exit_code = _mod.main([])

    assert exit_code == 0
    captured = capsys.readouterr()
    assert "TS_UNIT_TESTS_SUMMARY:" in captured.out
