"""Theme color numeric-range and chartColors uniqueness invariants.

``test_asset_shape_invariants.py`` locks the shadcn HSL keys to the shape
``"H S% L%"`` via ``HSL_RE = ^\\d+ \\d+% \\d+%$``. That regex accepts
any digit count — a slip like ``"999 200% 500%"`` passes the shape test
but is nonsense to ``hsl(var(--x))`` and paints the affected surface as
either black, transparent, or the browser's fallback.

Similarly ``test_theme_further_invariants.py::test_every_theme_glass_colors_are_rgba_strings``
matches the ``rgba(r, g, b, a)`` shape but not the numeric ranges — a
theme could ship ``rgba(300, 0, 0, 2.5)`` and pass shape validation while
the browser silently ignores the invalid color and falls back to
transparent (breaking the frosted-glass overlays entirely).

``test_theme_and_dashboard_extra_invariants.py::test_theme_chart_colors_is_nonempty_hex_list``
locks the shape of ``chartColors`` but not their **uniqueness**. Two
data series that resolve to the same swatch collapse visually — a user
staring at the chart can no longer tell them apart.

This module closes those three numeric gaps:

  * HSL triplet components are in range: H in [0, 360], S in [0, 100],
    L in [0, 100].
  * rgba(...) components are in range: R/G/B in [0, 255], A in [0, 1].
  * chartColors are pairwise unique within each theme (after
    case-folding, so ``#F59E0B`` and ``#f59e0b`` count as the same
    swatch).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
THEMES = sorted((REPO_ROOT / "themes").glob("*.json"))

# Same shadcn-standard color tokens as test_asset_shape_invariants.py —
# duplicated here (not imported) to keep this module self-contained so
# either file can be run in isolation.
REQUIRED_HSL_KEYS = {
    "accent",
    "accentForeground",
    "background",
    "border",
    "card",
    "cardForeground",
    "destructive",
    "destructiveForeground",
    "foreground",
    "input",
    "muted",
    "mutedForeground",
    "primary",
    "primaryForeground",
    "ring",
    "secondary",
    "secondaryForeground",
}

GLASS_KEYS = (
    "glassBackground",
    "glassBorder",
    "glassShadow",
    "scrollbarThumb",
    "scrollbarThumbHover",
)

HSL_RE = re.compile(
    r"^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$"
)
RGBA_RE = re.compile(
    r"^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+|\d*\.\d+)\s*\)$"
)


def _load(path: Path) -> dict:
    return json.loads(path.read_text())


def test_required_hsl_triplet_components_are_in_valid_range():
    """HSL_RE in test_asset_shape_invariants.py locks the shape but not
    the numeric ranges. A theme that ships ``"999 200% 500%"`` passes
    shape validation but paints the surface as a browser fallback."""
    assert THEMES, "no themes discovered — smoke check failed"
    for f in THEMES:
        colors = _load(f)["colors"]
        for key in REQUIRED_HSL_KEYS:
            v = colors.get(key)
            assert isinstance(v, str), (
                f"{f.relative_to(REPO_ROOT)}: colors.{key} not a string"
            )
            m = HSL_RE.match(v)
            assert m, (
                f"{f.relative_to(REPO_ROOT)}: colors.{key}={v!r} "
                "must be 'H S% L%' HSL triplet"
            )
            h, s, l = float(m.group(1)), float(m.group(2)), float(m.group(3))
            assert 0 <= h <= 360, (
                f"{f.relative_to(REPO_ROOT)}: colors.{key} H={h} "
                "out of range [0, 360]"
            )
            assert 0 <= s <= 100, (
                f"{f.relative_to(REPO_ROOT)}: colors.{key} S={s}% "
                "out of range [0, 100]"
            )
            assert 0 <= l <= 100, (
                f"{f.relative_to(REPO_ROOT)}: colors.{key} L={l}% "
                "out of range [0, 100]"
            )


def test_glass_rgba_components_are_in_valid_range():
    """test_every_theme_glass_colors_are_rgba_strings matches shape but
    not numeric ranges. ``rgba(300, 0, 0, 2.5)`` is a valid shape but
    the browser silently drops the color and falls back to transparent,
    breaking the frosted-glass overlays."""
    for f in THEMES:
        colors = _load(f)["colors"]
        for key in GLASS_KEYS:
            v = colors.get(key)
            assert isinstance(v, str), (
                f"{f.relative_to(REPO_ROOT)}: colors.{key} not a string"
            )
            m = RGBA_RE.match(v)
            assert m, (
                f"{f.relative_to(REPO_ROOT)}: colors.{key}={v!r} "
                "must be an rgba(r, g, b, a) string"
            )
            r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
            a = float(m.group(4))
            for comp_name, comp in (("R", r), ("G", g), ("B", b)):
                assert 0 <= comp <= 255, (
                    f"{f.relative_to(REPO_ROOT)}: colors.{key} {comp_name}={comp} "
                    "out of range [0, 255]"
                )
            assert 0 <= a <= 1, (
                f"{f.relative_to(REPO_ROOT)}: colors.{key} A={a} "
                "out of range [0, 1]"
            )


def test_chart_colors_are_pairwise_unique_within_each_theme():
    """test_theme_chart_colors_is_nonempty_hex_list locks the shape;
    duplicates would silently collapse two chart series to one swatch.
    Compare case-folded so ``#F59E0B`` and ``#f59e0b`` count as the
    same color."""
    for f in THEMES:
        colors = _load(f)["colors"]
        chart = colors.get("chartColors")
        assert isinstance(chart, list) and chart, (
            f"{f.relative_to(REPO_ROOT)}: chartColors={chart!r} must be a "
            "non-empty list"
        )
        normalized = [c.lower() for c in chart if isinstance(c, str)]
        dupes = sorted({c for c in normalized if normalized.count(c) > 1})
        assert not dupes, (
            f"{f.relative_to(REPO_ROOT)}: duplicate chartColors {dupes} — "
            "two chart series will render with the same swatch"
        )
