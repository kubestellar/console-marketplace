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
import json

from tests.conftest import load_validate_marketplace

_mod = load_validate_marketplace()
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

    def test_sha_pinned_download_url_missing_file_is_reported(self, tmp_path):
        # Regression guard for issue #870: registry.json pins every
        # downloadUrl to a 40-hex commit SHA (not /main/), which the old
        # r"/main/(.+)$" regex never matched — silently skipping the
        # "downloadUrl path exists on disk" cross-check for ALL entries.
        sha = "56de485a64b85316429ad5d82db018a12c1df2fd"
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "ghost-dash",
                        "type": "dashboard",
                        "downloadUrl": (
                            "https://raw.githubusercontent.com/kubestellar/"
                            f"console-marketplace/{sha}/dashboards/ghost-dash/"
                            "dashboard.json"
                        ),
                    }
                ]
            },
        )
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        download_errs = [
            m for m in _messages(r.errors)
            if "downloadUrl" in m and "ghost-dash" in m
        ]
        assert download_errs, (
            "expected SHA-pinned downloadUrl with missing local file to be "
            f"reported; errors={_messages(r.errors)}"
        )

    def test_sha_pinned_download_url_with_existing_file_passes(self, tmp_path):
        # Complement of the missing-file guard: a SHA-pinned URL whose
        # path exists on disk must not raise a downloadUrl error.
        sha = "56de485a64b85316429ad5d82db018a12c1df2fd"
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "real-dash",
                        "type": "dashboard",
                        "downloadUrl": (
                            "https://raw.githubusercontent.com/kubestellar/"
                            f"console-marketplace/{sha}/dashboards/real-dash/"
                            "dashboard.json"
                        ),
                    }
                ]
            },
        )
        _write(tmp_path / "dashboards" / "real-dash" / "dashboard.json", {})
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        download_errs = [
            m for m in _messages(r.errors) if "downloadUrl" in m
        ]
        assert not download_errs, (
            "expected SHA-pinned downloadUrl with existing local file to "
            f"pass; got errors={download_errs}"
        )

    def test_non_sha_non_main_ref_is_silently_skipped(self, tmp_path):
        # A raw.githubusercontent.com URL with a branch ref that is
        # neither `main` nor a 40-hex SHA has no trusted path mapping —
        # the cross-check must skip it, matching the pre-existing
        # silent-skip contract for unparseable URLs.
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "branch-dash",
                        "type": "dashboard",
                        "downloadUrl": (
                            "https://raw.githubusercontent.com/kubestellar/"
                            "console-marketplace/feature-branch/dashboards/"
                            "branch-dash/dashboard.json"
                        ),
                    }
                ]
            },
        )
        _write(tmp_path / "dashboards" / "branch-dash" / "dashboard.json", {})
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        download_errs = [
            m for m in _messages(r.errors) if "downloadUrl" in m
        ]
        assert not download_errs, (
            "expected non-main/non-SHA ref to be silently skipped; "
            f"got errors={download_errs}"
        )
