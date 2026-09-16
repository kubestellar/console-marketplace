#!/usr/bin/env python3
"""Report-shaping logic for the `marketplace-auto-qa.yml` nightly scan.

`marketplace-auto-qa.yml`'s "Run full quality scan" step used to embed this
logic as a ~55-line `python3 -c` heredoc: grouping scan errors/warnings by
category, truncating each group for per-category and combined markdown
files, and writing a JSON category manifest consumed by the downstream
issue-creation step. That heredoc had zero unit test coverage even though
it feeds nightly issue creation, and its two truncation loops had already
drifted (30 vs 20) with no test to catch it. See tracking issue #583.

This module extracts that logic into a testable script with named
constants for the two truncation limits, and also counts scan errors/
warnings (replacing the two separate `python3 -c` counting invocations the
workflow ran beforehand).

Usage:
    python3 scripts/auto_qa_report.py SCAN_JSON OUT_DIR

Writes, under OUT_DIR:
  - scan-category-<cat>.md   -- per-category findings (bounded to
                                 PER_CATEGORY_LIMIT errors/warnings each)
  - scan-grouped.md          -- combined summary across all categories
                                 (bounded to SUMMARY_LIMIT errors/warnings
                                 each)
  - scan-categories.json     -- {category: {"errors": N, "warnings": N}}

Also prints `error_count=N` / `warn_count=N` lines suitable for appending
to `$GITHUB_OUTPUT`, and appends the combined summary to
`$GITHUB_STEP_SUMMARY` when set.

Exit status: always 0 (the scan step itself uses `continue-on-error`; this
script only shapes whatever scan results it is given).
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict

# Truncation limits for the two report views. Kept as named constants (were
# inline magic numbers `30` and `20` in the original heredoc) so the two
# nearly-identical loops below can't silently drift out of sync again.
PER_CATEGORY_LIMIT = 30
SUMMARY_LIMIT = 20


def group_by_category(scan_data: dict) -> dict:
    """Group scan errors/warnings by category.

    Returns a dict mapping category -> {"errors": [...], "warnings": [...]}
    of message strings, in encounter order.
    """
    groups: dict = defaultdict(lambda: {"errors": [], "warnings": []})
    for item in scan_data.get("errors", []):
        groups[item["category"]]["errors"].append(item["message"])
    for item in scan_data.get("warnings", []):
        groups[item["category"]]["warnings"].append(item["message"])
    return groups


def render_category_md(items: dict, limit: int) -> str:
    """Render one category's errors/warnings as a bounded markdown list.

    Shows up to `limit` errors and up to `limit` warnings, each on its own
    line, followed by an "... and N more" line if anything was truncated.
    """
    lines = []
    for msg in items["errors"][:limit]:
        lines.append(f"- :x: {msg}\n")
    for msg in items["warnings"][:limit]:
        lines.append(f"- :warning: {msg}\n")

    total = len(items["errors"]) + len(items["warnings"])
    shown = min(len(items["errors"]), limit) + min(len(items["warnings"]), limit)
    if total > shown:
        lines.append(f"- ... and {total - shown} more\n")

    return "".join(lines)


def render_grouped_summary_md(groups: dict, limit: int) -> str:
    """Render the combined summary across all categories, sorted by name."""
    lines = []
    for cat in sorted(groups.keys()):
        items = groups[cat]
        total = len(items["errors"]) + len(items["warnings"])
        lines.append(f"**{cat}** ({total} finding(s))\n")
        for msg in items["errors"][:limit]:
            lines.append(f"- {msg}\n")
        for msg in items["warnings"][:limit]:
            lines.append(f"- {msg}\n")
        shown = min(len(items["errors"]), limit) + min(len(items["warnings"]), limit)
        if total > shown:
            lines.append(f"- ... and {total - shown} more\n")
        lines.append("\n")
    return "".join(lines)


def build_manifest(groups: dict) -> dict:
    """Build the bounded {category: {errors: N, warnings: N}} manifest."""
    return {
        cat: {"errors": len(items["errors"]), "warnings": len(items["warnings"])}
        for cat, items in groups.items()
    }


def write_report(scan_data: dict, out_dir: str) -> dict:
    """Write per-category files, the combined summary, and the manifest.

    Returns the manifest dict that was written to scan-categories.json.
    """
    groups = group_by_category(scan_data)

    for cat, items in groups.items():
        cat_path = os.path.join(out_dir, f"scan-category-{cat}.md")
        with open(cat_path, "w", encoding="utf-8") as fh:
            fh.write(render_category_md(items, PER_CATEGORY_LIMIT))

    grouped_path = os.path.join(out_dir, "scan-grouped.md")
    with open(grouped_path, "w", encoding="utf-8") as fh:
        fh.write(render_grouped_summary_md(groups, SUMMARY_LIMIT))

    manifest = build_manifest(groups)
    manifest_path = os.path.join(out_dir, "scan-categories.json")
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh)

    return manifest


def main(argv: list | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 2:
        print("usage: auto_qa_report.py SCAN_JSON OUT_DIR", file=sys.stderr)
        return 2

    scan_json, out_dir = argv
    with open(scan_json, encoding="utf-8") as fh:
        scan_data = json.load(fh)

    error_count = len(scan_data.get("errors", []))
    warn_count = len(scan_data.get("warnings", []))

    write_report(scan_data, out_dir)

    output_lines = f"error_count={error_count}\nwarn_count={warn_count}\n"
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as fh:
            fh.write(output_lines)
    print(output_lines, end="")

    grouped_path = os.path.join(out_dir, "scan-grouped.md")
    with open(grouped_path, encoding="utf-8") as fh:
        grouped_md = fh.read()

    summary = (
        f"### Marketplace Auto-QA: {error_count} error(s), {warn_count} warning(s)\n"
        f"\n{grouped_md}"
    )
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as fh:
            fh.write(summary)
    else:
        print(summary)

    return 0


if __name__ == "__main__":
    sys.exit(main())
