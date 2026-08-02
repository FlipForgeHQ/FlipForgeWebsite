# FlipForge SaaS Customer Lifecycle Workspace

## Purpose

This milestone connects the customer SaaS to the tenant-owned lifecycle contract in FlipForge2. It makes watch status, review timing, customer outcomes, current holdings, cost basis, and in-app review reminders persistent without adding a second recommendation, PSA, evidence, portfolio-value, alert-delivery, or transaction authority.

## Customer routes

- `Tracking` joins tenant-owned saved opportunities to `/api/v1/lifecycle`.
- `Portfolio` projects only lifecycle rows explicitly marked `OWNED` with customer-entered acquisition facts.
- `Alerts` projects only persisted review rules and their due state.

Every route is restricted to approved deploy-preview hosts, requires the same-origin Identity session, and accepts only the existing signed tenant membership. Browser code never sends the trusted tenant header or service token.

## Write contract

`PUT /api/v1/lifecycle/{opportunityId}` submits one complete lifecycle snapshot:

- tracking status;
- optional review time;
- explicit outcome status;
- optional acquisition cost/date;
- optional disposition proceeds/date;
- in-app reminder enabled state;
- expected optimistic version.

The gateway allowlists only the fixed lifecycle path and forwards the body to FlipForge2 after authentication and tenant resolution. Cross-tenant resource access remains a non-disclosing `404`. Stale versions return `409 LIFECYCLE_VERSION_CONFLICT` and require a refresh.

## Honest boundaries

- Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- Evidence eligibility and acceptance remain server governed.
- SQLite remains the source of truth.
- Cost basis is a customer fact, not current value.
- No current-value total, performance, profit, fee, tax, or liquidation estimate is fabricated.
- Reminder delivery is in-app only; email, SMS, push, and marketplace delivery are not configured.
- No bid, purchase, listing, offer, checkout, payment, or transfer action exists.
- Production remains unchanged and disabled.

## Validation

Run:

```text
npm run validate:customer-lifecycle
```

The retained SaaS suite must also remain green before publication.
