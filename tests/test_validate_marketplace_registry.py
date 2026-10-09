"""Registry and card-descriptor parsing in ``scripts/validate_marketplace.py``.

Covers ``parse_card_descriptors``, ``parse_card_registry``,
``parse_raw_card_components``, ``parse_sub_registry_categories``,
``parse_card_type_to_component``, ``parse_lazy_imports``,
``get_all_console_card_types`` and the registry checkers
(naming conventions, entry shape, console/registry consistency,
id path-traversal guard and staleness).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import io
import json
import os
from pathlib import Path
import runpy
import tempfile
import textwrap
from unittest import mock
import unittest

import pytest

from .validate_helpers import Results as Results_reg, _categories, _messages, _mod as _mod_reg, _write
from tests.conftest import load_validate_marketplace
from tests.conftest import load_validate_marketplace as _load_mod


# ── helpers from test_validate_card_descriptors_and_registry.py ──
vm = load_validate_marketplace()


# ── helpers from test_validate_results_and_parsers.py ──
_mod = load_validate_marketplace()


# ── helpers from test_validate_edge_cases.py ──
_mod_edge = load_validate_marketplace()

parse_card_registry = _mod_edge.parse_card_registry

parse_sub_registry_categories = _mod_edge.parse_sub_registry_categories

Results = _mod_edge.Results


# ── helpers from test_validate_coverage_gaps.py ──
_mod_gaps = load_validate_marketplace()


# ── helpers from test_validate_more_branches.py ──
_mod_more = load_validate_marketplace()

Results_more = _mod_more.Results

def _make_console_with_orphan_mapping(tmp_path, orphan_ct="orphan_card",
                                      orphan_missing_dir=False,
                                      valid_ct=None):
    """Build a console tree whose ``RAW_CARD_COMPONENTS`` names a component
    that is NOT declared via ``const X = lazy(() => import('./X'))``.

    This targets the ``if not import_path: continue`` branch when
    ``orphan_missing_dir`` is False, and the ``if not os.path.isdir(comp_dir)``
    branch when it is True (the orphan gets a lazy() import but no directory).
    """
    console = tmp_path / "console"
    cards_dir = console / "web/src/components/cards"
    cards_dir.mkdir(parents=True)

    lines = ["import { lazy } from 'react';"]
    raw_lines = []

    if orphan_missing_dir:
        lines.append("const Orphan = lazy(() => import('./OrphanDir'));")
        raw_lines.append(f"  {orphan_ct}: Orphan,")
    else:
        raw_lines.append(f"  {orphan_ct}: Orphan,")

    if valid_ct is not None:
        lines.append("const Valid = lazy(() => import('./Valid'));")
        raw_lines.append(f"  {valid_ct}: Valid,")
        (cards_dir / "Valid").mkdir()
        (cards_dir / "Valid" / "Valid.tsx").write_text("// placeholder\n")

    lines.append("")
    lines.append("const _UNIFIED_ONLY_TYPES = [" +
                 ", ".join(f"'{c}'" for c in ([orphan_ct] +
                                              ([valid_ct] if valid_ct else []))) +
                 "];")
    lines.append("")
    lines.append("export const RAW_CARD_COMPONENTS = {")
    lines.extend(raw_lines)
    lines.append("}")
    lines.append("")
    (cards_dir / "cardRegistry.ts").write_text("\n".join(lines))
    return console


# ── helpers from test_validate_remaining_partials.py ──
_mod_partials = load_validate_marketplace()


# ── helpers from test_validate_registry_consistency_branches.py ──
_mod_consistency = load_validate_marketplace()

Results_consistency = _mod_consistency.Results

def _write_consistency(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj))

def _messages_consistency(records):
    return [m for _, m in records]


# ── helpers from test_validate_registry_id_path_traversal.py ──
_mod_traversal = load_validate_marketplace()

Results_traversal = _mod_traversal.Results

def _write_traversal(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj))

def _messages_traversal(records):
    return [m for _, m in records]


class TestParseCardDescriptors:
    """Cover the CardDescriptor id regex and file-missing branch."""

    def test_returns_empty_set_when_file_missing(self, tmp_path):
        # File does not exist -> function short-circuits to empty set.
        missing = tmp_path / "does-not-exist.ts"
        assert vm.parse_card_descriptors(str(missing)) == set()

    def test_extracts_single_quoted_ids(self, tmp_path):
        f = tmp_path / "cardDescriptors.registry.ts"
        f.write_text(
            "export const cardDescriptors: CardDescriptor[] = [\n"
            "  {\n"
            "    id: 'cluster_health',\n"
            "    Component: LazyClusterHealth,\n"
            "  },\n"
            "  {\n"
            "    id: 'node_status',\n"
            "  },\n"
            "]\n"
        )
        assert vm.parse_card_descriptors(str(f)) == {"cluster_health", "node_status"}

    def test_extracts_double_quoted_ids(self, tmp_path):
        f = tmp_path / "cardDescriptors.registry.ts"
        f.write_text(
            "const items = [\n"
            "  {\n"
            '    id: "workloads_summary",\n'
            "  },\n"
            "  {\n"
            '    id: "storage_summary",\n'
            "  },\n"
            "]\n"
        )
        assert vm.parse_card_descriptors(str(f)) == {"workloads_summary", "storage_summary"}

    def test_supports_hyphenated_ids(self, tmp_path):
        # The regex allows kebab-case as well as snake_case ids.
        f = tmp_path / "cardDescriptors.registry.ts"
        f.write_text("[\n  {\n    id: 'deploy-bundle',\n  },\n]\n")
        assert vm.parse_card_descriptors(str(f)) == {"deploy-bundle"}

    def test_ignores_non_anchored_id_lines(self, tmp_path):
        # The regex uses `^\s*id:` so an `id:` appearing mid-line
        # (e.g. inside a comment or object spread) must not match.
        f = tmp_path / "cardDescriptors.registry.ts"
        f.write_text(
            "// note: id: 'not_a_real_card', in a comment\n"
            "const x = { foo: 'x', id: 'inline_should_not_match',\n"
            "  id: 'valid_card',\n"
            "}\n"
        )
        result = vm.parse_card_descriptors(str(f))
        assert "valid_card" in result
        assert "not_a_real_card" not in result
        assert "inline_should_not_match" not in result

    def test_returns_empty_set_on_file_without_matches(self, tmp_path):
        f = tmp_path / "cardDescriptors.registry.ts"
        f.write_text("// no descriptor entries yet\nexport const cardDescriptors = []\n")
        assert vm.parse_card_descriptors(str(f)) == set()


class TestParseCardRegistryComponentsFallback:
    """Cover the `components:` fallback in parse_card_registry."""

    def test_sub_file_uses_components_colon_anchor(self, tmp_path):
        # Main registry file has an Object.assign block (parsed inline).
        # Sub-category file uses the inline `components: {` pattern rather
        # than `const components = {`, exercising the fallback branch.
        main = tmp_path / "cardRegistry.ts"
        main.write_text(
            "const RAW_CARD_COMPONENTS = Object.assign({\n"
            "  main_card: LazyMain,\n"
            "}, {})\n"
        )
        sub = tmp_path / "cardRegistry.cluster.ts"
        sub.write_text(
            "export const clusterCategory: CardRegistryCategory = {\n"
            "  domain: 'cluster',\n"
            "  components: {\n"
            "    cluster_health: LazyClusterHealth,\n"
            "    node_status: LazyNodeStatus,\n"
            "  },\n"
            "}\n"
        )

        result = vm.parse_card_registry(str(main))
        assert "main_card" in result
        assert "cluster_health" in result
        assert "node_status" in result

    def test_sub_file_prefers_const_components_when_both_present(self, tmp_path):
        # A file that has both `const components` and stray `components:`
        # text should parse the `const components` block first.
        main = tmp_path / "cardRegistry.ts"
        main.write_text("const RAW_CARD_COMPONENTS = Object.assign({}, {})\n")
        sub = tmp_path / "cardRegistry.security.ts"
        sub.write_text(
            "// Interface docstring mentions components: something\n"
            "interface CardRegistryDomain { components: Record<string, unknown> }\n"
            "const components: Record<string, LazyExoticComponent> = {\n"
            "  audit_events: LazyAuditEvents,\n"
            "  policy_violations: LazyPolicyViolations,\n"
            "}\n"
        )

        result = vm.parse_card_registry(str(main))
        assert "audit_events" in result
        assert "policy_violations" in result

    def test_skips_cardregistry_types_ts(self, tmp_path):
        # cardRegistry.types.ts is explicitly skipped by the loop.
        main = tmp_path / "cardRegistry.ts"
        main.write_text("const _ = Object.assign({}, {})\n")
        types = tmp_path / "cardRegistry.types.ts"
        types.write_text(
            "const components = {\n"
            "  should_be_ignored: 'x',\n"
            "}\n"
        )
        result = vm.parse_card_registry(str(main))
        assert "should_be_ignored" not in result

    def test_extracts_unified_only_types_list(self, tmp_path):
        # _UNIFIED_ONLY_TYPES is a top-level array of card types migrated
        # exclusively to the descriptor registry; must be merged in.
        main = tmp_path / "cardRegistry.ts"
        main.write_text(
            "const RAW_CARD_COMPONENTS = Object.assign({}, {})\n"
            "const _UNIFIED_ONLY_TYPES = [\n"
            "  'unified_a',\n"
            "  \"unified_b\",\n"
            "  'unified-c',\n"
            "]\n"
        )
        result = vm.parse_card_registry(str(main))
        assert {"unified_a", "unified_b", "unified-c"} <= result


class TestGetAllConsoleCardTypes:
    """Verify all three registration sources are merged."""

    def test_merges_three_sources(self, tmp_path):
        # 1. cardRegistry.ts legacy Object.assign
        (tmp_path / "cardRegistry.ts").write_text(
            "const RAW_CARD_COMPONENTS = Object.assign({\n"
            "  legacy_card: X,\n"
            "}, {})\n"
        )
        # 2. cardDescriptors.registry.ts descriptor list
        (tmp_path / "cardDescriptors.registry.ts").write_text(
            "const d = [\n"
            "  {\n"
            "    id: 'descriptor_card',\n"
            "  },\n"
            "]\n"
        )
        # 3. cardRegistry.<cat>.ts sub-registry
        (tmp_path / "cardRegistry.cluster.ts").write_text(
            "const cat = {\n"
            "  components: {\n"
            "    sub_registry_card: Y,\n"
            "  },\n"
            "}\n"
        )

        result = vm.get_all_console_card_types(str(tmp_path))
        assert {"legacy_card", "descriptor_card", "sub_registry_card"} <= result

    def test_handles_missing_registry_files_gracefully(self, tmp_path):
        # Only a sub-registry file — no main registry, no descriptors.
        (tmp_path / "cardRegistry.cluster.ts").write_text(
            "const cat = {\n"
            "  components: {\n"
            "    only_sub: Z,\n"
            "  },\n"
            "}\n"
        )
        result = vm.get_all_console_card_types(str(tmp_path))
        assert result == {"only_sub"}

    def test_returns_empty_set_when_no_registries_present(self, tmp_path):
        # Completely empty directory — none of the three sources apply.
        result = vm.get_all_console_card_types(str(tmp_path))
        assert result == set()


class TestParseSubRegistryCategories:
    """Cover the sub-registry parser's boundary conditions."""

    def test_returns_empty_when_no_sub_files(self, tmp_path):
        (tmp_path / "cardRegistry.ts").write_text("const x = 1\n")
        assert vm.parse_sub_registry_categories(str(tmp_path)) == set()

    def test_skips_sub_file_without_components_anchor(self, tmp_path):
        # File missing the `components: {` marker -> continue.
        (tmp_path / "cardRegistry.observability.ts").write_text(
            "// TODO: fill in card components\nexport const observabilityCategory = { domain: 'obs' }\n"
        )
        assert vm.parse_sub_registry_categories(str(tmp_path)) == set()

    def test_excludes_camelcase_component_values(self, tmp_path):
        # Values (LazyThing) are CamelCase and must not be picked up as
        # card types — only snake_case keys are.
        (tmp_path / "cardRegistry.workloads.ts").write_text(
            "const cat = {\n"
            "  components: {\n"
            "    workload_summary: LazyWorkloadSummary,\n"
            "    pod_issues: LazyPodIssues,\n"
            "  },\n"
            "}\n"
        )
        result = vm.parse_sub_registry_categories(str(tmp_path))
        assert result == {"workload_summary", "pod_issues"}
        # None of the CamelCase values should sneak in.
        assert "LazyWorkloadSummary" not in result


