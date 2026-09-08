"""Unit tests for fuzz/fuzz_json_parser.py.

These tests pin the fuzz target's exception-handling contract so it cannot
silently regress: the whole point of a fuzz body is that "expected" parse
errors are swallowed and anything unexpected surfaces to the fuzzer. If
someone later adds a raise inside the field-access block, or trims the
except-tuple, the weekly Monday 03:00 UTC atheris cron would either stop
finding bugs or start producing spurious crashes — but no PR would show a
signal until the cron ran. These tests make the regression visible on the
PR.

No atheris dependency here — the pure `test_json_parsing` function is
directly exercisable with plain strings.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FUZZ_TARGET = REPO_ROOT / "fuzz" / "fuzz_json_parser.py"


def _load_fuzz_module():
    spec = importlib.util.spec_from_file_location(
        "fuzz_json_parser_under_test", FUZZ_TARGET,
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def fuzz_mod():
    return _load_fuzz_module()


# ── happy-path shapes ─────────────────────────────────────────────────────


def test_valid_registry_json_returns_cleanly(fuzz_mod):
    payload = '{"items": [{"id": "a", "type": "card", "downloadUrl": "u"}]}'
    # No return value — success is "does not raise".
    assert fuzz_mod.test_json_parsing(payload) is None


def test_valid_dashboard_json_returns_cleanly(fuzz_mod):
    payload = (
        '{"format": "grid", '
        '"cards": [{"card_type": "status", "position": {"x": 0, "y": 0}}]}'
    )
    assert fuzz_mod.test_json_parsing(payload) is None


def test_valid_preset_json_returns_cleanly(fuzz_mod):
    payload = '{"card_type": "app-status", "config": {"appName": "argo"}}'
    assert fuzz_mod.test_json_parsing(payload) is None


# ── expected-error branches (each MUST be swallowed) ─────────────────────


@pytest.mark.parametrize(
    "malformed",
    [
        "",  # empty input
        "not json at all",
        "{",  # unterminated object
        "{null: 1}",  # invalid key
        "{'single': 'quotes'}",
        "[1, 2, 3,]",  # trailing comma
        '{"items": "not a list"}',  # wrong-type inner field
        '{"items": [null, 1, "s"]}',  # non-dict items
        '{"cards": "not a list", "format": "grid"}',
        '{"format": null, "cards": [null, 42]}',
        '{"card_type": null}',
    ],
)
def test_malformed_input_never_raises(fuzz_mod, malformed):
    # The fuzz body's core contract: no matter how ugly the input, we return
    # None — atheris would flag any escaping exception as a finding.
    assert fuzz_mod.test_json_parsing(malformed) is None


def test_non_dict_toplevel_is_swallowed(fuzz_mod):
    # Lists, strings, numbers, and null at the top level are all valid JSON
    # but must not raise — the field-access block is guarded by isinstance.
    for payload in ["[1, 2, 3]", '"just a string"', "42", "null", "true"]:
        assert fuzz_mod.test_json_parsing(payload) is None


def test_recursion_error_is_in_expected_set(fuzz_mod):
    # Guard the RecursionError branch — a common atheris finding on deeply
    # nested inputs. If someone drops RecursionError from the except-tuple,
    # this test flips to a failure.
    import json as _json

    depth = sys.getrecursionlimit() + 1000
    deeply_nested = "[" * depth + "1" + "]" * depth
    # json.loads may itself raise RecursionError on this input; the fuzz
    # body must catch it.
    try:
        fuzz_mod.test_json_parsing(deeply_nested)
    except RecursionError:  # pragma: no cover — will only trip on regression
        pytest.fail("test_json_parsing let RecursionError escape")
    except _json.JSONDecodeError:  # pragma: no cover — also swallowed path
        pytest.fail("test_json_parsing let JSONDecodeError escape")


# ── unexpected-error re-raise contract ───────────────────────────────────


def test_unexpected_exception_is_reraised(fuzz_mod, monkeypatch, capsys):
    """If json.loads returned an object whose .get() raised something exotic
    (e.g. a custom SystemExit-adjacent exception), the fuzz body must NOT
    swallow it — atheris depends on that surface. Simulate by monkeypatching
    json.loads inside the module under test.
    """

    class WeirdError(Exception):
        pass

    def fake_loads(_data):
        class Trap(dict):
            def __contains__(self, _key):
                raise WeirdError("intentional")

        return Trap()

    monkeypatch.setattr(fuzz_mod.json, "loads", fake_loads)
    with pytest.raises(WeirdError):
        fuzz_mod.test_json_parsing('{"items": []}')

    # And the pre-raise `print(...)` must have happened.
    captured = capsys.readouterr()
    assert "Unexpected error: WeirdError: intentional" in captured.out


# ── module-level surface ─────────────────────────────────────────────────


def test_module_exposes_atheris_entry_points(fuzz_mod):
    # These names are part of the atheris contract — if they get renamed the
    # workflow silently stops fuzzing anything.
    assert callable(fuzz_mod.test_json_parsing)
    assert callable(fuzz_mod.TestOneInput)
    assert callable(fuzz_mod.main)
