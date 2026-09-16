"""Marketplace quality gate — implementation package.

This package holds the implementation split out of the historical
``scripts/validate-marketplace.py`` monolith (see issue #670). The CLI
script re-exports every public (and a few "private but test-covered")
name from here so that its own module namespace is unchanged for
callers and for the ~25 test modules that load it via
``importlib.util.spec_from_file_location``.

Modules, grouped by concern:
  results        — ``Results`` tracking/reporting class, SUMMARY_PREFIX
  ts_parsing     — TS/registry/descriptor parsing helpers
  checks_schema  — JSON schema/structure checks (static mode)
  checks_console — console cross-repo consistency checks
  url_safety     — SSRF-safe download URL validation
  report         — quality table + theme/registry/CNCF drift reports
  cli            — argparse-based ``main()`` entry point
"""
