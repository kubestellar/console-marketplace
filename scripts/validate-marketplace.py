#!/usr/bin/env python3
"""
Marketplace quality gate — validates card presets, dashboards, themes,
and registry.json against the kubestellar/console card registry.

Usage:
  python3 scripts/validate-marketplace.py --mode static
  python3 scripts/validate-marketplace.py --mode cross-repo --console-path ./console
  python3 scripts/validate-marketplace.py --mode full --console-path ./console

Modes:
  static      JSON schema, naming conventions, grid validity, registry consistency
  cross-repo  static + card_type existence, demo data, isDemoData wiring,
              consecutiveFailures, i18n keys, CORS proxy compliance
  full        cross-repo + downloadUrl reachability, drift detection,
              registry staleness, CNCF coverage, theme consistency

This file is a thin CLI shim. The implementation lives in
``scripts/validate_marketplace_lib/`` (see issue #670), split by concern
into ``results``, ``ts_parsing``, ``checks_schema``, ``checks_console``,
``url_safety``, ``report``, and ``cli``. Every public (and test-covered
private) name from those modules is re-exported here unchanged, since
~25 test modules under ``tests/`` load this file directly via
``importlib.util.spec_from_file_location`` and reach into its namespace
(e.g. ``mod.check_preset_schema``, ``mod.Results``, ``mod.glob``).
"""

import argparse
import glob
import ipaddress
import json
import os
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

# Make the sibling implementation package importable regardless of the
# current working directory or how this script is loaded (normal import,
# or importlib.util.spec_from_file_location as done by the test suite).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from validate_marketplace_lib.results import Results, SUMMARY_PREFIX
from validate_marketplace_lib.ts_parsing import (
    load_json,
    find_json_files,
    _extract_object_block,
    parse_card_registry,
    parse_card_descriptors,
    parse_sub_registry_categories,
    get_all_console_card_types,
    parse_lazy_imports,
    parse_card_type_to_component,
)
from validate_marketplace_lib.checks_schema import (
    check_json_syntax,
    check_preset_schema,
    check_dashboard_schema,
    check_theme_schema,
    check_naming_conventions,
    get_registry_entries,
    check_registry_consistency,
    get_all_marketplace_card_types,
)
from validate_marketplace_lib.checks_console import (
    check_card_type_existence,
    check_demo_data,
    check_is_demo_data_wiring,
    check_consecutive_failures,
    check_i18n_keys,
    check_cors_proxy,
)
from validate_marketplace_lib.url_safety import (
    _is_safe_download_url,
    _classify_ip_literal,
    _is_safe_resolved_host,
    _NoRedirectHandler,
    _no_redirect_opener,
    check_download_urls,
)
from validate_marketplace_lib.report import (
    check_registry_staleness,
    check_theme_consistency,
    check_cncf_coverage,
    generate_quality_table,
)


def main():
    parser = argparse.ArgumentParser(description="Marketplace quality gate")
    parser.add_argument("--mode", choices=["static", "cross-repo", "full"],
                       default="static", help="Validation mode")
    parser.add_argument("--console-path", help="Path to console repo checkout")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--github-summary", help="Append markdown to this file")
    parser.add_argument("--marketplace-path", default=".",
                       help="Path to marketplace repo (default: current directory)")
    args = parser.parse_args()

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


if __name__ == "__main__":
    main()
