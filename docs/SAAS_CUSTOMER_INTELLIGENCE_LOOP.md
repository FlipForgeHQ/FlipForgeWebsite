# FlipForge SaaS Customer Intelligence Loop

## Purpose

This phase turns the already-proven staging evaluation and read APIs into one coherent customer workflow on deploy previews:

1. **Evaluate** — submit listing facts, exact card identity, and complete acquisition costs.
2. **Save and track** — the authoritative backend persists the evaluation to SQLite and grants tenant ownership.
3. **Understand** — Card Intelligence shows the saved recommendation, factors, value gap, evidence readiness, and limitations.
4. **Trace** — Decision Traceback connects identity, completed-sale evidence, market factors, and the final authority output.
5. **Review context** — the same saved record exposes governed evidence and existing PSA guidance without recalculation.

There is no second recommendation engine. Smart Opportunity remains the sole `BUY / WATCH / VERIFY / PASS` authority, and the browser never calculates or overrides those decisions. Existing PSA intelligence remains the sole grading-guidance authority.

## Customer routes

On eligible deploy previews and local development:

- `#/evaluate` uses the authenticated tenant-scoped evaluation endpoint.
- `#/opportunities` uses the authenticated tenant-scoped dashboard and opportunity list.
- `#/opportunities/{safe-id}` loads the saved opportunity, evidence chain, and PSA context.

The existing diagnostic routes remain available separately:

- `#/staging`
- `#/staging-evaluate`

Production keeps its existing mock prototype routes. Production remains disabled for real customer data, and tracked configuration does not activate the API bridge.

## Persistence and tracking

An evaluation becomes tracked only after the backend response proves all of the following:

- persisted to SQLite;
- tenant owned;
- tenant-scoped idempotency;
- ownership granted on completion;
- default-deny access;
- zero transaction authority.

The browser does not create a separate watchlist database or local-storage record. The tenant-owned saved opportunity is the tracked record.

## Evidence and traceback boundaries

Decision Traceback is a read-only explanation of returned data. It shows:

- exact identity mapping state and saved status message;
- accepted exact completed-sale count;
- visible but authority-ineligible evidence;
- saved liquidity, risk, rank, workflow, and recommendation;
- saved evidence ledger rows;
- saved PSA snapshot and population context when available.

Active listings and asks never become completed-sale evidence. The customer browser cannot accept, reject, or hold evidence and cannot expose operator-only review controls.

## Explicit exclusions

- No public signup.
- No billing or paid entitlement authority.
- No provider calls or provider credential entry from the browser.
- No evidence acceptance or identity verification.
- No PSA recalculation or grade prediction.
- No bid, checkout, payment, purchase, listing, or resale authority.
- No production activation.

## Validation

Run:

```bash
npm run validate:customer-intelligence
```

The retained Identity, account lifecycle, staging read, staging evaluation, gateway, tenant, prototype, and visual suites must also continue to pass.
