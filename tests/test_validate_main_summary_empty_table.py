"""Cover the last branch partial in ``scripts/validate-marketplace.py``.

Branch coverage (``coverage run --branch``) leaves ``main()`` line 1237
partial: the ``if table:`` guard has both arms — the truthy arm (table
non-empty, appended to the summary) is exercised by
``test_full_mode_writes_github_summary`` in
``tests/test_validate_cross_repo_checks.py``, but the falsy arm
(``generate_quality_table`` returned ``""``) is not.

``generate_quality_table`` returns ``""`` whenever the console checkout
lacks a ``web/src/components/cards/cardRegistry.ts`` file. This happens
in practice on freshly-shallow-cloned console mirrors and is worth
exercising so a regression that changes the return type (``None`` vs
``""``, or a truthy sentinel) is caught before it double-appends
garbage to the GitHub Actions summary.

The nightly / full-mode ``if console_path:`` branch at line 1222 is
defense-in-depth against a future refactor that would allow ``full``
mode without ``console_path``: today's ``main()`` rejects that combo
at line 1183, so the ``False`` arm of the guard is unreachable via
the CLI. That path is tracked as a bead for maintainer review rather
than exercised here — patching around the argparse gate would
falsify the reachability contract the CLI advertises.

Test-only change — no production code touched.
"""
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from unittest import mock

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


def _make_marketplace(tmp_path):
    base = tmp_path / "marketplace"
    base.mkdir()
    (base / "registry.json").write_text(json.dumps({
        "presets": [], "themes": [], "dashboards": [],
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }))
    return base


def _make_console_with_registry(tmp_path):
    """Console layout WITH a minimal cardRegistry.ts so cross-repo checks
    complete cleanly. ``generate_quality_table`` is patched to return
    ``""`` at test time — this exercises the ``if table:`` False arm
    without needing to construct a shape where the real helper returns
    empty."""
    console = tmp_path / "console"
    cards_dir = console / "web/src/components/cards"
    cards_dir.mkdir(parents=True)
    # Empty but syntactically parseable registry: no cards to check.
    (cards_dir / "cardRegistry.ts").write_text(
        "import { lazy } from 'react';\n"
        "const _UNIFIED_ONLY_TYPES = [];\n"
        "export const RAW_CARD_COMPONENTS = {\n}\n"
    )
    return console


def _run_main(monkeypatch, argv):
    monkeypatch.setattr(sys, "argv", ["validate-marketplace.py", *argv])
    with pytest.raises(SystemExit) as excinfo:
        _mod.main()
    return excinfo.value.code


class TestGithubSummaryEmptyTable:
    def test_cross_repo_summary_with_empty_table_skips_append(
        self, monkeypatch, tmp_path
    ):
        """Covers the ``if table:`` False arm at line 1237.

        We patch ``generate_quality_table`` to return ``""`` so the
        summary-write path exercises the falsy arm of the guard. If a
        regression removes the guard (e.g. ``f.write("\\n" + table +
        "\\n")`` unconditionally), the summary would gain trailing
        blank lines and the "Card Quality Matrix" heading position
        would shift — this test locks the "skip append" behavior.
        """
        base = _make_marketplace(tmp_path)
        console = _make_console_with_registry(tmp_path)
        summary = tmp_path / "summary.md"

        monkeypatch.setattr(_mod, "generate_quality_table",
                            lambda *a, **kw: "")

        _run_main(monkeypatch, [
            "--mode", "cross-repo",
            "--console-path", str(console),
            "--marketplace-path", str(base),
            "--github-summary", str(summary),
        ])

        text = summary.read_text()
        assert "Marketplace Quality" in text
        # The False arm skips the append entirely: no "Card Quality
        # Matrix" heading and no trailing double-newline garbage.
        assert "Card Quality Matrix" not in text
        assert not text.endswith("\n\n\n")

    def test_generate_quality_table_returns_empty_without_registry(self, tmp_path):
        """Direct assertion that ``generate_quality_table`` returns ``""``
        for a console layout with no ``cardRegistry.ts``.

        This locks the real-world condition under which the ``if
        table:`` guard's False arm is exercised in production: a
        console checkout that is missing its card registry (e.g. a
        shallow / partial clone).
        """
        base = _make_marketplace(tmp_path)
        console = tmp_path / "console-bare"
        (console / "web/src/components/cards").mkdir(parents=True)
        # Deliberately no cardRegistry.ts.
        results = _mod.Results()
        out = _mod.generate_quality_table(str(base), str(console), set(), results)
        assert out == ""

    def test_generate_quality_table_returns_empty_without_console_path(self, tmp_path):
        """The other early-return path in ``generate_quality_table``:
        ``console_path`` is falsy. Locks the second half of the
        ``if not console_path: return ""`` guard."""
        base = _make_marketplace(tmp_path)
        results = _mod.Results()
        out = _mod.generate_quality_table(str(base), "", set(), results)
        assert out == ""


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
