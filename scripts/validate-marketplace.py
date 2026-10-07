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

``main()`` itself is a thin forwarder into ``validate_marketplace_lib.cli``:
it passes each check/report callable through by name rather than letting
``cli.main`` import its own defaults, so a test that monkeypatches one of
them on *this* module (e.g. ``mod.generate_quality_table``) still changes
what the run actually calls.
"""

import glob
import ipaddress
import json
import os
import re
import socket
import sys
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
    _PinnedHTTPSConnection,
    _PinnedHTTPSHandler,
    _no_redirect_opener,
    DisallowedAddressError,
    check_download_urls,
)
from validate_marketplace_lib.report import (
    check_registry_staleness,
    check_theme_consistency,
    check_cncf_coverage,
    generate_quality_table,
)
from validate_marketplace_lib import cli as _cli


def main():
    # Forward each check/report callable through by its *current* value in
    # this module's namespace (rather than letting validate_marketplace_lib.cli
    # import its own defaults), so a test that does
    # ``monkeypatch.setattr(mod, "generate_quality_table", ...)`` on this shim
    # still changes what the run actually calls.
    return _cli.main(
        check_json_syntax=check_json_syntax,
        check_preset_schema=check_preset_schema,
        check_dashboard_schema=check_dashboard_schema,
        check_theme_schema=check_theme_schema,
        check_naming_conventions=check_naming_conventions,
        check_registry_consistency=check_registry_consistency,
        check_card_type_existence=check_card_type_existence,
        check_demo_data=check_demo_data,
        check_is_demo_data_wiring=check_is_demo_data_wiring,
        check_consecutive_failures=check_consecutive_failures,
        check_i18n_keys=check_i18n_keys,
        check_cors_proxy=check_cors_proxy,
        check_download_urls=check_download_urls,
        check_registry_staleness=check_registry_staleness,
        check_theme_consistency=check_theme_consistency,
        check_cncf_coverage=check_cncf_coverage,
        generate_quality_table=generate_quality_table,
    )


if __name__ == "__main__":
    main()
