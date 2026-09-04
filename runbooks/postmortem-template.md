# Postmortem Template

> Copy this template when writing a postmortem for a `kubestellar/console-marketplace`
> incident. File it as a new document in `runbooks/postmortems/YYYY-MM-DD-<short-title>.md`,
> and link it from the closing comment of the originating
> [Incident Report](../.github/ISSUE_TEMPLATE/incident-report.md) issue.

---

## Postmortem: \<Title\>

**Date of incident:**
**Date of postmortem:**
**Authors:**
**Severity:** <!-- P1 / P2 / P3 / P4 -->

---

## Summary

One paragraph describing what happened, the user impact, and how it was resolved.

---

## Impact

- **Duration:**
- **Affected content:** <!-- registry.json / dashboards/ / presets/ / card-presets/ / themes/ -->
- **Detection pipeline affected (if a pipeline incident):** <!-- marketplace-auto-qa.yml / fuzz.yml / codeql.yml / scorecard.yml -->
- **Users affected:**
- **Functionality lost:** <!-- e.g., broken Marketplace item on main, silent scan failure -->

---

## Root Cause

Technical description of the root cause (e.g., a bad `registry.json`/preset/dashboard/theme
merge, a crashed nightly scan, a masked fuzz-run failure). Reference the commit, PR, or
workflow run as appropriate.

---

## Detection

How was the incident detected? (`[Auto-QA]` finding, a red Actions run, a user-reported
issue, a manual review.) How long did it take from the start of impact to detection —
compare against the relevant target in [`SLO.md`](./SLO.md#slis-and-slos).

---

## Response

Narrative of the response — who did what, in what order. Reference the incident timeline
and note which steps of [`registry-incident-response.md`](./registry-incident-response.md)
or [`auto-qa-pipeline-failure.md`](./auto-qa-pipeline-failure.md) were followed.

---

## Timeline

| Time (UTC) | Event |
|------------|-------|
|            |       |

---

## What Went Well

-

---

## What Went Poorly

-

---

## Where We Got Lucky

-

---

## Action Items

| Action | Type | Owner | Due | Issue |
|--------|------|-------|-----|-------|
|        | prevent/detect/mitigate/process | | | |
