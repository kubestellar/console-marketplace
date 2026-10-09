"""Core validator plumbing: ``Results`` aggregation and the JSON/file helpers.

Covers ``scripts/validate_marketplace.py`` building blocks shared by every
checker: the ``Results`` collector (exit codes, summary rendering, JSON
records), ``load_json``, ``find_json_files``, ``get_registry_entries``,
``extract_object_block`` and ``check_json_syntax``.
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import textwrap
import unittest

import pytest

from .validate_helpers import Results, _messages, _mod
from tests.conftest import load_validate_marketplace


# ── helpers from test_validate_results_and_parsers.py ──
_mod_results = load_validate_marketplace()


# ── helpers from test_validate_marketplace_helpers.py ──
def _load_validate_marketplace():
    """Load the hyphenated validate-marketplace module via importlib."""
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate_marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

_mod_helpers = _load_validate_marketplace()


# ── helpers from test_validate_parser.py ──
vm = load_validate_marketplace()


# ── helpers from test_validate_coverage_gaps.py ──
_mod_gaps = load_validate_marketplace()

Results_gaps = _mod_gaps.Results

def _iter_all_findings(results):
    """Yield every finding on a Results_gaps instance as (severity, category, msg).

    Results_gaps is defined at the top of validate_marketplace.py; we access
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


class TestResults:
    def test_exit_code_ok(self):
        r = Results()
        r.ok("cat", "ok")
        assert r.exit_code == 0

    def test_exit_code_warning(self):
        r = Results()
        r.warn("cat", "warn")
        assert r.exit_code == 2

    def test_exit_code_error_wins(self):
        r = Results()
        r.warn("cat", "warn")
        r.error("cat", "err")
        assert r.exit_code == 1

    def test_to_json_shape(self):
        r = Results()
        r.error("a", "e")
        r.warn("b", "w")
        r.note("c", "n")
        r.ok("d", "o")
        payload = r.to_json()
        assert payload["exit_code"] == 1
        assert payload["errors"] == [{"category": "a", "message": "e"}]
        assert payload["warnings"] == [{"category": "b", "message": "w"}]
        assert payload["info"] == [{"category": "c", "message": "n"}]
        assert payload["passes"] == [{"category": "d", "message": "o"}]

    def test_summary_md_contains_sections(self):
        r = Results()
        r.error("cat", "boom")
        r.warn("cat", "meh")
        r.note("cat", "fyi")
        md = r.summary_md()
        assert "Errors" in md and "boom" in md
        assert "Warnings" in md and "meh" in md
        assert "Info" in md and "fyi" in md

    def test_print_summary_runs(self, capsys):
        r = Results()
        r.error("cat", "boom")
        r.warn("cat", "meh")
        r.note("cat", "fyi")
        r.ok("cat", "yay")
        r.print_summary()
        out = capsys.readouterr().out
        assert "ERROR" in out and "WARN" in out and "INFO" in out and "OK" in out


class TestLoadHelpers:
    def test_load_json_ok(self, tmp_path):
        p = tmp_path / "f.json"
        p.write_text('{"a": 1}')
        data, err = _mod.load_json(str(p))
        assert data == {"a": 1}
        assert err is None

    def test_load_json_bad(self, tmp_path):
        p = tmp_path / "f.json"
        p.write_text("{not json")
        data, err = _mod.load_json(str(p))
        assert data is None
        assert "Invalid JSON" in err

    def test_load_json_missing(self, tmp_path):
        data, err = _mod.load_json(str(tmp_path / "nope.json"))
        assert data is None
        assert "not found" in err

    def test_find_json_files(self, tmp_path):
        (tmp_path / "presets").mkdir()
        (tmp_path / "presets" / "a.json").write_text("{}")
        (tmp_path / "presets" / "b.json").write_text("{}")
        (tmp_path / "themes").mkdir()
        (tmp_path / "themes" / "t.json").write_text("{}")
        found = _mod.find_json_files(str(tmp_path), ["presets/*.json"])
        assert len(found) == 2
        assert all(f.endswith(".json") for f in found)


class TestJsonSyntax:
    def test_valid_and_invalid(self, tmp_path):
        (tmp_path / "themes").mkdir()
        (tmp_path / "themes" / "good.json").write_text("{}")
        (tmp_path / "themes" / "bad.json").write_text("{oops")
        r = Results()
        _mod.check_json_syntax(str(tmp_path), r)
        assert any("bad.json" in m for m in _messages(r.errors))
        assert any("good.json" in m for m in _messages(r.passes))

    def test_no_files(self, tmp_path):
        r = Results()
        _mod.check_json_syntax(str(tmp_path), r)
        assert not r.errors
        assert not r.passes


