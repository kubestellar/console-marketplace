# Workflow-Failure-Monitor Self-Monitoring Gap Runbook

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `.github/workflows/workflow-failure-issue.yml`

---

## Scope Note

This runbook covers a gap in the alerting mechanism itself, not in any of the
workflows it watches. See [`scheduled-scan-alert-gap.md`](./scheduled-scan-alert-gap.md)
and [`main-push-ci-failure-gap.md`](./main-push-ci-failure-gap.md) for the
original gaps `workflow-failure-issue.yml` was built to close.

## Current Status

**Gap confirmed, fix not yet applied.** `workflow-failure-issue.yml`'s
`workflow_run` trigger watches `JSON Fuzzing`, `CodeQL Analysis`,
`OpenSSF Scorecard`, `Stale Issues`, `Marketplace Auto-QA`, `Python Unit Tests`,
and `TypeScript Unit Tests` — but not its own name, `Open Issue on Workflow
Failure`. If this workflow fails (`gh` auth error, rate limit, a bug in one of
its steps), nothing opens an issue or posts a comment anywhere; the failure is
visible only by manually checking the Actions tab, which is exactly the gap
this mechanism exists to close for every other monitored workflow.

See [issue #941](https://github.com/kubestellar/console-marketplace/issues/941)
for the full finding and the exact two-part YAML diff needed:

1. Add `"Open Issue on Workflow Failure"` to the `workflow_run.workflows` list.
2. Add `github.event.workflow_run.name == 'Open Issue on Workflow Failure'` as an
   additional `||` branch in the job's `if:` guard, since a self-triggered run's
   originating event is `workflow_run`, not `schedule`/`workflow_dispatch`/`push`.

That diff touches only `.github/workflows/workflow-failure-issue.yml` and must
be applied by a human or an agent whose GitHub App token carries the
`workflows` permission — it cannot be pushed by the `telemetry` agent in its
current (`contributor`-tier, `ISSUES_AND_PRS`) mode.

## Detecting a Failure Manually (until the fix lands)

1. Go to the [Actions tab](https://github.com/kubestellar/console-marketplace/actions/workflows/workflow-failure-issue.yml)
   and filter to the `Open Issue on Workflow Failure` workflow.
2. Look for any run with a red ✗ conclusion.
3. If found, check whether the underlying monitored-workflow failure it should
   have reported on already has an open `workflow-failure`-labeled issue; if
   not, file one manually following the same template `workflow-failure-issue.yml`
   uses (see the "Open new issue" step in the workflow source for the format).

## Recovery

Once [issue #941](https://github.com/kubestellar/console-marketplace/issues/941)'s
diff is applied and merged, this runbook's "Current Status" should be updated to
RESOLVED, citing the merging PR and run number.
