"""Console cross-repo consistency checks for the marketplace quality gate.

Extracted from scripts/validate-marketplace.py (see issue #670).
"""
import glob
import os
import re

from .checks_schema import get_all_marketplace_card_types
from .ts_parsing import (
    get_all_console_card_types,
    load_json,
    parse_card_type_to_component,
    parse_lazy_imports,
)


def check_card_type_existence(base, console_path, results):
    """Check that marketplace card_types exist in console's card registry."""
    registry_ts = os.path.join(console_path, "web/src/components/cards/cardRegistry.ts")
    cards_dir = os.path.join(console_path, "web/src/components/cards")
    if not os.path.isfile(registry_ts):
        results.error("card-type", f"Console card registry not found at {registry_ts}")
        return set()

    # Merge all registry sources: legacy RAW_CARD_COMPONENTS, descriptor-based
    # registry, and the newer CardRegistryCategory sub-files.
    console_types = get_all_console_card_types(cards_dir)
    marketplace_types = get_all_marketplace_card_types(base)

    known = set()
    for ct in sorted(marketplace_types):
        if ct in console_types:
            results.ok("card-type", f"`{ct}` exists in console registry")
            known.add(ct)
        elif ct.endswith("_status"):
            # CNCF dynamic card pattern — placeholder awaiting dedicated implementation
            results.ok("card-type",
                        f"`{ct}` recognized as CNCF dynamic card placeholder")
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
    marketplace_cards_json_path = os.path.join(base, "web/src/locales/en/cards.json")

    if not os.path.isfile(cards_json_path) and not os.path.isfile(marketplace_cards_json_path):
        results.warn("i18n", "Console cards.json not found — skipping i18n check")
        return

    # Flatten keys — cards.json may be nested
    all_keys = set()

    def flatten(obj, prefix=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                flatten(v, f"{prefix}{k}." if prefix else f"{k}.")
        else:
            all_keys.add(prefix.rstrip("."))

    def load_keys_from(path):
        data, err = load_json(path)
        if err:
            results.warn("i18n", f"Failed to parse {os.path.basename(path)}: {err}")
            return
        flatten(data)
        if isinstance(data, dict):
            all_keys.update(data.keys())

    if os.path.isfile(cards_json_path):
        load_keys_from(cards_json_path)

    # Also merge marketplace-local translations so marketplace repo can
    # self-document i18n keys without requiring console changes
    if os.path.isfile(marketplace_cards_json_path):
        load_keys_from(marketplace_cards_json_path)

    for ct in sorted(known_types):
        # Check for the card_type as a key or prefix
        has_key = any(k == ct or k.startswith(f"{ct}.") or k.startswith(f"{ct}_")
                      for k in all_keys)
        if not has_key:
            results.warn("i18n", f"`{ct}` has no translation keys in cards.json")


def check_cors_proxy(base, console_path, known_types, results):
    """Check that marketplace hooks don't make direct external fetch calls."""
    # Only scan the marketplace's own hooks directory; the console repo is an
    # external dependency with its own CI/QA and is outside marketplace control.
    scan_roots = []

    marketplace_hooks = os.path.join(base, "web/src/hooks")
    if os.path.isdir(marketplace_hooks):
        scan_roots.append((marketplace_hooks, base))

    if not scan_roots:
        results.warn("cors", "No hooks directory found — skipping CORS check")
        return

    # Check for direct external fetch (not through proxy)
    patterns = [
        r"""fetch\(\s*['"`]https?://(?!localhost|127\.0\.0\.1)""",
        r"""axios\.\w+\(\s*['"`]https?://(?!localhost|127\.0\.0\.1)""",
    ]

    for hooks_dir, rel_root in scan_roots:
        hook_files = glob.glob(os.path.join(hooks_dir, "**/*.ts"), recursive=True) + \
                     glob.glob(os.path.join(hooks_dir, "**/*.tsx"), recursive=True)

        for hf in hook_files:
            try:
                with open(hf) as f:
                    content = f.read()
            except Exception:
                continue

            rel = os.path.relpath(hf, rel_root)

            for pat in patterns:
                matches = re.findall(pat, content)
                if matches:
                    results.warn("cors",
                                f"`{rel}` contains direct external fetch — "
                                f"should use backend proxy `/api/proxy/`")
