"""Schema validator tests: ``check_preset_schema``, ``check_dashboard_schema``
and ``check_theme_schema`` from ``scripts/validate-marketplace.py``.

Split from test_validate_check_functions.py (issue #554). Shared fixtures
live in ``validate_helpers``.
"""
from .validate_helpers import Results, _categories, _messages, _mod, _write

# ── check_preset_schema ────────────────────────────────────────────


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


# ── check_dashboard_schema ─────────────────────────────────────────


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


# ── check_theme_schema ─────────────────────────────────────────────


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

