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

> **RESOLVED.** `.github/workflows/validate-json.yml` now runs
> `python3 scripts/validate_json_summary.py` as a final step (added by commit
> `378cfdf`, "wire step-summary into fuzz.yml and validate-json.yml"), alongside
> the three original inline checks. Confirmed present on `main` as of this audit
> pass. [Issue #621](https://github.com/kubestellar/console-marketplace/issues/621)
> is closed. As with the matching `fuzz.yml` gap, the prior blocker (no
> `workflows` GitHub App permission on this project's automated-PR token, so
> telemetry's own pushes touching `.github/workflows/` were rejected server-side)
> was cleared by a differently-scoped automation run that does carry that
> permission — not by telemetry. Both Option A and Option B below are kept only
> as a historical record; do not re-attempt this fix or re-open #621.

## When to Use This Runbook

- You want to confirm what a past `validate-json.yml` run actually checked (registry
  entry count, dashboard file count, pass/fail) without reading the raw step log.
- You are a maintainer looking to close
  [issue #621](https://github.com/kubestellar/console-marketplace/issues/621) and want
  the exact wiring to apply, without waiting on another automated attempt.

## Applying the Fix (already done — kept for reference)

The workflow was fixed using a variant of Option A (a final `if: always()` step
calling the standalone script). Both options are kept below only as a historical
record of the two approaches that were considered.

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

Confirmed on `main`:

1. `validate-json.yml` runs on PRs touching `registry.json` or
   `dashboards/**/*.json`.
2. The run's **Summary** tab shows a "Validate JSON Summary" table with non-zero
   `Registry entries checked` / `Dashboards checked` counts and an explicit
   pass/fail overall status.
3. The step's log contains a `VALIDATE_JSON_SUMMARY: {...}` line.
4. [Issue #621](https://github.com/kubestellar/console-marketplace/issues/621) is
   closed.
