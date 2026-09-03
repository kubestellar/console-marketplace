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
| 5 | Time from `fuzz.yml`/`codeql.yml`/`scorecard.yml` (weekly scheduled scans) failing to complete, to an alert | **Not yet defined** | None — no `workflow_run` alert or dedicated runbook exists for these three workflows | **None yet** — see [issue #565](https://github.com/kubestellar/console-marketplace/issues/565) |

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
- **SLO 5** is not yet defined at all: `fuzz.yml`, `codeql.yml`, and `scorecard.yml` are
  weekly `schedule:`-triggered workflows with no companion failure alert and no runbook,
  so a silent failure in any of them (infra flake, dependency break, action version bump)
  is only visible as a red run in the Actions tab — see
  [issue #565](https://github.com/kubestellar/console-marketplace/issues/565). `fuzz.yml`
  additionally masks real Atheris-detected crashes with `|| true` after its fuzz-run step,
  so even a genuine crash produces a green run today.

## Reviewing These SLOs

Re-check this table whenever:
- `marketplace-auto-qa.yml` or its scan step (`scripts/validate-marketplace.py`) changes.
- Branch protection settings on `main` change.
- A new scheduled workflow is added that can affect content reaching users.

Do not mark SLO 2 or SLO 3 as met until the corresponding gap above is actually closed —
verify by re-reading the referenced workflow/settings, not by assuming a linked issue was
resolved.
