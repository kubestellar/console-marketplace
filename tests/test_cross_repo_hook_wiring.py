"""Tests for hook wiring checks.

Covers the following validators:
- check_is_demo_data_wiring: ensures hooks that use card loading state pass isDemoData
- check_consecutive_failures: ensures cached data hooks handle consecutive failures
"""
from .conftest_cross_repo import _make_console, _make_marketplace, _messages, _mod


class TestCheckIsDemoDataWiring:
    def test_warn_when_hook_used_without_is_demo_data(self, tmp_path):
        body = (
            "import { useCardLoadingState } from '../hooks';\n"
            "export default function ClusterHealth(){\n"
            "  const s = useCardLoadingState(loading, error, data);\n"
            "  return null;\n"
            "}\n"
        )
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            extra_component_bodies={"cluster_health": body},
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_is_demo_data_wiring(str(base), str(console),
                                       {"cluster_health"}, r)
        assert any("does not pass isDemoData" in m for m in _messages(r.warnings))

    def test_no_warn_when_is_demo_data_passed(self, tmp_path):
        body = (
            "export default function ClusterHealth(){\n"
            "  useCardLoadingState({ loading, error, data, isDemoData });\n"
            "  return null;\n"
            "}\n"
        )
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            extra_component_bodies={"cluster_health": body},
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_is_demo_data_wiring(str(base), str(console),
                                       {"cluster_health"}, r)
        assert not r.warnings

    def test_no_warn_when_report_hook_passes_is_demo_data(self, tmp_path):
        body = (
            "export default function ClusterHealth(){\n"
            "  useReportCardDataState({ loading, isDemoData });\n"
            "  return null;\n"
            "}\n"
        )
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            extra_component_bodies={"cluster_health": body},
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        # Include the useCardLoadingState marker so the check gates on the
        # main hook while the isDemoData proof comes from useReportCardDataState.
        (console / "web/src/components/cards/ClusterHealth/ClusterHealth.tsx"
         ).write_text(
            "useCardLoadingState(x);\n" + body
        )
        _mod.check_is_demo_data_wiring(str(base), str(console),
                                       {"cluster_health"}, r)
        assert not r.warnings

    def test_hook_absent_no_warn(self, tmp_path):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            extra_component_bodies={"cluster_health": "export default () => null;\n"},
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_is_demo_data_wiring(str(base), str(console),
                                       {"cluster_health"}, r)
        assert not r.warnings


class TestCheckConsecutiveFailures:
    def test_warn_when_cached_hook_without_consecutive_failures(self, tmp_path):
        body = (
            "export default function ClusterHealth(){\n"
            "  const { data } = useCachedClusters();\n"
            "  return null;\n"
            "}\n"
        )
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            extra_component_bodies={"cluster_health": body},
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_consecutive_failures(str(base), str(console),
                                        {"cluster_health"}, r)
        assert any("consecutiveFailures" in m for m in _messages(r.warnings))

    def test_no_warn_when_consecutive_failures_present(self, tmp_path):
        body = (
            "export default function ClusterHealth(){\n"
            "  const { data, consecutiveFailures } = useCachedClusters();\n"
            "  return null;\n"
            "}\n"
        )
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            extra_component_bodies={"cluster_health": body},
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_consecutive_failures(str(base), str(console),
                                        {"cluster_health"}, r)
        assert not r.warnings

    def test_no_warn_when_cached_hook_absent(self, tmp_path):
        body = "export default () => null;\n"
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            extra_component_bodies={"cluster_health": body},
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_consecutive_failures(str(base), str(console),
                                        {"cluster_health"}, r)
        assert not r.warnings


# ── Coverage-gap regression tests for isDemoData wiring ────────────────────


class TestCheckIsDemoDataWiringCoverage:
    def test_test_and_demodata_files_are_skipped(self, tmp_path):
        # Main-file loop must skip ``*.test.tsx`` and ``demoData.tsx`` so
        # a ``useCardLoadingState`` mention inside a test fixture never
        # triggers a false "does not pass isDemoData" warning.
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            extra_component_bodies={"cluster_health": "// no hook here\n"},
        )
        comp_dir = console / "web/src/components/cards/ClusterHealth"
        (comp_dir / "ClusterHealth.test.tsx").write_text(
            "useCardLoadingState(x); // not isDemoData\n"
        )
        (comp_dir / "demoData.tsx").write_text(
            "useCardLoadingState(x); // not isDemoData\n"
        )
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_is_demo_data_wiring(str(base), str(console),
                                       {"cluster_health"}, r)
        # No warning because the only mentions live in skipped files.
        assert not r.warnings

    def test_unreadable_component_file_is_swallowed(self, tmp_path, monkeypatch):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            extra_component_bodies={"cluster_health": "useCardLoadingState(x);\n"},
        )
        base = _make_marketplace(tmp_path)
        target = str(console / "web/src/components/cards/ClusterHealth/ClusterHealth.tsx")

        import builtins
        real_open = builtins.open

        def fake_open(path, *a, **kw):
            if str(path) == target:
                raise OSError("boom")
            return real_open(path, *a, **kw)

        monkeypatch.setattr(builtins, "open", fake_open)
        r = _mod.Results()
        # The OSError branch must swallow the failure. No hook was
        # observed (because the file couldn't be read) so no warning
        # is emitted.
        _mod.check_is_demo_data_wiring(str(base), str(console),
                                       {"cluster_health"}, r)
        assert not r.warnings


# ── Coverage-gap regression tests for consecutive failures ──────────────────


class TestCheckConsecutiveFailuresCoverage:
    def test_unmapped_card_type_is_skipped(self, tmp_path):
        # A card type present in known_types but absent from the registry
        # (no RAW_CARD_COMPONENTS entry) must be skipped without warning
        # or error — this is the ``comp_name`` guard at the top of the loop.
        console = _make_console(tmp_path, card_types=[])  # empty registry
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_consecutive_failures(str(base), str(console),
                                        {"unregistered_card"}, r)
        assert not r.warnings

    def test_test_and_demodata_files_are_skipped(self, tmp_path):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            extra_component_bodies={"cluster_health": "// no hook here\n"},
        )
        comp_dir = console / "web/src/components/cards/ClusterHealth"
        (comp_dir / "ClusterHealth.test.ts").write_text("useCachedClusters();\n")
        (comp_dir / "demoData.ts").write_text("useCachedClusters();\n")
        base = _make_marketplace(tmp_path)
        r = _mod.Results()
        _mod.check_consecutive_failures(str(base), str(console),
                                        {"cluster_health"}, r)
        # No warning because ``useCached*`` only appears in skipped files.
        assert not r.warnings

    def test_unreadable_component_file_is_swallowed(self, tmp_path, monkeypatch):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            extra_component_bodies={"cluster_health": "useCachedClusters();\n"},
        )
        base = _make_marketplace(tmp_path)
        target = str(console / "web/src/components/cards/ClusterHealth/ClusterHealth.tsx")

        import builtins
        real_open = builtins.open

        def fake_open(path, *a, **kw):
            if str(path) == target:
                raise OSError("boom")
            return real_open(path, *a, **kw)

        monkeypatch.setattr(builtins, "open", fake_open)
        r = _mod.Results()
        _mod.check_consecutive_failures(str(base), str(console),
                                        {"cluster_health"}, r)
        # OSError swallowed → uses_cached stays False → no warning.
        assert not r.warnings