class TestParseCardRegistry:
    def test_extracts_inline_and_unified_types(self, tmp_path):
        registry = tmp_path / "cardRegistry.ts"
        registry.write_text(textwrap.dedent("""
            const _UNIFIED_ONLY_TYPES = ['unified_only_card', 'another_unified'];

            export const RAW_CARD_COMPONENTS = Object.assign({
                cluster_health: ClusterHealth,
                pod_status: PodStatus,
            }, extraCards);
        """))
        types = _mod.parse_card_registry(str(registry))
        assert "cluster_health" in types
        assert "pod_status" in types
        assert "unified_only_card" in types
        assert "another_unified" in types

    def test_reads_sub_registry_components_block(self, tmp_path):
        (tmp_path / "cardRegistry.ts").write_text("Object.assign({});")
        (tmp_path / "cardRegistry.security.ts").write_text(textwrap.dedent("""
            export const category: CardRegistryCategory = {
                const components: Record<string, LazyExoticComponent<any>> = {
                    vulnerability_report: VulnReport,
                    audit_log: AuditLog,
                };
            };
        """))
        # cardRegistry.types.ts must be skipped
        (tmp_path / "cardRegistry.types.ts").write_text("interface X { should_not_appear: true }")
        types = _mod.parse_card_registry(str(tmp_path / "cardRegistry.ts"))
        assert "vulnerability_report" in types
        assert "audit_log" in types
        assert "should_not_appear" not in types


