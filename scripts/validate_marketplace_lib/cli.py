"""Argparse-based CLI entry point for the marketplace quality gate.

Extracted from ``scripts/validate-marketplace.py`` (see issue #670). This
was the one piece of that monolith the earlier extraction never actually
moved: ``validate_marketplace_lib/__init__.py``'s module list and the
shim's own docstring both already claimed a ``cli`` module existed here,
but ``main()`` — argparse setup, mode dispatch, the whole 100+ line
control flow — stayed inline in the shim.

Every check/report callable ``main`` uses is accepted as a keyword
argument defaulting to the real implementation, instead of being
imported directly by this module. That preserves what ~25 test modules
rely on: loading the shim via
``importlib.util.spec_from_file_location`` and monkeypatching a
function (e.g. ``generate_quality_table``) on *the shim's own module
namespace* before calling ``main()``. If this module imported those
names itself, re-binding the shim's copy would have no effect on the
call actually made here — the shim's thin ``main()`` wrapper passes its
own (possibly monkeypatched) module-level names through explicitly, so
the late binding still happens where tests expect it.
"""
import json
import sys
import time

from .results import Results
from .checks_schema import (
    check_json_syntax as _check_json_syntax,
    check_preset_schema as _check_preset_schema,
    check_dashboard_schema as _check_dashboard_schema,
    check_theme_schema as _check_theme_schema,
    check_naming_conventions as _check_naming_conventions,
    check_registry_consistency as _check_registry_consistency,
)
from .checks_console import (
    check_card_type_existence as _check_card_type_existence,
    check_demo_data as _check_demo_data,
    check_is_demo_data_wiring as _check_is_demo_data_wiring,
    check_consecutive_failures as _check_consecutive_failures,
    check_i18n_keys as _check_i18n_keys,
    check_cors_proxy as _check_cors_proxy,
)
from .url_safety import check_download_urls as _check_download_urls
from .report import (
    check_registry_staleness as _check_registry_staleness,
    check_theme_consistency as _check_theme_consistency,
    check_cncf_coverage as _check_cncf_coverage,
    generate_quality_table as _generate_quality_table,
)


def build_arg_parser():
    """Build the ``argparse.ArgumentParser`` for the quality gate CLI."""
    import argparse

    parser = argparse.ArgumentParser(description="Marketplace quality gate")
    parser.add_argument("--mode", choices=["static", "cross-repo", "full"],
                       default="static", help="Validation mode")
    parser.add_argument("--console-path", help="Path to console repo checkout")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--github-summary", help="Append markdown to this file")
    parser.add_argument("--marketplace-path", default=".",
                       help="Path to marketplace repo (default: current directory)")
    return parser


def main(
    *,
    check_json_syntax=_check_json_syntax,
    check_preset_schema=_check_preset_schema,
    check_dashboard_schema=_check_dashboard_schema,
    check_theme_schema=_check_theme_schema,
    check_naming_conventions=_check_naming_conventions,
    check_registry_consistency=_check_registry_consistency,
    check_card_type_existence=_check_card_type_existence,
    check_demo_data=_check_demo_data,
    check_is_demo_data_wiring=_check_is_demo_data_wiring,
    check_consecutive_failures=_check_consecutive_failures,
    check_i18n_keys=_check_i18n_keys,
    check_cors_proxy=_check_cors_proxy,
    check_download_urls=_check_download_urls,
    check_registry_staleness=_check_registry_staleness,
    check_theme_consistency=_check_theme_consistency,
    check_cncf_coverage=_check_cncf_coverage,
    generate_quality_table=_generate_quality_table,
):
    """Run the quality gate end-to-end: parse argv, run the checks for the
    requested mode, print/write the report, and ``sys.exit`` with the
    aggregated exit code.

    Every check/report callable is overridable by keyword so callers
    (namely the CLI shim and its tests) can swap in a patched
    implementation without this module importing — and thereby binding
    a stale reference to — the default.
    """
    import os

    args = build_arg_parser().parse_args()

    base = os.path.abspath(args.marketplace_path)
    results = Results()

    if args.mode in ("cross-repo", "full") and not args.console_path:
        print("ERROR: --console-path is required for cross-repo and full modes")
        sys.exit(1)

    console_path = os.path.abspath(args.console_path) if args.console_path else None

    # When --json is used, send verbose progress to stderr so stdout is clean JSON
    log = (lambda msg: print(msg, file=sys.stderr)) if args.json else print

    # ── Static checks (all modes) ──
    log("=== Static Validation ===")
    _t0 = time.perf_counter()
    check_json_syntax(base, results)
    check_preset_schema(base, results)
    check_dashboard_schema(base, results)
    check_theme_schema(base, results)
    check_naming_conventions(base, results)
    check_registry_consistency(base, results)
    results.record_timing("static", time.perf_counter() - _t0)

    # ── Cross-repo checks ──
    known_types = set()
    if args.mode in ("cross-repo", "full") and console_path:
        log("\n=== Cross-Repo Quality Checks ===")
        _t0 = time.perf_counter()
        known_types = check_card_type_existence(base, console_path, results)
        check_demo_data(base, console_path, known_types, results)
        check_is_demo_data_wiring(base, console_path, known_types, results)
        check_consecutive_failures(base, console_path, known_types, results)
        check_i18n_keys(base, console_path, known_types, results)
        check_cors_proxy(base, console_path, known_types, results)
        results.record_timing("cross-repo", time.perf_counter() - _t0)

    # ── Nightly-only checks ──
    if args.mode == "full":
        log("\n=== Nightly Checks ===")
        _t0 = time.perf_counter()
        check_download_urls(base, results)
        check_registry_staleness(base, results)
        check_theme_consistency(base, results)
        if console_path:
            check_cncf_coverage(base, console_path, results)
        results.record_timing("nightly", time.perf_counter() - _t0)

    # ── Output ──
    if args.json:
        print(json.dumps(results.to_json(), indent=2))
        # Keep stdout clean JSON; the grep-able summary line goes to stderr
        # alongside the other --json-mode progress logs (see `log` above).
        print(results.summary_line(args.mode), file=sys.stderr)
    else:
        results.print_summary()
        print(results.summary_line(args.mode))

    if args.github_summary:
        with open(args.github_summary, "a") as f:
            f.write(results.summary_md())
            if args.mode in ("cross-repo", "full") and console_path:
                table = generate_quality_table(base, console_path, known_types, results)
                if table:
                    f.write("\n" + table + "\n")

    sys.exit(results.exit_code)
