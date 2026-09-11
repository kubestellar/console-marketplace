"""Repo-root pytest hook: emit a structured, machine-readable summary of
the ``pytest tests/`` run used by ``python-unit-tests.yml``.

Gap this closes (see issue tracked in
runbooks/python-ts-unit-tests-ci-summary-gap.md and the "same gap class"
findings for fuzz.yml / validate-json.yml): the workflow's "Run tests with
coverage" step only surfaces pytest's own free-text output, with no single
grep-able record and no `$GITHUB_STEP_SUMMARY` entry.

Unlike the fuzz.yml / validate-json.yml gaps, this one does NOT require
editing `.github/workflows/python-unit-tests.yml` (which the hive's GitHub
App installation cannot do — see the runbook). `$GITHUB_STEP_SUMMARY` is a
runner-provided env var present in every Actions job step regardless of
workflow wiring, and pytest auto-loads a root `conftest.py`, so this hook
fires for the existing `python -m coverage run ... -m pytest tests/ -v`
invocation with zero workflow changes.

Bounded, stdout/step-summary-only output: fixed integer fields (pass/fail/
skip/error counts, exit status) — no per-test names, no unbounded labels,
no exporter, no external data flow.
"""
from __future__ import annotations

import json
import os

# Prefix for the machine-readable summary line; grep this in CI logs to
# get counts without parsing pytest's free-text report.
SUMMARY_PREFIX = "PYTHON_UNIT_TESTS_SUMMARY:"


def build_summary_record(counts: dict[str, int], exit_status: int) -> dict[str, object]:
    """Return the bounded, fixed-shape summary record for one test run.

    ``counts`` must only contain the known bounded keys below; unknown
    keys are ignored so a future pytest outcome type can't silently grow
    this record without a deliberate change here.
    """
    known_keys = ("passed", "failed", "skipped", "errors", "xfailed", "xpassed")
    record: dict[str, object] = {k: int(counts.get(k, 0)) for k in known_keys}
    record["total"] = sum(record[k] for k in known_keys)
    record["exit_status"] = int(exit_status)
    record["overall_status"] = "pass" if exit_status == 0 else "fail"
    return record


def format_step_summary_markdown(record: dict[str, object]) -> str:
    """Render ``record`` as the Markdown table written to $GITHUB_STEP_SUMMARY."""
    lines = [
        "### Python Unit Tests Summary",
        "",
        "| Field | Value |",
        "|---|---|",
        f"| Passed | {record['passed']} |",
        f"| Failed | {record['failed']} |",
        f"| Skipped | {record['skipped']} |",
        f"| Errors | {record['errors']} |",
        f"| Total | {record['total']} |",
        f"| Exit status | {record['exit_status']} |",
        f"| Overall status | {record['overall_status']} |",
        "",
    ]
    return "\n".join(lines)


def pytest_sessionfinish(session, exitstatus) -> None:  # noqa: ANN001 - pytest hook signature
    """Emit the structured summary once the whole test session completes."""
    counts = dict(getattr(session.config, "_python_unit_tests_summary_counts", {}))
    if not counts:
        # Fallback: derive counts straight from the terminal reporter's stats
        # so the hook is self-sufficient even if the counting hook below
        # didn't run for some reason (e.g. collection-only invocations).
        terminal_reporter = session.config.pluginmanager.get_plugin("terminalreporter")
        stats = getattr(terminal_reporter, "stats", {}) if terminal_reporter else {}
        key_map = {
            "passed": "passed",
            "failed": "failed",
            "skipped": "skipped",
            "error": "errors",
            "xfailed": "xfailed",
            "xpassed": "xpassed",
        }
        counts = {dest: len(stats.get(src, [])) for src, dest in key_map.items()}

    record = build_summary_record(counts, int(exitstatus))

    print(f"{SUMMARY_PREFIX} {json.dumps(record, sort_keys=True)}")

    step_summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary_path:
        with open(step_summary_path, "a", encoding="utf-8") as fh:
            fh.write(format_step_summary_markdown(record))


def pytest_terminal_summary(terminalreporter, exitstatus, config) -> None:  # noqa: ANN001
    """Snapshot pass/fail/skip/error counts while the reporter still has them."""
    stats = terminalreporter.stats
    config._python_unit_tests_summary_counts = {
        "passed": len(stats.get("passed", [])),
        "failed": len(stats.get("failed", [])),
        "skipped": len(stats.get("skipped", [])),
        "errors": len(stats.get("error", [])),
        "xfailed": len(stats.get("xfailed", [])),
        "xpassed": len(stats.get("xpassed", [])),
    }
