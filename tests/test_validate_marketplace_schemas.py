"""Schema checkers in ``scripts/validate-marketplace.py``.

Covers ``check_preset_schema``, ``check_dashboard_schema``,
``check_theme_schema``, ``check_theme_consistency``,
``check_is_demo_data_wiring`` and ``check_i18n_keys``, including the
malformed-JSON skip paths shared by every whole-tree checker.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import textwrap
import unittest

from .validate_helpers import Results as Results_themes, _messages as _messages_themes, _mod as _mod_themes, _write as _write_themes
from .validate_helpers import Results, _categories, _messages, _mod, _write
from tests.conftest import load_validate_marketplace


# ── helpers from test_validate_edge_cases.py ──
_mod_edge = load_validate_marketplace()

check_dashboard_schema = _mod_edge.check_dashboard_schema

Results_edge = _mod_edge.Results


# ── helpers from test_validate_coverage_gaps.py ──
_mod_gaps = load_validate_marketplace()

Results_gaps = _mod_gaps.Results

BROKEN_JSON = "{ this is not valid json"

class _TempTreeMixin:
    """Build a self-contained marketplace-shaped directory tree."""

    def _make_tree(self) -> Path:
        d = Path(tempfile.mkdtemp())
        self.addCleanup(_rmtree, d)
        for sub in ("presets", "card-presets", "dashboards/example", "themes"):
            (d / sub).mkdir(parents=True, exist_ok=True)
        return d

def _rmtree(p: Path) -> None:
    import shutil
    shutil.rmtree(p, ignore_errors=True)

def _iter_all_findings(results):
    """Yield every finding on a Results_gaps instance as (severity, category, msg).

    Results_gaps is defined at the top of validate-marketplace.py; we access
    its collections generically so this helper survives shape changes
    (e.g. renaming ``errors`` to ``failures``) without silently missing
    findings.
    """
    for sev in ("errors", "warnings", "info", "passes"):
        bucket = getattr(results, sev, None)
        if bucket is None:
            continue
        for entry in bucket:
            if isinstance(entry, tuple) and len(entry) >= 2:
                cat, msg = entry[0], entry[-1]
            elif isinstance(entry, dict):
                cat, msg = entry.get("category", ""), entry.get("message", "")
            else:
                cat, msg = "", str(entry)
            yield sev, cat, msg


# ── helpers from test_validate_remaining_partials.py ──
_mod_partials = load_validate_marketplace()

Results_partials = _mod_partials.Results

class _StubResults:
    """Lightweight stand-in for the module's Results_partials collector."""

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


class TestPresetSchema:
    def _valid(self):
        return {
            "format": "kc-card-preset-v1",
            "card_type": "cpu_usage",
            "title": "CPU Usage",
        }

    def test_happy_path(self, tmp_path):
        _write(tmp_path / "presets" / "cpu.json", self._valid())
        r = Results()
        _mod.check_preset_schema(str(tmp_path), r)
        assert not r.errors

    def test_wrong_format(self, tmp_path):
        p = self._valid()
        p["format"] = "kc-card-preset-v0"
        _write(tmp_path / "presets" / "cpu.json", p)
        r = Results()
        _mod.check_preset_schema(str(tmp_path), r)
        assert any("format" in m for m in _messages(r.errors))

    def test_missing_card_type_and_title(self, tmp_path):
        _write(tmp_path / "presets" / "bad.json", {"format": "kc-card-preset-v1"})
        r = Results()
        _mod.check_preset_schema(str(tmp_path), r)
        cats = _messages(r.errors)
        assert any("card_type" in m for m in cats)
        assert any("title" in m for m in cats)

    def test_card_presets_directory(self, tmp_path):
        _write(tmp_path / "card-presets" / "cpu.json", self._valid())
        r = Results()
        _mod.check_preset_schema(str(tmp_path), r)
        assert not r.errors

    def test_syntax_error_is_skipped(self, tmp_path):
        (tmp_path / "presets").mkdir()
        (tmp_path / "presets" / "broken.json").write_text("{not json")
        r = Results()
        _mod.check_preset_schema(str(tmp_path), r)
        assert not r.errors  # json-syntax owns this error


