"""Golden tests pinning ts_parsing's regex behaviour against real console source.

`parse_card_registry`, `parse_card_descriptors`, and
`parse_sub_registry_categories` in `scripts/validate_marketplace_lib/ts_parsing.py`
reverse-engineer console's `cardRegistry*.ts` / `cardDescriptors.registry.ts`
internals via regex and brace-matching rather than a published contract (see
issue #953). The rest of this test suite exercises those parsers only
against small synthetic fixtures built by `conftest_cross_repo._make_console`
— none of it locks in behaviour against console's *actual* current source.

This module runs the same parsers against a verbatim snapshot of console's
real registry files (`tests/fixtures/console_registry_snapshot/`, pinned to
the commit in `.github/actions/checkout-console-pin/action.yml` — see that
directory's README for provenance and how to regenerate) and asserts the
exact result set recorded in `expected.json`. The goal is that a refactor of
these parsers (toward a real TS parser, or toward reading a generated
manifest per #953's recommendation) fails this test immediately if it
changes what gets extracted from real source, instead of only being caught
later via a spurious "not found in console registry" failure on an
unrelated marketplace PR.
"""
import json
import os

from scripts.validate_marketplace_lib import ts_parsing as tp

FIXTURE_DIR = os.path.join(
    os.path.dirname(__file__), "fixtures", "console_registry_snapshot"
)
CARDS_DIR = os.path.join(FIXTURE_DIR, "web", "src", "components", "cards")

with open(os.path.join(FIXTURE_DIR, "expected.json")) as f:
    EXPECTED = json.load(f)


def test_parse_card_registry_matches_golden_snapshot():
    registry_ts = os.path.join(CARDS_DIR, "cardRegistry.ts")
    result = tp.parse_card_registry(registry_ts)
    assert sorted(result) == EXPECTED["parse_card_registry"]


def test_parse_sub_registry_categories_matches_golden_snapshot():
    result = tp.parse_sub_registry_categories(CARDS_DIR)
    assert sorted(result) == EXPECTED["parse_sub_registry_categories"]


def test_parse_card_descriptors_matches_golden_snapshot():
    descriptors_ts = os.path.join(CARDS_DIR, "cardDescriptors.registry.ts")
    result = tp.parse_card_descriptors(descriptors_ts)
    assert sorted(result) == EXPECTED["parse_card_descriptors"]


def test_golden_snapshot_is_nonempty():
    # Guards against a future regeneration accidentally pointing at an
    # empty/truncated console checkout and silently locking in zero results.
    assert len(EXPECTED["parse_card_registry"]) > 0
    assert len(EXPECTED["parse_sub_registry_categories"]) > 0
    assert len(EXPECTED["parse_card_descriptors"]) > 0
