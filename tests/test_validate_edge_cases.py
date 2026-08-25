"""Additional edge-case tests for scripts/validate-marketplace.py.

Targets branches previously uncovered by tests/:

- ``_classify_ip_literal`` multicast branch (224.0.0.0/4).
- ``_is_safe_download_url`` malformed ``172.<non-numeric>.x.x`` fallthrough
  (the ``except ValueError: pass`` path).
- ``parse_card_registry`` skip of ``cardRegistry.types.ts`` (the file that
  only declares TypeScript types and must not be scanned for card keys).
- ``parse_sub_registry_categories`` skip when a ``cardRegistry.*.ts`` file
  has no ``components: {`` block (defensive path).
- ``check_dashboard_schema`` skips a malformed dashboard.json (JSON syntax
  error) without crashing.
"""
import importlib.util
import json
import os
import textwrap
import unittest


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
_is_safe = _mod._is_safe_download_url
_classify = _mod._classify_ip_literal
parse_card_registry = _mod.parse_card_registry
parse_sub_registry_categories = _mod.parse_sub_registry_categories
check_dashboard_schema = _mod.check_dashboard_schema
Results = _mod.Results


class TestClassifyIpLiteralMulticast(unittest.TestCase):
    """The ``is_multicast`` branch in ``_classify_ip_literal``."""

    def test_ipv4_multicast_classified_as_multicast(self):
        ok, reason = _classify("224.0.0.1")
        self.assertFalse(ok)
        self.assertIn("multicast", reason)

    def test_ipv4_high_multicast_classified_as_multicast(self):
        ok, reason = _classify("239.255.255.250")  # SSDP
        self.assertFalse(ok)
        self.assertIn("multicast", reason)

    def test_multicast_rejected_via_public_entry_point(self):
        # End-to-end via the public function.
        ok, reason = _is_safe("https://224.0.0.1/file")
        self.assertFalse(ok)
        self.assertIn("multicast", reason)


class TestIsSafeDownloadUrlMalformed172(unittest.TestCase):
    """Malformed ``172.<non-numeric>.x.x`` triggers the ``except ValueError``
    fallthrough in ``_is_safe_download_url``. The host is not treated as a
    private literal and is instead handed to ``_classify_ip_literal`` (which
    also can't parse it), so it is allowed as a public hostname.
    """

    def test_172_hostname_with_non_numeric_second_octet_allowed(self):
        # e.g. `172.example.com` — starts with `172.` but the second segment
        # isn't an integer, so the private-range check must not misclassify it.
        ok, reason = _is_safe("https://172.example.com/file")
        self.assertTrue(ok, msg=reason)

    def test_172_hostname_with_empty_second_segment_allowed(self):
        # `172..example.com` — degenerate but must not crash.
        ok, _reason = _is_safe("https://172..example.com/file")
        self.assertTrue(ok)


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
            results = Results()
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


if __name__ == "__main__":
    unittest.main()
