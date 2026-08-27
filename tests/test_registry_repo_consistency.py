"""Whole-repo consistency checks for ``registry.json`` against the checked-in
marketplace assets.

The existing ``test_validate_*`` suites drive ``scripts/validate-marketplace.py``
against synthetic ``tmp_path`` fixtures, which is the right shape for unit
tests but leaves the *actual* ``registry.json`` shipped in this repository
completely unchecked.  When ``registry.json`` and the assets it points at
drift — a preset added under ``presets/`` but not registered, a ``downloadUrl``
pinned to a stale SHA, a duplicated ``id``, a non-semver ``version`` — nothing
in the test suite notices until a consumer (e.g. the console) tries to fetch
the asset and fails.

This module adds a small set of pure-Python invariants that read the
committed ``registry.json`` directly and cross-check it against the files
under ``card-presets/``, ``dashboards/``, ``presets/``, and ``themes/``.
Each invariant is written as a discrete test so a regression pinpoints the
exact rule that broke.
"""
from __future__ import annotations

import json
import os
import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_JSON = REPO_ROOT / "registry.json"

# Directories that can back a registry entry's ``downloadUrl``.  ``card-preset``
# entries are allowed to live in either ``presets/`` (the CNCF preset dumping
# ground) or ``card-presets/`` (curated card-level presets) — both are shipped
# in this repo and both are legitimate targets.
_TYPE_TO_ALLOWED_DIRS = {
    "dashboard": ("dashboards/",),
    "card-preset": ("presets/", "card-presets/"),
    "theme": ("themes/",),
}

# ``downloadUrl`` must be a raw.githubusercontent.com URL pinned to this repo
# at a ref (branch name or commit SHA).  The trailing group captures the
# in-repo path relative to the repo root.
_DOWNLOAD_URL_RE = re.compile(
    r"^https://raw\.githubusercontent\.com/kubestellar/console-marketplace/"
    r"(?P<ref>[^/]+)/(?P<path>.+)$"
)

_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")

_REQUIRED_FIELDS = ("id", "name", "description", "author",
                    "version", "downloadUrl", "type")


def _load_registry():
    with open(REGISTRY_JSON, encoding="utf-8") as fh:
        return json.load(fh)


def _all_entries(registry):
    return list(registry.get("items", [])) + list(registry.get("presets", []))


def _url_repo_path(url):
    """Return the in-repo path a ``downloadUrl`` points at, or ``None`` if the
    URL does not match the expected ``raw.githubusercontent.com`` shape."""
    m = _DOWNLOAD_URL_RE.match(url)
    return m.group("path") if m else None


class TestRegistryShape(unittest.TestCase):
    """Structural invariants on ``registry.json`` itself."""

    @classmethod
    def setUpClass(cls):
        if not REGISTRY_JSON.is_file():
            raise unittest.SkipTest(f"{REGISTRY_JSON} not present")
        cls.registry = _load_registry()
        cls.entries = _all_entries(cls.registry)
        if not cls.entries:
            raise unittest.SkipTest("registry.json has no entries")

    def test_registry_has_expected_top_level_keys(self):
        self.assertIn("version", self.registry)
        self.assertIn("items", self.registry)
        self.assertIn("updatedAt", self.registry)
        self.assertIsInstance(self.registry["items"], list)
        self.assertIsInstance(self.registry.get("presets", []), list)

    def test_registry_version_is_semver(self):
        self.assertRegex(self.registry.get("version", ""), _SEMVER_RE)

    def test_entry_ids_are_unique(self):
        ids = [e.get("id") for e in self.entries]
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        self.assertFalse(
            duplicates,
            f"duplicate entry ids in registry.json: {duplicates}",
        )

    def test_every_entry_has_required_fields(self):
        problems = []
        for e in self.entries:
            for field in _REQUIRED_FIELDS:
                v = e.get(field)
                if not (isinstance(v, str) and v.strip()):
                    problems.append(f"{e.get('id', '<no-id>')}: missing/empty {field}")
        self.assertFalse(problems, "\n".join(problems))

    def test_every_entry_version_is_semver(self):
        offenders = [(e["id"], e.get("version"))
                     for e in self.entries
                     if not _SEMVER_RE.match(e.get("version", ""))]
        self.assertFalse(offenders, f"non-semver versions: {offenders}")

    def test_every_entry_has_known_type(self):
        known = set(_TYPE_TO_ALLOWED_DIRS)
        offenders = [(e["id"], e.get("type"))
                     for e in self.entries
                     if e.get("type") not in known]
        self.assertFalse(offenders, f"unknown types: {offenders}")


class TestRegistryPartitioning(unittest.TestCase):
    """The ``items`` / ``presets`` split has documented semantics: ``items`` is
    the featured/dashboard shelf, ``presets`` is the everything-else shelf.
    """

    @classmethod
    def setUpClass(cls):
        if not REGISTRY_JSON.is_file():
            raise unittest.SkipTest(f"{REGISTRY_JSON} not present")
        cls.registry = _load_registry()

    def test_items_are_all_dashboards(self):
        offenders = [(e.get("id"), e.get("type"))
                     for e in self.registry.get("items", [])
                     if e.get("type") != "dashboard"]
        self.assertFalse(
            offenders,
            f"non-dashboard entries in top-level items: {offenders}",
        )

    def test_presets_contain_no_dashboards(self):
        offenders = [(e.get("id"), e.get("type"))
                     for e in self.registry.get("presets", [])
                     if e.get("type") == "dashboard"]
        self.assertFalse(
            offenders,
            f"dashboard entries misfiled under presets: {offenders}",
        )


