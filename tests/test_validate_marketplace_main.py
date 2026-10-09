"""CLI entrypoint and report rendering for ``scripts/validate_marketplace.py``.

Covers ``main`` in static and full modes, the ``GITHUB_STEP_SUMMARY``
output (including the empty-table path), ``generate_quality_table`` and
running the script as ``__main__``.
"""
from datetime import datetime, timezone
import importlib.util
from io import BytesIO
import json
import os
import runpy
import socket
import sys
from unittest import mock
import unittest
from unittest.mock import MagicMock, patch
import urllib.error
import urllib.request

# Reuse the marketplace fixture helper from the neighbouring test file
# to keep the layout identical across suites.
from tests.conftest_cross_repo import _make_marketplace, _run_main
import pytest

from tests.conftest import load_validate_marketplace


# ── helpers from test_validate_main_summary_empty_table.py ──
def _load_module():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate_marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

_mod_empty = _load_module()

def _make_marketplace(tmp_path, registry=None):
    base = tmp_path / "marketplace"
    base.mkdir()
    if registry is None:
        registry = {
            "presets": [], "themes": [], "dashboards": [],
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
    (base / "registry.json").write_text(json.dumps(registry))
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
    monkeypatch.setattr(sys, "argv", ["validate_marketplace.py", *argv])
    with pytest.raises(SystemExit) as excinfo:
        _mod_empty.main()
    return excinfo.value.code


# ── helpers from test_validate_ssrf_dns_and_report.py ──
_mod_dns = load_validate_marketplace()

generate_quality_table = _mod_dns.generate_quality_table

Results_dns = _mod_dns.Results


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

        monkeypatch.setattr(_mod_empty, "generate_quality_table",
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
        results = _mod_empty.Results()
        out = _mod_empty.generate_quality_table(str(base), str(console), set(), results)
        assert out == ""

    def test_generate_quality_table_returns_empty_without_console_path(self, tmp_path):
        """The other early-return path in ``generate_quality_table``:
        ``console_path`` is falsy. Locks the second half of the
        ``if not console_path: return ""`` guard."""
        base = _make_marketplace(tmp_path)
        results = _mod_empty.Results()
        out = _mod_empty.generate_quality_table(str(base), "", set(), results)
        assert out == ""


class TestScriptAsMain(unittest.TestCase):
    """Exercise the ``if __name__ == "__main__": main()`` entrypoint.

    ``main()`` calls ``sys.exit`` internally; we catch it so pytest keeps
    running.  ``runpy.run_path`` executes the file in-process, so coverage
    instrumentation records the final line — a subprocess would not.
    """

    def test_run_path_executes_main_module(self):
        script = os.path.join(os.path.dirname(__file__), "..",
                              "scripts", "validate_marketplace.py")

        import tempfile
        import pathlib
        with tempfile.TemporaryDirectory() as td:
            base = pathlib.Path(td)
            # Minimal fixture so main() has something to open and exits cleanly.
            (base / "registry.json").write_text('{"entries": []}')
            (base / "presets").mkdir()
            (base / "dashboards").mkdir()
            (base / "themes").mkdir()
            (base / "yaml").mkdir()

            cwd = os.getcwd()
            os.chdir(str(base))
            try:
                try:
                    runpy.run_path(os.path.abspath(script),
                                   run_name="__main__")
                except SystemExit:
                    # main() exits with 0 or 1 depending on findings; either
                    # value means the ``main()`` line ran.
                    pass
            finally:
                os.chdir(cwd)


class TestGenerateQualityTable(unittest.TestCase):

    def test_empty_when_console_path_missing(self):
        results = Results_dns()
        out = generate_quality_table("/some/base", "", set(), results)
        self.assertEqual(out, "")

    def test_empty_when_registry_ts_absent(self):
        import tempfile
        with tempfile.TemporaryDirectory() as base:
            with tempfile.TemporaryDirectory() as console_path:
                results = Results_dns()
                out = generate_quality_table(base, console_path, set(), results)
                self.assertEqual(out, "")

    def test_header_and_row_rendered_when_card_type_present(self):
        import tempfile
        import json
        with tempfile.TemporaryDirectory() as base:
            with tempfile.TemporaryDirectory() as console_path:
                # Create cardRegistry.ts so the path check passes
                cards_dir = os.path.join(console_path, "web", "src", "components", "cards")
                os.makedirs(cards_dir, exist_ok=True)
                with open(os.path.join(cards_dir, "cardRegistry.ts"), "w") as f:
                    f.write("// registry\n")

                # get_all_marketplace_card_types reads from preset JSON files
                presets_dir = os.path.join(base, "presets")
                os.makedirs(presets_dir, exist_ok=True)
                with open(os.path.join(presets_dir, "p1.json"), "w") as f:
                    json.dump({"card_type": "events"}, f)

                results = Results_dns()
                out = generate_quality_table(base, console_path, {"events"}, results)
                self.assertIn("Card Quality Matrix", out)
                self.assertIn("`events`", out)

    def test_n_marking_for_demo_data_warning(self):
        """When results carries a demo-data warning mentioning a card type,
        the demo_data column shows 'N'."""
        import tempfile
        import json
        with tempfile.TemporaryDirectory() as base:
            with tempfile.TemporaryDirectory() as console_path:
                cards_dir = os.path.join(console_path, "web", "src", "components", "cards")
                os.makedirs(cards_dir, exist_ok=True)
                with open(os.path.join(cards_dir, "cardRegistry.ts"), "w") as f:
                    f.write("// registry\n")

                registry = {"items": [{"id": "p1", "card_type": "events"}]}
                with open(os.path.join(base, "registry.json"), "w") as f:
                    json.dump(registry, f)

                results = Results_dns()
                results.warn("demo-data", "events card type is missing demo-data")
                out = generate_quality_table(base, console_path, {"events"}, results)
                # The demo column for 'events' should be 'N' due to the warning
                self.assertIn("N", out)


if __name__ == "__main__":
    unittest.main()
