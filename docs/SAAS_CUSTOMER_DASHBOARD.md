# FlipForge SaaS Customer Dashboard

## Purpose

The customer Dashboard presents existing authenticated, tenant-scoped dashboard and Smart Opportunity projections. It does not create a dashboard database, recommendation engine, evidence-review engine, ranking layer, grading engine, market index, or alert authority.

**Production Dashboard is server-owned.** On `goflipforge.com/app/`, the customer must see authoritative server-returned intelligence or an honest fail-closed state. The legacy prototype Dashboard must never appear on production before, during, or after an unavailable or invalid authoritative response.

## Customer view

On production and approved deploy-preview/local application surfaces, the authoritative Dashboard reads only:

- `GET /api/v1/health`;
- `GET /api/v1/dashboard`;
- `GET /api/v1/opportunities`.

The page shows only returned tenant-owned information:

- tracked decision count;
- evidence-ready count;
- population-context count;
- server-reported needs-verification count;
- saved Smart Opportunity records in the order returned by the server;
- direct links to Evaluate, saved Opportunities/Card Intelligence, Compare, Tracking, and supporting workspaces.

No sample dashboard metric, mock opportunity, browser-generated recommendation, or prototype activity is substituted after a disabled gateway, authentication failure, membership failure, invalid authority envelope, correlation mismatch, upstream error, or malformed response.

## Production fail-closed boundary

The repository still retains legacy prototype route code for controlled non-production design/reference work while A2 consolidation continues. That retained code is not production authority.

`saas-prototype/production-dashboard-guard.js` loads before the legacy `app.js` router. On the production host and Dashboard route it immediately presents a neutral authoritative-loading state and removes any later legacy Dashboard overwrite before the browser can rely on it. Once `commercial-dashboard-v2.js` renders its server-owned Dashboard, the guard stands down and preserves that authoritative surface.

The production sequence is therefore:

1. production Dashboard guard activates;
2. any legacy prototype Dashboard output is suppressed;
3. `commercial-dashboard-v2.js` performs the allowed same-origin reads;
4. valid server authority renders tenant-owned Dashboard data;
5. any unavailable, unauthorized, forbidden, invalid-contract, or upstream state renders an honest fail-closed Dashboard;
6. prototype/mock customer intelligence is never used as fallback.

Deploy previews and localhost may retain explicitly labeled prototype behavior for design and deterministic UI validation. That exception does not extend to `goflipforge.com` or `www.goflipforge.com`.

## Authority boundaries

- Smart Opportunity remains the sole `BUY / WATCH / VERIFY / PASS` authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- SQLite remains the source of truth.
- The browser does not rerank, rescore, calculate a new priority, accept evidence, predict a grade, or persist authoritative Dashboard state.
- The needs-verification number is displayed from the dashboard projection.
- Saved opportunity records remain in the order returned by the API.
- Market Index remains unavailable until a server-authoritative market-index capability exists.
- No provider credential, billing, bid, checkout, payment, purchase, listing, sale, or production transaction authority is added by the Dashboard.

## Host, identity, and request boundaries

- Production customer Dashboard is eligible only on the approved production app host/path.
- Approved previews/local environments may exercise the same authoritative Dashboard adapter with controlled fixtures.
- Requests use `GET`, secure same-origin credentials, `cache: no-store`, and redirect rejection.
- Each request carries a client-generated correlation ID that must match the returned contract envelope.
- Dashboard and opportunity envelopes must identify `Smart Opportunity` and `Existing PSA intelligence` as the governing authorities.
- The browser sends no tenant ID, user ID, bearer token, service token, or provider credential.
- Signed tenant membership and trusted tenant-header injection remain server-owned gateway responsibilities.

## Current customer capability boundary

The private-beta application includes tenant-scoped Dashboard, provider-backed Discover when an approved source is configured, Evaluate, saved Opportunities/Card Intelligence, Compare, Evidence, saved PSA guidance, Exit Review, Tracking, Portfolio cost basis, in-app review Alerts, and Decision Dossier export.

Important limitations remain explicit:

- Portfolio does not calculate provider-backed current value, gain/loss, fees, taxes, or liquidation value unless those values are returned by an approved authoritative service.
- Alerts do not imply email, SMS, or push delivery unless separately implemented and enabled.
- Paid conversion remains subject to the explicit commercial/billing authorization state.
- Discover ranks only currently connected approved sources and does not claim complete-market coverage.
- No customer surface has transaction authority.

## Validation

Run:

```bash
npm run validate:customer-dashboard
```

The validator requires production host/path guarding, server-owned Dashboard contract reads, correlation and authority validation, same-origin request controls, returned-order preservation, and fail-closed behavior for disabled bridge, 401, 403, upstream, invalid-authority, invalid-PSA-authority, and correlation-mismatch cases. It also proves deploy-preview/local prototype behavior remains isolated from production.

The retained Identity, account lifecycle, customer intelligence, Discover, Opportunities, Evaluate, comparison, lifecycle, Decision Dossier, private-beta, gateway, tenant-isolation, production-prototype-isolation, commercial Dashboard, visual, and full-site QA suites must remain green.
