# FlipForge SaaS Customer Dashboard

## Purpose

This phase replaces the deploy-preview sample Dashboard with the existing authenticated, tenant-scoped dashboard and opportunity projections. It does not create a dashboard database, recommendation engine, review engine, ranking layer, or alert source.

## Customer view

On an eligible deploy preview, `#/dashboard` reads:

- `GET /api/v1/health`;
- `GET /api/v1/dashboard`;
- `GET /api/v1/opportunities`.

The page shows only returned tenant-owned information:

- tracked decision count;
- evidence-ready count;
- population-context count;
- server-reported needs-verification count;
- saved Smart Opportunity records in the order returned by the server;
- direct links to Evaluate, Tracked Opportunities, Card Intelligence, and Compare.

No sample dashboard metric or mock opportunity is substituted after a disabled gateway, authentication failure, membership failure, invalid response, or upstream error.

## Authority boundaries

- Smart Opportunity remains the sole `BUY / WATCH / VERIFY / PASS` authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- SQLite remains the source of truth.
- The browser does not rerank, rescore, calculate a new priority, accept evidence, predict a grade, or persist dashboard state.
- The needs-verification number is displayed exactly as returned by the dashboard projection.
- Saved opportunity cards remain in the order returned by the API.
- No provider call, provider credential, billing, bid, checkout, payment, purchase, listing, sale, or production activation is added.

## Host and identity boundaries

- The real Dashboard is limited to deploy-preview hosts and local development.
- Requests use secure same-origin cookies and `cache: no-store`.
- The browser sends no tenant ID, user ID, bearer token, service token, or provider credential.
- Signed tenant membership remains a server-owned gateway responsibility.
- Production keeps the existing static prototype behavior until a separately approved production phase.

## Honest incomplete surfaces

Provider-backed Discover, Portfolio, Sell, and Alerts remain sample or unavailable customer surfaces. The backend currently returns honest `configured=false` states for Portfolio and Alerts, so this phase does not present them as working customer features.

## Validation

Run:

```bash
npm run validate:customer-dashboard
```

The retained Identity, account lifecycle, customer intelligence, comparison, private-beta, gateway, tenant-isolation, staging-read, staging-evaluation, live-proof, activation-readiness, prototype, and visual suites must remain green.
