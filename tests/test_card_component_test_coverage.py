"""Static-analysis gate: every marketplace card must have a component test.

The informational gate in `scripts/check-card-test-coverage.sh` accepts any
`*.test.*` file inside a new card directory. Every card ships with
`demoData.test.ts` — a data-shape test that never renders the React
component — so a card added with only `demoData.test.ts` would satisfy the
shell gate while `index.tsx` (the actual marketplace component) has zero
coverage. See issue #516.

This test enforces a stricter, existing-card-inclusive invariant that the
shell gate cannot express:

  For every `web/src/components/cards/<card>/index.tsx`, at least one
  component-level test file must exist. A "component-level test" is any
  `*.test.tsx` / `*.test.ts` file co-located with `index.tsx` (or under
  `<card>/__tests__/`) whose stem is NOT one of the well-known non-component
  helpers:

    - demoData.test.*         → data-shape test only
    - CardDataContext*.test.* → shared context (already tested at parent)
    - use*.test.*             → hook test, not the component surface

Because this test runs in `python-unit-tests.yml` (which gates merges via
`--fail-under=90`), it converts the current informational gate into a hard
gate — and covers regressions on already-merged cards as well, not just
newly added ones.

Refs: kubestellar/console-marketplace#516
"""
from __future__ import annotations

import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CARDS_DIR = REPO_ROOT / "web" / "src" / "components" / "cards"

# Filename stems that are NOT component-level tests. Kept as a small, explicit
# allow-list of "these tests exist but do not exercise the React component".
# Adding a new non-component test kind (e.g. a `types.test.ts` schema check)
# should extend this list AND leave the card's real component test in place.
NON_COMPONENT_TEST_STEMS = {
    "demoData",
    "CardDataContext",
    "CardDataContext-branches",
}

# Filename prefixes that identify a hook test rather than a component test.
# Hooks (`useXxxStatus.ts`) are exercised in isolation, which is valuable but
# distinct from rendering the card component.
HOOK_TEST_PREFIXES = ("use",)


def _iter_card_dirs() -> list[Path]:
    """Return every directory under CARDS_DIR that ships an `index.tsx`."""
    if not CARDS_DIR.is_dir():
        return []
    return sorted(
        p
        for p in CARDS_DIR.iterdir()
        if p.is_dir() and (p / "index.tsx").is_file()
    )


def _test_files_for(card_dir: Path) -> list[Path]:
    """Return all `*.test.ts` / `*.test.tsx` files for a single card."""
    files: list[Path] = []
    # Co-located tests.
    for pattern in ("*.test.tsx", "*.test.ts"):
        files.extend(card_dir.glob(pattern))
    # __tests__ subdirectory (used by openyurt_status today).
    tests_subdir = card_dir / "__tests__"
    if tests_subdir.is_dir():
        for pattern in ("*.test.tsx", "*.test.ts"):
            files.extend(tests_subdir.glob(pattern))
    return files


def _is_component_test(path: Path) -> bool:
    """A component test is a `*.test.tsx` (JSX) file whose stem is not a
    known non-component helper and is not a hook test."""
    # The React component render tests use `.tsx` (JSX). demoData shape tests
    # use `.ts`. That alone is a strong signal, but we combine it with the
    # explicit deny-list below so a future non-component `.tsx` test (e.g.
    # `CardDataContext-branches.test.tsx`) is still excluded.
    if path.suffix != ".tsx":
        return False
    # `foo.test.tsx` → stem "foo.test" → real stem "foo"
    stem = path.name[: -len(".test.tsx")]
    if stem in NON_COMPONENT_TEST_STEMS:
        return False
    if any(stem.startswith(prefix) and stem[len(prefix) : len(prefix) + 1].isupper() for prefix in HOOK_TEST_PREFIXES):
        return False
    return True


class TestCardComponentTestCoverage(unittest.TestCase):
    """Every card with an index.tsx must ship a component-level test.

    See module docstring for rationale (issue #516). This is a stricter,
    hard-gated companion to `scripts/check-card-test-coverage.sh`.
    """

    def test_cards_directory_exists(self) -> None:
        self.assertTrue(
            CARDS_DIR.is_dir(),
            f"expected marketplace cards directory at {CARDS_DIR} — "
            "layout change? Update this test if the cards moved.",
        )

    def test_at_least_one_card_is_discovered(self) -> None:
        # Guard against a silent regression where the discovery pattern stops
        # matching (e.g. someone renames every card's entry file). If this
        # ever legitimately drops to zero, delete this test consciously.
        self.assertGreater(
            len(_iter_card_dirs()),
            0,
            "no card directories with an index.tsx were found — the "
            "discovery pattern is likely broken, not that all cards were "
            "removed.",
        )

    def test_every_card_has_a_component_level_test(self) -> None:
        gaps: list[str] = []
        for card_dir in _iter_card_dirs():
            tests = _test_files_for(card_dir)
            component_tests = [t for t in tests if _is_component_test(t)]
            if not component_tests:
                rel_card = card_dir.relative_to(REPO_ROOT)
                rel_tests = sorted(str(t.relative_to(REPO_ROOT)) for t in tests)
                gaps.append(
                    f"{rel_card}/: no component-level test found. "
                    f"Existing test files (all classified as non-component): "
                    f"{rel_tests or '[]'}. "
                    f"Add a <CardName>.test.tsx (or __tests__/<CardName>.test.tsx) "
                    f"that renders the component from index.tsx."
                )
        self.assertEqual(
            gaps,
            [],
            "one or more marketplace cards ship an index.tsx without a "
            "component-level test (see issue #516):\n  - "
            + "\n  - ".join(gaps),
        )

    def test_classifier_rejects_demoData_ts_test(self) -> None:
        # Self-check: a `demoData.test.ts` alone would be rejected.
        p = CARDS_DIR / "buildpacks-status" / "demoData.test.ts"
        self.assertFalse(
            _is_component_test(p),
            "demoData.test.ts must not be classified as a component test — "
            "this classification is what protects issue #516's invariant.",
        )

    def test_classifier_rejects_CardDataContext_test(self) -> None:
        p = CARDS_DIR / "buildpacks-status" / "CardDataContext.test.tsx"
        self.assertFalse(
            _is_component_test(p),
            "CardDataContext.test.tsx is a shared-context test, not a "
            "card component test — it must not satisfy this invariant.",
        )

    def test_classifier_rejects_hook_test(self) -> None:
        p = CARDS_DIR / "openkruise_status" / "useOpenKruiseStatus.test.ts"
        self.assertFalse(
            _is_component_test(p),
            "hook tests (`useXxx.test.ts`) exercise the data hook in "
            "isolation, not the rendered card component — they must not "
            "satisfy this invariant on their own.",
        )

    def test_classifier_accepts_pascal_case_tsx_test(self) -> None:
        p = CARDS_DIR / "buildpacks-status" / "BuildpacksStatus.test.tsx"
        self.assertTrue(
            _is_component_test(p),
            "PascalCase `<CardName>.test.tsx` is the canonical component "
            "test filename — it must be classified as a component test.",
        )


if __name__ == "__main__":
    unittest.main()
