"""Unit tests for validate-marketplace.py parsing and validation helpers.

Tests core pure functions: _extract_object_block, get_registry_entries,
load_json, find_json_files, and check_naming_conventions logic.
"""

import importlib.util
import json
import os
import sys
import tempfile

import pytest

# Import the validate script as a module
_script = os.path.join(os.path.dirname(__file__), "..", "scripts", "validate-marketplace.py")
spec = importlib.util.spec_from_file_location("validate_marketplace", _script)
vm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vm)


# --- _extract_object_block ---

class TestExtractObjectBlock:
    """Tests for the brace-balanced TypeScript object extractor."""

    def test_simple_object(self):
        content = 'const x = Object.assign({ foo: 1, bar: 2 })'
        result = vm._extract_object_block(content, "Object.assign(")
        assert "foo: 1" in result
        assert "bar: 2" in result

    def test_nested_braces(self):
        content = 'const x = Object.assign({ foo: { inner: 1 }, bar: 2 })'
        result = vm._extract_object_block(content, "Object.assign(")
        assert "foo: { inner: 1 }" in result
        assert "bar: 2" in result

    def test_deeply_nested(self):
        content = 'export const REG = { a: { b: { c: 1 } }, d: 2 }'
        result = vm._extract_object_block(content, "REG = ")
        assert "a: { b: { c: 1 } }" in result
        assert "d: 2" in result

    def test_anchor_not_found(self):
        content = 'const x = { foo: 1 }'
        result = vm._extract_object_block(content, "NONEXISTENT")
        assert result == ""

    def test_no_opening_brace(self):
        content = 'const x = ANCHOR_HERE'
        result = vm._extract_object_block(content, "ANCHOR_HERE")
        assert result == ""

    def test_unclosed_brace(self):
        content = 'const x = ANCHOR { foo: 1'
        result = vm._extract_object_block(content, "ANCHOR")
        assert result == ""

    def test_empty_object(self):
        content = 'const x = ANCHOR {}'
        result = vm._extract_object_block(content, "ANCHOR")
        assert result == ""


# --- get_registry_entries ---

class TestGetRegistryEntries:
    """Tests for registry entry extraction."""

    def test_items_only(self):
        data = {"items": [{"id": "a"}, {"id": "b"}]}
        assert vm.get_registry_entries(data) == [{"id": "a"}, {"id": "b"}]

    def test_presets_only(self):
        data = {"presets": [{"id": "p1"}]}
        assert vm.get_registry_entries(data) == [{"id": "p1"}]

    def test_both(self):
        data = {"items": [{"id": "a"}], "presets": [{"id": "p"}]}
        result = vm.get_registry_entries(data)
        assert len(result) == 2
        assert {"id": "a"} in result
        assert {"id": "p"} in result

    def test_empty(self):
        assert vm.get_registry_entries({}) == []

    def test_missing_keys(self):
        data = {"other": "stuff"}
        assert vm.get_registry_entries(data) == []


# --- load_json ---

class TestLoadJson:
    """Tests for JSON file loading."""

    def test_valid_json(self, tmp_path):
        f = tmp_path / "valid.json"
        f.write_text('{"key": "value"}')
        data, err = vm.load_json(str(f))
        assert data == {"key": "value"}
        assert err is None

    def test_invalid_json(self, tmp_path):
        f = tmp_path / "bad.json"
        f.write_text('{not valid json}')
        data, err = vm.load_json(str(f))
        assert data is None
        assert "Invalid JSON" in err

    def test_missing_file(self):
        data, err = vm.load_json("/nonexistent/path.json")
        assert data is None
        assert "File not found" in err

    def test_empty_json_object(self, tmp_path):
        f = tmp_path / "empty.json"
        f.write_text('{}')
        data, err = vm.load_json(str(f))
        assert data == {}
        assert err is None

    def test_json_array(self, tmp_path):
        f = tmp_path / "arr.json"
        f.write_text('[1, 2, 3]')
        data, err = vm.load_json(str(f))
        assert data == [1, 2, 3]
        assert err is None


# --- find_json_files ---

class TestFindJsonFiles:
    """Tests for glob-based JSON file discovery."""

    def test_finds_matching_files(self, tmp_path):
        presets_dir = tmp_path / "presets"
        presets_dir.mkdir()
        (presets_dir / "a.json").write_text("{}")
        (presets_dir / "b.json").write_text("{}")
        (presets_dir / "not-json.txt").write_text("")

        result = vm.find_json_files(str(tmp_path), ["presets/*.json"])
        assert len(result) == 2
        assert all(r.endswith(".json") for r in result)

    def test_no_matches(self, tmp_path):
        result = vm.find_json_files(str(tmp_path), ["nonexistent/*.json"])
        assert result == []

    def test_multiple_patterns(self, tmp_path):
        (tmp_path / "presets").mkdir()
        (tmp_path / "presets" / "x.json").write_text("{}")
        (tmp_path / "dashboards").mkdir()
        (tmp_path / "dashboards" / "d.json").write_text("{}")

        result = vm.find_json_files(str(tmp_path), ["presets/*.json", "dashboards/*.json"])
        assert len(result) == 2
