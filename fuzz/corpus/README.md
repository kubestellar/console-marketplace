# Fuzz Corpus — Seed Inputs

Starter corpus for `fuzz/fuzz_json_parser.py`. Each `*.json` file is a
representative JSON shape that the fuzz target's `test_json_parsing()` should
handle without raising:

| File                                 | Shape                                    |
|--------------------------------------|------------------------------------------|
| `registry_shape.json`                | `{"items": [...]}` (registry.json shape) |
| `dashboard_gitops_pipeline.json`     | Real dashboard from `dashboards/`        |
| `preset_cncf_argo.json`              | Real preset from `presets/`              |
| `card_preset_cluster_overview.json`  | Real card preset from `card-presets/`    |
| `edge_empty_object.json`             | `{}`                                     |
| `edge_empty_array.json`              | `[]`                                     |
| `edge_nested_unknown_shape.json`     | Known type-mismatched fields             |
| `edge_mixed_shapes.json`             | All three top-level shape markers present |

These files also gate the fuzz target's exception-swallowing contract from the
PR side: `tests/fuzz/test_fuzz_corpus.py` iterates every `*.json` here and
calls `test_json_parsing()` on the raw text, so a regression that starts
raising on a real marketplace shape is caught before it reaches the weekly
atheris cron.

Refs #635 rec #2 (persist a corpus). The workflow-side change — pointing
atheris at this directory and persisting between runs via `actions/cache` —
lives in `.github/workflows/fuzz.yml` and is outside this agent's push scope
(contributor-tier App token has no Workflows permission). Once a
workflow-tier contributor lands that piece, `atheris` will start from these
seeds rather than from zero every Monday.
