# FlipForge Staging Evaluation Submission

Status: non-production browser write foundation for `FlipForge2#205`

## Purpose

The isolated `#/staging-evaluate` route submits one manually entered opportunity through the existing same-origin gateway to the already-authoritative tenant-scoped evaluation endpoint.

It does not create another recommendation engine. The browser collects and validates intake fields, but Smart Opportunity remains the sole `BUY/WATCH/VERIFY/PASS` authority and existing PSA intelligence remains the sole grading-guidance authority.

## Availability

The evaluation route is visible only on:

- Netlify deploy-preview hosts matching `deploy-preview-<number>--goflipforge.netlify.app`
- `localhost`
- `127.0.0.1`

The production hostname is not allowlisted. Loading the production site does not reveal the route and does not send an evaluation request.

## Request boundary

The browser sends one fixed same-origin request:

```text
POST /api/v1/evaluations
```

Headers:

- `Authorization: Bearer <signed Netlify Identity JWT>` when an authenticated preview user exists
- `X-Correlation-Id: <browser-generated correlation ID>`
- `Idempotency-Key: <browser-generated safe key>`
- `Content-Type: application/json; charset=utf-8`

The browser never sends:

- `X-FlipForge-Tenant-Id`
- `X-FlipForge-User-Id`
- the service bearer token
- provider credentials
- recommendation, score, evidence-acceptance, verification, grading, or transaction overrides

The merged gateway remains responsible for verified user context, active membership resolution, trusted tenant-header injection, route allowlisting, request-size limits, and server-to-server authentication.

## Form fields

Required:

- External listing ID
- Marketplace
- Exact card identity
- Listing URL
- Item price
- Explicit acknowledgment of the staging authority boundary

Optional:

- Seller
- Shipping
- Buyer premium
- Tax
- Listing format
- Ends-at value

Dollar values are converted in the browser to non-negative integer cents using exact decimal parsing. The browser rejects more than two decimal places and the backend maximum of `10,000,000,000` cents.

Supported marketplace values match the authoritative Java intake enum:

- `EBAY`
- `COMC`
- `MYSLABS`
- `GOLDIN`
- `HERITAGE`
- `FANATICS_COLLECT`
- `DEALER`
- `CARD_SHOW`
- `FACEBOOK_GROUP`
- `OTHER`

## Idempotency behavior

The browser generates an `eval-...` idempotency key and holds it only in memory.

- Retrying an unchanged payload reuses the same key.
- Changing any submitted field produces a different payload fingerprint and a new key.
- No key or evaluation draft is stored in local storage, session storage, or cookies.
- The backend remains the authority for tenant-scoped claim, replay, conflict, failure, completion, and ownership-grant behavior.

## Successful response requirements

The browser refuses to display a successful result unless the response proves all of the following:

- Contract version `1.0`
- Exact correlation-ID match
- `meta.authority = Smart Opportunity`
- `meta.gradingAuthority = Existing PSA intelligence`
- `data.kind = evaluation`
- Exact request-ID/idempotency-key match
- Safe saved opportunity ID
- SQLite persistence
- Tenant ownership
- Tenant-scoped idempotency
- Ownership granted on completion
- Default tenant access is deny
- No request-driven evidence verification
- No request-driven identity verification
- No evidence acceptance
- No PSA recalculation
- No provider credential exposure
- No transaction authority
- Recommendation is one of `BUY`, `WATCH`, `VERIFY`, or `PASS`

A response that violates any of these conditions fails closed and is not shown as an authoritative result.

## Separation from saved reads

The existing `#/staging` route remains a separate read-only adapter. The evaluation route does not mutate the mock cockpit or inject its response into mock data.

After a successful submission, the response may link to the saved record through `#/staging/<opportunityId>`. The saved-read route still performs its own tenant-scoped API request and contract validation.

## Explicit exclusions

This phase does not:

- deploy the private Java backend
- configure a persistent staging volume
- activate Netlify Identity or create accounts
- provision a real tenant membership
- configure an upstream URL or service token
- enable the production gateway
- call marketplace or grading providers
- scrape data
- accept or fabricate sold evidence
- verify card identity
- predict a grade
- authorize bidding, purchasing, checkout, payment, listing, or resale
- activate billing or paid enrollment

## Validation

Run from the website repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-saas-staging-evaluation-submit-phase.ps1
```

The phase validates JavaScript syntax, the 97-check evaluation adapter suite, the retained staging-read suite, gateway security and membership suites, the full prototype suite, website assets, and browser boundary scans.

No merge, backend deployment, authentication activation, tenant provisioning, secret configuration, or production activation is included in this phase.
