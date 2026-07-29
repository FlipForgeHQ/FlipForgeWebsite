# FlipForge SaaS API Bridge

Status: non-production gateway foundation for issue #15

Related authoritative-service issue: `toddholbein/FlipForge2#198`

## Purpose

The browser-hosted SaaS interface needs a same-origin server boundary before it can consume real FlipForge data. The Netlify gateway in `netlify/functions/flipforge-api.js` provides that boundary without moving recommendation, evidence, grading, or provider logic into JavaScript.

The gateway is not the recommendation engine. It forwards authenticated requests to an authoritative FlipForge service and verifies that every successful response identifies the existing authorities.

- Smart Opportunity remains the sole `BUY/WATCH/VERIFY/PASS` authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- The desktop SQLite database remains the source of truth until a separate backend migration is approved.
- The website cannot and must not open a desktop SQLite file directly.

## Default behavior

The gateway fails closed by default.

| Condition | Data-route result |
|---|---|
| No authenticated user | `401 AUTHENTICATION_REQUIRED` |
| Bridge disabled | `503 BRIDGE_DISABLED` |
| Upstream URL or service token missing | `503 UPSTREAM_NOT_CONFIGURED` |
| Route or method not allowlisted | `404 ROUTE_NOT_ALLOWED` |
| Upstream timeout or network failure | `503` with a non-sensitive error envelope |
| Upstream response violates the contract | `502 UPSTREAM_CONTRACT_INVALID` |

`GET /api/v1/health` is the only public route. It reports configuration booleans and never returns environment-variable values, tokens, URLs, or provider credentials.

## Environment variables

These values belong in Netlify server environment settings. None may be placed in browser JavaScript, HTML, repository secrets files, or customer-visible responses.

| Variable | Purpose |
|---|---|
| `FLIPFORGE_API_BRIDGE_ENABLED` | Must equal `true` before upstream proxying is allowed. Defaults to disabled. |
| `FLIPFORGE_API_BASE_URL` | Base URL of the authoritative FlipForge API service. |
| `FLIPFORGE_API_SERVICE_TOKEN` | Service-to-service bearer token sent only from the Netlify function. |
| `FLIPFORGE_API_ALLOWED_ORIGINS` | Optional comma-separated additional HTTPS origins. Same-origin requests are allowed automatically. |
| `FLIPFORGE_API_TIMEOUT_MS` | Upstream timeout. Defaults to 5,000 ms and is capped at 10,000 ms. |
| `FLIPFORGE_API_MAX_RESPONSE_BYTES` | Upstream JSON response limit. Defaults to and is capped at 1,000,000 bytes for this milestone. |
| `FLIPFORGE_API_MAX_REQUEST_BYTES` | Evaluation-request limit. Defaults to and is capped at 65,536 bytes. |
| `FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW` | Optional preview-only bypass. It is ignored when Netlify `CONTEXT=production`. |

## Authentication boundary

Data routes require a verified user in the Netlify function context. A preview bypass can be enabled only outside production and must never become a public production configuration.

This milestone does not implement customer signup, login, password recovery, billing, or entitlement enforcement. Those require a separate security review. The gateway merely refuses data access until a trusted identity is present.

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

## Security controls in this milestone

- Same-origin server-side gateway
- Explicit route and method allowlist
- Authentication required for every data route
- Production-safe preview-bypass guard
- Upstream service token stored and used only on the server
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

1. Complete the authoritative service tracked in `FlipForge2#198`.
2. Validate its DTOs against the v1 response contract.
3. Add customer authentication and entitlement enforcement.
4. Configure a deploy-preview upstream URL and service token.
5. Enable the gateway only in a deploy preview.
6. Run contract, security, browser, and authority-isolation tests.
7. Obtain separate owner approval before any production activation.

The live SaaS prototype continues using explicit mock data until these gates pass. This branch does not activate live customer data.
