"""Branch-coverage tests + defensive regression guards for
``scripts/validate-marketplace.py``: cards inside a dashboard's
``cards: [...]`` array that are missing the ``card_type`` key.

Two functions iterate ``data.get("cards", [])`` and gate on
``if "card_type" in card`` before appending to a collected list/set:

- ``check_naming_conventions`` at line 482-484
- ``get_all_marketplace_card_types`` at line 570-572

The FALSE arm of that gate was uncovered by the existing suite —
every dashboard/preset fixture in ``test_validate_coverage_gaps.py``
and ``test_validate_check_functions.py`` populates ``card_type`` on
every card. That means a regression which either

  (a) started raising KeyError on cards without card_type, or
  (b) silently swept ``None`` values into the set / naming check,

would go unnoticed.

Both tests use a dashboard containing one well-formed card AND one
"scaffold" card (metadata only, no card_type yet — a realistic
in-progress editing state). The well-formed card must still be
counted; the scaffold card must be skipped without error.
"""

from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

_script = os.path.join(
    os.path.dirname(__file__), "..", "scripts", "validate-marketplace.py"
)
spec = importlib.util.spec_from_file_location("validate_marketplace", _script)
_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(_mod)


def _rmtree(p: Path) -> None:
    import shutil
    shutil.rmtree(p, ignore_errors=True)


def _iter_all_findings(results):
    for sev, entries in (
        ("error", results.errors),
        ("warn", results.warnings),
    ):
        for entry in entries:
            # Entry shape is (category, message) — see Results.error/warn.
            cat, msg = entry[0], entry[1]
            yield sev, cat, msg


class TestCardsMissingCardType(unittest.TestCase):
    """A card entry inside ``cards: [...]`` without a ``card_type`` key
    must be skipped silently — no KeyError, no phantom hyphen-naming
    error, no ``None`` polluting the collected card_type set.
    """

    def setUp(self) -> None:
        self.base = Path(tempfile.mkdtemp())
        self.addCleanup(_rmtree, self.base)
        (self.base / "dashboards" / "example").mkdir(parents=True)
        # Mixed dashboard: one valid card + one scaffold (no card_type).
        # The scaffold shape is realistic — an editor may leave a card
        # placeholder with only a title while wiring up the rest.
        self._dashboard = {
            "id": "d1",
            "name": "D",
            "cards": [
                {"card_type": "coredns_status"},
                {"title": "TBD"},  # NO card_type key — the target branch
            ],
        }
        (self.base / "dashboards" / "example" / "dashboard.json").write_text(
            json.dumps(self._dashboard)
        )

    # --- check_naming_conventions ------------------------------------

    def test_check_naming_conventions_skips_card_without_card_type(self) -> None:
        # The false arm of `if "card_type" in card` (line 483->482) is
        # exercised here. The naming check must not blow up on the
        # scaffold card, and must not emit a phantom hyphen-error
        # keyed to a None/missing card_type.
        results = _mod.Results()
        _mod.check_naming_conventions(str(self.base), results)

        # No hyphen-naming errors: the well-formed card_type is snake_case
        # and the scaffold card contributes nothing.
        for sev, cat, msg in _iter_all_findings(results):
            if sev == "error" and cat == "naming":
                self.fail(
                    f"unexpected naming error against mixed dashboard: {msg}"
                )

    # --- get_all_marketplace_card_types ------------------------------

    def test_get_all_marketplace_card_types_skips_card_without_card_type(
        self,
    ) -> None:
        # The false arm of `if "card_type" in card` (line 571->570).
        # The well-formed card contributes coredns_status; the scaffold
        # card contributes nothing. `None` must NOT appear in the set.
        types = _mod.get_all_marketplace_card_types(str(self.base))
        self.assertIn("coredns_status", types)
        self.assertNotIn(None, types)
        # And no "" either (guarding a related-but-different regression
        # where a KeyError was replaced with `.get("card_type", "")`
        # instead of a proper skip).
        self.assertNotIn("", types)


if __name__ == "__main__":
    unittest.main()
