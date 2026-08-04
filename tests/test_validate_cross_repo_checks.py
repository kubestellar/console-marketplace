"""Fixture-driven unit tests for the cross-repo ``check_*`` validators and
``main`` in ``scripts/validate-marketplace.py``.

These are the follow-up validators called out in PR #442's follow-up list:
``check_card_type_existence``, ``check_demo_data``, ``check_is_demo_data_wiring``,
``check_consecutive_failures``, ``check_i18n_keys``, ``check_cors_proxy``,
``check_cncf_coverage``, and the top-level ``main`` entrypoint.

Each test builds a minimal marketplace layout **and** a minimal fake console
checkout under ``tmp_path``.  The console layout only mocks the specific files
each validator opens (``web/src/components/cards/cardRegistry.ts``,
``web/src/locales/en/cards.json``, per-card ``demoData.ts`` etc.) — no real
console clone is required.
"""
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone

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


# ── check_card_type_existence ──────────────────────────────────────


class TestCheckCardTypeExistence:
    def test_missing_console_registry(self, tmp_path):
        base = _make_marketplace(tmp_path, presets={
            "cluster_health": {"card_type": "cluster_health"},
        })
        console = tmp_path / "console"
        console.mkdir()
        r = Results()
        known = _mod.check_card_type_existence(str(base), str(console), r)
        assert known == set()
        assert any("Console card registry not found" in m for m in _messages(r.errors))

    def test_known_type_ok_and_unknown_error(self, tmp_path):
        console = _make_console(tmp_path, card_types=["cluster_health"])
        base = _make_marketplace(tmp_path, presets={
            "cluster_health_preset": {"card_type": "cluster_health"},
            "ghost_preset": {"card_type": "ghost_card"},
        })
        r = Results()
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
        r = Results()
        known = _mod.check_card_type_existence(str(base), str(console), r)
        assert "trivy_status" in known
        assert any("CNCF dynamic card placeholder" in m for m in _messages(r.passes))


# ── check_demo_data ─────────────────────────────────────────────────


class TestCheckDemoData:
    def test_demo_data_present_ok(self, tmp_path):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            demo_components=["cluster_health"],
        )
        base = _make_marketplace(tmp_path)
        r = Results()
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
        r = Results()
        _mod.check_demo_data(str(base), str(console), {"cluster_health"}, r)
        assert any("cluster_health" in m and "missing demoData" in m
                   for m in _messages(r.warnings))

    def test_unknown_type_skipped_silently(self, tmp_path):
        console = _make_console(tmp_path, card_types=["cluster_health"])
        base = _make_marketplace(tmp_path)
        r = Results()
        _mod.check_demo_data(str(base), str(console), {"ghost_card"}, r)
        assert not r.warnings
        assert not r.passes


# ── check_is_demo_data_wiring ──────────────────────────────────────


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
        r = Results()
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
        r = Results()
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
        r = Results()
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
        r = Results()
        _mod.check_is_demo_data_wiring(str(base), str(console),
                                       {"cluster_health"}, r)
        assert not r.warnings


# ── check_consecutive_failures ─────────────────────────────────────


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
        r = Results()
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
        r = Results()
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
        r = Results()
        _mod.check_consecutive_failures(str(base), str(console),
                                        {"cluster_health"}, r)
        assert not r.warnings


# ── check_i18n_keys ────────────────────────────────────────────────


