"""Unit tests for scripts/python_unit_tests_summary.py.

Covers the standalone CI-observability summary script for the
`python-unit-tests.yml` gap tracked in issue #636 (same gap class as
fuzz.yml #597 and validate-json.yml #621). The script is not wired into
any workflow (see runbooks/python-ts-unit-tests-ci-summary-gap.md for why),
so these tests exercise its parsing/rendering functions directly against
synthetic pytest/coverage output -- they do not shell out to a real pytest
run.
"""
import importlib.util
import os
import sys


def _load_module():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "python_unit_tests_summary",
        os.path.join(scripts_dir, "python_unit_tests_summary.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


_mod = _load_module()


# ── parse_pytest_output ──────────────────────────────────────────────

def test_parse_pytest_all_passed():
    text = "427 passed, 1 xfailed, 9 subtests passed in 15.23s"
    result = _mod.parse_pytest_output(text)
    assert result.ran is True
    assert result.passed == 427
    assert result.xfailed == 1
    assert result.failed == 0
    assert result.duration_seconds == 15.23
    assert result.status == "pass"


def test_parse_pytest_with_failures():
    text = "2 failed, 29 passed in 3.01s"
    result = _mod.parse_pytest_output(text)
    assert result.ran is True
    assert result.failed == 2
    assert result.passed == 29
    assert result.status == "fail"


def test_parse_pytest_with_skipped():
    text = "5 passed, 1 skipped in 0.42s"
    result = _mod.parse_pytest_output(text)
    assert result.passed == 5
    assert result.skipped == 1
    assert result.status == "pass"


def test_parse_pytest_no_summary_line():
    result = _mod.parse_pytest_output("no recognizable output here")
    assert result.ran is False
    assert result.status == "unknown"


def test_parse_pytest_with_errors():
    text = "3 error, 10 passed in 1.00s"
    result = _mod.parse_pytest_output(text)
    assert result.error == 3
    assert result.status == "fail"


# ── parse_coverage_report ─────────────────────────────────────────────

def test_parse_coverage_report_full():
    text = (
        "Name                              Stmts   Miss Branch BrPart  Cover\n"
        "-------------------------------------------------------------------\n"
        "scripts/validate-marketplace.py     765      0    410      1    99%\n"
        "-------------------------------------------------------------------\n"
        "TOTAL                               765      0    410      1    99%\n"
    )
    result = _mod.parse_coverage_report(text)
    assert result.percent == 99
    assert result.threshold_met is False


def test_parse_coverage_report_meets_threshold():
    text = "TOTAL                               100      0      0      0   100%\n"
    result = _mod.parse_coverage_report(text)
    assert result.percent == 100
    assert result.threshold_met is True


def test_parse_coverage_report_missing_total():
    result = _mod.parse_coverage_report("no TOTAL row here")
    assert result.percent is None
    assert result.threshold_met is False


def test_parse_coverage_report_custom_threshold():
    text = "TOTAL                               100      0      0      0    80%\n"
    result = _mod.parse_coverage_report(text, threshold=80)
    assert result.percent == 80
    assert result.threshold_met is True


# ── render_summary_md / render_summary_json ──────────────────────────

def test_render_summary_md_pass():
    pytest_result = _mod.parse_pytest_output("10 passed in 1.00s")
    coverage_result = _mod.parse_coverage_report("TOTAL   1 0 0 0 100%\n")
    md = _mod.render_summary_md(pytest_result, coverage_result)
    assert "### Python Unit Tests Summary" in md
    assert "| Passed | 10 |" in md
    assert "| Coverage % | 100 |" in md
    assert "| Status | pass |" in md


def test_render_summary_md_unknown_coverage():
    pytest_result = _mod.parse_pytest_output("10 passed in 1.00s")
    coverage_result = _mod.parse_coverage_report("no TOTAL row")
    md = _mod.render_summary_md(pytest_result, coverage_result)
    assert "| Coverage % | unknown |" in md
    # No coverage data recorded means the threshold cannot be judged unmet,
    # so overall status still reflects the (passing) test result.
    assert "| Status | pass |" in md


def test_render_summary_json_shape():
    pytest_result = _mod.parse_pytest_output("10 passed in 1.00s")
    coverage_result = _mod.parse_coverage_report("TOTAL   1 0 0 0 100%\n")
    line = _mod.render_summary_json(pytest_result, coverage_result)
    assert line.startswith("PYTHON_UNIT_TESTS_SUMMARY: ")
    import json
    record = json.loads(line[len("PYTHON_UNIT_TESTS_SUMMARY: "):])
    assert record == {
        "passed": 10,
        "failed": 0,
        "xfailed": 0,
        "skipped": 0,
        "duration_seconds": 1.0,
        "coverage_percent": 100,
        "status": "pass",
    }


def test_render_summary_json_fail_on_low_coverage():
    pytest_result = _mod.parse_pytest_output("10 passed in 1.00s")
    coverage_result = _mod.parse_coverage_report("TOTAL   1 0 0 0 50%\n")
    line = _mod.render_summary_json(pytest_result, coverage_result)
    assert '"status": "fail"' in line


def test_render_summary_json_fail_on_test_failure():
    pytest_result = _mod.parse_pytest_output("1 failed, 9 passed in 1.00s")
    coverage_result = _mod.parse_coverage_report("TOTAL   1 0 0 0 100%\n")
    line = _mod.render_summary_json(pytest_result, coverage_result)
    assert '"status": "fail"' in line


# ── main() (step-summary file handling) ──────────────────────────────

def test_main_writes_to_github_step_summary(tmp_path, monkeypatch):
    summary_path = tmp_path / "step_summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary_path))

    def fake_run_tests(repo_root):
        return (
            _mod.parse_pytest_output("10 passed in 1.00s"),
            _mod.parse_coverage_report("TOTAL   1 0 0 0 100%\n"),
        )

    monkeypatch.setattr(_mod, "_run_tests", fake_run_tests)

    exit_code = _mod.main(["--repo-root", str(tmp_path)])

    assert exit_code == 0
    content = summary_path.read_text(encoding="utf-8")
    assert "### Python Unit Tests Summary" in content


def test_main_returns_nonzero_on_failure(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)

    def fake_run_tests(repo_root):
        return (
            _mod.parse_pytest_output("1 failed, 9 passed in 1.00s"),
            _mod.parse_coverage_report("TOTAL   1 0 0 0 100%\n"),
        )

    monkeypatch.setattr(_mod, "_run_tests", fake_run_tests)

    exit_code = _mod.main(["--repo-root", str(tmp_path)])

    assert exit_code == 1
    captured = capsys.readouterr()
    assert "PYTHON_UNIT_TESTS_SUMMARY:" in captured.out
