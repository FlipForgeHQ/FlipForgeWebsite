# FlipForge Pre-Beta Destructive Cross-Surface Audit

## Purpose

This audit extends the attack-first beta gate beyond Discover and the saved-decision lifecycle. It exercises the remaining customer surfaces against stale-route ownership, cross-record bleed, stale cached summaries, authority overreach, fabricated data, and accidental transaction or operator controls.

The audit runs against the production customer app route stack at `/app/` with deterministic tenant-scoped API fixtures. It is not a replacement for signed-in production QA.

## Surfaces

- Alerts
- Portfolio
- Forge Heat
- Market View
- Direct Comparison
- PSA Advisor
- Evidence Center
- Exit Review

## Locked destructive matrix

1. **Alerts delivery boundary — S1**
   - Alerts must load from `/api/v1/alerts`.
   - External email/push delivery must remain explicitly unconfigured unless the server says otherwise.
   - No alert UI may imply transaction or recommendation authority.

2. **Portfolio empty/reference honesty — S1**
   - Portfolio may show only tenant-owned holdings returned by the server.
   - Empty holdings must remain empty; no sample holding, browser valuation, or fake performance may be substituted.

3. **Portfolio → Alerts route ownership — S1**
   - Alerts must fully own the workspace after navigation.
   - A stale Portfolio renderer may not repaint after the route changes.

4. **Forge Heat locked-state honesty — S1**
   - Locked Forge Heat may not fabricate opportunity cards.
   - Pro access and Smart Opportunity authority boundaries remain explicit.

5. **Forge Heat → Market View route ownership — S1**
   - Market View must replace the Heat renderer cleanly.
   - Old Heat work cannot retake `#main-content`.

6. **Market View scope boundary — S1**
   - Market View is limited to the saved evaluated universe.
   - It must not claim market-wide scanning, momentum, or a market index when those capabilities are unavailable.

7. **Market View revisit freshness — S2**
   - Leaving and revisiting Market View must read the current server summary.
   - Prior browser state may not be treated as authoritative cached market context.

8. **Compare independence/no winner — S1**
   - Two saved records remain independent.
   - Compare cannot rerank, rescore, choose a winner, or create a recommendation.

9. **Compare swap identity integrity — S1**
   - Swapping sides may reorder the two selected records only.
   - It cannot duplicate one record or introduce a third identity.

10. **PSA Advisor saved-snapshot boundary — S1**
    - PSA Advisor reads saved PSA guidance only.
    - `recalculated` must remain false for the customer route.
    - The screen cannot predict a grade or persist a new grading analysis.

11. **Evidence Center read-only authority — S1**
    - Evidence Center is exact-record scoped.
    - Customer UI cannot accept, reject, hold, relink, or promote evidence.

12. **Evidence record-switch integrity — S1**
    - Switching the selected saved card must fetch the new evidence ID.
    - The old card identity may not survive as the active Evidence route.

13. **Exit Review boundary — S1**
    - Exit Review uses existing saved detail/evidence context.
    - It cannot create a sell recommendation, listing, offer acceptance, checkout, or transaction action.

14. **Malformed authority fail-closed — S1**
    - A Market View response with the wrong authority must render an error.
    - Invalid authority data must never be shown as customer intelligence.

15. **Rapid cross-surface route churn — S1**
    - Forge Heat → Market View → Compare → Portfolio must settle on Portfolio.
    - No prior renderer may repaint after the final route owns the workspace.

16. **Browser authority/header boundary — S1**
    - Browser requests must not supply tenant/user identity headers, service authorization, recommendation authority, or transaction authority.
    - These audited customer surfaces are read-only and may not issue browser write methods.

## Release policy

- **S1:** blocks merge and beta release.
- **S2:** blocks beta expansion until fixed or explicitly waived with written rationale.
- **S3:** may be scheduled only when the defect is genuinely cosmetic and does not affect authority, state integrity, navigation, accessibility, or customer understanding.

A real customer-state defect discovered later must be added to this matrix before the defect is considered closed.

## Authority locks

The browser remains presentation only. Smart Opportunity remains the sole recommendation authority. Existing PSA intelligence remains the grading-guidance authority. Evidence acceptance remains server/operator governed. Active asks are not sold evidence. These routes have no transaction authority, auto-buy, listing, bidding, checkout, or payment authority.

## Artifact

CI writes `qa-artifacts/prebeta-cross-surface/cross-surface-audit.json` and retains the workflow artifact for 30 days.
