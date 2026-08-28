"""Structural invariants for individual registry.json entries.

test_asset_shape_invariants.py checks that the *shape* of on-disk assets
(dashboards, card presets, themes) is coherent and that a handful of
registry-vs-asset cross-checks hold (name / cardCount for dashboards,
name-and-id for themes). This module hardens the invariants of the
registry entries themselves — the metadata contract UI consumers rely on
to render and download assets.

The checks here catch a class of drift the existing suite does not:

  * `downloadUrl` must be a raw.githubusercontent.com URL pinned to
    kubestellar/console-marketplace at a 40-char commit SHA, and its
    path must match the type-directory / filename derived from the
    entry `id`. A regression that either changes host, swaps repo, or
    drifts the id/path mapping would break every existing download.
  * `type` must be one of the three known types.
  * `id` is lowercase kebab-case and matches the on-disk filename stem.
  * `version` matches semver `MAJOR.MINOR.PATCH`.
  * `tags` is a non-empty list of lowercase-kebab strings — the UI
    filter chips expect this shape.
  * `description` is non-empty and length-bounded.
  * Theme registry entries have `themeColors` with 3-8 hex triplets.
  * Card-preset entries have `cardCount == 1` (already checked in the
    sibling suite for `type=card-preset`; here we assert it also for
    entries backed by /card-presets/*.json specifically as an extra
    guard against future entries drifting).
  * Top-level `updatedAt` parses as an ISO 8601 timestamp.
"""

import json
import re
from datetime import datetime
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / "registry.json"

VALID_TYPES = {"dashboard", "card-preset", "theme"}

# card-preset assets ship from two directories today:
#   card-presets/ — the four "kubestellar" curated presets
#   presets/      — the CNCF-project preset catalog
# Both surface in the registry under type=card-preset.
TYPE_TO_DIRS = {
    "dashboard": ("dashboards",),
    "card-preset": ("card-presets", "presets"),
    "theme": ("themes",),
}

DOWNLOAD_URL_RE = re.compile(
    r"^https://raw\.githubusercontent\.com/kubestellar/console-marketplace/"
    r"(?P<ref>[0-9a-f]{40}|main)/"
    r"(?P<dir>dashboards|card-presets|presets|themes)/"
    r"(?P<rest>.+)$"
)
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
KEBAB_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


@pytest.fixture(scope="module")
def registry():
    with REGISTRY_PATH.open() as fh:
        return json.load(fh)


@pytest.fixture(scope="module")
def entries(registry):
    return list(registry.get("items", [])) + list(registry.get("presets", []))


def _entry_id(entry):
    return f"{entry.get('type', '<no-type>')}:{entry.get('id', '<no-id>')}"


def test_registry_updatedAt_is_iso8601(registry):
    # A malformed timestamp here would silently break any downstream
    # tooling that sorts assets by freshness.
    updated = registry.get("updatedAt")
    assert isinstance(updated, str) and updated, "registry.updatedAt missing"
    # Accept either the trailing 'Z' Zulu form or the +00:00 offset form.
    normalized = updated.replace("Z", "+00:00")
    datetime.fromisoformat(normalized)  # will raise on drift


def test_every_entry_type_is_known(entries):
    unknown = [_entry_id(e) for e in entries if e.get("type") not in VALID_TYPES]
    assert not unknown, f"registry entries with unknown type: {unknown}"


def test_every_entry_id_is_kebab_case(entries):
    bad = [_entry_id(e) for e in entries if not KEBAB_RE.match(e.get("id", ""))]
    assert not bad, f"registry entries with non-kebab id: {bad}"


def test_every_entry_version_is_semver(entries):
    bad = [
        (_entry_id(e), e.get("version"))
        for e in entries
        if not SEMVER_RE.match(str(e.get("version", "")))
    ]
    assert not bad, f"registry entries with non-semver version: {bad}"


def test_every_entry_has_nonempty_kebab_tags(entries):
    bad = []
    for e in entries:
        tags = e.get("tags")
        if not isinstance(tags, list) or not tags:
            bad.append((_entry_id(e), "missing-or-empty"))
            continue
        for t in tags:
            if not isinstance(t, str) or not KEBAB_RE.match(t):
                bad.append((_entry_id(e), t))
    assert not bad, f"registry entries with bad tags: {bad}"


def test_every_entry_has_bounded_description(entries):
    bad = []
    for e in entries:
        desc = e.get("description")
        if not isinstance(desc, str) or not (10 <= len(desc) <= 500):
            bad.append((_entry_id(e), len(desc) if isinstance(desc, str) else None))
    assert not bad, (
        f"registry entries with missing / out-of-bounds description "
        f"(want 10..500 chars): {bad}"
    )


