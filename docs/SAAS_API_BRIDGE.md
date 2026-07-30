# FlipForge SaaS API Bridge

Status: staging gateway handoff for issues `FlipForgeWebsite#15` and `FlipForge2#205`

## Purpose

The browser-hosted SaaS interface needs a same-origin server boundary before it can consume real FlipForge data. The Netlify gateway in `netlify/functions/flipforge-api.js` provides that boundary without moving recommendation, evidence, grading, provider, tenant-access, or evaluation-ownership logic into JavaScript.

The gateway is not the recommendation engine. It forwards authenticated requests to the authoritative FlipForge service and verifies that every successful response identifies the existing authorities and proves the merged tenant boundary was enforced.

- Smart Opportunity remains the sole `BUY/WATCH/VERIFY/PASS` authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- SQLite remains the source of truth until a separate approved migration replaces it.
- The website cannot and must not open a desktop SQLite file directly.
- The browser never receives the service token, raw authenticated subject, tenant digest, provider credentials, or database path.

## Authoritative backend already merged

FlipForge2 PRs #206, #207, and #208 already provide:

- `SaaSTenantContext` with the trusted header `X-FlipForge-Tenant-Id`.
- Immediate SHA-256 digesting of the trusted tenant value.
- Default-deny SQLite opportunity access grants.
- Tenant-filtered dashboard, list, detail, compare, evidence, and PSA routes.
- Tenant-scoped evaluation idempotency.
- Atomic evaluation completion and opportunity-ownership grants.
- Non-disclosing `404 RESOURCE_NOT_FOUND` behavior for missing or cross-tenant resources.

This website phase connects to that system. It does not create another tenant registry or another recommendation service.

## Default behavior

The gateway fails closed by default.

| Condition | Data-route result |
|---|---|
| No verified function-context user | `401 AUTHENTICATION_REQUIRED` |
| Authenticated subject does not satisfy the backend-safe tenant format | `401 AUTHENTICATION_REQUIRED` |
| Preview bypass requested without an explicit preview tenant ID | `401 AUTHENTICATION_REQUIRED` |
| Evaluation missing a valid `Idempotency-Key` | `400 IDEMPOTENCY_KEY_REQUIRED` |
| Bridge disabled | `503 BRIDGE_DISABLED` |
| Upstream URL or service token missing | `503 UPSTREAM_NOT_CONFIGURED` |
| Route or method not allowlisted | `404 ROUTE_NOT_ALLOWED` |
| Upstream timeout or network failure | `503` with a non-sensitive error envelope |
| Upstream response lacks enforced, default-deny tenant metadata | `502 UPSTREAM_CONTRACT_INVALID` |
| Evaluation response lacks tenant ownership or tenant idempotency proof | `502 UPSTREAM_CONTRACT_INVALID` |
| Upstream response violates authority provenance | `502 UPSTREAM_CONTRACT_INVALID` |

`GET /api/v1/health` is the only public website-gateway route. It reports configuration booleans and the non-secret trusted-header contract. It never returns environment-variable values, tokens, URLs, authenticated subjects, tenant digests, database paths, or provider credentials.

## Environment variables

These values belong in Netlify server environment settings. None may be placed in browser JavaScript, HTML, repository secret files, or customer-visible responses.

| Variable | Purpose |
|---|---|
| `FLIPFORGE_API_BRIDGE_ENABLED` | Must equal `true` before upstream proxying is allowed. Defaults to disabled. |
| `FLIPFORGE_API_BASE_URL` | Base URL of the authoritative FlipForge API service. |
| `FLIPFORGE_API_SERVICE_TOKEN` | Service-to-service bearer token sent only from the Netlify function. |
| `FLIPFORGE_API_ALLOWED_ORIGINS` | Optional comma-separated additional HTTPS origins. Same-origin requests are allowed automatically. |
| `FLIPFORGE_API_TIMEOUT_MS` | Upstream timeout. Defaults to 5,000 ms and is capped at 10,000 ms. |
| `FLIPFORGE_API_MAX_RESPONSE_BYTES` | Upstream JSON response limit. Defaults to and is capped at 1,000,000 bytes. |
| `FLIPFORGE_API_MAX_REQUEST_BYTES` | Evaluation-request limit. Defaults to and is capped at 65,536 bytes. |
| `FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW` | Optional non-production preview tenant path. Ignored when `CONTEXT=production`. |
| `FLIPFORGE_API_PREVIEW_TENANT_ID` | Required pseudonymous test tenant when the non-production preview path is enabled. Never use a real customer email or production identity. |

## Authentication and trusted tenant handoff

Every customer data route requires a verified user in the Netlify function context. The gateway reads the trusted `user.sub` value, validates it against the exact backend-safe format, and forwards it server-to-server as:

```text
X-FlipForge-Tenant-Id: <verified function-context subject>
```

