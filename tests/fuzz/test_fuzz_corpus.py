"""Corpus regression tests for fuzz/fuzz_json_parser.py.

Every `*.json` file under `fuzz/corpus/` MUST be swallowed cleanly by
`test_json_parsing()`. That is the whole contract of a seed corpus: real
marketplace shapes (dashboards, presets, registry) plus known type-mismatch
edge cases go in, and the fuzz body's expected-error handler catches them
all — never re-raising.

If a future refactor of the fuzz target starts raising on any of these
shapes, the weekly Monday 03:00 UTC atheris cron would either mask it (with
the `|| true` swallow) or surface a spurious crash. These tests make the
regression visible in the PR diff, before the cron runs.

Refs #635 rec #5 (unit-test the fuzz target against the corpus). Pairs with
`fuzz/corpus/` (added in the same PR).
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FUZZ_TARGET = REPO_ROOT / "fuzz" / "fuzz_json_parser.py"
CORPUS_DIR = REPO_ROOT / "fuzz" / "corpus"


def _load_fuzz_module():
    spec = importlib.util.spec_from_file_location(
        "fuzz_json_parser_under_corpus_test", FUZZ_TARGET,
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def fuzz_mod():
    return _load_fuzz_module()


def _corpus_files():
    if not CORPUS_DIR.is_dir():
        return []
    return sorted(CORPUS_DIR.glob("*.json"))


def test_corpus_directory_is_populated():
    files = _corpus_files()
    assert files, (
        f"expected at least one *.json seed under {CORPUS_DIR}; "
        "an empty corpus defeats the whole point of seeding atheris"
    )
    # Cheap sanity: no zero-byte files. A 0-byte JSON file is a common
    # mistake when copying seeds and would make the corpus-consumer here
    # pass on a decode-error path that the real fuzz cron cannot hit.
    zero = [p.name for p in files if p.stat().st_size == 0]
    assert not zero, f"corpus contains zero-byte files: {zero}"


@pytest.mark.parametrize(
    "corpus_file",
    _corpus_files(),
    ids=lambda p: p.name,
)
def test_corpus_file_is_swallowed(fuzz_mod, corpus_file):
    """Every seed file must be swallowed cleanly by test_json_parsing()."""
    payload = corpus_file.read_text(encoding="utf-8")
    # Contract: returns None, never raises for the expected-error set.
    assert fuzz_mod.test_json_parsing(payload) is None


@pytest.mark.parametrize(
    "corpus_file",
    _corpus_files(),
    ids=lambda p: p.name,
)
def test_corpus_file_is_valid_json_or_intentionally_malformed(corpus_file):
    """Seed files must be either valid JSON or explicitly marked as an
    edge/malformed sample by filename prefix (`edge_`).

    Silently-broken seeds are worse than no seed: they make the swallow
    test pass on a decode-error path rather than exercising real field
    access, which is what the fuzz target's later branches are testing.
    """
    import json as _json

    payload = corpus_file.read_text(encoding="utf-8")
    if corpus_file.name.startswith("edge_"):
        # Edge samples may or may not be valid JSON — either is fine.
        return
    try:
        _json.loads(payload)
    except _json.JSONDecodeError as e:
        pytest.fail(
            f"{corpus_file.name} is not valid JSON and is not named with "
            f"the 'edge_' prefix: {e}"
        )
