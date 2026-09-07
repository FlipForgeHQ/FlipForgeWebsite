# FlipForge Customer / Operator Interface Split v1

## Purpose

FlipForge now treats the authenticated customer app and the private operator workspace as two separate interfaces over the same FlipForge intelligence system.

- Customer app: `/app/`
- Operator workspace: `/operator-beta.html`

This change does **not** create a second decision engine, a second evidence authority, or a second source of truth.

## Customer interface

The customer-visible primary navigation is intentionally limited to:

1. Home
2. Evaluate
3. Saved Decisions
4. Tracking

Alerts remain available from the top-bar notification control. Account remains available from the account control.

Advanced analytical destinations remain deep-link compatible for existing internal flows, validators, and saved references, but they are not exposed as primary customer navigation.

The customer Home screen is intentionally reduced to three actions:

- Evaluate a card
- Review saved decisions
- Check tracking

The private-beta guide is also reduced to one customer loop:

**Find card → Evaluate → Understand → Track**

## Operator interface

The existing operator workspace remains separate at `/operator-beta.html`.

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

## Validation

Run:

```bash
npm run validate:customer-operator-split
```

The validator confirms that the customer app exposes exactly four primary destinations, the advanced/internal route registry remains hidden, the operator workspace is not linked from the customer app, the operator/customer roles remain server-defined, and `/app` continues to route to the authenticated SaaS surface.
