#!/usr/bin/env python3
"""Structured CI-observability summary for the `fuzz.yml` workflow.

`fuzz.yml`'s "Run fuzzing tests" and "Test edge cases" steps only print
free-text `echo`/`print` lines today ("Fuzzing completed successfully - no
crashes detected", "All edge case tests passed!"): no step writes to
`$GITHUB_STEP_SUMMARY`, and there is no bounded, machine-readable record of
what actually ran. This mirrors the gap already closed for
`scripts/validate-marketplace.py` (`MARKETPLACE_QUALITY_SUMMARY:` line) and
`scripts/validate_json_summary.py` (`VALIDATE_JSON_SUMMARY:` line). See
tracking issue #597 and `runbooks/fuzz-yml-ci-summary-gap.md` for the
ready-to-apply workflow diff.

This module re-implements the corpus-mutation testing and edge-case testing
`fuzz.yml` already runs (mutating each of this repo's own fixed JSON
surfaces -- registry.json, dashboards/*/dashboard.json, presets/*.json,
card-presets/*.json -- via truncation and extra-character insertion, plus a
fixed list of JSON edge cases) as a standalone, unit-testable script. It does
NOT invoke atheris itself (that remains a subprocess step in the workflow);
instead it accepts that step's pass/fail result via `--fuzzer-status` /
`FUZZER_STATUS` so the final summary can report on the whole job once wired.
It emits:

  - a bounded markdown table (written to $GITHUB_STEP_SUMMARY when set, else
    stdout)
  - a single-line `FUZZ_SUMMARY: {...}` JSON record with fixed keys only
    (corpus_count, corpus_failed, edge_case_count, edge_case_failed,
    fuzzer_status, overall_status) -- counts are bounded by this repo's own
    fixed corpus-file list and fixed edge-case list, never by unbounded
    input.

Standalone by design: this script is NOT wired into `fuzz.yml`. Doing so
requires editing a file under `.github/workflows/`, which needs the
`workflows` GitHub App permission this project's automated PRs do not carry
(confirmed blocker -- see runbooks/fuzz-yml-ci-summary-gap.md for the
ready-to-apply diff and the same rejection already hit for
`validate-json.yml`). No exporter, metrics backend, or external data flow is
added: stdout / $GITHUB_STEP_SUMMARY only.

Usage:
    python3 scripts/fuzz_summary.py [--repo-root PATH] [--fuzzer-status pass|fail|unknown]

Exit status: 0 if no corpus/edge-case anomalies were found and fuzzer-status
is not "fail", 1 otherwise.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from dataclasses import dataclass, field

# Bounded, fixed list of this repo's own JSON surfaces -- never derived from
# user input -- matching the corpus glob already used by fuzz.yml.
CORPUS_GLOBS = [
    "registry.json",
    "dashboards/*/dashboard.json",
    "presets/*.json",
    "card-presets/*.json",
]

# Bounded, fixed list of edge cases -- identical to the ones fuzz.yml's
# "Test edge cases" step already exercises.
EDGE_CASES = [
    "{}",
    "[]",
    "null",
    '""',
    "0",
    '{"nested": {"deeply": {"very": {"deep": {}}}}}',
    '{"array": [[[[[]]]]]}',
    "[" + ",".join(["{}"] * 1000) + "]",
    '{"key": "' + "x" * 10000 + '"}',
]

# Errors atheris' TestOneInput (and fuzz.yml's mutation loop) already treat
# as expected outcomes of malformed JSON input, not anomalies.
EXPECTED_JSON_ERRORS = (
    json.JSONDecodeError,
    ValueError,
    TypeError,
    KeyError,
    AttributeError,
    IndexError,
    RecursionError,
    MemoryError,
)


@dataclass
class FuzzResult:
    corpus_count: int = 0
    corpus_failed: int = 0
    edge_case_count: int = 0
    edge_case_failed: int = 0
    fuzzer_status: str = "unknown"
    errors: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        if self.corpus_failed or self.edge_case_failed or self.fuzzer_status == "fail":
            return "fail"
        return "pass"


def _iter_corpus_files(repo_root: str):
    seen: set[str] = set()
    for pattern in CORPUS_GLOBS:
        for path in sorted(glob.glob(os.path.join(repo_root, pattern))):
            if path not in seen:
                seen.add(path)
                yield path


def _mutation_anomaly(content: str) -> bool:
    """Return True if a truncation/extra-character mutation raised an error
    outside the expected JSON-parsing-failure family (a real anomaly)."""
    anomaly = False
    if len(content) > 10:
        for i in range(1, 10):
            try:
                json.loads(content[:-i])
            except EXPECTED_JSON_ERRORS:
                pass
            except Exception:
                anomaly = True
    for mutated in (content + "{", "}" + content):
        try:
            json.loads(mutated)
        except EXPECTED_JSON_ERRORS:
            pass
        except Exception:
            anomaly = True
    return anomaly


def run_corpus_fuzzing(repo_root: str, result: FuzzResult) -> None:
    for path in _iter_corpus_files(repo_root):
        result.corpus_count += 1
        rel = os.path.relpath(path, repo_root)
        try:
            with open(path, encoding="utf-8") as fh:
                content = fh.read()
            json.loads(content)  # committed files must already be valid JSON
        except (OSError, json.JSONDecodeError) as exc:
            result.corpus_failed += 1
            result.errors.append(f"{rel}: original content failed to parse ({exc})")
            continue

        if _mutation_anomaly(content):
            result.corpus_failed += 1
            result.errors.append(f"{rel}: mutation testing raised an unexpected error")


def run_edge_cases(result: FuzzResult) -> None:
    for case in EDGE_CASES:
        result.edge_case_count += 1
        try:
            json.loads(case)
        except EXPECTED_JSON_ERRORS:
            pass
        except Exception as exc:
            result.edge_case_failed += 1
            result.errors.append(
                f"edge case {case[:40]!r}: unexpected error ({type(exc).__name__})"
            )


def render_summary_md(result: FuzzResult) -> str:
    lines = [
        "### JSON Fuzzing Summary",
        "",
        "| Field | Value |",
        "|---|---|",
        f"| Corpus files fuzzed | {result.corpus_count} |",
        f"| Corpus failures | {result.corpus_failed} |",
        f"| Edge cases tested | {result.edge_case_count} |",
        f"| Edge case failures | {result.edge_case_failed} |",
        f"| Fuzzer status (atheris) | {result.fuzzer_status} |",
        f"| Overall status | {result.status} |",
    ]
    if result.errors:
        lines.append("")
        lines.append("**Errors:**")
        for err in result.errors:
            lines.append(f"- {err}")
    return "\n".join(lines) + "\n"


def render_summary_json(result: FuzzResult) -> str:
    record = {
        "corpus_count": result.corpus_count,
        "corpus_failed": result.corpus_failed,
        "edge_case_count": result.edge_case_count,
        "edge_case_failed": result.edge_case_failed,
        "fuzzer_status": result.fuzzer_status,
        "overall_status": result.status,
    }
    return f"FUZZ_SUMMARY: {json.dumps(record)}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        default=os.path.normpath(os.path.join(os.path.dirname(__file__), "..")),
        help="Repository root to fuzz-test (default: parent of scripts/).",
    )
    parser.add_argument(
        "--fuzzer-status",
        choices=("pass", "fail", "unknown"),
        default=os.environ.get("FUZZER_STATUS", "unknown"),
        help=(
            "Pass/fail result of the atheris TestOneInput run. Not computed "
            "by this script -- the workflow would supply it once wired."
        ),
    )
    args = parser.parse_args(argv)

    result = FuzzResult(fuzzer_status=args.fuzzer_status)
    run_corpus_fuzzing(args.repo_root, result)
    run_edge_cases(result)

    summary_md = render_summary_md(result)
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as fh:
            fh.write(summary_md)
    else:
        print(summary_md)

    print(render_summary_json(result))

    return 0 if result.status == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
