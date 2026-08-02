# FlipForge SaaS Private Beta Readiness

## Purpose

This phase wraps the existing customer intelligence loop in a controlled private-beta experience. It does not create another application, recommendation engine, grading authority, database, or billing system.

The customer path remains:

1. accept an invitation and sign in;
2. evaluate one exact card and complete acquisition cost;
3. review the saved Card Intelligence and Decision Traceback;
4. return to the tracked SQLite record;
5. inspect saved Evidence, PSA guidance, or Exit Review context;
6. submit structured beta feedback.

Smart Opportunity remains the sole `BUY / WATCH / VERIFY / PASS` authority. Existing PSA intelligence remains the sole grading-guidance authority. SQLite remains the source of truth for saved evaluations and tenant-owned opportunities.

## First-run guidance

Authenticated users with an active, administrator-signed tenant membership are routed once to `#/beta-start` on eligible deploy previews. Completing the introduction stores only the browser preference key `flipforge.privateBeta.onboarding.v1` with the value `complete`.

The preference contains no email, user ID, tenant ID, token, card identity, listing URL, evaluation, recommendation, evidence, or entitlement. Clearing browser storage simply causes the guide to appear again. It does not change the account or authoritative data.

## Live status

The Beta Guide reads the same-origin `/api/v1/health` endpoint and reports the gateway as available, disabled, or unavailable. It never treats a disabled bridge as an active customer path and never substitutes mock data for a failed health response.

Production remains inactive. Tracked Netlify configuration keeps the gateway disabled unless a separately approved deploy-preview proof or beta session explicitly enables it.

## Feedback capture

The static application registers the Netlify form `flipforge-private-beta-feedback`. The customer form posts a bounded, URL-encoded payload to the same origin and collects only:

- feedback category;
- optional 1–5 experience rating;
- required summary;
- optional expected result;
- optional permission to include the invited account email for follow-up;
- the current application route.

The invited account email is included only when the tester checks the explicit follow-up permission. The form never submits a password, raw JWT, refresh token, tenant ID, provider credential, service token, listing URL, card identity, evaluation payload, or saved opportunity ID. Tester guidance explicitly tells users not to paste sensitive or card-specific data into feedback.

## Honest beta boundaries

- Invitation-only access; no public signup.
- Deploy previews only; no production customer activation.
- The API bridge may be disabled between controlled sessions.
- Manual Evaluate is the real customer entry path; provider-backed Discover is not yet active.
- Dashboard, Evaluate, Opportunities, Card Intelligence, Decision Traceback, Compare, Evidence Center, saved PSA guidance, Exit Review, Tracking, Portfolio, and Alerts use the existing tenant-scoped staging API when enabled.
- Decision Dossier export composes those existing tenant-scoped reads into one complete audit package when enabled.
- Provider-backed Discover remains a prototype/sample surface.
- Tracking persists watch status, review timing, acquisition/pass/sale outcomes, cost basis, and in-app reminder settings through tenant-owned SQLite lifecycle records with optimistic version checks and append-only history.
- Portfolio projects current holdings and customer-entered cost basis only. Current value, gain/loss, fees, taxes, and liquidation value remain unavailable rather than being inferred.
- Alerts project persisted in-app review rules. Email, SMS, push, marketplace actions, and any transaction delivery remain unconfigured.
- Decision Dossier export fails closed unless the saved opportunity, governed evidence, saved PSA guidance, and append-only lifecycle history all match one tenant-owned record. Its SHA-256 digest detects changes but is not a digital signature.
- Provider-backed current value, performance analytics, and external email, SMS, or push delivery still require separate governed contracts.
- No billing provider, paid plan, usage enforcement, or entitlement override is active.
- No evidence acceptance, identity approval, PSA recalculation, grade prediction, bid, checkout, payment, purchase, listing, or resale authority exists in the customer browser.

## Validation

Run:

```bash
npm run validate:private-beta
```

The retained Identity, account lifecycle, customer intelligence, gateway, tenant-isolation, staging-read, staging-evaluation, live-proof harness, activation-readiness, prototype, and visual suites must remain green.
