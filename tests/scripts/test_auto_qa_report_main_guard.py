"""Cover the `if __name__ == "__main__"` guard in
scripts/auto_qa_report.py:174.

The main test suite exercises ``main([...])`` directly, which never runs
the ``sys.exit(main())`` line at the module bottom. That line is the last
uncovered statement in the module (98% -> 100%). We hit it in-process via
``runpy.run_path(..., run_name='__main__')`` and assert the guarded
``sys.exit`` fires with a valid scan JSON on disk.

Same pattern used to cover ``validate_json_summary.py`` __main__
(``tests/test_validate_json_summary_main_guard.py``) and ``fuzz_summary.py``
(``tests/test_fuzz_summary_unexpected_branches.py::test_runpy_run_path_invokes_main_guard``).
"""
from __future__ import annotations

import json
import os
import runpy
import sys

import pytest


SCRIPT = os.path.normpath(
    os.path.join(
        os.path.dirname(__file__), "..", "..", "scripts", "auto_qa_report.py"
    )
)


def test_main_guard_exits_zero_on_valid_scan(tmp_path, monkeypatch):
    # A minimal valid scan.json: no errors, no warnings. main() returns 0
    # on success; we only care that line 174 executes, i.e. that
    # SystemExit was raised at all.
    scan_json = tmp_path / "scan.json"
    scan_json.write_text(json.dumps({"errors": [], "warnings": []}), encoding="utf-8")

    out_dir = tmp_path / "out"
    out_dir.mkdir()

    monkeypatch.setattr(
        sys, "argv", ["auto_qa_report.py", str(scan_json), str(out_dir)]
    )
    # Don't leak into a real GH runner if the test happens to be running there.
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
    monkeypatch.delenv("GITHUB_OUTPUT", raising=False)

    with pytest.raises(SystemExit) as excinfo:
        runpy.run_path(SCRIPT, run_name="__main__")

    # sys.exit(main()) — main returns 0 on pass, 2 on usage error. We accept
    # 0 here: the assertion under test is that the guard *ran*.
    assert excinfo.value.code == 0

    # And the guard actually produced the expected artifacts, so the
    # SystemExit came from main() completing normally, not from an
    # early crash before line 174 was reached.
    assert (out_dir / "scan-grouped.md").exists()
    assert (out_dir / "scan-categories.json").exists()
