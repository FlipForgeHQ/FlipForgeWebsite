# FlipForge SaaS Controlled Staging Deployment and Rollback

## Scope

This runbook is for a future, separately approved staging activation only. It is not authorization to deploy, provision users, configure secrets, or enable production traffic.

## Roles

- **Owner:** approves activation and rollback.
- **Backend operator:** deploys the private Java 21 service and verifies persistent SQLite.
- **Website operator:** configures Netlify staging-only variables and verifies the same-origin gateway.
- **Reviewer:** confirms validation evidence and records exact commit identifiers.

One person may fill multiple roles, but every gate still requires explicit confirmation.

## Preconditions

Do not begin activation until all are true:

1. Website `main` contains the merged staging read and evaluation adapters.
2. Backend `main` contains tenant-isolated reads and evaluation writes.
3. The private backend is reachable only through HTTPS.
4. Staging SQLite is stored on a persistent volume.
5. A backup has been created and a restore test has succeeded.
6. A service token exists in the secret manager and is not present in Git, shell history, screenshots, tickets, or chat.
7. A controlled staging user exists in the authentication provider.
8. The proposed signed membership JSON passes the readiness checker.
9. The bridge is still disabled.
10. The complete readiness phase passes with zero failures.

## Phase A — Record the baseline

Record:

- website commit SHA;
- backend commit SHA;
- container image digest;
- staging database backup identifier;
- authentication-provider configuration version;
- Netlify deploy-preview identifier;
- current public health response, which must report `disabled`.

Do not record secret values.

## Phase B — Deploy the private backend

1. Deploy the exact validated Java 21 container image.
2. Attach the persistent SQLite volume.
3. Configure backend service authentication.
4. Configure the HTTPS reverse proxy.
5. Keep the website bridge disabled.
6. Call the backend health endpoint from the private environment.
7. Confirm no customer-facing browser route can reach it yet.
8. Confirm logs contain correlation IDs but no tokens, raw authentication claims, or tenant secrets.

Stop and roll back if any check fails.

## Phase C — Configure staging-only website settings

Configure settings only in the staging context:

- `CONTEXT=deploy-preview` or the approved non-production context;
- `FLIPFORGE_API_BRIDGE_ENABLED=false`;
- `FLIPFORGE_API_BASE_URL` set to the private HTTPS backend;
- `FLIPFORGE_API_SERVICE_TOKEN` set through the secret manager;
- exact HTTPS allowed origins, when required;
- bounded timeout and request/response sizes;
- `FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW=false` for signed authentication;
- no preview tenant when signed authentication is used.

Run:

```powershell
node .\scripts\check-saas-staging-readiness.mjs --require-complete --json
```

The checker must report:

- environment safe: yes;
- ready to activate staging: yes;
- staging currently active: no;
- production disabled: yes.

## Phase D — Provision one controlled membership

1. Prepare the proposed signed metadata in a local, non-secret JSON file.
2. Validate it:

```powershell
node .\scripts\check-saas-staging-readiness.mjs `
  --membership .\path\to\proposed-membership.json `
  --json
```

3. Apply the validated `app_metadata.flipforge` through the authentication provider's trusted administrative path.
4. Do not accept tenant or user identifiers from browser headers, query strings, local storage, or request bodies.
5. Sign out and sign back in so the user receives a new signed token.
6. Confirm unprovisioned users still receive `403`.

## Phase E — Activate staging

Activation requires a separate owner approval at this point.

After approval, change only the staging context:

```text
FLIPFORGE_API_BRIDGE_ENABLED=true
```

Do not change production settings.

Immediately verify the public gateway health response reports:

- status `configured`;
- authentication required;
- tenant membership required;
- client identity headers not accepted;
- evaluation idempotency required;
- production preview bypass not allowed.

## Phase F — End-to-end staging smoke test

Using the single controlled staging user:

1. Sign in through the configured provider.
2. Open the deploy-preview staging data route.
3. Confirm dashboard metrics load without mock fallback.
4. Open one tenant-owned opportunity.
5. Confirm opportunity, evidence, and PSA sections use the same saved identifier.
6. Open the staging evaluation route.
7. Submit a controlled manual opportunity.
8. Confirm one idempotency key is used.
9. Confirm the response reports:
   - Smart Opportunity authority;
   - existing PSA intelligence authority;
   - tenant ownership;
   - tenant-scoped idempotency;
   - SQLite persistence;
   - transaction authority false.
10. Open the returned saved opportunity.
11. Repeat the same submission only to verify idempotent replay.
12. Confirm a different tenant cannot read the saved record.
13. Confirm an unprovisioned user receives `403`.
14. Confirm an unauthenticated user receives `401`.
15. Confirm production hostname exposes neither staging navigation item and performs no staging request.

Record correlation IDs and status codes only. Do not record tokens.

## Rollback triggers

Rollback immediately for any of these:

- authentication or tenant isolation failure;
- cross-tenant data visibility;
- browser-supplied tenant header accepted;
- missing idempotency enforcement;
- unexpected write or transaction authority;
- mock data mixed with authoritative data;
- service token or tenant identifier exposed to the browser;
- persistent-volume failure;
- backup or restore uncertainty;
- authority-contract mismatch;
- repeated upstream timeouts or invalid responses;
- production route or hostname making staging requests.

## Immediate rollback

1. Set the staging-only bridge to false:

```text
FLIPFORGE_API_BRIDGE_ENABLED=false
```

2. Redeploy the staging website configuration.
3. Confirm public health reports `disabled`.
4. Confirm authenticated data routes return `503 BRIDGE_DISABLED` without contacting the backend.
5. Revoke or rotate the staging service token if exposure is suspected.
6. Disable the controlled membership if tenant assignment is uncertain.
7. Stop the private backend only after the website bridge is confirmed disabled.
8. Preserve logs and correlation IDs.
9. Restore the last verified SQLite backup if data integrity is uncertain.
10. Record the rollback time, exact commits, reason, and verification results.

## Post-rollback verification

Run the full local phase:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\validate-saas-staging-activation-readiness-phase.ps1
```

Then verify:

- staging health is disabled;
- no upstream request occurs after rollback;
- production preview bypass remains forbidden;
- no real secrets exist in Git;
- unprovisioned and unauthenticated boundaries remain intact;
- the controlled user cannot access tenant data if membership was disabled.

## Production boundary

This runbook does not authorize production activation. Production requires a separate security review, data-retention review, customer-support plan, incident-response plan, billing and entitlement design, and explicit owner approval.
