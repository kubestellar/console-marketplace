"""Additional branch coverage for scripts/check-card-test-coverage.sh.

The existing tests/scripts/test_check_card_test_coverage.py covers the
happy-path exit code, `__tests__/` and co-located test detection for
`.test.ts` / `.test.tsx`, the "modified but not added" filter, and the
`|| true` fallback on a missing base ref. This file targets four
independent branches of the script that were not directly exercised:

  1. Renamed card `index.tsx` — `git diff --diff-filter=AR` also picks
     up renamed paths. A rename that lands the index at a new
     `web/src/components/cards/<name>/index.tsx` with no test file must
     be flagged as a gap, just like a fresh add.
  2. `__tests__/` directory exists but contains no `*.test.*` file —
     the first `find` in `has_test` returns empty, the second (co-located)
     also returns empty, so the branch falls through to the final
     `return 1` and the card is correctly flagged as a gap.
  3. Co-located `.test.js` / `.test.jsx` variants — the `*.test.*` glob
     in `has_test` is generic; JS-only cards must be recognized too.
  4. `CARD_TEST_COVERAGE_SUMMARY` always advertises `exit_code:0`, even
     when there ARE gaps, because the gate is informational and never
     blocks. The success-case tests assert the summary shape but do not
     assert `exit_code:0` on a run with gaps.
"""

from __future__ import annotations

import re
import sys
import tempfile
import unittest
from pathlib import Path

# The existing sibling module lives at tests/scripts/ and pytest does not
# add that directory to sys.path (there is no conftest.py at that level),
# so add it explicitly before importing the shared harness. This mirrors
# how the sibling module is loaded when run as `__main__` directly.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_check_card_test_coverage import (  # noqa: E402
    CardCoverageScriptHarness,
    INDEX_TSX,
    TEST_TSX,
    _run_git,
)


class TestCheckCardTestCoverageBranches(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.harness = CardCoverageScriptHarness(self.tmp)
        self.report = self.tmp / "report.md"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_renamed_card_index_is_flagged_as_gap(self) -> None:
        old_dir = "web/src/components/cards/old-name"
        new_dir = "web/src/components/cards/renamed-card"

        (self.harness.repo / old_dir).mkdir(parents=True)
        (self.harness.repo / old_dir / "index.tsx").write_text(INDEX_TSX)
        _run_git(self.harness.repo, "add", "-A")
        _run_git(self.harness.repo, "commit", "-q", "-m", "add old-name")
        _run_git(self.harness.repo, "update-ref", "refs/remotes/origin/main", "HEAD")

        (self.harness.repo / new_dir).mkdir(parents=True)
        _run_git(self.harness.repo, "mv", f"{old_dir}/index.tsx", f"{new_dir}/index.tsx")
        _run_git(self.harness.repo, "commit", "-q", "-m", "rename card")

        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        # --diff-filter=AR includes rename, so the new path should be
        # visible to the script and flagged as a coverage gap.
        self.assertIn("gap_count=1", result.stdout)
        self.assertIn("renamed-card", self.report.read_text())

    def test_tests_dir_present_but_empty_is_flagged(self) -> None:
        # __tests__/ exists but contains only a non-test helper file —
        # first find in has_test yields nothing, second find also yields
        # nothing, so the card is correctly reported as missing a test.
        self.harness.add_head_files({
            "web/src/components/cards/empty-tests/index.tsx": INDEX_TSX,
            "web/src/components/cards/empty-tests/__tests__/helpers.ts": "export const x = 1\n",
        })
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("gap_count=1", result.stdout)
        report_body = self.report.read_text()
        self.assertIn("empty-tests", report_body)
        self.assertIn("Missing test file", report_body)

    def test_js_and_jsx_test_variants_are_recognized(self) -> None:
        # The has_test glob is `*.test.*`, so `.test.js` and `.test.jsx`
        # must count as coverage too, not only `.test.ts` / `.test.tsx`.
        self.harness.add_head_files({
            "web/src/components/cards/js-card/index.tsx": INDEX_TSX,
            "web/src/components/cards/js-card/util.test.js": "test('x', () => {})\n",
            "web/src/components/cards/jsx-card/index.tsx": INDEX_TSX,
            "web/src/components/cards/jsx-card/__tests__/View.test.jsx": TEST_TSX,
        })
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("gap_count=0", result.stdout)
        # CARD_TEST_COVERAGE_SUMMARY must report both changed cards even
        # though both have tests.
        m = re.search(
            r'CARD_TEST_COVERAGE_SUMMARY: \{"changed_card_count":(\d+),'
            r'"gap_count":(\d+),"exit_code":(\d+)\}',
            result.stdout,
        )
        self.assertIsNotNone(m, msg=f"summary line missing in: {result.stdout!r}")
        assert m is not None
        self.assertEqual(m.group(1), "2")
        self.assertEqual(m.group(2), "0")
        self.assertEqual(m.group(3), "0")

    def test_summary_exit_code_is_zero_even_when_gaps_reported(self) -> None:
        # The gate is informational: `exit_code:0` must appear in the
        # summary line regardless of whether gaps were found.
        self.harness.add_head_files({
            "web/src/components/cards/no-tests/index.tsx": INDEX_TSX,
        })
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("gap_count=1", result.stdout)
        m = re.search(
            r'CARD_TEST_COVERAGE_SUMMARY: \{"changed_card_count":(\d+),'
            r'"gap_count":(\d+),"exit_code":(\d+)\}',
            result.stdout,
        )
        self.assertIsNotNone(m, msg=f"summary line missing in: {result.stdout!r}")
        assert m is not None
        self.assertEqual(m.group(1), "1")
        self.assertEqual(m.group(2), "1")
        # Even with a gap, the summary must advertise a zero exit code.
        self.assertEqual(m.group(3), "0")


if __name__ == "__main__":
    unittest.main()
