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
- Saved Decisions
- Outcome Intelligence
- Portfolio
- Alerts
- Forge Heat
- Market View
- Account
- Compare
- PSA Advisor
- Evidence
- Exit Review
- Audit Export

## Required customer-journey assertions

- No protected route may strand an anonymous customer without a visible sign-in path.
- A server 401 must override stale or cached browser identity when deciding whether authentication recovery is required.
- Sign-in must return to the exact full-customer route the customer was using.
- A route may fail closed, but it may not render a blank workspace.
- The authentication recovery control must remain inside the viewport on desktop and mobile.
- The recovery control must disappear only after a healthy authenticated state is paired with authorized server responses.
- Customer navigation must remain usable and visually stable across routes.
- Customer-facing copy must not leak beta/operator implementation language.
- No browser surface may create recommendation, evidence, grading, supported-value, outcome, entitlement, tenant, or transaction authority that belongs to the authoritative service.
- No synthetic data may be substituted when authoritative data is unavailable.
- Customer-route changes must trigger the Full Customer App Assurance workflow.
- The same assurance must run again on `main` after merge.

## Current automated gates

- `scripts/validate-full-customer-app.mjs`
- `scripts/audit-full-customer-route-ci.mjs`
- `scripts/audit-customer-auth-recovery-ci.mjs`
- `scripts/audit-customer-shell-parity-ci.mjs`
- `.github/workflows/full-customer-app-assurance.yml`

## Release rule

A customer-app change is not release-ready if any required audit fails. Fix the product or the audit fixture; do not weaken an authority, identity, evidence, security, or customer-journey rule merely to make CI green.