class TestParseCardTypeToComponent:
    def test_maps_card_type_to_component(self, tmp_path):
        registry = tmp_path / "cardRegistry.ts"
        registry.write_text(textwrap.dedent("""
            export const RAW_CARD_COMPONENTS = {
                cluster_health: ClusterHealth,
                // pod_status is commented out
                node_status: NodeStatus,
            }
        """))
        mapping = _mod.parse_card_type_to_component(str(registry))
        assert mapping.get("cluster_health") == "ClusterHealth"
        assert mapping.get("node_status") == "NodeStatus"
        # comment stripping: entries starting with // must be skipped
        assert "pod_status" not in mapping

    def test_empty_when_no_block(self, tmp_path):
        registry = tmp_path / "cardRegistry.ts"
        registry.write_text("// nothing to see\nexport const X = 1;\n")
        assert _mod.parse_card_type_to_component(str(registry)) == {}


class TestParseLazyImports:
    def test_direct_lazy_imports(self, tmp_path):
        registry = tmp_path / "cardRegistry.ts"
        registry.write_text(textwrap.dedent("""
            const ClusterHealth = lazy(() => import('./ClusterHealthCard'));
            const PodStatus = lazy(() => import('./pod/PodStatusCard'));
        """))
        imports = _mod.parse_lazy_imports(str(registry))
        assert imports["ClusterHealth"] == "ClusterHealthCard"
        assert imports["PodStatus"] == "pod/PodStatusCard"

    def test_bundle_indirection_current_behavior(self, tmp_path):
        # Documents current parse_lazy_imports behavior for bundle-style
        # lazy() calls. The function strips a "Bundle" suffix from the
        # captured bundle variable name before looking it up, so the
        # bundle *declaration* variable must NOT itself end in "Bundle"
        # for the mapping to resolve.
        #
        # Working shape: `const _deploy = import('./deploy-bundle')`
        # combined with `lazy(() => _deployBundle.then(...))` would
        # match; without a matching key the component is silently
        # omitted from the returned mapping.
        registry = tmp_path / "cardRegistry.ts"
        registry.write_text(textwrap.dedent("""
            const _deploy = import('./deploy-bundle');
            const DeployCard = lazy(() => _deployBundle.then(m => m.DeployCard));
        """))
        imports = _mod.parse_lazy_imports(str(registry))
        # "deploy" is in bundles, bundle_key strips "Bundle" from
        # "deployBundle" -> "deploy" -> resolves.
        assert imports.get("DeployCard") == "deploy-bundle"

    def test_empty_registry(self, tmp_path):
        registry = tmp_path / "cardRegistry.ts"
        registry.write_text("// no lazy imports here\n")
        assert _mod.parse_lazy_imports(str(registry)) == {}


