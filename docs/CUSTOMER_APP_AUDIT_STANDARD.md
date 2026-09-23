# FlipForge Customer App Audit Standard

Status: required pre-merge customer-app assurance

## Principle

A customer-facing capability is not considered ready merely because it renders. Every customer route and every critical state must provide a usable next action, preserve Card Decision Intelligence authority boundaries, and fail closed without becoming a dead end.

FlipForge deliberately separates two customer-facing product surfaces:

- **Full Customer Portal** — the complete FlipForge product environment.
- **Private Beta** — a smaller preview of FlipForge intelligence for controlled testing and comprehension. Beta is not a miniature copy of the full Customer Portal.

A Full Customer Portal feature must not appear in Beta merely because it exists in the portal.

## Required state coverage

Every protected route is audited in the following states where applicable:

1. Anonymous / authentication required (401)
2. Authenticated customer shell with authorized server responses
3. Stale cached browser identity while the authoritative server returns 401
4. Authorized tenant data
5. Empty data
6. Invalid or unavailable upstream data
7. Mobile viewport
8. Desktop viewport

## Governed route coverage

The complete Customer Portal route matrix remains auditable even when a route is contextual rather than permanently visible in the sidebar:

- Home / Dashboard
- Discover
- Evaluate
- Decision Intelligence
- Why This Decision
- Evidence Review
- Saved Decisions
- Outcome / lifecycle tracking
- Portfolio
- Alerts
- Forge Heat
- Market View
- Account
- Compare
- PSA Advisor
- Exit Review
- Audit Export

Hiding a deep route from primary navigation never removes it from security, authentication, authority, empty-state, mobile, or browser QA coverage.

## Required primary Customer Portal architecture

The full Customer Portal exposes exactly five primary destinations:

1. **Home**
2. **Discover**
3. **Decisions**
4. **Monitor**
5. **Portfolio**

This is the customer mental model. Deep tools are contextual, not additional permanent sidebar destinations.

### Discover family

Discover may expose contextual access to:

- Scanner
- Manual Evaluate
- Forge Heat
- Market View

### Decisions family

Decisions owns the saved-decision list and decision analysis. Compare may be contextual here.

A specific saved decision is one central object with a persistent **Decision Workspace**:

- Decision
- Evidence
- Grade
- Monitor
- Exit
- Receipt

Every workspace view must preserve the exact same tenant-owned saved decision identifier. Navigation must not create a second recommendation, evidence projection, supported-value calculation, grading authority, lifecycle record, or transaction authority.

Decision Intelligence and Evidence Review remain governed routes even though they are no longer permanent primary sidebar items.

### Monitor family

Monitor owns lifecycle review state, outcome checkpoints, immutable Decision Timeline, reminder rules, and contextual Alerts access.

### Portfolio

Portfolio remains downstream of explicit ownership facts and governed decision context. It must not become an ungoverned generic valuation surface.

## Private Beta boundary

Private Beta stays intentionally smaller than the full Customer Portal.

The current Beta core remains focused on the limited preview loop needed to demonstrate intelligence and gather useful feedback. Full portal navigation, the full market scanner, full Decision Workspace, Portfolio workflow, and other advanced customer capabilities must not leak into Beta without a separate explicit Beta product decision.

Beta and Customer Portal separation is independently auditable on desktop and mobile.

## Required customer-journey assertions

- No protected route may strand an anonymous customer without a visible sign-in path.
- A server 401 must override stale or cached browser identity.
- Sign-in must return to the exact full-customer route the customer was using.
- A route may fail closed, but it may not render a blank workspace.
- The authentication recovery control must remain inside the viewport on desktop and mobile.
- The full Customer Portal must render exactly five primary destinations in canonical order.
- Contextual tools must remain reachable from their owning primary destination.
- A saved decision must expose the six-view Decision Workspace while preserving one exact record ID.
- Deep governed routes must remain directly testable even when absent from the primary sidebar.
- Mobile code must not resurrect hidden legacy primary routes or Advanced navigation.
- Full Customer Portal architecture must not load into the limited Beta preview.
- Full Customer Portal scanner assets must not load into the limited Beta preview.
- Customer-facing copy must not leak operator/internal implementation language.
- No browser surface may create recommendation, evidence, grading, supported-value, outcome, entitlement, tenant, or transaction authority that belongs to the authoritative service.
- No synthetic data may be substituted when authoritative data is unavailable.
- Customer-route changes must trigger Full Customer App Assurance.
- The same assurance must run again on `main` after merge.

## Current automated gates

- `scripts/validate-full-customer-app.mjs`
- `scripts/validate-customer-navigation-parity.mjs`
- `scripts/audit-full-customer-route-ci.mjs`
- `scripts/audit-customer-auth-recovery-ci.mjs`
- `scripts/audit-customer-shell-parity-ci.mjs`
- `scripts/audit-customer-navigation-parity-ci.mjs`
- `scripts/validate-customer-portal-architecture-v1.mjs`
- `.github/workflows/full-customer-app-assurance.yml`

## Release rule

A customer-app change is not release-ready if a required audit fails. Fix the product or update an obsolete presentation assertion to the current approved product contract while preserving or strengthening route, authority, security, identity, evidence, Beta-isolation, and customer-journey coverage. Never weaken those boundaries merely to make CI green.