The browser cannot choose or override that value. A browser-supplied `X-FlipForge-Tenant-Id` header is ignored because only the function-context subject is forwarded upstream. The tenant header is deliberately omitted from browser CORS preflight permissions.

The authoritative Java service immediately converts the trusted value into a SHA-256 tenant digest. Persistence and diagnostics use that digest or a bounded 12-character audit key; the raw trusted value is not stored, logged, or returned.

A non-production preview tenant can be used only when both preview variables are explicitly configured. Production ignores that bypass completely.

This phase does not add signup screens, password recovery, billing, paid plans, or entitlement enforcement. It establishes the website-to-authority handoff those later features depend on.

## Evaluation idempotency

`POST /api/v1/evaluations` requires an `Idempotency-Key` containing 8–100 safe characters.

- The gateway validates and forwards the key.
- The authoritative service scopes the key by tenant digest.
- Same tenant and same request replay safely.
- Same tenant and changed request conflict.
- Two different tenants may independently use the same key.
- Evaluation completion and opportunity ownership are committed through the tenant SQLite boundary.

## Route allowlist

The gateway accepts only these contracts:

- `GET /api/v1/health`
- `GET /api/v1/dashboard`
- `GET /api/v1/opportunities`
- `GET /api/v1/opportunities/{id}`
- `GET /api/v1/compare?ids=`
- `GET /api/v1/psa-advisor/{id}`
- `GET /api/v1/evidence/{id}`
- `GET /api/v1/portfolio`
- `GET /api/v1/alerts`
- `GET /api/v1/account`
- `GET /api/v1/entitlements`
- `POST /api/v1/evaluations`

No route exists for provider administration, credential entry, evidence acceptance, recommendation recalculation, grade prediction, bidding, checkout, marketplace listing, payment collection, or purchase authorization.

## Response contract

Successful upstream responses must satisfy `contracts/flipforge-saas-api-v1.schema.json` and include:

- `meta.contractVersion = "1.0"`
- a non-empty `meta.engineVersion`
- `meta.authority = "Smart Opportunity"`
- `meta.gradingAuthority = "Existing PSA intelligence"`
- `meta.generatedAt`
- the exact request `meta.correlationId`
- a `data` property

Every customer response must include:

```text
data.tenantIsolation.enforced = true
data.tenantIsolation.defaultAccess = "DENY"
data.tenantIsolation.tenantAuditKey = <12 lowercase hexadecimal characters>
```

Evaluation responses must additionally include:

```text
data.tenantOwned = true
data.tenantIsolation.idempotencyScope = "TENANT"
data.tenantIsolation.opportunityOwnership = "GRANTED_ON_COMPLETION"
data.transactionAuthorized = false
```

The gateway rejects successful upstream responses that omit or weaken those safeguards.

## Security controls in this phase

- Same-origin server-side gateway
- Explicit route and method allowlist
- Verified function-context identity required for every customer route
- Exact trusted-header compatibility with the merged Java runtime
- Browser tenant-header spoofing ignored and not allowed by CORS
- Backend-safe tenant format validation
- Immediate one-way digesting in the authoritative service
- Default-deny tenant ownership checks
- Tenant-scoped evaluation idempotency and atomic ownership grant
- Production-safe preview guard with explicit preview tenant
- Upstream service token stored and used only on the server
- Server-added HTTPS proxy marker
- Request and response size limits
- Abortable upstream timeout
- Redirect refusal
- Strict JSON parsing
- Contract, authority, and tenant-isolation validation
- Correlation IDs
- No-store cache policy
- Non-sensitive logs and errors
- No provider-specific secret returned to the browser

## Complete gateway-handoff phase

Run the website-owned phase command with the current FlipForge2 `main` repository available beside it. The phase validates:

1. Full FlipForge2 Maven package.
2. Merged tenant identity/access foundation.
3. Merged tenant-scoped projections.
4. Merged private HTTP tenant read wiring.
5. Merged tenant-scoped evaluation writes and idempotency.
6. Retained hosted runtime, read API, private HTTP, authority projection, and customer exposure gates.
7. Website gateway JavaScript syntax.
8. The 84-check gateway contract and security suite.
9. Retained SaaS prototype validation and website build.
10. Exact cross-repository header and response-contract compatibility.

## Staging activation sequence

1. Validate website PR #20 against current FlipForge2 `main` with zero failures.
2. Review and merge website PR #20 only after the complete phase passes.
3. Select an approved staging host with persistent storage, HTTPS, secrets, health checks, and rollback.
4. Deploy the already validated Java container to staging only.
5. Configure the staging gateway upstream URL and server-only token.
6. Use two test accounts to prove each account can see only its own records.
7. Verify restart persistence, backup, restore, and failure modes.
8. Review actual desktop and mobile staging screens.
9. Obtain separate owner approval before any production activation.

The live SaaS prototype continues using explicit mock data until those gates pass. This branch does not deploy, enable the production bridge, activate billing, or expose live customer data.
