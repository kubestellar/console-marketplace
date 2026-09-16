"""Shared loader for ``scripts/validate-marketplace.py`` (see issue #574).

The script's filename contains a hyphen, so it cannot be imported with a
normal ``import`` statement — it has to be loaded via ``importlib`` from
its file path. Previously, 15 test modules under ``tests/`` each
duplicated this 4-line shim. They now call :func:`load_validate_marketplace`
from here instead, which loads (and registers in ``sys.modules``) the
module once per test session and reuses it across every test file.
"""
from __future__ import annotations

import importlib.util
import os
import sys

_MODULE_NAME = "validate_marketplace"


def load_validate_marketplace():
    """Load and return the ``validate-marketplace.py`` script as a module.

    The module is cached in ``sys.modules`` under ``validate_marketplace``,
    so repeated calls (from different test files within the same pytest
    session) return the same module object instead of re-executing the
    script on every import.
    """
    cached = sys.modules.get(_MODULE_NAME)
    if cached is not None:
        return cached

    script = os.path.join(os.path.dirname(__file__), "..", "scripts", "validate-marketplace.py")
    spec = importlib.util.spec_from_file_location(_MODULE_NAME, script)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[_MODULE_NAME] = mod
    spec.loader.exec_module(mod)
    return mod
