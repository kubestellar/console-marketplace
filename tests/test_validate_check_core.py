"""Core validator tests: ``Results`` container, JSON load helpers, and
``check_json_syntax`` from ``scripts/validate-marketplace.py``.

Split from test_validate_check_functions.py (issue #554). Shared fixtures
live in ``validate_helpers``.
"""
from .validate_helpers import Results, _messages, _mod

# ── Results container ──────────────────────────────────────────────


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


# ── load_json / find_json_files ────────────────────────────────────


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


# ── check_json_syntax ──────────────────────────────────────────────


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

