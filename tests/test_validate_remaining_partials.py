"""Regression guards for the last five reachable branch-partials in
``scripts/validate-marketplace.py`` flagged by pytest-cov --cov-branch:

- ``308->301`` in ``parse_lazy_imports``: false arm of ``if bundle_key
  in bundles`` when a lazy() call references a bundle that has no
  corresponding ``const _<name> = import(...)`` line. The mapping must
  silently skip; a future regression that removed the ``in bundles``
  guard would KeyError on the ``bundles[bundle_key]`` access.
- ``414->398`` in ``check_dashboard_schema``: false arm of ``if
  isinstance(x, (int, float)) and isinstance(w, (int, float))`` when
  a dashboard card position has a string x/w — the overflow check must
  be skipped rather than raising a TypeError.
- ``461->432`` in ``check_theme_schema``: false arm of ``if
  isinstance(font, dict)`` when a theme file provides a non-dict
  ``font`` value — the family/monoFamily probes must be skipped.
- ``631->613`` in ``check_demo_data``: false arm of ``if
  os.path.isdir(comp_dir)`` when the registry maps a card_type to a
  component whose directory does not exist under
  ``web/src/components/cards`` — the loop must silently continue to
  the next card_type.
- ``765->exit`` in ``check_i18n_keys``'s inner ``load_keys_from``:
  false arm of ``if isinstance(data, dict)`` when a translations file
  parses as a JSON list — ``all_keys.update(data.keys())`` must be
  skipped rather than raising AttributeError.
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


class _StubResults:
    """Lightweight stand-in for the module's Results collector."""

    def __init__(self):
        self.errors = []
        self.warnings = []
        self.oks = []

    def error(self, category, msg):
        self.errors.append((category, msg))

    def warn(self, category, msg):
        self.warnings.append((category, msg))

    def ok(self, category, msg):
        self.oks.append((category, msg))


# --- 308->301: parse_lazy_imports unknown-bundle skip ------------------

def test_parse_lazy_imports_skips_unknown_bundle(tmp_path):
    registry_ts = tmp_path / "cardRegistry.ts"
    registry_ts.write_text(
        # Real bundle import + lazy that references it (mapped).
        "const _deploy = import('./deploy-bundle')\n"
        "const KnownCard = lazy(() => _deployBundle.then(m => m.KnownCard))\n"
        # Lazy that references a bundle var never declared — unknown key.
        "const OrphanCard = lazy(() => _ghostBundle.then(m => m.OrphanCard))\n"
    )
    imports = _mod.parse_lazy_imports(str(registry_ts))
    assert imports == {"KnownCard": "deploy-bundle"}
    assert "OrphanCard" not in imports


# --- 414->398: dashboard-grid overflow check skipped for non-numeric ---

def test_check_dashboard_schema_skips_overflow_for_non_numeric_position(tmp_path):
    dashboards = tmp_path / "dashboards" / "d"
    dashboards.mkdir(parents=True)
    (dashboards / "dashboard.json").write_text(json.dumps({
        "format": "kc-dashboard-v1",
        "name": "d",
        "cards": [
            {
                "card_type": "example",
                # Strings — not (int, float): overflow branch must skip
                # and iteration must continue to the second card.
                "position": {"x": "0", "y": 0, "w": "12", "h": 4},
            },
            {
                "card_type": "second",
                "position": {"x": 0, "y": 4, "w": 4, "h": 4},
            },
        ],
    }))
    results = _StubResults()
    _mod.check_dashboard_schema(str(tmp_path), results)
    grid_errors = [e for e in results.errors if e[0] == "dashboard-grid"]
    assert grid_errors == [], f"unexpected grid overflow error: {grid_errors}"


# --- 461->432: theme font-block skip when font is non-dict -------------

def test_check_theme_schema_skips_font_probes_when_font_not_dict(tmp_path):
    themes = tmp_path / "themes"
    themes.mkdir()
    (themes / "t.json").write_text(json.dumps({
        "id": "t",
        "name": "T",
        "dark": False,
        "colors": {
            "background": "#000", "foreground": "#fff", "card": "#111",
            "primary": "#222", "secondary": "#333", "muted": "#444",
            "accent": "#555", "destructive": "#666", "border": "#777",
            "input": "#888", "ring": "#999",
            "chartColors": ["#a", "#b", "#c", "#d"],
        },
        "brand": {"brandPrimary": "#000"},
        "font": "not-a-dict",
    }))
    results = _StubResults()
    _mod.check_theme_schema(str(tmp_path), results)
    font_warnings = [w for w in results.warnings
                     if "font.family" in w[1] or "font.monoFamily" in w[1]]
    assert font_warnings == [], f"unexpected font warnings: {font_warnings}"


# --- 631->613: check_demo_data skips card_types with missing dir -------

def test_check_demo_data_skips_when_component_dir_missing(tmp_path):
    console = tmp_path / "console"
    cards_dir = console / "web/src/components/cards"
    cards_dir.mkdir(parents=True)
    (cards_dir / "cardRegistry.ts").write_text(
        # Map card_type ghost_card -> GhostCard (dir won't exist)
        # and real_card -> RealCard (dir will exist) so the loop
        # iterates past the false arm back to line 613.
        'export const RAW_CARD_COMPONENTS = {\n'
        '  ghost_card: GhostCard,\n'
        '  real_card: RealCard,\n'
        '}\n'
        "const GhostCard = lazy(() => import('./GhostCard'))\n"
        "const RealCard = lazy(() => import('./RealCard'))\n"
    )
    (cards_dir / "RealCard").mkdir()
    (cards_dir / "RealCard" / "demoData.ts").write_text("")
    base = tmp_path / "marketplace"
    base.mkdir()
    results = _StubResults()
    _mod.check_demo_data(str(base), str(console), {"ghost_card", "real_card"}, results)
    # ghost_card falls through isdir (false arm); no demo-data output for it.
    demo_ghost = [r for r in results.oks + results.warnings
                  if r[0] == "demo-data" and "ghost_card" in r[1]]
    assert demo_ghost == [], f"unexpected demo-data output for ghost: {demo_ghost}"
    # real_card exercises the true arm so the loop clearly iterated past
    # the false-arm card.
    demo_real = [r for r in results.oks if r[0] == "demo-data" and "real_card" in r[1]]
    assert demo_real, "expected demo-data ok for real_card"


# --- 765->exit: load_keys_from skips update when JSON is not a dict ----

def test_check_i18n_keys_tolerates_list_translations_file(tmp_path):
    console = tmp_path / "console"
    locales = console / "web/src/locales/en"
    locales.mkdir(parents=True)
    # Top-level JSON list — flatten() adds nothing and the isinstance(data,
    # dict) guard on line 765 must skip the .keys() update.
    (locales / "cards.json").write_text(json.dumps(["not", "a", "dict"]))
    base = tmp_path / "marketplace"
    base.mkdir()
    results = _StubResults()
    # An unknown card_type triggers the "no translation keys" warn path,
    # confirming we finished load_keys_from without exception.
    _mod.check_i18n_keys(str(base), str(console), {"ghost_card"}, results)
    missing = [w for w in results.warnings
               if w[0] == "i18n" and "ghost_card" in w[1]]
    assert missing, "expected i18n warning for uncovered card_type"