class TestDashboardSchema:
    def _valid(self):
        return {
            "format": "kc-dashboard-v1",
            "name": "Overview",
            "cards": [
                {"card_type": "cpu_usage", "position": {"x": 0, "y": 0, "w": 6, "h": 4}},
            ],
        }

    def test_happy_path(self, tmp_path):
        _write(tmp_path / "dashboards" / "overview" / "dashboard.json", self._valid())
        r = Results()
        _mod.check_dashboard_schema(str(tmp_path), r)
        assert not r.errors

    def test_wrong_format_and_missing_name(self, tmp_path):
        d = self._valid()
        d["format"] = "kc-dashboard-v0"
        d.pop("name")
        _write(tmp_path / "dashboards" / "bad" / "dashboard.json", d)
        r = Results()
        _mod.check_dashboard_schema(str(tmp_path), r)
        msgs = _messages(r.errors)
        assert any("format" in m for m in msgs)
        assert any("name" in m for m in msgs)

    def test_cards_not_a_list(self, tmp_path):
        d = self._valid()
        d["cards"] = "nope"
        _write(tmp_path / "dashboards" / "bad" / "dashboard.json", d)
        r = Results()
        _mod.check_dashboard_schema(str(tmp_path), r)
        assert any("array" in m for m in _messages(r.errors))

    def test_card_missing_card_type_and_position(self, tmp_path):
        d = self._valid()
        d["cards"] = [{}]
        _write(tmp_path / "dashboards" / "bad" / "dashboard.json", d)
        r = Results()
        _mod.check_dashboard_schema(str(tmp_path), r)
        msgs = _messages(r.errors)
        assert any("card_type" in m for m in msgs)
        assert any("position" in m for m in msgs)

    def test_position_missing_key(self, tmp_path):
        d = self._valid()
        d["cards"] = [{"card_type": "cpu_usage", "position": {"x": 0, "y": 0, "w": 6}}]
        _write(tmp_path / "dashboards" / "bad" / "dashboard.json", d)
        r = Results()
        _mod.check_dashboard_schema(str(tmp_path), r)
        assert any("'h'" in m for m in _messages(r.errors))

    def test_grid_overflow(self, tmp_path):
        d = self._valid()
        d["cards"] = [{"card_type": "cpu_usage", "position": {"x": 8, "y": 0, "w": 6, "h": 4}}]
        _write(tmp_path / "dashboards" / "overflow" / "dashboard.json", d)
        r = Results()
        _mod.check_dashboard_schema(str(tmp_path), r)
        assert "dashboard-grid" in _categories(r.errors)


class TestThemeSchema:
    REQUIRED_COLORS = [
        "background", "foreground", "card", "primary", "secondary",
        "muted", "accent", "destructive", "border", "input", "ring",
    ]

    def _valid(self):
        colors = {k: "#000000" for k in self.REQUIRED_COLORS}
        colors["brandPrimary"] = "#123456"
        colors["chartColors"] = ["#111", "#222", "#333", "#444"]
        return {
            "id": "dark",
            "name": "Dark",
            "dark": True,
            "colors": colors,
            "font": {"family": "Inter", "monoFamily": "Fira"},
        }

    def test_happy_path(self, tmp_path):
        _write(tmp_path / "themes" / "dark.json", self._valid())
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        assert not r.errors
        assert not r.warnings

    def test_missing_top_level_keys(self, tmp_path):
        t = self._valid()
        t.pop("id")
        t.pop("dark")
        _write(tmp_path / "themes" / "bad.json", t)
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        msgs = _messages(r.errors)
        assert any("'id'" in m for m in msgs)
        assert any("'dark'" in m for m in msgs)

    def test_colors_not_an_object(self, tmp_path):
        t = self._valid()
        t["colors"] = ["nope"]
        _write(tmp_path / "themes" / "bad.json", t)
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        assert any("must be an object" in m for m in _messages(r.errors))

    def test_missing_required_color(self, tmp_path):
        t = self._valid()
        del t["colors"]["primary"]
        _write(tmp_path / "themes" / "bad.json", t)
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        assert any("'primary'" in m for m in _messages(r.errors))

    def test_missing_brand_primary_warns(self, tmp_path):
        t = self._valid()
        del t["colors"]["brandPrimary"]
        _write(tmp_path / "themes" / "bad.json", t)
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        assert any("brandPrimary" in m for m in _messages(r.warnings))

    def test_chart_colors_too_few(self, tmp_path):
        t = self._valid()
        t["colors"]["chartColors"] = ["#111", "#222"]
        _write(tmp_path / "themes" / "bad.json", t)
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        assert any("chartColors" in m for m in _messages(r.warnings))

    def test_font_missing_families_warns(self, tmp_path):
        t = self._valid()
        t["font"] = {}
        _write(tmp_path / "themes" / "bad.json", t)
        r = Results()
        _mod.check_theme_schema(str(tmp_path), r)
        msgs = _messages(r.warnings)
        assert any("font.family" in m for m in msgs)
        assert any("monoFamily" in m for m in msgs)


