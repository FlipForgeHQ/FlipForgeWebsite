# FlipForge Customer App Audit Standard

Status: required pre-merge customer-app assurance

## Principle

A customer-facing capability is not considered ready merely because it renders. Every customer route and every critical state must provide a usable next action, preserve Card Decision Intelligence authority boundaries, and fail closed without becoming a dead end.

## Required state coverage

Every protected customer route is audited in the following states where applicable:

1. Anonymous / authentication required (401)
2. Authenticated customer shell with authorized server responses
3. Stale cached browser identity while the authoritative server returns 401
4. Authorized tenant data
5. Empty data
6. Invalid or unavailable upstream data
7. Mobile viewport
8. Desktop viewport

## Required route coverage

The governed customer route matrix includes:

- Home / Dashboard
- Discover
- Evaluate
- Decision Intelligence
- Why This Decision (Decision Intelligence subview; same saved decision authority)
- Evidence Review
- Saved Decisions
- Outcome Intelligence
- Portfolio
- Alerts
- Forge Heat
- Market View
- Account
- Compare
- PSA Advisor
- Exit Review
- Audit Export

## Required customer navigation hierarchy

The full customer app must expose one continuous Card Decision Intelligence journey in this order:

1. Home
2. Discover
3. Evaluate a Card
4. Decision Intelligence
5. Why This Decision
6. Evidence Review
7. Saved Decisions
8. Outcome Intelligence
9. Portfolio
10. Alerts
11. Forge Heat
12. Market View

Advanced Analysis may contain Compare, PSA Advisor, Exit Review, and Audit Export. A promoted top-level route must not also appear in Advanced Analysis.

Why This Decision is a presentation subview of the existing Decision Intelligence route and must not create a second recommendation, evidence, supported-value, or grading authority. Evidence Review must continue to use the existing governed evidence projection.

The private-beta shell intentionally remains simpler. Full-customer-only navigation must not leak into private beta. Internal beta links may still open an existing governed evidence route when needed for the beta workflow; navigation isolation does not mean duplicating or disabling the shared evidence authority.

## Required customer-journey assertions

- No protected route may strand an anonymous customer without a visible sign-in path.
- A server 401 must override stale or cached browser identity when deciding whether authentication recovery is required.
- Sign-in must return to the exact full-customer route the customer was using.
- A route may fail closed, but it may not render a blank workspace.
- The authentication recovery control must remain inside the viewport on desktop and mobile.
- The recovery control must disappear only after a healthy authenticated state is paired with authorized server responses.
- Customer navigation must remain usable and visually stable across routes.
- Full customer navigation and private-beta navigation must remain intentionally separate and independently auditable.
- No full-customer-only top-level feature may leak into private-beta navigation.
- No promoted top-level feature may also appear in Advanced Analysis.
- Customer-facing copy must not leak beta/operator implementation language.
- No browser surface may create recommendation, evidence, grading, supported-value, outcome, entitlement, tenant, or transaction authority that belongs to the authoritative service.
- No synthetic data may be substituted when authoritative data is unavailable.
- Customer-route changes must trigger the Full Customer App Assurance workflow.
- The same assurance must run again on `main` after merge.

## Current automated gates

- `scripts/validate-full-customer-app.mjs`
- `scripts/validate-customer-navigation-parity.mjs`
- `scripts/audit-full-customer-route-ci.mjs`
- `scripts/audit-customer-auth-recovery-ci.mjs`
- `scripts/audit-customer-shell-parity-ci.mjs`
- `scripts/audit-customer-navigation-parity-ci.mjs`
- `.github/workflows/full-customer-app-assurance.yml`

## Release rule

A customer-app change is not release-ready if any required audit fails. Fix the product or the audit fixture; do not weaken an authority, identity, evidence, security, navigation-isolation, or customer-journey rule merely to make CI green.
