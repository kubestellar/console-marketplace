"""Regression guard for a previously-uncovered branch in ``main`` of
``scripts/validate-marketplace.py``.

``coverage report -m --cov-branch`` flagged one reachable branch that
no existing test hits: **static mode with --github-summary**. The
existing ``TestMain`` cases in ``test_validate_cross_repo_checks.py``
only exercise --github-summary in ``full`` mode, so the false arm of

    if args.mode in ("cross-repo", "full") and console_path:
        table = generate_quality_table(...)
        ...

inside the summary-writing block is never taken. A regression that
tried to call ``generate_quality_table`` unconditionally there would
crash for static-mode users generating a summary file — a supported
invocation for local runs and dry-runs that don't have a console
checkout on disk.

(The neighbouring 1193->1197 and 1207->1210 branches also show as
missing, but they require respectively ``full`` mode with no
``--console-path`` — early-exit at line 1160 — and a ``generate_quality_table``
that returns an empty string on a fully populated console setup;
both are effectively dead relative to the current CLI contract, so
they're not chased here.)
"""
import importlib.util
import os
from datetime import datetime, timezone

import pytest


def _load_module():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate-marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_mod = _load_module()

# Reuse the marketplace fixture helper from the neighbouring test file
# to keep the layout identical across suites.
from tests.test_validate_cross_repo_checks import _make_marketplace, _run_main


class TestStaticModeGithubSummary:
    def test_static_mode_with_summary_writes_marketplace_only_section(
        self, monkeypatch, tmp_path
    ):
        # Static mode + --github-summary reaches line 1202 (summary
        # block enters) but line 1205 (cross-repo/full guard) must go
        # to its FALSE arm — no console_path was supplied and mode is
        # neither cross-repo nor full — so the Card Quality Matrix
        # table generation is skipped. Guards the false arm of
        # ``if args.mode in ("cross-repo", "full") and console_path:``.
        base = _make_marketplace(
            tmp_path,
            registry={
                "presets": [],
                "themes": [],
                "dashboards": [],
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            },
        )
        summary = tmp_path / "summary.md"
        code = _run_main(
            monkeypatch,
            [
                "--mode", "static",
                "--marketplace-path", str(base),
                "--github-summary", str(summary),
            ],
        )
        assert code == 0
        text = summary.read_text()
        # The marketplace-only summary section is emitted.
        assert "Marketplace Quality" in text
        # The cross-repo table MUST be absent because we didn't pass
        # a console-path and the mode is static.
        assert "Card Quality Matrix" not in text
