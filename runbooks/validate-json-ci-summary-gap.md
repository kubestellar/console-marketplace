# `validate-json.yml` CI-Observability Summary Gap

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `.github/workflows/validate-json.yml`

---

## Scope Note

This runbook covers the **missing structured pass/fail summary** in
`validate-json.yml`'s `validate` job — the same gap class already documented for
`fuzz.yml` in [`fuzz-yml-ci-summary-gap.md`](./fuzz-yml-ci-summary-gap.md). The
workflow's three steps ("Validate registry.json", "Validate dashboard files",
"Validate dashboard format") only print free-text `echo`/`print` lines. No step
writes to `$GITHUB_STEP_SUMMARY`, no step has an `id` or emits outputs, and there
is no single-line machine-readable summary record. A failure in an earlier step
(e.g. an invalid `dashboard.json`) also fails the job immediately (`exit 1` /
`sys.exit(1)`), so a later step never runs and leaves no structured record of what
it would have checked. See [issue #621](https://github.com/kubestellar/console-marketplace/issues/621)
for the original finding.

## Current Status

> **No mechanism fix exists yet.** A validated, ready-to-apply diff (below) gives
> each of the three existing steps an `id` and bounded output counts, removes the
> early `exit 1` / `sys.exit(1)` calls (deferring pass/fail to a single final
> step, mirroring the `fuzz.yml` fix), and adds a final `if: always()` "JSON
> validation observability summary" step that writes a markdown table to
> `$GITHUB_STEP_SUMMARY` and a single-line `VALIDATE_JSON_SUMMARY: {...}` JSON
> record to stdout.
>
> The diff has been applied to a local checkout and dry-run validated
> step-by-step (YAML parses cleanly with `python3 -c "import yaml; ..."`; the
> embedded Python heredoc compiles cleanly; each `run:` block's shell/Python
> logic was executed standalone against this repo's real `registry.json` and
> `dashboards/*/dashboard.json` files, producing the expected outputs and both
> the `pass` and simulated `fail` overall-status paths). It has **not** been
> pushed, because this repo's GitHub App token lacks the `workflows` OAuth
> scope needed to create or update any file under `.github/workflows/` — the
> same restriction already documented for
> [issue #545](https://github.com/kubestellar/console-marketplace/issues/545),
> [issue #573](https://github.com/kubestellar/console-marketplace/issues/573),
> and [issue #597](https://github.com/kubestellar/console-marketplace/issues/597)
> (see also [`fuzz-yml-ci-summary-gap.md`](./fuzz-yml-ci-summary-gap.md), which
> records eight prior blocked push attempts for the equivalent `fuzz.yml` fix).
> Retrying the push does not change this outcome. This runbook exists so the
> validated diff is preserved in a file automation *can* land, instead of being
> re-derived (and re-blocked) on every future audit pass. A maintainer with
> `workflows` permission can apply the diff below directly; no further review of
> the logic should be needed first.

## When to Use This Runbook

- You want to confirm what a past `validate-json.yml` run actually checked
  (registry.json syntax, dashboard files checked/invalid, format errors, registry
  entries checked) without opening the raw step log and reading free-text output
  line by line.
- You are a maintainer looking to close [issue #621](https://github.com/kubestellar/console-marketplace/issues/621)
  and want the exact diff to apply, without waiting on another automated attempt.

## Ready-to-Apply Diff

Validated against `.github/workflows/validate-json.yml` at commit `a1f697a`. Adds
step `id`s, bounded output counts (dashboard files checked/invalid, format
errors, registry entries checked), removes the early-exit calls in favor of a
final `if: always()` step that writes a markdown table to `$GITHUB_STEP_SUMMARY`
and a single-line `VALIDATE_JSON_SUMMARY: {...}` JSON record — mirroring the
`MARKETPLACE_QUALITY_SUMMARY:`/`FUZZ_SUMMARY:` pattern already used elsewhere in
this repo. No exporter, metrics backend, or external data flow: stdout/step-summary
only, and all counts are bounded (fixed integers derived from this repo's own file
counts — never populated from unbounded user input or per-item free text).

<details>
<summary>Diff</summary>

```diff
diff --git a/.github/workflows/validate-json.yml b/.github/workflows/validate-json.yml
index 2d4377c..c578989 100644
--- a/.github/workflows/validate-json.yml
+++ b/.github/workflows/validate-json.yml
@@ -19,16 +19,28 @@ jobs:
       - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
 
       - name: Validate registry.json
+        id: validate-registry
         run: |
+          set +e
           echo "Validating registry.json..."
           python3 -m json.tool registry.json > /dev/null
-          echo "registry.json is valid JSON"
+          REGISTRY_STATUS=$?
+          if [ "$REGISTRY_STATUS" -eq 0 ]; then
+            echo "registry.json is valid JSON"
+            echo "status=pass" >> "$GITHUB_OUTPUT"
+          else
+            echo "registry.json is NOT valid JSON"
+            echo "status=fail" >> "$GITHUB_OUTPUT"
+          fi
 
       - name: Validate dashboard files
+        id: validate-dashboard-files
         run: |
           errors=0
+          checked=0
           for f in dashboards/*/dashboard.json; do
             if [ -f "$f" ]; then
+              checked=$((checked + 1))
               if python3 -m json.tool "$f" > /dev/null 2>&1; then
                 echo "OK: $f"
               else
@@ -37,12 +49,17 @@ jobs:
               fi
             fi
           done
+          echo "checked=$checked" >> "$GITHUB_OUTPUT"
+          echo "invalid=$errors" >> "$GITHUB_OUTPUT"
           if [ $errors -gt 0 ]; then
             echo "Found $errors invalid JSON file(s)"
-            exit 1
+            echo "status=fail" >> "$GITHUB_OUTPUT"
+          else
+            echo "status=pass" >> "$GITHUB_OUTPUT"
           fi
 
       - name: Validate dashboard format
+        id: validate-dashboard-format
         run: |
           python3 - <<'SCRIPT'
           import glob, json, os, re, sys
@@ -120,8 +137,51 @@ jobs:
 
           if errors > 0:
               print(f"\n{errors} error(s) found")
-              sys.exit(1)
-
-          print(f"Checked {len(registry_entries)} registry entries, {len(seen_ids)} unique IDs")
-          print("\nAll validations passed")
+          else:
+              print(f"Checked {len(registry_entries)} registry entries, {len(seen_ids)} unique IDs")
+              print("\nAll validations passed")
+
+          # Bounded outputs only: fixed integer counts, never per-entry free
+          # text, so this record stays constant-size regardless of registry
+          # growth.
+          with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
+              fh.write(f"format_errors={errors}\n")
+              fh.write(f"registry_entries_checked={len(registry_entries)}\n")
+              fh.write(f"status={'fail' if errors > 0 else 'pass'}\n")
           SCRIPT
+
+      - name: JSON validation observability summary
+        if: always()
+        run: |
+          REGISTRY_STATUS="${{ steps.validate-registry.outputs.status || 'fail' }}"
+          DASHBOARD_CHECKED="${{ steps.validate-dashboard-files.outputs.checked || 0 }}"
+          DASHBOARD_INVALID="${{ steps.validate-dashboard-files.outputs.invalid || 0 }}"
+          DASHBOARD_STATUS="${{ steps.validate-dashboard-files.outputs.status || 'fail' }}"
+          FORMAT_ERRORS="${{ steps.validate-dashboard-format.outputs.format_errors || 0 }}"
+          REGISTRY_ENTRIES_CHECKED="${{ steps.validate-dashboard-format.outputs.registry_entries_checked || 0 }}"
+          FORMAT_STATUS="${{ steps.validate-dashboard-format.outputs.status || 'fail' }}"
+
+          if [ "$REGISTRY_STATUS" = "pass" ] && [ "$DASHBOARD_STATUS" = "pass" ] && [ "$FORMAT_STATUS" = "pass" ]; then
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
+            echo "| registry.json syntax | ${REGISTRY_STATUS} |"
+            echo "| Dashboard files checked | ${DASHBOARD_CHECKED} |"
+            echo "| Dashboard files invalid | ${DASHBOARD_INVALID} |"
+            echo "| Dashboard format errors | ${FORMAT_ERRORS} |"
+            echo "| Registry entries checked | ${REGISTRY_ENTRIES_CHECKED} |"
+            echo "| Overall status | ${OVERALL_STATUS} |"
+          } >> "$GITHUB_STEP_SUMMARY"
+
+          echo "VALIDATE_JSON_SUMMARY: {\"registry_status\":\"${REGISTRY_STATUS}\",\"dashboard_checked\":${DASHBOARD_CHECKED},\"dashboard_invalid\":${DASHBOARD_INVALID},\"format_errors\":${FORMAT_ERRORS},\"registry_entries_checked\":${REGISTRY_ENTRIES_CHECKED},\"overall_status\":\"${OVERALL_STATUS}\"}"
+
+          if [ "$OVERALL_STATUS" != "pass" ]; then
+            exit 1
+          fi
```

</details>

## Applying the Fix

1. Apply the diff above to `.github/workflows/validate-json.yml` (a maintainer
   with the `workflows` GitHub App permission, or a local PAT-based push, can do
   this directly — automation cannot).
2. Open a PR touching a tracked path (`registry.json`, `dashboards/**/*.json`,
   `presets/**/*.json`, `card-presets/**/*.json`, or `themes/**/*.json`) to
   trigger the workflow, or push a no-op change to one of those paths.
3. Confirm the run's **Summary** tab shows a "JSON Validation Summary" table, and
   the "JSON validation observability summary" step's log contains a
   `VALIDATE_JSON_SUMMARY: {...}` line.
4. Close [issue #621](https://github.com/kubestellar/console-marketplace/issues/621)
   once confirmed.

## Verifying Recovery

- The workflow's Summary tab for the applied run shows non-empty checked/invalid
  counts and an explicit `pass`/`fail` overall status per field — not just the
  job's own green/red indicator.
- A real invalid `dashboard.json` (simulate by temporarily breaking one file's
  JSON syntax or `format` field) causes the final summary step to `exit 1` with
  `overall_status: fail`, and the earlier steps' partial results (e.g. how many
  dashboard files were checked before the invalid one) are still visible in the
  summary table instead of being lost to an early job failure.
