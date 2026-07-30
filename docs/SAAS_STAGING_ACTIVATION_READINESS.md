# FlipForge SaaS Staging Activation Readiness

## Purpose

This pack prepares the merged SaaS website gateway and staging browser for a future, separately authorized staging activation. It does not deploy a backend, enable authentication, provision a real tenant, configure secrets, or activate the bridge.

## Current authority boundaries

- Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- Browser code cannot set tenant or user identity headers.
- The gateway resolves signed `app_metadata`, injects the trusted tenant header server-to-server, and keeps the service token server-only.
- Active listings and asks do not become completed-sale evidence.
- No browser or gateway path authorizes bidding, purchasing, checkout, payment, listing, or resale.

## Signed membership contract

The supported signed metadata shape is:

```json
{
  "app_metadata": {
    "flipforge": {
      "access": "active",
      "tenantId": "tenant_example_001"
    }
  }
}
```

Rules:

- `app_metadata.flipforge` must be an object.
- `access` must be exactly `active`, case-insensitive after trimming.
- `tenantId` must contain 3–128 safe letters, numbers, dots, underscores, colons, or hyphens.
- The membership object accepts only `access` and `tenantId` in this phase.
- This metadata must be issued by the authentication system. It is never accepted from browser request headers or request bodies.

Validate a proposed file without changing any account:

```powershell
node .\scripts\check-saas-staging-readiness.mjs `
  --membership .\docs\examples\saas-tenant-membership.example.json `
  --json
```

## Redacted environment inspection

The readiness checker reports only whether settings are present and valid. It never prints the service token value.

```powershell
node .\scripts\check-saas-staging-readiness.mjs --json
```

To require a complete, disabled staging candidate:

```powershell
node .\scripts\check-saas-staging-readiness.mjs --require-complete --json
```

A complete activation candidate requires:

- a non-production staging context (`deploy-preview`, `branch-deploy`, or `dev`);
- an HTTPS private backend base URL;
- a server-only service token configured with the base URL;
- exact HTTPS allowed origins when any are configured;
- timeout and request/response limits within the gateway bounds;
- preview bypass disabled when signed authentication is used;
- the bridge still set to `false` during the readiness review.

The repository intentionally contains no real base URL, service token, tenant membership, or enabled bridge setting.

## Simulated end-to-end smoke sequence

The validation suite exercises the complete contract without a live service:

1. Public health reports the bridge disabled.
2. An unauthenticated data request returns `401`.
3. An authenticated but unprovisioned user returns `403`.
4. An inactive or invalid membership returns `403`.
5. A valid signed membership still respects the disabled bridge.
6. A fixture-only configured staging environment reaches dashboard data.
7. A tenant-scoped evaluation POST carries one idempotency key.
8. The evaluation response remains decision support, reports SQLite persistence, and denies transaction authority.
9. The saved opportunity is retrieved through the same signed tenant.
10. Every upstream call receives the server-resolved tenant and server-only token, never a raw user header.
11. Rollback disables the bridge and stops all subsequent upstream calls.
12. Production ignores preview bypass and remains disabled.

## One-command validation

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\validate-saas-staging-activation-readiness-phase.ps1
```

Expected final line:

```text
Staging activation readiness validation completed successfully.
```

## Review gate before any staging activation

All of the following must be independently complete:

- private Java 21 backend hosting;
- persistent staging SQLite storage;
- backup and restore test;
- HTTPS reverse-proxy policy;
- real authentication provider configured;
- one controlled staging user;
- one signed tenant membership validated by this pack;
- server-only upstream base URL and service token;
- exact staging origin configuration;
- full health → dashboard → opportunity → evidence → PSA → evaluation → saved-detail smoke test;
- rollback rehearsal;
- exact-head GitHub checks, Netlify deploy preview, and local Windows validation with zero failures.

## Explicit exclusions

This pack does not:

- deploy or host the backend;
- create or modify an authentication account;
- write real `app_metadata`;
- create a real tenant;
- configure a base URL or token;
- activate the bridge in staging or production;
- expose secrets;
- change Smart Opportunity or PSA authority;
- add billing, provider credentials, scraping, evidence acceptance, purchase authority, or transaction execution.
