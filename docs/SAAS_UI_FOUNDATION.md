# FlipForge SaaS UI Foundation

Status: non-production prototype

Issue: #10

## Product boundary

The SaaS UI is a browser-based customer experience layered over the existing FlipForge authority. It does not calculate recommendations, grade cards, accept evidence, call provider APIs directly, or authorize purchases.

- Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- Provider credentials remain server-side and are never embedded in browser code.
- Active listings never become completed-sale evidence.
- Public marketing graphics remain separate from operational SaaS components.

## Prototype technology decision

The first milestone uses a dependency-free HTML, CSS, and JavaScript prototype inside `saas-prototype/`.

Why:

- It cannot alter the existing public homepage because it lives in an isolated directory.
- It can be reviewed without installing a framework or changing the current Netlify build.
- It establishes routes, tokens, components, responsive behavior, and API contracts before committing to a production framework.
- It keeps the prototype disposable while the Java Beta and backend boundary remain authoritative.

A production framework decision will be made after the prototype and API boundary are accepted. Likely candidates are React/Next.js or an equivalent typed component framework, but this milestone does not lock that choice.

## Prototype routes

- `#/dashboard`
- `#/discover`
- `#/evaluate`
- `#/opportunities`
- `#/compare`
- `#/psa-advisor`
- `#/evidence`
- `#/portfolio`
- `#/sell`
- `#/alerts`
- `#/account`

## First milestone screens

1. Responsive SaaS dashboard shell
2. Opportunity detail
3. Direct comparison
4. PSA Advisor
5. Evidence readiness
6. Ask-versus-supported-value visualization

## API boundary

The prototype consumes local mock responses shaped like future read-only API responses. The browser may request evaluated records but may not submit recommendation, evidence-acceptance, grading-authority, provider-credential, bid, checkout, or purchase commands.

Required future server endpoints:

- `GET /api/v1/dashboard`
- `GET /api/v1/opportunities`
- `GET /api/v1/opportunities/{id}`
- `GET /api/v1/compare?ids=`
- `GET /api/v1/psa-advisor/{cardId}`
- `GET /api/v1/evidence/{cardId}`
- `GET /api/v1/portfolio`
- `GET /api/v1/entitlements`

Every evaluated response must include authority provenance, evidence freshness, confidence, risk, and limitations.

## Authentication and entitlement boundary

The prototype displays account and plan surfaces but does not implement real authentication, billing, or entitlement enforcement. Production access decisions must be enforced by the server, not hidden client controls.

## Accessibility requirements

- Keyboard-accessible navigation and controls
- Visible focus states
- Semantic landmarks and headings
- Text enlargement to at least 200% without loss of content
- Color is never the only signal
- Responsive layouts for desktop, tablet, and mobile
- Reduced-motion support

## Security exclusions

Browser code must contain no:

- CardSight or marketplace API key
- provider UUID administration
- raw provider payloads
- evidence ACCEPT/REJECT/HOLD controls
- recommendation recalculation
- auto-buy, bidding, checkout, or purchase authorization
- secrets in local storage

## Release rule

This prototype is not production, is not wired to customer accounts, and must not replace the public homepage or deploy without a separate explicit approval.