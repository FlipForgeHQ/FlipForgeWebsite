# FlipForge SaaS Private Beta Readiness

## Purpose

This phase wraps the existing customer intelligence loop in a controlled private-beta experience. It does not create another application, recommendation engine, grading authority, database, or billing system.

The customer path is now:

1. accept an invitation and sign in;
2. either search approved connected active-listing sources in Discover or enter one exact listing manually in Evaluate;
3. explicitly submit the chosen listing to the existing authoritative Smart Opportunity evaluation endpoint;
4. review the saved Card Intelligence and Decision Traceback;
5. return to the tracked SQLite record;
6. inspect saved Evidence, PSA guidance, Exit Review, lifecycle, Portfolio reference context, or Decision Dossier context;
7. submit structured beta feedback or a 7 / 14 / 30 outcome checkpoint.

Smart Opportunity remains the sole `BUY / WATCH / VERIFY / PASS` authority. Existing PSA intelligence remains the sole grading-guidance authority. SQLite remains the source of truth for saved evaluations and tenant-owned opportunities.

## First-run guidance

Authenticated users with an active, administrator-signed tenant membership are routed once to `#/beta-start` on eligible deploy previews. Completing the introduction stores only the browser preference key `flipforge.privateBeta.onboarding.v1` with the value `complete`.

The preference contains no email, user ID, tenant ID, token, card identity, listing URL, evaluation, recommendation, evidence, or entitlement. Clearing browser storage simply causes the guide to appear again. It does not change the account or authoritative data.

## Live status

The Beta Guide reads the same-origin `/api/v1/health` endpoint and reports the gateway as available, disabled, or unavailable. It never treats a disabled bridge as an active customer path and never substitutes mock data for a failed health response.

Production remains inactive. Tracked Netlify configuration keeps the gateway disabled unless a separately approved deploy-preview proof or beta session explicitly enables it.

## Feedback capture

The customer application posts a bounded JSON payload to the same-origin `POST /api/beta/feedback` function. The function independently requires an authenticated account with `flipforge-active` and exactly one administrator-signed tenant role before writing to the site-scoped beta feedback store. It collects only:

- feedback category;
- optional 1–5 experience rating;
- required summary;
- optional expected result;
- optional permission to include the invited account email for follow-up;
- the current application route;
- a general, Day 7, Day 14, or Day 30 checkpoint; and
- an optional tester-reported outcome signal: original reasoning still supported, original reasoning needs revision, or evidence remains insufficient.

The server reads the invited account email from the signed Identity session only when the tester checks explicit follow-up permission. The browser never submits an email address, password, raw JWT, refresh token, tenant ID, provider credential, service token, listing URL, card identity, evaluation payload, or saved opportunity ID. Tester guidance explicitly tells users not to paste sensitive or card-specific data into feedback.

The role-gated operator workspace reports feedback review state and checkpoint counts. These signals do not mutate the saved evaluation, recalculate a recommendation, prove product accuracy, or represent market performance.

## Honest beta boundaries

- Invitation-only access; no public signup.
- Deploy previews only; no production customer activation.
- The API bridge may be disabled between controlled sessions.
- Provider-backed Discover is a real customer path when both the private-beta bridge and the approved server-side active-listing provider are configured.
- Discover currently searches approved connected active-listing sources only; it does not claim complete-market coverage.
- Discover search results are ephemeral and do not create tenant-owned saved opportunities. Ownership begins only after the customer explicitly requests authoritative evaluation.
- If the provider is unavailable, Discover returns an honest empty/unavailable state and does not substitute mock candidates or expose provider setup/credential details.
- Discover ranking is active-listing prioritization only. It is not `BUY / WATCH / VERIFY / PASS` and active asks never become completed-sale evidence.
- Manual Evaluate remains available as a direct customer entry path.
- Dashboard, Discover, Evaluate, Opportunities, Card Intelligence, Decision Traceback, Compare, Evidence Center, saved PSA guidance, Exit Review, Tracking, Portfolio, Alerts, and Decision Dossier use the existing tenant-scoped staging API when enabled.
- Decision Dossier export composes existing tenant-scoped reads into one complete audit package when enabled.
- Tracking persists watch status, review timing, acquisition/pass/sale outcomes, cost basis, and in-app reminder settings through tenant-owned SQLite lifecycle records with optimistic version checks and append-only history.
- Portfolio projects current `OWNED` holdings and customer-entered cost basis. When exact identity is confirmed and at least three accepted exact completed sales include a sale no more than 30 days old, Portfolio may also expose an evidence-supported reference value and server-calculated unrealized reference comparison.
- Active listings and asking prices never support the Portfolio reference value. The Portfolio request performs no provider call and persists no valuation result.
- Generic or unsupported Current value, gain/loss, fees, taxes, and liquidation value remain unavailable rather than being inferred. Portfolio reference value is not an appraisal, guaranteed proceeds estimate, or realized gain/loss claim.
- Whole-portfolio reference totals remain unavailable unless every owned holding satisfies the reference gates; covered subtotals include only eligible holdings.
- Alerts project persisted in-app review rules. Email, SMS, push, marketplace actions, and any transaction delivery remain unconfigured.
- Decision Dossier export fails closed unless the saved opportunity, governed evidence, saved PSA guidance, and append-only lifecycle history all match one tenant-owned record. Its SHA-256 digest detects changes but is not a digital signature.
- Live provider refresh, external email/SMS/push delivery, and transaction-specific fee/tax/liquidation estimates still require separate governed contracts.
- No billing provider, paid plan, usage enforcement, or entitlement override is active.
- No evidence acceptance, identity approval, PSA recalculation, grade prediction, bid, checkout, payment, purchase, listing, or resale authority exists in the customer browser.

## Validation

Run:

```bash
npm run validate:customer-discovery
npm run validate:customer-portfolio
npm run validate:private-beta
```

The retained Identity, account lifecycle, customer intelligence, provider-backed Discover, evidence-gated Portfolio, gateway, tenant-isolation, staging-read, staging-evaluation, live-proof harness, activation-readiness, prototype, Decision Dossier, and visual suites must remain green.
