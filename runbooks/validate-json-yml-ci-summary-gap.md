# `validate-json.yml` CI-Observability Summary Gap

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `.github/workflows/validate-json.yml`

---

## Scope Note

This runbook covers the **missing structured pass/fail summary** in
`validate-json.yml`'s `validate` job — the same gap class already documented for
`fuzz.yml` in [`fuzz-yml-ci-summary-gap.md`](./fuzz-yml-ci-summary-gap.md). The
job's three steps ("Validate registry.json", "Validate dashboard files", "Validate
dashboard format") only print free-text `echo`/`print` lines. No step writes to
`$GITHUB_STEP_SUMMARY`, no step uses `if: always()`, and there is no single-line
machine-readable summary record. A failure in an earlier step (e.g. an invalid
`dashboard.json`) leaves no structured record of what was checked before the
failure. See [issue #621](https://github.com/kubestellar/console-marketplace/issues/621)
for the original finding.

## Current Status

> **No mechanism fix exists yet.** A validated, ready-to-apply diff (below) gives
> each step an `id`, adds `if: always()` to the second and third steps so they run
> even if an earlier step fails, has the dashboard-format Python script write bounded
> counts to `$GITHUB_OUTPUT` before it exits, and adds a final "JSON validation
> observability summary" step that writes a markdown table to
> `$GITHUB_STEP_SUMMARY` and a single-line `VALIDATE_JSON_SUMMARY: {...}` JSON
> record to stdout — mirroring the `MARKETPLACE_QUALITY_SUMMARY:` pattern already
> used by `scripts/validate-marketplace.py`.
>
> Every step's own logic and output was dry-run tested locally against this repo's
> actual `registry.json` and `dashboards/*/dashboard.json` files at commit
> `212a551` (77 registry entries, 3 dashboard files, 0 errors) before being written
> up here. No exporter, metrics backend, or external data flow: stdout/step-summary
> only, and all counts are bounded by this repo's own registry/dashboard file counts
> (never populated from unbounded user input).
>
> This fix requires editing a file under `.github/workflows/`. The hive's GitHub App
> installation lacks the `workflows` permission scope, so an automated agent PR
> touching this path is rejected by GitHub before it can even be opened (the same
> blocker already documented for [issue #545](https://github.com/kubestellar/console-marketplace/issues/545),
> [issue #573](https://github.com/kubestellar/console-marketplace/issues/573), and
> [issue #597](https://github.com/kubestellar/console-marketplace/issues/597)/
> `fuzz-yml-ci-summary-gap.md`). This runbook exists so the validated diff is
> preserved in a file automation *can* land, instead of being re-derived on every
> future audit pass.

## When to Use This Runbook

- You want to confirm what a past `validate-json.yml` run actually checked (registry
  entries validated, dashboard files validated, error count, pass/fail) without
  opening the raw step log and reading free-text output line by line.
- You are a maintainer looking to close [issue #621](https://github.com/kubestellar/console-marketplace/issues/621)
  and want the exact diff to apply, without waiting on another automated attempt.

## Ready-to-Apply Diff

Validated against `.github/workflows/validate-json.yml` at commit `212a551`. Adds
step `id`s, `if: always()` on the second and third steps, bounded output counts
(dashboard files checked/invalid, registry entries checked, format errors), and a
final `if: always()` step that writes the summary.

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

## Applying the Fix

1. Apply the diff above to `.github/workflows/validate-json.yml` (a maintainer with
   the `workflows` GitHub App permission, or a local PAT-based push, can do this
   directly — automation cannot).
2. Trigger the workflow via a PR that touches one of its watched paths, or
   `workflow_dispatch` if enabled.
3. Confirm the run's **Summary** tab shows a "JSON Validation Summary" table, and
   the "JSON validation observability summary" step's log contains a
   `VALIDATE_JSON_SUMMARY: {...}` line.
4. Close [issue #621](https://github.com/kubestellar/console-marketplace/issues/621)
   once confirmed.

## Verifying Recovery

- The workflow's Summary tab for the applied run shows non-zero dashboard/registry
  counts and an explicit `pass`/`fail` overall status — not just the job's own
  green/red indicator.
- Temporarily reintroducing an invalid `dashboard.json` (or a malformed
  `registry.json` entry) causes the final summary step to `exit 1` with
  `overall_status: fail` and a non-zero error count, rather than the job simply
  failing on an earlier step with no aggregate record.
