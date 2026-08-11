# Core Platform Phase 2 — Production Customer Routes

Status: **IN PROGRESS**

This phase moves existing tenant-scoped customer adapters from deploy-preview-only execution into the authenticated production `/app/` shell without creating a second scoring, evidence, grading, or persistence system.

## Promoted in this phase

The following adapters now accept the production `goflipforge.com` app host in addition to deploy previews/local development, while retaining same-origin authenticated API calls, `no-store`, redirect refusal, response bounds, contract validation, and server-owned tenant isolation:

- Discover
- Direct Comparison
- Tracking / customer lifecycle
- Portfolio (evidence-supported reference-value version)
- Alerts (in-app lifecycle review queue)
- Evidence Center
- PSA Advisor
- Exit Review / Sell
- Decision Dossier / Audit Export

Production eligibility is also constrained to the `/app/` or `/saas-prototype/` application path. Public marketing pages do not activate these customer adapters.

## Production authentication behavior

Where a customer adapter provides a sign-in recovery action, production now points to the production authentication handoff rather than the staging authentication page.

## Still remaining in Phase 2

Two dual-purpose legacy adapters require a separate safety refactor before production promotion:

1. **Evaluate** — customer evaluation currently shares code with a deploy-preview staging write surface.
2. **Opportunities / saved Card Intelligence detail** — customer saved-opportunity rendering currently shares code with the hidden Staging Data diagnostic adapter.

Those adapters must split `customerEligibleHost` from `diagnosticEligibleHost` so customer routes can run on production while staging diagnostics remain deploy-preview/local only.

## Authority boundaries retained

- Smart Opportunity remains the sole BUY / WATCH / VERIFY / PASS authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- Active listings remain separate from completed-sale evidence.
- No provider credential is exposed to the browser.
- No browser tenant header is trusted.
- No automated purchase, sale, listing, bid, checkout, payment, or transaction authority is introduced.
- Unsupported data remains unavailable rather than fabricated.
