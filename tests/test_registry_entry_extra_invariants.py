"""Additional invariants on registry.json entries.

Complements test_registry_entry_invariants.py by asserting invariants
that the existing suite does not cover today:

* Top-level ``updatedAt`` is not in the future — a future timestamp
  indicates a mis-set clock or a hand-edited registry and would confuse
  freshness-based UI sorting (mirror of the existing "dashboard
  exported_at is not in the future" invariant).

* ``authorGithub`` matches GitHub's actual username shape (1-39 chars,
  alphanumeric, may contain single hyphens, may not start or end with a
  hyphen). A malformed authorGithub silently breaks the "author avatar"
  UI (which builds an avatars.githubusercontent.com URL).

* ``author`` (display name) is a non-empty, reasonably-bounded string.

* ``name`` is non-empty and length-bounded — used as the primary card
  title in the marketplace grid.

* Per-entry ``tags`` list contains no internal duplicates — the tag
  filter chips would show doubles.
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / "registry.json"

# https://github.com/shinnn/github-username-regex — GitHub's actual rule
GITHUB_USERNAME_RE = re.compile(
    r"^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$"
)

# Reasonable bounds mirroring what the marketplace UI can realistically
# render without truncation or awkward wrapping.
NAME_MIN, NAME_MAX = 1, 80
AUTHOR_MIN, AUTHOR_MAX = 1, 80


@pytest.fixture(scope="module")
def registry():
    with REGISTRY_PATH.open() as fh:
        return json.load(fh)


@pytest.fixture(scope="module")
def entries(registry):
    return list(registry.get("items", [])) + list(registry.get("presets", []))


def _entry_id(entry):
    return f"{entry.get('type', '<no-type>')}:{entry.get('id', '<no-id>')}"


def test_registry_updatedAt_is_not_in_the_future(registry):
    raw = registry.get("updatedAt", "")
    assert isinstance(raw, str) and raw, "registry.updatedAt missing"
    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    assert parsed <= now, (
        f"registry.updatedAt {raw!r} is in the future "
        f"(now={now.isoformat()}) — clock skew or hand-edited timestamp"
    )


def test_authorGithub_when_present_matches_github_username_shape(entries):
    offenders = []
    for e in entries:
        gh = e.get("authorGithub")
        if gh is None:
            continue  # optional field
        if not isinstance(gh, str) or not GITHUB_USERNAME_RE.match(gh):
            offenders.append((_entry_id(e), gh))
    assert not offenders, (
        "authorGithub, when present, must match a valid GitHub username "
        "shape (1-39 alphanumeric chars, single hyphens allowed, no "
        f"leading/trailing hyphen): {offenders}"
    )


def test_author_display_string_is_nonempty_and_bounded(entries):
    offenders = []
    for e in entries:
        author = e.get("author")
        if not isinstance(author, str):
            offenders.append((_entry_id(e), "not-a-string", author))
            continue
        length = len(author.strip())
        if length < AUTHOR_MIN or length > AUTHOR_MAX:
            offenders.append((_entry_id(e), f"len={length}", author))
    assert not offenders, (
        f"author (display) must be a {AUTHOR_MIN}-{AUTHOR_MAX} char "
        f"non-empty string: {offenders}"
    )


def test_name_is_nonempty_and_bounded(entries):
    offenders = []
    for e in entries:
        name = e.get("name")
        if not isinstance(name, str):
            offenders.append((_entry_id(e), "not-a-string", name))
            continue
        length = len(name.strip())
        if length < NAME_MIN or length > NAME_MAX:
            offenders.append((_entry_id(e), f"len={length}", name))
    assert not offenders, (
        f"name must be a {NAME_MIN}-{NAME_MAX} char non-empty string "
        f"(marketplace card title): {offenders}"
    )


def test_tags_contain_no_internal_duplicates(entries):
    offenders = []
    for e in entries:
        tags = e.get("tags")
        if not isinstance(tags, list):
            continue  # covered elsewhere
        dupes = sorted({t for t in tags if tags.count(t) > 1})
        if dupes:
            offenders.append((_entry_id(e), dupes))
    assert not offenders, (
        f"tags list contains internal duplicates (filter chips would "
        f"show doubles): {offenders}"
    )