class TestDownloadUrlPointsAtRepoFile(unittest.TestCase):
    """Every entry's ``downloadUrl`` must resolve to a file that actually
    exists in this repo, in a directory appropriate for the entry's ``type``,
    with a basename that matches the entry's ``id``.
    """

    @classmethod
    def setUpClass(cls):
        if not REGISTRY_JSON.is_file():
            raise unittest.SkipTest(f"{REGISTRY_JSON} not present")
        cls.entries = _all_entries(_load_registry())
        if not cls.entries:
            raise unittest.SkipTest("registry.json has no entries")

    def test_download_urls_have_expected_shape(self):
        offenders = [e["id"] for e in self.entries
                     if _url_repo_path(e.get("downloadUrl", "")) is None]
        self.assertFalse(
            offenders,
            "downloadUrl values that don't match "
            f"raw.githubusercontent.com/kubestellar/console-marketplace/<ref>/<path>: "
            f"{offenders}",
        )

    def test_download_urls_resolve_to_existing_files(self):
        missing = []
        for e in self.entries:
            path = _url_repo_path(e.get("downloadUrl", ""))
            if path is None:
                continue  # covered by test_download_urls_have_expected_shape
            if not (REPO_ROOT / path).is_file():
                missing.append((e["id"], path))
        self.assertFalse(
            missing,
            f"downloadUrl points at non-existent repo file: {missing}",
        )

    def test_download_url_directory_matches_type(self):
        offenders = []
        for e in self.entries:
            path = _url_repo_path(e.get("downloadUrl", ""))
            if path is None:
                continue
            allowed = _TYPE_TO_ALLOWED_DIRS.get(e.get("type"), ())
            if not any(path.startswith(prefix) for prefix in allowed):
                offenders.append((e["id"], e.get("type"), path))
        self.assertFalse(
            offenders,
            f"downloadUrl path outside directories allowed for type: {offenders}",
        )

    def test_download_url_basename_matches_id(self):
        offenders = []
        for e in self.entries:
            path = _url_repo_path(e.get("downloadUrl", ""))
            if path is None:
                continue
            if e.get("type") == "dashboard":
                # dashboards/<id>/dashboard.json
                parts = path.split("/")
                if len(parts) != 3 or parts[2] != "dashboard.json":
                    offenders.append((e["id"], path, "shape"))
                elif parts[1] != e["id"]:
                    offenders.append((e["id"], path, "dir!=id"))
            else:
                base = os.path.basename(path)
                if base != f"{e['id']}.json":
                    offenders.append((e["id"], path, "basename!=id.json"))
        self.assertFalse(
            offenders,
            f"downloadUrl basename disagrees with entry id: {offenders}",
        )


class TestRegistryHelpers(unittest.TestCase):
    """Direct unit coverage for the pure helpers backing the whole-repo
    suites, so a helper regression cannot silently make them vacuous."""

    def test_url_repo_path_extracts_ref_and_path(self):
        url = ("https://raw.githubusercontent.com/kubestellar/console-marketplace/"
               "56de485a64b85316429ad5d82db018a12c1df2fd/presets/cncf-argo.json")
        self.assertEqual(_url_repo_path(url), "presets/cncf-argo.json")

    def test_url_repo_path_accepts_branch_ref(self):
        url = ("https://raw.githubusercontent.com/kubestellar/console-marketplace/"
               "main/dashboards/sre-overview/dashboard.json")
        self.assertEqual(
            _url_repo_path(url),
            "dashboards/sre-overview/dashboard.json",
        )

    def test_url_repo_path_rejects_wrong_host(self):
        self.assertIsNone(_url_repo_path(
            "https://example.com/kubestellar/console-marketplace/main/x.json"
        ))

    def test_url_repo_path_rejects_wrong_repo(self):
        self.assertIsNone(_url_repo_path(
            "https://raw.githubusercontent.com/attacker/console-marketplace/main/x.json"
        ))

    def test_url_repo_path_rejects_http_scheme(self):
        self.assertIsNone(_url_repo_path(
            "http://raw.githubusercontent.com/kubestellar/console-marketplace/main/x.json"
        ))

    def test_url_repo_path_requires_path_component(self):
        # Trailing slash after the ref should yield an empty path — rejected.
        self.assertIsNone(_url_repo_path(
            "https://raw.githubusercontent.com/kubestellar/console-marketplace/main/"
        ))

    def test_all_entries_merges_items_and_presets(self):
        reg = {"items": [{"id": "a"}], "presets": [{"id": "b"}, {"id": "c"}]}
        ids = [e["id"] for e in _all_entries(reg)]
        self.assertEqual(ids, ["a", "b", "c"])

    def test_all_entries_tolerates_missing_presets_key(self):
        reg = {"items": [{"id": "a"}]}
        self.assertEqual([e["id"] for e in _all_entries(reg)], ["a"])

    def test_semver_regex_accepts_three_digit_form(self):
        self.assertRegex("1.0.0", _SEMVER_RE)
        self.assertRegex("12.345.6789", _SEMVER_RE)

    def test_semver_regex_rejects_prerelease_and_shorter_forms(self):
        for bad in ("1.0", "1.0.0-alpha", "v1.0.0", "1.0.0.0", ""):
            self.assertNotRegex(bad, _SEMVER_RE, f"unexpectedly matched: {bad!r}")


if __name__ == "__main__":
    unittest.main()
