# FlipForge SaaS UI Foundation

Status: complete non-production prototype pending owner visual acceptance

Issues: #10 and #13

## Product boundary

The SaaS UI is a browser-based customer experience layered over the existing FlipForge authority. It does not calculate recommendations, grade cards, accept evidence, call provider APIs directly, scrape marketplaces, or authorize transactions.

- Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- Provider credentials remain server-side and are never embedded in browser code.
- Active listings and fixed-price asks never become completed-sale evidence.
- Public marketing graphics remain separate from operational SaaS components.
- Prototype changes remain in memory only and reset on refresh.

## Technology and repository decision

The accepted foundation uses a dependency-free HTML, CSS, and JavaScript prototype inside `saas-prototype/` in the existing `FlipForgeWebsite` repository.

Why:

- It keeps the customer application isolated from the public marketing homepage.
- It can be reviewed without installing a framework or changing authority logic.
- It establishes routes, tokens, components, responsive behavior, interactions, and API contracts before committing to a production framework.
- It remains disposable while the Java Beta and backend boundary remain authoritative.
- Netlify can expose it at `/app/` for deploy-preview review without merging production.

A production framework decision will be made only after the prototype and API boundary are accepted. Likely candidates are React/Next.js or an equivalent typed component framework, but this prototype does not lock that choice.

## Website integration

Netlify deploy previews expose the isolated application at:

- `/app`
- `/app/`
- `/app/#/dashboard`
- `/app/*` assets through controlled rewrites

The website build also:

- adds **App Preview** to desktop, mobile, and footer navigation;
- standardizes the public identity line to **Card Intelligence**;
- leaves the marketing homepage as the public entry point.

Production remains unchanged until PR #12 receives explicit merge approval.

## Complete prototype routes

- `#/dashboard`
- `#/discover`
- `#/evaluate`
- `#/opportunities`
- `#/opportunities/{id}`
- `#/compare`
- `#/psa-advisor`
- `#/evidence`
- `#/portfolio`
- `#/sell`
- `#/alerts`
- `#/account`

## Completed interactive intelligence

1. Ask-versus-supported-value history
2. Confidence, liquidity, risk, and rank-factor breakdown
3. Evidence readiness, freshness, accepted sales, and provenance
4. PSA grading economics and grade-value scenarios
5. PSA population distribution
6. Direct saved-card comparison
7. Opportunity rankings and saved-record review
8. Market demand and liquidity timeline
9. Discovery filters, saved-search examples, and watchlist preview behavior
10. Portfolio allocation, supported-value history, holdings, and evidence quality
11. Exit-readiness and net-proceeds assumption modeling
12. Alert-condition preview state
13. Account, plan, usage, entitlement, and security boundaries

## Read-only API boundary

The prototype consumes local mock responses shaped like future read-only API responses. The production browser may request evaluated records but may not submit recommendation, evidence-acceptance, grading-authority, provider-credential, bid, checkout, payment, listing, or purchase commands.

Required future server endpoints:

- `GET /api/v1/dashboard`
- `GET /api/v1/discover`
- `GET /api/v1/market-trends`
- `POST /api/v1/evaluations` — submits normalized identity and ask; authoritative backend returns the decision
- `GET /api/v1/opportunities`
- `GET /api/v1/opportunities/{id}`
- `GET /api/v1/compare?ids=`
- `GET /api/v1/psa-advisor/{cardId}`
- `GET /api/v1/evidence/{cardId}`
- `GET /api/v1/portfolio`
- `GET /api/v1/sell-readiness/{cardId}`
- `GET /api/v1/alerts`
- `GET /api/v1/account`
- `GET /api/v1/entitlements`

Every evaluated response must include authority provenance, evidence freshness, confidence, liquidity, risk, limitations, and the governing engine version.

## Authentication, billing, and entitlement boundary

The prototype displays account, plan, usage, alert, and entitlement surfaces but does not implement real authentication, billing, email, push notifications, exports, or entitlement enforcement. Production access decisions must be enforced by the server, not hidden client controls.

The browser must never collect or store provider credentials. Customer authentication and payment handling require a separate security and compliance review.

## Accessibility and responsive requirements

- Keyboard-accessible navigation and controls
- Visible focus states
- Semantic landmarks, labels, headings, and live regions
- Text enlargement to at least 200% without loss of content
- Color is never the only signal
- Responsive layouts for desktop, tablet, compact tablet, and mobile
- Reduced-motion support
- Sticky desktop navigation and top bar without horizontal overflow
- Independently scrollable long navigation
- Horizontally scrollable data tables on narrow screens

## Security exclusions

Browser code contains no:

- CardSight or marketplace API key
- provider UUID administration
- raw provider administration payloads
- evidence ACCEPT/REJECT/HOLD controls
- recommendation recalculation
- grade prediction
- scraping
- fabricated sold comps
- auto-buy, bidding, checkout, or purchase authorization
- marketplace listing or payment collection
- password or payment field
- secrets in local storage, session storage, or IndexedDB
- direct `fetch`, XMLHttpRequest, or WebSocket provider call

## Validation gates

PR #12 runs:

- browser JavaScript syntax parsing;
- the website asset and navigation build;
- 120 deterministic architecture, route, responsive, branding, authority, and security checks;
- generated website entry-point verification;
- Netlify deploy preview from the exact PR head.

## Release rule

The prototype is not production and is not wired to customer accounts. It must not replace the public homepage or deploy without a separate explicit approval. It must not merge to production or migrate customers without separate explicit owner approval after visual acceptance.