class TestCheckI18nKeys:
    def test_missing_cards_json_skipped_with_warn(self, tmp_path):
        # Console exists but no cards.json — expected to warn once and return.
        console = _make_console(tmp_path, card_types=["cluster_health"])
        base = _make_marketplace(tmp_path)
        r = Results()
        _mod.check_i18n_keys(str(base), str(console),
                             {"cluster_health"}, r)
        msgs = _messages(r.warnings)
        assert any("skipping i18n check" in m for m in msgs)
        # And no per-card warning should have been raised for the skip case.
        assert not any("cluster_health" in m for m in msgs)

    def test_missing_translation_key_warns(self, tmp_path):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            i18n_keys={"other_card": {"title": "x"}},
        )
        base = _make_marketplace(tmp_path)
        r = Results()
        _mod.check_i18n_keys(str(base), str(console),
                             {"cluster_health"}, r)
        assert any("cluster_health" in m and "no translation keys" in m
                   for m in _messages(r.warnings))

    def test_exact_key_match_no_warn(self, tmp_path):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            i18n_keys={"cluster_health": {"title": "OK"}},
        )
        base = _make_marketplace(tmp_path)
        r = Results()
        _mod.check_i18n_keys(str(base), str(console),
                             {"cluster_health"}, r)
        assert not any("cluster_health" in m for m in _messages(r.warnings))

    def test_nested_prefix_match_no_warn(self, tmp_path):
        console = _make_console(
            tmp_path,
            card_types=["cluster_health"],
            i18n_keys={"cluster_health": {"title": "OK", "sub": {"label": "x"}}},
        )
        base = _make_marketplace(tmp_path)
        r = Results()
        _mod.check_i18n_keys(str(base), str(console),
                             {"cluster_health"}, r)
        assert not any("cluster_health" in m for m in _messages(r.warnings))

    def test_marketplace_local_cards_json_merged(self, tmp_path):
        # Console cards.json absent, but marketplace-local one covers the key.
        base = _make_marketplace(tmp_path)
        mp_cards = base / "web/src/locales/en/cards.json"
        mp_cards.parent.mkdir(parents=True, exist_ok=True)
        mp_cards.write_text(json.dumps({"cluster_health": {"title": "x"}}))
        console = _make_console(tmp_path, card_types=["cluster_health"])
        r = Results()
        _mod.check_i18n_keys(str(base), str(console),
                             {"cluster_health"}, r)
        assert not any("cluster_health" in m for m in _messages(r.warnings))
        # And the "skipping" warning should not be raised when a local file exists.
        assert not any("skipping i18n check" in m for m in _messages(r.warnings))

    def test_invalid_cards_json_warns_but_does_not_raise(self, tmp_path):
        console = _make_console(tmp_path, card_types=["cluster_health"])
        cards_json = console / "web/src/locales/en/cards.json"
        cards_json.parent.mkdir(parents=True, exist_ok=True)
        cards_json.write_text("{not-json")
        base = _make_marketplace(tmp_path)
        r = Results()
        _mod.check_i18n_keys(str(base), str(console),
                             {"cluster_health"}, r)
        assert any("Failed to parse" in m for m in _messages(r.warnings))


# ── check_cors_proxy ───────────────────────────────────────────────


class TestCheckCorsProxy:
    def test_no_hooks_dir_warn_skip(self, tmp_path):
        base = _make_marketplace(tmp_path)
        console = _make_console(tmp_path, card_types=[])
        r = Results()
        _mod.check_cors_proxy(str(base), str(console), set(), r)
        assert any("No hooks directory found" in m for m in _messages(r.warnings))

    def test_direct_fetch_flagged(self, tmp_path):
        hook_src = (
            "export function useThing(){\n"
            "  return fetch('https://api.example.com/data');\n"
            "}\n"
        )
        base = _make_marketplace(tmp_path, hooks={"useThing.ts": hook_src})
        console = _make_console(tmp_path, card_types=[])
        r = Results()
        _mod.check_cors_proxy(str(base), str(console), set(), r)
        assert any("direct external fetch" in m and "useThing.ts" in m
                   for m in _messages(r.warnings))

    def test_direct_axios_flagged(self, tmp_path):
        hook_src = "axios.get('https://foo.example.com/x')\n"
        base = _make_marketplace(tmp_path, hooks={"useAx.ts": hook_src})
        console = _make_console(tmp_path, card_types=[])
        r = Results()
        _mod.check_cors_proxy(str(base), str(console), set(), r)
        assert any("useAx.ts" in m for m in _messages(r.warnings))

    def test_localhost_and_proxy_not_flagged(self, tmp_path):
        hook_src = (
            "fetch('http://localhost:3000/x');\n"
            "fetch('/api/proxy/things');\n"
            "fetch('http://127.0.0.1:8080/y');\n"
        )
        base = _make_marketplace(tmp_path, hooks={"useSafe.ts": hook_src})
        console = _make_console(tmp_path, card_types=[])
        r = Results()
        _mod.check_cors_proxy(str(base), str(console), set(), r)
        assert not any("useSafe.ts" in m for m in _messages(r.warnings))


