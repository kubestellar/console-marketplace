#!/usr/bin/env python3
"""Structured CI-observability summary for the `ts-unit-tests.yml` workflow.

`ts-unit-tests.yml`'s "Run vitest with coverage gate" step only emits
tool-native vitest/v8-coverage output: no step writes to
`$GITHUB_STEP_SUMMARY`, no step uses `if: always()`, and there is no
single-line machine-readable summary record of what was checked. This is the
same gap class already flagged for `fuzz.yml` (#597), `validate-json.yml`
(#621), and `python-unit-tests.yml` (#636, see
`scripts/python_unit_tests_summary.py`).

This module parses vitest's bounded, fixed-shape console output (test-file
and test pass/fail counts, duration, and the v8 coverage provider's "All
files" row) and emits:

  - a bounded markdown table (written to $GITHUB_STEP_SUMMARY when set, else
    stdout)
  - a single-line `TS_UNIT_TESTS_SUMMARY: {...}` JSON record with fixed keys
    only (test_files_passed, test_files_failed, tests_passed, tests_failed,
    duration_seconds, coverage_percent, status) -- every count is bounded by
    this repo's own fixed test suite, never by unbounded user input.

Standalone by design: this script is NOT wired into `ts-unit-tests.yml`.
Doing so requires editing a file under `.github/workflows/`, which needs the
`workflows` GitHub App permission this project's automated PRs do not carry
(the same confirmed blocker already documented for `fuzz.yml` in
runbooks/fuzz-yml-ci-summary-gap.md and `validate-json.yml` in
runbooks/validate-json-ci-summary-gap.md). No exporter, metrics backend, or
external data flow is added: stdout / $GITHUB_STEP_SUMMARY only.

Unlike `python_unit_tests_summary.py`, this script only parses vitest output
-- it does not shell out to `npx vitest` itself, because `ts-unit-tests.yml`
requires a cross-repo checkout (`kubestellar/console`) and `npm ci` install
that are not reproducible standalone. Feed it captured vitest output via
stdin or `--input PATH`.

Usage:
    npx vitest run --config vitest.marketplace.config.ts --coverage \
        | python3 scripts/ts_unit_tests_summary.py

Exit status: 0 if tests passed and coverage met the threshold, 1 otherwise.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass

# Fixed, bounded lines vitest prints in its summary block, e.g.:
#   " Test Files  12 passed (12)"
#   " Test Files  1 failed | 11 passed (12)"
#   "      Tests  145 passed (145)"
#   "      Tests  2 failed | 143 passed (145)"
#   "   Duration  5.32s"
_TEST_FILES_RE = re.compile(
    r"Test Files\s+(?:(\d+) failed \| )?(\d+) passed"
)
_TESTS_RE = re.compile(
    r"^\s*Tests\s+(?:(\d+) failed \| )?(\d+) passed", re.MULTILINE
)
_DURATION_RE = re.compile(r"Duration\s+([\d.]+)s")

# Fixed, bounded "All files" row the v8 coverage provider prints, e.g.:
#   "All files  |   92.34 |    85.71 |   90.00 |   92.34 |"
_COVERAGE_ALL_FILES_RE = re.compile(
    r"^All files\s*\|\s*([\d.]+)", re.MULTILINE
)


@dataclass
class VitestResult:
    test_files_passed: int = 0
    test_files_failed: int = 0
    tests_passed: int = 0
    tests_failed: int = 0
    duration_seconds: float = 0.0
    ran: bool = False

    @property
    def status(self) -> str:
        if not self.ran:
            return "unknown"
        return "pass" if self.test_files_failed == 0 and self.tests_failed == 0 else "fail"


@dataclass
class CoverageResult:
    percent: float | None = None
    threshold_met: bool = True  # ts-unit-tests.yml has no explicit threshold today


def parse_vitest_output(text: str) -> VitestResult:
    """Parse vitest's final summary block into bounded counts."""
    result = VitestResult()
    files_match = _TEST_FILES_RE.search(text)
    tests_match = _TESTS_RE.search(text)
    if not files_match and not tests_match:
        return result
    result.ran = True
    if files_match:
        result.test_files_failed = int(files_match.group(1) or 0)
        result.test_files_passed = int(files_match.group(2))
    if tests_match:
        result.tests_failed = int(tests_match.group(1) or 0)
        result.tests_passed = int(tests_match.group(2))
    duration_match = _DURATION_RE.search(text)
    if duration_match:
        result.duration_seconds = float(duration_match.group(1))
    return result


def parse_coverage_output(text: str) -> CoverageResult:
    """Parse the v8 coverage provider's "All files" row into a percentage."""
    result = CoverageResult()
    match = _COVERAGE_ALL_FILES_RE.search(text)
    if match:
        result.percent = float(match.group(1))
    return result


def render_summary_md(vitest_result: VitestResult, coverage_result: CoverageResult) -> str:
    overall = _overall_status(vitest_result, coverage_result)
    lines = [
        "### TypeScript Unit Tests Summary",
        "",
        "| Field | Value |",
        "|---|---|",
        f"| Test files passed | {vitest_result.test_files_passed} |",
        f"| Test files failed | {vitest_result.test_files_failed} |",
        f"| Tests passed | {vitest_result.tests_passed} |",
        f"| Tests failed | {vitest_result.tests_failed} |",
        f"| Duration (s) | {vitest_result.duration_seconds} |",
        f"| Coverage % | {coverage_result.percent if coverage_result.percent is not None else 'unknown'} |",
        f"| Status | {overall} |",
    ]
    return "\n".join(lines) + "\n"


def render_summary_json(vitest_result: VitestResult, coverage_result: CoverageResult) -> str:
    record = {
        "test_files_passed": vitest_result.test_files_passed,
        "test_files_failed": vitest_result.test_files_failed,
        "tests_passed": vitest_result.tests_passed,
        "tests_failed": vitest_result.tests_failed,
        "duration_seconds": vitest_result.duration_seconds,
        "coverage_percent": coverage_result.percent,
        "status": _overall_status(vitest_result, coverage_result),
    }
    return f"TS_UNIT_TESTS_SUMMARY: {json.dumps(record)}"


def _overall_status(vitest_result: VitestResult, coverage_result: CoverageResult) -> str:
    if vitest_result.status != "pass":
        return "fail"
    if not coverage_result.threshold_met:
        return "fail"
    return "pass"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        help="Path to a file containing captured vitest output. Reads stdin if omitted.",
    )
    args = parser.parse_args(argv)

    if args.input:
        with open(args.input, encoding="utf-8") as fh:
            text = fh.read()
    else:
        text = sys.stdin.read()

    vitest_result = parse_vitest_output(text)
    coverage_result = parse_coverage_output(text)

    summary_md = render_summary_md(vitest_result, coverage_result)
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as fh:
            fh.write(summary_md)
    else:
        print(summary_md)

    print(render_summary_json(vitest_result, coverage_result))

    return 0 if _overall_status(vitest_result, coverage_result) == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
