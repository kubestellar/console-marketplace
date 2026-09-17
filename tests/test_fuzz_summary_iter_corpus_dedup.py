"""Cover the seen-set dedup branch in ``_iter_corpus_files``
(``scripts/fuzz_summary.py``).

The generator walks a fixed list of glob patterns and deduplicates paths
via a ``seen`` set so a file that matches two patterns is only yielded
once. In the real ``CORPUS_GLOBS`` (``registry.json``, ``dashboards/*/dashboard.json``,
``presets/*.json``, ``card-presets/*.json``) the patterns never overlap, so
the "path IS in seen — skip" branch (``fuzz_summary.py``: `if path not in
seen:` → back to the outer ``for pattern`` loop) is never exercised by
real corpus fixtures. That is the last uncovered branch in the module
(99% → 100%).

We construct overlapping patterns via ``monkeypatch`` so the same file
matches twice and the dedup branch runs.
"""
from __future__ import annotations

import importlib.util
import os
import sys


def _load_module():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "fuzz_summary_dedup",
        os.path.join(scripts_dir, "fuzz_summary.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


_mod = _load_module()


class TestIterCorpusFilesDedup:
    def test_overlapping_globs_yield_each_file_once(self, tmp_path, monkeypatch):
        # A single file that will match two different overlapping globs.
        target = tmp_path / "registry.json"
        target.write_text("{}", encoding="utf-8")

        # Two patterns that both resolve to the same file.
        monkeypatch.setattr(
            _mod, "CORPUS_GLOBS", ["registry.json", "*.json"], raising=True
        )

        yielded = list(_mod._iter_corpus_files(str(tmp_path)))

        # Dedup branch fires: the file is seen twice by glob but yielded
        # exactly once. If the branch regressed (e.g. someone dropped the
        # `if path not in seen` guard), we'd see 2 entries here.
        assert yielded == [str(target)]

    def test_non_overlapping_globs_yield_each_match(self, tmp_path, monkeypatch):
        # Sanity check for the other side of the branch — two distinct
        # files under two distinct patterns still both yield.
        (tmp_path / "a.json").write_text("{}", encoding="utf-8")
        (tmp_path / "sub").mkdir()
        (tmp_path / "sub" / "b.json").write_text("{}", encoding="utf-8")

        monkeypatch.setattr(
            _mod, "CORPUS_GLOBS", ["a.json", "sub/*.json"], raising=True
        )

        yielded = sorted(_mod._iter_corpus_files(str(tmp_path)))

        assert yielded == sorted(
            [str(tmp_path / "a.json"), str(tmp_path / "sub" / "b.json")]
        )