class TestThemeConsistency:
    def test_single_theme_note(self, tmp_path):
        _write_themes(tmp_path / "themes" / "one.json", {"colors": {"a": "#000"}})
        r = Results_themes()
        _mod_themes.check_theme_consistency(str(tmp_path), r)
        assert any("nothing to compare" in m for m in _messages_themes(r.info))

    def test_matching_keys(self, tmp_path):
        colors = {"a": "#000", "b": "#111"}
        _write_themes(tmp_path / "themes" / "one.json", {"colors": colors})
        _write_themes(tmp_path / "themes" / "two.json", {"colors": dict(colors)})
        r = Results_themes()
        _mod_themes.check_theme_consistency(str(tmp_path), r)
        assert not r.warnings

    def test_missing_key_warns(self, tmp_path):
        _write_themes(tmp_path / "themes" / "one.json", {"colors": {"a": "#000", "b": "#111"}})
        _write_themes(tmp_path / "themes" / "two.json", {"colors": {"a": "#000"}})
        r = Results_themes()
        _mod_themes.check_theme_consistency(str(tmp_path), r)
        assert any("missing color keys" in m for m in _messages_themes(r.warnings))

    def test_extra_key_notes(self, tmp_path):
        _write_themes(tmp_path / "themes" / "one.json", {"colors": {"a": "#000"}})
        _write_themes(tmp_path / "themes" / "two.json", {"colors": {"a": "#000", "c": "#222"}})
        r = Results_themes()
        _mod_themes.check_theme_consistency(str(tmp_path), r)
        assert any("extra color keys" in m for m in _messages_themes(r.info))


