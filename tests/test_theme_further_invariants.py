"""Further theme JSON invariants for shipped marketplace themes.

test_asset_shape_invariants.py locks in the shadcn HSL-triplet color
keys, the id/name/dark flags, the chartColors hex list, the font shape,
and the stable-color-key-set contract. This module targets a further
class of theme drift that would render silently at runtime but produce
visually broken UI:

  * The **brand color triplet** (brandPrimary/brandSecondary/brandTertiary)
    is present on every theme and each value is a valid #hex string.
    These drive the top-nav gradient and hero blocks; if a theme drops
    one or ships a raw HSL triplet by accident, the header renders with
    default (broken) colors.
  * The **semantic status colors** (success/warning/error/info) are
    hex strings. These are consumed by badges/toasts — an HSL triplet
    accidentally left in place ends up as literal text inside a
    color-mix() call in the browser.
  * The **glass/scrollbar colors** are rgba(...) strings. That's the
    only form the console's CSS filters accept; a bare hex breaks the
    frosted-glass overlays.
  * Theme **description and author** fields are non-empty strings.
    Blank descriptions land as literal empty rows in the marketplace UI.
  * Font **weight** is strictly monotonic (normal < medium <
    semibold < bold). A theme that ships weights out of order silently
    inverts h1/h2 emphasis wherever the console picks a weight by name.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
THEMES = sorted((REPO_ROOT / "themes").glob("*.json"))

# #rgb, #rrggbb, #rrggbbaa (case-insensitive).
HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

# rgba(R, G, B, A) — components may be int/float, A in [0, 1]. Whitespace
# tolerant so we accept the formatting the themes actually ship.
RGBA_RE = re.compile(
    r"^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(?:\d+|\d*\.\d+)\s*\)$"
)

BRAND_KEYS = ("brandPrimary", "brandSecondary", "brandTertiary")
SEMANTIC_STATUS_KEYS = ("success", "warning", "error", "info")
GLASS_KEYS = (
    "glassBackground",
    "glassBorder",
    "glassShadow",
    "scrollbarThumb",
    "scrollbarThumbHover",
)
WEIGHT_ORDER = ("normal", "medium", "semibold", "bold")


def _load(path: Path) -> dict:
    return json.loads(path.read_text())


def test_every_theme_has_brand_color_triplet_as_hex():
    """brandPrimary/Secondary/Tertiary drive the top-nav and hero
    gradient. Absent or non-hex values render defaults (broken)."""
    assert THEMES
    for f in THEMES:
        colors = _load(f)["colors"]
        for key in BRAND_KEYS:
            v = colors.get(key)
            assert isinstance(v, str) and HEX_RE.match(v), (
                f"{f.relative_to(REPO_ROOT)}: colors.{key}={v!r} "
                "must be a #rgb/#rrggbb/#rrggbbaa hex color"
            )


def test_every_theme_semantic_status_colors_are_hex():
    """success/warning/error/info are consumed by badges and toasts as
    hex strings. An accidental HSL triplet slipping in here ends up as
    literal text inside color-mix() calls in the browser."""
    for f in THEMES:
        colors = _load(f)["colors"]
        for key in SEMANTIC_STATUS_KEYS:
            v = colors.get(key)
            assert isinstance(v, str) and HEX_RE.match(v), (
                f"{f.relative_to(REPO_ROOT)}: colors.{key}={v!r} "
                "must be a hex string (badges/toasts)"
            )


def test_every_theme_glass_colors_are_rgba_strings():
    """glass* and scrollbarThumb* need alpha for the frosted-glass
    overlays. Bare #hex breaks the CSS filter chain."""
    for f in THEMES:
        colors = _load(f)["colors"]
        for key in GLASS_KEYS:
            v = colors.get(key)
            assert isinstance(v, str) and RGBA_RE.match(v), (
                f"{f.relative_to(REPO_ROOT)}: colors.{key}={v!r} "
                "must be an rgba(r, g, b, a) string"
            )


def test_every_theme_has_nonempty_description_and_author():
    """Blank description shows as a hollow row in the theme picker;
    blank author is a UI + attribution regression."""
    for f in THEMES:
        d = _load(f)
        desc = d.get("description")
        assert isinstance(desc, str) and desc.strip(), (
            f"{f.relative_to(REPO_ROOT)}: description={desc!r} "
            "must be a non-empty string"
        )
        author = d.get("author")
        assert isinstance(author, str) and author.strip(), (
            f"{f.relative_to(REPO_ROOT)}: author={author!r} "
            "must be a non-empty string"
        )


def test_every_theme_font_weights_are_monotonic():
    """font.weight.normal < .medium < .semibold < .bold. Out-of-order
    weights silently invert emphasis wherever the console picks a
    weight by name (h1/h2/callouts)."""
    for f in THEMES:
        d = _load(f)
        font = d.get("font")
        if not isinstance(font, dict):
            continue
        weight = font.get("weight")
        if not isinstance(weight, dict):
            continue
        # All four rungs must be integers if font.weight is present at all
        # (it's shipped on every current theme).
        values = []
        for rung in WEIGHT_ORDER:
            w = weight.get(rung)
            assert isinstance(w, int) and 100 <= w <= 900, (
                f"{f.relative_to(REPO_ROOT)}: font.weight.{rung}={w!r} "
                "must be an integer in [100, 900]"
            )
            values.append(w)
        for i in range(len(values) - 1):
            assert values[i] < values[i + 1], (
                f"{f.relative_to(REPO_ROOT)}: font.weight not strictly "
                f"monotonic: {WEIGHT_ORDER[i]}={values[i]} vs "
                f"{WEIGHT_ORDER[i + 1]}={values[i + 1]}"
            )


def test_every_theme_font_family_is_nonempty_string():
    """font.family is written verbatim into a CSS font-family declaration;
    an empty or missing value falls back to browser default and breaks
    the theme's intended typography."""
    for f in THEMES:
        d = _load(f)
        font = d.get("font")
        if not isinstance(font, dict):
            continue
        for key in ("family", "monoFamily"):
            v = font.get(key)
            assert isinstance(v, str) and v.strip(), (
                f"{f.relative_to(REPO_ROOT)}: font.{key}={v!r} "
                "must be a non-empty CSS font-family string"
            )
