"""Tests for scripts/check-card-test-coverage.sh.

The script scans a git diff between HEAD and a base ref for newly added
`web/src/components/cards/<name>/index.tsx` files and reports any that
lack a colocated or `__tests__/`-based test file. It is informational
(always exits 0) and writes a markdown report to /tmp.

These tests build a self-contained git repository per case, drop the
script into `scripts/`, run it, and assert on the stdout `gap_count=N`
line plus the report content. No tests reach out to network or to the
real repo history.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_SOURCE = REPO_ROOT / "scripts" / "check-card-test-coverage.sh"


def _run_git(cwd: Path, *args: str, env: dict | None = None) -> subprocess.CompletedProcess:
    base_env = os.environ.copy()
    base_env.update({
        "GIT_AUTHOR_NAME": "Test", "GIT_AUTHOR_EMAIL": "test@example.com",
        "GIT_COMMITTER_NAME": "Test", "GIT_COMMITTER_EMAIL": "test@example.com",
        "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null",
    })
    if env:
        base_env.update(env)
    return subprocess.run(
        ["git", *args], cwd=cwd, env=base_env,
        capture_output=True, text=True, check=True,
    )


class CardCoverageScriptHarness:
    """Builds an isolated repo with two commits: base -> head.

    Callers add files to the second commit via `add_head_files`. The
    script is then run with `origin/main` pointing at the base commit.
    """

    def __init__(self, workdir: Path) -> None:
        self.repo = workdir / "repo"
        self.repo.mkdir()
        self._init_repo()

    def _init_repo(self) -> None:
        _run_git(self.repo, "init", "-q", "-b", "main")
        # Seed with the script itself so it lives inside the fake repo
        # and $(git rev-parse --show-toplevel) resolves correctly.
        scripts_dir = self.repo / "scripts"
        scripts_dir.mkdir()
        shutil.copy2(SCRIPT_SOURCE, scripts_dir / "check-card-test-coverage.sh")
        os.chmod(scripts_dir / "check-card-test-coverage.sh", 0o755)
        (self.repo / "README.md").write_text("seed\n")
        _run_git(self.repo, "add", "-A")
        _run_git(self.repo, "commit", "-q", "-m", "initial")
        # Point origin/main at the base commit so the script's default
        # BASE_REF works without needing a real remote.
        _run_git(self.repo, "update-ref", "refs/remotes/origin/main", "HEAD")

    def add_head_files(self, files: dict[str, str], message: str = "add card(s)") -> None:
        for rel_path, content in files.items():
            p = self.repo / rel_path
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)
        _run_git(self.repo, "add", "-A")
        _run_git(self.repo, "commit", "-q", "-m", message)

    def run_script(self, base_ref: str = "origin/main", report_path: str | None = None) -> subprocess.CompletedProcess:
        env = os.environ.copy()
        # Redirect the report to a tmp path inside the workdir so parallel
        # test runs don't stomp on each other's /tmp/card-test-coverage-gaps.md.
        # The script hardcodes /tmp/card-test-coverage-gaps.md, so we
        # sed-patch a copy per run.
        script_path = self.repo / "scripts" / "check-card-test-coverage.sh"
        if report_path is not None:
            patched = script_path.read_text().replace(
                "/tmp/card-test-coverage-gaps.md", report_path,
            )
            script_path.write_text(patched)
        return subprocess.run(
            ["bash", str(script_path), base_ref],
            cwd=self.repo, env=env, capture_output=True, text=True, check=False,
        )


INDEX_TSX = "export default function Card() { return null }\n"
TEST_TSX = textwrap.dedent("""
    import { describe, it } from 'vitest'
    describe('card', () => { it('renders', () => {}) })