class TestParseSubRegistryCategoriesExtra:
    def test_extracts_snake_case_keys(self, tmp_path):
        # cardRegistry.ts must be skipped by this function
        (tmp_path / "cardRegistry.ts").write_text(
            "components: {\n  root_card: RootCard,\n}"
        )
        (tmp_path / "cardRegistry.workloads.ts").write_text(textwrap.dedent("""
            export const workloads = {
                components: {
                    pod_status: PodStatus,
                    deployment_health: safeLazy(() => import('./x')),
                    ClusterHealth: ClusterHealth,  // CamelCase — must be ignored
                },
            };
        """))
        types = _mod.parse_sub_registry_categories(str(tmp_path))
        assert "pod_status" in types
        assert "deployment_health" in types
        # CamelCase identifier without underscore must not be picked up
        assert "ClusterHealth" not in types
        # root registry file must be skipped
        assert "root_card" not in types

    def test_missing_components_block_yields_empty(self, tmp_path):
        (tmp_path / "cardRegistry.misc.ts").write_text("export const misc = {};")
        assert _mod.parse_sub_registry_categories(str(tmp_path)) == set()


class TestParseCardRegistrySkipsTypesFile(unittest.TestCase):
    """``parse_card_registry`` must ignore ``cardRegistry.types.ts``.

    That file declares TypeScript interfaces/types and does *not* register
    card components; scanning it would surface interface field names as
    bogus card types.
    """

    def _write_registry(self, tmpdir, files):
        for name, content in files.items():
            with open(os.path.join(tmpdir, name), "w") as f:
                f.write(content)
        return os.path.join(tmpdir, "cardRegistry.ts")

    def test_types_file_is_skipped(self):
        import tempfile
        root = textwrap.dedent("""\
            export const RAW_CARD_COMPONENTS = Object.assign({
              real_card: ClusterHealth,
            });
        """)
        # cardRegistry.types.ts uses `components:` inside an interface — the
        # keys must not be picked up as card types.
        types_file = textwrap.dedent("""\
            export interface CardRegistryDomain {
              components: {
                bogus_type_should_not_be_picked_up: unknown;
              };
            }
        """)
        with tempfile.TemporaryDirectory() as d:
            reg = self._write_registry(d, {
                "cardRegistry.ts": root,
                "cardRegistry.types.ts": types_file,
            })
            types = parse_card_registry(reg)
            self.assertIn("real_card", types)
            self.assertNotIn("bogus_type_should_not_be_picked_up", types)


