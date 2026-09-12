"""Coverage for the atheris entry-point wrappers in fuzz/fuzz_json_parser.py.

The existing suite (test_fuzz_json_parser.py) pins the pure-Python fuzz
body (`test_json_parsing`) at 100%. The remaining uncovered lines belong
to the atheris-scoped surface — `TestOneInput` and `main` — because they
`import atheris` lazily and require the real atheris runtime to execute.

These tests install a lightweight `atheris` stub in `sys.modules` so the
lazy import succeeds without pulling in the real fuzzer, then exercise
both entry points:

- `TestOneInput` happy path (FuzzedDataProvider → ConsumeUnicodeNoSurrogates
  → test_json_parsing on the derived string).
- `TestOneInput` outer-catch path (FuzzedDataProvider itself raises — the
  wrapper must not let that escape).
- `main` (Setup + Fuzz calls happen in order and receive the expected
  arguments).

Regressions these tests would catch:
- Renaming/removing TestOneInput or main (breaks atheris contract; the
  weekly Monday 03:00 UTC fuzz.yml cron silently stops finding anything).
- Removing the outer try/except in TestOneInput (FuzzedDataProvider
  crashes on adversarial byte sequences propagate to atheris, terminating
  the fuzz run instead of counting as an ignored input).
- Dropping the ConsumeUnicodeNoSurrogates call in favor of raw bytes
  (would break atheris's surrogate-avoidance contract silently).
"""
from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FUZZ_TARGET = REPO_ROOT / "fuzz" / "fuzz_json_parser.py"


