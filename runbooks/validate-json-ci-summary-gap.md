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

Two independent, validated fixes exist for the same gap. Apply **one** of them (not
both) — a maintainer with the `workflows` GitHub App permission (or a local
PAT-based push) is needed either way, since both touch
`.github/workflows/validate-json.yml`.

### Option A: call the extracted script (smaller diff)

Add a final step to the `validate` job in `.github/workflows/validate-json.yml`:

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

### Option B: inline diff (no new script dependency, per-step outputs)

Gives each existing step an `id`, adds `if: always()` to the second and third steps
so they still run after an earlier step fails, has the dashboard-format Python
script write bounded counts to `$GITHUB_OUTPUT`, and adds a final "JSON validation
observability summary" step that writes a markdown table to `$GITHUB_STEP_SUMMARY`
and a single-line `VALIDATE_JSON_SUMMARY: {...}` JSON record to stdout — mirroring
the `MARKETPLACE_QUALITY_SUMMARY:` pattern already used by
`scripts/validate-marketplace.py`. Validated against
`.github/workflows/validate-json.yml` at commit `212a551` (77 registry entries, 3
dashboard files, 0 errors, dry-run tested locally). No exporter, metrics backend, or
external data flow: stdout/step-summary only.

<details>
<summary>Diff</summary>

```diff
diff --git a/.github/workflows/validate-json.yml b/.github/workflows/validate-json.yml
index 2d4377c..21bb283 100644
--- a/.github/workflows/validate-json.yml
+++ b/.github/workflows/validate-json.yml
@@ -19,16 +19,21 @@ jobs:
       - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
 
       - name: Validate registry.json
+        id: validate-registry
         run: |
           echo "Validating registry.json..."
           python3 -m json.tool registry.json > /dev/null
           echo "registry.json is valid JSON"
 
       - name: Validate dashboard files
+        id: validate-dashboard-files
+        if: always()
         run: |
           errors=0
+          checked=0
           for f in dashboards/*/dashboard.json; do
             if [ -f "$f" ]; then
+              checked=$((checked + 1))
               if python3 -m json.tool "$f" > /dev/null 2>&1; then
                 echo "OK: $f"
               else
@@ -37,12 +42,16 @@ jobs:
               fi
             fi
           done
+          echo "dashboard_files_checked=$checked" >> "$GITHUB_OUTPUT"
+          echo "dashboard_files_invalid=$errors" >> "$GITHUB_OUTPUT"
           if [ $errors -gt 0 ]; then
             echo "Found $errors invalid JSON file(s)"
             exit 1
           fi
 
       - name: Validate dashboard format
+        id: validate-dashboard-format
+        if: always()
         run: |
           python3 - <<'SCRIPT'
           import glob, json, os, re, sys
@@ -120,8 +129,50 @@ jobs:
 
           if errors > 0:
               print(f"\n{errors} error(s) found")
+              with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
+                  fh.write(f"registry_entries_checked={len(registry_entries)}\n")
+                  fh.write(f"format_errors={errors}\n")
               sys.exit(1)
 
           print(f"Checked {len(registry_entries)} registry entries, {len(seen_ids)} unique IDs")
           print("\nAll validations passed")
+          with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
+              fh.write(f"registry_entries_checked={len(registry_entries)}\n")
+              fh.write(f"format_errors={errors}\n")
           SCRIPT
+
+      - name: JSON validation observability summary
+        if: always()
+        run: |
+          REGISTRY_OUTCOME="${{ steps.validate-registry.outcome }}"
+          DASHBOARD_FILES_OUTCOME="${{ steps.validate-dashboard-files.outcome }}"
+          DASHBOARD_FORMAT_OUTCOME="${{ steps.validate-dashboard-format.outcome }}"
+          DASHBOARD_FILES_CHECKED="${{ steps.validate-dashboard-files.outputs.dashboard_files_checked || 0 }}"
+          DASHBOARD_FILES_INVALID="${{ steps.validate-dashboard-files.outputs.dashboard_files_invalid || 0 }}"
+          REGISTRY_ENTRIES_CHECKED="${{ steps.validate-dashboard-format.outputs.registry_entries_checked || 0 }}"
+          FORMAT_ERRORS="${{ steps.validate-dashboard-format.outputs.format_errors || 0 }}"
+
+          if [ "$REGISTRY_OUTCOME" = "success" ] && [ "$DASHBOARD_FILES_OUTCOME" = "success" ] && [ "$DASHBOARD_FORMAT_OUTCOME" = "success" ]; then
+            OVERALL_STATUS="pass"
+          else
+            OVERALL_STATUS="fail"
+          fi
+
+          {
+            echo "### JSON Validation Summary"
+            echo ""
+            echo "| Field | Value |"
+            echo "|---|---|"
+            echo "| registry.json parse | ${REGISTRY_OUTCOME} |"
+            echo "| Dashboard files checked | ${DASHBOARD_FILES_CHECKED} |"
+            echo "| Dashboard files invalid | ${DASHBOARD_FILES_INVALID} |"
+            echo "| Registry entries checked | ${REGISTRY_ENTRIES_CHECKED} |"
+            echo "| Format errors | ${FORMAT_ERRORS} |"
+            echo "| Overall status | ${OVERALL_STATUS} |"
+          } >> "$GITHUB_STEP_SUMMARY"
+
+          echo "VALIDATE_JSON_SUMMARY: {\"registry_outcome\":\"${REGISTRY_OUTCOME}\",\"dashboard_files_checked\":${DASHBOARD_FILES_CHECKED},\"dashboard_files_invalid\":${DASHBOARD_FILES_INVALID},\"registry_entries_checked\":${REGISTRY_ENTRIES_CHECKED},\"format_errors\":${FORMAT_ERRORS},\"overall_status\":\"${OVERALL_STATUS}\"}"
+
+          if [ "$OVERALL_STATUS" != "pass" ]; then
+            exit 1
+          fi
```

</details>

## Verifying Recovery

1. Trigger the workflow on a PR touching `registry.json` or a `dashboards/**/*.json`
   file.
2. Confirm the run's **Summary** tab shows a "Validate JSON Summary" (Option A) or
   "JSON Validation Summary" (Option B) table with non-zero `Registry entries
   checked` / `Dashboards checked` counts and an explicit pass/fail overall status.
3. Confirm the step's log contains a `VALIDATE_JSON_SUMMARY: {...}` line.
4. Temporarily reintroducing an invalid `dashboard.json` (or a malformed
   `registry.json` entry) should cause the summary step to report a non-zero error
   count and `fail`/non-zero exit, rather than the job simply failing on an earlier
   step with no aggregate record.
5. Close [issue #621](https://github.com/kubestellar/console-marketplace/issues/621)
   once confirmed.
