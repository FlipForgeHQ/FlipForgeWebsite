# Homepage Blueprint Alignment — 2026-08-25

## Purpose

Align the public FlipForge homepage with the current product architecture and the outcome-calibration direction in the roadmap without introducing a second decision engine, overstating validation, or duplicating SaaS behavior that already exists.

## Source-of-truth order used for this change

1. Current shipped GitHub `main` for the website/SaaS implementation.
2. Current FlipForge Core architecture and authority boundaries.
3. Roadmap blueprint direction for outcome accountability and calibration.
4. Marketing/design preferences only where they do not conflict with the above.

The older roadmap language about active-listing-only market data is not copied blindly into the homepage because the current product has newer governed completed-sale evidence paths. Current runtime authority wins over historical roadmap provider status.

## Existing product capabilities preserved

This change does not recreate product logic in marketing JavaScript. The current SaaS already provides:

- fail-closed identity assistance with explicit customer selection;
- server-side re-verification of the selected identity;
- Smart Opportunity as the sole BUY / WATCH / VERIFY / PASS authority;
- Card Intelligence as the customer-facing authoritative result surface;
- Decision Traceback and evidence visibility;
- saved-decision tracking;
- no browser-side evidence acceptance, PSA recalculation, or recommendation override;
- no transaction authority.

## Homepage changes

### 1. Keep the hero disciplined

The runtime-injected feature-pill row was removed. The hero now stays focused on:

- the category;
- the locked `Before you buy. Know Why.` promise;
- the risk/problem statement;
- the product-value statement;
- Request Beta Access as the primary action;
- the product demo as the secondary action.

### 2. Explain real identity behavior without duplicating it

The `Resolve the card` workflow step now states that ambiguous identity stops for an explicit choice instead of auto-selecting the first result. This describes the existing server-authorized identity-assist behavior; it does not implement a marketing-side resolver.

### 3. Separate decision production from decision accountability

A new `Decision accountability` section follows the core decision workflow. It presents the proof loop as:

- Day 0 — preserve the original decision and context;
- Day 7 — check the first signals;
- Day 14 — stress the prediction;
- Day 30 — grade the call.

The section deliberately distinguishes outcome calibration from product evidence and from the governed source-review audit.

### 4. Keep claims below the proof level

The new section explicitly states that no public accuracy percentage is claimed from the workflow unless a governed review authorizes it. It also preserves the decision-support / no-outcome-guarantee boundary.

## Architecture boundaries

No changes are made to:

- Java FlipForge Core;
- Smart Opportunity recommendation authority;
- PSA Intelligence authority;
- CardSight evidence authority;
- evidence qualification rules;
- completed-sale acceptance rules;
- tenant isolation;
- SQLite persistence;
- billing;
- authentication;
- transaction authority;
- provider configuration or credentials.

The website remains presentation and interaction only.

## Responsive and accessibility behavior

The new outcome timeline uses four columns on desktop, two on tablet, and one on mobile. It relies on semantic section/article structure, an accessible heading relationship, and a text-first timeline rather than motion. Existing reduced-motion behavior remains unchanged.

## Regression protection

`validate-homepage-focus.mjs` now checks that:

- the hero feature pills are not reintroduced at runtime;
- the four-stage decision workflow remains intact;
- ambiguous identity is described as explicit choice rather than auto-selection;
- the accountability section exists;
- Day 0 / 7 / 14 / 30 checkpoints remain present;
- original decision context is preserved;
- public accuracy claims remain governed;
- decision-support/no-profit-guarantee language remains present;
- accountability layout remains responsive.

## Rollback

This change is presentation-only and can be reverted by restoring:

- `assets/js/marketing-v3.js`;
- `assets/css/homepage-focus-v1.css`;
- `scripts/validate-homepage-focus.mjs`.

No persisted customer data, backend schema, provider state, or decision output is changed by the homepage release.
