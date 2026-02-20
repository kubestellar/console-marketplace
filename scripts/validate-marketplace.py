#!/usr/bin/env python3
"""
Marketplace quality gate — validates card presets, dashboards, themes,
and registry.json against the kubestellar/console card registry.

Usage:
  python3 scripts/validate-marketplace.py --mode static
  python3 scripts/validate-marketplace.py --mode cross-repo --console-path ./console
  python3 scripts/validate-marketplace.py --mode full --console-path ./console

Modes:
  static      JSON schema, naming conventions, grid validity, registry consistency
  cross-repo  static + card_type existence, demo data, isDemoData wiring,
              consecutiveFailures, i18n keys, CORS proxy compliance
  full        cross-repo + downloadUrl reachability, drift detection,
              registry staleness, CNCF coverage, theme consistency
"""

import argparse
import json
import glob
import os
import re
import sys
import urllib.request
import urllib.error
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── Result tracking ──────────────────────────────────────────────────

class Results:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.info = []
        self.passes = []

    def error(self, category, msg):
        self.errors.append((category, msg))

    def warn(self, category, msg):
        self.warnings.append((category, msg))

    def note(self, category, msg):
        self.info.append((category, msg))

    def ok(self, category, msg):
        self.passes.append((category, msg))

    @property
    def exit_code(self):
        if self.errors:
            return 1
        if self.warnings:
            return 2
        return 0

    def summary_md(self):
        lines = []
        total = len(self.errors) + len(self.warnings) + len(self.passes)
        lines.append(f"### Marketplace Quality: {len(self.errors)} error(s), "
                     f"{len(self.warnings)} warning(s), {len(self.passes)} passed")
        lines.append("")
        if self.errors:
            lines.append("#### Errors")
            for cat, msg in self.errors:
                lines.append(f"- **[{cat}]** {msg}")
            lines.append("")
        if self.warnings:
            lines.append("#### Warnings")
            for cat, msg in self.warnings:
                lines.append(f"- **[{cat}]** {msg}")
            lines.append("")
        if self.info:
            lines.append("#### Info")
            for cat, msg in self.info:
                lines.append(f"- **[{cat}]** {msg}")
            lines.append("")
        return "\n".join(lines)

    def print_summary(self):
        for cat, msg in self.errors:
            print(f"  ERROR [{cat}] {msg}")
        for cat, msg in self.warnings:
            print(f"  WARN  [{cat}] {msg}")
        for cat, msg in self.info:
            print(f"  INFO  [{cat}] {msg}")
        for cat, msg in self.passes:
            print(f"  OK    [{cat}] {msg}")
        print()
        print(f"Result: {len(self.errors)} error(s), {len(self.warnings)} warning(s), "
              f"{len(self.passes)} passed")

    def to_json(self):
        return {
            "errors": [{"category": c, "message": m} for c, m in self.errors],
            "warnings": [{"category": c, "message": m} for c, m in self.warnings],
            "info": [{"category": c, "message": m} for c, m in self.info],
            "passes": [{"category": c, "message": m} for c, m in self.passes],
            "exit_code": self.exit_code,
        }


# ── JSON file loaders ────────────────────────────────────────────────

def load_json(path):
    """Load and parse a JSON file, return (data, error_msg)."""
    try:
        with open(path) as f:
            return json.load(f), None
    except json.JSONDecodeError as e:
        return None, f"Invalid JSON: {e}"
    except FileNotFoundError:
        return None, f"File not found: {path}"


def find_json_files(base, patterns):
    """Find all JSON files matching glob patterns relative to base."""
    files = []
    for pat in patterns:
        files.extend(glob.glob(os.path.join(base, pat), recursive=True))
    return sorted(set(files))


# ── Console source parsers ───────────────────────────────────────────

def parse_card_registry(registry_ts_path):
    """Extract card type keys from RAW_CARD_COMPONENTS in cardRegistry.ts."""
    with open(registry_ts_path) as f:
        content = f.read()

    card_types = set()
    in_block = False
    for line in content.split("\n"):
        if "RAW_CARD_COMPONENTS" in line and "{" in line:
            in_block = True
            continue
        if in_block and line.strip() == "}":
            break
        if in_block:
            stripped = line.strip()
            if stripped.startswith("//"):
                continue
            m = re.match(r"\s+(\w+):\s", line)
            if m:
                card_types.add(m.group(1))

    return card_types


