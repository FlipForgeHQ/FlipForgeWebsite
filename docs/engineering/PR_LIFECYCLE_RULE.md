# FlipForge Pull Request Lifecycle Rule (v1)

**Scope:** \`FlipForge2\` and \`FlipForgeWebsite\`. **Effective for newly opened human/agent development PRs from 2026-10-28 00:00 UTC.** Existing open PRs are grandfathered and may be reviewed separately without retroactive CI failures.

## The rule: every new development PR must answer three questions

1. **Purpose:** What problem is being solved, why now, and what is in/out of scope?
2. **Current status:** Choose exactly one: \`ACTIVE\`, \`BLOCKED\`, \`READY_FOR_REVIEW\`, or \`PROTECTED_HOLD\`.
3. **Next action:** Name an owner and one concrete, actionable next step. No "continue," "follow up," "TBD," or unattended indefinite waiting.

The PR template captures these fields. The \`PR Lifecycle Governance\` check validates them for new PRs. Opening a draft does not excuse missing fields.

### Status meanings

- \`ACTIVE\` — implementation or testing underway.
- \`BLOCKED\` — waiting on a named external dependency, decision, access, or evidence. Put the blocker and action to unblock in "Next action."
- \`READY_FOR_REVIEW\` — scoped implementation finished; review/CI/preview required before requesting a merge decision.
- \`PROTECTED_HOLD\` — explicitly held by founder policy (e.g. CardSight pilot, source licensing, backup migration, sensitive security or compliance work). **Do not merge or deploy.** Record the release condition.

Statuses describe work readiness, not permission to release. A passing CI run or \`READY_FOR_REVIEW\` never implies merge/deployment authorization.

### Maintenance and review cadence

- Update **status, owner, and next action** whenever a material blocker, completed gate, or scope change occurs.
- During weekly repository triage, review PRs without a meaningful update for **14 days**. If inactive for **30 days**, classify as active, protected, superseded, or obsolete with supporting evidence; do not close solely due to age.
- A **superseded** PR may be closed only when the replacement PR/merge is linked and reviewed. An **obsolete** PR may be closed only with a reason and explicit founder approval.
- Never batch-close PRs, delete branches, or auto-merge/deploy. Preserve security, compliance, research, licensing, customer-access and backup-related holds until their gates are resolved.
- Avoid opening a new PR when an active PR for the same objective can be updated. Link stacked PRs and their intended merge order.

### Merge/release boundary

A complete PR description and successful CI make a PR **reviewable only**. Existing founder controls still apply: no production or website publish, provider activation, destructive data changes, off-site backup pruning, or protected-feature merges without explicit, separate authorization.

### Automation details

The new check reads the GitHub PR event JSON without checking out PR code or making network calls; it has read-only permissions. It enforces non-placeholder Purpose, exact Status, and non-placeholder Owner + Action. Older PRs and official Dependabot dependency updates are exempt from this *description format* check only, not from safety review or release approval.

GitHub branch protection must separately mark \`PR Lifecycle Governance / required-fields\` as a required status check to make it an unavoidable merge gate. The workflow itself reports a failure for noncompliant new PRs once merged to the default branch.

**No automation here closes, labels, merges or deploys PRs.**