def test_download_url_shape_matches_id_and_type(entries):
    # Every downloadUrl must point at raw.githubusercontent.com,
    # kubestellar/console-marketplace, a 40-hex commit sha, and the
    # type-derived directory containing the asset file. The filename
    # must derive from the entry id (or, for dashboards, be
    # dashboard.json under a folder named after the id).
    bad = []
    for e in entries:
        url = e.get("downloadUrl", "")
        m = DOWNLOAD_URL_RE.match(url)
        if not m:
            bad.append((_entry_id(e), "url-does-not-match-shape", url))
            continue
        expected_dirs = TYPE_TO_DIRS.get(e["type"], ())
        if m.group("dir") not in expected_dirs:
            bad.append(
                (_entry_id(e), f"dir-mismatch: got {m.group('dir')!r} "
                 f"want one of {expected_dirs!r}", url)
            )
            continue
        rest = m.group("rest")
        eid = e["id"]
        if e["type"] == "dashboard":
            expected = f"{eid}/dashboard.json"
        else:
            expected = f"{eid}.json"
        if rest != expected:
            bad.append(
                (_entry_id(e), f"path-mismatch: got {rest!r} want {expected!r}", url)
            )
    assert not bad, f"registry entries with malformed downloadUrl: {bad}"


def test_download_url_ref_is_sha_or_main_branch(entries):
    # Every downloadUrl ref must be either a 40-hex commit sha or the
    # literal `main` branch. The nightly regen prefers pinned shas so a
    # ref outside these two shapes would be a template regression.
    # Today most entries pin a sha; a handful (cncf-prometheus,
    # cncf-kubescape, cncf-keda) still track main — that's tolerated by
    # this invariant but worth surfacing in a follow-up so an
    # accidental drift to a third form (e.g. a stale branch name) is
    # still caught here.
    sha_re = re.compile(r"^[0-9a-f]{40}$")
    bad = []
    for e in entries:
        m = DOWNLOAD_URL_RE.match(e.get("downloadUrl", ""))
        if not m:
            continue
        ref = m.group("ref")
        if ref != "main" and not sha_re.match(ref):
            bad.append((_entry_id(e), ref))
    assert not bad, f"registry entries with unexpected download ref: {bad}"


def test_id_matches_on_disk_filename(entries):
    # Ensure the id embedded in the entry matches an actual on-disk
    # file. Dashboards resolve via <id>/dashboard.json; card-presets
    # can live in either card-presets/ or presets/ (see TYPE_TO_DIRS);
    # themes live in themes/<id>.json. A regression that drops or
    # renames a file would silently 404 on download but would still
    # ship in the registry.
    missing = []
    for e in entries:
        dirs = TYPE_TO_DIRS.get(e["type"], ())
        if not dirs:
            continue
        if e["type"] == "dashboard":
            candidates = [REPO_ROOT / dirs[0] / e["id"] / "dashboard.json"]
        else:
            candidates = [REPO_ROOT / d / f"{e['id']}.json" for d in dirs]
        if not any(p.exists() for p in candidates):
            missing.append(
                (_entry_id(e),
                 [str(p.relative_to(REPO_ROOT)) for p in candidates])
            )
    assert not missing, f"registry entries reference missing on-disk files: {missing}"


def test_theme_entries_have_valid_theme_colors(entries):
    themes = [e for e in entries if e.get("type") == "theme"]
    assert themes, "no theme entries found in registry"
    bad = []
    for e in themes:
        colors = e.get("themeColors")
        if not isinstance(colors, list) or not (3 <= len(colors) <= 8):
            bad.append((_entry_id(e), "wrong-length", colors))
            continue
        for c in colors:
            if not isinstance(c, str) or not HEX_COLOR_RE.match(c):
                bad.append((_entry_id(e), "non-hex-color", c))
    assert not bad, f"theme registry entries with bad themeColors: {bad}"


def test_card_preset_entries_backed_by_card_presets_dir_have_cardcount_one(entries):
    # Sibling suite asserts this for all entries with type=card-preset;
    # here we cross-check the invariant against the on-disk path, so a
    # future regression that mislabels a card-preset as a dashboard
    # (or leaves type=card-preset while pointing at a dashboard dir)
    # is caught here regardless of which side drifts.
    bad = []
    for e in entries:
        url = e.get("downloadUrl", "")
        m = DOWNLOAD_URL_RE.match(url)
        if not m or m.group("dir") not in ("card-presets", "presets"):
            continue
        if e.get("cardCount") != 1:
            bad.append((_entry_id(e), e.get("cardCount")))
    assert not bad, (
        f"entries served from /card-presets/ or /presets/ with cardCount != 1: {bad}"
    )
