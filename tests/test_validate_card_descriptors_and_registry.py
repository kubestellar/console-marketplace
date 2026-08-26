"""Unit tests for validate-marketplace.py card-descriptor / registry parsing.

Focus areas (previously uncovered):
  - parse_card_descriptors: reads CardDescriptor[] entries from
    cardDescriptors.registry.ts (id: '<type>').
  - parse_card_registry fallback to `components:` anchor when
    `const components` is not present.
  - get_all_console_card_types merge across the three registration
    mechanisms (legacy Object.assign, descriptor registry, sub-registry
    category files).
"""

import importlib.util
import os
import tempfile

# Import the validate script as a module (dashes in filename prevent normal import).
_script = os.path.join(os.path.dirname(__file__), "..", "scripts", "validate-marketplace.py")
spec = importlib.util.spec_from_file_location("validate_marketplace", _script)
vm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vm)


# --- parse_card_descriptors -------------------------------------------------


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


# --- parse_card_registry components-anchor fallback -------------------------


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


# --- get_all_console_card_types merge --------------------------------------


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


# --- parse_sub_registry_categories edge cases ------------------------------


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
