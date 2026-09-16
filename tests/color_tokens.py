"""Shared color-token constants for theme invariant tests (see issue #582).

``REQUIRED_HSL_KEYS`` — the shadcn-standard color tokens that must be raw
HSL triplets ("H S% L%") in every theme — was duplicated verbatim between
``test_asset_shape_invariants.py`` and ``test_theme_color_range_invariants.py``,
with a comment in the latter admitting the copy was kept "to keep this
module self-contained". Both modules now import the set from here so the
token contract can't silently drift between the two suites.
"""
from __future__ import annotations

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
