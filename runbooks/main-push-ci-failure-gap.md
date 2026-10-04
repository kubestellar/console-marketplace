# Main-Push CI Failure Alert Gap Runbook

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `.github/workflows/python-unit-tests.yml`,
`.github/workflows/ts-unit-tests.yml`, and the `push`-triggered legs of
`.github/workflows/codeql.yml` and `.github/workflows/scorecard.yml`

---

## Scope Note

This runbook covers CI workflows that run on `push` to `main` (i.e. after a PR has
already merged) and are now covered by an automated failure alert — distinct from
[`scheduled-scan-alert-gap.md`](./scheduled-scan-alert-gap.md), which covers the same
workflows' `schedule`/`workflow_dispatch` legs, and already-alerted via
`.github/workflows/workflow-failure-issue.yml`.

`python-unit-tests.yml` and `ts-unit-tests.yml` both run on `pull_request` **and**
`push: branches: [main]` (so a merge that passed PR checks on a stale base, or a direct
push, can still break `main`). `.github/workflows/workflow-failure-issue.yml` now
watches those unit-test workflows, plus the already-watched CodeQL and Scorecard
workflows, and opens/comments on a `workflow-failure` issue when their `push` run fails
on `main`.

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

**Gap closed for monitored `main` pushes.** `.github/workflows/workflow-failure-issue.yml`
now includes `Python Unit Tests` and `TypeScript Unit Tests` in its `workflow_run`
watch list and allows failed `push` runs only when
`github.event.workflow_run.head_branch == 'main'`.

## Detecting a Failure Manually

If the alert is delayed or unavailable, check for a red `main` push run directly:

```bash
gh run list --repo kubestellar/console-marketplace --branch main --event push \
  --json name,conclusion,createdAt,databaseId \
  --jq '.[] | select(.conclusion=="failure")'
```

If a failure is found, open a `[operations]`- or role-appropriate issue immediately
(do not assume someone else has already noticed) and link the failing run.
