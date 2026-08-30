"""Invariant tests for barrel-shim re-exports under ``web/src/``.

Several files under ``web/src/`` are single-line barrel shims of the
form ``export * from '<relative-spec>'``. Their sole reason to exist is
to give callers a stable local import path (``./CardDataContext``,
``../../hooks/useDemoMode``) while the real symbol lives elsewhere.

The vitest suite does not catch a broken relative spec inside one of
these shims: every card test file installs its own ``vi.mock(...)``
for the shim path before rendering the component, which short-circuits
module resolution during the test run. A shim that points at a
non-existent module therefore looks green in CI but crashes at
runtime (or, best-case, fails the production Vite build) — an entire
category of regression that no existing test guards.

This module walks ``web/src/``, finds every single-line
``export * from '<spec>'`` file, resolves the spec against the shim's
own directory, and asserts that a concrete ``.ts`` / ``.tsx`` /
``/index.ts`` / ``/index.tsx`` file exists on disk.

Originally two shims (buildpacks-status/ and coredns_status/) were
known-broken and were pinned with ``expectedFailure`` referencing
tracking issue kubestellar/console-marketplace#494. Both have since
been fixed and the pin has been removed; the invariant is now a
plain positive test with an empty ``KNOWN_BROKEN`` allowlist retained
so future drift discoveries have a documented on-ramp for the same
self-clearing pattern.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
WEB_SRC = REPO_ROOT / "web" / "src"

# Single-line ``export * from '<spec>'`` (with optional trailing
# semicolon and optional double / single quotes). Matches only the
# first non-blank, non-comment line so a file whose FIRST real line
# is a re-export qualifies as a "barrel shim".
SHIM_RE = re.compile(
    r"""^\s*export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;?\s*$"""
)

# Resolution suffixes tried in order, mirroring the TypeScript /
# Vite / Node resolver behaviour for relative specifiers.
RESOLVE_SUFFIXES = (".ts", ".tsx", "/index.ts", "/index.tsx")

# Shims whose relative spec is known-broken and are excluded from the
# invariant walk. Kept as an intentional on-ramp for the self-clearing
# pattern: a new drift discovery goes in here alongside its tracking
# issue, and the paired ``@unittest.expectedFailure`` guard below
# flips to an unexpected-success signal the moment the production
# fix lands.
#
# The set is currently empty — the two shims originally listed here
# (buildpacks-status/CardDataContext.tsx and
# coredns_status/CardDataContext.tsx) were fixed under
# kubestellar/console-marketplace#494 and both now resolve.
KNOWN_BROKEN: frozenset[str] = frozenset()


def _first_code_line(text: str) -> str | None:
    """Return the first non-blank, non-line-comment line of ``text``,
    or ``None`` if none exists."""
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("//"):
            continue
        return line
    return None


def _find_shim_files():
    """Yield ``(rel_path, spec)`` for every barrel shim under
    ``web/src/``. A file counts as a shim iff its first non-blank
    non-comment line matches ``export * from '<spec>'`` AND that is
    the only non-blank non-comment line in the file.
    """
    for path in sorted(WEB_SRC.rglob("*.ts")):
        yield from _maybe_shim(path)
    for path in sorted(WEB_SRC.rglob("*.tsx")):
        yield from _maybe_shim(path)


def _maybe_shim(path: Path):
    # Skip declaration files and tests — they are not shims.
    if path.name.endswith(".d.ts"):
        return
    if any(part == "__tests__" for part in path.parts):
        return
    if path.name.endswith(".test.ts") or path.name.endswith(".test.tsx"):
        return
    if path.name.endswith(".spec.ts") or path.name.endswith(".spec.tsx"):
        return
    text = path.read_text(encoding="utf-8")
    first = _first_code_line(text)
    if first is None:
        return
    m = SHIM_RE.match(first)
    if not m:
        return
    # Ensure the shim body is only that one re-export line. A file
    # that re-exports AND does anything else is not a barrel shim
    # and should not be enforced by this test.
    body_lines = [
        l.strip() for l in text.splitlines()
        if l.strip() and not l.strip().startswith("//")
    ]
    if len(body_lines) != 1:
        return
    yield path.relative_to(REPO_ROOT).as_posix(), m.group(1)


def _resolves(shim_path: Path, spec: str) -> Path | None:
    """Return the file that ``spec`` resolves to (relative to
    ``shim_path``'s directory), or ``None`` if none of the standard
    TS / Vite suffixes matches. Only relative specs are handled
    here — bare specifiers ('react', '@/foo') are irrelevant to
    the drift this test guards against and are treated as resolved.
    """
    if not spec.startswith("."):
        return shim_path  # bare specifier, ignore
    base = shim_path.parent
    for suffix in RESOLVE_SUFFIXES:
        candidate = (base / (spec + suffix)).resolve()
        if candidate.is_file():
            return candidate
    return None


class ShimReExportInvariants(unittest.TestCase):
    """Every barrel-shim re-export under ``web/src/`` must point at a
    file that actually exists on disk."""

    @classmethod
    def setUpClass(cls):
        cls.shims = list(_find_shim_files())
        assert cls.shims, (
            f"no barrel-shim files found under {WEB_SRC}. Either the "
            f"shim pattern regressed, or this test lost sight of its "
            f"target tree — fail loudly rather than silently pass."
        )

    def test_shim_pattern_finds_expected_categories(self):
        """Sanity-check the walker before the resolution loop below
        relies on it. We expect at least one shim in each of the
        three known categories (hook re-exports, lib/cards re-exports,
        per-card CardDataContext re-exports) so a walker regression
        that drops one whole family surfaces as a clear failure here.
        """
        rels = {p for p, _ in self.shims}
        hooks = [p for p in rels if "/components/hooks/" in p]
        lib_cards = [p for p in rels if "/components/lib/cards/" in p]
        card_ctx = [p for p in rels if p.endswith("/CardDataContext.tsx")
                    and "/components/cards/" in p
                    and p != "web/src/components/cards/CardDataContext.tsx"]
        self.assertGreater(len(hooks), 0, f"no hook shims found in {rels}")
        self.assertGreater(len(lib_cards), 0,
                           f"no lib/cards shims found in {rels}")
        self.assertGreater(len(card_ctx), 0,
                           f"no per-card CardDataContext shims found in {rels}")

    def test_every_barrel_shim_resolves_to_a_real_file(self):
        """The core invariant. For every shim NOT listed in
        ``KNOWN_BROKEN``, the ``export * from '<spec>'`` target must
        resolve to a concrete .ts/.tsx/(index) file. A failure here
        means a card or hook will crash at runtime with an "undefined
        is not a function" (or fail the Vite build outright)."""
        for rel, spec in self.shims:
            if rel in KNOWN_BROKEN:
                continue
            with self.subTest(shim=rel, spec=spec):
                resolved = _resolves(REPO_ROOT / rel, spec)
                self.assertIsNotNone(
                    resolved,
                    f"{rel}: 'export * from {spec!r}' does not resolve "
                    f"to any of "
                    f"{[spec + s for s in RESOLVE_SUFFIXES]} relative "
                    f"to {(REPO_ROOT / rel).parent}. The shim points "
                    f"at a non-existent module; the card that imports "
                    f"through this shim will crash at runtime.",
                )

    @unittest.expectedFailure
    def test_known_broken_shims_still_broken(self):
        """Placeholder guarding the self-clearing pattern.

        When ``KNOWN_BROKEN`` is empty (steady state), this test
        deliberately raises so that the ``expectedFailure`` decorator
        keeps the whole suite green. The moment a future maintainer
        adds an entry to ``KNOWN_BROKEN`` alongside a new tracking
        issue, this test will start failing "for real" via the
        ``assertIsNone`` on the newly-added broken shim; and once
        that shim is fixed, unittest will report an unexpected
        success — the signal to remove both the ``KNOWN_BROKEN``
        entry and (if it was the last one) this decorator.

        Historical context: originally pinned two shims fixed under
        kubestellar/console-marketplace#494.
        """
        if not KNOWN_BROKEN:
            # Steady state: no broken shims to guard. Raise so the
            # expectedFailure decorator can keep the suite green
            # without silently pretending the guard fired.
            raise self.failureException(
                "KNOWN_BROKEN is empty — no broken shims to pin. "
                "This is the steady-state placeholder; the "
                "expectedFailure decorator absorbs this raise."
            )
        for rel, spec in self.shims:
            if rel not in KNOWN_BROKEN:
                continue
            resolved = _resolves(REPO_ROOT / rel, spec)
            self.assertIsNone(
                resolved,
                f"{rel}: spec {spec!r} now resolves — remove it from "
                f"KNOWN_BROKEN and update the tracking-issue reference.",
            )


if __name__ == "__main__":
    unittest.main()
