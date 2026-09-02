"""Cross-consistency invariants that tie registry.json entries to the
metadata fields on their on-disk asset files.

`test_asset_shape_invariants.py` already asserts:

  * `items[i].name` matches `dashboards/<id>/dashboard.json`'s `name`
  * `items[i].cardCount` matches `len(cards)`
  * theme registry entries agree with their asset's `id` and `name`

It does NOT lock down:

  * dashboard `description` lockstep between registry entry and asset —
    the marketplace UI shows the registry description in the catalog
    card and the asset description in the imported dashboard header,
    so a drift there ships two different sentences for the same
    dashboard.
  * card-preset assets carrying a non-empty `title` — every card-preset
    asset today has a `title` field (used to caption the imported
    card), but nothing prevents an accidentally-empty or missing title
    slipping through.

These invariants currently hold for every entry in `registry.json`; this
module locks that in so a future edit that breaks either invariant fails
in CI instead of at UI-render time.
"""

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / "registry.json"


def _load(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _asset_path_from_download_url(url: str) -> Path:
    """Reverse the `downloadUrl` back into a repo-relative asset path.

    Duplicates the tiny helper of the same name in
    ``test_asset_shape_invariants.py`` so this file is self-contained
    and does not depend on pytest resolving cross-module imports.
    """
    tail = url.split("console-marketplace/", 1)[1]
    return REPO_ROOT / tail.split("/", 1)[1]


@pytest.fixture(scope="module")
def registry() -> dict:
    return _load(REGISTRY_PATH)


def test_registry_dashboard_items_match_asset_description(registry):
    """items[i].description must equal
    dashboards/<id>/dashboard.json.description.

    Existing suite locks name and cardCount; description drift is just
    as user-visible (marketplace catalog card vs. imported dashboard
    header) and equally worth catching pre-merge.
    """
    mismatched = []
    for it in registry["items"]:
        if it["type"] != "dashboard":
            continue
        asset = _load(REPO_ROOT / "dashboards" / it["id"] / "dashboard.json")
        if it["description"] != asset["description"]:
            mismatched.append(
                (it["id"], it["description"], asset["description"])
            )
    assert not mismatched, (
        "dashboard registry entries whose description does not match "
        "the on-disk asset description: "
        f"{mismatched}"
    )


def test_card_preset_asset_files_have_nonempty_title(registry):
    """Every registry `card-preset` entry's asset must ship a non-empty
    string `title`. The console loader uses this as the card caption on
    import; a blank or missing title renders as an untitled card.
    """
    bad = []
    for p in registry["presets"]:
        if p["type"] != "card-preset":
            continue
        asset_path = _asset_path_from_download_url(p["downloadUrl"])
        if not asset_path.exists():
            # test_registry_asset_reachability already catches missing files;
            # skip here to avoid double-reporting.
            continue
        asset = _load(asset_path)
        title = asset.get("title")
        if not (isinstance(title, str) and title.strip()):
            bad.append((p["id"], repr(title)))
    assert not bad, (
        "card-preset assets with missing or empty `title` field "
        f"(would render as an untitled card on import): {bad}"
    )
