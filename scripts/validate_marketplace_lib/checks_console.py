"""Console cross-repo consistency checks for the marketplace quality gate.

Extracted from scripts/validate_marketplace.py (see issue #670).
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
    console_types = get_all_console_card_types(cards_dir, results=results)
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


def _load_registry_maps(registry_ts, category, results):
    """Load the component/import maps from cardRegistry.ts, guarded.

    `check_card_type_existence` already degrades to a recorded error (not a
    crash) when `cardRegistry.ts` is missing, but each of the three checks
    below used to call `parse_card_type_to_component`/`parse_lazy_imports`
    unconditionally — re-opening the very same file with no guard. With an
    empty `known_types` (the result of that degraded path) the per-type
    loop never runs, but the unguarded open above it still raised,
    defeating the degrade-not-crash fix before the loop was ever reached.
    Returns `(None, None)` when the file is missing or unreadable, after
    recording a warning; callers should skip their check in that case.
    `results` is required here — unlike the optional `results=None`
    convention in `ts_parsing.py`, every caller of this helper already
    has a `Results` instance in hand.
    """
    if not os.path.isfile(registry_ts):
        results.warn(category,
                    f"could not read console card registry at "
                    f"`{registry_ts}` — skipping this check")
        return None, None
    try:
        return parse_card_type_to_component(registry_ts), parse_lazy_imports(registry_ts)
    except OSError as e:
        results.warn(category,
                    f"could not read console card registry at "
                    f"`{registry_ts}`: {e} — skipping this check")
        return None, None


def check_demo_data(base, console_path, known_types, results):
    """Check that each known card_type has a demoData.ts file in console."""
    registry_ts = os.path.join(console_path, "web/src/components/cards/cardRegistry.ts")
    type_to_comp, lazy_imports = _load_registry_maps(registry_ts, "demo-data", results)
    if type_to_comp is None:
        return
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


def _check_component_wiring(base, console_path, known_types, results, *,
                            category, trigger, satisfies, message):
    """Shared skeleton for "does this card component wire hook output X
    through to prop Y" checks.

    `check_is_demo_data_wiring` and `check_consecutive_failures` used to
    each re-implement this file-scanning loop independently (jscpd flagged
    a 17-line exact clone between them). Both now delegate here, supplying
    only what differs: the warning `category`, a `trigger(content) -> bool`
    predicate for "this file uses the hook at all", a
    `satisfies(content) -> bool` predicate for "the required wiring is
    present", and a `message(card_type, comp_name) -> str` builder for the
    warning text emitted when `trigger` is true and `satisfies` is false.
    """
    registry_ts = os.path.join(console_path, "web/src/components/cards/cardRegistry.ts")
    type_to_comp, lazy_imports = _load_registry_maps(registry_ts, category, results)
    if type_to_comp is None:
        return
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

        triggered = False
        satisfied = False

        for mf in main_files:
            if mf.endswith(".test.tsx") or mf.endswith(".test.ts"):
                continue
            if "demoData" in os.path.basename(mf):
                continue
            try:
                with open(mf) as f:
                    content = f.read()
            except Exception as e:
                results.warn(category,
                            f"could not read `{os.path.relpath(mf, console_path)}`: {e}")
                continue

            if trigger(content):
                triggered = True
            if satisfies(content):
                satisfied = True

        if triggered and not satisfied:
            results.warn(category, message(ct, comp_name))


def check_is_demo_data_wiring(base, console_path, known_types, results):
    """Check that card components wire isDemoData through useCardLoadingState."""
    _check_component_wiring(
        base, console_path, known_types, results,
        category="isDemoData",
        trigger=lambda content: "useCardLoadingState" in content,
        # Check if isDemoData is passed to useCardLoadingState, or to the
        # useReportCardDataState pattern.
        satisfies=lambda content: bool(
            re.search(r"useCardLoadingState\([^)]*isDemoData", content) or
            re.search(r"useReportCardDataState\([^)]*isDemoData", content)
        ),
        message=lambda ct, comp_name: (
            f"`{ct}` ({comp_name}) calls useCardLoadingState but "
            f"does not pass isDemoData"
        ),
    )


def check_consecutive_failures(base, console_path, known_types, results):
    """Check that card components forward consecutiveFailures."""
    _check_component_wiring(
        base, console_path, known_types, results,
        category="consecutiveFailures",
        trigger=lambda content: bool(re.search(r"useCached\w+", content)),
        satisfies=lambda content: "consecutiveFailures" in content,
        message=lambda ct, comp_name: (
            f"`{ct}` ({comp_name}) uses useCached* hook but does not "
            f"reference consecutiveFailures"
        ),
    )


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
            rel = os.path.relpath(hf, rel_root)
            try:
                with open(hf) as f:
                    content = f.read()
            except Exception as e:
                results.warn("cors", f"could not read `{rel}`: {e}")
                continue

            for pat in patterns:
                matches = re.findall(pat, content)
                if matches:
                    results.warn("cors",
                                f"`{rel}` contains direct external fetch — "
                                f"should use backend proxy `/api/proxy/`")