class TestParseSubRegistryCategoriesNoComponentsBlock(unittest.TestCase):
    """A ``cardRegistry.*.ts`` file without ``components: {`` yields no keys."""

    def test_no_components_block_returns_empty(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "cardRegistry.oddball.ts"), "w") as f:
                f.write("export const Something = { unrelated: true };\n")
            types = parse_sub_registry_categories(d)
            self.assertEqual(types, set())

    def test_unreadable_file_is_skipped(self):
        """OSError on read must not crash the caller (except OSError: continue)."""
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "cardRegistry.badperm.ts")
            with open(path, "w") as f:
                f.write("components: { should_be_ignored: X };\n")
            os.chmod(path, 0o000)
            try:
                types = parse_sub_registry_categories(d)
            finally:
                os.chmod(path, 0o644)
            # Either the file was successfully read (root) or skipped —
            # in both cases the call must return without raising.
            self.assertIsInstance(types, set)

    def test_unreadable_file_is_reported_when_results_given(self):
        """An OSError is surfaced as a warning instead of silently dropped.

        Without visibility, every card type the unreadable sub-registry
        defines would spuriously fail the "not found in console registry"
        check with no trace of the real cause.
        """
        import builtins
        import tempfile
        from unittest import mock

        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "cardRegistry.badperm.ts")
            with open(path, "w") as f:
                f.write("components: { should_be_ignored: X };\n")

            real_open = builtins.open

            def fake_open(p, *a, **kw):
                if str(p) == path:
                    raise OSError("boom")
                return real_open(p, *a, **kw)

            results = Results()
            with mock.patch("builtins.open", side_effect=fake_open):
                types = parse_sub_registry_categories(d, results=results)

            self.assertEqual(types, set())
            self.assertTrue(any(cat == "card-type" for cat, _ in results.warnings))


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
            result = _mod_gaps.parse_sub_registry_categories(str(cards_dir))
            self.assertIn("obs_summary", result)
            self.assertNotIn(
                "root_only", result,
                msg="root cardRegistry.ts must be skipped by line 224",
            )


class ParseSubRegistrySkipsRootTest(unittest.TestCase):
    """Cover the root-file skip at line 224."""

    def test_root_cardRegistry_ts_is_skipped_by_basename(self):
        mod = _load_mod()

        # The root cardRegistry.ts must be skipped: it holds a
        # RAW_CARD_COMPONENTS table with a different shape and is parsed
        # elsewhere. Only sibling cardRegistry.<category>.ts files should
        # contribute card types here.
        root = "/tmp/mp-fixture/cardRegistry.ts"
        cat = "/tmp/mp-fixture/cardRegistry.cluster.ts"
        cat_content = (
            "export const cat = { components: { "
            "cluster_health: safeLazy(() => import('./x')), "
            "node_status: safeLazy(() => import('./y')) } }"
        )
        # The root file is deliberately unparseable garbage: if the skip
        # ever regresses, parsing it will either raise or contribute
        # unwanted (or wrong-shape) card types, and this test fails.
        root_content = "!!! this is not a valid TS module !!!"

        def fake_open(path, *args, **kwargs):
            if path == root:
                return io.StringIO(root_content)
            if path == cat:
                return io.StringIO(cat_content)
            raise FileNotFoundError(path)

        with mock.patch.object(mod.glob, "glob", return_value=[root, cat]):
            with mock.patch("builtins.open", side_effect=fake_open):
                result = mod.parse_sub_registry_categories("/does-not-matter")

        # Only category-file card types appear — the root file was skipped
        # BEFORE open() was called on it, so its garbage content never
        # entered the parser.
        self.assertEqual(result, {"cluster_health", "node_status"})


