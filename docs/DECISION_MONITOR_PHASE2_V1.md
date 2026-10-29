# Decision Change Monitor™ + Collection Intelligence™ — Phase 2 slice (DEV)

Status: draft PR, DEV only. Same activation as Deal Check: on for preview hosts and localhost, off on goflipforge.com
unless `?dealcheck=1`. Kill switch: `window.FlipForgeDecisionMonitorDisabled = true`.

Files: `saas-prototype/decision-monitor-v1.js`, `saas-prototype/decision-monitor-v1.css`, loaded after Deal Check by
`index.html` and `customer.html`. Governed fields are read through `FlipForgeDealCheck.dealModel`, so both features read
the frozen snapshot the same way. One additive field, `latestSaleDate`, was added to that model.

## Where it shows

| Surface | Placement | Data (read-only GETs) |
| --- | --- | --- |
| Tracked card `#/tracking/{id}` | Above the Decision Timeline | `/opportunities/{id}`, `/lifecycle/{id}` |
| Saved decision `#/opportunities/{id}` | Under Deal Check, linking to Tracking | same |
| Portfolio `#/portfolio` | After the summary tiles | `/portfolio`, `/opportunities` |

## Monitored now (functional, governed data only)

- **Decision changed** at a re-evaluation, from the timeline's `DECISION_CHANGED`.
- **Asking price changed** at a re-evaluation (`ASK_CHANGED`), placed against the saved Max Buy. It is a review item when the price crosses Max Buy.
- **Exact sales saved now vs. at the decision.** More sales is a review item. Fewer sales, which is expected under provider containment, is shown for information and the decision is unchanged.
- **Evidence changes at re-evaluation:** accepted-evidence counts and evidence quality.
- **Time since the decision:** the 14-day reasoning check, and a re-check at 30 days. These match the existing T14/T30 checkpoints. It also flags a newest saved sale more than 30 days old, or a stale freshness status from the server.
- **Identity:** card match not confirmed, exact-identity eligibility lost, or sales excluded for identity reasons.
- **Uncertainty:** risk rose or confidence fell at a re-evaluation.
- **Renewed verification:** VERIFY decisions, and decisions saved before the current evidence rules (legacy).
- **What you paid vs. the Max Buy at the decision** (customer-entered cost).
- **Portfolio:**
  - cost basis
  - cost basis without an evidence-supported value
  - cost basis on decisions 30 or more days old
  - cards paid above Max Buy
  - cards with no linked decision
  - cards to review next, in server order
  - links to each card's Decision Receipt and Monitor

## Not monitored (awaiting licensed data; said on screen)

Live asking prices, new completed sales and market movement. FlipForge does not re-check a listing after a decision
is saved, so without a re-evaluation the monitor says "Asking price not re-checked". It does not infer a change.

## Boundaries

- Never computes or changes a verdict, Max Buy, value or profit. Never rescores or edits a snapshot or receipt.
- No browser sorting. No provider call, evaluation, write or browser storage.
- Review prompts only, with no buy or sell instruction. No current market value is shown in Portfolio.

## Tests

- `node scripts/validate-decision-monitor-v1.mjs`: unit and static checks, including order preservation, no mutation, copy safety, the 14px floor and shell wiring.
- `node scripts/audit-decision-monitor-ci.mjs`: Playwright with a fixed clock at 1440 and 390 px, covering tracking (re-evaluated and single snapshot), the saved decision page, Portfolio, the kill switch and card switching.
- Both run in `.github/workflows/deal-check-v1.yml`.

## Backend follow-ups (FlipForge2)

1. Server-side "decision needs review" alerts for an ask crossing Max Buy, stale decisions and evidence-count drift. Today `/alerts` fires only when the decision itself changed.
2. Portfolio items could carry the governed decision summary, so the page doesn't need the `/opportunities` list.
3. Re-checking a saved listing's price, once an authorized listing source and budget are approved.
