# Deal Check™ · Scenario Lab™ · Decision Receipt Pro™ — Phase 1 slice (DEV)

Status: draft PR, DEV only. Not merged, not released. Off on goflipforge.com unless `?dealcheck=1` is in the URL;
`window.FlipForgeDealCheckDisabled = true` turns it off everywhere.

## Where it lives

The saved-decision page every Discover → exact-card verification → Evaluate run already lands on
(`#/opportunities/{id}`). Deal Check is one new section under the existing decision hero and saved-decision bar. No new
route, no new navigation, no change to Discover, Evaluate or the existing sections.

Files: `saas-prototype/deal-check-v1.js`, `saas-prototype/deal-check-v1.css`, loaded last by `index.html` (Private Beta
shell) and `customer.html`.

## Data used (all existing, read-only)

| Source | Fields |
| --- | --- |
| `GET /api/v1/opportunities/{id}` → `opportunity.governedDecision` (G1, immutable snapshot) | `recommendation`, `maximumBuyPriceCents`, `allInAskCents`, `supportedValueCents/Status`, `expected/conservative/stressNetProfitCents`, `…RoiBasisPoints`, `reason`, `nextAction`, `missingRequirement`, `whatWouldChange[]`, `profitabilityGateStatus`, `exactTrustedCompCount`, `confidence`, `risk`, `evaluatedAt`, `receiptVersion`, `snapshotCount` |
| same response → `priceIntelligence.thresholds` | `buyAtOrBelowCents` (shown only when stricter than Max Buy) |
| same response → `opportunity.evidence`, `mappingState`, legacy markers | counts and exclusion reasons only — never individual sales |
| `GET /api/v1/lifecycle/{id}` (optional; 404 tolerated) | decision timeline entries for decision history |

No provider call, evaluation, quota use, write or browser storage. Simulations are never saved or sent.

## Functional vs. illustrative vs. blocked

**Functional (real engine values):** verdict, Max Buy, asking vs. Max Buy, profit/ROI for base, cautious and downside
cases, break-even buy price (saved ask + saved base profit), decision checks, what would change the decision, Max Buy
reasoning, accepted vs. not-counted counts, risks, decision history, print/save receipt.

**Max Buy reasoning** reproduces the engine's four limits (10% base ROI, 5% cautious ROI, no downside loss, $20 minimum
profit — `ProfitabilityGuardrailService` v1.1) from saved net proceeds and names the one that sets Max Buy. It is shown
only when the reproduction matches the saved Max Buy to the cent; otherwise the receipt says it can't show which limit
applied. A CI sweep checks the reproduction against a transcription of the engine across 252 synthetic inputs.

**Simulation (labelled):** Scenario Lab. Purchase price + inbound shipping + tax; FlipForge reserves (uses saved net
proceeds, so only cost changes) or your own fee %, shipping and other costs (base case only, applied to the saved
supported value); optional profit/ROI target. It never produces BUY/WATCH/VERIFY/PASS and never changes the saved
decision.

**Blocked, by design:** Scenario Lab and Max Buy are unavailable when there is no established supported value (VERIFY,
no exact sales) or the result is legacy. FlipForge never substitutes an asking price for value.

## Subscription architecture

`FEATURE_TIERS` in the module maps `dealCheck` → Scout, `scenarioLab` → Collector, `receiptHistory` → Pro. Nothing is
enforced yet: a feature is withheld only if the server's plan explicitly returns `false` for it, and no plan does today.
Billing and entitlements are unchanged. The governed decision is identical for every tier.

## Tests

- `node scripts/validate-deal-check-v1.mjs`: unit/static contract (mirror-only, engine reproduction sweep, VERIFY/legacy
  blocking, simulation isolation, copy safety, 14px floor, activation, feature gating, shell wiring).
- `node scripts/audit-deal-check-ci.mjs`: Playwright on the real app shell, desktop 1440 and phone 390, BUY / WATCH /
  VERIFY / PASS / legacy fixtures, Scenario Lab interaction, kill switch, card switching. Screenshots in
  `artifacts/deal-check`.
- Workflow `.github/workflows/deal-check-v1.yml` (narrow paths).

## Backend follow-ups (FlipForge2, not in this PR)

1. Put the profitability policy version and applied reserves (`sellingFeeReserveBasisPoints`, haircuts, slippage) on
   `governedDecision`, so the receipt doesn't need client-side policy constants.
2. A read route for the full frozen `decisionReceipt` (today it is only returned by `POST /evaluations`).
3. Server-side plan flags (`scenarioLab`, `receiptHistory`) once tiers are activated.
4. Optionally use Sell Watch's saved per-channel selling costs as Scenario Lab defaults.
