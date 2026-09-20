# `fuzz.yml` CI-Observability Summary Gap

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `.github/workflows/fuzz.yml`

---

## Scope Note

This runbook covers the **missing structured pass/fail summary** in `fuzz.yml`'s
`fuzz-json` job — a CI-log-observability gap distinct from the two gaps already
tracked in [`scheduled-scan-alert-gap.md`](./scheduled-scan-alert-gap.md) (the
`|| true` exit-code masking, and the missing `workflow_run` failure alert). Even
once those two are fixed, `fuzz.yml` still has no leveled, bounded, machine-readable
record of what it actually did each run — the "Run fuzzing tests" and "Test edge
cases" steps only print decorative free-text lines, and no step writes anything to
`$GITHUB_STEP_SUMMARY`. See [issue #597](https://github.com/kubestellar/console-marketplace/issues/597)
for the original finding.

## Current Status

> **RESOLVED.** `.github/workflows/fuzz.yml` now has a `Fuzzing observability
> summary` step (added by commit `378cfdf`, "wire step-summary into fuzz.yml and
> validate-json.yml") that calls
> [`scripts/fuzz_summary.py`](../scripts/fuzz_summary.py) with
> `--fuzzer-status "${{ steps.run-fuzzing.outputs.status || 'unknown' }}"` and runs
> `if: always()`, matching the diff previously preserved below. Confirmed present
> on `main` as of this audit pass. [Issue #597](https://github.com/kubestellar/console-marketplace/issues/597)
> is closed. The prior blocker (this project's automated-PR token lacks the
> `workflows` GitHub App permission needed to push a change under
> `.github/workflows/`, so telemetry's own repeated attempts to land this diff
> were rejected server-side every time) was cleared by a differently-scoped
> automation run that *does* carry that permission — not by telemetry. This
> section, and the diff below, are kept only as a historical record of what was
> applied and why; do not re-attempt this fix or re-open #597.

## When to Use This Runbook

- You want to confirm what a past `fuzz.yml` run actually tested (corpus file count,
  edge-case count, pass/fail) without opening the raw step log and reading free-text
  output line by line.
- You are a maintainer looking to close [issue #597](https://github.com/kubestellar/console-marketplace/issues/597)
  and want the exact diff to apply, without waiting on another automated attempt.

## Applied Diff (historical reference)

Validated against `.github/workflows/fuzz.yml` at commit `c3d7da5`. Adds a step
`id`, captures the atheris exit status, and replaces the workflow's duplicated
inline corpus-mutation/edge-case Python with a single call to
[`scripts/fuzz_summary.py`](../scripts/fuzz_summary.py) — the standalone,
unit-tested script that already re-implements that logic (see
[`tests/test_fuzz_summary.py`](../tests/test_fuzz_summary.py)). The script
writes a bounded markdown table to `$GITHUB_STEP_SUMMARY` and a single-line
`FUZZ_SUMMARY: {...}` JSON record to stdout, mirroring the
`MARKETPLACE_QUALITY_SUMMARY:` pattern already used by
`scripts/validate-marketplace.py`. No exporter, metrics backend, or external
data flow: stdout/step-summary only, and all counts are bounded by this
repo's own fixed corpus-file list and fixed edge-case list (never populated
from user input).

<details>
<summary>Diff</summary>

```diff
diff --git a/.github/workflows/fuzz.yml b/.github/workflows/fuzz.yml
index c926327..af33ad5 100644
--- a/.github/workflows/fuzz.yml
+++ b/.github/workflows/fuzz.yml
@@ -112,67 +112,19 @@ jobs:
           chmod +x fuzz/fuzz_json_parser.py
 
       - name: Run fuzzing tests
+        id: run-fuzzing
         run: |
+          set +e
           cd fuzz
           # Run fuzzer for 60 seconds with timeout
-          timeout 60s python fuzz_json_parser.py -atheris_runs=100000 || true
-          
-          # Test with actual repository files as corpus
-          echo "Testing with real JSON files from repository..."
-          for json_file in ../registry.json ../dashboards/*/dashboard.json ../presets/*.json ../card-presets/*.json; do
-            if [ -f "$json_file" ]; then
-              echo "Fuzzing with corpus from: $json_file"
-              python -c "
-          import json
-          import sys
-          with open('$json_file') as f:
-              content = f.read()
-              # Test original
-              json.loads(content)
-              # Test with mutations
-              for i in range(10):
-                  # Test truncated
-                  if len(content) > 10:
-                      try:
-                          json.loads(content[:-i])
-                      except: pass
-                  # Test with extra characters
-                  try:
-                      json.loads(content + '{')
-                  except: pass
-                  try:
-                      json.loads('}' + content)
-                  except: pass
-          "
-            fi
-          done
-          echo "Fuzzing completed successfully - no crashes detected"
+          timeout 60s python fuzz_json_parser.py -atheris_runs=100000
+          if [ $? -eq 0 ]; then
+            echo "status=pass" >> "$GITHUB_OUTPUT"
+          else
+            echo "status=fail" >> "$GITHUB_OUTPUT"
+          fi
 
-      - name: Test edge cases
+      - name: Fuzzing observability summary
+        if: always()
         run: |
-          python3 - << 'SCRIPT'
-          import json
-          
-          # Test edge cases that should NOT crash
-          edge_cases = [
-              '{}',
-              '[]',
-              'null',
-              '""',
-              '0',
-              '{"nested": {"deeply": {"very": {"deep": {}}}}}',
-              '{"array": [[[[[]]]]]}',
-              '[' + ','.join(['{}'] * 1000) + ']',
-              '{"key": "' + 'x' * 10000 + '"}',
-          ]
-          
-          print("Testing edge cases...")
-          for i, case in enumerate(edge_cases):
-              try:
-                  json.loads(case)
-                  print(f"✓ Edge case {i+1} parsed successfully")
-              except Exception as e:
-                  print(f"✓ Edge case {i+1} raised expected error: {type(e).__name__}")
-          
-          print("\nAll edge case tests passed!")
-          SCRIPT
+          python3 scripts/fuzz_summary.py --fuzzer-status "${{ steps.run-fuzzing.outputs.status || 'unknown' }}"
```

</details>

## Applying the Fix (already done — kept for reference)

1. ~~Apply the diff above to `.github/workflows/fuzz.yml`~~ — done, see commit
   `378cfdf`.
2. ~~Trigger the workflow~~ — confirmed running on `main`.
3. Confirmed: the run's **Summary** tab shows a "JSON Fuzzing Summary" table, and
   the "Fuzzing observability summary" step's log contains a `FUZZ_SUMMARY: {...}`
   line.
4. [Issue #597](https://github.com/kubestellar/console-marketplace/issues/597) is
   closed.

## Verifying Recovery

- The workflow's Summary tab for the applied run shows non-empty corpus/edge-case
  counts and an explicit `pass`/`fail` overall status — not just the job's own
  green/red indicator.
- A real Atheris crash (simulate by temporarily reintroducing a parsing bug) causes
  `scripts/fuzz_summary.py` to exit non-zero with `overall_status: fail` (via its
  own `--fuzzer-status fail` input), failing the "Fuzzing observability summary"
  step instead of the job passing silently.
