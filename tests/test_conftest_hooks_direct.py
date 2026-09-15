"""Direct-invocation tests for the ``conftest.py`` pytest hooks that emit
the CI-observability summary.

The existing ``test_conftest_summary.py`` covers the pure helpers
(``build_summary_record``, ``format_step_summary_markdown``) but skips
``pytest_sessionfinish`` and ``pytest_terminal_summary`` themselves — the
comment there notes it deliberately avoids "spawning a nested pytest
session". Those hooks are exactly the code path CI depends on:

* ``pytest_sessionfinish`` prints the grep-able
  ``PYTHON_UNIT_TESTS_SUMMARY:`` marker to stdout and appends the
  Markdown table to ``$GITHUB_STEP_SUMMARY``.
* ``pytest_terminal_summary`` snapshots stats onto ``config`` for the
  primary path; if it misfires, ``pytest_sessionfinish`` must fall back
  to the terminal reporter directly.

These tests exercise both hooks by calling them with lightweight
``SimpleNamespace``/dict stand-ins for pytest's session/config/
terminalreporter — no nested pytest, still fast.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace

REPO_ROOT = Path(__file__).resolve().parents[1]
CONFTEST_PATH = REPO_ROOT / "conftest.py"


def _load_conftest():
    spec = importlib.util.spec_from_file_location("root_conftest_hooks_under_test", CONFTEST_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


conftest = _load_conftest()


def _fake_terminalreporter(stats):
    return SimpleNamespace(stats=stats)


def _fake_session(config):
    return SimpleNamespace(config=config)


def _fake_config_with_counts(counts=None, terminalreporter=None):
    """Build a stand-in for pytest's ``config`` object.

    ``config._python_unit_tests_summary_counts`` is what the primary path
    of ``pytest_sessionfinish`` reads; ``config.pluginmanager.get_plugin``
    is what the fallback path reads. Either or both may be supplied.
    """
    class _PluginManager:
        def __init__(self, tr):
            self._tr = tr
        def get_plugin(self, name):
            if name == "terminalreporter":
                return self._tr
            return None

    cfg = SimpleNamespace(pluginmanager=_PluginManager(terminalreporter))
    if counts is not None:
        cfg._python_unit_tests_summary_counts = counts
    return cfg


# ---------------------------------------------------------------------------
# pytest_terminal_summary
# ---------------------------------------------------------------------------


class TestPytestTerminalSummary:
    def test_snapshots_all_known_outcome_buckets_onto_config(self):
        tr = _fake_terminalreporter({
            "passed": [object(), object(), object()],
            "failed": [object()],
            "skipped": [object(), object()],
            "error": [object()],
            "xfailed": [object()],
            "xpassed": [],
        })
        cfg = _fake_config_with_counts()

        conftest.pytest_terminal_summary(tr, exitstatus=1, config=cfg)

        assert cfg._python_unit_tests_summary_counts == {
            "passed": 3,
            "failed": 1,
            "skipped": 2,
            "errors": 1,
            "xfailed": 1,
            "xpassed": 0,
        }

    def test_missing_buckets_default_to_zero(self):
        # A collection-only run may leave several stats buckets absent.
        tr = _fake_terminalreporter({"passed": [object()]})
        cfg = _fake_config_with_counts()

        conftest.pytest_terminal_summary(tr, exitstatus=0, config=cfg)

        assert cfg._python_unit_tests_summary_counts == {
            "passed": 1,
            "failed": 0,
            "skipped": 0,
            "errors": 0,
            "xfailed": 0,
            "xpassed": 0,
        }

    def test_maps_pytest_error_bucket_to_summary_errors_key(self):
        # Pytest's stats key is ``error`` (singular); the summary key is
        # ``errors`` (plural). Guard the rename.
        tr = _fake_terminalreporter({"error": [object(), object()]})
        cfg = _fake_config_with_counts()

        conftest.pytest_terminal_summary(tr, exitstatus=1, config=cfg)

        assert cfg._python_unit_tests_summary_counts["errors"] == 2
        assert "error" not in cfg._python_unit_tests_summary_counts


# ---------------------------------------------------------------------------
# pytest_sessionfinish — primary path (counts pre-snapshotted on config)
# ---------------------------------------------------------------------------


class TestPytestSessionfinishPrimaryPath:
    def test_prints_grepable_summary_prefix_with_json_payload(self, capsys, monkeypatch):
        monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
        cfg = _fake_config_with_counts(
            counts={"passed": 5, "failed": 0, "skipped": 0, "errors": 0}
        )
        session = _fake_session(cfg)

        conftest.pytest_sessionfinish(session, exitstatus=0)

        out = capsys.readouterr().out
        assert conftest.SUMMARY_PREFIX in out
        prefix_line = next(l for l in out.splitlines() if l.startswith(conftest.SUMMARY_PREFIX))
        payload = json.loads(prefix_line[len(conftest.SUMMARY_PREFIX):].strip())
        assert payload["passed"] == 5
        assert payload["total"] == 5
        assert payload["exit_status"] == 0
        assert payload["overall_status"] == "pass"

    def test_appends_markdown_table_to_github_step_summary_when_env_set(self, tmp_path, capsys, monkeypatch):
        step_summary = tmp_path / "step-summary.md"
        step_summary.write_text("pre-existing content\n", encoding="utf-8")
        monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(step_summary))

        cfg = _fake_config_with_counts(
            counts={"passed": 2, "failed": 1, "skipped": 0, "errors": 0}
        )
        session = _fake_session(cfg)

        conftest.pytest_sessionfinish(session, exitstatus=1)

        written = step_summary.read_text(encoding="utf-8")
        assert written.startswith("pre-existing content\n")  # appended, not truncated
        assert "### Python Unit Tests Summary" in written
        assert "| Passed | 2 |" in written
        assert "| Failed | 1 |" in written
        assert "| Overall status | fail |" in written

    def test_skips_github_step_summary_write_when_env_var_absent(self, capsys, monkeypatch):
        monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
        cfg = _fake_config_with_counts(counts={"passed": 1})
        session = _fake_session(cfg)

        # Must not raise even though no file is available.
        conftest.pytest_sessionfinish(session, exitstatus=0)
        # Sanity: the stdout marker was still emitted.
        assert conftest.SUMMARY_PREFIX in capsys.readouterr().out

    def test_reflects_nonzero_exit_status_in_overall_status_field(self, capsys, monkeypatch):
        monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
        cfg = _fake_config_with_counts(counts={"passed": 0, "failed": 3})
        session = _fake_session(cfg)

        conftest.pytest_sessionfinish(session, exitstatus=1)

        prefix_line = next(
            l for l in capsys.readouterr().out.splitlines()
            if l.startswith(conftest.SUMMARY_PREFIX)
        )
        payload = json.loads(prefix_line[len(conftest.SUMMARY_PREFIX):].strip())
        assert payload["exit_status"] == 1
        assert payload["overall_status"] == "fail"


# ---------------------------------------------------------------------------
# pytest_sessionfinish — fallback path (counts absent, use terminalreporter)
# ---------------------------------------------------------------------------


class TestPytestSessionfinishFallbackPath:
    def test_derives_counts_from_terminalreporter_stats_when_config_snapshot_absent(self, capsys, monkeypatch):
        monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
        tr = _fake_terminalreporter({
            "passed": [object(), object()],
            "failed": [object()],
            "error": [object()],  # pytest's singular key
        })
        # No counts pre-set on config -> falls back to terminalreporter.
        cfg = _fake_config_with_counts(counts=None, terminalreporter=tr)
        session = _fake_session(cfg)

        conftest.pytest_sessionfinish(session, exitstatus=1)

        prefix_line = next(
            l for l in capsys.readouterr().out.splitlines()
            if l.startswith(conftest.SUMMARY_PREFIX)
        )
        payload = json.loads(prefix_line[len(conftest.SUMMARY_PREFIX):].strip())
        assert payload["passed"] == 2
        assert payload["failed"] == 1
        assert payload["errors"] == 1
        assert payload["total"] == 4

    def test_fallback_treats_absent_terminalreporter_plugin_as_zero_counts(self, capsys, monkeypatch):
        monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
        # counts empty AND pluginmanager.get_plugin("terminalreporter") returns None
        cfg = _fake_config_with_counts(counts=None, terminalreporter=None)
        session = _fake_session(cfg)

        conftest.pytest_sessionfinish(session, exitstatus=0)

        prefix_line = next(
            l for l in capsys.readouterr().out.splitlines()
            if l.startswith(conftest.SUMMARY_PREFIX)
        )
        payload = json.loads(prefix_line[len(conftest.SUMMARY_PREFIX):].strip())
        for key in ("passed", "failed", "skipped", "errors", "xfailed", "xpassed"):
            assert payload[key] == 0
        assert payload["total"] == 0

    def test_fallback_tolerates_terminalreporter_without_stats_attribute(self, capsys, monkeypatch):
        monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
        # A terminalreporter stand-in that lacks .stats — the hook uses
        # getattr(..., "stats", {}) so this must not raise.
        tr_no_stats = SimpleNamespace()
        cfg = _fake_config_with_counts(counts=None, terminalreporter=tr_no_stats)
        session = _fake_session(cfg)

        conftest.pytest_sessionfinish(session, exitstatus=0)

        prefix_line = next(
            l for l in capsys.readouterr().out.splitlines()
            if l.startswith(conftest.SUMMARY_PREFIX)
        )
        payload = json.loads(prefix_line[len(conftest.SUMMARY_PREFIX):].strip())
        assert payload["total"] == 0
