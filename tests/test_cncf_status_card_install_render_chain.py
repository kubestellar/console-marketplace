"""Install -> render chain checks for six CNCF status cards (issue #914).

A Playwright e2e that renders these cards in the live console shell belongs in
kubestellar/console. This module covers the marketplace-side half of that
path: registry entry -> preset file -> card_type -> shipped card component
(index.tsx exporting the component) -> component-level tests. A break in any
link means the installed preset can never render.
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from tests.repo_paths import REPO_ROOT, load_registry

CARDS_DIR = REPO_ROOT / "web" / "src" / "components" / "cards"
RAW_URL_RE = re.compile(
    r"^https://raw\.githubusercontent\.com/kubestellar/console-marketplace/[0-9a-f]{40}/(?P<path>.+)$"
)

# registry id -> (preset path, component export name)
SIX_CARDS = {
    "cncf-buildpacks": ("presets/cncf-buildpacks.json", "BuildpacksStatus"),
    "cncf-coredns": ("presets/cncf-coredns.json", "CoreDNSStatus"),
    "cncf-kubeflow": ("presets/cncf-kubeflow.json", "KubeflowStatus"),
    "kubeflow-monitoring": ("card-presets/kubeflow-monitoring.json", "KubeflowStatus"),
    "cncf-notary": ("presets/cncf-notary.json", "NotaryStatus"),
    "cncf-openkruise": ("presets/cncf-openkruise.json", "OpenKruiseStatus"),
    "cncf-openyurt": ("presets/cncf-openyurt.json", "OpenYurtStatus"),
}


def _card_dir(card_type: str) -> Path:
    """Card dirs are named with either `_` or `-` (e.g. buildpacks-status)."""
    for name in (card_type, card_type.replace("_", "-")):
        candidate = CARDS_DIR / name
        if (candidate / "index.tsx").is_file():
            return candidate
    return CARDS_DIR / card_type


class TestSixStatusCardsInstallRenderChain(unittest.TestCase):
    def setUp(self) -> None:
        self.entries = {e["id"]: e for e in load_registry()["presets"]}

    def test_registry_entries_exist_and_point_at_preset_files(self) -> None:
        for entry_id, (preset_path, _) in SIX_CARDS.items():
            with self.subTest(entry=entry_id):
                self.assertIn(entry_id, self.entries)
                entry = self.entries[entry_id]
                self.assertEqual(entry["type"], "card-preset")
                match = RAW_URL_RE.match(entry["downloadUrl"])
                self.assertIsNotNone(match, entry["downloadUrl"])
                self.assertEqual(match.group("path"), preset_path)
                self.assertTrue((REPO_ROOT / preset_path).is_file())

    def test_preset_card_type_resolves_to_shipped_component(self) -> None:
        for entry_id, (preset_path, component) in SIX_CARDS.items():
            with self.subTest(entry=entry_id):
                preset = json.loads((REPO_ROOT / preset_path).read_text())
                self.assertEqual(preset["format"], "kc-card-preset-v1")
                card_type = preset["card_type"]
                self.assertTrue(card_type.endswith("_status"), card_type)
                card_dir = _card_dir(card_type)
                index = card_dir / "index.tsx"
                self.assertTrue(index.is_file(), f"no card dir for {card_type}")
                self.assertRegex(
                    index.read_text(),
                    rf"export function {component}\b",
                    f"{index} must export {component}",
                )

    def test_each_card_has_component_render_test(self) -> None:
        for entry_id, (preset_path, component) in SIX_CARDS.items():
            with self.subTest(entry=entry_id):
                preset = json.loads((REPO_ROOT / preset_path).read_text())
                card_dir = _card_dir(preset["card_type"])
                tests = list(card_dir.rglob("*.test.tsx"))
                self.assertTrue(
                    any(component in t.read_text() for t in tests),
                    f"no .test.tsx under {card_dir} references {component}",
                )


if __name__ == "__main__":
    unittest.main()