""").lstrip()


class TestCheckCardTestCoverage(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.harness = CardCoverageScriptHarness(self.tmp)
        self.report = self.tmp / "report.md"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    # --- exit code & reporting invariants -----------------------------------

    def test_always_exits_zero_when_no_changes(self) -> None:
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("gap_count=0", result.stdout)

    def test_no_changes_writes_success_report(self) -> None:
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0)
        self.assertTrue(self.report.exists())
        body = self.report.read_text()
        self.assertIn("All new card components have at least one test file", body)
        self.assertNotIn("Missing test file", body)

    # --- gap detection ------------------------------------------------------

    def test_new_card_without_test_is_flagged(self) -> None:
        self.harness.add_head_files({
            "web/src/components/cards/lonely-card/index.tsx": INDEX_TSX,
        })
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("gap_count=1", result.stdout)
        body = self.report.read_text()
        self.assertIn("lonely-card", body)
        self.assertIn("Missing test file", body)
        # Informational disclaimer must be present so reviewers know it doesn't block.
        self.assertIn("informational", body)

    def test_new_card_with_colocated_test_passes(self) -> None:
        self.harness.add_head_files({
            "web/src/components/cards/happy-card/index.tsx": INDEX_TSX,
            "web/src/components/cards/happy-card/HappyCard.test.tsx": TEST_TSX,
        })
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0)
        self.assertIn("gap_count=0", result.stdout)
        self.assertNotIn("happy-card", self.report.read_text())

    def test_new_card_with_tests_subdirectory_passes(self) -> None:
        self.harness.add_head_files({
            "web/src/components/cards/tested-card/index.tsx": INDEX_TSX,
            "web/src/components/cards/tested-card/__tests__/TestedCard.test.tsx": TEST_TSX,
        })
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0)
        self.assertIn("gap_count=0", result.stdout)

    def test_multiple_gaps_are_all_reported(self) -> None:
        self.harness.add_head_files({
            "web/src/components/cards/card-a/index.tsx": INDEX_TSX,
            "web/src/components/cards/card-b/index.tsx": INDEX_TSX,
            "web/src/components/cards/card-c/index.tsx": INDEX_TSX,
            # One control that DOES have a test — must not appear in report.
            "web/src/components/cards/card-d/index.tsx": INDEX_TSX,
            "web/src/components/cards/card-d/CardD.test.tsx": TEST_TSX,
        })
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0)
        self.assertIn("gap_count=3", result.stdout)
        body = self.report.read_text()
        self.assertIn("card-a", body)
        self.assertIn("card-b", body)
        self.assertIn("card-c", body)
        self.assertNotIn("| `web/src/components/cards/card-d/`", body)
        # CARD_TEST_COVERAGE_SUMMARY: 4 changed cards (a, b, c, d), 3 gaps.
        self.assertIn(
            'CARD_TEST_COVERAGE_SUMMARY: {"changed_card_count":4,"gap_count":3,"exit_code":0}',
            result.stdout,
        )

    # --- CI-observability summary line --------------------------------------

    def test_summary_line_present_with_no_changes(self) -> None:
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0)
        self.assertIn(
            'CARD_TEST_COVERAGE_SUMMARY: {"changed_card_count":0,"gap_count":0,"exit_code":0}',
            result.stdout,
        )

    def test_summary_line_counts_changed_cards_including_passing_ones(self) -> None:
        self.harness.add_head_files({
            "web/src/components/cards/lonely-card/index.tsx": INDEX_TSX,
            "web/src/components/cards/happy-card/index.tsx": INDEX_TSX,
            "web/src/components/cards/happy-card/HappyCard.test.tsx": TEST_TSX,
        })
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0)
        # 2 changed cards total, only 1 gap (lonely-card lacks a test).
        self.assertIn(
            'CARD_TEST_COVERAGE_SUMMARY: {"changed_card_count":2,"gap_count":1,"exit_code":0}',
            result.stdout,
        )

    # --- boundary cases -----------------------------------------------------

    def test_ignores_non_index_tsx_additions(self) -> None:
        # A helper file in a cards directory is not the entrypoint; the
        # script only cares about newly added `index.tsx` files.
        self.harness.add_head_files({
            "web/src/components/cards/existing/helper.tsx": INDEX_TSX,
        })
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0)
        self.assertIn("gap_count=0", result.stdout)

    def test_ignores_index_tsx_outside_cards_dir(self) -> None:
        self.harness.add_head_files({
            "web/src/components/other/foo/index.tsx": INDEX_TSX,
            "web/src/pages/index.tsx": INDEX_TSX,
        })
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0)
        self.assertIn("gap_count=0", result.stdout)

    def test_ignores_modified_but_not_added_index(self) -> None:
        # Pre-create the card in the base commit.
        base_files = {
            "web/src/components/cards/legacy-card/index.tsx": INDEX_TSX,
        }
        for rel, content in base_files.items():
            p = self.harness.repo / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)
        _run_git(self.harness.repo, "add", "-A")
        _run_git(self.harness.repo, "commit", "-q", "-m", "add legacy")
        _run_git(self.harness.repo, "update-ref", "refs/remotes/origin/main", "HEAD")
        # Now modify it — the script uses --diff-filter=AR, so a plain
        # modification must NOT be flagged even though the card has no test.
        (self.harness.repo / "web/src/components/cards/legacy-card/index.tsx").write_text(
            INDEX_TSX + "// modified\n",
        )
        _run_git(self.harness.repo, "add", "-A")
        _run_git(self.harness.repo, "commit", "-q", "-m", "modify legacy")

        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0)
        self.assertIn("gap_count=0", result.stdout)

    def test_test_file_variants_are_recognized(self) -> None:
        # Both `.test.ts` and `.test.tsx` should count as "has test".
        self.harness.add_head_files({
            "web/src/components/cards/ts-card/index.tsx": INDEX_TSX,
            "web/src/components/cards/ts-card/logic.test.ts": "test('x', () => {})\n",
            "web/src/components/cards/tsx-card/index.tsx": INDEX_TSX,
            "web/src/components/cards/tsx-card/View.test.tsx": TEST_TSX,
        })
        result = self.harness.run_script(report_path=str(self.report))
        self.assertEqual(result.returncode, 0)
        self.assertIn("gap_count=0", result.stdout)

    def test_missing_base_ref_does_not_crash(self) -> None:
        # If the diff can't be computed against the requested base, the
        # script falls back through `|| true` and reports no gaps —
        # it must never exit non-zero and take down CI.
        self.harness.add_head_files({
            "web/src/components/cards/some-card/index.tsx": INDEX_TSX,
        })
        result = self.harness.run_script(
            base_ref="refs/tags/definitely-does-not-exist",
            report_path=str(self.report),
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("gap_count=", result.stdout)


if __name__ == "__main__":
    unittest.main()
