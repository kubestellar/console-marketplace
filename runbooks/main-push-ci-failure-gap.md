# Main-Push CI Failure Alert Gap Runbook

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `.github/workflows/python-unit-tests.yml`,
`.github/workflows/ts-unit-tests.yml`, and the `push`-triggered legs of
`.github/workflows/codeql.yml` and `.github/workflows/scorecard.yml`

---

## Scope Note

This runbook covers CI workflows that run on `push` to `main` (i.e. after a PR has
already merged) but have **no automated failure alert** — distinct from
[`scheduled-scan-alert-gap.md`](./scheduled-scan-alert-gap.md), which covers the same
workflows' `schedule`/`workflow_dispatch` legs, and already-alerted via
`.github/workflows/workflow-failure-issue.yml`.

`python-unit-tests.yml` and `ts-unit-tests.yml` both run on `pull_request` **and**
`push: branches: [main]` (so a merge that passed PR checks on a stale base, or a direct
push, can still break `main`). `codeql.yml` and `scorecard.yml` are already in
`workflow-failure-issue.yml`'s `workflows:` watch list, but that job's `if:` condition
only matches `github.event.workflow_run.event == 'schedule'` or `'workflow_dispatch'` —
it explicitly excludes `push` — so a push-triggered failure on any of these four
workflows produces **zero** automated notification today.

## Current Status

**Gap confirmed by a real, undetected incident.** Commit `27b777376a745e39a20b866708454e4e68795af4`
("Consolidate validator tests by function instead of coverage pass", #883) landed on
`main` via push at 2026-10-03T05:12:30Z and broke `Python Unit Tests`
(run [37099079391](https://github.com/kubestellar/console-marketplace/actions/runs/37099079391),
job `Validator Unit Tests`, conclusion `failure`). No `workflow-failure`-labeled issue
was filed — `workflow-failure-issue.yml` does not watch `python-unit-tests.yml` at all,
and even if it did, its `if:` guard would have skipped a `push` event. `main` stayed red
for roughly 2h40m until a human/agent noticed it independently and filed
[issue #884](https://github.com/kubestellar/console-marketplace/issues/884) at
07:48:53Z; the fix merged in [PR #885](https://github.com/kubestellar/console-marketplace/pull/885),
restoring green at run
[37107961200](https://github.com/kubestellar/console-marketplace/actions/runs/37107961200)
(07:55:24Z). The detection step in that window was entirely manual.

**Fix is not yet applied** — see the tracking issue linked from
[`SLO.md`](./SLO.md#slis-and-slos) for the ready-to-apply diff. Editing
`.github/workflows/workflow-failure-issue.yml` requires the `workflows` GitHub App
permission, which this finding's filing agent does not hold; a human or an
appropriately-permissioned agent must apply it.

## Detecting a Failure Today (Manual Fallback)

Until the alert is wired up, check for a red `main` push run directly:

```bash
gh run list --repo kubestellar/console-marketplace --branch main --event push \
  --json name,conclusion,createdAt,databaseId \
  --jq '.[] | select(.conclusion=="failure")'
```

If a failure is found, open a `[operations]`- or role-appropriate issue immediately
(do not assume someone else has already noticed) and link the failing run.