class TestResultsExitCodesAndSummary:
    def test_empty_results_exit_code_zero(self):
        r = _mod_results.Results()
        assert r.exit_code == 0
        assert r.errors == [] and r.warnings == [] and r.info == [] and r.passes == []

    def test_errors_produce_exit_code_1(self):
        r = _mod_results.Results()
        r.error("cat", "boom")
        assert r.exit_code == 1

    def test_warnings_produce_exit_code_2(self):
        r = _mod_results.Results()
        r.warn("cat", "meh")
        assert r.exit_code == 2

    def test_errors_dominate_warnings(self):
        r = _mod_results.Results()
        r.warn("cat", "meh")
        r.error("cat", "boom")
        assert r.exit_code == 1

    def test_passes_do_not_change_exit_code(self):
        r = _mod_results.Results()
        r.ok("cat", "yay")
        r.note("cat", "fyi")
        assert r.exit_code == 0

    def test_summary_md_lists_all_sections(self):
        r = _mod_results.Results()
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
        r = _mod_results.Results()
        r.ok("schema", "valid")
        md = r.summary_md()
        assert "#### Errors" not in md
        assert "#### Warnings" not in md
        assert "#### Info" not in md
        assert "0 error(s)" in md

    def test_print_summary(self, capsys):
        r = _mod_results.Results()
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

    def test_print_summary_emits_grep_friendly_json_record(self, capsys):
        """print_summary() must also emit a single-line, bounded JSON
        record (MARKETPLACE_QUALITY_SUMMARY: {...}) so CI log tooling can
        grep for leveled counts without parsing the free-text summary."""
        r = _mod_results.Results()
        r.error("json", "bad")
        r.warn("naming", "meh")
        r.note("info", "ctx")
        r.ok("schema", "valid")
        r.record_timing("static", 1.5)
        r.print_summary()
        out = capsys.readouterr().out
        summary_line = next(
            line for line in out.splitlines()
            if line.startswith("MARKETPLACE_QUALITY_SUMMARY: ")
        )
        record = json.loads(summary_line[len("MARKETPLACE_QUALITY_SUMMARY: "):])
        assert record == {
            "error_count": 1,
            "warning_count": 1,
            "info_count": 1,
            "pass_count": 1,
            "total_duration_seconds": 1.5,
            "exit_code": 1,
        }

    def test_to_json_shape(self):
        r = _mod_results.Results()
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


