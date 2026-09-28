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
| 5 | Time from `fuzz.yml`/`codeql.yml`/`scorecard.yml` (weekly scheduled scans) failing to complete, to an alert | Within one `workflow_run` `completed` event of the failing run (near-immediate) | `.github/workflows/workflow-failure-issue.yml`'s `workflow_run` trigger, merged in [PR #758](https://github.com/kubestellar/console-marketplace/pull/758) | [`scheduled-scan-alert-gap.md`](./scheduled-scan-alert-gap.md) — **met**: mechanism is live and closed [issue #573](https://github.com/kubestellar/console-marketplace/issues/573); not yet observed firing on a real failure (see [Current Status](./scheduled-scan-alert-gap.md#current-status)) |
| 6 | Time from `stale.yml` (daily scheduled stale-issue/PR triage) failing to complete, to an alert | Within one `workflow_run` `completed` event of the failing run (near-immediate) | Same `workflow-failure-issue.yml` mechanism as SLO 5, merged in [PR #758](https://github.com/kubestellar/console-marketplace/pull/758) | [`scheduled-scan-alert-gap.md`](./scheduled-scan-alert-gap.md#stale-issues-workflow) — **met**: closed [issue #607](https://github.com/kubestellar/console-marketplace/issues/607); not yet observed firing on a real failure |
| 7 | Whether a completed `fuzz.yml` run left a bounded, machine-readable record of what it tested (corpus files fuzzed, edge cases tested, pass/fail) | Every run's Summary tab shows this record | `Fuzzing observability summary` step calling `scripts/fuzz_summary.py`, `if: always()` | [`fuzz-yml-ci-summary-gap.md`](./fuzz-yml-ci-summary-gap.md) — **met**: applied in commit `378cfdf`, closing [issue #597](https://github.com/kubestellar/console-marketplace/issues/597) |
| 8 | Whether a completed `validate-json.yml` run left a bounded, machine-readable record of what it checked (registry entries checked, dashboards checked, error count, pass/fail) | Every run's Summary tab shows this record | `Validate JSON observability summary` step calling `scripts/validate_json_summary.py`, `if: always()` | [`validate-json-ci-summary-gap.md`](./validate-json-ci-summary-gap.md) — **met**: applied in commit `378cfdf`, closing [issue #621](https://github.com/kubestellar/console-marketplace/issues/621) |
| 9 | Whether a completed `python-unit-tests.yml` / `ts-unit-tests.yml` run left a bounded, machine-readable record of pass/fail counts | Every run's Summary tab shows this record | Python: root `conftest.py` `pytest_terminal_summary`/`pytest_sessionfinish` hook (no workflow edit needed). TS: `TypeScript unit test observability summary` step, `if: always()` | [`python-ts-unit-tests-ci-summary-gap.md`](./python-ts-unit-tests-ci-summary-gap.md) — **met**: Python side closed via merged [issue #636](https://github.com/kubestellar/console-marketplace/issues/636) fix (`conftest.py`); TS side applied in commit `cd698b0`, also closing #636 |

## Why SLOs 2 and 3 Are Reported as Unmet

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
- **SLO 5** and **SLO 6** are now met: `.github/workflows/workflow-failure-issue.yml`
  (merged in [PR #758](https://github.com/kubestellar/console-marketplace/pull/758),
  closing [issue #573](https://github.com/kubestellar/console-marketplace/issues/573)
  and [issue #607](https://github.com/kubestellar/console-marketplace/issues/607))
  subscribes to `workflow_run` `completed` events for `JSON Fuzzing`,
  `CodeQL Analysis`, `OpenSSF Scorecard`, and `Stale Issues`, and files or updates a
  `workflow-failure`-labeled issue on any `schedule`/`workflow_dispatch` failure.
  `fuzz.yml` also no longer masks real Atheris-detected crashes with `|| true` — see
  [`scheduled-scan-alert-gap.md`](./scheduled-scan-alert-gap.md) for the mechanism
  detail. Neither has yet been observed firing on a genuine failure in production, so
  re-verify against the workflow file (not just this note) before relying on it for an
  active incident. `scorecard.yml`'s GCR-billing-gate outage (documented in the
  runbook's [Current Status](./scheduled-scan-alert-gap.md#current-status)) is a
  separate problem that this alert mechanism only makes *visible*, not fixed —
  as of 2026-09-26 both the `push`-triggered runs and the weekly
  `schedule`-triggered leg (run 35567533814, 2026-09-21T06:13:34Z) have
  reconfirmed recovery; see the runbook's dated update for the outage's full
  closure.
- **SLO 7** and **SLO 8** are now met: the ready-to-apply diffs were applied
  directly to `.github/workflows/fuzz.yml` and `.github/workflows/validate-json.yml`
  in commit `378cfdf` ("wire step-summary into fuzz.yml and validate-json.yml"),
  landed by a differently-scoped automation run that carries the `workflows`
  GitHub App permission — not by telemetry. See
  [`fuzz-yml-ci-summary-gap.md`](./fuzz-yml-ci-summary-gap.md) and
  [`validate-json-ci-summary-gap.md`](./validate-json-ci-summary-gap.md) for the
  applied diffs, and [issue #597](https://github.com/kubestellar/console-marketplace/issues/597) /
  [issue #621](https://github.com/kubestellar/console-marketplace/issues/621), both closed.
- **SLO 9** is met on both halves. Its Python half was met first: a merged
  `conftest.py` hook (closing
  [issue #636](https://github.com/kubestellar/console-marketplace/issues/636))
  writes a structured summary for every `python-unit-tests.yml` run with no
  workflow-file edit required. Its TypeScript half was the same class of gap as
  SLO 7/8 and is now closed the same way: the ready-to-apply diff was applied to
  `.github/workflows/ts-unit-tests.yml` in commit `cd698b0` ("add CI summary to
  ts-unit-tests.yml") — see
  [`python-ts-unit-tests-ci-summary-gap.md`](./python-ts-unit-tests-ci-summary-gap.md)
  for both applied diffs.

## Reviewing These SLOs

Re-check this table whenever:
- `marketplace-auto-qa.yml` or its scan step (`scripts/validate-marketplace.py`) changes.
- Branch protection settings on `main` change.
- A new scheduled workflow is added that can affect content reaching users.

Do not mark SLO 2 or SLO 3 as met until the corresponding gap above is actually
closed — verify by re-reading the referenced workflow/settings, not by assuming a
linked issue was resolved. SLO 5, SLO 6, SLO 7, SLO 8, and SLO 9 are marked met above
because their mechanisms are merged and present on `main` today — re-verify the
referenced workflow file(s) still contain the summary/alert step(s) before relying on
this note.
