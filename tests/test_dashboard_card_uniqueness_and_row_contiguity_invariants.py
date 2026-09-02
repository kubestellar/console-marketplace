"""Dashboard-level invariants complementing the existing grid-geometry suite.

The existing tests lock down (see ``test_asset_shape_invariants.py`` and
``test_asset_further_shape_invariants.py``):

  * ``x`` / ``y`` / ``w`` / ``h`` are non-negative integers, ``w > 0``,
    ``h > 0``, and ``x + w <= layout.columns``.
  * Cards do not overlap.
  * The topmost card sits at ``y == 0`` (no dead row above the fold).
  * Position dicts contain exactly ``{x, y, w, h}``.
  * The dashboard display ``name`` is globally unique.

Two adjacent gaps that ship silently today:

  * **Duplicate ``card_type`` within a single dashboard.** All three
    dashboards currently in-tree have distinct card types per dashboard —
    a duplicate is almost always a copy-paste bug (someone cloned a card
    to reposition it and forgot to change ``card_type``, leaving the same
    widget rendered twice). No existing test catches this, so a
    regression would ship as two identical cards on the imported
    dashboard.
  * **Vertical row gaps.** Even after asserting ``min_y == 0`` and the
    no-overlap invariant, a dashboard whose row set is ``{0, 8}``
    (nothing between y=0 and y=8) would pass the current suite but would
    render with a large blank strip in the middle of the grid — again,
    almost always a leftover from a deleted middle row. Every row from
    ``0`` up to ``max(y)`` should be occupied by at least one card
    (a card whose vertical extent ``[y, y+h)`` covers that row).

Both are locked here.
"""
from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DASHBOARDS = sorted((REPO_ROOT / "dashboards").glob("*/dashboard.json"))


def _load(p: Path) -> dict:
    return json.loads(p.read_text())


def test_dashboard_has_at_least_one_dashboard_file():
    # Guardrail so the per-dashboard checks below cannot trivially pass
    # on an empty glob (which would otherwise mask a directory rename).
    assert len(DASHBOARDS) >= 1, (
        f"no dashboards/*/dashboard.json under {REPO_ROOT / 'dashboards'} — "
        "asset-shape invariants would be vacuously satisfied."
    )


def test_card_types_are_unique_within_each_dashboard():
    """Two cards of the same ``card_type`` in one dashboard render as
    identical widgets side-by-side. That is almost always a copy-paste
    regression: someone cloned a card to move/resize it and forgot to
    change ``card_type``. Existing shape tests validate individual card
    entries but never compare them for duplication."""
    offenders = []
    for f in DASHBOARDS:
        d = _load(f)
        types = [c["card_type"] for c in d["cards"]]
        if len(types) != len(set(types)):
            seen: dict[str, int] = {}
            for t in types:
                seen[t] = seen.get(t, 0) + 1
            dups = sorted(t for t, n in seen.items() if n > 1)
            offenders.append((str(f.relative_to(REPO_ROOT)), dups))
    assert not offenders, (
        "dashboard(s) contain duplicate card_type entries — the imported "
        f"dashboard would render the same widget more than once: {offenders}"
    )


def test_dashboard_rows_have_no_vertical_gaps():
    """Every row index from 0 up to ``max(y+h)-1`` must be covered by at
    least one card's vertical extent ``[y, y+h)``. A row that no card
    covers renders as a blank horizontal strip in the middle of the
    dashboard — invariably a leftover from a deleted middle row. The
    existing ``min_y == 0`` check catches only the "dead row above the
    fold" case; this catches "dead row inside the grid"."""
    offenders = []
    for f in DASHBOARDS:
        d = _load(f)
        positions = [c["position"] for c in d["cards"]]
        total_height = max(p["y"] + p["h"] for p in positions)
        covered = set()
        for p in positions:
            for row in range(p["y"], p["y"] + p["h"]):
                covered.add(row)
        missing = [r for r in range(total_height) if r not in covered]
        if missing:
            offenders.append(
                (str(f.relative_to(REPO_ROOT)), total_height, missing)
            )
    assert not offenders, (
        "dashboard(s) have vertical gaps: some row indices between y=0 "
        "and max(y+h)-1 are not covered by any card. The imported "
        "dashboard would render with blank horizontal strips. "
        f"(dashboard, total_rows, missing_rows): {offenders}"
    )