class TestOrphanRawComponentBranches(unittest.TestCase):
    """RAW_CARD_COMPONENTS names a component with no ``lazy()`` import.

    Exercises the ``if not import_path: continue`` branch in
    ``check_demo_data`` / ``check_is_demo_data_wiring`` /
    ``check_consecutive_failures``.
    """

    def _run_all_three(self, console, known):
        for fn in (_mod_more.check_demo_data,
                   _mod_more.check_is_demo_data_wiring,
                   _mod_more.check_consecutive_failures):
            r = Results_more()
            fn("base-ignored", str(console), known, r)
            # The orphan should be silently skipped: no ok/warn/error mentioning it.
            for bucket in (r.passes, r.warnings, r.errors):
                for _, msg in bucket:
                    self.assertNotIn("orphan_card", msg,
                                     f"{fn.__name__} unexpectedly reported orphan_card: {msg}")

    def test_orphan_without_lazy_import_is_skipped(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            import pathlib
            tp = pathlib.Path(td)
            console = _make_console_with_orphan_mapping(tp,
                                                        orphan_missing_dir=False,
                                                        valid_ct=None)
            self._run_all_three(console, {"orphan_card"})

    def test_orphan_with_lazy_but_missing_directory_is_skipped(self):
        """RAW_CARD_COMPONENTS + lazy() point at ``./OrphanDir`` but that
        directory does not exist on disk.  The wiring/consecutive checks must
        take the ``if not os.path.isdir(comp_dir): continue`` fallthrough.
        """
        import tempfile
        import pathlib
        with tempfile.TemporaryDirectory() as td:
            tp = pathlib.Path(td)
            console = _make_console_with_orphan_mapping(tp,
                                                        orphan_missing_dir=True)
            # Only wiring + consecutive have the isdir guard on comp_dir.
            for fn in (_mod_more.check_is_demo_data_wiring,
                       _mod_more.check_consecutive_failures):
                r = Results_more()
                fn("base-ignored", str(console), {"orphan_card"}, r)
                for bucket in (r.passes, r.warnings, r.errors):
                    for _, msg in bucket:
                        self.assertNotIn("orphan_card", msg)


def test_parse_lazy_imports_skips_unknown_bundle(tmp_path):
    registry_ts = tmp_path / "cardRegistry.ts"
    registry_ts.write_text(
        # Real bundle import + lazy that references it (mapped).
        "const _deploy = import('./deploy-bundle')\n"
        "const KnownCard = lazy(() => _deployBundle.then(m => m.KnownCard))\n"
        # Lazy that references a bundle var never declared — unknown key.
        "const OrphanCard = lazy(() => _ghostBundle.then(m => m.OrphanCard))\n"
    )
    imports = _mod_partials.parse_lazy_imports(str(registry_ts))
    assert imports == {"KnownCard": "deploy-bundle"}
    assert "OrphanCard" not in imports


class TestNamingConventions:
    def test_hyphen_in_card_type_flagged(self, tmp_path):
        _write(
            tmp_path / "presets" / "bad.json",
            {"format": "kc-card-preset-v1", "card_type": "cpu-usage", "title": "T"},
        )
        r = Results_reg()
        _mod_reg.check_naming_conventions(str(tmp_path), r)
        assert any("cpu_usage" in m for m in _messages(r.errors))

    def test_snake_case_ok(self, tmp_path):
        _write(
            tmp_path / "presets" / "ok.json",
            {"format": "kc-card-preset-v1", "card_type": "cpu_usage", "title": "T"},
        )
        r = Results_reg()
        _mod_reg.check_naming_conventions(str(tmp_path), r)
        assert not r.errors

    def test_dashboard_cards_checked(self, tmp_path):
        _write(
            tmp_path / "dashboards" / "d" / "dashboard.json",
            {
                "format": "kc-dashboard-v1",
                "name": "D",
                "cards": [{"card_type": "bad-name", "position": {"x": 0, "y": 0, "w": 1, "h": 1}}],
            },
        )
        r = Results_reg()
        _mod_reg.check_naming_conventions(str(tmp_path), r)
        assert any("bad_name" in m for m in _messages(r.errors))


class TestRegistryEntries:
    def test_combines_items_and_presets(self):
        data = {"items": [{"id": "a"}], "presets": [{"id": "b"}]}
        entries = _mod_reg.get_registry_entries(data)
        assert [e["id"] for e in entries] == ["a", "b"]

    def test_empty(self):
        assert _mod_reg.get_registry_entries({}) == []


class TestRegistryConsistency:
    def test_missing_registry_file(self, tmp_path):
        r = Results_reg()
        _mod_reg.check_registry_consistency(str(tmp_path), r)
        assert any("registry.json" in m for m in _messages(r.errors))

    def test_dashboard_missing_file(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {"items": [{"id": "missing-dash", "type": "dashboard"}]},
        )
        r = Results_reg()
        _mod_reg.check_registry_consistency(str(tmp_path), r)
        assert any("dashboards/missing-dash" in m for m in _messages(r.errors))

    def test_dashboard_present(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {"items": [{"id": "overview", "type": "dashboard"}]},
        )
        _write(tmp_path / "dashboards" / "overview" / "dashboard.json", {})
        r = Results_reg()
        _mod_reg.check_registry_consistency(str(tmp_path), r)
        assert not r.errors

    def test_card_preset_present_in_either_dir(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {"id": "one", "type": "card-preset"},
                    {"id": "two", "type": "card-preset"},
                ]
            },
        )
        _write(tmp_path / "presets" / "one.json", {})
        _write(tmp_path / "card-presets" / "two.json", {})
        r = Results_reg()
        _mod_reg.check_registry_consistency(str(tmp_path), r)
        assert not r.errors

    def test_card_preset_missing_in_both_dirs(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {"items": [{"id": "ghost", "type": "card-preset"}]},
        )
        r = Results_reg()
        _mod_reg.check_registry_consistency(str(tmp_path), r)
        assert any("presets/ or card-presets/" in m for m in _messages(r.errors))

    def test_theme_missing_file(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {"items": [{"id": "dark", "type": "theme"}]},
        )
        r = Results_reg()
        _mod_reg.check_registry_consistency(str(tmp_path), r)
        assert any("themes/dark.json" in m for m in _messages(r.errors))

    def test_duplicate_id(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {"id": "dup", "type": "theme"},
                    {"id": "dup", "type": "theme"},
                ]
            },
        )
        _write(tmp_path / "themes" / "dup.json", {})
        r = Results_reg()
        _mod_reg.check_registry_consistency(str(tmp_path), r)
        assert any("Duplicate id" in m for m in _messages(r.errors))

    def test_download_url_path_missing(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "dark",
                        "type": "theme",
                        "downloadUrl": "https://raw.githubusercontent.com/o/r/main/themes/ghost.json",
                    }
                ]
            },
        )
        _write(tmp_path / "themes" / "dark.json", {})
        r = Results_reg()
        _mod_reg.check_registry_consistency(str(tmp_path), r)
        assert any("downloadUrl" in m and "themes/ghost.json" in m for m in _messages(r.errors))

    def test_download_url_path_present(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "dark",
                        "type": "theme",
                        "downloadUrl": "https://raw.githubusercontent.com/o/r/main/themes/dark.json",
                    }
                ]
            },
        )
        _write(tmp_path / "themes" / "dark.json", {})
        (tmp_path / "themes" / "dark.json").write_text("{}")
        # File already written above by _write; ensure it exists.
        r = Results_reg()
        _mod_reg.check_registry_consistency(str(tmp_path), r)
        assert not r.errors
        assert "registry" in _categories(r.passes)

    def test_summary_ok_message(self, tmp_path):
        _write(tmp_path / "registry.json", {"items": [], "presets": []})
        r = Results_reg()
        _mod_reg.check_registry_consistency(str(tmp_path), r)
        assert any("Checked 0 registry entries" in m for m in _messages(r.passes))


