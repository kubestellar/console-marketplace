"""JSON schema / structure checks for the marketplace quality gate.

Extracted from scripts/validate-marketplace.py (see issue #670).
"""
import os
import re

from .ts_parsing import find_json_files, load_json


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


def get_registry_entries(data):
    """Return all registry entries from both items and presets arrays."""
    return data.get("items", []) + data.get("presets", [])


def check_registry_consistency(base, results):
    """Validate registry.json entries match actual files."""
    data, err = load_json(os.path.join(base, "registry.json"))
    if err:
        results.error("registry", f"registry.json: {err}")
        return

    entries = get_registry_entries(data)
    seen_ids = set()

    for item in entries:
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

    results.ok("registry", f"Checked {len(entries)} registry entries, {len(seen_ids)} unique IDs")


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
