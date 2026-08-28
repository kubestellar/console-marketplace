"""Structural invariants for shipped marketplace assets.

Complements tests/test_registry_asset_reachability.py (which enforces the
filesystem↔registry bijection) by asserting internal shape of the JSON assets
themselves so they can't drift into a state that would break the console
loader at runtime.

Every check runs against the *current* checkout only — no network — and passes
today. A regression in any invariant is a real bug.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
DASHBOARDS = sorted((REPO_ROOT / "dashboards").glob("*/dashboard.json"))
CARD_PRESETS = sorted((REPO_ROOT / "card-presets").glob("*.json"))
PRESETS = sorted((REPO_ROOT / "presets").glob("*.json"))
THEMES = sorted((REPO_ROOT / "themes").glob("*.json"))

HSL_RE = re.compile(r"^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$")
SNAKE_RE = re.compile(r"^[a-z][a-z0-9_]*$")

# Shadcn-standard color tokens that must be raw HSL triplets ("H S% L%") in
# every theme. Brand/glass/scrollbar/chart tokens are excluded — themes may
# use hex, rgba, or arrays for those.
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


def _load(path: Path) -> dict:
    return json.loads(path.read_text())


# ─── Format tag invariants ─────────────────────────────────────────────────

def test_every_dashboard_uses_dashboard_format_tag():
    """Console loader dispatches on `format`; a stale tag silently 404s."""
    assert DASHBOARDS, "no dashboards discovered — smoke check failed"
    for f in DASHBOARDS:
        d = _load(f)
        assert d.get("format") == "kc-dashboard-v1", (
            f"{f.relative_to(REPO_ROOT)}: format={d.get('format')!r}"
        )


def test_every_card_preset_and_preset_uses_card_preset_format_tag():
    assert CARD_PRESETS and PRESETS
    for f in CARD_PRESETS + PRESETS:
        d = _load(f)
        assert d.get("format") == "kc-card-preset-v1", (
            f"{f.relative_to(REPO_ROOT)}: format={d.get('format')!r}"
        )


# ─── Card-preset & preset shape ────────────────────────────────────────────

def test_card_preset_files_have_title_card_type_and_config():
    for f in CARD_PRESETS + PRESETS:
        d = _load(f)
        assert isinstance(d.get("title"), str) and d["title"].strip(), f
        assert isinstance(d.get("card_type"), str), f
        assert SNAKE_RE.match(d["card_type"]), (
            f"{f.relative_to(REPO_ROOT)}: card_type={d['card_type']!r} "
            "is not snake_case — will not match Console loader dispatch."
        )
        assert isinstance(d.get("config"), dict), f


# ─── Dashboard shape ───────────────────────────────────────────────────────

def _rects_overlap(a: dict, b: dict) -> bool:
    return not (
        a["x"] + a["w"] <= b["x"]
        or b["x"] + b["w"] <= a["x"]
        or a["y"] + a["h"] <= b["y"]
        or b["y"] + b["h"] <= a["y"]
    )


def test_dashboards_have_layout_columns_and_nonempty_cards():
    for f in DASHBOARDS:
        d = _load(f)
        assert isinstance(d.get("name"), str) and d["name"].strip(), f
        cols = d.get("layout", {}).get("columns")
        assert isinstance(cols, int) and cols > 0, (
            f"{f.relative_to(REPO_ROOT)}: layout.columns={cols!r}"
        )
        cards = d.get("cards")
        assert isinstance(cards, list) and len(cards) > 0, f


def test_dashboard_card_positions_fit_layout_and_are_positive():
    for f in DASHBOARDS:
        d = _load(f)
        cols = d["layout"]["columns"]
        for i, c in enumerate(d["cards"]):
            p = c.get("position", {})
            for k in ("x", "y", "w", "h"):
                assert isinstance(p.get(k), int), (f, i, k, p)
                assert p[k] >= 0, (f, i, k, p)
            assert p["w"] > 0 and p["h"] > 0, (f, i, p)
            assert p["x"] + p["w"] <= cols, (
                f"{f.relative_to(REPO_ROOT)} card[{i}]: x+w={p['x']+p['w']} "
                f"exceeds layout.columns={cols} — card will clip in the grid."
            )


def test_dashboard_cards_do_not_overlap():
    """Overlapping grid rectangles render on top of each other in the UI."""
    for f in DASHBOARDS:
        d = _load(f)
        positions = [c["position"] for c in d["cards"]]
        for i in range(len(positions)):
            for j in range(i + 1, len(positions)):
                assert not _rects_overlap(positions[i], positions[j]), (
                    f"{f.relative_to(REPO_ROOT)}: cards[{i}] and cards[{j}] "
                    f"overlap ({positions[i]} vs {positions[j]})."
                )


def test_dashboard_card_types_are_snake_case():
    for f in DASHBOARDS:
        d = _load(f)
        for i, c in enumerate(d["cards"]):
            assert SNAKE_RE.match(c["card_type"]), (
                f"{f.relative_to(REPO_ROOT)} card[{i}]: card_type={c['card_type']!r}"
            )


# ─── Theme shape ───────────────────────────────────────────────────────────

def test_theme_filename_matches_id():
    """Registry lookups use the id — if it drifts from the filename basename,
    the registry entry points at the wrong file (or vice versa)."""
    for f in THEMES:
        d = _load(f)
        stem = f.stem  # 'amber-glow' from 'amber-glow.json'
        assert d.get("id") == stem, (
            f"{f.relative_to(REPO_ROOT)}: id={d.get('id')!r} != stem={stem!r}"
        )


def test_themes_share_a_stable_color_key_set():
    """A new key added to only one theme causes UI regressions on the others
    (fall-through to browser defaults or CSS var 'undefined')."""
    assert len(THEMES) >= 2
    key_sets = [frozenset(_load(f)["colors"].keys()) for f in THEMES]
    reference = key_sets[0]
    for f, ks in zip(THEMES, key_sets):
        missing = reference - ks
        extra = ks - reference
        assert not missing and not extra, (
            f"{f.relative_to(REPO_ROOT)}: color-key drift vs "
            f"{THEMES[0].relative_to(REPO_ROOT)} "
            f"(missing={sorted(missing)}, extra={sorted(extra)})"
        )


def test_required_hsl_keys_are_hsl_triplet_strings():
    """shadcn tokens are consumed by CSS `hsl(var(--x))` — non-triplet values
    render as garbage. Brand/glass tokens are exempt (may be hex/rgba)."""
    for f in THEMES:
        d = _load(f)
        for k in REQUIRED_HSL_KEYS:
            v = d["colors"].get(k)
            assert isinstance(v, str) and HSL_RE.match(v), (
                f"{f.relative_to(REPO_ROOT)}: colors.{k}={v!r} "
                "must be 'H S% L%' HSL triplet."
            )


def test_theme_has_id_name_and_dark_flag():
    for f in THEMES:
        d = _load(f)
        assert isinstance(d.get("id"), str) and d["id"], f
        assert isinstance(d.get("name"), str) and d["name"], f
        assert isinstance(d.get("dark"), bool), (
            f"{f.relative_to(REPO_ROOT)}: dark={d.get('dark')!r} must be bool"
        )


# ─── Registry ↔ asset cross-checks ─────────────────────────────────────────

@pytest.fixture(scope="module")
def registry() -> dict:
    return _load(REPO_ROOT / "registry.json")


def test_registry_dashboard_items_match_asset_name_and_card_count(registry):
    """items[i].name must equal dashboards/<id>/dashboard.json.name; cardCount
    must equal len(cards). Otherwise the marketplace UI shows one string and
    the imported dashboard is titled another."""
    for it in registry["items"]:
        assert it["type"] == "dashboard"
        asset = _load(REPO_ROOT / "dashboards" / it["id"] / "dashboard.json")
        assert it["name"] == asset["name"], (
            f"items[{it['id']}]: name={it['name']!r} != asset.name={asset['name']!r}"
        )
        assert it["cardCount"] == len(asset["cards"]), (
            f"items[{it['id']}]: cardCount={it['cardCount']} != "
            f"len(asset.cards)={len(asset['cards'])}"
        )


def _asset_path_from_download_url(url: str) -> Path:
    tail = url.split("console-marketplace/", 1)[1]
    # tail = '<ref>/<path...>'
    return REPO_ROOT / tail.split("/", 1)[1]


def test_registry_card_preset_entries_have_cardcount_one(registry):
    for p in registry["presets"]:
        if p["type"] == "card-preset":
            assert p.get("cardCount") == 1, (
                f"presets[{p['id']}]: cardCount={p.get('cardCount')} != 1"
            )


def test_registry_theme_presets_match_asset_id_and_name(registry):
    for p in registry["presets"]:
        if p["type"] != "theme":
            continue
        asset = _load(_asset_path_from_download_url(p["downloadUrl"]))
        assert p["id"] == asset["id"], (
            f"presets[{p['id']}]: id != asset.id={asset['id']!r}"
        )
        assert p["name"] == asset["name"], (
            f"presets[{p['id']}]: name={p['name']!r} != asset.name={asset['name']!r}"
        )
