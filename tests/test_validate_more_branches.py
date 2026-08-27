"""Additional branch-coverage tests for scripts/validate-marketplace.py.

Targets branches previously uncovered:

- ``check_demo_data`` / ``check_is_demo_data_wiring`` / ``check_consecutive_failures``:
  the ``if not import_path: continue`` early-exit when ``RAW_CARD_COMPONENTS``
  names a component that has no matching ``lazy(() => import(...))`` line.
- ``check_is_demo_data_wiring`` / ``check_consecutive_failures``:
  the ``if not os.path.isdir(comp_dir): continue`` fallthrough when the
  import path resolves to a nonexistent directory.
- Running the script as ``__main__`` via ``runpy`` so the trailing
  ``if __name__ == "__main__": main()`` line is exercised in-process.
"""
import importlib.util
import os
import runpy
import unittest


def _load_mod():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate-marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_mod = _load_mod()
Results = _mod.Results


def _make_console_with_orphan_mapping(tmp_path, orphan_ct="orphan_card",
                                      orphan_missing_dir=False,
                                      valid_ct=None):
    """Build a console tree whose ``RAW_CARD_COMPONENTS`` names a component
    that is NOT declared via ``const X = lazy(() => import('./X'))``.

    This targets the ``if not import_path: continue`` branch when
    ``orphan_missing_dir`` is False, and the ``if not os.path.isdir(comp_dir)``
    branch when it is True (the orphan gets a lazy() import but no directory).
    """
    console = tmp_path / "console"
    cards_dir = console / "web/src/components/cards"
    cards_dir.mkdir(parents=True)

    lines = ["import { lazy } from 'react';"]
    raw_lines = []

    if orphan_missing_dir:
        lines.append("const Orphan = lazy(() => import('./OrphanDir'));")
        raw_lines.append(f"  {orphan_ct}: Orphan,")
    else:
        raw_lines.append(f"  {orphan_ct}: Orphan,")

    if valid_ct is not None:
        lines.append("const Valid = lazy(() => import('./Valid'));")
        raw_lines.append(f"  {valid_ct}: Valid,")
        (cards_dir / "Valid").mkdir()
        (cards_dir / "Valid" / "Valid.tsx").write_text("// placeholder\n")

    lines.append("")
    lines.append("const _UNIFIED_ONLY_TYPES = [" +
                 ", ".join(f"'{c}'" for c in ([orphan_ct] +
                                              ([valid_ct] if valid_ct else []))) +
                 "];")
    lines.append("")
    lines.append("export const RAW_CARD_COMPONENTS = {")
    lines.extend(raw_lines)
    lines.append("}")
    lines.append("")
    (cards_dir / "cardRegistry.ts").write_text("\n".join(lines))
    return console


class TestOrphanRawComponentBranches(unittest.TestCase):
    """RAW_CARD_COMPONENTS names a component with no ``lazy()`` import.

    Exercises the ``if not import_path: continue`` branch in
    ``check_demo_data`` / ``check_is_demo_data_wiring`` /
    ``check_consecutive_failures``.
    """

    def _run_all_three(self, console, known):
        for fn in (_mod.check_demo_data,
                   _mod.check_is_demo_data_wiring,
                   _mod.check_consecutive_failures):
            r = Results()
            fn("base-ignored", str(console), known, r)
            # The orphan should be silently skipped: no ok/warn/error mentioning it.
            for bucket in (r.passes, r.warnings, r.errors):
                for _, msg in bucket:
                    self.assertNotIn("orphan_card", msg,
                                     f"{fn.__name__} unexpectedly reported orphan_card: {msg}")

    def test_orphan_without_lazy_import_is_skipped(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            import pathlib
            tp = pathlib.Path(td)
            console = _make_console_with_orphan_mapping(tp,
                                                        orphan_missing_dir=False,
                                                        valid_ct=None)
            self._run_all_three(console, {"orphan_card"})

    def test_orphan_with_lazy_but_missing_directory_is_skipped(self):
        """RAW_CARD_COMPONENTS + lazy() point at ``./OrphanDir`` but that
        directory does not exist on disk.  The wiring/consecutive checks must
        take the ``if not os.path.isdir(comp_dir): continue`` fallthrough.
        """
        import tempfile
        import pathlib
        with tempfile.TemporaryDirectory() as td:
            tp = pathlib.Path(td)
            console = _make_console_with_orphan_mapping(tp,
                                                        orphan_missing_dir=True)
            # Only wiring + consecutive have the isdir guard on comp_dir.
            for fn in (_mod.check_is_demo_data_wiring,
                       _mod.check_consecutive_failures):
                r = Results()
                fn("base-ignored", str(console), {"orphan_card"}, r)
                for bucket in (r.passes, r.warnings, r.errors):
                    for _, msg in bucket:
                        self.assertNotIn("orphan_card", msg)


class TestScriptAsMain(unittest.TestCase):
    """Exercise the ``if __name__ == "__main__": main()`` entrypoint.

    ``main()`` calls ``sys.exit`` internally; we catch it so pytest keeps
    running.  ``runpy.run_path`` executes the file in-process, so coverage
    instrumentation records the final line — a subprocess would not.
    """

    def test_run_path_executes_main_module(self):
        script = os.path.join(os.path.dirname(__file__), "..",
                              "scripts", "validate-marketplace.py")

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


if __name__ == "__main__":
    unittest.main()
