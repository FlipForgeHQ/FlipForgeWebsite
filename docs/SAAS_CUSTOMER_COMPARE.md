# FlipForge SaaS Customer Direct Comparison

## Purpose

This phase connects the existing customer `#/compare` route to the authoritative tenant-scoped Compare API. It compares saved records already owned by the signed-in tenant; it does not create another recommendation engine, comparison database, watchlist, or scoring layer.

## Customer flow

1. Load the signed-in tenant's saved SQLite opportunities.
2. Select two different saved records.
3. Request `GET /api/v1/compare?ids={id1},{id2}` through the same-origin Netlify gateway.
4. Display each saved Smart Opportunity decision and returned factor unchanged.
5. Open either record in Card Intelligence for its Decision Traceback, evidence chain, and saved PSA context.

An opportunity-detail link may carry one preferred left-side ID into Compare. That ID is held only in memory while the route changes. No comparison selection, identity, recommendation, token, or tenant data is written to browser storage.

## Authority and data boundaries

- Smart Opportunity remains the sole `BUY / WATCH / VERIFY / PASS` authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- SQLite remains the source of truth for the compared tenant-owned records.
- The Compare API returns saved values and recommendations unchanged.
- The customer browser does not rerank, rescore, select a winner, accept evidence, or predict a grade.
- A same-identity response is labeled explicitly. Different exact identities are disclosed as decision context, not interchangeable comp evidence.
- Active asks remain discovery context and never become completed-sale evidence.
- No provider call, provider credential, billing, bid, checkout, payment, purchase, listing, sale, or production activation is added.

## Failure behavior

- The route is available only on eligible deploy previews and local development.
- A disabled bridge produces a safely offline state and makes no tenant data request.
- Authentication and membership failures remain explicit.
- Invalid, duplicated, missing, or cross-tenant IDs fail closed.
- The browser accepts only contract-valid, correlated authority envelopes.
- A response that does not contain the two requested records in order is rejected.
- No mock comparison is substituted after any failure.

## Beta status

The real customer loop is now:

`Evaluate → Card Intelligence → Decision Traceback → Direct Comparison → Track`

Dashboard, provider-backed Discover, Portfolio, Sell, and Alerts remain sample-backed until separate authoritative customer sources are connected. Production remains disabled.

## Validation

Run:

```bash
npm run validate:customer-compare
```

The retained Identity, account lifecycle, customer intelligence, private-beta, gateway, tenant-isolation, staging-read, staging-evaluation, live-proof, prototype, and visual validations must remain green.