# ── check_cncf_coverage ────────────────────────────────────────────


class TestCheckCncfCoverage:
    def test_all_mapped_ok(self, tmp_path):
        console = _make_console(tmp_path, card_types=["cluster_health"])
        base = _make_marketplace(
            tmp_path,
            cncf_presets={"cluster_health": {"card_type": "cluster_health"}},
        )
        r = Results()
        _mod.check_cncf_coverage(str(base), str(console), r)
        assert any("All CNCF presets map" in m for m in _messages(r.passes))

    def test_unimplemented_types_flagged_as_note(self, tmp_path):
        console = _make_console(tmp_path, card_types=["cluster_health"])
        base = _make_marketplace(
            tmp_path,
            cncf_presets={
                "cluster_health": {"card_type": "cluster_health"},
                "ghost": {"card_type": "ghost_card"},
                "wraith": {"card_type": "wraith_card"},
            },
        )
        r = Results()
        _mod.check_cncf_coverage(str(base), str(console), r)
        # info records track "note"s.
        notes = _messages(r.info)
        assert any("2 CNCF presets reference unimplemented" in m and
                   "ghost_card" in m and "wraith_card" in m for m in notes)

    def test_missing_console_registry_still_flags_missing(self, tmp_path):
        # Without a cardRegistry.ts, every CNCF preset is missing.
        console = tmp_path / "console"
        (console / "web/src/components/cards").mkdir(parents=True)
        base = _make_marketplace(
            tmp_path,
            cncf_presets={"foo": {"card_type": "foo_card"}},
        )
        r = Results()
        _mod.check_cncf_coverage(str(base), str(console), r)
        assert any("foo_card" in m for m in _messages(r.info))


# ── main() entrypoint ──────────────────────────────────────────────


def _run_main(monkeypatch, argv):
    monkeypatch.setattr(sys, "argv", ["validate-marketplace.py", *argv])
    with pytest.raises(SystemExit) as excinfo:
        _mod.main()
    return excinfo.value.code


class TestMain:
    def test_cross_repo_requires_console_path(self, monkeypatch, tmp_path, capsys):
        base = _make_marketplace(tmp_path, registry={"presets": [], "themes": [],
                                                     "dashboards": []})
        code = _run_main(monkeypatch, [
            "--mode", "cross-repo",
            "--marketplace-path", str(base),
        ])
        assert code == 1
        out = capsys.readouterr().out
        assert "--console-path is required" in out

    def test_static_mode_clean_exit_zero(self, monkeypatch, tmp_path, capsys):
        base = _make_marketplace(
            tmp_path,
            registry={"presets": [], "themes": [], "dashboards": []},
        )
        code = _run_main(monkeypatch, [
            "--mode", "static",
            "--marketplace-path", str(base),
        ])
        assert code == 0
        out = capsys.readouterr().out
        assert "0 error" in out

    def test_static_mode_json_output(self, monkeypatch, tmp_path, capsys):
        base = _make_marketplace(
            tmp_path,
            registry={"presets": [], "themes": [], "dashboards": []},
        )
        code = _run_main(monkeypatch, [
            "--mode", "static", "--json",
            "--marketplace-path", str(base),
        ])
        captured = capsys.readouterr()
        payload = json.loads(captured.out)
        assert payload["exit_code"] == code == 0
        assert "errors" in payload and "warnings" in payload

    def test_full_mode_writes_github_summary(self, monkeypatch, tmp_path):
        console = _make_console(tmp_path, card_types=["cluster_health"],
                                 demo_components=["cluster_health"],
                                 i18n_keys={"cluster_health": {"title": "x"}})
        base = _make_marketplace(
            tmp_path,
            registry={
                "presets": [], "themes": [], "dashboards": [],
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            },
        )
        summary = tmp_path / "summary.md"
        code = _run_main(monkeypatch, [
            "--mode", "full",
            "--console-path", str(console),
            "--marketplace-path", str(base),
            "--github-summary", str(summary),
        ])
        assert code in (0, 2)  # warnings allowed, no errors expected
        text = summary.read_text()
        assert "Marketplace Quality" in text
        # Cross-repo table is appended when console_path is provided.
        assert "Card Quality Matrix" in text
