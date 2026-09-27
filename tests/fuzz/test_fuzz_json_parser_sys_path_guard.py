"""Cover the ``sys.path`` bootstrap guard at fuzz/fuzz_json_parser.py:53-54.

The fuzz target lives under ``fuzz/`` but imports the real production
validators from ``scripts/validate_marketplace_lib/`` — the whole point of
the harness (see #769). The ``.github/workflows/fuzz.yml`` step ``cd``s
into ``fuzz/`` before invoking ``python fuzz_json_parser.py``, so unless
the module actively prepends ``../scripts`` to ``sys.path`` at import
time, the ``from validate_marketplace_lib import ...`` line at module
scope raises ``ModuleNotFoundError`` and the weekly Monday 03:00 UTC
fuzzer silently stops running — no PR would show a signal until the cron.

The rest of ``fuzz_json_parser.py`` is pinned at 100% by the sibling
test files, but the two-line guard::

    if _SCRIPTS_DIR not in sys.path:
        sys.path.insert(0, _SCRIPTS_DIR)

stays at 98% under ``pytest tests/`` because by the time the first fuzz
test imports the module, other tests in the same session (e.g.
``tests/test_validate_marketplace.py``) have already inserted
``scripts/`` into ``sys.path``, so the True arm of the ``if`` (the actual
``sys.path.insert`` call) is never taken. This file exercises both arms
in-process by controlling ``sys.path`` before each fresh import.

Regressions this test would catch:
- Removing the ``sys.path.insert`` (or the guard around it): the fuzz
  workflow's ``cd fuzz`` invocation would raise ``ModuleNotFoundError``
  at import time, silently disabling the weekly cron.
- Changing ``_SCRIPTS_DIR`` to a wrong path (e.g. dropping the
  ``.parent.parent``): the fuzz harness would still import from an
  already-present ``scripts/`` in ``sys.path`` under ``pytest tests/``
  but break under ``cd fuzz`` in CI.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FUZZ_TARGET = REPO_ROOT / "fuzz" / "fuzz_json_parser.py"
SCRIPTS_DIR = str(REPO_ROOT / "scripts")


def _fresh_fuzz_module(name: str):
    spec = importlib.util.spec_from_file_location(name, FUZZ_TARGET)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_import_inserts_scripts_dir_when_missing(monkeypatch):
    """True arm of the guard: scripts/ absent from sys.path → insert."""
    filtered = [p for p in sys.path if p != SCRIPTS_DIR]
    monkeypatch.setattr(sys, "path", filtered)
    assert SCRIPTS_DIR not in sys.path

    _fresh_fuzz_module("fuzz_json_parser_guard_insert")

    # The module's top-level `sys.path.insert(0, _SCRIPTS_DIR)` executed.
    assert sys.path[0] == SCRIPTS_DIR


def test_import_skips_insert_when_scripts_dir_already_present(monkeypatch):
    """False arm of the guard: scripts/ already in sys.path → no insert."""
    # Start from a known-good baseline with exactly one occurrence of
    # SCRIPTS_DIR so we can assert the module did NOT add a duplicate.
    baseline = [p for p in sys.path if p != SCRIPTS_DIR]
    baseline.insert(0, SCRIPTS_DIR)
    monkeypatch.setattr(sys, "path", baseline)
    assert sys.path.count(SCRIPTS_DIR) == 1

    _fresh_fuzz_module("fuzz_json_parser_guard_skip")

    # Guard's False arm ran: no duplicate insert.
    assert sys.path.count(SCRIPTS_DIR) == 1
