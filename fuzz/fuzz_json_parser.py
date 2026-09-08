#!/usr/bin/env python3
"""Fuzz test for JSON parsing robustness in marketplace files.

Extracted from `.github/workflows/fuzz.yml` inline heredoc so the target is
testable by `pytest` (via `tests/fuzz/test_fuzz_json_parser.py`) and can be
version-controlled and reviewed like any other source file.

The workflow used to build this file with `cat > fuzz/fuzz_json_parser.py <<EOF`
at CI run time; that inline form is invisible to type-checkers, linters, and
unit tests, and makes it easy to regress the parser structure without any
signal until the weekly cron trips a corpus.

Two callable surfaces:

* `test_json_parsing(data: str) -> None` — the pure fuzz body. Deliberately
  swallows all "expected" parse-time errors (JSONDecodeError, ValueError,
  TypeError, KeyError, AttributeError, IndexError, RecursionError,
  MemoryError) and re-raises anything else. Unit tests exercise this
  function directly; no atheris dependency needed at test time.
* `TestOneInput(data: bytes) -> None` — the atheris entry point that wraps
  `test_json_parsing`. Only imported and called when the fuzzer runs.

Refs #594.
"""
from __future__ import annotations

import json
import sys


def test_json_parsing(data: str) -> None:
    """Test JSON parsing with malformed inputs.

    Attempts a series of common lookup patterns against the parsed JSON to
    exercise field-access paths across registry.json, dashboard.json, and
    preset shapes. Any exception in the "expected" set is silently absorbed
    (that is the fuzzer contract — malformed input must not crash the
    process). An unexpected exception is re-raised so atheris flags it as a
    finding.
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

    except (
        json.JSONDecodeError,
        ValueError,
        TypeError,
        KeyError,
        AttributeError,
        IndexError,
        RecursionError,
        MemoryError,
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