def parse_lazy_imports(registry_ts_path):
    """Map ComponentName -> import path from lazy() calls."""
    with open(registry_ts_path) as f:
        content = f.read()

    imports = {}
    for line in content.split("\n"):
        m = re.match(r"const (\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\(['\"]\.\/([^'\"]+)['\"]\)", line)
        if m:
            imports[m.group(1)] = m.group(2)
        # Also handle bundle patterns: lazy(() => _bundle.then(...))
        m2 = re.match(r"const (\w+)\s*=\s*lazy\(\(\)\s*=>\s*_(\w+)Bundle\.then\(", line)
        if m2:
            # These use shared bundles — need the barrel import path
            pass  # Handled by bundle mapping below

    # Parse bundle imports: const _deployBundle = import('./deploy-bundle')
    bundles = {}
    for line in content.split("\n"):
        m = re.match(r"const _(\w+)\s*=\s*import\(['\"]\.\/([^'\"]+)['\"]\)", line)
        if m:
            bundles[m.group(1)] = m.group(2)

    # Map bundle component names to bundle paths
    for line in content.split("\n"):
        m = re.match(r"const (\w+)\s*=\s*lazy\(\(\)\s*=>\s*_(\w+)\.then\(", line)
        if m:
            comp_name = m.group(1)
            bundle_var = m.group(2)
            # Strip "Bundle" suffix if present
            bundle_key = bundle_var.replace("Bundle", "")
            if bundle_key in bundles:
                imports[comp_name] = bundles[bundle_key]

    return imports


def parse_card_type_to_component(registry_ts_path):
    """Map card_type -> ComponentName from RAW_CARD_COMPONENTS."""
    with open(registry_ts_path) as f:
        content = f.read()

    mapping = {}
    in_block = False
    for line in content.split("\n"):
        if "RAW_CARD_COMPONENTS" in line and "{" in line:
            in_block = True
            continue
        if in_block and line.strip() == "}":
            break
        if in_block:
            stripped = line.strip()
            if stripped.startswith("//"):
                continue
            m = re.match(r"\s+(\w+):\s*(\w+)", line)
            if m:
                mapping[m.group(1)] = m.group(2)

    return mapping


# ── Static validation checks ────────────────────────────────────────

def check_json_syntax(base, results):
    """Validate all JSON files parse correctly."""
    patterns = ["registry.json", "presets/*.json", "card-presets/*.json",
                "dashboards/*/dashboard.json", "themes/*.json"]
    files = find_json_files(base, patterns)

    for f in files:
        data, err = load_json(f)
        rel = os.path.relpath(f, base)
        if err:
            results.error("json-syntax", f"`{rel}`: {err}")
        else:
            results.ok("json-syntax", f"`{rel}` valid")


def check_preset_schema(base, results):
    """Validate card preset format."""
    files = find_json_files(base, ["presets/*.json", "card-presets/*.json"])

    for f in files:
        data, err = load_json(f)
        rel = os.path.relpath(f, base)
        if err:
            continue  # Already caught by json-syntax

        if data.get("format") != "kc-card-preset-v1":
            results.error("preset-schema", f"`{rel}`: format must be 'kc-card-preset-v1', "
                         f"got '{data.get('format')}'")

        if not data.get("card_type"):
            results.error("preset-schema", f"`{rel}`: missing or empty 'card_type'")

        if not data.get("title"):
            results.error("preset-schema", f"`{rel}`: missing or empty 'title'")


def check_dashboard_schema(base, results):
    """Validate dashboard format and grid positions."""
    files = find_json_files(base, ["dashboards/*/dashboard.json"])

    for f in files:
        data, err = load_json(f)
        rel = os.path.relpath(f, base)
        if err:
            continue

        if data.get("format") != "kc-dashboard-v1":
            results.error("dashboard-schema",
                         f"`{rel}`: format must be 'kc-dashboard-v1', got '{data.get('format')}'")

        if not data.get("name"):
            results.error("dashboard-schema", f"`{rel}`: missing 'name' field")

        cards = data.get("cards")
        if not isinstance(cards, list):
            results.error("dashboard-schema", f"`{rel}`: 'cards' must be an array")
            continue

        for i, card in enumerate(cards):
            if not card.get("card_type"):
                results.error("dashboard-schema", f"`{rel}` cards[{i}]: missing 'card_type'")

            pos = card.get("position")
            if not isinstance(pos, dict):
                results.error("dashboard-schema", f"`{rel}` cards[{i}]: missing 'position'")
                continue

            for key in ("x", "y", "w", "h"):
                if key not in pos:
                    results.error("dashboard-schema",
                                 f"`{rel}` cards[{i}]: position missing '{key}'")

            x = pos.get("x", 0)
            w = pos.get("w", 0)
            if isinstance(x, (int, float)) and isinstance(w, (int, float)):
                if x + w > 12:
                    results.error("dashboard-grid",
                                 f"`{rel}` cards[{i}] ({card.get('card_type', '?')}): "
                                 f"x({x}) + w({w}) = {x+w} > 12 (grid overflow)")