def _fresh_fuzz_module():
    """Import fuzz_json_parser.py as a fresh module each call.

    Each test may install a different atheris stub, so we can't cache the
    module — `import atheris` happens lazily inside TestOneInput/main and
    picks up whatever is in sys.modules at call time. Loading the module
    itself is cheap; only the lazy atheris resolution matters.
    """
    spec = importlib.util.spec_from_file_location(
        "fuzz_json_parser_atheris_coverage", FUZZ_TARGET,
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _FakeFDP:
    """Minimal stand-in for atheris.FuzzedDataProvider.

    Records the constructor input and returns a caller-supplied unicode
    string from ConsumeUnicodeNoSurrogates so the test can drive the fuzz
    body through a known path.
    """

    last_instance = None

    def __init__(self, data):
        self.data = data
        self.remaining = len(data)
        self.consume_calls = []
        _FakeFDP.last_instance = self

    def remaining_bytes(self):
        return self.remaining

    def ConsumeUnicodeNoSurrogates(self, n):  # noqa: N802 — atheris naming
        self.consume_calls.append(n)
        return getattr(self, "_next_string", "")


def _install_atheris_stub(monkeypatch, *, fdp_cls=_FakeFDP, setup_hook=None,
                          fuzz_hook=None):
    stub = types.ModuleType("atheris")
    stub.FuzzedDataProvider = fdp_cls
    stub.Setup = setup_hook or (lambda *_a, **_kw: None)
    stub.Fuzz = fuzz_hook or (lambda: None)
    monkeypatch.setitem(sys.modules, "atheris", stub)
    return stub


# ── TestOneInput happy path ──────────────────────────────────────────────


def test_test_one_input_forwards_consumed_string_to_fuzz_body(monkeypatch):
    """Happy path: FuzzedDataProvider consumes bytes, and the derived
    unicode string is handed to test_json_parsing, which returns cleanly.
    """
    _install_atheris_stub(monkeypatch)
    _FakeFDP.last_instance = None

    mod = _fresh_fuzz_module()

    seen = []
    real_test_json_parsing = mod.test_json_parsing
    def spy(data):
        seen.append(data)
        return real_test_json_parsing(data)

    monkeypatch.setattr(mod, "test_json_parsing", spy)

    # Prime the FDP so ConsumeUnicodeNoSurrogates returns a valid registry
    # payload — this exercises the "provider produced usable input" arm.
    payload = '{"items": [{"id": "x", "type": "card", "downloadUrl": "u"}]}'
    _FakeFDP._next_string = payload

    assert mod.TestOneInput(b"\x01\x02\x03\x04") is None
    assert _FakeFDP.last_instance is not None
    assert _FakeFDP.last_instance.data == b"\x01\x02\x03\x04"
    # remaining_bytes() was consulted, and its value drove ConsumeUnicode…
    assert _FakeFDP.last_instance.consume_calls == [4]
    # The fuzz body actually ran on the consumed string.
    assert seen == [payload]


# ── TestOneInput outer-catch path ────────────────────────────────────────


def test_test_one_input_swallows_fdp_construction_errors(monkeypatch):
    """If FuzzedDataProvider itself raises, TestOneInput must not let the
    exception escape — atheris depends on continuing across bad inputs.
    """
    class ExplodingFDP:
        def __init__(self, _data):
            raise RuntimeError("FDP boom")

    _install_atheris_stub(monkeypatch, fdp_cls=ExplodingFDP)
    mod = _fresh_fuzz_module()

    # Would raise if the outer try/except were removed. Must return None.
    assert mod.TestOneInput(b"anything") is None


def test_test_one_input_swallows_consume_errors(monkeypatch):
    """Same contract when the exception happens inside
    ConsumeUnicodeNoSurrogates — still must not escape.
    """
    class BadConsumeFDP(_FakeFDP):
        def ConsumeUnicodeNoSurrogates(self, _n):  # noqa: N802
            raise ValueError("consume boom")

    _install_atheris_stub(monkeypatch, fdp_cls=BadConsumeFDP)
    mod = _fresh_fuzz_module()

    assert mod.TestOneInput(b"anything") is None


def test_test_one_input_reraises_from_test_json_parsing_are_absorbed(
    monkeypatch,
):
    """test_json_parsing itself re-raises truly unexpected exceptions
    (that surface is covered by the sibling test file). TestOneInput's
    outer except wraps THAT path too — the atheris run continues with
    the next input rather than the process dying — so a re-raise from
    the fuzz body must also be swallowed by TestOneInput.
    """
    _install_atheris_stub(monkeypatch)
    _FakeFDP._next_string = "ignored"
    mod = _fresh_fuzz_module()

    def blow_up(_data):
        raise RuntimeError("upstream unexpected")

    monkeypatch.setattr(mod, "test_json_parsing", blow_up)

    # TestOneInput's outer except catches Exception, so RuntimeError from
    # the fuzz body is absorbed at this layer even though the body itself
    # re-raised it.
    assert mod.TestOneInput(b"payload") is None


# ── main() surface ───────────────────────────────────────────────────────


def test_main_calls_setup_then_fuzz_with_test_one_input(monkeypatch):
    """main() must hand TestOneInput to atheris.Setup and then call
    atheris.Fuzz(). Regressing either arg means the fuzz cron runs but
    fuzzes nothing.
    """
    setup_calls: list[tuple[object, object]] = []
    fuzz_calls: list[int] = []

    def fake_setup(argv, target):
        setup_calls.append((argv, target))

    def fake_fuzz():
        fuzz_calls.append(1)

    _install_atheris_stub(
        monkeypatch, setup_hook=fake_setup, fuzz_hook=fake_fuzz,
    )
    monkeypatch.setattr(sys, "argv", ["fuzz_json_parser.py"])
    mod = _fresh_fuzz_module()

    assert mod.main() is None
    assert len(setup_calls) == 1
    argv, target = setup_calls[0]
    assert argv == ["fuzz_json_parser.py"]
    # The hive contract: TestOneInput is the atheris entry point.
    assert target is mod.TestOneInput
    assert fuzz_calls == [1]


def test_main_propagates_setup_errors(monkeypatch):
    """If atheris.Setup blows up (e.g. malformed argv), main() must NOT
    swallow — the fuzz run has to fail loudly so the cron surfaces it.
    """
    def bad_setup(*_a, **_kw):
        raise RuntimeError("setup failed")

    _install_atheris_stub(monkeypatch, setup_hook=bad_setup)
    mod = _fresh_fuzz_module()

    with pytest.raises(RuntimeError, match="setup failed"):
        mod.main()
