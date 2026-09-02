"""Top-level schema-key allowlist invariants for shipped dashboards.

The existing invariants in ``tests/test_asset_shape_invariants.py``,
``tests/test_asset_further_shape_invariants.py``, and
``tests/test_dashboard_grid_further_invariants.py`` already lock:

* ``format == "kc-dashboard-v1"``
* every card has ``card_type``, ``config``, ``position``
* ``position`` keys are EXACTLY ``{x, y, w, h}`` (no extras)
* ``layout`` keys are EXACTLY ``{columns}``
* ``exported_at`` is a parseable ISO-8601 UTC timestamp not in the future

What is NOT yet locked:

* the top-level dashboard object may currently sprout ANY extra key
  (``version``, ``owner``, ``tags``, ``deprecated``, ...) without any
  test noticing. That was fine while the schema was open-ended, but
  each shipped dashboard is now consumed by both the marketplace UI
  and the registry validator; a stray key silently changes behaviour
  when the renderer grows a matching concept months later.
* similarly, each card object may currently sprout ANY extra key
  alongside ``card_type``/``config``/``position`` (a leftover ``id``,
  a prototyped ``title``, an accidentally-committed ``debug`` flag)
  and pass every existing invariant.

This module makes both surfaces closed sets. Adding a new key becomes
an explicit review across every shipped dashboard rather than a silent
per-file behaviour change.

Runnable the same way as the sibling test modules::

    pytest tests/test_dashboard_schema_key_allowlist_invariants.py
"""

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
DASHBOARDS = sorted((REPO_ROOT / "dashboards").glob("*/dashboard.json"))

# The complete, closed set of top-level keys currently emitted by
# scripts/export_dashboard.py and consumed by the marketplace UI. Any
# addition MUST be a deliberate schema change: bump this set here AND
# audit every shipped dashboard for the new field.
EXPECTED_DASHBOARD_TOP_LEVEL_KEYS = frozenset({
    "format", "name", "description", "exported_at", "layout", "cards",
})

# The complete, closed set of per-card keys. Position and config
# structure is locked elsewhere; this test locks the OUTER shape only.
EXPECTED_CARD_TOP_LEVEL_KEYS = frozenset({
    "card_type", "config", "position",
})


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    "dashboard_path", DASHBOARDS,
    ids=[p.parent.name for p in DASHBOARDS],
)
def test_dashboard_top_level_keys_are_exactly_the_expected_set(
    dashboard_path: Path,
) -> None:
    """The top-level dashboard object has EXACTLY the six expected keys —
    no missing key, no stray extra key.

    A stray key (say a leftover ``owner`` from an early spec, or a
    ``debug`` flag) will silently start driving behaviour the day
    the renderer grows a matching concept. Locking the set here
    turns any addition into an explicit review across every shipped
    dashboard.
    """
    d = _load(dashboard_path)
    assert isinstance(d, dict), (
        f"{dashboard_path.relative_to(REPO_ROOT)}: top-level JSON is not a dict"
    )
    observed = set(d.keys())
    missing = EXPECTED_DASHBOARD_TOP_LEVEL_KEYS - observed
    extra = observed - EXPECTED_DASHBOARD_TOP_LEVEL_KEYS
    assert not missing and not extra, (
        f"{dashboard_path.relative_to(REPO_ROOT)}: top-level keys drift.\n"
        f"  missing: {sorted(missing)}\n"
        f"  extra:   {sorted(extra)}\n"
        f"If a new top-level key is deliberate, update "
        f"EXPECTED_DASHBOARD_TOP_LEVEL_KEYS in this file and audit every "
        f"shipped dashboard for the new field before merging."
    )


@pytest.mark.parametrize(
    "dashboard_path", DASHBOARDS,
    ids=[p.parent.name for p in DASHBOARDS],
)
def test_every_card_top_level_keys_are_exactly_the_expected_set(
    dashboard_path: Path,
) -> None:
    """Every card object has EXACTLY the three expected keys —
    ``card_type``, ``config``, ``position`` — no more, no less.

    Related invariants already assert that all three keys are present
    (``test_asset_shape_invariants``); this is the missing closed-set
    check that guards against stray keys such as a prototyped
    ``title``, an accidentally-committed ``debug`` flag, or a
    leftover ``id`` from a refactor.
    """
    d = _load(dashboard_path)
    cards = d.get("cards")
    assert isinstance(cards, list) and cards, (
        f"{dashboard_path.relative_to(REPO_ROOT)}: cards missing or empty"
    )
    offenders: list[tuple[int, list[str], list[str]]] = []
    for i, card in enumerate(cards):
        assert isinstance(card, dict), (
            f"{dashboard_path.relative_to(REPO_ROOT)} card[{i}] "
            f"is not a dict: {type(card).__name__}"
        )
        observed = set(card.keys())
        missing = EXPECTED_CARD_TOP_LEVEL_KEYS - observed
        extra = observed - EXPECTED_CARD_TOP_LEVEL_KEYS
        if missing or extra:
            offenders.append((i, sorted(missing), sorted(extra)))
    assert not offenders, (
        f"{dashboard_path.relative_to(REPO_ROOT)}: card top-level keys drift.\n"
        + "\n".join(
            f"  card[{i}]: missing={m}, extra={e}"
            for i, m, e in offenders
        )
        + "\nIf a new per-card key is deliberate, update "
        "EXPECTED_CARD_TOP_LEVEL_KEYS in this file and audit every "
        "shipped dashboard's cards[] for the new field before merging."
    )


def test_dashboard_discovery_found_at_least_one_dashboard() -> None:
    """Guard against a future reorg silently emptying the DASHBOARDS glob.

    If ``dashboards/*/dashboard.json`` ever stops matching (e.g. a
    directory rename), both parametrised tests above would collect
    zero cases and silently pass — the very failure mode they exist
    to prevent. This assertion turns the glob's emptiness into a
    hard test failure.
    """
    assert DASHBOARDS, (
        f"no dashboards discovered under {REPO_ROOT / 'dashboards'}/*/dashboard.json — "
        "the parametrised invariants above would silently collect zero cases."
    )
