# FlipForge SaaS Staging Live Proof

## Purpose

This phase converts the existing simulated staging-readiness pack into an executable, fail-closed proof against the real non-production website gateway and authoritative hosted backend.

It does **not** authorize production activation. It does **not** commit a Render URL, Netlify Identity token, tenant identifier, service token, provider credential, or customer data to Git.

## What the proof verifies

The live harness verifies the complete staging customer path:

1. public gateway health reports a configured staging bridge;
2. unauthenticated customer data access returns `401 AUTHENTICATION_REQUIRED`;
3. an optional authenticated-but-unprovisioned identity returns a tenant-membership `403`;
4. tenant A loads the authoritative dashboard and opportunity list;
5. tenant A submits one controlled evaluation;
6. the evaluation remains governed by Smart Opportunity and existing PSA intelligence;
7. the evaluation is persisted to SQLite and tenant ownership is granted;
8. repeating the exact request with the same idempotency key returns an idempotent replay;
9. tenant A can read the saved opportunity, evidence, and PSA guidance;
10. tenant B receives the same non-disclosing `404 RESOURCE_NOT_FOUND` used for a missing record;
11. no browser/client request injects `X-FlipForge-Tenant-Id` or `X-FlipForge-User-Id`;
12. no transaction authority, evidence acceptance, or PSA recalculation is introduced by the request.

The output is a redacted proof containing status codes, correlation IDs, the saved staging opportunity ID, and pass/fail state. It does not contain JWTs, service tokens, raw tenant IDs, or provider credentials.

## Safety gates

The harness refuses to run when:

- `FLIPFORGE_STAGING_ORIGIN` is `goflipforge.com` or `www.goflipforge.com`;
- a non-local origin is not HTTPS;
- the exact write acknowledgment is missing;
- either controlled staging JWT is missing;
- the evaluation payload contains recommendation, confidence, supported value, verification, tenant, transaction, evidence-acceptance, PSA-recalculation, or authority override fields;
- the returned response weakens Smart Opportunity, PSA, tenant-isolation, idempotency, persistence, or transaction-denial boundaries.

## Required environment values

Supply these values only in the operator shell or secret manager. Do not add them to repository files.

```text
FLIPFORGE_STAGING_ORIGIN=https://<approved-netlify-deploy-preview-host>
FLIPFORGE_STAGING_USER_A_JWT=<signed-user-a-jwt>
FLIPFORGE_STAGING_USER_B_JWT=<signed-user-b-jwt>
FLIPFORGE_STAGING_LIVE_PROOF_ACK=RUN_STAGING_WRITE_PROOF
FLIPFORGE_STAGING_EVALUATION_PAYLOAD_FILE=<absolute-or-relative-path-to-controlled-json>
```

Optional:

```text
FLIPFORGE_STAGING_UNPROVISIONED_JWT=<signed-unprovisioned-user-jwt>
```

The JWTs are read only from process memory and are never written to the proof artifact.

## Controlled evaluation payload

Use a staging-only listing/evaluation record. The payload must follow the existing authoritative manual-intake contract, for example:

```json
{
  "externalListingId": "staging-proof-20260801-001",
  "marketplace": "EBAY",
  "cardIdentity": "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  "listingUrl": "https://example.invalid/staging-proof-20260801-001",
  "seller": "staging-proof-seller",
  "itemPriceCents": 52525,
  "shippingCents": 850,
  "buyerPremiumCents": 0,
  "taxCents": 4202,
  "listingFormat": "FIXED_PRICE"
}
```

Do not place expected recommendation, confidence, supported value, risk, verification, evidence acceptance, grade prediction, tenant identity, or transaction fields into the request. Those outcomes belong only to the existing FlipForge authorities.

## Repository validation

Before any live run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\validate-saas-staging-live-proof-phase.ps1
```

This retains the complete staging activation-readiness suite and validates the live-proof harness with deterministic simulated gateway responses.

## Live run

With the approved staging bridge enabled and maintenance protections reviewed:

```powershell
node .\scripts\run-saas-staging-live-proof.mjs `
  --output .\artifacts\saas-staging-live-proof.json
```

Expected success message:

```text
Staging live proof completed successfully.
```

Review the proof artifact before any subsequent activation decision.

## Rollback

If any live check fails:

1. set the staging-only website bridge back to `false`;
2. redeploy the staging website configuration;
3. confirm public gateway health reports `disabled`;
4. preserve correlation IDs and the redacted failed-run notes;
5. rotate the staging service token if exposure is suspected;
6. disable or correct staging memberships if tenant assignment is uncertain;
7. restore the last verified SQLite backup if persistence integrity is uncertain;
8. keep production disabled.

## Production boundary

Passing this phase proves a controlled staging customer path only. It does not make billing, entitlements, customer lifecycle, production gateway activation, or production data migration complete.