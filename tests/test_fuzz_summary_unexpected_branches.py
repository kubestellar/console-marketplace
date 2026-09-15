"""Extra unit tests for scripts/fuzz_summary.py — targeting the
uncovered "unexpected exception" branches that the existing
tests/test_fuzz_summary.py leaves as gaps.

The existing suite covers the happy-path fuzzer flow (valid corpus files
pass, malformed corpus files count as failures, edge cases with expected
error classes are silently absorbed). What it doesn't reach is the
mirror-image path — the four `except Exception: anomaly = True` /
`edge_case_failed += 1` blocks that fire only when `json.loads` raises
something OUTSIDE `EXPECTED_JSON_ERRORS`. Those blocks are the whole
reason `_mutation_anomaly` and `run_edge_cases` exist: they surface
crashes atheris' TestOneInput would report as findings. Leaving them
uncovered means any refactor of the exception-classification logic can
regress the anomaly detector into a silent pass. The `__main__` guard
that dispatches `main()` was also uncovered.

Uncovered lines closed (per `pytest --cov=scripts/fuzz_summary.py`):

  127-128  — _mutation_anomaly truncation loop, unexpected error branch
  134-135  — _mutation_anomaly append/prepend mutations, unexpected branch
  153-154  — run_corpus_fuzzing, mutation-anomaly-on-valid-file branch
  162-166  — run_edge_cases, unexpected error branch
  240      — sys.exit(main()) __main__ guard
"""
import importlib.util
import json
import os
import runpy
import sys

import pytest


def _load_module():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "fuzz_summary_extra",
        os.path.join(scripts_dir, "fuzz_summary.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


_mod = _load_module()


class _RaisingJson:
    """Stand-in for the module-local `json` binding whose `loads` raises
    an exception outside EXPECTED_JSON_ERRORS on every call — SystemError
    is deliberately not in the EXPECTED_JSON_ERRORS tuple. Everything
    else on the stdlib `json` module (JSONDecodeError, dumps, etc.) is
    forwarded so unrelated call sites in the module keep working."""

    JSONDecodeError = json.JSONDecodeError

    @staticmethod
    def loads(_text):
        raise SystemError("simulated fuzz crash outside EXPECTED_JSON_ERRORS")

    @staticmethod
    def dumps(*a, **kw):
        return json.dumps(*a, **kw)


# ── _mutation_anomaly: two unexpected-exception branches ────────────────


class TestMutationAnomalyUnexpectedError:
    def test_truncation_loop_unexpected_exception_flags_anomaly(self, monkeypatch):
        # Content longer than 10 chars enters the truncation loop.
        content = json.dumps({"payload": "x" * 20})
        monkeypatch.setattr(_mod, "json", _RaisingJson)
        assert _mod._mutation_anomaly(content) is True

    def test_short_content_still_hits_append_prepend_unexpected_branch(self, monkeypatch):
        # <=10 chars skips the truncation loop entirely, so this exercises
        # ONLY the second (append/prepend) unexpected-branch — proving the
        # 134-135 branch is reached on its own without piggy-backing on
        # the truncation branch.
        content = "{}"
        monkeypatch.setattr(_mod, "json", _RaisingJson)
        assert _mod._mutation_anomaly(content) is True


# ── run_corpus_fuzzing: mutation-anomaly-on-valid-file branch ───────────


class TestCorpusFuzzingMutationAnomalyBranch:
    def test_valid_json_with_forced_mutation_anomaly_is_recorded_as_failure(self, tmp_path, monkeypatch):
        # File itself parses cleanly (so the OSError/JSONDecodeError
        # branch is NOT taken) but the injected _mutation_anomaly forces
        # the second failure branch — the exact branch that fires when a
        # real fuzz mutation surfaces a crash outside the expected error
        # classes.
        root = str(tmp_path)
        os.makedirs(os.path.join(root, "dashboards", "sre"), exist_ok=True)
        with open(os.path.join(root, "registry.json"), "w", encoding="utf-8") as fh:
            fh.write(json.dumps({"items": []}))

        monkeypatch.setattr(_mod, "_mutation_anomaly", lambda _content: True)

        result = _mod.FuzzResult()
        _mod.run_corpus_fuzzing(root, result)

        assert result.corpus_count == 1
        assert result.corpus_failed == 1
        assert len(result.errors) == 1
        assert "registry.json" in result.errors[0]
        assert "mutation testing raised an unexpected error" in result.errors[0]


# ── run_edge_cases: unexpected-exception branch ─────────────────────────


class TestEdgeCasesUnexpectedError:
    def test_unexpected_exception_on_edge_case_increments_failure_and_records_type(self, monkeypatch):
        monkeypatch.setattr(_mod, "json", _RaisingJson)

        result = _mod.FuzzResult()
        _mod.run_edge_cases(result)

        # Every edge case triggers the unexpected-exception branch, so
        # both the count and the failed count equal the fixed EDGE_CASES
        # length.
        assert result.edge_case_count == len(_mod.EDGE_CASES)
        assert result.edge_case_failed == len(_mod.EDGE_CASES)
        # The message shape is stable — it names the exception class so a
        # human reading the summary knows what fired. SystemError is what
        # _RaisingJson raises.
        assert result.errors, "expected error messages to be recorded"
        assert all("SystemError" in msg for msg in result.errors)
        assert result.status == "fail"

    def test_expected_json_error_on_edge_case_is_silently_absorbed(self, monkeypatch):
        # Force json.loads to raise ValueError (a member of
        # EXPECTED_JSON_ERRORS) so every edge case hits the pass branch,
        # not the unexpected-exception branch. This is the mirror of the
        # test above and closes the last remaining uncovered line in the
        # run_edge_cases except-clause.
        class _ExpectedRaisingJson:
            JSONDecodeError = json.JSONDecodeError

            @staticmethod
            def loads(_text):
                raise ValueError("expected JSON error class")

            @staticmethod
            def dumps(*a, **kw):
                return json.dumps(*a, **kw)

        monkeypatch.setattr(_mod, "json", _ExpectedRaisingJson)

        result = _mod.FuzzResult()
        _mod.run_edge_cases(result)

        assert result.edge_case_count == len(_mod.EDGE_CASES)
        # Absorbed as expected — no failures, no error messages.
        assert result.edge_case_failed == 0
        assert result.errors == []


# ── __main__ guard ──────────────────────────────────────────────────────


class TestMainGuard:
    def test_runpy_run_path_invokes_main_guard(self, tmp_path, monkeypatch):
        # runpy.run_path executes the file under `__name__ == "__main__"`,
        # which is the branch at fuzz_summary.py:240 (sys.exit(main())).
        # Point --repo-root at an empty tmp_path so main() has zero
        # corpus files and the still-fixed edge-case list to iterate, and
        # give it a --fuzzer-status so status is deterministic. main()
        # returns 0 for a clean run, which sys.exit(...) then wraps in a
        # SystemExit.
        scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
        script = os.path.join(scripts_dir, "fuzz_summary.py")

        # Neutralise $GITHUB_STEP_SUMMARY so the module prints to stdout,
        # matching the standalone-run contract.
        monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
        monkeypatch.setattr(
            sys,
            "argv",
            ["fuzz_summary.py", "--repo-root", str(tmp_path), "--fuzzer-status", "pass"],
        )

        with pytest.raises(SystemExit) as excinfo:
            runpy.run_path(script, run_name="__main__")

        assert excinfo.value.code == 0
