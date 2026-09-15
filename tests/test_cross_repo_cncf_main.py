"""Tests for CNCF coverage and main entry point.

Covers the following validators:
- check_cncf_coverage: validates CNCF preset card type mapping
- main: top-level validator and mode handling
- parse_sub_registry_categories: registry parsing with coverage gap tests
"""
import json
import sys
from datetime import datetime, timezone

import pytest

from .conftest_cross_repo import _make_console, _make_marketplace, _messages, _mod, _run_main


class TestCheckCncfCoverage:
    def test_all_mapped_ok(self, tmp_path):
        console = _make_console(tmp_path, card_types=["cluster_health"])
        base = _make_marketplace(
            tmp_path,
            cncf_presets={"cluster_health": {"card_type": "cluster_health"}},
        )
        r = _mod.Results()
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
        r = _mod.Results()
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
        r = _mod.Results()
        _mod.check_cncf_coverage(str(base), str(console), r)
        assert any("foo_card" in m for m in _messages(r.info))


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


# ── Coverage-gap regression tests ──────────────────────────────────
#
# The tests below close small but real gaps in ``validate-marketplace.py``
# reported by ``coverage report -m``:
#
#   - parse_sub_registry_categories: nested-brace depth tracking, and the
#     OSError branch guarding a sub-registry read.
#
# All are test-only additions.


class TestParseSubRegistryCategoriesCoverage:
    def test_nested_braces_do_not_close_components_block_early(self, tmp_path):
        # A safeLazy() options object inside the components map has nested
        # ``{ ... }`` — the parser must track brace depth so keys after the
        # nested object are still recognized. Without depth tracking the
        # parser would stop at the first ``}`` and miss ``pod_issues``.
        (tmp_path / "cardRegistry.mixed.ts").write_text(
            "const cat = {\n"
            "  components: {\n"
            "    cluster_health: safeLazy(() => import('./ClusterHealth'), { fallback: LoadingCard }),\n"
            "    pod_issues: LazyPodIssues,\n"
            "  },\n"
            "}\n"
        )
        result = _mod.parse_sub_registry_categories(str(tmp_path))
        assert {"cluster_health", "pod_issues"} <= result

    def test_oserror_on_sub_file_is_swallowed(self, tmp_path, monkeypatch):
        (tmp_path / "cardRegistry.observability.ts").write_text(
            "const cat = { components: { obs_summary: LazyObsSummary } }\n"
        )
        real_open = _mod.open if hasattr(_mod, "open") else open
        import builtins

        def fake_open(path, *a, **kw):
            if "cardRegistry.observability.ts" in str(path):
                raise OSError("permission denied")
            return real_open(path, *a, **kw)

        monkeypatch.setattr(builtins, "open", fake_open)
        # OSError branch must swallow the failure and return an empty set
        # for the unreadable file — no exception propagates.
        assert _mod.parse_sub_registry_categories(str(tmp_path)) == set()
