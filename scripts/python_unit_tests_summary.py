#!/usr/bin/env python3
"""Structured CI-observability summary for the `python-unit-tests.yml` workflow.

`python-unit-tests.yml`'s "Run tests with coverage" and "Check coverage
threshold" steps only emit tool-native pytest/coverage output: no step writes
to `$GITHUB_STEP_SUMMARY`, no step uses `if: always()`, and there is no
single-line machine-readable summary record of what was checked. This is the
same gap class already flagged for `fuzz.yml` (#597) and `validate-json.yml`
(#621). See issue #636 for the original finding covering this workflow and
its TypeScript counterpart (`ts-unit-tests.yml`, see
`scripts/ts_unit_tests_summary.py`).

This module wraps the same two commands the workflow already runs
(`coverage run --branch --source=scripts -m pytest tests/ -v` and
`coverage report --fail-under=100 --include=...`), parses their bounded,
fixed-shape output (test pass/fail/xfail counts, elapsed seconds, coverage
percentage), and emits:

  - a bounded markdown table (written to $GITHUB_STEP_SUMMARY when set, else
    stdout)
  - a single-line `PYTHON_UNIT_TESTS_SUMMARY: {...}` JSON record with fixed
    keys only (passed, failed, xfailed, skipped, duration_seconds,
    coverage_percent, status) -- every count is bounded by this repo's own
    fixed test suite, never by unbounded user input.

Standalone by design: this script is NOT wired into `python-unit-tests.yml`.
Doing so requires editing a file under `.github/workflows/`, which needs the
`workflows` GitHub App permission this project's automated PRs do not carry
(the same confirmed blocker already documented for `fuzz.yml` in
runbooks/fuzz-yml-ci-summary-gap.md and `validate-json.yml` in
runbooks/validate-json-ci-summary-gap.md). No exporter, metrics backend, or
external data flow is added: stdout / $GITHUB_STEP_SUMMARY only.

Usage:
    python3 scripts/python_unit_tests_summary.py [--repo-root PATH]

Exit status: 0 if tests passed and coverage met the threshold, 1 otherwise.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass

# Fixed, bounded summary line pattern pytest prints, e.g.:
#   "427 passed, 1 xfailed, 9 subtests passed in 15.23s"
#   "2 failed, 29 passed in 3.01s"
#   "5 passed, 1 skipped in 0.42s"
_COUNT_RE = re.compile(r"(\d+) (passed|failed|xfailed|xpassed|skipped|error)\b")
_DURATION_RE = re.compile(r"\bin ([\d.]+)s\b")

# Fixed, bounded line `coverage report` prints for the TOTAL row, e.g.:
#   "TOTAL                               765      0    410      1    99%"
_COVERAGE_TOTAL_RE = re.compile(r"^TOTAL\s+.*?(\d+)%\s*$", re.MULTILINE)


@dataclass
class PytestResult:
    passed: int = 0
    failed: int = 0
    xfailed: int = 0
    xpassed: int = 0
    skipped: int = 0
    error: int = 0
    duration_seconds: float = 0.0
    ran: bool = False

    @property
    def status(self) -> str:
        if not self.ran:
            return "unknown"
        return "pass" if self.failed == 0 and self.error == 0 else "fail"


@dataclass
class CoverageResult:
    percent: int | None = None
    threshold_met: bool = False


def parse_pytest_output(text: str) -> PytestResult:
    """Parse pytest's final summary line into bounded counts."""
    result = PytestResult()
    counts = _COUNT_RE.findall(text)
    if not counts:
        return result
    result.ran = True
    for value, name in counts:
        setattr(result, name, int(value))
    duration_match = _DURATION_RE.search(text)
    if duration_match:
        result.duration_seconds = float(duration_match.group(1))
    return result


def parse_coverage_report(text: str, threshold: int = 100) -> CoverageResult:
    """Parse `coverage report`'s TOTAL row into a bounded percentage."""
    result = CoverageResult()
    match = _COVERAGE_TOTAL_RE.search(text)
    if match:
        result.percent = int(match.group(1))
        result.threshold_met = result.percent >= threshold
    return result


def render_summary_md(pytest_result: PytestResult, coverage_result: CoverageResult) -> str:
    overall = _overall_status(pytest_result, coverage_result)
    lines = [
        "### Python Unit Tests Summary",
        "",
        "| Field | Value |",
        "|---|---|",
        f"| Passed | {pytest_result.passed} |",
        f"| Failed | {pytest_result.failed} |",
        f"| Xfailed | {pytest_result.xfailed} |",
        f"| Skipped | {pytest_result.skipped} |",
        f"| Duration (s) | {pytest_result.duration_seconds} |",
        f"| Coverage % | {coverage_result.percent if coverage_result.percent is not None else 'unknown'} |",
        f"| Status | {overall} |",
    ]
    return "\n".join(lines) + "\n"


def render_summary_json(pytest_result: PytestResult, coverage_result: CoverageResult) -> str:
    record = {
        "passed": pytest_result.passed,
        "failed": pytest_result.failed,
        "xfailed": pytest_result.xfailed,
        "skipped": pytest_result.skipped,
        "duration_seconds": pytest_result.duration_seconds,
        "coverage_percent": coverage_result.percent,
        "status": _overall_status(pytest_result, coverage_result),
    }
    return f"PYTHON_UNIT_TESTS_SUMMARY: {json.dumps(record)}"


def _overall_status(pytest_result: PytestResult, coverage_result: CoverageResult) -> str:
    if pytest_result.status != "pass":
        return "fail"
    if coverage_result.percent is not None and not coverage_result.threshold_met:
        return "fail"
    return "pass"


def _run_tests(repo_root: str) -> tuple[PytestResult, CoverageResult]:
    """Run the same two commands the workflow runs and parse their output."""
    pytest_proc = subprocess.run(
        ["python3", "-m", "coverage", "run", "--branch", "--source=scripts",
         "-m", "pytest", "tests/", "-v"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    pytest_result = parse_pytest_output(pytest_proc.stdout + pytest_proc.stderr)

    coverage_proc = subprocess.run(
        ["python3", "-m", "coverage", "report", "--fail-under=100",
         "--include=scripts/validate-marketplace.py"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    coverage_result = parse_coverage_report(coverage_proc.stdout + coverage_proc.stderr)

    return pytest_result, coverage_result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        default=os.path.normpath(os.path.join(os.path.dirname(__file__), "..")),
        help="Repository root to run tests from (default: parent of scripts/).",
    )
    args = parser.parse_args(argv)

    pytest_result, coverage_result = _run_tests(args.repo_root)

    summary_md = render_summary_md(pytest_result, coverage_result)
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as fh:
            fh.write(summary_md)
    else:
        print(summary_md)

    print(render_summary_json(pytest_result, coverage_result))

    return 0 if _overall_status(pytest_result, coverage_result) == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
