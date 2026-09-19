"""Cover the ``if __name__ == "__main__": main()`` guard in
fuzz/fuzz_json_parser.py (line 118).

The rest of the module is pinned at 100% by
``tests/fuzz/test_fuzz_json_parser.py`` (pure fuzz body) and
``tests/fuzz/test_fuzz_json_parser_atheris_coverage.py`` (TestOneInput +
main via direct calls). Neither approach runs the module as ``__main__``,
so the bottom-of-file ``main()`` invocation stays uncovered, leaving the
target at 98%.

We hit it in-process via ``runpy.run_path(..., run_name="__main__")``
with an atheris stub installed in ``sys.modules`` so the lazy import
inside ``main()`` succeeds without pulling in the real fuzzer.

Same pattern as ``tests/scripts/test_auto_qa_report_main_guard.py`` and
``tests/test_validate_json_summary_main_guard.py``.

Regressions this test would catch:
- Dropping the ``if __name__ == "__main__": main()`` guard (the fuzz
  target file becomes non-executable; the weekly Monday 03:00 UTC
  ``fuzz.yml`` cron silently stops running the fuzzer).
- Renaming ``main`` without updating the guard.
"""
from __future__ import annotations

import runpy
import sys
import types
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
FUZZ_TARGET = REPO_ROOT / "fuzz" / "fuzz_json_parser.py"


class _NoopFDP:
    def __init__(self, _data):
        pass

    def remaining_bytes(self):
        return 0

    def ConsumeUnicodeNoSurrogates(self, _n):  # noqa: N802 — atheris naming
        return ""


def _install_atheris_stub(monkeypatch, *, setup_calls, fuzz_calls):
    stub = types.ModuleType("atheris")
    stub.FuzzedDataProvider = _NoopFDP

    def fake_setup(argv, target):
        setup_calls.append((list(argv), target))

    def fake_fuzz():
        fuzz_calls.append(1)

    stub.Setup = fake_setup
    stub.Fuzz = fake_fuzz
    monkeypatch.setitem(sys.modules, "atheris", stub)


def test_main_guard_invokes_main(monkeypatch):
    setup_calls: list[tuple[list[str], object]] = []
    fuzz_calls: list[int] = []
    _install_atheris_stub(
        monkeypatch, setup_calls=setup_calls, fuzz_calls=fuzz_calls,
    )
    monkeypatch.setattr(sys, "argv", ["fuzz_json_parser.py"])

    # Executing under run_name="__main__" makes line 118 (`main()`) fire.
    ns = runpy.run_path(str(FUZZ_TARGET), run_name="__main__")

    # The guard actually ran main(), which delegated to the atheris stub.
    assert len(setup_calls) == 1, (
        "atheris.Setup must be called exactly once by main()"
    )
    argv, target = setup_calls[0]
    # runpy rewrites argv[0] to the script path when run_name="__main__",
    # so match on basename rather than the full CLI vector.
    assert len(argv) == 1
    assert Path(argv[0]).name == "fuzz_json_parser.py"
    # main() hands atheris the module-local TestOneInput.
    assert target is ns["TestOneInput"]
    assert fuzz_calls == [1], "atheris.Fuzz must be called once after Setup"
