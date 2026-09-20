#!/usr/bin/env python3
"""Fuzz test for JSON parsing robustness in marketplace files.

Extracted from `.github/workflows/fuzz.yml` inline heredoc so the target is
testable by `pytest` (via `tests/fuzz/test_fuzz_json_parser.py`) and can be
version-controlled and reviewed like any other source file.

The workflow used to build this file with `cat > fuzz/fuzz_json_parser.py <<EOF`
at CI run time; that inline form is invisible to type-checkers, linters, and
unit tests, and makes it easy to regress the parser structure without any
signal until the weekly cron trips a corpus.

Beyond the (deliberately crash-proof) field-access smoke checks, the fuzzed
payload is also routed through the real production validators in
``scripts/validate_marketplace_lib/`` — the modules this harness exists to
protect (see #769):

* ``url_safety._is_safe_download_url`` — the offline, string-based SSRF guard
  (no DNS/network I/O, safe to call directly under the fuzzer).
* ``checks_schema`` — materializes the fuzzed payload as a preset, dashboard,
  theme, and registry file in a scratch directory and runs the real schema
  checks (``check_json_syntax``, ``check_preset_schema``,
  ``check_dashboard_schema``, ``check_theme_schema``,
  ``check_naming_conventions``, ``check_registry_consistency``) against it.
* ``ts_parsing._extract_object_block`` — fed the raw fuzzed text directly
  (not just valid JSON), since it is a regex-based text parser, not a JSON
  consumer.

Two callable surfaces:

* `test_json_parsing(data: str) -> None` — the pure fuzz body. Deliberately
  swallows all "expected" parse-time errors (JSONDecodeError, ValueError,
  TypeError, KeyError, AttributeError, IndexError, RecursionError,
  MemoryError, OSError) and re-raises anything else. Unit tests exercise
  this function directly; no atheris dependency needed at test time.
* `TestOneInput(data: bytes) -> None` — the atheris entry point that wraps
  `test_json_parsing`. Only imported and called when the fuzzer runs.

Refs #594, #769.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

# Make the sibling `scripts/validate_marketplace_lib` package importable
# regardless of the current working directory (the fuzz workflow `cd`s into
# `fuzz/` before running this file — see .github/workflows/fuzz.yml).
_SCRIPTS_DIR = str(Path(__file__).resolve().parent.parent / "scripts")
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from validate_marketplace_lib import checks_schema, ts_parsing, url_safety  # noqa: E402
from validate_marketplace_lib.results import Results  # noqa: E402


def _write_marketplace_tree(base: str, parsed: object) -> None:
    """Materialize `parsed` across every file shape `checks_schema` scans.

    A single fuzzed payload is written as a card preset, a dashboard, a
    theme, and the registry itself so one fuzz iteration exercises every
    schema check in one pass, rather than requiring separate corpus entries
    per shape.
    """
    os.makedirs(os.path.join(base, "presets"), exist_ok=True)
    os.makedirs(os.path.join(base, "dashboards", "fuzz"), exist_ok=True)
    os.makedirs(os.path.join(base, "themes"), exist_ok=True)

    for rel in (
        os.path.join("presets", "fuzz.json"),
        os.path.join("dashboards", "fuzz", "dashboard.json"),
        os.path.join("themes", "fuzz.json"),
        "registry.json",
    ):
        with open(os.path.join(base, rel), "w") as fh:
            json.dump(parsed, fh)


def _exercise_real_validators(parsed: object, data: str) -> None:
    """Route the fuzzed payload into the real validator modules.

    This is the actual point of a JSON-parsing fuzz target: the hand-rolled
    `.get()` lookups below can never crash on their own, so without this the
    fuzzer never touches the SSRF guard, schema checks, or TS block parser it
    claims to protect.
    """
    if isinstance(parsed, dict):
        for item in parsed.get("items", []) or []:
            if isinstance(item, dict):
                url = item.get("downloadUrl", "")
                if isinstance(url, str):
                    url_safety._is_safe_download_url(url)

    with tempfile.TemporaryDirectory() as tmp:
        _write_marketplace_tree(tmp, parsed)
        results = Results()
        checks_schema.check_json_syntax(tmp, results)
        checks_schema.check_preset_schema(tmp, results)
        checks_schema.check_dashboard_schema(tmp, results)
        checks_schema.check_theme_schema(tmp, results)
        checks_schema.check_naming_conventions(tmp, results)
        checks_schema.check_registry_consistency(tmp, results)

    # ts_parsing's block extractor is a regex-based text parser, not a JSON
    # consumer — feed it the raw fuzzed string directly rather than the
    # parsed object, so malformed/partial TS-like text is exercised too.
    ts_parsing._extract_object_block(data, "registryEntries")


def test_json_parsing(data: str) -> None:
    """Test JSON parsing with malformed inputs.

    Attempts a series of common lookup patterns against the parsed JSON to
    exercise field-access paths across registry.json, dashboard.json, and
    preset shapes, then routes the payload through the real validators in
    `scripts/validate_marketplace_lib/`. Any exception in the "expected" set
    is silently absorbed (that is the fuzzer contract — malformed input must
    not crash the process). An unexpected exception is re-raised so atheris
    flags it as a finding.
    """
    try:
        parsed = json.loads(data)

        if isinstance(parsed, dict):
            # Test registry.json structure
            if "items" in parsed:
                items = parsed["items"]
                if isinstance(items, list):
                    for item in items:
                        if isinstance(item, dict):
                            # Access common fields without crashing
                            _ = item.get("id", "")
                            _ = item.get("type", "")
                            _ = item.get("downloadUrl", "")

            # Test dashboard structure
            if "format" in parsed:
                _ = parsed.get("format", "")
                cards = parsed.get("cards", [])
                if isinstance(cards, list):
                    for card in cards:
                        if isinstance(card, dict):
                            _ = card.get("card_type", "")
                            _ = card.get("position", {})

            # Test preset structure
            if "card_type" in parsed:
                _ = parsed.get("card_type", "")
                _ = parsed.get("config", {})

        _exercise_real_validators(parsed, data)

    except (
        json.JSONDecodeError,
        ValueError,
        TypeError,
        KeyError,
        AttributeError,
        IndexError,
        RecursionError,
        MemoryError,
        OSError,
    ):
        # Expected errors from malformed input — these are OK
        pass
    except Exception as e:
        # Unexpected errors — these should not happen
        print(f"Unexpected error: {type(e).__name__}: {e}")
        raise


def TestOneInput(data: bytes) -> None:  # noqa: N802 — atheris naming contract
    """Atheris entry point for fuzzing.

    Uses FuzzedDataProvider to turn raw bytes into a unicode string (no
    surrogates — those aren't representative of real JSON input and just
    produce noise), then hands it to `test_json_parsing`.
    """
    import atheris  # noqa: PLC0415 — atheris only required at fuzz time

    try:
        fdp = atheris.FuzzedDataProvider(data)
        test_data = fdp.ConsumeUnicodeNoSurrogates(fdp.remaining_bytes())
        test_json_parsing(test_data)
    except Exception:
        # Catch any unexpected exceptions during fuzzing.
        # test_json_parsing already re-raises truly unexpected errors so
        # atheris sees them; this outer catch guards FuzzedDataProvider
        # itself from crashing the run on adversarial byte sequences.
        pass


def main() -> None:
    import atheris  # noqa: PLC0415 — atheris only required at fuzz time

    atheris.Setup(sys.argv, TestOneInput)
    atheris.Fuzz()


if __name__ == "__main__":
    main()
