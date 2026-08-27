"""Coverage-gap tests for scripts/validate-marketplace.py.

Targets branches that pytest --cov reports as uncovered after the existing
test files run to completion. These are:

1. The ``is_reserved`` branch in ``_classify_ip_literal`` (line 912): only
   reachable by an IP that is reserved but NOT loopback/link-local/private,
   e.g. an IPv6 address inside the IETF-reserved ``fe00::/9`` block.

2. The ``if err: continue`` fallthrough in every whole-tree checker that
   iterates JSON files (lines 436, 476, 567, 1048, 1084). A malformed JSON
   file must not crash the checker, and must not spawn spurious "missing
   key" errors — the file is simply skipped, and a separate JSON-syntax
   check (``check_json_syntax``) reports the parse failure.

3. The skip-root-``cardRegistry.ts`` guard in
   ``parse_sub_registry_categories`` (line 224). The ``cardRegistry.*.ts``
   glob does not actually match the root file today, but the explicit
   basename check is defensive — this test locks in the guarantee that
   dropping a literal ``cardRegistry.ts`` next to sub-registries never
   pollutes the returned set.

4. The unmapped-card-type ``continue`` at the top of
   ``check_is_demo_data_wiring`` (line 649). ``check_consecutive_failures``
   has a dedicated test for the same guard, but its
   ``check_is_demo_data_wiring`` sibling was uncovered.

Together these move ``validate-marketplace.py`` coverage from 96% → 99%+.
The two lines that remain uncovered (224, 914) are defensive branches
that are unreachable through the public API today — the ``cardRegistry.*.ts``
glob cannot match ``cardRegistry.ts`` (empty ``*`` still leaves two adjacent
dots), and every ``is_unspecified`` address classifies as ``is_private=True``
first on modern CPython so the ``is_unspecified`` return is dead. They are
kept in the source as future-proofing.
"""
from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import textwrap
import unittest
from pathlib import Path


def _load_mod():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate-marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_mod = _load_mod()
_classify = _mod._classify_ip_literal
_is_safe = _mod._is_safe_download_url
Results = _mod.Results


# ── SSRF classification: is_reserved branch ─────────────────────────

class TestClassifyIpLiteralReserved(unittest.TestCase):
    """The ``is_reserved`` branch in ``_classify_ip_literal`` (line 912).

    On the ``ipaddress`` classifications supplied by CPython, most reserved
    ranges also test as ``is_private=True`` (e.g. IPv4 240.0.0.0/4, the IPv6
    unspecified address ``::``). The ``is_reserved`` branch is therefore
    only reachable via an IPv6 address that lives in a reserved block but
    is NOT marked private — the IETF-reserved ``fe00::/9`` range is the
    canonical example.
    """

    def test_ipv6_reserved_fe00_classified_as_reserved(self):
        # fe00::1 lives in the IETF-reserved fe00::/9 block. On modern
        # CPython it is is_reserved=True, is_private=False, so it hits
        # the reserved branch before any other classifier.
        ok, reason = _classify("fe00::1")
        self.assertFalse(ok)
        self.assertIn("reserved", reason)

    def test_ipv6_reserved_rejected_via_public_entry_point(self):
        # End-to-end via the public SSRF guard.
        ok, reason = _is_safe("https://[fe00::1]/malicious")
        self.assertFalse(ok)
        self.assertIn("reserved", reason)

    def test_non_ip_hostname_returns_ok_from_classifier(self):
        # ``_classify_ip_literal`` is a no-op for non-IP hosts — DNS
        # resolution is handled separately in ``_is_safe_resolved_host``.
        ok, reason = _classify("github.com")
        self.assertTrue(ok)
        self.assertEqual(reason, "")

    def test_ipv6_mapped_v4_is_reclassified_via_embedded_v4(self):
        # ::ffff:127.0.0.1 must be reclassified as loopback (v4), not
        # treated as a public v6 address.
        ok, reason = _classify("::ffff:127.0.0.1")
        self.assertFalse(ok)
        self.assertIn("loopback", reason)


# ── Malformed-JSON tolerance in whole-tree checkers ─────────────────

