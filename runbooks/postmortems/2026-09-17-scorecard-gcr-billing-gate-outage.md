# Postmortem: `scorecard.yml` Silent Failure — Upstream GCR Billing Gate

**Date of incident:** 2026-08-31 to 2026-09-17
**Date of postmortem:** 2026-09-21
**Authors:** operations
**Severity:** P3

---

## Summary

`OpenSSF Scorecard` (`scorecard.yml`) failed on every `push`- and weekly
`schedule`-triggered run for just over 17 days, starting with the last successful
run at 2026-08-31T18:13:01Z. The "Pull down action image" step failed with
`docker pull gcr.io/openssf/scorecard-action:v2.4.0` → `denied: This API method
requires billing to be enabled`, an upstream GCR billing gate on the public
`ossf/scorecard-action` image consumed by `kubestellar/infra`'s
`reusable-scorecard.yml`. No Marketplace content or user-facing functionality was
affected; the impact was a dark security-posture signal (no refreshed Scorecard
score/badge for `main`) for the duration. The incident went undetected by any
automated alert for its first ~2 weeks — discovered only while triaging an
unrelated issue — because the alert-gap this repo's own
[`scheduled-scan-alert-gap.md`](../scheduled-scan-alert-gap.md) documents was
itself still open at the time. It was resolved when `kubestellar/infra`'s
`reusable-scorecard.yml` was repinned (commit `838f6b3`, fixing
[#737](https://github.com/kubestellar/console-marketplace/issues/737)/PR #751) to
`ossf/scorecard-action` v2.4.4, published on `ghcr.io` instead of the
billing-gated `gcr.io`.

---

## Impact

- **Duration:** ~17 days (2026-08-31T18:13:01Z last success → 2026-09-17T07:15:27Z
  first confirmed recovered run), 81+ consecutive failed runs across `push` and
  `schedule` triggers.
- **Affected content:** None — no `registry.json`/dashboards/presets/card-presets/
  themes content was affected.
- **Detection pipeline affected:** `scorecard.yml` (weekly OpenSSF Scorecard scan).
- **Users affected:** None directly. Indirect: anyone relying on this repo's
  OpenSSF Scorecard badge/score for a security-posture read saw stale data for the
  full outage.
- **Functionality lost:** No content-delivery functionality lost. Silent loss of
  the repo's automated security-posture signal for the duration.

---

## Root Cause

`kubestellar/infra`'s `reusable-scorecard.yml` (consumed by this repo's
`scorecard.yml`) pinned `ossf/scorecard-action` at a SHA (`220beee`) whose
underlying image reference (`gcr.io/openssf/scorecard-action:v2.4.0`) began being
rejected by Google Container Registry with `denied: This API method requires
billing to be enabled` — an upstream vendor-side billing-gate change on the public
GCR image, not a bug in this repo's or `kubestellar/infra`'s workflow YAML. The
same root cause hit other `kubestellar/*` repositories on the same reusable
workflow at the same time (e.g. `homebrew-tap#417`, `console-kb#3368`).

---

## Detection

No automated detection existed for the first ~2 weeks of the outage:
`scorecard.yml` had no `workflow_run`-triggered failure alert (the gap tracked in
[#573](https://github.com/kubestellar/console-marketplace/issues/573)), so nothing
observed or reported the run status. The incident was found manually on
2026-09-12 while triaging #573, then re-confirmed on 2026-09-14, at which point
[#712](https://github.com/kubestellar/console-marketplace/issues/712) was filed.
Time from start of impact to detection: ~12 days — far outside any reasonable
scheduled-scan detection target (see
[SLI/SLO 5](../SLO.md#slis-and-slos)), because the alert mechanism this incident
depended on was itself the subject of a separate, then-still-open gap.

---

## Response

1. 2026-09-12/09-14: Incident manually discovered and re-confirmed during
   unrelated triage; no dedicated tracking issue existed yet.
2. 2026-09-14: [#712](https://github.com/kubestellar/console-marketplace/issues/712)
   filed per `scheduled-scan-alert-gap.md`'s "Recording the Incident" directive,
   which had not previously been actioned for this incident.
3. 2026-09-15: Status re-confirmed still ongoing (81 consecutive failed runs);
   root cause unchanged; no local mitigation available (upstream vendor gate, and
   the reusable-workflow fix requires `workflows` App permission this project's
   automated PRs don't carry).
4. 2026-09-17: `kubestellar/infra`'s `reusable-scorecard.yml` repinned to
   `ossf/scorecard-action` v2.4.4 (`ghcr.io`) via commit `838f6b3`
   (fixing [#737](https://github.com/kubestellar/console-marketplace/issues/737)/
   PR #751 — a shared fix applied across the affected `kubestellar/*` repos, not
   scoped specifically to this incident report). Two consecutive `push`-triggered
   `scorecard.yml` runs confirmed green
   ([35193635395](https://github.com/kubestellar/console-marketplace/actions/runs/35193635395),
   [35204470636](https://github.com/kubestellar/console-marketplace/actions/runs/35204470636)).
   #712 closed as resolved.
5. 2026-09-21: This postmortem filed, closing the gap between the
   `scheduled-scan-alert-gap.md`/`registry-incident-response.md` postmortem
   threshold (incident open >7 days, met here at ~17 days) and the fact that no
   postmortem had been written when #712 was closed.

`registry-incident-response.md`'s recovery steps did not apply (not a content
incident); `scheduled-scan-alert-gap.md`'s triage guidance for `scorecard.yml`
(check the "Pull down action image" step log first) was followed correctly.

---

## Timeline

| Time (UTC) | Event |
|------------|-------|
| 2026-08-31T18:13:01Z | Last successful `scorecard.yml` run before the outage ([run 33423778434](https://github.com/kubestellar/console-marketplace/actions/runs/33423778434)) |
| 2026-09-12 | Incident manually discovered while triaging #573 |
| 2026-09-14T06:13:27Z | Confirmed still failing, 70 consecutive failed runs; [#712](https://github.com/kubestellar/console-marketplace/issues/712) filed |
| 2026-09-15T08:58:42Z | Re-confirmed still failing, 81 consecutive failed runs ([run 34949934647](https://github.com/kubestellar/console-marketplace/actions/runs/34949934647)) |
| 2026-09-17T07:15:27Z | First confirmed green `push`-triggered run after the fix ([run 35193635395](https://github.com/kubestellar/console-marketplace/actions/runs/35193635395)) |
| 2026-09-17T09:19:18Z | Second confirmed green `push`-triggered run ([run 35204470636](https://github.com/kubestellar/console-marketplace/actions/runs/35204470636)) |
| 2026-09-17T10:18:36Z | #712 closed as resolved |
| 2026-09-21 | This postmortem filed |

---

## What Went Well

- The reusable-workflow fix, once landed upstream in `kubestellar/infra`, resolved
  the outage for this and every other affected `kubestellar/*` repo in one change
  — no per-repo workaround was needed.
- `scheduled-scan-alert-gap.md`'s triage guidance (check the "Pull down action
  image" step log, then check sibling repos for the same signature before
  assuming a local cause) correctly routed this to an upstream, not local, fix.

---

## What Went Poorly

- The incident ran silently for ~12 days before being noticed, because the
  automated alert mechanism it depended on ([#573](https://github.com/kubestellar/console-marketplace/issues/573))
  was itself an open gap at the time — a single point of failure where the thing
  meant to catch scheduled-scan outages was, itself, an unmonitored scheduled
  scan.
- Despite the incident's ~17-day duration clearing this runbook's own
  postmortem threshold ("more than 7 days") by a wide margin, #712 was closed
  as resolved without a postmortem being filed, and the follow-up items from the
  closing comment ("track resolution status", "process-hardening") did not
  include filing one. This gap is what this document closes.

---

## Where We Got Lucky

- The outage was purely a security-posture visibility gap with zero content or
  user-facing impact — a `push`/PR-blocking or content-delivery incident with the
  same ~17-day silent duration would have been materially worse.
- The fix required for this repo was landed as a side effect of a shared fix
  applied for sibling repos with the same upstream dependency, rather than
  requiring a dedicated fix specifically for this repo.

---

## Action Items

| Action | Type | Owner | Due | Issue |
|--------|------|-------|-----|-------|
| File this postmortem so the outage has a closing analysis, not just an open/close issue pair | process | operations | 2026-09-21 | [#712](https://github.com/kubestellar/console-marketplace/issues/712) |
| Confirm the weekly `schedule`-triggered `scorecard.yml` run (next due 2026-09-21) is also green, fully closing the loop on both trigger types | detect | operations | 2026-09-21 | [scheduled-scan-alert-gap.md](../scheduled-scan-alert-gap.md#current-status) |
| Keep the "file a postmortem once a runbook-defined threshold is crossed" step as part of closing any future Incident Report under this scope, rather than an optional follow-up | process | operations | — | — |
