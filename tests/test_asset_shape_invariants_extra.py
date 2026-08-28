"""Additional structural invariants for shipped marketplace assets.

Extends tests/test_asset_shape_invariants.py with checks for shape guarantees
that weren't yet asserted:

* dashboard.exported_at is a parseable ISO-8601 UTC timestamp
* dashboard.description is a non-empty string
* each dashboard card.config (when present) is a dict
* every registry item of type "dashboard" resolves to a real
  dashboards/<id>/dashboard.json (id ↔ directory bijection)
* optional visual-effect flags on themes ("starField", "glowEffects",
  "gradientAccents") are booleans when present — anything else is silently
  coerced/ignored by the loader.

Every check runs against the current checkout only and passes today.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DASHBOARDS = sorted((REPO_ROOT / "dashboards").glob("*/dashboard.json"))
THEMES = sorted((REPO_ROOT / "themes").glob("*.json"))


def _load(path: Path) -> dict:
    return json.loads(path.read_text())


# ─── Dashboard shape ───────────────────────────────────────────────────────

def test_dashboard_exported_at_is_iso_utc_timestamp():
    """`exported_at` is surfaced verbatim in the marketplace UI and used for
    sort/filter — a malformed value renders as 'Invalid Date'."""
    assert DASHBOARDS
    for f in DASHBOARDS:
        d = _load(f)
        ea = d.get("exported_at")
        assert isinstance(ea, str) and ea, (
            f"{f.relative_to(REPO_ROOT)}: exported_at={ea!r}"
        )
        # Python's fromisoformat accepts 'Z' only from 3.11+; normalize.
        try:
            datetime.fromisoformat(ea.replace("Z", "+00:00"))
        except ValueError as e:
            raise AssertionError(
                f"{f.relative_to(REPO_ROOT)}: exported_at={ea!r} "
                f"is not a valid ISO-8601 timestamp ({e})"
            )


def test_dashboard_has_nonempty_description():
    """The marketplace card lists show `description`; blanks look broken."""
    for f in DASHBOARDS:
        d = _load(f)
        desc = d.get("description")
        assert isinstance(desc, str) and desc.strip(), (
            f"{f.relative_to(REPO_ROOT)}: description={desc!r}"
        )


def test_dashboard_card_config_is_dict_when_present():
    """The console loader unpacks card.config with the spread operator — a
    non-object value throws at render time."""
    for f in DASHBOARDS:
        d = _load(f)
        for i, c in enumerate(d["cards"]):
            if "config" in c:
                assert isinstance(c["config"], dict), (
                    f"{f.relative_to(REPO_ROOT)} card[{i}]: "
                    f"config={c['config']!r} must be an object"
                )


# ─── Registry ↔ dashboard directory bijection ──────────────────────────────

def test_registry_dashboard_items_have_matching_directory():
    """items[i].id must be the dashboard directory basename; a rename in one
    place without the other silently 404s at import time."""
    reg = _load(REPO_ROOT / "registry.json")
    dashboard_items = [it for it in reg["items"] if it.get("type") == "dashboard"]
    assert dashboard_items, "no dashboard items in registry"
    for it in dashboard_items:
        p = REPO_ROOT / "dashboards" / it["id"] / "dashboard.json"
        assert p.exists(), (
            f"registry item id={it['id']!r} has no matching "
            f"dashboards/{it['id']}/dashboard.json"
        )


# ─── Theme optional visual-effect flags ────────────────────────────────────

_OPTIONAL_BOOL_FLAGS = ("starField", "glowEffects", "gradientAccents")


def test_theme_optional_visual_effect_flags_are_bools_when_present():
    """The console reads these directly as boolean toggles; a non-bool would
    be truthy for any non-empty value and silently break intent."""
    for f in THEMES:
        d = _load(f)
        for k in _OPTIONAL_BOOL_FLAGS:
            if k in d:
                assert isinstance(d[k], bool), (
                    f"{f.relative_to(REPO_ROOT)}: {k}={d[k]!r} must be bool"
                )
