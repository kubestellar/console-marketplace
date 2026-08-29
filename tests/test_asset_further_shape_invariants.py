"""Additional structural invariants for marketplace asset files.

The existing suites lock down registry ↔ filesystem bijection, card-preset
title/card_type presence, dashboard grid geometry, and theme id-stem parity.
This file closes several gaps that would otherwise let subtle authoring
mistakes ship silently:

* Filename-stem collisions across ``card-presets/`` and ``presets/`` — the
  registry ``downloadUrl`` path is the only disambiguator, so two files
  sharing a stem (e.g. ``foo.json`` in both dirs) invite copy-paste bugs
  where a registry entry points at the wrong asset.
* Dashboard display names are unique — the Marketplace list view keys off
  the human name; duplicates render as ambiguous rows the user cannot tell
  apart.
* Preset titles are unique across ``card-presets/`` and ``presets/`` — the
  card-picker UI shows one flat list keyed by title.
* Preset (card-preset) files carry the four required top-level keys
  (``format``, ``card_type``, ``title``, ``config``). Existing shape tests
  check ``card_type``/``title``/``config`` individually; this asserts the
  set is complete so a rename typo (e.g. ``configs`` instead of ``config``)
  is caught by the shape gate rather than at UI-load time.
* Dashboard card ``position`` dicts contain exactly ``{x, y, w, h}`` — a
  typo like ``hight`` would slip past the existing "int and >= 0" check on
  the four canonical keys because the misspelled key would simply be
  ignored, silently losing the intended geometry.
* Every dashboard uses grid row ``y == 0`` — a dashboard whose topmost card
  sits at y > 0 renders with dead space above the fold, indicating an
  authoring mistake (leftover from a deleted top card, or off-by-one from a
  spec copied out of a bigger layout).
* Every JSON asset file ends with exactly one LF and has no UTF-8 BOM —
  BOMs break ``json.load`` on some tool paths and missing final newlines
  produce noisy no-op diffs when editors auto-append one on save.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

CARD_PRESETS = sorted((REPO_ROOT / "card-presets").glob("*.json"))
PRESETS = sorted((REPO_ROOT / "presets").glob("*.json"))
DASHBOARDS = sorted((REPO_ROOT / "dashboards").glob("*/dashboard.json"))
THEMES = sorted((REPO_ROOT / "themes").glob("*.json"))
ALL_JSON = CARD_PRESETS + PRESETS + DASHBOARDS + THEMES

REQUIRED_PRESET_KEYS = {"format", "card_type", "title", "config"}
POSITION_KEYS = {"x", "y", "w", "h"}


def _load(p: Path) -> dict:
    return json.loads(p.read_text())


# ─── Namespace-collision guards ────────────────────────────────────────────

def test_card_preset_and_preset_stems_do_not_collide():
    """A stem present in both ``card-presets/`` and ``presets/`` would let a
    registry entry silently resolve to the wrong file after a re-generation
    of downloadUrl paths."""
    cp = {f.stem for f in CARD_PRESETS}
    p = {f.stem for f in PRESETS}
    collisions = sorted(cp & p)
    assert not collisions, (
        f"filename-stem collisions between card-presets/ and presets/: "
        f"{collisions}"
    )


# ─── Display-name uniqueness ───────────────────────────────────────────────

def test_dashboard_names_are_unique():
    """Marketplace list rows key off ``name`` — duplicate names render as
    indistinguishable rows in the UI."""
    names = [_load(f)["name"] for f in DASHBOARDS]
    dupes = [n for n, c in Counter(names).items() if c > 1]
    assert not dupes, f"duplicate dashboard names: {dupes}"


def test_preset_titles_are_unique_across_directories():
    """The card-picker shows one flat list of preset titles; a collision
    means the user cannot tell two entries apart."""
    titles = [_load(f)["title"] for f in CARD_PRESETS + PRESETS]
    dupes = [t for t, c in Counter(titles).items() if c > 1]
    assert not dupes, f"duplicate preset titles: {dupes}"


# ─── Preset key-completeness (typo guard) ──────────────────────────────────

def test_preset_files_have_all_required_top_level_keys():
    """A rename typo like ``configs`` or ``cardType`` would silently break
    the loader; require the canonical four to be present on every preset."""
    for f in CARD_PRESETS + PRESETS:
        d = _load(f)
        missing = REQUIRED_PRESET_KEYS - set(d.keys())
        assert not missing, (
            f"{f.relative_to(REPO_ROOT)}: missing required top-level "
            f"keys {sorted(missing)}"
        )


# ─── Dashboard position typo guard ─────────────────────────────────────────

def test_dashboard_card_position_has_exactly_xywh_keys():
    """The grid renderer reads only ``x/y/w/h``; a mistyped key like
    ``hight`` would be silently discarded and default the dimension to
    something unexpected."""
    for f in DASHBOARDS:
        d = _load(f)
        for i, c in enumerate(d["cards"]):
            keys = set(c["position"].keys())
            assert keys == POSITION_KEYS, (
                f"{f.relative_to(REPO_ROOT)} card[{i}]: position keys "
                f"{sorted(keys)} != {sorted(POSITION_KEYS)}"
            )


# ─── Dashboard grid-origin usage ───────────────────────────────────────────

def test_every_dashboard_uses_grid_row_zero():
    """A dashboard whose topmost card sits at y > 0 renders with dead space
    above the fold — almost always a leftover from a deleted top card or an
    off-by-one from a copied spec."""
    for f in DASHBOARDS:
        d = _load(f)
        min_y = min(c["position"]["y"] for c in d["cards"])
        assert min_y == 0, (
            f"{f.relative_to(REPO_ROOT)}: topmost card y={min_y} — "
            "dashboard opens with a dead row above the fold."
        )


# ─── File hygiene ──────────────────────────────────────────────────────────

def test_asset_json_files_end_with_single_newline_and_have_no_bom():
    """A missing final newline produces noisy diffs when editors auto-append
    one on save; a UTF-8 BOM (``\\xef\\xbb\\xbf`` prefix) breaks strict
    ``json.load`` on some tool paths."""
    for f in ALL_JSON:
        b = f.read_bytes()
        assert not b.startswith(b"\xef\xbb\xbf"), (
            f"{f.relative_to(REPO_ROOT)}: file starts with UTF-8 BOM"
        )
        assert b.endswith(b"\n"), (
            f"{f.relative_to(REPO_ROOT)}: file does not end with a newline"
        )
        assert not b.endswith(b"\n\n"), (
            f"{f.relative_to(REPO_ROOT)}: file ends with more than one "
            "trailing newline"
        )
