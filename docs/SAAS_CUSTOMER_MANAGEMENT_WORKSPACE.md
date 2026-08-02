# FlipForge SaaS Customer Management Workspace

## Purpose

This phase converts five remaining private-beta routes from sample-only screens into one coherent customer decision-management workspace. It reuses the existing tenant-scoped API and saved SQLite records; it does not create another application, recommendation engine, evidence authority, PSA authority, alert database, portfolio database, or transaction system.

## Real customer routes

On eligible deploy previews and local development:

- `#/evidence/{saved-id}` reads the tenant-owned tracked-card list and the selected saved evidence ledger;
- `#/psa-advisor/{saved-id}` reads the selected saved PSA snapshot and population context;
- `#/sell/{saved-id}` reads the selected saved Smart Opportunity and governed evidence for an advisory Exit Review;
- `#/portfolio` reads the authoritative portfolio capability status;
- `#/alerts` reads the authoritative customer-alert capability status.

All requests use the same-origin Netlify gateway, signed Identity session cookie, administrator-signed tenant membership, server-injected trusted tenant header, and existing FlipForge service contract. No customer data request is attempted when gateway health is disabled.

## Evidence Center

Evidence Center displays:

- accepted exact completed-sale count;
- visible but authority-ineligible count;
- linked saved evidence rows;
- manual evidence candidates and linked/candidate-only state;
- read-only evidence-ledger timeline events.

The browser cannot accept, reject, hold, relink, or edit evidence. Active listings and fixed-price asks never become completed-sale evidence. Internal operator controls and notes remain excluded.

## PSA Advisor

The customer PSA route displays the already-saved PSA snapshot, population context, review priority, recommendation ceiling, source version, and returned review requirements. It requires `recalculated=false` and refuses a response that does not match the selected tenant-owned opportunity.

The route never runs or persists a new grade-lane analysis and never predicts the grade of a raw card. Existing PSA intelligence remains the sole grading-guidance authority.

## Exit Review

Exit Review displays existing saved inputs only:

- unchanged Smart Opportunity recommendation;
- current ask and supported value;
- liquidity, risk, and confidence;
- mapping state;
- accepted exact completed-sale count;
- outside cost categories the customer must verify.

The browser creates no sell recommendation, timing score, readiness score, fee estimate, guaranteed proceeds, listing, offer, checkout, payment, or marketplace action. Smart Opportunity remains the sole `BUY / WATCH / VERIFY / PASS` authority.

## Honest Portfolio and Alerts status

The backend currently returns contract-valid `configured=false` responses for Portfolio and Alerts. The customer routes now display that authoritative state instead of mock holdings, gains, alert rules, unread counts, or in-memory toggles.

This phase deliberately does not claim that customer holdings, custom alert rules, delivery, review schedules, or outcome writes are persistent. Those require new authoritative backend contracts and SQLite persistence before customer controls may be added.

## Privacy and security boundaries

- Deploy-preview and local-development hosts only.
- Production keeps the existing inactive prototype behavior.
- Same-origin authenticated `GET` requests only.
- No browser-supplied tenant or user identity header.
- No service token, provider credential, raw JWT, refresh token, or tenant ID.
- No local or session storage for customer data.
- No mock fallback after disabled health, authentication failure, membership failure, invalid contract, or upstream error.
- No evidence acceptance, identity approval, reranking, rescoring, grade prediction, billing, entitlement, or transaction authority.

## Validation

Run:

```bash
npm run validate:customer-management
```

The Netlify build runs this gate with the retained Identity, account, Dashboard, Evaluate, Card Intelligence, Compare, private-beta, gateway, tenant, staging, prototype, and brand validations.
