# FlipForge Customer / Operator Interface Split v1

## Purpose

FlipForge treats the definitive authenticated customer app and the private operator workspace as two separate interfaces over the same FlipForge intelligence system.

- Customer app: `/app/customer/`
- Private Beta onboarding inside customer app: `/app/customer/#/beta-start`
- Operator workspace: `/operator-beta.html`

The `/app` path is only a compatibility alias that canonicalizes to `/app/customer/`. Private Beta does **not** create a separate customer app.

This interface split does **not** create a second decision engine, a second evidence authority, or a second source of truth.

## Customer interface

The full customer app exposes the current Card Decision Intelligence workflow, including Home, Discover, Evaluate a Card, Decision Intelligence, Why This Decision, Evidence Review, Saved Decisions, Outcome Intelligence, Portfolio, Alerts, Forge Heat, Market View, and approved advanced-analysis routes.

Private Beta testers enter this same customer shell. Their signed membership controls beta access and capability availability. The `#/beta-start` route is a first-run guide rendered by `private-beta.js` inside the full customer shell; it is not an alternative beta application.

The first-session beta loop remains intentionally focused:

**Find card → Evaluate → Understand the evidence and decision → Save/Track → Feedback**

The customer UI must clearly label beta-limited or unavailable capabilities rather than presenting dead controls that imply an authority or backend capability that is intentionally inactive.

## Operator interface

The operator workspace remains separate at `/operator-beta.html`.

Operator access continues to depend on the existing `flipforge-operator` role (or authorized admin role). Operator applicant reads and mutations remain re-authorized server-side.

The customer app does not link to the operator workspace.

## Authority boundaries

This interface split is presentation and access-surface work only.

It does not change:

- Smart Opportunity BUY/WATCH/VERIFY/PASS authority;
- PSA grading-guidance authority;
- evidence eligibility or acceptance;
- tenant/account isolation;
- billing authority;
- provider administration;
- transaction authority;
- the canonical backend source of truth.

## Canonical routing contract

- `/app` → `/app/customer/`
- `/app/customer/` serves the definitive customer document.
- `/app/customer/#/beta-start` renders Private Beta onboarding inside that document.
- `/app/#/beta-start` is legacy and must not be emitted by invitation, Terms-completion, onboarding, operator, or support flows.
- `/operator-beta.html` remains the separate owner/operator interface.

## Validation

Run:

```bash
npm run validate:customer-operator-split
```

The validator confirms that the full customer app remains authoritative, the Private Beta Guide is mounted inside it, operator/customer roles remain server-defined, the operator workspace is not linked from the customer app, `/app` canonicalizes to `/app/customer/`, and the retired legacy beta-shell redirects do not return.
