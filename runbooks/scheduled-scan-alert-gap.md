# Scheduled Scan Alert Gap Runbook

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `.github/workflows/fuzz.yml`, `.github/workflows/codeql.yml`,
`.github/workflows/scorecard.yml` (weekly), and `.github/workflows/stale.yml` (daily)

---

## Scope Note

This runbook covers **`schedule:`-triggered** workflows that have no failure alert of
any kind today: the three weekly scans (SLI/SLO 5) plus the daily `stale.yml` run
(SLI/SLO 6). It is distinct from
[`auto-qa-pipeline-failure.md`](./auto-qa-pipeline-failure.md), which covers the
*nightly* `marketplace-auto-qa.yml` scan, and from
[`registry-incident-response.md`](./registry-incident-response.md), which covers
content incidents. See [`SLO.md`](./SLO.md#slis-and-slos) for SLI/SLO 5 and 6.

## Current Status

> **No mechanism fix exists yet.** Tracking issue
> [#573](https://github.com/kubestellar/console-marketplace/issues/573) (successor to
> the doc-only fix that closed
> [#565](https://github.com/kubestellar/console-marketplace/issues/565)) documents two
> confirmed gaps:
>
> 1. `fuzz.yml`'s "Run fuzzing tests" step runs
>    `timeout 60s python fuzz_json_parser.py -atheris_runs=100000 || true`. The
>    trailing `|| true` discards Atheris's non-zero exit code unconditionally, so the
>    step always succeeds and always prints "Fuzzing completed successfully - no
>    crashes detected" — even on a real crash. There is no failure signal to alert on.
> 2. `codeql.yml` and `scorecard.yml` have no `workflow_run`-triggered alert, issue-
>    filing step, or other cross-workflow notification. `grep -rn
>    "workflow_run\|notify\|slack" .github/workflows/*.yml` returns zero matches.
>
> Both fixes require editing files under `.github/workflows/`, which needs the
> `workflows` GitHub App permission that automated PRs from this project do not carry
> (see [issue #545](https://github.com/kubestellar/console-marketplace/issues/545) for
> the same constraint on a sibling gap). Until a maintainer applies the proposed diff
> in #573, use the manual detection steps below.

## When to Use This Runbook

- You want to confirm this week's `fuzz.yml`, `codeql.yml`, or `scorecard.yml` run
  actually completed and (for `fuzz.yml`) actually found no crash, rather than trusting
  a green check mark.
- You are investigating an unrelated incident and want to rule out a silent scan
  failure as a contributing factor.

## Detecting a Failure Today

| Workflow | Schedule (UTC) | Signal | Where to look |
|---|---|---|---|
| `fuzz.yml` | Mon 03:00 | Green run is **not proof of no crash** — `\|\| true` swallows the exit code | Actions → `JSON Fuzzing` → open the latest scheduled run → "Run fuzzing tests" step log; look for Atheris crash/repro output printed above the always-succeeding `echo` |
| `codeql.yml` | Mon 04:00 | Run status | Actions → `CodeQL Analysis` → confirm the latest scheduled run is green; a red run has no other notification |
| `scorecard.yml` | Mon 06:00 | Run status | Actions → `OpenSSF Scorecard` → confirm the latest scheduled run is green; a red run has no other notification |

Because none of these workflows file an issue or otherwise notify on failure, the
Actions tab is the only working signal — check it manually after each Monday's runs,
or whenever a security/quality question needs the freshest scan result.

## Triage

1. Open the specific failed (or, for `fuzz.yml`, suspiciously terse) run in the
   Actions tab and read the full step log.
2. For `fuzz.yml`: search the "Run fuzzing tests" log for Atheris crash output (a
   Python traceback plus a reproducer input) printed *before* the unconditional
   "Fuzzing completed successfully" line — that combination means a real crash was
   masked.
3. For `codeql.yml`/`scorecard.yml`: a red run usually indicates an infra flake, an
   Actions runner image change, or a pinned-action version bump; re-run via
   `workflow_dispatch` (`scorecard.yml`) or push a trivial `main` commit
   (`codeql.yml`, which also triggers on `push`) to confirm whether it reproduces.

## Recovery

- **`fuzz.yml` crash:** file (or update) an issue with the reproducer input from the
  log, then fix the underlying parsing code the fuzz target exercises
  (`test_json_parsing` in the generated `fuzz/fuzz_json_parser.py`).
- **`codeql.yml`/`scorecard.yml` failure:** apply the fix implied by the log (action
  version bump, permission change, etc.) and confirm the next scheduled or manually
  dispatched run is green.
- Once a maintainer applies the `workflows`-permission-gated fix in
  [#573](https://github.com/kubestellar/console-marketplace/issues/573), update the
  "Current Status" section above and SLO 5 in [`SLO.md`](./SLO.md#slis-and-slos) to
  reflect the mechanism is live, and add the new alert issue label to the table above.

## Verifying Recovery

- Confirm the next scheduled run of the affected workflow completes green and, for
  `fuzz.yml`, that the log shows no Atheris crash output above the completion message.

## Stale Issues Workflow

`.github/workflows/stale.yml` has the same undocumented gap as the three workflows
above, tracked separately in
[issue #598](https://github.com/kubestellar/console-marketplace/issues/598) and
SLO 6 in [`SLO.md`](./SLO.md#slis-and-slos):

| Workflow | Schedule (UTC) | Signal | Where to look |
|---|---|---|---|
| `stale.yml` | Daily 00:00 | Run status only — it calls `kubestellar/infra`'s `reusable-stale.yml` with no failure notification | Actions → `Stale Issues` → confirm the latest scheduled run is green; a red run has no other notification |

A silent daily failure here means stale issues/PRs stop being triaged with no signal
beyond noticing the backlog is not shrinking as expected. Triage and recovery follow the
same pattern as `codeql.yml`/`scorecard.yml` above: open the failed run's log, identify
the cause (usually a reusable-workflow break or a permissions change), fix it, and
confirm the next scheduled or `workflow_dispatch`-triggered run is green.

## Recording the Incident

Use the [Incident Report issue template](../.github/ISSUE_TEMPLATE/incident-report.md)
(labeled `incident, lifecycle/frozen`) to capture the timeline, impact, root cause, and
follow-up actions for any confirmed crash or missed detection window.
