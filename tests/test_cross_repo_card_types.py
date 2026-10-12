"""Tests for card type existence and demo data checks.

Covers the following validators:
- check_card_type_existence: validates that referenced card types exist in console
- check_demo_data: ensures demo data is present for known card types
"""
from .conftest_cross_repo import _make_console, _make_marketplace, _messages, _mod


class TestCheckCardTypeExistence:
    def test_missing_console_registry(self, tmp_path):
        base = _make_marketplace(tmp_path, presets={
            "cluster_health": {"card_type": "cluster_health"},
        })
        console = tmp_path / "console"
        console.mkdir()
        r = _mod.Results()
        known = _mod.check_card_type_existence(str(base), str(console), r)
        assert known == set()
        assert any("Console card registry not found" in m for m in _messages(r.errors))

    def test_known_type_ok_and_unknown_error(self, tmp_path):
        console = _make_console(tmp_path, card_types=["cluster_health"])
        base = _make_marketplace(tmp_path, presets={
            "cluster_health_preset": {"card_type": "cluster_health"},
            "ghost_preset": {"card_type": "ghost_card"},
        })
        r = _mod.Results()
        known = _mod.check_card_type_existence(str(base), str(console), r)
        assert "cluster_health" in known
        assert "ghost_card" not in known
        assert any("cluster_health" in m for m in _messages(r.passes))
        assert any("ghost_card" in m and "not found" in m for m in _messages(r.errors))

    def test_status_suffix_recognized_as_placeholder(self, tmp_path):
        console = _make_console(tmp_path, card_types=[])
        base = _make_marketplace(tmp_path, presets={
            "trivy_placeholder": {"card_type": "trivy_status"},
        })
        r = _mod.Results()
        known = _mod.check_card_type_existence(str(base), str(console), r)
        assert "trivy_status" in known
        assert any("CNCF dynamic card placeholder" in m for m in _messages(r.passes))

    def test_unreadable_main_registry_warns_not_crashes(self, tmp_path, monkeypatch):
        # cardRegistry.ts passes the `os.path.isfile` guard (it exists) but
        # is unreadable (permission error, or deleted/replaced between the
        # `isfile` check and the open — a TOCTOU race). parse_card_registry
        # used to re-open it with no guard, raising an unhandled OSError
        # straight out of check_card_type_existence instead of degrading to
        # a recorded warning like the sibling checks already do.
        console = _make_console(tmp_path, card_types=["cluster_health"])
        base = _make_marketplace(tmp_path, presets={
            "cluster_health": {"card_type": "cluster_health"},
        })
        registry_ts = str(console / "web/src/components/cards/cardRegistry.ts")

        import builtins
        real_open = builtins.open

        def fake_open(path, *a, **kw):
            if str(path) == registry_ts:
                raise OSError("boom")
            return real_open(path, *a, **kw)

        monkeypatch.setattr(builtins, "open", fake_open)
        r = _mod.Results()
        known = _mod.check_card_type_existence(str(base), str(console), r)
        assert known == set()
        assert any("could not read console card registry" in m
                   for m in _messages(r.warnings))


class TestCheckDemoData:
    def test_demo_data_present_ok(self, tmp_path):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            demo_components=["cluster_health"],
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_demo_data(str(base), str(console), {"cluster_health"}, r)
        assert any("cluster_health" in m and "demoData" in m for m in _messages(r.passes))
        assert not r.warnings

    def test_demo_data_missing_warn(self, tmp_path):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            demo_components=[],
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_demo_data(str(base), str(console), {"cluster_health"}, r)
        assert any("cluster_health" in m and "missing demoData" in m
                   for m in _messages(r.warnings))

    def test_unknown_type_skipped_silently(self, tmp_path):
        console = _make_console(tmp_path, card_types=["cluster_health"])
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_demo_data(str(base), str(console), {"ghost_card"}, r)
        assert not r.warnings
        assert not r.passes


class TestCheckDemoDataMissingRegistryCoverage:
    def test_missing_console_registry_warns_not_crashes(self, tmp_path):
        # check_card_type_existence degrades a missing cardRegistry.ts to a
        # recorded error (not a crash) and returns an empty known_types.
        # check_demo_data used to re-open the same missing file
        # unconditionally — with no guard — before ever looking at
        # known_types, defeating that degrade-not-crash fix. It must now
        # warn and return instead of raising FileNotFoundError.
        console = tmp_path / "console"
        console.mkdir()
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_demo_data(str(base), str(console), set(), r)
        assert any("could not read console card registry" in m
                   for m in _messages(r.warnings))

    def test_unreadable_console_registry_warns_not_crashes(self, tmp_path, monkeypatch):
        console = _make_console(tmp_path, card_types=["cluster_health"])
        base = _make_marketplace(tmp_path)
        registry_ts = str(console / "web/src/components/cards/cardRegistry.ts")

        import builtins
        real_open = builtins.open

        def fake_open(path, *a, **kw):
            if str(path) == registry_ts:
                raise OSError("boom")
            return real_open(path, *a, **kw)

        monkeypatch.setattr(builtins, "open", fake_open)
        r = _mod.Results()
        _mod.check_demo_data(str(base), str(console), {"cluster_health"}, r)
        assert any("could not read console card registry" in m
                   for m in _messages(r.warnings))
