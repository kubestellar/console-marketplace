"""Regression tests for the repo-root conftest.py CI-observability summary
hook (see runbooks/python-ts-unit-tests-ci-summary-gap.md).

These test the pure helper functions directly (build_summary_record,
format_step_summary_markdown) rather than spawning a nested pytest
session, so the suite stays fast and avoids recursive-pytest fragility.
They guard the exact contract a CI reader depends on: a bounded set of
integer fields, a fixed overall_status enum, and a stable Markdown shape.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CONFTEST_PATH = REPO_ROOT / "conftest.py"


def _load_conftest():
    spec = importlib.util.spec_from_file_location("root_conftest_under_test", CONFTEST_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


conftest = _load_conftest()


def test_build_summary_record_all_pass():
    record = conftest.build_summary_record(
        {"passed": 12, "failed": 0, "skipped": 0, "errors": 0}, exit_status=0
    )
    assert record["passed"] == 12
    assert record["total"] == 12
    assert record["exit_status"] == 0
    assert record["overall_status"] == "pass"


def test_build_summary_record_with_failures():
    record = conftest.build_summary_record(
        {"passed": 10, "failed": 2, "skipped": 1, "errors": 0}, exit_status=1
    )
    assert record["total"] == 13
    assert record["overall_status"] == "fail"


def test_build_summary_record_ignores_unknown_keys():
    record = conftest.build_summary_record(
        {"passed": 1, "unexpected_future_key": 999}, exit_status=0
    )
    assert "unexpected_future_key" not in record
    assert record["total"] == 1


def test_build_summary_record_bounded_field_set():
    record = conftest.build_summary_record({"passed": 1}, exit_status=0)
    expected_keys = {
        "passed", "failed", "skipped", "errors", "xfailed", "xpassed",
        "total", "exit_status", "overall_status",
    }
    assert set(record.keys()) == expected_keys


def test_format_step_summary_markdown_contains_table():
    record = conftest.build_summary_record(
        {"passed": 3, "failed": 1, "skipped": 0, "errors": 0}, exit_status=1
    )
    markdown = conftest.format_step_summary_markdown(record)
    assert "### Python Unit Tests Summary" in markdown
    assert "| Passed | 3 |" in markdown
    assert "| Failed | 1 |" in markdown
    assert "| Overall status | fail |" in markdown


def test_summary_prefix_is_grepable_marker():
    assert conftest.SUMMARY_PREFIX == "PYTHON_UNIT_TESTS_SUMMARY:"
