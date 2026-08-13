# Price Intelligence live wiring fix

Live Card Intelligence QA exposed that the backend opportunity-detail response returns `priceIntelligence` as a sibling of `opportunity` under `data`, while the initial website renderer incorrectly looked for `opportunity.priceIntelligence`.

Correct response contract:

- `data.opportunity`
- `data.priceIntelligence`

The website now passes those sibling objects separately into the read-only Price Intelligence normalizer. Browser-side scoring remains prohibited. The panel still renders only when the server-owned counterfactual payload declares read-only, saved-context-only, price-only execution with no canonical writes, quota consumption, outcome-ledger mutation, lifecycle mutation, or transaction authority.
