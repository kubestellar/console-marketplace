"""Regression guard: registry.json `id` values must not escape the expected
asset directories when embedded into filesystem paths.

`check_registry_consistency` builds paths such as
`dashboards/<id>/dashboard.json` directly from the untrusted `id` field of a
PR-authored registry.json entry. Before this change, an id containing path
separators (e.g. `../../../../etc`) was passed straight into `os.path.join`,
turning the existence checks into a file-existence oracle for paths outside
the marketplace asset directories. `is_safe_registry_id` / the id-format
guard in `check_registry_consistency` must reject any such id up front.
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


class TestRegistryIdPathTraversalGuard:
    def test_traversal_id_is_rejected(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {
                "items": [
                    {
                        "id": "../../../../etc/passwd",
                        "type": "dashboard",
                    }
                ]
            },
        )
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        errs = _messages(r.errors)
        assert any("characters other than letters, digits" in m for m in errs), (
            f"expected a path-traversal rejection; got errors={errs}"
        )
        # The unsafe id must short-circuit before any path-based existence
        # check runs for it.
        assert not any("has no file at" in m for m in errs), (
            f"path-based check must not run for an unsafe id; got errors={errs}"
        )

    def test_absolute_path_id_is_rejected(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {"items": [{"id": "/etc/passwd", "type": "theme"}]},
        )
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        errs = _messages(r.errors)
        assert any("characters other than letters, digits" in m for m in errs), (
            f"expected a path-traversal rejection; got errors={errs}"
        )

    def test_normal_ids_are_unaffected(self, tmp_path):
        _write(
            tmp_path / "registry.json",
            {"items": [{"id": "cpu-usage_v2", "type": "dashboard"}]},
        )
        _write(tmp_path / "dashboards" / "cpu-usage_v2" / "dashboard.json", {})
        r = Results()
        _mod.check_registry_consistency(str(tmp_path), r)
        errs = _messages(r.errors)
        assert not errs, f"expected a normal id to pass cleanly; got errors={errs}"
