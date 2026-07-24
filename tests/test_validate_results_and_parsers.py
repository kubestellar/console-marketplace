"""Unit tests for previously-untested pure functions in validate-marketplace.py.

Targets:
    - Results class (result tracking / summary formatting / to_json / exit codes)
    - parse_card_registry
    - parse_card_type_to_component
    - parse_lazy_imports
    - parse_sub_registry_categories

Each parser test writes minimal TypeScript-ish fixture content to a tmp file
so the tests are hermetic (no dependency on console/ layout).
"""
import importlib.util
import os
import textwrap

import pytest


def _load_validate_marketplace():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate-marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_mod = _load_validate_marketplace()


# ── Results class ────────────────────────────────────────────────────────────


class TestResults:
    def test_empty_results_exit_code_zero(self):
        r = _mod.Results()
        assert r.exit_code == 0
        assert r.errors == [] and r.warnings == [] and r.info == [] and r.passes == []

    def test_errors_produce_exit_code_1(self):
        r = _mod.Results()
        r.error("cat", "boom")
        assert r.exit_code == 1

    def test_warnings_produce_exit_code_2(self):
        r = _mod.Results()
        r.warn("cat", "meh")
        assert r.exit_code == 2

    def test_errors_dominate_warnings(self):
        r = _mod.Results()
        r.warn("cat", "meh")
        r.error("cat", "boom")
        assert r.exit_code == 1

    def test_passes_do_not_change_exit_code(self):
        r = _mod.Results()
        r.ok("cat", "yay")
        r.note("cat", "fyi")
        assert r.exit_code == 0

    def test_summary_md_lists_all_sections(self):
        r = _mod.Results()
        r.error("json", "bad file")
        r.warn("naming", "camelCase")
        r.note("info", "context")
        r.ok("schema", "valid")
        md = r.summary_md()
        assert "1 error(s)" in md
        assert "1 warning(s)" in md
        assert "1 passed" in md
        assert "[json]" in md and "bad file" in md
        assert "[naming]" in md and "camelCase" in md
        assert "[info]" in md and "context" in md
        # Passes are counted in the header but not itemised — check header only
        assert "#### Errors" in md
        assert "#### Warnings" in md
        assert "#### Info" in md

    def test_summary_md_omits_empty_sections(self):
        r = _mod.Results()
        r.ok("schema", "valid")
        md = r.summary_md()
        assert "#### Errors" not in md
        assert "#### Warnings" not in md
        assert "#### Info" not in md
        assert "0 error(s)" in md

    def test_print_summary(self, capsys):
        r = _mod.Results()
        r.error("json", "bad")
        r.warn("naming", "meh")
        r.note("info", "ctx")
        r.ok("schema", "valid")
        r.print_summary()
        out = capsys.readouterr().out
        assert "ERROR [json] bad" in out
        assert "WARN  [naming] meh" in out
        assert "INFO  [info] ctx" in out
        assert "OK    [schema] valid" in out
        assert "1 error(s), 1 warning(s), 1 passed" in out

    def test_to_json_shape(self):
        r = _mod.Results()
        r.error("e", "err msg")
        r.warn("w", "warn msg")
        r.note("i", "info msg")
        r.ok("p", "pass msg")
        payload = r.to_json()
        assert payload["errors"] == [{"category": "e", "message": "err msg"}]
        assert payload["warnings"] == [{"category": "w", "message": "warn msg"}]
        assert payload["info"] == [{"category": "i", "message": "info msg"}]
        assert payload["passes"] == [{"category": "p", "message": "pass msg"}]
        assert payload["exit_code"] == 1


# ── Parsers ──────────────────────────────────────────────────────────────────


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


class TestParseSubRegistryCategories:
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


# ── JSON loader edge cases ───────────────────────────────────────────────────


class TestLoadJsonExtra:
    def test_missing_file_returns_error_message(self, tmp_path):
        data, err = _mod.load_json(str(tmp_path / "nope.json"))
        assert data is None
        assert err is not None and "not found" in err.lower()

    def test_invalid_json_returns_error(self, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("{not-json,,,")
        data, err = _mod.load_json(str(p))
        assert data is None
        assert err is not None and "Invalid JSON" in err
