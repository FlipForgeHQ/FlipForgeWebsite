# FlipForge SaaS API Bridge

Status: non-production gateway, authentication, and tenant-membership foundation

Related staging issue: `toddholbein/FlipForge2#205`

## Purpose

The browser-hosted SaaS interface needs a same-origin server boundary before it can consume real FlipForge data. The Netlify gateway in `netlify/functions/flipforge-api.js` provides that boundary without moving recommendation, evidence, grading, tenant ownership, or provider logic into JavaScript.

The gateway is not the recommendation engine. It forwards authenticated and tenant-resolved requests to the authoritative FlipForge service and verifies that every successful response identifies the existing authorities.

- Smart Opportunity remains the sole `BUY/WATCH/VERIFY/PASS` authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- The authoritative FlipForge SQLite database remains the source of truth.
- The website must not open a desktop SQLite file directly. It also must not open hosted SQLite directly.

## Default behavior

The gateway fails closed by default.

| Condition | Data-route result |
|---|---|
| No authenticated user | `401 AUTHENTICATION_REQUIRED` |
| Authenticated user has no signed FlipForge membership | `403 TENANT_MEMBERSHIP_REQUIRED` |
| Membership is inactive | `403 TENANT_MEMBERSHIP_INACTIVE` |
| Tenant identifier is unsafe or malformed | `403 TENANT_MEMBERSHIP_INVALID` |
| Browser supplies tenant or user identity header | `400 CLIENT_IDENTITY_HEADER_FORBIDDEN` |
| Preview bypass lacks an explicit sandbox tenant | `503 PREVIEW_TENANT_NOT_CONFIGURED` |
| Evaluation omits a valid idempotency key | `400` |
| Bridge disabled | `503 BRIDGE_DISABLED` |
| Upstream URL or service token missing | `503 UPSTREAM_NOT_CONFIGURED` |
| Route or method not allowlisted | `404 ROUTE_NOT_ALLOWED` |
| Authoritative saved resource is missing or outside the resolved tenant | `404 RESOURCE_NOT_FOUND` with a gateway-generated non-disclosing message |
| Upstream timeout or network failure | `503` with a non-sensitive error envelope |
| Upstream response violates the contract | `502 UPSTREAM_CONTRACT_INVALID` |

`GET /api/v1/health` is the only public route. It reports configuration booleans and boundary status. It never returns environment-variable values, tokens, URLs, tenant identifiers, user identifiers, or provider credentials.

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
| `FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW` | Optional preview-only bypass. It is ignored when Netlify `CONTEXT=production`. |
| `FLIPFORGE_API_PREVIEW_TENANT_ID` | Explicit non-production sandbox tenant required when preview bypass is enabled. It must never identify a real customer tenant. |

## Authentication and membership boundary

Data routes require a verified user in the Netlify function context. Authentication alone is not authorization. The verified user must also contain one active administrator-controlled FlipForge membership in signed `app_metadata`:

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

- Only `context.clientContext.user.app_metadata.flipforge` is accepted.
- User-editable profile metadata, query parameters, request bodies, cookies, and browser headers are not accepted as tenant authority.
- `access` must equal `active`.
- `tenantId` must match the same safe identifier boundary enforced by the authoritative backend.
- An authenticated but unprovisioned user cannot fall back to preview access.
- The raw authenticated user identifier is not forwarded to the authoritative service.
- The resolved tenant identifier is injected server-to-server as `X-FlipForge-Tenant-Id`.
- Any browser-supplied `X-FlipForge-Tenant-Id` or `X-FlipForge-User-Id` is rejected before upstream access.
- The resolved tenant and authenticated subject are not logged or returned.

This milestone does not activate signup, login, password recovery, account invitations, or real tenant provisioning. Those remain staging-operations tasks requiring separate approval.

## Preview boundary

Unauthenticated preview bypass can be enabled only outside production. It additionally requires an explicit safe `FLIPFORGE_API_PREVIEW_TENANT_ID`.

The preview tenant must be a dedicated sandbox tenant with synthetic or approved test records. It must not be a real customer tenant. Production always ignores the bypass, even if both preview variables are set.

## Evaluation idempotency

`POST /api/v1/evaluations` requires exactly one browser `Idempotency-Key` containing 8–100 safe characters. The gateway validates and forwards it unchanged to the authoritative tenant-scoped write service.

The gateway does not implement idempotency itself and does not create a second persistence layer. Tenant scoping, replay, conflict handling, and the atomic resulting-opportunity grant remain authoritative backend responsibilities.

The preflight allowlist includes `Idempotency-Key`. It deliberately excludes tenant and user identity headers.

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

Recommended route-specific metadata also includes evidence freshness and explicit limitations. The gateway rejects a successful upstream response that omits the required provenance.

## Security controls

- Same-origin server-side gateway
- Explicit route and method allowlist
- Verified function-context authentication for every data route
- Signed administrator-controlled tenant membership
- Browser identity-header rejection
- Production-safe preview-bypass guard
- Explicit non-production sandbox tenant
- Upstream service token stored and used only on the server
- Tenant header generated only on the server
- Evaluation idempotency validation and forwarding
- Request and response size limits
- Abortable upstream timeout
- Redirect refusal
- Strict JSON parsing
- Contract and authority validation
- Correlation IDs
- No-store cache policy
- Non-sensitive logs and errors
- No provider-specific secret returned to the browser

## Activation sequence

1. Merge and validate the gateway membership boundary.
2. Choose the approved staging authentication configuration.
3. Create only approved test users and administrator-controlled sandbox memberships.
4. Configure a private staging upstream URL and service token.
5. Provision the matching sandbox tenant and tenant-owned records in authoritative SQLite.
6. Enable the gateway only in a deploy preview or approved staging context.
7. Run contract, authentication, tenant-isolation, browser, and authority tests.
8. Verify direct browser access to the backend remains blocked.
9. Obtain separate owner approval before any production activation.

The live SaaS prototype continues using explicit mock data until these gates pass. This branch does not activate authentication, real tenant membership, upstream connectivity, staging traffic, or live customer data.
