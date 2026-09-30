"""Guard against a third `kc-card-preset-v1` directory silently appearing
(see issue #853).

The marketplace ships `kc-card-preset-v1` assets from exactly two on-disk
directories -- `presets/` (the CNCF project catalog) and `card-presets/`
(the general-purpose bundle). Every check that iterates "all card presets"
(`scripts/validate_marketplace_lib/checks_schema.PRESET_DIRS`,
`scripts/fuzz_summary.CORPUS_GLOBS`, `tests/repo_paths.CARD_PRESETS` /
`PRESETS`) hard-codes these same two paths. If a future contributor drops a
`kc-card-preset-v1` file into a new directory (or a rename), none of those
would notice on their own -- it would just be silently skipped by every
existing check. This test scans the whole repo tree instead of trusting any
single glob list, so a stray preset directory fails CI loudly.
"""
from __future__ import annotations

import json
from pathlib import Path

from tests.repo_paths import REPO_ROOT

ALLOWED_PRESET_DIRS = frozenset({"presets", "card-presets"})

# Directories that are never part of the shipped marketplace content and
# would be expensive/pointless to walk (VCS metadata, dependency trees,
# build output, editor caches).
EXCLUDED_DIR_NAMES = frozenset({
    ".git", "node_modules", ".venv", "venv", "__pycache__", ".pytest_cache",
    ".ruff_cache", ".mypy_cache",
})

# Top-level directories that legitimately contain copies of preset-shaped
# fixtures for reasons other than "this is a shipped marketplace asset"
# (e.g. the fuzzing corpus mirrors real preset shapes as seed inputs).
EXCLUDED_TOP_DIRS = frozenset({"fuzz"})


def _iter_repo_json_files():
    for path in REPO_ROOT.rglob("*.json"):
        rel_parts = path.relative_to(REPO_ROOT).parts
        if any(part in EXCLUDED_DIR_NAMES for part in rel_parts):
            continue
        if rel_parts and rel_parts[0] in EXCLUDED_TOP_DIRS:
            continue
        yield path


def _load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def test_no_card_preset_files_outside_allowed_directories():
    """Every `format: kc-card-preset-v1` JSON file anywhere in the repo must
    live directly under `presets/` or `card-presets/`."""
    offenders = []
    for path in _iter_repo_json_files():
        data = _load(path)
        if not isinstance(data, dict):
            continue
        if data.get("format") != "kc-card-preset-v1":
            continue

        rel = path.relative_to(REPO_ROOT)
        top_dir = rel.parts[0] if len(rel.parts) > 1 else None
        if top_dir not in ALLOWED_PRESET_DIRS or len(rel.parts) != 2:
            offenders.append(str(rel))

    assert not offenders, (
        f"found kc-card-preset-v1 file(s) outside presets/ and "
        f"card-presets/ (or nested in a subdirectory): {offenders}. "
        f"Either move them into one of the two allowed directories, or "
        f"update ALLOWED_PRESET_DIRS in this test AND every hard-coded "
        f"preset-directory list (PRESET_DIRS in "
        f"scripts/validate_marketplace_lib/checks_schema.py, CORPUS_GLOBS "
        f"in scripts/fuzz_summary.py, CARD_PRESETS/PRESETS in "
        f"tests/repo_paths.py) to match, deliberately."
    )
