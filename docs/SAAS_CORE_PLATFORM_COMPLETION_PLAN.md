# FlipForge SaaS Core Platform Completion Plan

Status: **LOCKED PRODUCT PRIORITY**

Locked on: 2026-08-10

## Priority decision

FlipForge will finish the main customer SaaS platform before resuming paid-billing launch work.

Paddle checkout, customer portal activation, production billing verification, and related payment-provider launch tasks are deferred until the customer product satisfies the Core Platform Definition of Done below.

Existing billing code and safety controls remain in place. This decision does not remove or weaken billing, authentication, tenant-isolation, provider, evidence, grading, or transaction-authority boundaries.

## Core Platform Definition of Done

The main SaaS platform is considered Beta Complete when a signed-in collector can reliably complete this end-to-end workflow without encountering unfinished, fake, or misleading product functionality:

1. Search for an exact card in Discover.
2. Inspect the actual marketplace listing when the authorized provider returns a source URL.
3. Review listing price, trusted sold context, confidence, risk, and evidence state without treating an active ask as completed-sale evidence.
4. Explicitly submit the candidate to Smart Opportunity for authoritative BUY / WATCH / VERIFY / PASS evaluation.
5. Open the saved opportunity and understand the reasoning through evidence, value, confidence, liquidity, risk, grading context, and Decision Traceback.
6. Save or track the card and revisit its current lifecycle state.
7. Move the card through relevant lifecycle states such as acquired, passed, or sold where supported.
8. Use Portfolio, Evidence, PSA Advisor, Compare, Alerts, Sell, and Audit Export without prototype-only placeholders or fabricated data.
9. Receive clear loading, empty, unavailable, error, and authority-boundary states throughout the application.
10. Use the core workflow on supported desktop and mobile layouts without material usability defects.

## Completion phases

### Phase 1 — Customer UI completion
- Complete visual consistency across all customer routes.
- Remove remaining prototype-looking language and presentation from production customer surfaces.
- Preserve honest `not configured` states where no authoritative data source exists.
- Standardize customer actions, status treatment, empty states, and source provenance.

### Phase 2 — End-to-end workflow QA
- Validate Discover → source listing → Smart Opportunity → saved opportunity → Tracking → Portfolio / outcome flow.
- Fix broken links, stale state, route transitions, loading states, and action-state defects.
- Test representative exact-card searches and failure conditions.

### Phase 3 — Intelligence explainability polish
- Make evidence, supported value, confidence, liquidity, risk, grading economics, and Decision Traceback easier to understand.
- Keep Smart Opportunity as the sole BUY / WATCH / VERIFY / PASS authority.
- Keep existing PSA intelligence as the sole grading-guidance authority.

### Phase 4 — Lifecycle, alerts, portfolio, and account completion
- Finish incomplete customer-facing lifecycle states.
- Improve Alerts and Portfolio surfaces without inventing market events or holdings.
- Remove remaining customer-facing placeholders that should instead be a real feature, a clear unavailable state, or intentionally deferred.

### Phase 5 — Beta-complete validation
- Desktop and responsive regression testing.
- Authentication and tenant-isolation regression checks.
- Empty, unavailable, provider-offline, and error-state checks.
- Confirm no provider credentials, internal IDs, service tokens, or transaction authority are exposed.
- Confirm no active listing is represented as completed-sale evidence.
- Confirm no unsupported Market Index or other fabricated authoritative metric is shown.

## Deferred until after Core Platform Beta Complete

The following do **not** block core-platform completion:

- Paddle subscription checkout launch.
- Paddle customer portal launch.
- First live paid-webhook entitlement proof.
- FlipForge-wide Market Index.
- SMS / email market-alert delivery.
- Advanced custom report builder.
- Additional marketplace connectors beyond currently authorized providers.
- Native mobile applications.
- Automated buying or selling.

## Authority and trust rules

- SQLite-backed authoritative SaaS state remains the source of truth where implemented.
- Smart Opportunity remains the sole BUY / WATCH / VERIFY / PASS authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- Discover active listings are not completed-sale evidence.
- Original marketplace URLs must come from authorized provider data and must never be guessed or reconstructed.
- No automated purchase, sale, or transaction authority is introduced by this completion plan.
- Unsupported customer metrics must render as unavailable / not configured rather than being fabricated.

## Current planning estimate

At the time this plan was locked, the core customer platform was estimated at approximately **80–85% complete**.

Planning target, assuming no major new product concepts are added during the completion sprint:

- Core private-beta platform: approximately 7–10 focused development days.
- Polished customer-ready SaaS excluding paid billing: approximately 2–3 weeks.

These are planning estimates, not contractual deadlines. Completion is determined by the Definition of Done and validation gates above.
