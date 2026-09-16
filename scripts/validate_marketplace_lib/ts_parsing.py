"""TypeScript/registry parsing helpers for the marketplace quality gate.

Extracted from scripts/validate-marketplace.py (see issue #670).
"""
import glob
import json
import os
import re


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


def _extract_object_block(content, anchor):
    """Return the object literal body following anchor, handling nested braces."""
    anchor_idx = content.find(anchor)
    if anchor_idx == -1:
        return ""

    block_start = content.find("{", anchor_idx)
    if block_start == -1:
        return ""

    depth = 0
    for idx in range(block_start, len(content)):
        char = content[idx]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return content[block_start + 1:idx]

    return ""


def parse_card_registry(registry_ts_path):
    """Extract card type keys from console card registry (main + category files)."""
    with open(registry_ts_path) as f:
        content = f.read()

    registry_dir = os.path.dirname(registry_ts_path)
    card_types = set()

    # Parse inline types from the Object.assign({ ... }) call in cardRegistry.ts.
    inline_components = _extract_object_block(content, "Object.assign(")
    for match in re.finditer(r"(\w+)\s*:", inline_components):
        card_types.add(match.group(1))

    unified_match = re.search(r"_UNIFIED_ONLY_TYPES\s*=\s*\[(.*?)\]", content, re.DOTALL)
    if unified_match:
        for card_type in re.findall(r"['\"]([\w-]+)['\"]", unified_match.group(1)):
            card_types.add(card_type)

    category_pattern = os.path.join(registry_dir, "cardRegistry.*.ts")
    for category_file in sorted(glob.glob(category_pattern)):
        if os.path.basename(category_file) == "cardRegistry.types.ts":
            continue

        with open(category_file) as f:
            category_content = f.read()

        # Try "const components" first (handles `const components: Record<...> = {...}`)
        # then fall back to "components:" anchor for inline object patterns.
        # We must try `const components` first because `components:` can match
        # inside interface/type definitions (e.g., CardRegistryDomain) where the
        # next `{` belongs to an unrelated function body.
        components_block = _extract_object_block(category_content, "const components")
        if not components_block:
            components_block = _extract_object_block(category_content, "components:")
        for match in re.finditer(r"(\w+)\s*:", components_block):
            card_types.add(match.group(1))

    return card_types


def parse_card_descriptors(descriptors_ts_path):
    """Extract card type ids from the unified cardDescriptors.registry.ts.

    The console has migrated some cards from the legacy RAW_CARD_COMPONENTS
    map to a descriptor-based registry (CardDescriptor[]). Each descriptor
    entry is an object literal with an `id: '<type>'` field. Without
    reading this file, cards migrated to the descriptor system appear
    "not found in console registry" even though they are present.
    """
    if not os.path.isfile(descriptors_ts_path):
        return set()
    with open(descriptors_ts_path) as f:
        content = f.read()
    # Match `id: 'card_type',` or `id: "card_type",` — the descriptor
    # registry uses single-quoted string ids on their own line.
    return set(re.findall(r"^\s*id:\s*['\"]([\w-]+)['\"]\s*,", content, re.MULTILINE))


def parse_sub_registry_categories(cards_dir):
    """Extract card type keys from CardRegistryCategory sub-files.

    The console splits RAW_CARD_COMPONENTS across multiple category files
    (cardRegistry.cluster.ts, cardRegistry.security.ts, etc.).  Each file
    exports a CardRegistryCategory whose `components` object is keyed by
    snake_case card type.  Without scanning these files, every card defined
    in a sub-registry appears "not found" even though it is fully registered.
    """
    card_types = set()
    for path in glob.glob(os.path.join(cards_dir, "cardRegistry.*.ts")):
        if os.path.basename(path) == "cardRegistry.ts":
            continue  # Skip the root registry file
        try:
            with open(path) as f:
                content = f.read()
        except OSError:
            continue

        # Locate the `components: {` block and extract snake_case card type keys.
        # Track brace depth so nested braces (e.g. safeLazy calls) are handled.
        start = content.find("components: {")
        if start == -1:
            continue
        start += len("components: {")
        depth = 1
        pos = start
        while pos < len(content) and depth > 0:
            if content[pos] == "{":
                depth += 1
            elif content[pos] == "}":
                depth -= 1
            pos += 1
        comp_block = content[start:pos - 1]

        # Card type keys are always snake_case (lowercase with at least one
        # underscore, e.g. `cluster_health`).  TypeScript identifiers in the
        # values are CamelCase (e.g. `ClusterHealth`) and are therefore
        # excluded by requiring at least one `_` in the matched token.
        for m in re.finditer(r"\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*:", comp_block):
            card_types.add(m.group(1))

    return card_types


def get_all_console_card_types(cards_dir):
    """Collect every registered card type from the console card registry.

    Merges three sources so that cards are found regardless of which
    registration mechanism the console currently uses:
      1. RAW_CARD_COMPONENTS block in cardRegistry.ts (legacy static map)
      2. CardDescriptor ids in cardDescriptors.registry.ts
      3. CardRegistryCategory components in cardRegistry.*.ts sub-files
    """
    registry_ts = os.path.join(cards_dir, "cardRegistry.ts")
    descriptors_ts = os.path.join(cards_dir, "cardDescriptors.registry.ts")
    types = set()
    if os.path.isfile(registry_ts):
        types |= parse_card_registry(registry_ts)
    if os.path.isfile(descriptors_ts):
        types |= parse_card_descriptors(descriptors_ts)
    types |= parse_sub_registry_categories(cards_dir)
    return types


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
