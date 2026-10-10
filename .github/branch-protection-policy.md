# Branch Protection Policy

The `main` branch of this repository must have the following protection rules enabled:

- Restrict who can push to matching branches: only maintainers via PR merge
- Do not allow force pushes
- Do not allow deletions
- Require linear history (recommended)
- Require the PR-time content gates to pass before merging (see below) — these are
  the only automated check between a merge and a user-visible Marketplace incident,
  since this repo has no build/deploy step (see
  [`runbooks/registry-incident-response.md`](../runbooks/registry-incident-response.md)).

**Deliberately not required: pull request review approvals.** The hive bot merges
its own PRs with 0 approvals and has no admin access, so requiring an approving
review would stall every hive-authored PR indefinitely. This is an intentional
deviation from typical branch-protection guidance, applied when issue #935 (below)
was resolved — do not "fix" this back to requiring reviews without first addressing
how the hive would then get PRs merged.

## Applying

A repository administrator must apply these settings via the GitHub Settings > Branches UI, or via:

```bash
scripts/apply-branch-protection.sh   # add --dry-run to preview; wraps the command below
gh api -X PUT "repos/kubestellar/console-marketplace/branches/main/protection" --input .github/branch-protection-policy.json
```

The checked-in `.github/branch-protection-policy.json` is the source of truth for the
settings below (keep it in sync with this block). Verify the result afterwards with
`gh api repos/kubestellar/console-marketplace/branches/main/protection`. Contents:

```json
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["static-validation", "card-quality-gate", "validate"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

`static-validation` and `card-quality-gate` are the job IDs from
`.github/workflows/marketplace-quality.yml` ("Marketplace Quality Gate"); `validate` is
the job ID from `.github/workflows/validate-json.yml` ("Validate JSON"). Both workflows
only trigger on PRs touching `registry.json`, `dashboards/**`, `presets/**`,
`card-presets/**`, `themes/**` (and, for the quality gate, `scripts/**`), so they will
not appear as required checks on PRs that don't touch those paths — that's expected
with `"strict": false`. Before applying, confirm the exact check names GitHub reports on
a recent PR that touched one of those paths (Settings > Branches > required status
checks search), since displayed names can differ slightly from job IDs depending on
workflow/job `name:` fields.

Previously this repo's policy set `required_status_checks: null`, meaning these gates
ran but were purely advisory — a PR could merge to `main` while they were still
running or failing outright. Since content changes reach users with no build/deploy
step in between, that gap is a direct path to the kind of incident
[`runbooks/registry-incident-response.md`](../runbooks/registry-incident-response.md)
describes. Requiring these checks doesn't add new validation, it just makes the
validation that already exists binding.

## Rationale

Addresses security findings tracked in issue #376 (branch protection) and #377 (mandatory code review),
and the release-safeguard gap tracked in issue #560 (PR-time content gates were documented as
non-blocking). Applying this document's `.github/branch-protection-policy.json` to the live branch
protection settings on `main` was a separate administrator action, tracked across issues #560 (closed —
documented recommendation only), #866 and #932 (both closed before the live setting was ever confirmed
applied — see [issue #935](https://github.com/kubestellar/console-marketplace/issues/935) for that
history), and finally **#935 (closed)**: a repository administrator applied the setting and verified it
live with `gh api repos/kubestellar/console-marketplace/branches/main/protection`, intentionally omitting
`required_pull_request_reviews` per the note above. `runbooks/SLO.md` SLO 2 reflects this as met.
