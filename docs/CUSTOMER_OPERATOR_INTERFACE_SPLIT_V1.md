# FlipForge Customer / Operator Interface Split v1

## Purpose

FlipForge treats the authenticated customer app and the private operator workspace as two separate interfaces over the same FlipForge intelligence system.

- Customer app: `/app/`
- Operator workspace: `/operator-beta.html`

This does **not** create a second decision engine, a second evidence authority, or a second source of truth.

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

The customer loop is:

**Enter card → Confirm → Decision → Save & track**

### Live Evaluate flow

`/app/#/discover` is the customer-facing **Evaluate** experience. The existing connected-source discovery and identity services remain underneath it; the customer no longer has to understand the internal separation between Discover and Evaluate.

The first-view experience is intentionally limited to:

1. Enter the exact card identity the customer knows.
2. Confirm the exact card when identity clarification is required.
3. Choose the active listing actually being considered.
4. Run the existing Smart Opportunity evaluation for that listing.
5. Read the saved BUY, WATCH, VERIFY, or PASS result.
6. See the two highest-priority reasons taken from the saved decision traceback.
7. Track the card or open the full evidence when deeper review is wanted.

Healthy provider diagnostics, result-count controls, secondary ranking metrics, full traceback, Evidence Chain, PSA detail, and other advanced context do not compete with the first-view workflow. They remain available underneath the same governed system and can be progressively disclosed where appropriate.

The customer shell does not create a recommendation, rescore a decision, accept evidence, predict a grade, or invent a reason. The two visible reasons are selected from the already-rendered saved decision traceback.

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

The validator confirms that the customer app exposes exactly four primary destinations, the advanced/internal route registry remains hidden, the operator workspace is not linked from the customer app, the operator/customer roles remain server-defined, `/app` continues to route to the authenticated SaaS surface, and the simplified live Evaluate workflow preserves the decision/evidence boundaries described above.