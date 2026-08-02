# FlipForge SaaS Staging Browser Read Adapter

Status: review-only foundation for `toddholbein/FlipForge2#205`

## Purpose

This phase adds the first browser-side path to the existing same-origin FlipForge gateway without replacing or contaminating the polished mock cockpit.

The new `#/staging` route is an isolated diagnostic and owner-review screen for:

- public gateway health
- tenant-scoped dashboard metrics
- tenant-scoped saved opportunities
- one saved opportunity detail
- saved evidence authority summary
- saved PSA guidance summary

The adapter does not calculate, score, rerank, accept evidence, verify identity, predict grades, call providers, write evaluations, provision tenants, bill users, authorize transactions, or activate production.

## Default and production behavior

The existing cockpit remains mock-backed.

The staging navigation item is hidden by default and is revealed only when the browser hostname is:

- a Netlify deploy-preview hostname matching `deploy-preview-{number}--goflipforge.netlify.app`
- `localhost`
- `127.0.0.1`

On the production hostname, the route remains unavailable and performs no API request.

No browser storage, cookie mutation, service token, tenant header, user header, database path, provider credential, or raw provider payload is introduced.

## Authentication and tenant boundary

The current Netlify Identity client authenticates browser requests with the secure `nf_jwt`/`nf_refresh` same-origin cookie session. The adapter uses `credentials: "same-origin"` and never reads a raw JWT or constructs a user `Authorization` header.

The browser never selects, derives, or sends `X-FlipForge-Tenant-Id`.

The merged Netlify gateway remains solely responsible for:

1. verifying authenticated function context
2. resolving active administrator-controlled tenant membership
3. rejecting browser identity-header spoofing
4. injecting the trusted tenant header server-to-server
5. adding the server-only service bearer token

If authentication or tenant membership is absent, the staging route displays the gateway error and does not substitute mock records.

## Read allowlist

The adapter may issue only same-origin `GET` requests to:

- `/api/v1/health`
- `/api/v1/dashboard`
- `/api/v1/opportunities`
- `/api/v1/opportunities/{safe-id}`
- `/api/v1/evidence/{safe-id}`
- `/api/v1/psa-advisor/{safe-id}`

It does not expose evaluation POST in this phase.

## Response validation

Successful customer-data responses must include:

- `meta.contractVersion = "1.0"`
- a non-empty `meta.engineVersion`
- `meta.authority = "Smart Opportunity"`
- `meta.gradingAuthority = "Existing PSA intelligence"`
- the exact request correlation ID
- a `data` property

Any contract mismatch fails closed. The browser response is capped and invalid JSON is rejected.

## Honest unavailable states

- Disabled gateway: only public health is requested; no customer data call follows.
- Authentication required: the `401` gateway code is displayed.
- Tenant membership required or inactive: the `403` gateway code is displayed.
- Missing evidence or PSA context: the detail screen marks that section unavailable and does not fabricate a replacement.
- Empty tenant: the screen states that no tenant-owned saved opportunities were returned.

## Files

- `saas-prototype/staging-browser.js`
- `saas-prototype/staging-route-hook.js`
- `saas-prototype/staging-browser.css`
- `scripts/validate-saas-staging-browser-read-adapter.mjs`
- `scripts/validate-saas-staging-browser-read-adapter-phase.ps1`
- `.github/workflows/saas-staging-browser-read-adapter.yml`

## Validation

Run on Windows from the website repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-saas-staging-browser-read-adapter-phase.ps1
```

The phase checks JavaScript syntax, the focused staging adapter suite, the retained gateway suites, the retained SaaS prototype, and the website asset build.

## Activation still required later

This code alone does not provide a working live staging environment. Separate owner-approved operations are still required to:

1. privately host the Java 21 backend with persistent SQLite
2. configure restart persistence, backup, and restore
3. configure a staging authentication provider
4. create test users and signed tenant memberships
5. configure the gateway upstream URL and service token
6. enable the bridge only in deploy preview
7. verify two-user cross-tenant isolation in the actual browser
8. review real desktop and mobile staging screens

Production activation remains prohibited until those gates pass and separate approval is given.
