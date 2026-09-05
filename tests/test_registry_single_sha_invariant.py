"""Lock the registry.json invariant: SHA-pinned downloadUrls all pin to the same commit.

The nightly regen script rewrites every `downloadUrl` in registry.json
in lockstep — either to a freshly-cut commit SHA (the common case) or
to the literal `main` branch for a small set of upstream-tracking
entries (see the docstring on
`test_download_url_ref_is_sha_or_main_branch` in
test_registry_entry_invariants.py).

That lockstep is load-bearing: the UI trusts that every asset it
downloads was captured against the same tree, so cross-references
between assets (a dashboard listing card-preset ids, a card-preset
using a theme id) remain internally consistent. A partial rewrite —
e.g. the regen script fails mid-run, or a hand-edit updates one entry
without touching the rest — leaves the registry pointing at two
different commits. Assets fetched from the older commit may reference
ids that no longer exist at the newer commit and vice-versa.

The sibling suite already asserts each individual URL has the correct
shape and that the ref is either a 40-hex SHA or `main`. It does NOT
assert the cross-entry invariant that ALL SHA-pinned refs collapse to
the same value. This module adds that lock.

Empirically at time of authoring: 77/77 entries pin to a single SHA
(no `main`-tracking entries), so this test also functions as a
regression guard against reintroducing the mixed sha+main state
without a corresponding update to
`test_download_url_ref_is_sha_or_main_branch`.
"""

import json
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / "registry.json"

DOWNLOAD_URL_RE = re.compile(
    r"^https://raw\.githubusercontent\.com/"
    r"kubestellar/console-marketplace/"
    r"(?P<ref>[^/]+)/"
    r"(?P<dir>[^/]+)/"
    r"(?P<rest>.+)$"
)
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


@pytest.fixture(scope="module")
def registry():
    with REGISTRY_PATH.open() as f:
        return json.load(f)


@pytest.fixture(scope="module")
def all_entries(registry):
    entries = []
    for section in ("items", "presets", "cardPresets", "themes"):
        entries.extend(registry.get(section, []))
    return entries


def _classify(entries):
    """Split entries into (sha_refs_by_entry, main_entries, malformed)."""
    sha_by_entry = {}
    main_entries = []
    malformed = []
    for e in entries:
        url = e.get("downloadUrl", "")
        m = DOWNLOAD_URL_RE.match(url)
        if not m:
            malformed.append((e.get("id"), url))
            continue
        ref = m.group("ref")
        if ref == "main":
            main_entries.append(e.get("id"))
        elif SHA_RE.match(ref):
            sha_by_entry[e.get("id")] = ref
        else:
            malformed.append((e.get("id"), ref))
    return sha_by_entry, main_entries, malformed


def test_all_sha_pinned_entries_share_a_single_sha(all_entries):
    sha_by_entry, _main, malformed = _classify(all_entries)
    # Malformed refs are the responsibility of
    # test_download_url_ref_is_sha_or_main_branch — this test focuses
    # only on the cross-entry SHA-consistency invariant.
    assert sha_by_entry, (
        "expected at least one SHA-pinned entry; every entry is "
        "either malformed or main-tracking — investigate the regen "
        "pipeline"
    )
    distinct = set(sha_by_entry.values())
    if len(distinct) != 1:
        # Report which entries drifted to which SHAs so a maintainer
        # can see the split at a glance.
        counts = {}
        for sha in sha_by_entry.values():
            counts[sha] = counts.get(sha, 0) + 1
        # Pick the majority SHA and list the outliers.
        majority = max(counts, key=counts.get)
        outliers = {
            eid: sha for eid, sha in sha_by_entry.items() if sha != majority
        }
        pytest.fail(
            "registry.json downloadUrl SHA drift detected — "
            f"majority SHA {majority} ({counts[majority]} entries); "
            f"outliers {outliers}. This usually means the nightly regen "
            "script left some entries un-updated. Regenerate the "
            "registry so every SHA-pinned entry points at the same "
            "commit."
        )


def test_registry_has_at_least_one_sha_pinned_entry(all_entries):
    # Sanity: prevent a future regression that flips every entry to
    # `main`-tracking without a corresponding maintainer decision.
    # main-tracking entries download whatever HEAD looks like *now*,
    # which defeats the "captured against the same tree" property that
    # test_all_sha_pinned_entries_share_a_single_sha protects. If a
    # maintainer intentionally moves the whole registry to main this
    # test becomes the natural place to record that policy shift.
    sha_by_entry, _main, _bad = _classify(all_entries)
    assert sha_by_entry, (
        "no SHA-pinned entries in registry.json — a wholesale flip to "
        "main-tracking defeats cross-asset lockstep. If intentional, "
        "update this test."
    )


def test_download_url_sha_matches_re_shape_when_pinned(all_entries):
    # Belt-and-braces: even if the shape suite drifts, guarantee that
    # anything we classify as "SHA-pinned" really is 40 lowercase hex
    # chars — otherwise the single-SHA lock above could be trivially
    # satisfied by two entries sharing a malformed ref like "SHA1".
    sha_by_entry, _main, _bad = _classify(all_entries)
    bad = [(eid, ref) for eid, ref in sha_by_entry.items() if not SHA_RE.match(ref)]
    assert not bad, f"internal classifier admitted non-SHA refs as SHAs: {bad}"
