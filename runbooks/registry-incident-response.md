# Registry Incident Response & Rollback Runbook

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `registry.json`, `dashboards/`, `presets/`, `card-presets/`, `themes/`

---

## Table of Contents

1. [When to Use This Runbook](#when-to-use-this-runbook)
2. [Detecting a Broken Release](#detecting-a-broken-release)
3. [Immediate Triage](#immediate-triage)
4. [Rolling Back](#rolling-back)
5. [Verifying Recovery](#verifying-recovery)
6. [Communicating to Users](#communicating-to-users)
7. [Postmortem Template](#postmortem-template)

---

## When to Use This Runbook

> **Not seeing content findings, just no `[Auto-QA]` issues at all for several nights?**
> See [`auto-qa-pipeline-failure.md`](./auto-qa-pipeline-failure.md) instead — this
> runbook covers *content* incidents (a bad change reaching `main`), not the nightly
> scan pipeline itself failing to run.

`registry.json` (and the dashboard/preset/card-preset/theme files it points at) is fetched
directly by KubeStellar Console's Marketplace UI. There is no build step or deploy between a
merge to `main` and a user seeing the result. Use this runbook when any of the following is true:

- A `[Auto-QA]` issue is filed by the nightly `marketplace-auto-qa.yml` scan with label
  `auto-qa:registry`, `auto-qa:schema`, or `auto-qa:theme`, and the finding describes something
  a user would currently hit (broken `downloadUrl`, missing file, invalid JSON).
- A user reports the Marketplace tab in Console failing to load, an item failing to install, or
  an install producing a broken dashboard/card/theme.
- The `Validate JSON` or `Marketplace Quality Gate` PR checks would have failed but the change
  still reached `main` (e.g., merged before checks completed, or merged with failing checks —
  see note below).

> **Note:** `.github/branch-protection-policy.md` documents `required_status_checks: null` in its
> example policy, meaning these checks are not necessarily enforced as merge-blocking. Don't
> assume a merge to `main` implies the checks passed — verify directly (see below).

---

## Detecting a Broken Release

| Signal | Where to look |
|---|---|
| Nightly Auto-QA finding | Issues labeled `auto-qa`, `auto-qa:registry`, `auto-qa:schema`, `auto-qa:theme` |
| PR-time check result | `Validate JSON` / `Marketplace Quality Gate` runs on the merge commit's PR |
| User report | Issues opened against Console or this repo describing a broken install |

### Verify manually

```bash
git clone https://github.com/kubestellar/console-marketplace
cd console-marketplace

# Fast structural check (schema, naming, registry consistency)
python3 scripts/validate-marketplace.py --mode static

# Full check, including downloadUrl reachability and drift/staleness
# (requires a sparse checkout of console for card-type cross-reference)
git clone --depth 1 https://github.com/kubestellar/console ../console
python3 scripts/validate-marketplace.py --mode full --console-path ../console
```

A non-zero exit or `errors` in the output confirms a live problem, not just a warning.

---

## Immediate Triage

1. **Identify the offending entry.** Cross-reference the `id` in the Auto-QA issue or the failing
   `validate-marketplace.py` output against `registry.json`.
2. **Identify the offending commit.** This repo squash-merges PRs (`tide.merge_method` in
   `.prow.yaml`), so each merge to `main` is a single commit:
   ```bash
   git log --oneline -- registry.json dashboards/ presets/ card-presets/ themes/ | head -20
   git show <commit-sha> --stat
   ```
3. **Assess blast radius:** is it one registry entry, or does the change also touch shared files
   (e.g., a theme referenced by multiple entries, or `registry.json` structure itself)?

---

## Rolling Back

Prefer a `git revert` of the exact offending squash-merge commit — it preserves history and is
unambiguous about what's being undone, which matters since `registry.json` is hand-edited JSON,
not generated.

```bash
git checkout -b rollback/registry-<date>
git revert --no-edit <offending-commit-sha>
git push origin rollback/registry-<date>
gh pr create --repo kubestellar/console-marketplace \
  --head rollback/registry-<date> \
  --base main \
  --title "rollback: revert <short description> (breaks marketplace)" \
  --body "Reverts <offending-commit-sha>. See #<incident-issue-number>."
```

If only `registry.json` needs to change (e.g., a bad `downloadUrl` was added but the underlying
file is fine), a targeted fix in the same PR is acceptable in place of a full revert — but default
to revert-first when in doubt, then follow up with a corrected re-submission.

Since PR-time checks may not be merge-blocking, ask a maintainer (`@clubanderson` or
`@caniszczyk`, per `CODEOWNERS`) to merge the rollback PR as soon as it's opened rather than
waiting for the normal review cadence.

---

## Verifying Recovery

After the rollback merges:

```bash
git pull origin main
python3 scripts/validate-marketplace.py --mode full --console-path ../console
```

Confirm the specific `id` that was broken now resolves correctly, and re-run (or wait for) the
nightly Auto-QA scan to confirm the corresponding issue can be closed.

---

## Communicating to Users

If the break was user-visible (Marketplace tab failing to load, or a specific item failing to
install), comment on the triggering issue (or open one if a user reported it directly) noting:
- What broke and since when (offending commit + merge date)
- The revert commit/PR that fixed it
- That affected users should retry the install — no client-side cache-clearing is required, since
  the Console UI fetches `registry.json` live.

---

## Postmortem Template

Use this for any incident that reached `main` and was user-visible for more than a few hours
(i.e., caught by the nightly scan rather than PR checks):

```markdown
### Incident: <short title>

- **Detected:** <date/time>, via <Auto-QA issue # / user report / manual check>
- **Offending commit:** <sha>, merged <date>
- **User impact:** <what broke, for how long, estimated affected users if known>
- **Root cause:** <why the PR-time checks didn't catch it, or why it was merged anyway>
- **Resolution:** <revert commit/PR link>
- **Follow-up actions:**
  - [ ] Confirm whether `required_status_checks` should be enabled for `Validate JSON` /
        `Marketplace Quality Gate` (see `.github/branch-protection-policy.md`)
  - [ ] Any additional validation needed in `validate-marketplace.py` to catch this class of issue
        earlier (static/cross-repo mode instead of relying on the nightly full scan)
```
