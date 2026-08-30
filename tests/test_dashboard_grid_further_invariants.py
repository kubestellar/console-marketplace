"""Dashboard grid-shape invariants that complement the existing per-file
checks in tests/test_asset_shape_invariants.py and
tests/test_asset_further_shape_invariants.py.

Those files already assert:
  * Card positions fit the layout width (x + w <= layout.columns)
  * Card positions do not overlap
  * Card positions have exactly x/y/w/h int keys
  * The topmost card sits at y == 0 (no dead row above the fold)

This module adds three complementary invariants:

  * `min_x == 0` for every dashboard — the leftmost card starts at
    column zero. Analogous to the existing y==0 rule: a dashboard
    whose leftmost card sits at x > 0 renders with a dead column
    on the left, almost always leftover from a deleted first card.
  * `max(x + w) == layout.columns` — some card reaches the right
    edge of the grid. A dashboard that leaves an unused right-hand
    column strip is either mis-sized (someone bumped columns from
    10 to 12 without widening the last card) or has an accidentally
    dropped final column of cards.
  * The `layout` object contains ONLY the `columns` key. Extra
    stray keys ("rows", "gutter", etc.) that were prototyped and
    then abandoned but left in the JSON would silently confuse the
    dashboard renderer if it ever grows a "rows" concept later.
    Locking layout to a single key today makes the next schema
    extension explicit.

Runnable the same way as the sibling test modules:

    pytest tests/test_dashboard_grid_further_invariants.py
"""

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
DASHBOARDS = sorted((REPO_ROOT / "dashboards").glob("*/dashboard.json"))


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("dashboard_path", DASHBOARDS, ids=[p.parent.name for p in DASHBOARDS])
def test_every_dashboard_uses_grid_column_zero(dashboard_path: Path) -> None:
    """The leftmost card in every dashboard MUST start at x=0.

    Mirrors the y=0 invariant already asserted by
    test_every_dashboard_uses_grid_row_zero. A dashboard whose
    leftmost card sits at x > 0 renders with a dead vertical strip
    on the left edge — almost always leftover from a deleted first
    card or an off-by-one from a copied spec.
    """
    d = _load(dashboard_path)
    xs = [c["position"]["x"] for c in d["cards"]]
    min_x = min(xs)
    assert min_x == 0, (
        f"{dashboard_path.relative_to(REPO_ROOT)}: leftmost card x={min_x} — "
        "dashboard opens with a dead column strip on the left edge."
    )


@pytest.mark.parametrize("dashboard_path", DASHBOARDS, ids=[p.parent.name for p in DASHBOARDS])
def test_every_dashboard_fills_full_layout_width(dashboard_path: Path) -> None:
    """Some card in every dashboard MUST touch the right edge (x + w == columns).

    A dashboard that leaves an unused right-hand column strip is
    either mis-sized (someone bumped `layout.columns` from 10 to 12
    without widening any card) or has an accidentally dropped final
    column of cards. Either way it renders as a lopsided grid.
    The existing `positions_fit_layout` test asserts `x + w <= cols`
    (guarding overflow); this is the complementary lower-bound
    guard on the right edge.
    """
    d = _load(dashboard_path)
    cols = d["layout"]["columns"]
    max_right = max(c["position"]["x"] + c["position"]["w"] for c in d["cards"])
    assert max_right == cols, (
        f"{dashboard_path.relative_to(REPO_ROOT)}: no card reaches right edge — "
        f"max(x+w)={max_right}, layout.columns={cols}. Dashboard leaves a "
        f"{cols - max_right}-column dead strip on the right edge."
    )


@pytest.mark.parametrize("dashboard_path", DASHBOARDS, ids=[p.parent.name for p in DASHBOARDS])
def test_dashboard_layout_object_has_only_columns_key(dashboard_path: Path) -> None:
    """`layout` must contain exactly the `columns` key today.

    Extra keys that were prototyped and then abandoned but left in
    the JSON (`rows`, `gutter`, `padding`, …) would silently
    influence future renderer behavior if the schema ever grows a
    non-columns concept. Locking layout to a single known key now
    makes the next schema extension an explicit review of every
    shipped dashboard rather than a silent behavior change.
    """
    d = _load(dashboard_path)
    layout = d["layout"]
    assert isinstance(layout, dict), (
        f"{dashboard_path.relative_to(REPO_ROOT)}: layout is not a dict: "
        f"{type(layout).__name__}"
    )
    assert set(layout.keys()) == {"columns"}, (
        f"{dashboard_path.relative_to(REPO_ROOT)}: layout has unexpected keys "
        f"{sorted(set(layout.keys()) - {'columns'})}; expected exactly "
        "{'columns'}. If a new layout key is deliberate, update this "
        "invariant to include it and audit every shipped dashboard."
    )
