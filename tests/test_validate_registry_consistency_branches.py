"""Regression guards for two previously-uncovered branches in
``check_registry_consistency`` (``scripts/validate-marketplace.py``).

pytest-cov's ``--cov-branch`` flagged partials at 535->543 and
547->509 on the registry consistency checker. Both are real,
reachable code paths that the existing fixture-driven suite happens
not to hit, so a regression that removed either fallback would slip
through CI.

- ``535->543``: the fall-through path from the ``elif item_type ==
  "theme":`` chain when ``item_type`` matches none of the three
  recognized values (``dashboard``, ``card-preset``, ``theme``).
  A registry entry with an unknown type must still be range-checked
  for downloadUrl consistency, and must not crash the loop.
- ``547->509``: inside the ``if url:`` block, the false arm of
  ``if m:`` (``re.search(r"/main/(.+)$", url)`` returning None) —
  i.e. a ``downloadUrl`` that doesn't embed a ``/main/`` segment.
  Silent skip is the correct behavior here (there's nothing to
  cross-check against a local file), but the branch must still be
  executed so a future regression that turned the ``if m:`` into
  an unconditional index access is caught.
"""
import importlib.util
import json
import os


def _load_module():
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "scripts")
    spec = importlib.util.spec_from_file_location(
        "validate_marketplace",
        os.path.join(scripts_dir, "validate-marketplace.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_mod = _load_module()
Results = _mod.Results


def _write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj))


def _messages(records):
    return [m for _, m in records]


class TestRegistryConsistencyBranchGuards:
    def test_unknown_item_type_falls_through_to_download_url_check(self, tmp_path):
        # Guards branch 535->543: item_type is neither "dashboard",
        # "card-preset", nor "theme". The type-specific file check
        # must be skipped without error, and the downloadUrl check
        # below must still run — verified here by supplying an
        # unknown-type entry with a downloadUrl that DOES contain a
        # /main/<path> so we can assert the mismatch is reported.
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "mystery",
                        "type": "wobble",
                        "downloadUrl": (
                            "https://raw.githubusercontent.com/example/repo/"
                            "main/wobbles/mystery.json"
                        ),
                    }
                ]
            },
        )
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        # No type-specific file error (unknown type is silent by design):
        # the only error may come from the downloadUrl fallthrough below.
        type_errs = [
            m for m in _messages(r.errors)
            if "downloadUrl" not in m
        ]
        assert not type_errs, type_errs
        # The downloadUrl fallthrough executed and reported the missing file.
        download_errs = [
            m for m in _messages(r.errors)
            if "downloadUrl" in m and "mystery" in m
        ]
        assert download_errs, (
            "expected downloadUrl cross-check to still run for an "
            f"unknown item_type; errors={_messages(r.errors)}"
        )

    def test_download_url_without_main_segment_is_silently_skipped(self, tmp_path):
        # Guards branch 547->509: downloadUrl is present but does
        # NOT contain a ``/main/`` segment, so re.search returns
        # None and we fall through to the next loop iteration. No
        # error must be raised (there's nothing to cross-check
        # against a local file when the URL doesn't follow the
        # /main/<path> convention).
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "external-dashboard",
                        "type": "dashboard",
                        # No /main/ segment — e.g. a CDN-hosted URL.
                        "downloadUrl": "https://example.com/downloads/foo.json",
                    }
                ]
            },
        )
        _write(
            tmp_path / "dashboards" / "external-dashboard" / "dashboard.json",
            {},
        )
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        # No downloadUrl error must be produced — the /main/ regex
        # missed, so the cross-check is skipped, not failed.
        download_errs = [
            m for m in _messages(r.errors) if "downloadUrl" in m
        ]
        assert not download_errs, (
            "expected downloadUrl without /main/ segment to be "
            f"silently skipped; got errors={download_errs}"
        )