class TestLoadJsonExtra:
    def test_missing_file_returns_error_message(self, tmp_path):
        data, err = _mod_results.load_json(str(tmp_path / "nope.json"))
        assert data is None
        assert err is not None and "not found" in err.lower()

    def test_invalid_json_returns_error(self, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("{not-json,,,")
        data, err = _mod_results.load_json(str(p))
        assert data is None
        assert err is not None and "Invalid JSON" in err


class TestLoadJson:
    """Contract: (data, None) on success, (None, error_msg) on any failure."""

    def test_valid_object(self, tmp_path):
        p = tmp_path / "ok.json"
        p.write_text('{"a": 1, "b": [2, 3]}')
        data, err = _mod_helpers.load_json(str(p))
        assert err is None
        assert data == {"a": 1, "b": [2, 3]}

    def test_valid_array(self, tmp_path):
        p = tmp_path / "arr.json"
        p.write_text("[1, 2, 3]")
        data, err = _mod_helpers.load_json(str(p))
        assert err is None
        assert data == [1, 2, 3]

    def test_invalid_json_returns_error(self, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("{not json")
        data, err = _mod_helpers.load_json(str(p))
        assert data is None
        assert err is not None
        assert err.startswith("Invalid JSON:")

    def test_missing_file_returns_error(self, tmp_path):
        p = tmp_path / "nope.json"
        data, err = _mod_helpers.load_json(str(p))
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
                _mod_helpers.load_json(str(p))
        finally:
            p.chmod(0o644)


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
        found = _mod_helpers.find_json_files(str(tmp_path), ["registry.json"])
        assert found == [str(tmp_path / "registry.json")]

    def test_glob_pattern(self, tmp_path):
        self._make_tree(tmp_path)
        found = _mod_helpers.find_json_files(str(tmp_path), ["presets/*.json"])
        assert found == [
            str(tmp_path / "presets" / "a.json"),
            str(tmp_path / "presets" / "b.json"),
        ]

    def test_nested_glob(self, tmp_path):
        self._make_tree(tmp_path)
        found = _mod_helpers.find_json_files(str(tmp_path), ["dashboards/*/dashboard.json"])
        assert found == [str(tmp_path / "dashboards" / "d1" / "dashboard.json")]

    def test_multiple_patterns_are_merged_and_sorted(self, tmp_path):
        self._make_tree(tmp_path)
        found = _mod_helpers.find_json_files(
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
        found = _mod_helpers.find_json_files(
            str(tmp_path),
            ["presets/*.json", "presets/a.json"],
        )
        # 'a.json' matched by both patterns — set(...) collapses it.
        assert found.count(str(tmp_path / "presets" / "a.json")) == 1

    def test_no_matches_returns_empty_list(self, tmp_path):
        found = _mod_helpers.find_json_files(str(tmp_path), ["nonexistent/*.json"])
        assert found == []

    def test_empty_patterns_returns_empty_list(self, tmp_path):
        self._make_tree(tmp_path)
        assert _mod_helpers.find_json_files(str(tmp_path), []) == []


class TestGetRegistryEntries:
    """Contract: items + presets, in that order, defaulting to []."""

    def test_both_present(self):
        data = {"items": [{"id": "a"}, {"id": "b"}], "presets": [{"id": "c"}]}
        assert _mod_helpers.get_registry_entries(data) == [
            {"id": "a"}, {"id": "b"}, {"id": "c"},
        ]

    def test_items_first_then_presets(self):
        """Order matters: registry checks that dedupe by id rely on it."""
        data = {"items": [{"id": "x"}], "presets": [{"id": "y"}]}
        entries = _mod_helpers.get_registry_entries(data)
        assert entries[0]["id"] == "x"
        assert entries[1]["id"] == "y"

    def test_missing_presets_defaults_to_empty(self):
        assert _mod_helpers.get_registry_entries({"items": [{"id": "a"}]}) == [{"id": "a"}]

    def test_missing_items_defaults_to_empty(self):
        assert _mod_helpers.get_registry_entries({"presets": [{"id": "p"}]}) == [{"id": "p"}]

    def test_both_missing(self):
        assert _mod_helpers.get_registry_entries({}) == []

    def test_empty_arrays(self):
        assert _mod_helpers.get_registry_entries({"items": [], "presets": []}) == []


class TestExtractObjectBlock:
    """Contract: return the body of the first {...} after `anchor`, respecting
    nesting; return "" if the anchor or a matching brace is missing."""

    def test_simple_block(self):
        content = 'const X = { a: 1, b: 2 };'
        assert _mod_helpers._extract_object_block(content, "const X") == " a: 1, b: 2 "

    def test_missing_anchor_returns_empty(self):
        assert _mod_helpers._extract_object_block("no match here", "MISSING") == ""

    def test_no_brace_after_anchor_returns_empty(self):
        assert _mod_helpers._extract_object_block("const X = 1;", "const X") == ""

    def test_nested_braces_balanced(self):
        content = 'REG = { a: { b: 1 }, c: 2 }; more'
        assert _mod_helpers._extract_object_block(content, "REG") == " a: { b: 1 }, c: 2 "

    def test_deeply_nested(self):
        content = 'M = { x: { y: { z: 1 } } };'
        assert _mod_helpers._extract_object_block(content, "M") == " x: { y: { z: 1 } } "

    def test_unbalanced_open_returns_empty(self):
        # Depth never reaches 0 → loop exits without returning the slice.
        content = 'M = { a: 1'
        assert _mod_helpers._extract_object_block(content, "M") == ""

    def test_anchor_appears_before_brace(self):
        """Anchor without a following `{` matches empty, not the next block."""
        content = 'foo bar {ignored: 1}'  # no anchor "MISSING" here
        assert _mod_helpers._extract_object_block(content, "MISSING") == ""

    def test_first_occurrence_wins(self):
        content = 'A = { first: 1 }; A = { second: 2 };'
        assert _mod_helpers._extract_object_block(content, "A") == " first: 1 "


class TestExtractObjectBlockParser:
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


class TestGetRegistryEntriesParser:
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


class TestLoadJsonParser:
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


class TestFindJsonFilesParser:
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


class TestResultsHelperShapeIsStable(unittest.TestCase):
    """Guard: if Results_gaps ever grows a bucket other than errors/warnings/notes,
    the ``_iter_all_findings`` helper above must be updated so the malformed-
    JSON tests keep asserting against every bucket. This test locks in the
    known shape and fails loudly if a bucket is renamed or added.
    """

    def test_results_has_expected_buckets(self):
        r = Results_gaps()
        expected = {"errors", "warnings", "info", "passes"}
        actual = {name for name in vars(r) if not name.startswith("_")}
        # Every expected bucket must exist. Extra internal fields are fine;
        # we assert containment, not equality.
        self.assertTrue(
            expected.issubset(actual),
            msg=f"expected Results_gaps to expose {expected}, got fields={actual}",
        )


if __name__ == "__main__":
    unittest.main()
