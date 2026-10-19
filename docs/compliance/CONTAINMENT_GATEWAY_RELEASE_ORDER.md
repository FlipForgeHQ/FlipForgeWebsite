# CardSight containment — independent Netlify release gate

Status: DRAFT ONLY. This branch does not authorize any merge, deploy, configuration change or CardSight reactivation.

## What it does

The Netlify `flipforge-api` function now requires the upstream response's
`meta.runtimeBuildCommitVerified === true`, a complete 40-character SHA in
`meta.runtimeBuildCommit`, and an **exact match** against the operator-maintained
`FLIPFORGE_APPROVED_BACKEND_COMMITS` comma-separated environment variable.

If the variable is blank, missing, malformed, or lacks the serving SHA, the
gateway returns a generic 503 and never returns the upstream response body.
Older Render builds do not become safe by passing through the Netlify gateway;
the backend must first pass the containment and customer-disclosure review.

## Required coordinated release procedure (not performed)

1. Finish backend PR #885 and its hardening companion, verify all required CI,
   synthetic tamper and disclosure tests, independent evidence behavior, and
   customer replay behavior. Confirm legitimate restore and operational procedures.
2. **Never** add an older pre-containment backend SHA to the allowlist.
   Establish the exact full Render build commit from the release candidate.
3. Arrange a controlled maintenance/release window. Configure
   `FLIPFORGE_APPROVED_BACKEND_COMMITS` in the Netlify environment with only
   reviewed, guard-aware backend SHAs (the final merged/deployed commit, not an
   earlier draft SHA). Preserve secret tokens; do not log or publish them.
4. Deploy the gateway and compliant backend in a coordinated fashion. The new
   gateway will respond 503 to customer requests until the allowlist and safe
   backend identity match; this is intentional fail-closed behavior.
5. Verify `/api/v1/health` on the backend reports
   `evidenceStorageGuard=VERIFIED` and intended provider mode. Verify a
   real signed-in customer response and an intentionally disallowed SHA test.
6. Protect direct service-token backend access and remove pre-containment builds
   from permitted Render rollback targets. The gateway cannot protect direct
   backend callers, files, backups, logs or arbitrary rollback operations.
7. Test restore from a pre-guard backup in isolation. A guard-aware build
   must reinstall and verify the database triggers before any data-serving path.
   Keep the provider in `SUSPENDED` until separately approved.

## Customer impact and known boundaries

* Missing or incorrect allowlist means **all successful customer API responses**
  from the bridge are blocked with 503, although the gateway's own health route
  still answers. This prevents silent fallback to unsafe old backend code.
* Upstream non-2xx responses are already rewrapped as generic gateway errors;
  their raw bodies are not passed to customers.
* Every new backend release requires a controlled allowlist change. Do not
  adopt wildcards or automatic 'latest' approvals.
* This check authenticates a deployment generation through trusted backend
  metadata and a Netlify-managed allowlist; it is **not** a replacement for
  CardSight license enforcement, backend row filters or database write guards.
