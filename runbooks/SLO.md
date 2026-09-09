# Marketplace Operational SLOs

**Repository:** `kubestellar/console-marketplace`
**Scope:** This repo is config-only (no runtime backend, no service to keep "up" — see
[issue #542](https://github.com/kubestellar/console-marketplace/issues/542)). Its
operational risk is entirely about *content* reaching users through
`registry.json`/`dashboards/`/`presets/`/`card-presets/`/`themes/`, and about the
detection pipelines that catch bad content. These SLOs define how quickly a problem
should be detected and resolved, not any request-latency/availability target.

---

## SLIs and SLOs

| # | SLI (what we measure) | SLO (target) | Detection mechanism | Runbook |
|---|---|---|---|---|
| 1 | Time from a broken `registry.json`/preset/dashboard/theme merge landing on `main` to a filed `[Auto-QA]` finding | ≤ 24h (one nightly scan cycle) | `marketplace-auto-qa.yml` nightly scan (`0 6 * * *`) | [`registry-incident-response.md`](./registry-incident-response.md) |
| 2 | Time from a PR-time check failure (`Validate JSON` / `Marketplace Quality Gate`) to that PR being blocked from merging | 0 (should never merge with failing checks) | PR status checks | [`registry-incident-response.md`](./registry-incident-response.md) — **not yet met**: checks are not merge-blocking today (see [issue #560](https://github.com/kubestellar/console-marketplace/issues/560)) |
| 3 | Time from the nightly Auto-QA *pipeline itself* crashing (not a content finding) to an alert | ≤ 24h | Proposed `Alert on scan pipeline failure` step | [`auto-qa-pipeline-failure.md`](./auto-qa-pipeline-failure.md) — **not yet met**: the step is not merged (see [issue #545](https://github.com/kubestellar/console-marketplace/issues/545)); today this failure mode is silent and only detectable by noticing an unusual gap in `[Auto-QA]` findings |
| 4 | Time from a rollback PR being opened to it merging, for a confirmed user-visible break | Same-day (maintainer-assisted merge, since checks aren't merge-blocking) | Manual, maintainer-driven | [`registry-incident-response.md`](./registry-incident-response.md#rolling-back) |
| 5 | Time from `fuzz.yml`/`codeql.yml`/`scorecard.yml` (weekly scheduled scans) failing to complete, to an alert | **Not yet defined** | None — no `workflow_run` alert exists for these three workflows | [`scheduled-scan-alert-gap.md`](./scheduled-scan-alert-gap.md) — **not yet met**: documents manual detection only; see [issue #573](https://github.com/kubestellar/console-marketplace/issues/573) |
| 6 | Time from `stale.yml` (daily scheduled stale-issue/PR triage) failing to complete, to an alert | **Not yet defined** | None — no `workflow_run` alert exists for this workflow either | [`scheduled-scan-alert-gap.md`](./scheduled-scan-alert-gap.md#stale-issues-workflow) — **not yet met**: same undocumented gap as SLO 5; see [issue #598](https://github.com/kubestellar/console-marketplace/issues/598) |
| 7 | Whether a completed `fuzz.yml` run left a bounded, machine-readable record of what it tested (corpus files fuzzed, edge cases tested, pass/fail) | Every run's Summary tab shows this record | None today — only free-text `echo` lines in the raw step log | [`fuzz-yml-ci-summary-gap.md`](./fuzz-yml-ci-summary-gap.md) — **not yet met**: fix is a validated, ready-to-apply diff blocked on the same `workflows` permission gap as SLO 3; see [issue #597](https://github.com/kubestellar/console-marketplace/issues/597) |
| 8 | Whether a completed `validate-json.yml` run left a bounded, machine-readable record of what it checked (registry/dashboard files checked, invalid/format-error counts, pass/fail) | Every run's Summary tab shows this record | None today — only free-text `echo`/`print` lines in the raw step log, and an early failure aborts the job before later steps report anything | [`validate-json-ci-summary-gap.md`](./validate-json-ci-summary-gap.md) — **not yet met**: fix is a validated, ready-to-apply diff blocked on the same `workflows` permission gap as SLO 3 and SLO 7; see [issue #621](https://github.com/kubestellar/console-marketplace/issues/621) |

## Why SLOs 2, 3, 5, 6, 7, and 8 Are Reported as Unmet

This document intentionally states the current gaps rather than describing an
aspirational, already-healthy state:

- **SLO 2** depends on applying `required_status_checks` in the live branch protection
  settings, which only a repository administrator can do (tracked in
  [`branch-protection-policy.md`](../.github/branch-protection-policy.md) and
  [issue #560](https://github.com/kubestellar/console-marketplace/issues/560)).
- **SLO 3** depends on a workflow-file change to `.github/workflows/marketplace-auto-qa.yml`
  that automation cannot currently land: the token used by prior automated PRs lacks the
  `workflows` GitHub App permission needed to touch files under `.github/workflows/`
  (see the [Current Status](./auto-qa-pipeline-failure.md#current-status) note in the
  pipeline-failure runbook, and [issue #545](https://github.com/kubestellar/console-marketplace/issues/545)
  for the exact proposed diff). Until a maintainer applies it manually, the only working
  detection signal for a crashed scan is noticing an unusual gap in `[Auto-QA]` findings.
- **SLO 5** is not yet defined at all: `fuzz.yml`, `codeql.yml`, and `scorecard.yml` are
  weekly `schedule:`-triggered workflows with no companion failure alert, so a silent
  failure in any of them (infra flake, dependency break, action version bump) is only
  visible as a red run in the Actions tab — see
  [issue #573](https://github.com/kubestellar/console-marketplace/issues/573) and the
  manual detection steps in
  [`scheduled-scan-alert-gap.md`](./scheduled-scan-alert-gap.md). `fuzz.yml`
  additionally masks real Atheris-detected crashes with `|| true` after its fuzz-run step,
  so even a genuine crash produces a green run today. **This gap is confirmed active, not
  hypothetical:** as of 2026-09-07, `scorecard.yml` has failed on every run since
  2026-09-02T12:22:31Z (20+ consecutive red runs, last success 2026-08-31T18:13:01Z) due
  to an upstream GCR billing gate on the `ossf/scorecard-action` image, with zero
  notification of the 6-day outage — see the
  [Current Status](./scheduled-scan-alert-gap.md#current-status) update in
  `scheduled-scan-alert-gap.md`.
- **SLO 6** is the same undocumented-gap situation as SLO 5, for a different scheduled
  workflow: `stale.yml` runs daily via
  `kubestellar/infra/.github/workflows/reusable-stale.yml` with no `workflow_run` alert,
  issue-filing step, or other notification on failure — see
  [issue #598](https://github.com/kubestellar/console-marketplace/issues/598) and
  [`scheduled-scan-alert-gap.md#stale-issues-workflow`](./scheduled-scan-alert-gap.md#stale-issues-workflow).
- **SLO 7** depends on the same class of workflow-file change as SLO 3: a validated
  diff exists (adding a final `if: always()` summary step to `fuzz.yml`'s `fuzz-json`
  job) but eight prior automated attempts to push it were all rejected by GitHub for
  lacking the `workflows` App permission — see
  [`fuzz-yml-ci-summary-gap.md`](./fuzz-yml-ci-summary-gap.md) for the preserved,
  ready-to-apply diff and [issue #597](https://github.com/kubestellar/console-marketplace/issues/597).
- **SLO 8** is the same blocked-fix situation as SLO 7, for `validate-json.yml`: a
  validated diff exists (adding step `id`s/outputs to the three existing steps and
  a final `if: always()` summary step to the `validate` job) but automation cannot
  push it for the same `workflows` App permission reason — see
  [`validate-json-ci-summary-gap.md`](./validate-json-ci-summary-gap.md) for the
  preserved, ready-to-apply diff and [issue #621](https://github.com/kubestellar/console-marketplace/issues/621).

## Reviewing These SLOs

Re-check this table whenever:
- `marketplace-auto-qa.yml` or its scan step (`scripts/validate-marketplace.py`) changes.
- Branch protection settings on `main` change.
- A new scheduled workflow is added that can affect content reaching users.

Do not mark SLO 2, SLO 3, SLO 5, SLO 6, SLO 7, or SLO 8 as met until the corresponding
gap above is actually closed — verify by re-reading the referenced workflow/settings,
not by assuming a linked issue was resolved.