class TestCheckDashboardSchemaSkipsMalformedJson(unittest.TestCase):
    """``check_dashboard_schema`` skips a dashboard.json that fails to parse."""

    def test_malformed_json_is_skipped(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            dash_dir = os.path.join(d, "dashboards", "broken")
            os.makedirs(dash_dir)
            with open(os.path.join(dash_dir, "dashboard.json"), "w") as f:
                f.write("{ not valid json")
            # Also add a valid dashboard so the check has something to accept.
            good_dir = os.path.join(d, "dashboards", "good")
            os.makedirs(good_dir)
            with open(os.path.join(good_dir, "dashboard.json"), "w") as f:
                json.dump({
                    "format": "kc-dashboard-v1",
                    "name": "Good",
                    "cards": [],
                }, f)
            results = Results_edge()
            # Must not raise despite the broken dashboard.
            check_dashboard_schema(d, results)
            # Malformed file is silently skipped; no schema error is raised
            # from that specific file (the JSON-parse error is reported by
            # the separate JSON validity check, not here).
            broken_schema_errors = [
                e for e in results.errors
                if "broken" in e.get("msg", "") and "format" in e.get("msg", "")
            ]
            self.assertEqual(broken_schema_errors, [])


class TestCheckersSkipMalformedJson(unittest.TestCase, _TempTreeMixin):
    """Every whole-tree JSON checker must survive a malformed input file
    without crashing, and must not emit a false-positive schema/naming/
    consistency error against the broken file.

    The parse failure is separately reported by ``check_json_syntax``;
    the schema checkers rely on that separation to stay single-purpose.
    """

    def _write(self, root: Path, rel: str, content: str) -> None:
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)

    def _valid_preset(self, card_type: str = "coredns_status") -> str:
        return json.dumps({
            "id": "sample",
            "name": "Sample",
            "card_type": card_type,
        })

    def _valid_dashboard(self) -> str:
        return json.dumps({
            "id": "d1",
            "name": "D",
            "cards": [{"card_type": "coredns_status"}],
        })

    def _valid_theme(self) -> str:
        return json.dumps({
            "id": "t1",
            "name": "T",
            "dark": True,
            "colors": {
                k: "#000000" for k in (
                    "background", "foreground", "card", "primary", "secondary",
                    "muted", "accent", "destructive", "border", "input", "ring",
                    "brandPrimary",
                )
            },
            "font": {"family": "sans", "monoFamily": "mono"},
        })

    # --- check_theme_schema (line 436) ---------------------------------

    def test_check_theme_schema_skips_malformed_theme(self):
        base = self._make_tree()
        self._write(base, "themes/broken.json", BROKEN_JSON)
        self._write(base, "themes/ok.json", self._valid_theme())
        results = Results_gaps()
        _mod_gaps.check_theme_schema(base, results)
        # Only errors that mention the broken file should be from a
        # separate JSON-syntax check; check_theme_schema itself must
        # not emit any error keyed to broken.json.
        for _sev, _cat, msg in _iter_all_findings(results):
            self.assertNotIn("broken.json", msg)

    # --- check_naming_conventions (line 476) ---------------------------

    def test_check_naming_conventions_skips_malformed_preset(self):
        base = self._make_tree()
        self._write(base, "presets/broken.json", BROKEN_JSON)
        self._write(base, "presets/ok.json", self._valid_preset())
        results = Results_gaps()
        _mod_gaps.check_naming_conventions(base, results)
        for _sev, _cat, msg in _iter_all_findings(results):
            self.assertNotIn("broken.json", msg)

    # --- get_all_marketplace_card_types (line 567) ---------------------

    def test_get_all_marketplace_card_types_skips_malformed_files(self):
        base = self._make_tree()
        self._write(base, "presets/broken.json", BROKEN_JSON)
        self._write(base, "presets/ok.json", self._valid_preset("kubeflow_status"))
        self._write(
            base, "dashboards/example/dashboard.json", self._valid_dashboard(),
        )
        types = _mod_gaps.get_all_marketplace_card_types(base)
        # ok.json contributes kubeflow_status; dashboard contributes
        # coredns_status via its cards[] array. broken.json contributes
        # nothing because it is skipped.
        self.assertIn("kubeflow_status", types)
        self.assertIn("coredns_status", types)

    # --- check_theme_consistency (line 1048) ---------------------------

    def test_check_theme_consistency_skips_malformed_theme(self):
        base = self._make_tree()
        # Need >= 2 themes for the consistency check to actually run.
        self._write(base, "themes/broken.json", BROKEN_JSON)
        self._write(base, "themes/ok1.json", self._valid_theme())
        self._write(base, "themes/ok2.json", self._valid_theme())
        results = Results_gaps()
        _mod_gaps.check_theme_consistency(base, results)
        # The two valid themes are structurally identical, so no drift
        # should be reported. The broken theme must be silently skipped.
        for _sev, _cat, msg in _iter_all_findings(results):
            self.assertNotIn("broken.json", msg)

    # --- check_cncf_coverage (line 1084) -------------------------------

    def test_check_cncf_coverage_skips_malformed_cncf_preset(self):
        base = self._make_tree()
        # File matches the cncf-*.json glob but fails to parse.
        self._write(base, "presets/cncf-broken.json", BROKEN_JSON)
        # Also drop a valid cncf preset so the loop iterates > 0 times
        # and the "skip" branch is genuinely exercised.
        self._write(
            base, "presets/cncf-ok.json",
            self._valid_preset("this_type_does_not_exist_in_console"),
        )
        # No console_path → get_all_console_card_types returns empty set,
        # so the "unimplemented card types" note is expected for cncf-ok,
        # but there must be no crash or reference to cncf-broken.
        with tempfile.TemporaryDirectory() as fake_console:
            results = Results_gaps()
            _mod_gaps.check_cncf_coverage(base, fake_console, results)
            for _sev, _cat, msg in _iter_all_findings(results):
                self.assertNotIn("cncf-broken.json", msg)