def check_theme_schema(base, results):
    """Validate theme JSON structure."""
    files = find_json_files(base, ["themes/*.json"])

    required_top = {"id", "name", "dark"}
    required_colors = {
        "background", "foreground", "card", "primary", "secondary",
        "muted", "accent", "destructive", "border", "input", "ring",
    }
    required_brand = {"brandPrimary"}

    for f in files:
        data, err = load_json(f)
        rel = os.path.relpath(f, base)
        if err:
            continue

        for key in required_top:
            if key not in data:
                results.error("theme-schema", f"`{rel}`: missing required key '{key}'")

        colors = data.get("colors", {})
        if not isinstance(colors, dict):
            results.error("theme-schema", f"`{rel}`: 'colors' must be an object")
            continue

        for key in required_colors:
            if key not in colors:
                results.error("theme-schema", f"`{rel}`: colors missing '{key}'")

        for key in required_brand:
            if key not in colors:
                results.warn("theme-schema", f"`{rel}`: colors missing '{key}'")

        chart = colors.get("chartColors")
        if not isinstance(chart, list) or len(chart) < 4:
            results.warn("theme-schema",
                        f"`{rel}`: chartColors should be an array with >= 4 colors")

        font = data.get("font", {})
        if isinstance(font, dict):
            if not font.get("family"):
                results.warn("theme-schema", f"`{rel}`: font.family is missing")
            if not font.get("monoFamily"):
                results.warn("theme-schema", f"`{rel}`: font.monoFamily is missing")


def check_naming_conventions(base, results):
    """All card_type values must use snake_case (underscores, not hyphens)."""
    files = find_json_files(base, ["presets/*.json", "card-presets/*.json",
                                    "dashboards/*/dashboard.json"])
    for f in files:
        data, err = load_json(f)
        rel = os.path.relpath(f, base)
        if err:
            continue

        # Get card_type values
        card_types = []
        if "card_type" in data:
            card_types.append(data["card_type"])
        for card in data.get("cards", []):
            if "card_type" in card:
                card_types.append(card["card_type"])

        for ct in card_types:
            if "-" in ct:
                suggested = ct.replace("-", "_")
                results.error("naming",
                             f"`{rel}`: card_type '{ct}' uses hyphens — "
                             f"must be snake_case: '{suggested}'")


def check_registry_consistency(base, results):
    """Validate registry.json entries match actual files."""
    data, err = load_json(os.path.join(base, "registry.json"))
    if err:
        results.error("registry", f"registry.json: {err}")
        return

    items = data.get("items", [])
    seen_ids = set()

    for item in items:
        item_id = item.get("id", "<no-id>")
        item_type = item.get("type", "<no-type>")

        # Duplicate ID check
        if item_id in seen_ids:
            results.error("registry", f"Duplicate id '{item_id}' in registry.json")
        seen_ids.add(item_id)

        # File existence check based on type
        if item_type == "dashboard":
            expected = os.path.join(base, "dashboards", item_id, "dashboard.json")
            if not os.path.isfile(expected):
                results.error("registry",
                             f"Registry entry '{item_id}' (dashboard) has no file at "
                             f"dashboards/{item_id}/dashboard.json")
        elif item_type == "card-preset":
            # Could be in presets/ or card-presets/
            candidates = [
                os.path.join(base, "presets", f"{item_id}.json"),
                os.path.join(base, "card-presets", f"{item_id}.json"),
            ]
            if not any(os.path.isfile(c) for c in candidates):
                results.error("registry",
                             f"Registry entry '{item_id}' (card-preset) has no file in "
                             f"presets/ or card-presets/")
        elif item_type == "theme":
            expected = os.path.join(base, "themes", f"{item_id}.json")
            if not os.path.isfile(expected):
                results.error("registry",
                             f"Registry entry '{item_id}' (theme) has no file at "
                             f"themes/{item_id}.json")

        # downloadUrl path check
        url = item.get("downloadUrl", "")
        if url:
            # Extract path after /main/
            m = re.search(r"/main/(.+)$", url)
            if m:
                url_path = m.group(1)
                if not os.path.isfile(os.path.join(base, url_path)):
                    results.error("registry",
                                 f"Registry '{item_id}': downloadUrl path '{url_path}' "
                                 f"does not match any file")

    results.ok("registry", f"Checked {len(items)} registry entries, {len(seen_ids)} unique IDs")


