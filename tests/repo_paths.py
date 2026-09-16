"""Shared repo-root path and asset-glob constants (see issue #582).

21 test modules under ``tests/`` each independently redefined
``REPO_ROOT = Path(__file__).resolve().parent.parent`` (or the equivalent
``.parents[1]`` spelling), and several of them additionally recomputed the
same ``dashboards/``, ``themes/``, ``card-presets/`` and ``presets/`` glob
lists, or re-parsed ``registry.json`` from scratch. Import the constants
and :func:`load_registry` from here instead so every module shares one
definition and the registry is easy to keep in sync.
"""
from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / "registry.json"

DASHBOARDS = sorted((REPO_ROOT / "dashboards").glob("*/dashboard.json"))
CARD_PRESETS = sorted((REPO_ROOT / "card-presets").glob("*.json"))
PRESETS = sorted((REPO_ROOT / "presets").glob("*.json"))
THEMES = sorted((REPO_ROOT / "themes").glob("*.json"))


def load_registry() -> dict:
    """Parse and return ``registry.json`` from the repo root.

    Each call re-reads the file (call sites that need it once per test
    session should cache the result themselves), but they now all share
    this single implementation instead of each re-deriving the path.
    """
    return json.loads(REGISTRY_PATH.read_text())
