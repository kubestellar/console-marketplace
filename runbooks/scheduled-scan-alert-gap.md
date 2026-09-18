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

> **Mechanism fix has landed.** [PR #758](https://github.com/kubestellar/console-marketplace/pull/758)
> (merged 2026-09-17, closing [#607](https://github.com/kubestellar/console-marketplace/issues/607))
> applied the ready-to-apply diff previously posted on
> [issue #573](https://github.com/kubestellar/console-marketplace/issues/573#issuecomment-5578394201)
> and resolved both gaps this runbook originally documented:
>
> 1. `fuzz.yml`'s "Run fuzzing tests" step no longer swallows Atheris's exit code with
>    `|| true`. It now captures the exit code explicitly and only treats `124`
>    (the expected `timeout` deadline) as non-failing; any other non-zero exit calls
>    `exit "$FUZZ_EXIT"` so the step — and the workflow run — actually fails on a real
>    crash.
> 2. `.github/workflows/workflow-failure-issue.yml` now exists: it subscribes to
>    `workflow_run` `completed` events for `JSON Fuzzing`, `CodeQL Analysis`,
>    `OpenSSF Scorecard`, **and** `Stale Issues`, and on a `schedule`/`workflow_dispatch`
>    failure either opens a new issue (labeled `workflow-failure`, linking back to this
>    runbook) or comments on the existing open one for that workflow. This covers
>    `codeql.yml`/`scorecard.yml` (tracked by #573) and `stale.yml` (tracked by #607) in
>    the same change.
>
> [Issue #573](https://github.com/kubestellar/console-marketplace/issues/573) has been
> closed as fixed by this change. As of this writing no `Workflow failure: ...` issue
> has been auto-filed yet (the mechanism only fires on the next scheduled/dispatch run
> of each workflow), so the "Detecting a Failure Today" table below is retained as a
> manual fallback until an automated alert has been observed firing at least once.
>
> **`scorecard.yml`'s pre-existing outage is a separate, still-open problem.** As of
> 2026-09-15, `OpenSSF Scorecard` had failed on every run (both `push` and the weekly
> `schedule` trigger) since 2026-08-31T18:13:01Z (last success) — 79 consecutive red
> runs across ~14.3 days, most recently
> [run 34920414145](https://github.com/kubestellar/console-marketplace/actions/runs/34920414145)
> (2026-09-15T02:14:29Z). Root cause per the job log (e.g.
> [run 34089835030](https://github.com/kubestellar/console-marketplace/actions/runs/34089835030)):
> `docker pull gcr.io/openssf/scorecard-action:v2.4.0` is rejected with
> `denied: This API method requires billing to be enabled` — an upstream GCR billing
> gate on the public `ossf/scorecard-action` image used by
> `kubestellar/infra/.github/workflows/reusable-scorecard.yml`. This is **not** a bug in
> this repo's workflow YAML or something the new alert mechanism can fix by itself — it
> only ensures the *next* occurrence of this (or any other) scheduled failure gets a
> filed issue instead of going unnoticed. See
> [Detecting a Failure Today](#detecting-a-failure-today) and
> [Triage](#triage) below before assuming a local cause.
>
> **Update 2026-09-18:** `scorecard.yml`'s `push`-triggered runs have been green
> since 2026-09-17T07:15:27Z (9 consecutive successes as of this writing) — the
> upstream GCR billing gate appears to have cleared. The weekly `schedule`-triggered
> run (next due 2026-09-21, per the `cron: '0 6 * * 1'` trigger) has not yet
> reconfirmed this independently — the last `schedule` run (2026-09-14) was still a
> failure — so do not mark this fully resolved until that scheduled run is also
> green.

## When to Use This Runbook

- You want to confirm this week's `fuzz.yml`, `codeql.yml`, or `scorecard.yml` run
  actually completed and (for `fuzz.yml`) actually found no crash, rather than trusting
  a green check mark.
- You are investigating an unrelated incident and want to rule out a silent scan
  failure as a contributing factor.

## Detecting a Failure Today

| Workflow | Schedule (UTC) | Signal | Where to look |
|---|---|---|---|
| `fuzz.yml` | Mon 03:00 | A real Atheris crash now fails the step and the run (the `\|\| true` swallow is fixed); `workflow-failure-issue.yml` files/updates a `workflow-failure`-labeled issue on a `schedule`/`workflow_dispatch` failure | Issues search: `label:workflow-failure "JSON Fuzzing" in:title`, or Actions → `JSON Fuzzing` → latest run |
| `codeql.yml` | Mon 04:00 | `workflow-failure-issue.yml` files/updates a `workflow-failure`-labeled issue on a `schedule`/`workflow_dispatch` failure | Issues search: `label:workflow-failure "CodeQL Analysis" in:title`, or Actions → `CodeQL Analysis` → latest run |
| `scorecard.yml` | Mon 06:00 | `workflow-failure-issue.yml` files/updates a `workflow-failure`-labeled issue on a `schedule`/`workflow_dispatch` failure | Issues search: `label:workflow-failure "OpenSSF Scorecard" in:title`, or Actions → `OpenSSF Scorecard` → latest run |

`workflow-failure-issue.yml` only fires on `schedule`/`workflow_dispatch` runs (not on
`push`/`pull_request` runs of `codeql.yml`/`scorecard.yml`), and only files/comments once
per still-open issue — it does not re-notify beyond that comment. The Actions tab
remains the ground-truth signal; use the table above as the primary alert path and the
Actions tab as a fallback if you suspect the alert workflow itself failed to run.

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
4. For `scorecard.yml` specifically: check the "Pull down action image" step log first.
   A `docker pull gcr.io/openssf/scorecard-action:...` failure with
   `denied: This API method requires billing to be enabled` (the confirmed cause of the
   ongoing failures since 2026-09-02, see [Current Status](#current-status)) is an
   upstream GCR/vendor billing issue, not something this repo or
   `kubestellar/infra`'s `reusable-scorecard.yml` can fix directly — do not spend time
   re-pinning the action version. Confirm by checking whether other
   `kubestellar/*` repos using the same reusable workflow show the identical pull
   error at the same time; if so, escalate upstream (ossf/scorecard-action) rather than
   treating it as repo-local.

## Recovery

- **`fuzz.yml` crash:** file (or update) an issue with the reproducer input from the
  log, then fix the underlying parsing code the fuzz target exercises
  (`test_json_parsing` in the generated `fuzz/fuzz_json_parser.py`).
- **`codeql.yml`/`scorecard.yml` failure:** apply the fix implied by the log (action
  version bump, permission change, etc.) and confirm the next scheduled or manually
  dispatched run is green.
- The `workflows`-permission-gated fix landed in
  [PR #758](https://github.com/kubestellar/console-marketplace/pull/758), closing
  [#607](https://github.com/kubestellar/console-marketplace/issues/607) and
  [#573](https://github.com/kubestellar/console-marketplace/issues/573) via the
  `workflow-failure-issue.yml` addition — see [Current Status](#current-status) above
  and SLO 5/SLO 6 in [`SLO.md`](./SLO.md#slis-and-slos), both now updated to reflect the
  mechanism is live.

## Verifying Recovery

- Confirm the next scheduled run of the affected workflow completes green and, for
  `fuzz.yml`, that the log shows no Atheris crash output above the completion message.

## Stale Issues Workflow

`.github/workflows/stale.yml` had the same gap as the three workflows above. It is now
covered by the same `workflow-failure-issue.yml` mechanism (merged in
[PR #758](https://github.com/kubestellar/console-marketplace/pull/758), closing
[#607](https://github.com/kubestellar/console-marketplace/issues/607)): a `schedule`/
`workflow_dispatch` failure of `Stale Issues` files or updates a `workflow-failure`-
labeled issue the same way as `fuzz.yml`/`codeql.yml`/`scorecard.yml` above.

| Workflow | Schedule (UTC) | Signal | Where to look |
|---|---|---|---|
| `stale.yml` | Daily 00:00 | `workflow-failure-issue.yml` files/updates a `workflow-failure`-labeled issue on a `schedule`/`workflow_dispatch` failure | Issues search: `label:workflow-failure "Stale Issues" in:title`, or Actions → `Stale Issues` → latest run |

A silent daily failure here means stale issues/PRs stop being triaged. Triage and
recovery follow the same pattern as `codeql.yml`/`scorecard.yml` above: open the failed
run's log, identify the cause (usually a reusable-workflow break or a permissions
change), fix it, and confirm the next scheduled or `workflow_dispatch`-triggered run is
green.

## Recording the Incident

Use the [Incident Report issue template](../.github/ISSUE_TEMPLATE/incident-report.md)
(applies `lifecycle/frozen`) to capture the timeline, impact, root cause, and follow-up
actions for any confirmed crash or missed detection window. The template's front matter
also names an `incident` label, but that label does not exist in this repository, so
GitHub silently drops it when the issue is created; add it by hand if a maintainer has
since created it (see #691).

**When to file:** don't wait for a human/agent to notice on their own. File an Incident
Report as soon as a failure in this runbook's scope (`fuzz.yml`, `codeql.yml`,
`scorecard.yml`, or `stale.yml`) has **persisted past that workflow's next scheduled
run without recovering** — i.e., two or more consecutive scheduled failures, not just
one. A single red run can be a transient infra flake; a second consecutive failure of
the same scheduled workflow is a confirmed missed-detection-window incident under this
runbook's own scope and should get a filed Incident Report, updated as the incident
continues (see [issue #712](https://github.com/kubestellar/console-marketplace/issues/712)
for the first incident recorded under this guidance — the `scorecard.yml` outage
described in [Current Status](#current-status) above went 13.5+ days and 70
consecutive failed runs before an Incident Report was filed for it, which is the gap
this threshold is meant to close).

**When a postmortem is also required:** file a postmortem (using
[`postmortem-template.md`](./postmortem-template.md), saved to
`runbooks/postmortems/YYYY-MM-DD-<short-title>.md` and linked from the closing
comment of the Incident Report) once a pipeline/scheduled-scan incident under this
runbook's scope has been open for **more than 7 days, or has produced 3 or more
consecutive weekly-schedule failures** (for `fuzz.yml`/`codeql.yml`/`scorecard.yml`)
**or a comparable multi-day streak of daily failures** (for `stale.yml`) — whichever
threshold the incident crosses first. This mirrors the existing content-incident
threshold in [`registry-incident-response.md#postmortem-template`](./registry-incident-response.md#postmortem-template)
("user-visible for more than a few hours"), scaled to this runbook's weekly/daily
cadence instead of hours, so a long-running silent-alert-gap incident like the one in
[#712](https://github.com/kubestellar/console-marketplace/issues/712) (14+ days, 79+
consecutive failed runs as of this writing) gets the same postmortem treatment a
content incident of comparable duration would receive, rather than being tracked only
in an ever-growing Incident Report issue with no closing analysis.