class TestRegistryStaleness:
    def test_missing_registry(self, tmp_path):
        r = Results_reg()
        _mod_reg.check_registry_staleness(str(tmp_path), r)
        # Silently returns — check_registry_consistency owns the error
        assert not r.errors
        assert not r.warnings

    def test_missing_updated_at(self, tmp_path):
        _write(tmp_path / "registry.json", {})
        r = Results_reg()
        _mod_reg.check_registry_staleness(str(tmp_path), r)
        assert any("missing 'updatedAt'" in m for m in _messages(r.warnings))

    def test_invalid_updated_at(self, tmp_path):
        _write(tmp_path / "registry.json", {"updatedAt": "not-a-date"})
        r = Results_reg()
        _mod_reg.check_registry_staleness(str(tmp_path), r)
        assert any("not valid ISO" in m for m in _messages(r.warnings))

    def test_fresh(self, tmp_path):
        fresh = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat().replace("+00:00", "Z")
        _write(tmp_path / "registry.json", {"updatedAt": fresh})
        r = Results_reg()
        _mod_reg.check_registry_staleness(str(tmp_path), r)
        assert "staleness" in _categories(r.passes)

    def test_stale(self, tmp_path):
        stale = (datetime.now(timezone.utc) - timedelta(days=45)).isoformat().replace("+00:00", "Z")
        _write(tmp_path / "registry.json", {"updatedAt": stale})
        r = Results_reg()
        _mod_reg.check_registry_staleness(str(tmp_path), r)
        assert any("days old" in m for m in _messages(r.warnings))


