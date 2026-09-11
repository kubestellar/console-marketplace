#!/usr/bin/env python3
"""Structured CI-observability summary for the `validate-json.yml` workflow.

`validate-json.yml`'s three steps ("Validate registry.json", "Validate
dashboard files", "Validate dashboard format") only print free-text
`echo`/`print` lines today: no step writes to `$GITHUB_STEP_SUMMARY`, and
there is no single bounded, machine-readable record of what was checked.
This mirrors the gap already closed for `scripts/validate-marketplace.py`
(`MARKETPLACE_QUALITY_SUMMARY:` line) and flagged for `fuzz.yml` in
runbooks/fuzz-yml-ci-summary-gap.md. See tracking issue #621.

This module re-implements the same three checks the workflow already runs
(registry.json parses, dashboards/*/dashboard.json files parse and match the
`kc-dashboard-v1` schema, and registry entries have matching asset files) as
a standalone, unit-testable script, and emits:

  - a bounded markdown table (written to $GITHUB_STEP_SUMMARY when set, else
    stdout)
  - a single-line `VALIDATE_JSON_SUMMARY: {...}` JSON record with fixed keys
    only (registry_entries_checked, dashboards_checked, error_count,
    status) -- counts are bounded by this repo's own registry/dashboard
    file list, never by unbounded user input.

Standalone by design: this script is NOT wired into `validate-json.yml`.
Doing so requires editing a file under `.github/workflows/`, which needs
the `workflows` GitHub App permission this project's automated PRs do not
carry (confirmed blocker -- see runbooks/validate-json-ci-summary-gap.md
for the ready-to-apply diff and the same rejection already hit for
`fuzz.yml`). No exporter, metrics backend, or external data flow is added:
stdout / $GITHUB_STEP_SUMMARY only.

Usage:
    python3 scripts/validate_json_summary.py [--repo-root PATH]

Exit status: 0 if no errors were found, 1 otherwise.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from dataclasses import dataclass, field


@dataclass
class ValidationResult:
    dashboards_checked: int = 0
    registry_entries_checked: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def error_count(self) -> int:
        return len(self.errors)

    @property
    def status(self) -> str:
        return "pass" if self.error_count == 0 else "fail"


def _validate_registry_json(repo_root: str, result: ValidationResult) -> dict | None:
    """Parse registry.json; record an error and return None on failure."""
    path = os.path.join(repo_root, "registry.json")
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        result.errors.append(f"registry.json: invalid JSON ({exc})")
        return None


def _validate_dashboard_files(repo_root: str, result: ValidationResult) -> None:
    """Parse and schema-check every dashboards/*/dashboard.json file."""
    pattern = os.path.join(repo_root, "dashboards", "*", "dashboard.json")
    for path in sorted(glob.glob(pattern)):
        rel = os.path.relpath(path, repo_root)
        result.dashboards_checked += 1
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            result.errors.append(f"{rel}: invalid JSON ({exc})")
            continue

        if data.get("format") != "kc-dashboard-v1":
            result.errors.append(f"{rel}: missing or wrong 'format' field")
        if not data.get("name"):
            result.errors.append(f"{rel}: missing 'name' field")
        if not isinstance(data.get("cards"), list):
            result.errors.append(f"{rel}: missing or invalid 'cards' array")
            continue
        for i, card in enumerate(data["cards"]):
            if not card.get("card_type"):
                result.errors.append(f"{rel}: cards[{i}] missing 'card_type'")
            if not isinstance(card.get("position"), dict):
                result.errors.append(f"{rel}: cards[{i}] missing 'position'")


def _validate_registry_entries(
    repo_root: str, registry: dict, result: ValidationResult
) -> None:
    """Check registry items/presets for duplicate ids and matching asset files."""
    entries = registry.get("items", []) + registry.get("presets", [])
    seen_ids: set[str] = set()

    for item in entries:
        result.registry_entries_checked += 1
        item_id = item.get("id")
        item_type = item.get("type")

        if item_id in seen_ids:
            result.errors.append(f"duplicate registry id '{item_id}'")
        seen_ids.add(item_id)

        if item_type == "dashboard":
            expected_paths = [f"dashboards/{item_id}/dashboard.json"]
        elif item_type == "card-preset":
            expected_paths = [
                f"presets/{item_id}.json",
                f"card-presets/{item_id}.json",
            ]
        elif item_type == "theme":
            expected_paths = [f"themes/{item_id}.json"]
        else:
            expected_paths = []

        if expected_paths and not any(
            os.path.isfile(os.path.join(repo_root, p)) for p in expected_paths
        ):
            result.errors.append(
                f"registry entry '{item_id}' ({item_type}) has no matching file "
                f"in {', '.join(expected_paths)}"
            )

        url = item.get("downloadUrl", "")
        if url:
            match = re.search(r"/main/(.+)$", url)
            if match and not os.path.isfile(os.path.join(repo_root, match.group(1))):
                result.errors.append(
                    f"registry entry '{item_id}' downloadUrl path "
                    f"'{match.group(1)}' does not match any file"
                )


def run_validation(repo_root: str) -> ValidationResult:
    result = ValidationResult()
    _validate_dashboard_files(repo_root, result)
    registry = _validate_registry_json(repo_root, result)
    if registry is not None:
        _validate_registry_entries(repo_root, registry, result)
    return result


def render_summary_md(result: ValidationResult) -> str:
    lines = [
        "### Validate JSON Summary",
        "",
        "| Field | Value |",
        "|---|---|",
        f"| Registry entries checked | {result.registry_entries_checked} |",
        f"| Dashboards checked | {result.dashboards_checked} |",
        f"| Error count | {result.error_count} |",
        f"| Status | {result.status} |",
    ]
    if result.errors:
        lines.append("")
        lines.append("**Errors:**")
        for err in result.errors:
            lines.append(f"- {err}")
    return "\n".join(lines) + "\n"


def render_summary_json(result: ValidationResult) -> str:
    record = {
        "registry_entries_checked": result.registry_entries_checked,
        "dashboards_checked": result.dashboards_checked,
        "error_count": result.error_count,
        "status": result.status,
    }
    return f"VALIDATE_JSON_SUMMARY: {json.dumps(record)}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        default=os.path.normpath(os.path.join(os.path.dirname(__file__), "..")),
        help="Repository root to validate (default: parent of scripts/).",
    )
    args = parser.parse_args(argv)

    result = run_validation(args.repo_root)

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
