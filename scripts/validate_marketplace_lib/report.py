"""Quality table generation and theme/registry/CNCF drift reports.

Extracted from scripts/validate-marketplace.py (see issue #670).
"""
import os
from datetime import datetime, timezone, timedelta

from .ts_parsing import find_json_files, get_all_console_card_types, load_json
from .checks_schema import get_all_marketplace_card_types, get_registry_entries


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
    cards_dir = os.path.join(console_path, "web/src/components/cards")
    registry_ts = os.path.join(cards_dir, "cardRegistry.ts")
    if os.path.isfile(registry_ts):
        console_types = get_all_console_card_types(cards_dir)

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


def generate_quality_table(base, console_path, known_types, results):
    """Generate markdown summary table for card quality."""
    if not console_path:
        return ""

    registry_ts = os.path.join(console_path, "web/src/components/cards/cardRegistry.ts")
    if not os.path.isfile(registry_ts):
        return ""

    cards_dir = os.path.join(console_path, "web/src/components/cards")
    console_types = get_all_console_card_types(cards_dir)
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