class TestRegistryConsistencyBranchGuards:
    def test_unknown_item_type_falls_through_to_download_url_check(self, tmp_path):
        # Guards branch 535->543: item_type is neither "dashboard",
        # "card-preset", nor "theme". The type-specific file check
        # must be skipped without error, and the downloadUrl check
        # below must still run — verified here by supplying an
        # unknown-type entry with a downloadUrl that DOES contain a
        # /main/<path> so we can assert the mismatch is reported.
        _write_consistency(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "mystery",
                        "type": "wobble",
                        "downloadUrl": (
                            "https://raw.githubusercontent.com/example/repo/"
                            "main/wobbles/mystery.json"
                        ),
                    }
                ]
            },
        )
        r = Results_consistency()
        _mod_consistency.check_registry_consistency(str(tmp_path), r)
        # No type-specific file error (unknown type is silent by design):
        # the only error may come from the downloadUrl fallthrough below.
        type_errs = [
            m for m in _messages_consistency(r.errors)
            if "downloadUrl" not in m
        ]
        assert not type_errs, type_errs
        # The downloadUrl fallthrough executed and reported the missing file.
        download_errs = [
            m for m in _messages_consistency(r.errors)
            if "downloadUrl" in m and "mystery" in m
        ]
        assert download_errs, (
            "expected downloadUrl cross-check to still run for an "
            f"unknown item_type; errors={_messages_consistency(r.errors)}"
        )

    def test_download_url_without_main_segment_is_silently_skipped(self, tmp_path):
        # Guards branch 547->509: downloadUrl is present but does
        # NOT contain a ``/main/`` segment, so re.search returns
        # None and we fall through to the next loop iteration. No
        # error must be raised (there's nothing to cross-check
        # against a local file when the URL doesn't follow the
        # /main/<path> convention).
        _write_consistency(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "external-dashboard",
                        "type": "dashboard",
                        # No /main/ segment — e.g. a CDN-hosted URL.
                        "downloadUrl": "https://example.com/downloads/foo.json",
                    }
                ]
            },
        )
        _write_consistency(
            tmp_path / "dashboards" / "external-dashboard" / "dashboard.json",
            {},
        )
        r = Results_consistency()
        _mod_consistency.check_registry_consistency(str(tmp_path), r)
        # No downloadUrl error must be produced — the /main/ regex
        # missed, so the cross-check is skipped, not failed.
        download_errs = [
            m for m in _messages_consistency(r.errors) if "downloadUrl" in m
        ]
        assert not download_errs, (
            "expected downloadUrl without /main/ segment to be "
            f"silently skipped; got errors={download_errs}"
        )

    def test_sha_pinned_download_url_missing_file_is_reported(self, tmp_path):
        # Regression guard for issue #870: registry.json pins every
        # downloadUrl to a 40-hex commit SHA (not /main/), which the old
        # r"/main/(.+)$" regex never matched — silently skipping the
        # "downloadUrl path exists on disk" cross-check for ALL entries.
        sha = "56de485a64b85316429ad5d82db018a12c1df2fd"
        _write_consistency(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "ghost-dash",
                        "type": "dashboard",
                        "downloadUrl": (
                            "https://raw.githubusercontent.com/kubestellar/"
                            f"console-marketplace/{sha}/dashboards/ghost-dash/"
                            "dashboard.json"
                        ),
                    }
                ]
            },
        )
        r = Results_consistency()
        _mod_consistency.check_registry_consistency(str(tmp_path), r)
        download_errs = [
            m for m in _messages_consistency(r.errors)
            if "downloadUrl" in m and "ghost-dash" in m
        ]
        assert download_errs, (
            "expected SHA-pinned downloadUrl with missing local file to be "
            f"reported; errors={_messages_consistency(r.errors)}"
        )

    def test_sha_pinned_download_url_with_existing_file_passes(self, tmp_path):
        # Complement of the missing-file guard: a SHA-pinned URL whose
        # path exists on disk must not raise a downloadUrl error.
        sha = "56de485a64b85316429ad5d82db018a12c1df2fd"
        _write_consistency(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "real-dash",
                        "type": "dashboard",
                        "downloadUrl": (
                            "https://raw.githubusercontent.com/kubestellar/"
                            f"console-marketplace/{sha}/dashboards/real-dash/"
                            "dashboard.json"
                        ),
                    }
                ]
            },
        )
        _write_consistency(tmp_path / "dashboards" / "real-dash" / "dashboard.json", {})
        r = Results_consistency()
        _mod_consistency.check_registry_consistency(str(tmp_path), r)
        download_errs = [
            m for m in _messages_consistency(r.errors) if "downloadUrl" in m
        ]
        assert not download_errs, (
            "expected SHA-pinned downloadUrl with existing local file to "
            f"pass; got errors={download_errs}"
        )

    def test_non_sha_non_main_ref_is_silently_skipped(self, tmp_path):
        # A raw.githubusercontent.com URL with a branch ref that is
        # neither `main` nor a 40-hex SHA has no trusted path mapping —
        # the cross-check must skip it, matching the pre-existing
        # silent-skip contract for unparseable URLs.
        _write_consistency(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "branch-dash",
                        "type": "dashboard",
                        "downloadUrl": (
                            "https://raw.githubusercontent.com/kubestellar/"
                            "console-marketplace/feature-branch/dashboards/"
                            "branch-dash/dashboard.json"
                        ),
                    }
                ]
            },
        )
        _write_consistency(tmp_path / "dashboards" / "branch-dash" / "dashboard.json", {})
        r = Results_consistency()
        _mod_consistency.check_registry_consistency(str(tmp_path), r)
        download_errs = [
            m for m in _messages_consistency(r.errors) if "downloadUrl" in m
        ]
        assert not download_errs, (
            "expected non-main/non-SHA ref to be silently skipped; "
            f"got errors={download_errs}"
        )


class TestRegistryIdPathTraversalGuard:
    def test_traversal_id_is_rejected(self, tmp_path):
        _write_traversal(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "../../../../etc/passwd",
                        "type": "dashboard",
                    }
                ]
            },
        )
        r = Results_traversal()
        _mod_traversal.check_registry_consistency(str(tmp_path), r)
        errs = _messages_traversal(r.errors)
        assert any("characters other than letters, digits" in m for m in errs), (
            f"expected a path-traversal rejection; got errors={errs}"
        )
        # The unsafe id must short-circuit before any path-based existence
        # check runs for it.
        assert not any("has no file at" in m for m in errs), (
            f"path-based check must not run for an unsafe id; got errors={errs}"
        )

    def test_absolute_path_id_is_rejected(self, tmp_path):
        _write_traversal(
            tmp_path / "registry.json",
            {"items": [{"id": "/etc/passwd", "type": "theme"}]},
        )
        r = Results_traversal()
        _mod_traversal.check_registry_consistency(str(tmp_path), r)
        errs = _messages_traversal(r.errors)
        assert any("characters other than letters, digits" in m for m in errs), (
            f"expected a path-traversal rejection; got errors={errs}"
        )

    def test_normal_ids_are_unaffected(self, tmp_path):
        _write_traversal(
            tmp_path / "registry.json",
            {"items": [{"id": "cpu-usage_v2", "type": "dashboard"}]},
        )
        _write_traversal(tmp_path / "dashboards" / "cpu-usage_v2" / "dashboard.json", {})
        r = Results_traversal()
        _mod_traversal.check_registry_consistency(str(tmp_path), r)
        errs = _messages_traversal(r.errors)
        assert not errs, f"expected a normal id to pass cleanly; got errors={errs}"


if __name__ == "__main__":
    unittest.main()