class TestCheckIsDemoDataWiringUnmappedCard(unittest.TestCase):
    """``check_is_demo_data_wiring`` iterates ``known_types`` and looks each
    one up in ``parse_card_type_to_component``. Types with no registry entry
    ``continue`` at line 649. The sibling ``check_consecutive_failures`` has
    a dedicated coverage test for the same guard
    (``test_unmapped_card_type_is_skipped``); this test covers the
    ``check_is_demo_data_wiring`` copy of the guard, which is a separate
    physical branch and therefore counted separately by coverage.py.
    """

    def _make_console_no_registry(self, tmp_path):
        console = tmp_path / "console"
        cards_dir = console / "web/src/components/cards"
        cards_dir.mkdir(parents=True)
        # Empty RAW_CARD_COMPONENTS registry: no card_type -> component
        # mapping, so every known_type will fail the ``comp_name`` lookup.
        (cards_dir / "cardRegistry.ts").write_text(
            "export const RAW_CARD_COMPONENTS = {}\n"
        )
        return console

    def test_unmapped_card_type_is_skipped(self):
        with tempfile.TemporaryDirectory() as d:
            tmp = Path(d)
            console = self._make_console_no_registry(tmp)
            base = tmp / "marketplace"
            base.mkdir()
            r = Results_gaps()
            # ``unregistered_card`` is not in RAW_CARD_COMPONENTS, so
            # ``comp_name`` is None on line 648 and line 649 continues.
            # The function must return cleanly with no warnings.
            _mod_gaps.check_is_demo_data_wiring(
                str(base), str(console), {"unregistered_card"}, r,
            )
            self.assertEqual(
                r.warnings, [],
                msg="unmapped card type must be silently skipped at line 649",
            )


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
    _mod_partials.check_dashboard_schema(str(tmp_path), results)
    grid_errors = [e for e in results.errors if e[0] == "dashboard-grid"]
    assert grid_errors == [], f"unexpected grid overflow error: {grid_errors}"


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
    _mod_partials.check_theme_schema(str(tmp_path), results)
    font_warnings = [w for w in results.warnings
                     if "font.family" in w[1] or "font.monoFamily" in w[1]]
    assert font_warnings == [], f"unexpected font warnings: {font_warnings}"


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
    _mod_partials.check_demo_data(str(base), str(console), {"ghost_card", "real_card"}, results)
    # ghost_card falls through isdir (false arm); no demo-data output for it.
    demo_ghost = [r for r in results.oks + results.warnings
                  if r[0] == "demo-data" and "ghost_card" in r[1]]
    assert demo_ghost == [], f"unexpected demo-data output for ghost: {demo_ghost}"
    # real_card exercises the true arm so the loop clearly iterated past
    # the false-arm card.
    demo_real = [r for r in results.oks if r[0] == "demo-data" and "real_card" in r[1]]
    assert demo_real, "expected demo-data ok for real_card"


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
    _mod_partials.check_i18n_keys(str(base), str(console), {"ghost_card"}, results)
    missing = [w for w in results.warnings
               if w[0] == "i18n" and "ghost_card" in w[1]]
    assert missing, "expected i18n warning for uncovered card_type"


if __name__ == "__main__":
    unittest.main()
