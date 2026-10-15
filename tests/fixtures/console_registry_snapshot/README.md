# Console registry golden snapshot

These `cardRegistry*.ts` / `cardDescriptors.registry.ts` files are a verbatim
copy of `kubestellar/console`'s `web/src/components/cards/` directory at the
commit pinned in `.github/actions/checkout-console-pin/action.yml`:

```
425902f6132e317a9c9611b3d6f21b21aca75012
```

`expected.json` records what `scripts/validate_marketplace_lib/ts_parsing.py`'s
`parse_card_registry`, `parse_sub_registry_categories`, and
`parse_card_descriptors` return when pointed at this exact snapshot.

## Why this exists

See [kubestellar/console-marketplace#953](https://github.com/kubestellar/console-marketplace/issues/953):
these three functions reverse-engineer console's internal TypeScript source
with regex/brace-matching rather than reading a published contract. Before
any refactor toward a real interface (a generated manifest, a real TS
parser, or a scheduled drift check against console's live `main`), this
snapshot pins today's regex behaviour against real source so a refactor that
accidentally changes the result set fails a test instead of silently
degrading the "card type registered" check.

## Regenerating

Only regenerate this snapshot when intentionally re-pinning to a newer
console commit (i.e. together with a bump of
`.github/actions/checkout-console-pin/action.yml`'s `ref`). Regenerating it
for any other reason defeats its purpose as a pinned baseline.

```bash
# from the repo root, with a local checkout of console at the new pin:
rm -f tests/fixtures/console_registry_snapshot/web/src/components/cards/cardRegistry*.ts
rm -f tests/fixtures/console_registry_snapshot/web/src/components/cards/cardDescriptors.registry.ts
cp <console>/web/src/components/cards/cardRegistry*.ts \
   <console>/web/src/components/cards/cardDescriptors.registry.ts \
   tests/fixtures/console_registry_snapshot/web/src/components/cards/

python3 - <<'PY'
import json, sys
sys.path.insert(0, "scripts")
from validate_marketplace_lib import ts_parsing as tp

cards_dir = "tests/fixtures/console_registry_snapshot/web/src/components/cards"
expected = {
    "console_pin": "<new-pin-sha>",
    "parse_card_registry": sorted(tp.parse_card_registry(cards_dir + "/cardRegistry.ts")),
    "parse_sub_registry_categories": sorted(tp.parse_sub_registry_categories(cards_dir)),
    "parse_card_descriptors": sorted(tp.parse_card_descriptors(cards_dir + "/cardDescriptors.registry.ts")),
}
with open("tests/fixtures/console_registry_snapshot/expected.json", "w") as f:
    json.dump(expected, f, indent=2, sort_keys=True)
    f.write("\n")
PY
```

Then update the pin SHA in this README and re-run
`pytest tests/test_ts_parsing_golden.py` to confirm it passes.