# ── Cross-repo checks (require console checkout) ────────────────────

def get_all_marketplace_card_types(base):
    """Collect all card_type values referenced in marketplace JSON."""
    card_types = set()
    files = find_json_files(base, ["presets/*.json", "card-presets/*.json",
                                    "dashboards/*/dashboard.json"])
    for f in files:
        data, err = load_json(f)
        if err:
            continue
        if "card_type" in data:
            card_types.add(data["card_type"])
        for card in data.get("cards", []):
            if "card_type" in card:
                card_types.add(card["card_type"])
    return card_types


def check_card_type_existence(base, console_path, results):
    """Check that marketplace card_types exist in console's card registry."""
    registry_ts = os.path.join(console_path, "web/src/components/cards/cardRegistry.ts")
    if not os.path.isfile(registry_ts):
        results.error("card-type", f"Console card registry not found at {registry_ts}")
        return set()

    console_types = parse_card_registry(registry_ts)
    marketplace_types = get_all_marketplace_card_types(base)

    known = set()
    for ct in sorted(marketplace_types):
        if ct in console_types:
            results.ok("card-type", f"`{ct}` exists in console registry")
            known.add(ct)
        elif ct.endswith("_status"):
            # CNCF dynamic card pattern — warn, don't fail
            results.warn("card-type",
                        f"`{ct}` not in console registry (expected CNCF dynamic card)")
            known.add(ct)
        else:
            results.error("card-type",
                         f"`{ct}` not found in console registry (not a recognized card type)")

    return known


def check_demo_data(base, console_path, known_types, results):
    """Check that each known card_type has a demoData.ts file in console."""
    registry_ts = os.path.join(console_path, "web/src/components/cards/cardRegistry.ts")
    type_to_comp = parse_card_type_to_component(registry_ts)
    lazy_imports = parse_lazy_imports(registry_ts)
    cards_dir = os.path.join(console_path, "web/src/components/cards")

    for ct in sorted(known_types):
        comp_name = type_to_comp.get(ct)
        if not comp_name:
            continue  # CNCF dynamic cards won't have a mapping

        import_path = lazy_imports.get(comp_name)
        if not import_path:
            continue

        # Check for demoData.ts in the component directory
        # import_path could be "./PodIssues" or "./deploy-bundle"
        comp_dir = os.path.join(cards_dir, import_path)
        demo_files = [
            os.path.join(comp_dir, "demoData.ts"),
            os.path.join(comp_dir, "demoData.tsx"),
        ]

        # Also check if it's a single file (not directory)
        if os.path.isdir(comp_dir):
            if any(os.path.isfile(df) for df in demo_files):
                results.ok("demo-data", f"`{ct}` has demoData.ts")
            else:
                results.warn("demo-data", f"`{ct}` ({comp_name}) missing demoData.ts "
                            f"in {os.path.relpath(comp_dir, console_path)}")


