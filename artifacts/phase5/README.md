# Phase 5 Customer Intelligence: review screenshots (synthetic data only)

Produced by `scripts/audit-phase5-customer-journey-ci.mjs` (mocked API shaped like FlipForge2
`docs/saas/PHASE5_CUSTOMER_INTELLIGENCE_CONTRACT.md`) at desktop 1440, tablet 834 and mobile 390.
No real card, account, sale or price data. CI uploads a fresh set as the `phase5-customer-journey-screenshots` artifact.

- `receipt-*` / `tracking-*`: Decision Receipt and Tracking for a one-sale (value withheld) WATCH, with the journey strip.
- `timeline-*`: D7 / D14 / D30 timeline: streams A / B / C, movement wording, verification; one-sale, few-sales (2) and multi-sale.
- `saved-decisions`, `portfolio`, `alerts`, `forge-heat`, `market-view`: "Based on 1 sale: value withheld" on every surface.
- `evaluate-result-one-sale`: the Evaluate result for a one-sale decision (no value, no Max Buy, no $0).
- `isolation-404`: another account's saved decision.
