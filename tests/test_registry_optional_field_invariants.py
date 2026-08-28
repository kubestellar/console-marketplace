"""Structural invariants for the *optional* enum-like registry fields.

Existing tests cover the required-field shape of registry.json (id, name,
downloadUrl, type, cardCount, version, tags). They do NOT lock down the
smaller, optional enum-like fields — `difficulty`, `status`, `skills`,
`cncfProject`, `issueUrl`, `themeColors` — which the console-marketplace
UI still branches on.

Every check below runs against the current registry.json and passes today.
A regression in any of these would silently ship a value the UI can't
render — a bad enum value would fall through to an "unknown" label; a
non-list `skills` would blow up the pill row; a non-github issueUrl would
expose a dangling or off-org link.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]

SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
DIFFICULTY = {"beginner", "intermediate", "advanced"}
STATUS = {"available", "help-wanted"}


@pytest.fixture(scope="module")
def all_entries() -> list[dict]:
    r = json.loads((REPO_ROOT / "registry.json").read_text())
    return list(r["items"]) + list(r["presets"])


# ─── Enum-valued optional fields ───────────────────────────────────────────

def test_difficulty_when_present_is_a_known_enum_value(all_entries):
    """UI difficulty badge colors branch on this value; unknown values
    fall through to a grey "?" pill."""
    for it in all_entries:
        if "difficulty" not in it:
            continue
        assert it["difficulty"] in DIFFICULTY, (
            f"{it['id']}: difficulty={it['difficulty']!r} not in {sorted(DIFFICULTY)}"
        )


def test_status_when_present_is_a_known_enum_value(all_entries):
    """`status` is only currently 'available' or 'help-wanted' — any new
    value must be added to the UI dispatch before it ships."""
    for it in all_entries:
        if "status" not in it:
            continue
        assert it["status"] in STATUS, (
            f"{it['id']}: status={it['status']!r} not in {sorted(STATUS)}"
        )


def test_help_wanted_status_and_tag_agree(all_entries):
    """The marketplace filter chip and the "Help Wanted" callout come from
    two independent fields (status and tags); they must not drift apart or
    entries appear in one view and not the other."""
    for it in all_entries:
        status_hw = it.get("status") == "help-wanted"
        tag_hw = "help-wanted" in it.get("tags", [])
        # tag_hw without status is allowed (looser signal), but status
        # 'help-wanted' MUST carry the tag.
        if status_hw:
            assert tag_hw, (
                f"{it['id']}: status=help-wanted but 'help-wanted' missing from tags={it['tags']!r}"
            )


# ─── Optional list/scalar shape ────────────────────────────────────────────

def test_skills_when_present_is_a_nonempty_list_of_strings(all_entries):
    for it in all_entries:
        if "skills" not in it:
            continue
        skills = it["skills"]
        assert isinstance(skills, list) and skills, (
            f"{it['id']}: skills={skills!r} must be a non-empty list"
        )
        for i, s in enumerate(skills):
            assert isinstance(s, str) and s.strip(), (
                f"{it['id']}: skills[{i}]={s!r} must be a non-empty string"
            )


def test_theme_colors_when_present_is_a_list_of_hex_strings(all_entries):
    """Registry `themeColors` on preset entries is used for the swatch row
    in the marketplace card — non-hex values render as broken color chips."""
    for it in all_entries:
        if "themeColors" not in it:
            continue
        tc = it["themeColors"]
        assert isinstance(tc, list) and tc, (
            f"{it['id']}: themeColors={tc!r} must be a non-empty list"
        )
        for i, v in enumerate(tc):
            assert isinstance(v, str) and HEX_RE.match(v), (
                f"{it['id']}: themeColors[{i}]={v!r} is not a hex color"
            )


# ─── issueUrl / cncfProject shape ──────────────────────────────────────────

def test_issue_url_when_present_points_at_a_kubestellar_github_issue(all_entries):
    """Registry issueUrl is opened directly from a "Get involved" link;
    it must land in the marketplace repo's tracker, not an arbitrary URL."""
    prefix = "https://github.com/kubestellar/"
    for it in all_entries:
        if "issueUrl" not in it:
            continue
        url = it["issueUrl"]
        assert isinstance(url, str) and url.startswith(prefix), (
            f"{it['id']}: issueUrl={url!r} does not start with {prefix}"
        )
        # …/issues/<n> — must be an issue link with a numeric id.
        m = re.match(rf"{re.escape(prefix)}[^/]+/issues/(\d+)$", url)
        assert m, (
            f"{it['id']}: issueUrl={url!r} is not the expected "
            "'.../<repo>/issues/<n>' shape"
        )


def test_cncf_prefixed_ids_all_declare_cncf_project_and_tag(all_entries):
    """`cncf-*` presets are the CNCF integrations catalogue; each entry
    must set `cncfProject` (drives the CNCF badge) and carry the `cncf` tag
    (drives the filter chip). A missing field silently hides the entry."""
    for it in all_entries:
        if not it["id"].startswith("cncf-"):
            continue
        cp = it.get("cncfProject")
        assert isinstance(cp, dict) and cp, (
            f"{it['id']}: cncfProject={cp!r} must be a non-empty object for a cncf-* entry"
        )
        for k in ("maturity", "category"):
            assert isinstance(cp.get(k), str) and cp[k].strip(), (
                f"{it['id']}: cncfProject.{k}={cp.get(k)!r} must be a non-empty string"
            )
        assert "cncf" in it.get("tags", []), (
            f"{it['id']}: 'cncf' tag missing from tags={it.get('tags')!r}"
        )


# ─── Semver on every entry ─────────────────────────────────────────────────

def test_every_entry_version_is_semver_x_y_z(all_entries):
    """Registry `version` is displayed verbatim and compared string-wise
    for "update available" hints; anything not X.Y.Z breaks that compare."""
    for it in all_entries:
        v = it.get("version")
        assert isinstance(v, str) and SEMVER_RE.match(v), (
            f"{it['id']}: version={v!r} is not a semver X.Y.Z triplet"
        )
