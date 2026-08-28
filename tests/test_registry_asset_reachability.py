"""Whole-repo invariants ensuring every shipped marketplace asset file is
reachable through ``registry.json`` and vice-versa.

The existing ``test_registry_repo_consistency`` suite verifies that every
registry entry's ``downloadUrl`` resolves to a file on disk.  This suite
adds the *inverse* invariant — every JSON asset file shipped under the
canonical asset directories (``card-presets/``, ``presets/``, ``themes/``,
``dashboards/*/dashboard.json``) is referenced by exactly one registry
entry.

Without this check, a contributor can add ``card-presets/foo.json`` (or a
new ``dashboards/foo/dashboard.json``) and forget to add the matching
registry entry.  The file ships, ``validate-marketplace.py`` never
notices (it walks the registry, not the filesystem), and the console UI
has no way to surface the asset.  Symmetrically, an entry can be removed
from ``registry.json`` while the backing file lingers on disk as dead
weight.  Each invariant here fires on the exact file or entry that broke
so the fix is obvious.

The suite also asserts ``registry.updatedAt`` is a valid RFC 3339 /
ISO 8601 UTC timestamp — the format the console expects to parse.
"""
from __future__ import annotations

import json
import os
import re
import unittest
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_JSON = REPO_ROOT / "registry.json"

_ASSET_DIRS_FLAT = ("card-presets", "presets", "themes")
_DASHBOARDS_DIR = "dashboards"

_DOWNLOAD_URL_RE = re.compile(
    r"^https://raw\.githubusercontent\.com/kubestellar/console-marketplace/"
    r"[^/]+/(?P<path>.+)$"
)


def _load_registry():
    with open(REGISTRY_JSON, encoding="utf-8") as fh:
        return json.load(fh)


def _all_entries(registry):
    return list(registry.get("items", [])) + list(registry.get("presets", []))


def _entry_repo_path(entry):
    m = _DOWNLOAD_URL_RE.match(entry.get("downloadUrl", ""))
    return m.group("path") if m else None


def _shipped_asset_paths():
    paths = []
    for d in _ASSET_DIRS_FLAT:
        p = REPO_ROOT / d
        if p.is_dir():
            for f in sorted(os.listdir(p)):
                if f.endswith(".json"):
                    paths.append(f"{d}/{f}")
    dash = REPO_ROOT / _DASHBOARDS_DIR
    if dash.is_dir():
        for sub in sorted(os.listdir(dash)):
            candidate = dash / sub / "dashboard.json"
            if candidate.is_file():
                paths.append(f"{_DASHBOARDS_DIR}/{sub}/dashboard.json")
    return paths


class TestAssetReachability(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not REGISTRY_JSON.is_file():
            raise unittest.SkipTest(f"{REGISTRY_JSON} not present")
        cls.registry = _load_registry()
        cls.entries = _all_entries(cls.registry)
        cls.shipped = _shipped_asset_paths()
        cls.referenced_paths = [
            p for p in (_entry_repo_path(e) for e in cls.entries) if p
        ]

    def test_every_shipped_asset_is_referenced_in_registry(self):
        referenced = set(self.referenced_paths)
        orphans = sorted(set(self.shipped) - referenced)
        self.assertFalse(
            orphans,
            "asset files shipped in the repo but not referenced by "
            f"registry.json: {orphans}",
        )

    def test_every_registry_entry_points_at_shipped_asset(self):
        shipped = set(self.shipped)
        # Only cross-check entries whose downloadUrl is well-formed and
        # rooted at one of the canonical asset directories — malformed URLs
        # are already caught by test_registry_repo_consistency.
        allowed_roots = _ASSET_DIRS_FLAT + (_DASHBOARDS_DIR,)
        dangling = []
        for e in self.entries:
            path = _entry_repo_path(e)
            if path is None:
                continue
            if not any(path.startswith(f"{r}/") for r in allowed_roots):
                continue
            if path not in shipped:
                dangling.append((e.get("id"), path))
        self.assertFalse(
            dangling,
            "registry entries whose downloadUrl points at a missing asset "
            f"file: {dangling}",
        )

    def test_no_asset_file_is_referenced_by_multiple_entries(self):
        counts = {}
        for p in self.referenced_paths:
            counts[p] = counts.get(p, 0) + 1
        dupes = sorted((p, n) for p, n in counts.items() if n > 1)
        self.assertFalse(
            dupes,
            "asset file referenced by more than one registry entry "
            f"(would ship duplicate ids in the console UI): {dupes}",
        )

    def test_dashboards_directory_has_no_stray_top_level_json(self):
        # dashboards/ layout is dashboards/<id>/dashboard.json — a bare
        # dashboards/*.json file would be silently ignored by both the
        # registry consumers and the validator.
        dash = REPO_ROOT / _DASHBOARDS_DIR
        if not dash.is_dir():
            self.skipTest("dashboards/ dir not present")
        strays = sorted(
            f for f in os.listdir(dash)
            if f.endswith(".json") and (dash / f).is_file()
        )
        self.assertFalse(
            strays,
            f"stray dashboards/*.json files at top level: {strays}",
        )


class TestRegistryUpdatedAt(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not REGISTRY_JSON.is_file():
            raise unittest.SkipTest(f"{REGISTRY_JSON} not present")
        cls.registry = _load_registry()

    def test_updated_at_is_present(self):
        self.assertIn("updatedAt", self.registry)
        self.assertIsInstance(self.registry["updatedAt"], str)
        self.assertTrue(self.registry["updatedAt"].strip())

    def test_updated_at_is_utc_iso8601(self):
        raw = self.registry.get("updatedAt", "")
        # The registry pins UTC ("Z"); consumers parse with the browser's
        # Date() which accepts RFC 3339.  Normalise "Z" → "+00:00" for
        # Python's fromisoformat.
        normalised = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
        try:
            parsed = datetime.fromisoformat(normalised)
        except ValueError as exc:
            self.fail(f"registry.updatedAt is not ISO 8601: {raw!r} ({exc})")
        self.assertIsNotNone(
            parsed.tzinfo,
            f"registry.updatedAt must include a timezone offset: {raw!r}",
        )


if __name__ == "__main__":
    unittest.main()
