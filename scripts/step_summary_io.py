#!/usr/bin/env python3
"""Shared ``$GITHUB_STEP_SUMMARY`` writer for the CI-observability scripts.

``scripts/fuzz_summary.py``, ``scripts/validate_json_summary.py``, and
``scripts/auto_qa_report.py`` each independently re-implemented the same
6-line "append to ``$GITHUB_STEP_SUMMARY`` when set, else print" block.
This module extracts that single helper so the three scripts share one
implementation instead of three copies that can drift out of sync.
"""
from __future__ import annotations

import os


def write_step_summary(markdown: str) -> None:
    """Append ``markdown`` to ``$GITHUB_STEP_SUMMARY`` if set, else print it."""
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as fh:
            fh.write(markdown)
    else:
        print(markdown)
