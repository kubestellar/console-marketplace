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

**Fix applied.** [#969](https://github.com/kubestellar/console-marketplace/issues/969)
merged the two-part fix from [#941](https://github.com/kubestellar/console-marketplace/issues/941):

1. Added `"Open Issue on Workflow Failure"` to the `workflow_run.workflows` list.
2. Added `github.event.workflow_run.name == 'Open Issue on Workflow Failure'` as
   an additional `||` branch in the job's `if:` guard, enabling self-triggered
   runs to be monitored.

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