def check_is_demo_data_wiring(base, console_path, known_types, results):
    """Check that card components wire isDemoData through useCardLoadingState."""
    registry_ts = os.path.join(console_path, "web/src/components/cards/cardRegistry.ts")
    type_to_comp = parse_card_type_to_component(registry_ts)
    lazy_imports = parse_lazy_imports(registry_ts)
    cards_dir = os.path.join(console_path, "web/src/components/cards")

    for ct in sorted(known_types):
        comp_name = type_to_comp.get(ct)
        if not comp_name:
            continue

        import_path = lazy_imports.get(comp_name)
        if not import_path:
            continue

        comp_dir = os.path.join(cards_dir, import_path)
        if not os.path.isdir(comp_dir):
            continue

        # Read the main component file (index.ts/tsx or ComponentName.tsx)
        main_files = glob.glob(os.path.join(comp_dir, "*.tsx")) + \
                     glob.glob(os.path.join(comp_dir, "*.ts"))

        found_loading_state = False
        has_is_demo_data = False

        for mf in main_files:
            if mf.endswith(".test.tsx") or mf.endswith(".test.ts"):
                continue
            if "demoData" in os.path.basename(mf):
                continue
            try:
                with open(mf) as f:
                    content = f.read()
            except Exception:
                continue

            if "useCardLoadingState" in content:
                found_loading_state = True
                # Check if isDemoData is passed
                if re.search(r"useCardLoadingState\([^)]*isDemoData", content):
                    has_is_demo_data = True
                # Also check useReportCardDataState pattern
                if re.search(r"useReportCardDataState\([^)]*isDemoData", content):
                    has_is_demo_data = True

        if found_loading_state and not has_is_demo_data:
            results.warn("isDemoData",
                        f"`{ct}` ({comp_name}) calls useCardLoadingState but "
                        f"does not pass isDemoData")


def check_consecutive_failures(base, console_path, known_types, results):
    """Check that card components forward consecutiveFailures."""
    registry_ts = os.path.join(console_path, "web/src/components/cards/cardRegistry.ts")
    type_to_comp = parse_card_type_to_component(registry_ts)
    lazy_imports = parse_lazy_imports(registry_ts)
    cards_dir = os.path.join(console_path, "web/src/components/cards")

    for ct in sorted(known_types):
        comp_name = type_to_comp.get(ct)
        if not comp_name:
            continue

        import_path = lazy_imports.get(comp_name)
        if not import_path:
            continue

        comp_dir = os.path.join(cards_dir, import_path)
        if not os.path.isdir(comp_dir):
            continue

        main_files = glob.glob(os.path.join(comp_dir, "*.tsx")) + \
                     glob.glob(os.path.join(comp_dir, "*.ts"))

        uses_cached = False
        has_failures = False

        for mf in main_files:
            if mf.endswith(".test.tsx") or mf.endswith(".test.ts"):
                continue
            if "demoData" in os.path.basename(mf):
                continue
            try:
                with open(mf) as f:
                    content = f.read()
            except Exception:
                continue

            if re.search(r"useCached\w+", content):
                uses_cached = True
            if "consecutiveFailures" in content:
                has_failures = True

        if uses_cached and not has_failures:
            results.warn("consecutiveFailures",
                        f"`{ct}` ({comp_name}) uses useCached* hook but does not "
                        f"reference consecutiveFailures")


