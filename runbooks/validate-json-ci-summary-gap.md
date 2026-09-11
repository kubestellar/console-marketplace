# `validate-json.yml` CI-Observability Summary Gap

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `.github/workflows/validate-json.yml`, `scripts/validate_json_summary.py`

---

## Scope Note

This runbook covers the same gap class as
[`fuzz-yml-ci-summary-gap.md`](./fuzz-yml-ci-summary-gap.md) (SLI/SLO 7), applied to a
different workflow: `validate-json.yml`'s three steps ("Validate registry.json",
"Validate dashboard files", "Validate dashboard format") only print free-text
`echo`/`print` lines. No step writes to `$GITHUB_STEP_SUMMARY`, and there is no
single-line, bounded, machine-readable summary record of what was checked. See
[issue #621](https://github.com/kubestellar/console-marketplace/issues/621) for the
original finding.

## Current Status

> **The logic has been extracted and tested, but the workflow itself is not wired
> up.** [`scripts/validate_json_summary.py`](../scripts/validate_json_summary.py)
> re-implements the same three checks `validate-json.yml` already runs (registry.json
> parses, `dashboards/*/dashboard.json` files parse and match the `kc-dashboard-v1`
> schema, and registry entries have matching asset files) as a standalone,
> unit-tested module (see
> [`tests/test_validate_json_summary.py`](../tests/test_validate_json_summary.py)).
> Running it directly produces the bounded summary:
>
> ```
> $ python3 scripts/validate_json_summary.py
> ### Validate JSON Summary
>
> | Field | Value |
> |---|---|
> | Registry entries checked | 77 |
> | Dashboards checked | 3 |
> | Error count | 0 |
> | Status | pass |
>
> VALIDATE_JSON_SUMMARY: {"registry_entries_checked": 77, "dashboards_checked": 3, "error_count": 0, "status": "pass"}
> ```
>
> Wiring this into `validate-json.yml` (replacing its three inline steps with a call
> to this script, or adding it as a final `if: always()` step) requires editing a file
> under `.github/workflows/`, which needs the `workflows` GitHub App permission this
> project's automated PRs do not carry — the same repo-wide token restriction already
> documented for [issue #545](https://github.com/kubestellar/console-marketplace/issues/545)
> (`auto-qa-pipeline-failure.md`) and [issue #597](https://github.com/kubestellar/console-marketplace/issues/597)
> (`fuzz-yml-ci-summary-gap.md`). This runbook preserves the ready-to-apply wiring so
> it can be applied without re-deriving the logic.

## When to Use This Runbook

- You want to confirm what a past `validate-json.yml` run actually checked (registry
  entry count, dashboard file count, pass/fail) without reading the raw step log.
- You are a maintainer looking to close
  [issue #621](https://github.com/kubestellar/console-marketplace/issues/621) and want
  the exact wiring to apply, without waiting on another automated attempt.

## Applying the Fix

A maintainer with the `workflows` GitHub App permission (or a local PAT-based push)
can add a final step to the `validate` job in `.github/workflows/validate-json.yml`:

```yaml
      - name: Validate JSON observability summary
        if: always()
        run: python3 scripts/validate_json_summary.py
```

This can run alongside or in place of the three existing inline steps — the script
performs the same checks and exits non-zero on any error, so it is a drop-in
replacement if preferred. No exporter, metrics backend, or external data flow is
added: stdout / `$GITHUB_STEP_SUMMARY` only, and every count is bounded by this
repo's own registry/dashboard file list (never populated from unbounded user input).

## Verifying Recovery

1. Trigger the workflow on a PR touching `registry.json` or a `dashboards/**/*.json`
   file.
2. Confirm the run's **Summary** tab shows a "Validate JSON Summary" table with
   non-zero `Registry entries checked` / `Dashboards checked` counts.
3. Confirm the step's log contains a `VALIDATE_JSON_SUMMARY: {...}` line.
4. Close [issue #621](https://github.com/kubestellar/console-marketplace/issues/621)
   once confirmed.
