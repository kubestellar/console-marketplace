"""Shared helpers for the ``check_*`` validator test modules.

Loads ``scripts/validate-marketplace.py`` once and exposes the module plus
small fixture-writing helpers used across the ``test_validate_check_*``
test files (see issue #554 — split of test_validate_check_functions.py).
"""
import importlib.util
import json
import os


def _load_module():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate-marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_mod = _load_module()
Results = _mod.Results


def _write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj))


def _categories(records):
    return {c for c, _ in records}


def _messages(records):
    return [m for _, m in records]
