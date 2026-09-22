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


def dashboard_field_issues(data):
    """Return the shared "is this a valid dashboard document" facts for `data`.

    Single source of truth for the `format`/`name`/`cards` checks that used to
    be duplicated across `checks_schema.check_dashboard_schema`,
    `validate_json_summary.py`, and `validate-json.yml` (see issue #789).
    Returns a dict with keys `format_ok`, `name_ok`, `cards` (the cards list,
    or None if `cards` is missing/not a list) so each caller can keep its own
    message wording/severity.
    """
    cards = data.get("cards")
    return {
        "format_ok": data.get("format") == "kc-dashboard-v1",
        "name_ok": bool(data.get("name")),
        "cards": cards if isinstance(cards, list) else None,
    }


def card_field_issues(card):
    """Return which required per-card fields are missing on `card`.

    Shared by every dashboard-schema check site: `card_type` must be
    non-empty and `position` must be an object. Returns a dict with
    `card_type_ok` and `position` (the position dict, or None if missing).
    """
    pos = card.get("position")
    return {
        "card_type_ok": bool(card.get("card_type")),
        "position": pos if isinstance(pos, dict) else None,
    }


def grid_overflow(pos):
    """Return True if position `pos` overflows the 12-column grid."""
    x = pos.get("x", 0)
    w = pos.get("w", 0)
    if isinstance(x, (int, float)) and isinstance(w, (int, float)):
        return x + w > 12
    return False


def check_dashboard_schema(base, results):
    """Validate dashboard format and grid positions."""
    files = find_json_files(base, ["dashboards/*/dashboard.json"])

    for f in files:
        data, err = load_json(f)
        rel = os.path.relpath(f, base)
        if err:
            continue

        issues = dashboard_field_issues(data)

        if not issues["format_ok"]:
            results.error("dashboard-schema",
                         f"`{rel}`: format must be 'kc-dashboard-v1', got '{data.get('format')}'")

        if not issues["name_ok"]:
            results.error("dashboard-schema", f"`{rel}`: missing 'name' field")

        cards = issues["cards"]
        if cards is None:
            results.error("dashboard-schema", f"`{rel}`: 'cards' must be an array")
            continue

        for i, card in enumerate(cards):
            card_issues = card_field_issues(card)

            if not card_issues["card_type_ok"]:
                results.error("dashboard-schema", f"`{rel}` cards[{i}]: missing 'card_type'")

            pos = card_issues["position"]
            if pos is None:
                results.error("dashboard-schema", f"`{rel}` cards[{i}]: missing 'position'")
                continue

            for key in ("x", "y", "w", "h"):
                if key not in pos:
                    results.error("dashboard-schema",
                                 f"`{rel}` cards[{i}]: position missing '{key}'")

            if grid_overflow(pos):
                results.error("dashboard-grid",
                             f"`{rel}` cards[{i}] ({card.get('card_type', '?')}): "
                             f"x({pos.get('x', 0)}) + w({pos.get('w', 0)}) = "
                             f"{pos.get('x', 0)+pos.get('w', 0)} > 12 (grid overflow)")


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


def expected_registry_paths(item_id, item_type):
    """Return candidate relative file paths a registry entry of `item_type`
    is expected to have on disk (relative to the marketplace repo root).

    Single source of truth for the per-type path mapping duplicated across
    `checks_schema.check_registry_consistency`, `validate_json_summary.py`,
    and `validate-json.yml` (see issue #789).
    """
    if item_type == "dashboard":
        return [os.path.join("dashboards", item_id, "dashboard.json")]
    if item_type == "card-preset":
        return [
            os.path.join("presets", f"{item_id}.json"),
            os.path.join("card-presets", f"{item_id}.json"),
        ]
    if item_type == "theme":
        return [os.path.join("themes", f"{item_id}.json")]
    return []


def registry_download_url_path(url):
    """Extract the path after '/main/' from a registry `downloadUrl`, or None.

    Shared regex used by every schema-check site to validate that
    `downloadUrl` points at a real file in the repo.
    """
    if not url:
        return None
    m = re.search(r"/main/(.+)$", url)
    return m.group(1) if m else None


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
        expected = expected_registry_paths(item_id, item_type)
        if item_type == "dashboard":
            if not os.path.isfile(os.path.join(base, expected[0])):
                results.error("registry",
                             f"Registry entry '{item_id}' (dashboard) has no file at "
                             f"dashboards/{item_id}/dashboard.json")
        elif item_type == "card-preset":
            if not any(os.path.isfile(os.path.join(base, c)) for c in expected):
                results.error("registry",
                             f"Registry entry '{item_id}' (card-preset) has no file in "
                             f"presets/ or card-presets/")
        elif item_type == "theme":
            if not os.path.isfile(os.path.join(base, expected[0])):
                results.error("registry",
                             f"Registry entry '{item_id}' (theme) has no file at "
                             f"themes/{item_id}.json")

        # downloadUrl path check
        url_path = registry_download_url_path(item.get("downloadUrl", ""))
        if url_path and not os.path.isfile(os.path.join(base, url_path)):
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
