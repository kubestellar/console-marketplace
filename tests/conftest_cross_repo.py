"""Shared fixtures and helpers for cross-repo validator tests.

This module contains fixtures and helper functions used by multiple
cross-repo test modules:
- test_cross_repo_card_types.py
- test_cross_repo_hook_wiring.py
- test_cross_repo_i18n_cors.py
- test_cross_repo_cncf_main.py
"""
import importlib.util
import json
import os
import sys

import pytest


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


# ── Fixture helpers ────────────────────────────────────────────────


def _write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj))


def _write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def _messages(records):
    return [m for _, m in records]


def _make_console(tmp_path, card_types=None, lazy_imports=None,
                  demo_components=None, i18n_keys=None, extra_component_bodies=None):
    """Create a minimal console checkout with a cardRegistry.ts.

    ``card_types``      — list of card_type strings to put in RAW_CARD_COMPONENTS.
    ``lazy_imports``    — dict card_type -> import path (defaults to CamelCase name
                          matching card_type).
    ``demo_components`` — list of card_types that should get a ``demoData.ts``.
    ``i18n_keys``       — dict for the console ``cards.json`` (skipped if None).
    ``extra_component_bodies`` — dict card_type -> extra source appended to the
                          per-card ``.tsx`` file (used to inject
                          ``useCardLoadingState`` etc.).
    """
    console = tmp_path / "console"
    cards_dir = console / "web/src/components/cards"
    cards_dir.mkdir(parents=True)

    card_types = card_types or []
    lazy_imports = lazy_imports or {}
    demo_components = set(demo_components or [])
    extra_component_bodies = extra_component_bodies or {}

    # Build a cardRegistry.ts that both parsers understand.
    def _comp_name(ct):
        return "".join(part.capitalize() for part in ct.split("_"))

    lazy_lines = []
    raw_lines = []
    for ct in card_types:
        comp = _comp_name(ct)
        path = lazy_imports.get(ct, comp)
        lazy_lines.append(f"const {comp} = lazy(() => import('./{path}'));")
        raw_lines.append(f"  {ct}: {comp},")

    # ``parse_card_registry`` picks types up from ``_UNIFIED_ONLY_TYPES`` while
    # ``parse_card_type_to_component`` reads ``RAW_CARD_COMPONENTS``; we emit
    # both so the same fake registry works for both parsers.
    unified_line = ("const _UNIFIED_ONLY_TYPES = [" +
                    ", ".join(f"'{ct}'" for ct in card_types) + "];")
    registry_src = "\n".join([
        "import { lazy } from 'react';",
        *lazy_lines,
        "",
        unified_line,
        "",
        "export const RAW_CARD_COMPONENTS = {",
        *raw_lines,
        "}",
        "",
    ])
    (cards_dir / "cardRegistry.ts").write_text(registry_src)

    # Build each component directory with the matching entry file.  For cards
    # in ``demo_components`` we add a ``demoData.ts``.  ``extra_component_bodies``
    # lets each test inject ``useCardLoadingState`` / ``useCached*`` patterns
    # into the main ``<Comp>.tsx`` file.
    for ct in card_types:
        comp = _comp_name(ct)
        path = lazy_imports.get(ct, comp)
        comp_dir = cards_dir / path
        comp_dir.mkdir(parents=True, exist_ok=True)
        body = extra_component_bodies.get(ct, "// placeholder\n")
        (comp_dir / f"{comp}.tsx").write_text(body)
        if ct in demo_components:
            (comp_dir / "demoData.ts").write_text("export const demo = {};\n")

    if i18n_keys is not None:
        cards_json = console / "web/src/locales/en/cards.json"
        cards_json.parent.mkdir(parents=True, exist_ok=True)
        cards_json.write_text(json.dumps(i18n_keys))

    return console


def _make_marketplace(tmp_path, registry=None, presets=None, hooks=None,
                      cncf_presets=None):
    base = tmp_path / "marketplace"
    base.mkdir()

    if registry is not None:
        _write_json(base / "registry.json", registry)

    for name, obj in (presets or {}).items():
        _write_json(base / "presets" / f"{name}.json", obj)

    for name, obj in (cncf_presets or {}).items():
        _write_json(base / "presets" / f"cncf-{name}.json", obj)

    if hooks:
        hooks_dir = base / "web/src/hooks"
        hooks_dir.mkdir(parents=True)
        for name, src in hooks.items():
            (hooks_dir / name).write_text(src)

    return base


# ── main() helper for testing ──────────────────────────────────────


def _run_main(monkeypatch, argv):
    monkeypatch.setattr(sys, "argv", ["validate-marketplace.py", *argv])
    with pytest.raises(SystemExit) as excinfo:
        _mod.main()
    return excinfo.value.code
