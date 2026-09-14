---
name: Incident Report
about: Record a production or pipeline incident (broken registry/content, or a silent detection/alerting pipeline failure)
title: '[Incident] '
labels: lifecycle/frozen
assignees: ''
---

> **Note:** `lifecycle/frozen` (applied automatically, to exempt this issue from
> `stale.yml` auto-close — see #559) is the only label this template can apply today.
> An `incident` label was intended alongside it but does not exist in this repository,
> so GitHub silently drops it at issue-creation time (see #691). If a maintainer has
> since created the `incident` label, add it to this issue by hand.

## Summary
<!-- One or two sentences: what broke, what was the user-visible impact? -->

## Incident Type
<!-- Pick one, and follow the linked runbook for triage/recovery steps -->
- [ ] Content incident (bad `registry.json`/preset/dashboard/theme reached `main`) — see [`runbooks/registry-incident-response.md`](../../runbooks/registry-incident-response.md)
- [ ] Pipeline incident (a scheduled/unattended workflow crashed or stopped alerting) — see [`runbooks/auto-qa-pipeline-failure.md`](../../runbooks/auto-qa-pipeline-failure.md)
- [ ] Scheduled scan/triage silent failure (`fuzz.yml`, `codeql.yml`, `scorecard.yml`, or `stale.yml` crashed or stopped alerting with no notification) — see [`runbooks/scheduled-scan-alert-gap.md`](../../runbooks/scheduled-scan-alert-gap.md)
- [ ] Other (describe below)

## Timeline
<!-- UTC timestamps where known -->
- **Detected:**
- **Started (best estimate):**
- **Mitigated:**
- **Resolved:**

## Detection
<!-- How was this noticed? Automated alert/issue, manual review, user report, etc. -->

## Impact
<!-- Who/what was affected, and for how long? -->

## Root Cause
<!-- Fill in during/after triage -->

## Recovery Actions Taken
<!-- What was done to mitigate and resolve -->

## Follow-up / Prevention
<!-- Action items to prevent recurrence (link any follow-up issues/PRs) -->

## Postmortem
<!-- Link a postmortem doc/PR if this incident warrants one, or note "not required".
     Use ../../runbooks/postmortem-template.md as the starting point. -->
