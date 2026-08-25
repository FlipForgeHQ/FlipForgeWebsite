# Card Intelligence result-priority fix

Private-beta live QA exposed two customer-path blockers on a freshly saved decision:

1. Card Intelligence could spend time loading health, dashboard, and the whole saved-opportunity list before requesting the selected decision.
2. Save confirmation and a second coaching summary were stacked above the actual Card Intelligence hero, pushing the decision below the fold.

This change keeps the existing tenant and authority boundaries while changing presentation and read order only:

- saved detail routes request only the selected opportunity, its evidence, and its saved PSA context;
- backend tenant isolation and 404/403 behavior remain authoritative;
- list routes still use health/dashboard/opportunity-list reads;
- the authoritative decision hero is shown before save confirmation;
- duplicate large decision coaching is suppressed on the saved-card detail page;
- Card Intelligence page-heading actions are reduced to Saved decisions, Track, and Refresh; advanced tools remain available in navigation;
- no recommendation, evidence acceptance, pricing, PSA, billing, or transaction authority is added.

The Netlify build now includes `validate:card-intelligence-result-priority` so this ordering cannot silently regress.
