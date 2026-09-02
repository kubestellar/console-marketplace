"""Top-level schema-key allowlist + emission-order invariants for the
first-party ``card-presets/`` directory.

The sibling ``tests/test_dashboard_schema_key_allowlist_invariants.py``
locks the top-level keys of shipped dashboards. This module does the
equivalent for the curated first-party ``card-presets/*.json`` bundle
that ships with the marketplace itself.

Scope note: the larger ``presets/`` directory holds a heterogeneous
CNCF preset catalog with multiple documented schema variants (some with
``description``/``category``/``project``/``cncf_status``, some with
``_placeholder``/``_help_wanted``, etc.) — it is NOT covered here, and
locking it would break contributor workflows that legitimately extend
the catalog with new metadata. The 4-file first-party bundle is
uniform, small, and consumed directly by the marketplace default-cards
importer, so it's the surface that most needs a closed schema:

  card-presets/cluster-overview.json
  card-presets/kubeflow-monitoring.json
  card-presets/pod-health-monitor.json
  card-presets/warning-event-stream.json

What is already locked elsewhere (test_asset_shape_invariants.py):

* ``format == "kc-card-preset-v1"``
* ``card_type`` is snake_case
* ``config`` is a dict

What this file adds for card-presets/*.json only:

1. Top-level keys are EXACTLY ``{format, card_type, title, config}`` —
   no extras, no missing. An accidentally-committed ``debug`` flag or
   a prototyped ``version`` field would slip through every existing
   test.
2. The four keys appear in the deterministic emission order
   (``format``, ``card_type``, ``title``, ``config``). A hand-edit that
   reshuffles keys hints at an unreviewed change.
3. ``config`` is currently ``{}`` on every shipped first-party preset.
   The first non-empty config lands with an explicit review — the
   moment ``config`` grows keys, the marketplace importer and the
   Console loader must both agree on them.
4. ``title`` is a non-empty single-line string (no leading/trailing
   whitespace, no embedded newlines or tabs) — the marketplace UI
   renders titles on a single line and stray whitespace breaks
   fuzzy card-search.

Runnable::

    pytest tests/test_card_preset_first_party_schema_key_allowlist_invariants.py
"""

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
CARD_PRESET_FILES = sorted((REPO_ROOT / "card-presets").glob("*.json"))

EXPECTED_TOP_LEVEL_KEYS = frozenset({
    "format", "card_type", "title", "config",
})

EXPECTED_KEY_ORDER = ("format", "card_type", "title", "config")


def _load(f: Path) -> dict:
    return json.loads(f.read_text(encoding="utf-8"))


def test_card_presets_directory_is_non_empty_smoke():
    """Guard the guard: if the dir is renamed and the glob goes stale
    every parametrized test is silently skipped, leaving the schema
    unguarded. Fail loudly instead."""
    assert CARD_PRESET_FILES, (
        "no files under card-presets/ — glob went stale? "
        "test_card_preset_first_party_schema_key_allowlist_invariants "
        "would otherwise report 0-tests-run and pass CI."
    )


@pytest.mark.parametrize("path", CARD_PRESET_FILES, ids=lambda p: p.name)
def test_first_party_preset_top_level_keys_are_exactly_the_allowlist(path: Path):
    d = _load(path)
    assert isinstance(d, dict), (
        f"{path.relative_to(REPO_ROOT)}: top-level is not an object"
    )
    keys = frozenset(d.keys())
    missing = EXPECTED_TOP_LEVEL_KEYS - keys
    extras = keys - EXPECTED_TOP_LEVEL_KEYS
    assert not missing, (
        f"{path.relative_to(REPO_ROOT)}: missing top-level keys "
        f"{sorted(missing)}. Every kc-card-preset-v1 asset in "
        f"card-presets/ must ship all four."
    )
    assert not extras, (
        f"{path.relative_to(REPO_ROOT)}: unexpected top-level keys "
        f"{sorted(extras)}. Update EXPECTED_TOP_LEVEL_KEYS in "
        f"{Path(__file__).name} deliberately if this is a real schema "
        f"addition; note that the sibling presets/ CNCF catalog uses "
        f"a wider schema on purpose and is NOT covered by this test."
    )


@pytest.mark.parametrize("path", CARD_PRESET_FILES, ids=lambda p: p.name)
def test_first_party_preset_top_level_keys_appear_in_canonical_order(path: Path):
    d = _load(path)
    actual = tuple(d.keys())
    assert actual == EXPECTED_KEY_ORDER, (
        f"{path.relative_to(REPO_ROOT)}: top-level keys appear in order "
        f"{actual!r}, expected {EXPECTED_KEY_ORDER!r}. If codegen "
        f"drift, regenerate; otherwise the hand-edit needs review."
    )


@pytest.mark.parametrize("path", CARD_PRESET_FILES, ids=lambda p: p.name)
def test_first_party_preset_config_is_empty_dict(path: Path):
    """Every shipped first-party preset ships ``"config": {}``.
    The first non-empty config lands with an explicit review — the
    moment config grows keys, the marketplace importer, Console
    loader, and every downstream serializer must all agree on them."""
    d = _load(path)
    cfg = d.get("config")
    assert cfg == {}, (
        f"{path.relative_to(REPO_ROOT)}: config={cfg!r}, expected empty "
        f"dict. If this preset genuinely needs non-empty config, "
        f"update this test AND confirm the Console loader knows the "
        f"new config keys."
    )


@pytest.mark.parametrize("path", CARD_PRESET_FILES, ids=lambda p: p.name)
def test_first_party_preset_title_is_clean_single_line_string(path: Path):
    """The marketplace UI renders titles on a single line. Leading/
    trailing whitespace and embedded newlines produce ugly renders
    and break card-search fuzzy matching (which is stripped-string
    based)."""
    d = _load(path)
    title = d.get("title")
    assert isinstance(title, str), (
        f"{path.relative_to(REPO_ROOT)}: title is "
        f"{type(title).__name__}, expected str"
    )
    assert title, f"{path.relative_to(REPO_ROOT)}: title is empty"
    assert title == title.strip(), (
        f"{path.relative_to(REPO_ROOT)}: title {title!r} has "
        f"leading/trailing whitespace"
    )
    for ch, name in ((chr(10), "newline"), (chr(13), "carriage-return"), (chr(9), "tab")):
        assert ch not in title, (
            f"{path.relative_to(REPO_ROOT)}: title {title!r} "
            f"contains a {name}"
        )
