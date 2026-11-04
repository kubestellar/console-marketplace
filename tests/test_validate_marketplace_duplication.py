"""Tests for the jscpd duplication ratchet wired into the quality gate.

``scripts/jscpd-ratchet.mjs`` (added by #1031) was never invoked by any
CI workflow or by this validator, so it never actually gated anything.
These tests cover ``check_duplication`` in isolation and confirm it now
runs by default as part of ``--mode static``.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import subprocess
import sys
from unittest.mock import MagicMock

import pytest

from tests.conftest import load_validate_marketplace

_mod = load_validate_marketplace()


def _make_marketplace(tmp_path):
    base = tmp_path / "marketplace"
    base.mkdir()
    registry = {
        "presets": [], "themes": [], "dashboards": [],
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    (base / "registry.json").write_text(json.dumps(registry))
    return base


def _run_main(monkeypatch, argv):
    monkeypatch.setattr(sys, "argv", ["validate_marketplace.py", *argv])
    with pytest.raises(SystemExit) as excinfo:
        _mod.main()
    return excinfo.value.code


class TestCheckDuplicationUnit:
    def test_skips_when_ratchet_script_missing(self, tmp_path):
        """A synthetic/partial checkout without the ratchet script is
        skipped (noted), never treated as a failure."""
        r = _mod.Results()
        _mod.check_duplication(str(tmp_path), r)
        assert r.errors == [] and r.warnings == []
        assert any("skipping" in m for _, m in r.info)

    def test_passes_when_ratchet_exits_zero(self, tmp_path):
        (tmp_path / "scripts").mkdir()
        (tmp_path / "scripts" / "jscpd-ratchet.mjs").write_text("// stub\n")
        run = MagicMock(return_value=subprocess.CompletedProcess(
            args=[], returncode=0, stdout="jscpd ratchet: 10 clone(s) found, baseline 10\n",
            stderr="",
        ))
        r = _mod.Results()
        _mod.check_duplication(str(tmp_path), r, run=run)
        assert r.errors == []
        assert any("10 clone" in m for _, m in r.passes)

    def test_errors_when_ratchet_exits_nonzero(self, tmp_path):
        (tmp_path / "scripts").mkdir()
        (tmp_path / "scripts" / "jscpd-ratchet.mjs").write_text("// stub\n")
        run = MagicMock(return_value=subprocess.CompletedProcess(
            args=[], returncode=1,
            stdout="::error::Duplication increased: 12 clones > baseline 10.\n",
            stderr="",
        ))
        r = _mod.Results()
        _mod.check_duplication(str(tmp_path), r, run=run)
        assert len(r.errors) == 1
        assert any("Duplication increased" in m for _, m in r.errors)

    def test_warns_when_node_missing(self, tmp_path):
        (tmp_path / "scripts").mkdir()
        (tmp_path / "scripts" / "jscpd-ratchet.mjs").write_text("// stub\n")
        run = MagicMock(side_effect=FileNotFoundError("node"))
        r = _mod.Results()
        _mod.check_duplication(str(tmp_path), r, run=run)
        assert r.errors == []
        assert any("node not found" in m for _, m in r.warnings)

    def test_warns_on_timeout(self, tmp_path):
        (tmp_path / "scripts").mkdir()
        (tmp_path / "scripts" / "jscpd-ratchet.mjs").write_text("// stub\n")
        run = MagicMock(side_effect=subprocess.TimeoutExpired(cmd="node", timeout=180))
        r = _mod.Results()
        _mod.check_duplication(str(tmp_path), r, run=run)
        assert r.errors == []
        assert any("timed out" in m for _, m in r.warnings)


class TestCheckDuplicationWiredIntoStatic:
    def test_static_mode_runs_duplication_check_by_default(self, monkeypatch, tmp_path):
        """Regression guard for the gap this change closes: before this
        change, nothing in --mode static called check_duplication, so a
        PR could add unbounded duplication without the gate ever firing.
        """
        base = _make_marketplace(tmp_path)
        called = {}

        def fake_check_duplication(base_arg, results):
            called["ran"] = True
            results.ok("duplication", "stubbed")

        monkeypatch.setattr(_mod, "check_duplication", fake_check_duplication)

        code = _run_main(monkeypatch, [
            "--mode", "static",
            "--marketplace-path", str(base),
        ])
        assert code == 0
        assert called.get("ran") is True
