"""Unit tests for pure-function helpers in scripts/validate-marketplace.py.

Complements tests/test_validate_marketplace.py, which is entirely focused on
the `_is_safe_download_url` SSRF guard, by covering four other module-level
helpers that carry no direct coverage today and whose contracts are relied
on by every workflow check in the same file:

  - load_json(path)                      → (data, error_msg) tuple contract
  - find_json_files(base, patterns)      → sorted, deduplicated file list
  - get_registry_entries(data)           → items + presets concatenation
  - _extract_object_block(content, anchor) → balanced-brace object body

None of these touch the network or shell out, and none are covered by the
SSRF-focused test module. See tracking issue #594 for the surrounding
fuzz.yml/validate-marketplace observability epic; this PR is a
self-directed helper-coverage lift.
"""
import importlib.util
import json
import os
import sys

import pytest


def _load_validate_marketplace():
    """Load the hyphenated validate-marketplace module via importlib."""
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate-marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_mod = _load_validate_marketplace()


# ── load_json ───────────────────────────────────────────────────────────────

class TestLoadJson:
    """Contract: (data, None) on success, (None, error_msg) on any failure."""

    def test_valid_object(self, tmp_path):
        p = tmp_path / "ok.json"
        p.write_text('{"a": 1, "b": [2, 3]}')
        data, err = _mod.load_json(str(p))
        assert err is None
        assert data == {"a": 1, "b": [2, 3]}

    def test_valid_array(self, tmp_path):
        p = tmp_path / "arr.json"
        p.write_text("[1, 2, 3]")
        data, err = _mod.load_json(str(p))
        assert err is None
        assert data == [1, 2, 3]

    def test_invalid_json_returns_error(self, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("{not json")
        data, err = _mod.load_json(str(p))
        assert data is None
        assert err is not None
        assert err.startswith("Invalid JSON:")

    def test_missing_file_returns_error(self, tmp_path):
        p = tmp_path / "nope.json"
        data, err = _mod.load_json(str(p))
        assert data is None
        assert err is not None
        assert err.startswith("File not found:")
        assert str(p) in err

    def test_permission_error_not_swallowed(self, tmp_path):
        # Only FileNotFoundError and JSONDecodeError are caught. Any other
        # OSError (e.g. PermissionError) must propagate so callers do not
        # silently mis-classify a system fault as "valid empty content".
        p = tmp_path / "denied.json"
        p.write_text("{}")
        p.chmod(0o000)
        try:
            with pytest.raises(PermissionError):
                _mod.load_json(str(p))
        finally:
            p.chmod(0o644)


# ── find_json_files ─────────────────────────────────────────────────────────

class TestFindJsonFiles:
    """Contract: sorted, deduplicated, glob-based file discovery under base."""

    def _make_tree(self, tmp_path):
        (tmp_path / "presets").mkdir()
        (tmp_path / "presets" / "a.json").write_text("{}")
        (tmp_path / "presets" / "b.json").write_text("{}")
        (tmp_path / "dashboards" / "d1").mkdir(parents=True)
        (tmp_path / "dashboards" / "d1" / "dashboard.json").write_text("{}")
        (tmp_path / "registry.json").write_text("{}")

    def test_flat_pattern(self, tmp_path):
        self._make_tree(tmp_path)
        found = _mod.find_json_files(str(tmp_path), ["registry.json"])
        assert found == [str(tmp_path / "registry.json")]

    def test_glob_pattern(self, tmp_path):
        self._make_tree(tmp_path)
        found = _mod.find_json_files(str(tmp_path), ["presets/*.json"])
        assert found == [
            str(tmp_path / "presets" / "a.json"),
            str(tmp_path / "presets" / "b.json"),
        ]

    def test_nested_glob(self, tmp_path):
        self._make_tree(tmp_path)
        found = _mod.find_json_files(str(tmp_path), ["dashboards/*/dashboard.json"])
        assert found == [str(tmp_path / "dashboards" / "d1" / "dashboard.json")]

    def test_multiple_patterns_are_merged_and_sorted(self, tmp_path):
        self._make_tree(tmp_path)
        found = _mod.find_json_files(
            str(tmp_path),
            ["registry.json", "presets/*.json"],
        )
        assert found == sorted(found)
        assert set(found) == {
            str(tmp_path / "presets" / "a.json"),
            str(tmp_path / "presets" / "b.json"),
            str(tmp_path / "registry.json"),
        }

    def test_overlapping_patterns_deduplicate(self, tmp_path):
        """The same file matched by two patterns must appear only once."""
        self._make_tree(tmp_path)
        found = _mod.find_json_files(
            str(tmp_path),
            ["presets/*.json", "presets/a.json"],
        )
        # 'a.json' matched by both patterns — set(...) collapses it.
        assert found.count(str(tmp_path / "presets" / "a.json")) == 1

    def test_no_matches_returns_empty_list(self, tmp_path):
        found = _mod.find_json_files(str(tmp_path), ["nonexistent/*.json"])
        assert found == []

    def test_empty_patterns_returns_empty_list(self, tmp_path):
        self._make_tree(tmp_path)
        assert _mod.find_json_files(str(tmp_path), []) == []


# ── get_registry_entries ────────────────────────────────────────────────────

class TestGetRegistryEntries:
    """Contract: items + presets, in that order, defaulting to []."""

    def test_both_present(self):
        data = {"items": [{"id": "a"}, {"id": "b"}], "presets": [{"id": "c"}]}
        assert _mod.get_registry_entries(data) == [
            {"id": "a"}, {"id": "b"}, {"id": "c"},
        ]

    def test_items_first_then_presets(self):
        """Order matters: registry checks that dedupe by id rely on it."""
        data = {"items": [{"id": "x"}], "presets": [{"id": "y"}]}
        entries = _mod.get_registry_entries(data)
        assert entries[0]["id"] == "x"
        assert entries[1]["id"] == "y"

    def test_missing_presets_defaults_to_empty(self):
        assert _mod.get_registry_entries({"items": [{"id": "a"}]}) == [{"id": "a"}]

    def test_missing_items_defaults_to_empty(self):
        assert _mod.get_registry_entries({"presets": [{"id": "p"}]}) == [{"id": "p"}]

    def test_both_missing(self):
        assert _mod.get_registry_entries({}) == []

    def test_empty_arrays(self):
        assert _mod.get_registry_entries({"items": [], "presets": []}) == []


# ── _extract_object_block ───────────────────────────────────────────────────

class TestExtractObjectBlock:
    """Contract: return the body of the first {...} after `anchor`, respecting
    nesting; return "" if the anchor or a matching brace is missing."""

    def test_simple_block(self):
        content = 'const X = { a: 1, b: 2 };'
        assert _mod._extract_object_block(content, "const X") == " a: 1, b: 2 "

    def test_missing_anchor_returns_empty(self):
        assert _mod._extract_object_block("no match here", "MISSING") == ""

    def test_no_brace_after_anchor_returns_empty(self):
        assert _mod._extract_object_block("const X = 1;", "const X") == ""

    def test_nested_braces_balanced(self):
        content = 'REG = { a: { b: 1 }, c: 2 }; more'
        assert _mod._extract_object_block(content, "REG") == " a: { b: 1 }, c: 2 "

    def test_deeply_nested(self):
        content = 'M = { x: { y: { z: 1 } } };'
        assert _mod._extract_object_block(content, "M") == " x: { y: { z: 1 } } "

    def test_unbalanced_open_returns_empty(self):
        # Depth never reaches 0 → loop exits without returning the slice.
        content = 'M = { a: 1'
        assert _mod._extract_object_block(content, "M") == ""

    def test_anchor_appears_before_brace(self):
        """Anchor without a following `{` matches empty, not the next block."""
        content = 'foo bar {ignored: 1}'  # no anchor "MISSING" here
        assert _mod._extract_object_block(content, "MISSING") == ""

    def test_first_occurrence_wins(self):
        content = 'A = { first: 1 }; A = { second: 2 };'
        assert _mod._extract_object_block(content, "A") == " first: 1 "