def check_i18n_keys(base, console_path, known_types, results):
    """Check that marketplace card_types have i18n translation keys."""
    cards_json_path = os.path.join(console_path, "web/src/locales/en/cards.json")
    if not os.path.isfile(cards_json_path):
        results.warn("i18n", "Console cards.json not found — skipping i18n check")
        return

    data, err = load_json(cards_json_path)
    if err:
        results.warn("i18n", f"Failed to parse cards.json: {err}")
        return

    # Flatten keys — cards.json may be nested
    all_keys = set()

    def flatten(obj, prefix=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                flatten(v, f"{prefix}{k}." if prefix else f"{k}.")
        else:
            all_keys.add(prefix.rstrip("."))

    flatten(data)

    # Also add top-level keys
    if isinstance(data, dict):
        all_keys.update(data.keys())

    for ct in sorted(known_types):
        # Check for the card_type as a key or prefix
        has_key = any(k == ct or k.startswith(f"{ct}.") or k.startswith(f"{ct}_")
                      for k in all_keys)
        if not has_key:
            results.warn("i18n", f"`{ct}` has no translation keys in cards.json")


def check_cors_proxy(base, console_path, known_types, results):
    """Check that card hooks don't make direct external fetch calls."""
    hooks_dir = os.path.join(console_path, "web/src/hooks")
    if not os.path.isdir(hooks_dir):
        results.warn("cors", "Console hooks directory not found — skipping CORS check")
        return

    # Scan all hook files for direct external fetch
    hook_files = glob.glob(os.path.join(hooks_dir, "**/*.ts"), recursive=True) + \
                 glob.glob(os.path.join(hooks_dir, "**/*.tsx"), recursive=True)

    for hf in hook_files:
        try:
            with open(hf) as f:
                content = f.read()
        except Exception:
            continue

        rel = os.path.relpath(hf, console_path)

        # Check for direct external fetch (not through proxy)
        patterns = [
            r"""fetch\(\s*['"`]https?://(?!localhost|127\.0\.0\.1)""",
            r"""axios\.\w+\(\s*['"`]https?://(?!localhost|127\.0\.0\.1)""",
        ]
        for pat in patterns:
            matches = re.findall(pat, content)
            if matches:
                results.warn("cors",
                            f"`{rel}` contains direct external fetch — "
                            f"should use backend proxy `/api/proxy/`")


# ── Nightly-only checks ─────────────────────────────────────────────

def check_download_urls(base, results):
    """HTTP HEAD to each downloadUrl in registry.json."""
    data, err = load_json(os.path.join(base, "registry.json"))
    if err:
        return

    for item in data.get("items", []):
        url = item.get("downloadUrl", "")
        item_id = item.get("id", "?")
        if not url:
            results.warn("download-url", f"'{item_id}' has no downloadUrl")
            continue

        try:
            req = urllib.request.Request(url, method="HEAD")
            resp = urllib.request.urlopen(req, timeout=10)
            if resp.status == 200:
                results.ok("download-url", f"'{item_id}' URL OK (200)")
            else:
                results.warn("download-url",
                            f"'{item_id}' URL returned {resp.status}: {url}")
        except urllib.error.HTTPError as e:
            results.error("download-url",
                         f"'{item_id}' URL returned {e.code}: {url}")
        except Exception as e:
            results.warn("download-url",
                        f"'{item_id}' URL unreachable: {e}")


def check_registry_staleness(base, results):
    """Check that registry.json updatedAt is within 30 days."""
    data, err = load_json(os.path.join(base, "registry.json"))
    if err:
        return

    updated_at = data.get("updatedAt", "")
    if not updated_at:
        results.warn("staleness", "registry.json missing 'updatedAt' field")
        return

    try:
        dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        age = datetime.now(timezone.utc) - dt
        if age > timedelta(days=30):
            results.warn("staleness",
                        f"registry.json updatedAt is {age.days} days old "
                        f"({updated_at}) — consider updating")
        else:
            results.ok("staleness", f"registry.json updatedAt is {age.days} days old")
    except ValueError:
        results.warn("staleness", f"registry.json updatedAt is not valid ISO: '{updated_at}'")


def check_theme_consistency(base, results):
    """All themes must define the same set of color keys."""
    files = find_json_files(base, ["themes/*.json"])
    if len(files) < 2:
        results.note("theme-consistency", "Only one theme found — nothing to compare")
        return

    theme_keys = {}
    for f in sorted(files):
        data, err = load_json(f)
        rel = os.path.relpath(f, base)
        if err:
            continue
        colors = data.get("colors", {})
        theme_keys[rel] = set(colors.keys())

    # Compare all themes against the first
    ref_name = list(theme_keys.keys())[0]
    ref_keys = theme_keys[ref_name]

    for name, keys in theme_keys.items():
        if name == ref_name:
            continue
        missing = ref_keys - keys
        extra = keys - ref_keys
        if missing:
            results.warn("theme-consistency",
                        f"`{name}` missing color keys present in `{ref_name}`: "
                        f"{', '.join(sorted(missing))}")
        if extra:
            results.note("theme-consistency",
                        f"`{name}` has extra color keys not in `{ref_name}`: "
                        f"{', '.join(sorted(extra))}")


def check_cncf_coverage(base, console_path, results):
    """Flag CNCF presets without console implementations."""
    console_types = set()
    registry_ts = os.path.join(console_path, "web/src/components/cards/cardRegistry.ts")
    if os.path.isfile(registry_ts):
        console_types = parse_card_registry(registry_ts)

    cncf_files = find_json_files(base, ["presets/cncf-*.json"])
    missing = []
    for f in cncf_files:
        data, err = load_json(f)
        if err:
            continue
        ct = data.get("card_type", "")
        if ct and ct not in console_types:
            missing.append(ct)

    if missing:
        results.note("cncf-coverage",
                    f"{len(missing)} CNCF presets reference unimplemented card types: "
                    f"{', '.join(sorted(missing)[:10])}"
                    f"{'...' if len(missing) > 10 else ''}")
    else:
        results.ok("cncf-coverage", "All CNCF presets map to console card types")


# ── Card quality summary table ───────────────────────────────────────

def generate_quality_table(base, console_path, known_types, results):
    """Generate markdown summary table for card quality."""
    if not console_path:
        return ""

    registry_ts = os.path.join(console_path, "web/src/components/cards/cardRegistry.ts")
    if not os.path.isfile(registry_ts):
        return ""

    console_types = parse_card_registry(registry_ts)
    marketplace_types = get_all_marketplace_card_types(base)

    lines = [
        "### Card Quality Matrix",
        "",
        "| card_type | in_console | demo_data | isDemoData | failures | i18n |",
        "|-----------|:----------:|:---------:|:----------:|:--------:|:----:|",
    ]

    # Collect results by card_type
    for ct in sorted(marketplace_types):
        exists = "Y" if ct in console_types else ("~" if ct.endswith("_status") else "N")

        # Check for related warnings/errors in results
        def has_issue(category):
            return any(ct in msg for cat, msg in results.warnings + results.errors
                      if cat == category)

        demo = "N" if has_issue("demo-data") else ("Y" if ct in console_types else "-")
        is_demo = "N" if has_issue("isDemoData") else ("Y" if ct in console_types else "-")
        failures = "N" if has_issue("consecutiveFailures") else \
                   ("Y" if ct in console_types else "-")
        i18n = "N" if has_issue("i18n") else ("Y" if ct in console_types else "-")

        lines.append(f"| `{ct}` | {exists} | {demo} | {is_demo} | {failures} | {i18n} |")

    lines.append("")
    lines.append("Key: Y=pass, N=issue found, ~=dynamic card (expected), -=not applicable")
    return "\n".join(lines)


# ── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Marketplace quality gate")
    parser.add_argument("--mode", choices=["static", "cross-repo", "full"],
                       default="static", help="Validation mode")
    parser.add_argument("--console-path", help="Path to console repo checkout")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--github-summary", help="Append markdown to this file")
    parser.add_argument("--marketplace-path", default=".",
                       help="Path to marketplace repo (default: current directory)")
    args = parser.parse_args()

    base = os.path.abspath(args.marketplace_path)
    results = Results()

    if args.mode in ("cross-repo", "full") and not args.console_path:
        print("ERROR: --console-path is required for cross-repo and full modes")
        sys.exit(1)

    console_path = os.path.abspath(args.console_path) if args.console_path else None

    # When --json is used, send verbose progress to stderr so stdout is clean JSON
    log = (lambda msg: print(msg, file=sys.stderr)) if args.json else print

    # ── Static checks (all modes) ──
    log("=== Static Validation ===")
    check_json_syntax(base, results)
    check_preset_schema(base, results)
    check_dashboard_schema(base, results)
    check_theme_schema(base, results)
    check_naming_conventions(base, results)
    check_registry_consistency(base, results)

    # ── Cross-repo checks ──
    known_types = set()
    if args.mode in ("cross-repo", "full") and console_path:
        log("\n=== Cross-Repo Quality Checks ===")
        known_types = check_card_type_existence(base, console_path, results)
        check_demo_data(base, console_path, known_types, results)
        check_is_demo_data_wiring(base, console_path, known_types, results)
        check_consecutive_failures(base, console_path, known_types, results)
        check_i18n_keys(base, console_path, known_types, results)
        check_cors_proxy(base, console_path, known_types, results)

    # ── Nightly-only checks ──
    if args.mode == "full":
        log("\n=== Nightly Checks ===")
        check_download_urls(base, results)
        check_registry_staleness(base, results)
        check_theme_consistency(base, results)
        if console_path:
            check_cncf_coverage(base, console_path, results)

    # ── Output ──
    if args.json:
        print(json.dumps(results.to_json(), indent=2))
    else:
        results.print_summary()

    if args.github_summary:
        with open(args.github_summary, "a") as f:
            f.write(results.summary_md())
            if args.mode in ("cross-repo", "full") and console_path:
                table = generate_quality_table(base, console_path, known_types, results)
                if table:
                    f.write("\n" + table + "\n")

    sys.exit(results.exit_code)


if __name__ == "__main__":
    main()
