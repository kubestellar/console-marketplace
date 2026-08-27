"""Closes the final two uncovered lines in scripts/validate-marketplace.py.

Prior branch-coverage passes drove the script to 99% (2 misses of 741).
The two remaining uncovered lines were:

- **line 224**: the ``continue  # Skip the root registry file`` fallthrough
  inside ``parse_sub_registry_categories``. The glob
  ``cardRegistry.*.ts`` matches the root ``cardRegistry.ts`` file too,
  and the loop explicitly skips it so its RAW_CARD_COMPONENTS table is
  handled by ``parse_raw_card_components`` instead. Prior tests never
  put a ``cardRegistry.ts`` in the mocked glob result, so a regression
  that dropped the skip (double-counting cards, or worse, blowing up on
  the different file shape) would go unnoticed.

- **line 914**: the ``return False, f"host {host!r} is the unspecified
  address"`` arm of ``_classify_ip_literal``. In current Python (3.4+)
  the CPython ``ipaddress`` module classifies ``0.0.0.0`` and ``::`` as
  ``is_private`` per RFC 6890, so the ordering of arms means the
  ``is_unspecified`` branch is never entered by a real literal. That
  makes this an important *defense-in-depth* guard: if a future Python
  release refines its RFC 6890 mapping and stops flagging the
  unspecified address as private, this arm becomes the only barrier
  keeping ``0.0.0.0`` out of the safe-host allowlist. The test
  injects a mock IP with the exact attribute shape (unspecified=True,
  everything else False) that a semantics change would produce and
  asserts the guard still rejects it.

Together these bring scripts/validate-marketplace.py to 100% line
coverage. Test-only change — no production code touched.
"""
import importlib.util
import io
import os
import unittest
from unittest import mock


def _load_mod():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate-marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


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


class ClassifyIpUnspecifiedTest(unittest.TestCase):
    """Cover the unspecified-address return branch at line 914.

    In current Python, ``ipaddress.ip_address('0.0.0.0').is_private`` is
    True (RFC 6890), so the ``is_unspecified`` arm below it is
    unreachable from any real literal. We patch ``ipaddress.ip_address``
    to return a mock IP with the exact shape a future
    semantics-change would produce, so the guard is exercised without
    lying about how CPython currently classifies the address.
    """

    def _mock_ip(self, **flags):
        """Build a Mock IP with every classifier flag defaulting False."""
        defaults = dict(
            is_loopback=False,
            is_link_local=False,
            is_private=False,
            is_reserved=False,
            is_unspecified=False,
            is_multicast=False,
        )
        defaults.update(flags)
        m = mock.MagicMock()
        for k, v in defaults.items():
            setattr(m, k, v)
        # Not an IPv6Address subclass, so the ipv4_mapped normalisation
        # inside _classify_ip_literal is skipped.
        m.__class__ = mock.MagicMock
        return m

    def test_unspecified_only_hits_the_dedicated_arm(self):
        mod = _load_mod()
        fake_ip = self._mock_ip(is_unspecified=True)
        with mock.patch.object(mod.ipaddress, "ip_address", return_value=fake_ip):
            ok, reason = mod._classify_ip_literal("0.0.0.0")
        self.assertFalse(ok)
        self.assertIn("unspecified", reason)
        self.assertIn("0.0.0.0", reason)

    def test_unspecified_arm_reached_only_after_earlier_arms_pass(self):
        # Lock the switch ordering: if ``is_loopback`` / ``is_link_local``
        # / ``is_private`` / ``is_reserved`` are all False but
        # ``is_unspecified`` is True, the unspecified message must win
        # over ``is_multicast``. A regression that reordered the arms
        # (e.g. lifting multicast above unspecified) would flip the
        # reason string and fail this test.
        mod = _load_mod()
        fake_ip = self._mock_ip(is_unspecified=True, is_multicast=True)
        with mock.patch.object(mod.ipaddress, "ip_address", return_value=fake_ip):
            _, reason = mod._classify_ip_literal("0.0.0.0")
        self.assertIn("unspecified", reason)
        self.assertNotIn("multicast", reason)

    def test_real_zero_zero_zero_zero_is_still_rejected_today(self):
        # Sanity check that today the private-arm rejection still fires
        # for 0.0.0.0 — so the defense-in-depth arm above isn't the only
        # thing standing between an SSRF and success on current CPython.
        mod = _load_mod()
        ok, reason = mod._classify_ip_literal("0.0.0.0")
        self.assertFalse(ok)
        self.assertIn("private", reason)


if __name__ == "__main__":
    unittest.main()