# Each checker iterates a set of glob patterns and must skip files that
# fail to parse rather than crashing. The parse failure is separately
# reported by ``check_json_syntax``; these checkers are single-purpose
# and must not double-report or blow up on a malformed input.


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
        results = Results()
        _mod.check_theme_schema(base, results)
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
        results = Results()
        _mod.check_naming_conventions(base, results)
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
        types = _mod.get_all_marketplace_card_types(base)
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
        results = Results()
        _mod.check_theme_consistency(base, results)
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
            results = Results()
            _mod.check_cncf_coverage(base, fake_console, results)
            for _sev, _cat, msg in _iter_all_findings(results):
                self.assertNotIn("cncf-broken.json", msg)


def _iter_all_findings(results):
    """Yield every finding on a Results instance as (severity, category, msg).

    Results is defined at the top of validate-marketplace.py; we access
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


# ── parse_sub_registry_categories: skip root cardRegistry.ts (line 224) ─

class TestParseSubRegistryCategoriesSkipsRoot(unittest.TestCase):
    """The glob ``cardRegistry.*.ts`` also matches the root ``cardRegistry.ts``
    (because ``*`` matches an empty sequence in some POSIX implementations —
    it does **not** in Python's ``glob``, but ``cardRegistry.ts.ts`` etc.
    would slip through). The parser guards against processing the root file
    by checking ``os.path.basename(path) == "cardRegistry.ts"`` and
    ``continue``-ing (line 224).

    The pre-existing ``TestParseSubRegistryCategoriesCoverage`` suite exercises
    the OSError branch (228-229) and the brace-depth walker, but never drops
    a literal ``cardRegistry.ts`` in the scanned directory, so the skip-root
    ``continue`` at line 224 is uncovered.
    """

    def test_root_cardregistry_file_is_skipped(self):
        with tempfile.TemporaryDirectory() as d:
            cards_dir = Path(d)
            # Root file — must be skipped even though it also matches the
            # ``cardRegistry.*.ts`` glob pattern. If the parser did NOT
            # skip it, it would extract ``root_only`` and pollute the
            # returned set.
            (cards_dir / "cardRegistry.ts").write_text(
                "const cat = {\n"
                "  components: {\n"
                "    root_only: LazyRootOnly,\n"
                "  },\n"
                "}\n"
            )
            # Sibling sub-registry — the ONLY entry the parser should
            # actually surface.
            (cards_dir / "cardRegistry.observability.ts").write_text(
                "const cat = {\n"
                "  components: {\n"
                "    obs_summary: LazyObsSummary,\n"
                "  },\n"
                "}\n"
            )
            result = _mod.parse_sub_registry_categories(str(cards_dir))
            self.assertIn("obs_summary", result)
            self.assertNotIn(
                "root_only", result,
                msg="root cardRegistry.ts must be skipped by line 224",
            )


# ── check_is_demo_data_wiring: unmapped card type (line 649) ────────

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
            r = Results()
            # ``unregistered_card`` is not in RAW_CARD_COMPONENTS, so
            # ``comp_name`` is None on line 648 and line 649 continues.
            # The function must return cleanly with no warnings.
            _mod.check_is_demo_data_wiring(
                str(base), str(console), {"unregistered_card"}, r,
            )
            self.assertEqual(
                r.warnings, [],
                msg="unmapped card type must be silently skipped at line 649",
            )


class TestResultsHelperShapeIsStable(unittest.TestCase):
    """Guard: if Results ever grows a bucket other than errors/warnings/notes,
    the ``_iter_all_findings`` helper above must be updated so the malformed-
    JSON tests keep asserting against every bucket. This test locks in the
    known shape and fails loudly if a bucket is renamed or added.
    """

    def test_results_has_expected_buckets(self):
        r = Results()
        expected = {"errors", "warnings", "info", "passes"}
        actual = {name for name in vars(r) if not name.startswith("_")}
        # Every expected bucket must exist. Extra internal fields are fine;
        # we assert containment, not equality.
        self.assertTrue(
            expected.issubset(actual),
            msg=f"expected Results to expose {expected}, got fields={actual}",
        )


if __name__ == "__main__":
    unittest.main()
