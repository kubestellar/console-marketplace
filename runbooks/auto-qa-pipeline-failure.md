# Auto-QA Pipeline Failure Runbook

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `.github/workflows/marketplace-auto-qa.yml`, `scripts/validate-marketplace.py`

---

## Scope Note

This runbook covers failures of the **detection pipeline itself** (the nightly scan
crashing before producing results). It is distinct from
[`registry-incident-response.md`](./registry-incident-response.md), which covers
**content incidents** (a bad `registry.json`/preset/dashboard/theme change reaching
`main` and breaking the Console Marketplace UI). If the nightly scan ran successfully
and filed a legitimate `[Auto-QA]` finding, use `registry-incident-response.md` instead.

---

## Table of Contents

1. [Current Status](#current-status)
2. [When to Use This Runbook](#when-to-use-this-runbook)
3. [Why This Can Happen Silently](#why-this-can-happen-silently)
4. [Detecting a Pipeline Failure](#detecting-a-pipeline-failure)
5. [Triage](#triage)
6. [Recovery](#recovery)
7. [Verifying Recovery](#verifying-recovery)

---

## Current Status

> **The companion `Alert on scan pipeline failure` workflow step described below has
> not been merged into `marketplace-auto-qa.yml`.** A prior automated PR (#550) could
> only land this runbook: the agent token used to open that PR lacks the `workflows`
> GitHub App permission required to create or update any file under
> `.github/workflows/`, so pushes touching `marketplace-auto-qa.yml` are rejected by
> GitHub before a PR can even be opened. Until a maintainer with `workflows`
> permission applies the step manually (see [tracking issue
> #545](https://github.com/kubestellar/console-marketplace/issues/545) for the
> suggested diff), a crash in the `Run full quality scan` step still produces a
> **green** run with **zero** `[Auto-QA]` findings and no alert of any kind. Use the
> "Missing findings pattern" signal below as the only currently-working detection
> method.

## When to Use This Runbook

- (Once the companion workflow step lands) An issue titled `[Auto-QA] Nightly scan
  pipeline failed — detection degraded` (label `auto-qa:pipeline-failure`) is opened
  or updated by `marketplace-auto-qa.yml`.
- **Today, before that step lands:** you notice several consecutive nights with no
  `[Auto-QA]` findings at all, which is unusual given the repo's typical finding
  rate, and want to rule out a silent detection failure rather than assume the
  marketplace is simply clean. This is currently the *only* way to detect the
  failure mode this runbook covers.

## Why This Can Happen Silently

The `Run full quality scan` step in `marketplace-auto-qa.yml` is declared with
`continue-on-error: true` so that a transient crash in `validate-marketplace.py` (or
the inline result-parsing script that computes `error_count`/`warn_count`) doesn't
fail the whole scheduled run. Without an explicit check for that failure, a crash
before valid JSON is produced means:

- The workflow run shows green.
- Zero `[Auto-QA]` finding issues are created.
- This is visually indistinguishable, from the Issues tab, from a clean scan that
  found no problems.

A proposed `Alert on scan pipeline failure` step (added directly after the scan
step) would close this gap: it would run `if: always() && steps.scan.outcome ==
'failure'` and file/update a dedicated issue labeled `auto-qa:pipeline-failure`
whenever the scan step itself fails, so a crash is never silent. **This step is not
yet merged** — see [Current Status](#current-status) above.

## Detecting a Pipeline Failure

| Signal | Where to look | Status |
|---|---|---|
| Dedicated alert issue | Issues labeled `auto-qa:pipeline-failure` | Not yet available — see [Current Status](#current-status) |
| Workflow run log | Actions → `Marketplace Auto-QA` → the failed run's `Run full quality scan` step | Works today, but requires manually checking every run |
| Missing findings pattern | No `[Auto-QA]` issues for several nights despite known outstanding registry drift | The only reliable signal today |

## Triage

1. Open the linked workflow run from the alert issue and inspect the `Run full
   quality scan` step's logs for the Python traceback.
2. Reproduce locally:
   ```bash
   git clone https://github.com/kubestellar/console-marketplace
   git clone --depth 1 https://github.com/kubestellar/console ../console
   cd console-marketplace
   python3 scripts/validate-marketplace.py --mode full --console-path ../console --json
   ```
3. Common causes:
   - A schema/format change in `registry.json` or a card preset that the scanner
     doesn't handle (unhandled exception rather than a reported finding).
   - The sparse checkout of `kubestellar/console` (`web/src/components/cards/**`,
     `web/src/hooks/**`, `web/src/locales/en/cards.json`) no longer matching a path
     the script expects, e.g. after an upstream console refactor.
   - A malformed `/tmp/scan-results.json` (script exited before writing valid JSON),
     which breaks the `error_count`/`warn_count` extraction even if the scan itself
     partially ran.

## Recovery

1. Fix `scripts/validate-marketplace.py` (or the affected registry/preset/dashboard/
   theme file) so the scan completes and produces valid JSON output.
2. Re-run the workflow manually via `workflow_dispatch` (with
   `skip_issue_creation: true` first, if you want to confirm the scan completes
   without filing findings) to confirm the pipeline is healthy again.
3. Close the `auto-qa:pipeline-failure` issue once a scan run completes
   successfully — the workflow will not auto-close it.

## Verifying Recovery

- Confirm the next scheduled run (or a manual `workflow_dispatch` run) completes the
  `Run full quality scan` step without failing, and that `error_count`/`warn_count`
  outputs are set.
- Confirm no new `auto-qa:pipeline-failure` issue/comment is created on that run.

## Recording the Incident

Use the [Incident Report issue template](../.github/ISSUE_TEMPLATE/incident-report.md) (labeled
`incident`) to capture the timeline, impact, root cause, and follow-up actions once the pipeline
is confirmed healthy again.
