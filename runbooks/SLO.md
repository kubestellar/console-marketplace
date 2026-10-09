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
| 2 | Time from a PR-time check failure (`Validate JSON` / `Marketplace Quality Gate`) to that PR being blocked from merging | 0 (should never merge with failing checks) | PR status checks | [`registry-incident-response.md`](./registry-incident-response.md) — **not yet met**: checks are not merge-blocking today (the documented recommendation was fixed in [issue #560](https://github.com/kubestellar/console-marketplace/issues/560) (closed), but applying it to the *live* branch protection settings is a separate, still-pending admin action — tracked in [issue #935](https://github.com/kubestellar/console-marketplace/issues/935); the prior trackers, #866 and #932, are both closed without the live setting ever being confirmed applied, so do not treat either's closed state as evidence) |
| 3 | Time from the nightly Auto-QA *pipeline itself* crashing (not a content finding) to an alert | ≤ 24h | `Alert on scan pipeline failure` step in `marketplace-auto-qa.yml`, merged in [PR #755](https://github.com/kubestellar/console-marketplace/pull/755) | [`auto-qa-pipeline-failure.md`](./auto-qa-pipeline-failure.md) — **met**: mechanism is live and closed [issue #545](https://github.com/kubestellar/console-marketplace/issues/545); files/updates an `auto-qa:pipeline-failure`-labeled issue whenever the scan step fails (see [Current Status](./auto-qa-pipeline-failure.md#current-status)); not yet observed firing on a real failure |
| 4 | Time from a rollback PR being opened to it merging, for a confirmed user-visible break | Same-day (maintainer-assisted merge, since checks aren't merge-blocking) | Manual, maintainer-driven | [`registry-incident-response.md`](./registry-incident-response.md#rolling-back) |
| 5 | Time from `fuzz.yml`/`codeql.yml`/`scorecard.yml` (weekly scheduled scans) failing to complete, to an alert | Within one `workflow_run` `completed` event of the failing run (near-immediate) | `.github/workflows/workflow-failure-issue.yml`'s `workflow_run` trigger, merged in [PR #758](https://github.com/kubestellar/console-marketplace/pull/758) | [`scheduled-scan-alert-gap.md`](./scheduled-scan-alert-gap.md) — **met**: mechanism is live and closed [issue #573](https://github.com/kubestellar/console-marketplace/issues/573); not yet observed firing on a real failure (see [Current Status](./scheduled-scan-alert-gap.md#current-status)) |
| 6 | Time from `stale.yml` (daily scheduled stale-issue/PR triage) failing to complete, to an alert | Within one `workflow_run` `completed` event of the failing run (near-immediate) | Same `workflow-failure-issue.yml` mechanism as SLO 5, merged in [PR #758](https://github.com/kubestellar/console-marketplace/pull/758) | [`scheduled-scan-alert-gap.md`](./scheduled-scan-alert-gap.md#stale-issues-workflow) — **met**: closed [issue #607](https://github.com/kubestellar/console-marketplace/issues/607); not yet observed firing on a real failure |
| 7 | Whether a completed `fuzz.yml` run left a bounded, machine-readable record of what it tested (corpus files fuzzed, edge cases tested, pass/fail) | Every run's Summary tab shows this record | `Fuzzing observability summary` step calling `scripts/fuzz_summary.py`, `if: always()` | [`fuzz-yml-ci-summary-gap.md`](./fuzz-yml-ci-summary-gap.md) — **met**: applied in commit `378cfdf`, closing [issue #597](https://github.com/kubestellar/console-marketplace/issues/597) |
| 8 | Whether a completed `validate-json.yml` run left a bounded, machine-readable record of what it checked (registry entries checked, dashboards checked, error count, pass/fail) | Every run's Summary tab shows this record | `Validate JSON observability summary` step calling `scripts/validate_json_summary.py`, `if: always()` | [`validate-json-ci-summary-gap.md`](./validate-json-ci-summary-gap.md) — **met**: applied in commit `378cfdf`, closing [issue #621](https://github.com/kubestellar/console-marketplace/issues/621) |
| 9 | Whether a completed `python-unit-tests.yml` / `ts-unit-tests.yml` run left a bounded, machine-readable record of pass/fail counts | Every run's Summary tab shows this record | Python: root `conftest.py` `pytest_terminal_summary`/`pytest_sessionfinish` hook (no workflow edit needed). TS: `TypeScript unit test observability summary` step, `if: always()` | [`python-ts-unit-tests-ci-summary-gap.md`](./python-ts-unit-tests-ci-summary-gap.md) — **met**: Python side closed via merged [issue #636](https://github.com/kubestellar/console-marketplace/issues/636) fix (`conftest.py`); TS side applied in commit `cd698b0`, also closing #636 |
| 10 | Time from a `push`-to-`main` CI failure on `python-unit-tests.yml` / `ts-unit-tests.yml` / `codeql.yml` / `scorecard.yml` to an alert | Within one `workflow_run` `completed` event of the failing run (near-immediate) | `workflow-failure-issue.yml`'s `workflows:` watch list now includes `Python Unit Tests` and `TypeScript Unit Tests`, and its `if:` guard allows `push` events on `head_branch == 'main'` (in addition to `schedule`/`workflow_dispatch`), merged in [PR #892](https://github.com/kubestellar/console-marketplace/pull/892) | [`main-push-ci-failure-gap.md`](./main-push-ci-failure-gap.md) — **met**: originally confirmed by a real undetected incident (commit `27b7773` broke `main` for ~2h40m on 2026-10-03, caught only by manual follow-up in [issue #884](https://github.com/kubestellar/console-marketplace/issues/884)); closed [issue #890](https://github.com/kubestellar/console-marketplace/issues/890) |
| 11 | Time from `workflow-failure-issue.yml` (the alert mechanism for SLOs 5, 6, and 10) itself failing, to an alert | Within one `workflow_run` `completed` event of the failing run (near-immediate) | Not yet implemented: the workflow does not watch its own name | [`workflow-failure-issue-self-monitoring-gap.md`](./workflow-failure-issue-self-monitoring-gap.md) — **not yet met**: gap confirmed in [issue #941](https://github.com/kubestellar/console-marketplace/issues/941), which has the exact two-part YAML diff; cannot be applied by the `telemetry` agent (`.github/workflows/**` requires the `workflows` App permission) |

## Why SLO 2 Is Reported as Unmet

This document intentionally states the current gaps rather than describing an
aspirational, already-healthy state:

- **SLO 2** depends on applying `required_status_checks` in the live branch protection
  settings, which only a repository administrator can do (the setting itself is
  documented in [`branch-protection-policy.md`](../.github/branch-protection-policy.md)).
  [Issue #560](https://github.com/kubestellar/console-marketplace/issues/560) tracked —
  and is now closed for — the earlier, narrower gap of the *documented recommendation*
  itself defaulting to `required_status_checks: null`; it does not track, and was never
  intended to track, whether that corrected recommendation has actually been applied to
  the live settings on `main`. [Issue #866](https://github.com/kubestellar/console-marketplace/issues/866)
  was filed to replace #560 as that tracker, but was itself auto-closed by its own
  doc-currency fix PR (#867) using a `Fixes #866` closing keyword — before the live
  setting was ever applied or verified. [Issue #932](https://github.com/kubestellar/console-marketplace/issues/932)
  was filed to replace #866, and its companion doc PR (#933) deliberately avoided any
  closing keyword — but #932 was still closed when an unrelated PR (#934) merged,
  because #934 had been manually linked to #932 via GitHub's "Development" sidebar
  panel (confirmed via `closingIssuesReferences` on #934, whose body/commit text used
  only `Refs #932`, no closing verb). That remaining, still-open admin action is now
  tracked in [issue #935](https://github.com/kubestellar/console-marketplace/issues/935).
  Do not treat #560's, #866's, or #932's closed state as evidence this SLO is met;
  verify by re-reading the live branch protection settings on `main` directly.
- **SLO 3** is met: the `Alert on scan pipeline failure` step landed in
  `.github/workflows/marketplace-auto-qa.yml` in
  [PR #755](https://github.com/kubestellar/console-marketplace/pull/755), closing
  [issue #545](https://github.com/kubestellar/console-marketplace/issues/545). It runs
  `if: always() && steps.scan.outcome == 'failure'` and files/updates an
  `auto-qa:pipeline-failure`-labeled issue whenever the scan step fails — see the
  [Current Status](./auto-qa-pipeline-failure.md#current-status) note in the
  pipeline-failure runbook. Not yet observed firing on a real failure.
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

- **SLO 10** is now met: `workflow-failure-issue.yml`'s `workflows:` watch list
  includes `Python Unit Tests` and `TypeScript Unit Tests`, and its `if:` guard
  allows failed `push` runs when `head_branch == 'main'` (in addition to
  `schedule`/`workflow_dispatch`), merged in
  [PR #892](https://github.com/kubestellar/console-marketplace/pull/892), closing
  [issue #890](https://github.com/kubestellar/console-marketplace/issues/890). The
  gap was originally confirmed by a real undetected incident — commit `27b7773`
  breaking `Python Unit Tests` on a `main` push for ~2h40m on 2026-10-03, caught
  only by manual follow-up in
  [issue #884](https://github.com/kubestellar/console-marketplace/issues/884) —
  see [`main-push-ci-failure-gap.md`](./main-push-ci-failure-gap.md) for the
  mechanism detail and manual-fallback detection command.

## Reviewing These SLOs

Re-check this table whenever:
- `marketplace-auto-qa.yml` or its scan step (`scripts/validate-marketplace.py`) changes.
- Branch protection settings on `main` change.
- A new scheduled workflow is added that can affect content reaching users.

Do not mark SLO 2 as met until the corresponding gap above is actually
closed — verify by re-reading the referenced workflow/settings, not by assuming a
linked issue was resolved. SLO 3, SLO 5, SLO 6, SLO 7, SLO 8, and SLO 9 are marked met above
because their mechanisms are merged and present on `main` today — re-verify the
referenced workflow file(s) still contain the summary/alert step(s) before relying on
this note.
