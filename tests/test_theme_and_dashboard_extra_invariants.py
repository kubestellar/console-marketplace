"""Further structural invariants for marketplace theme and dashboard assets.

Complements tests/test_asset_shape_invariants{,_extra}.py with checks that
weren't yet asserted:

* theme colors.chartColors is a non-empty list of hex-color strings — the
  Console chart palette iterates this list; a non-list or empty list breaks
  every chart card rendered under the theme.
* theme font (when present) has string family/monoFamily and a weight dict
  whose values are positive ints — the loader spreads these into inline CSS
  and a non-numeric weight is silently dropped.
* dashboard.exported_at is not in the future — a future timestamp indicates a
  packaging error and shows as "Exported: <future date>" in the marketplace.

Every check runs against the current checkout only and passes today.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DASHBOARDS = sorted((REPO_ROOT / "dashboards").glob("*/dashboard.json"))
THEMES = sorted((REPO_ROOT / "themes").glob("*.json"))

HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


def _load(path: Path) -> dict:
    return json.loads(path.read_text())


# ─── Theme chart palette ───────────────────────────────────────────────────

def test_theme_chart_colors_is_nonempty_hex_list():
    assert THEMES
    for f in THEMES:
        d = _load(f)
        cc = d["colors"].get("chartColors")
        assert isinstance(cc, list) and cc, (
            f"{f.relative_to(REPO_ROOT)}: chartColors={cc!r} must be a "
            "non-empty list"
        )
        for i, v in enumerate(cc):
            assert isinstance(v, str) and HEX_RE.match(v), (
                f"{f.relative_to(REPO_ROOT)}: chartColors[{i}]={v!r} "
                "is not a #rgb/#rrggbb/#rrggbbaa hex color"
            )


# ─── Theme font shape ──────────────────────────────────────────────────────

def test_theme_font_when_present_has_expected_shape():
    for f in THEMES:
        d = _load(f)
        if "font" not in d:
            continue
        font = d["font"]
        assert isinstance(font, dict), f"{f.relative_to(REPO_ROOT)}: font not object"
        for key in ("family", "monoFamily"):
            assert isinstance(font.get(key), str) and font[key].strip(), (
                f"{f.relative_to(REPO_ROOT)}: font.{key}={font.get(key)!r} "
                "must be a non-empty string"
            )
        weight = font.get("weight")
        assert isinstance(weight, dict) and weight, (
            f"{f.relative_to(REPO_ROOT)}: font.weight must be a non-empty object"
        )
        for k, v in weight.items():
            assert isinstance(v, int) and not isinstance(v, bool) and 100 <= v <= 900, (
                f"{f.relative_to(REPO_ROOT)}: font.weight.{k}={v!r} "
                "must be an int in [100, 900]"
            )


# ─── Theme id uniqueness across files ──────────────────────────────────────

def test_theme_ids_are_unique_across_theme_files():
    ids = [_load(f)["id"] for f in THEMES]
    assert len(ids) == len(set(ids)), (
        f"duplicate theme ids across themes/*.json: {ids}"
    )


# ─── Dashboard exported_at not in future ───────────────────────────────────

def test_dashboard_exported_at_is_not_in_the_future():
    now = datetime.now(timezone.utc)
    for f in DASHBOARDS:
        d = _load(f)
        ea = d["exported_at"]
        ts = datetime.fromisoformat(ea.replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        assert ts <= now, (
            f"{f.relative_to(REPO_ROOT)}: exported_at={ea!r} is in the future"
        )
