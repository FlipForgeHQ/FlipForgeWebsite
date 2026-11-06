# FlipForge — Customer Journey & Decision Discoverability (2026-11-06)

Status: **draft implementation, founder acceptance required**. No merge or production deployment is authorized by this package.

## User problem reproduced

A first-time Private Beta tester could not locate a Decision Receipt for an August 24, 2026 Patrick Mahomes VERIFY decision, despite repeatedly expanding technical sections and following instructions. The decision was saved under earlier rules. The Saved Decisions renderer previously hard-coded `receiptMode: "reference"`, while a passport said a full Decision Receipt was “below,” even if no attached receipt existed.

This was a **discoverability failure and misleading availability statement**, not evidence that the server had lost a receipt. Never invent one.

## Changes

1. **Immediate next-step choices** on Saved Decision details, below the verdict/value/risk summary: Open Decision Receipt (only if a governed saved server record exists), Review Evidence, Track This Card, and View All Saved Details.
2. **Receipt status is explicit** for earlier-rules or unavailable server records. No dead button and no new evaluation needed. Available saved records render only the governed server fields already returned (verdict, recorded ask/value/comp count, identity status, policy version). No re-scoring or re-creation of missing history.
3. **Visible Saved Decision links** in each saved-card table row; clickable row behavior is preserved but not the sole navigation cue. Keyboard actions on a nested link no longer re-trigger the row.
4. **Evidence passport language corrected**: no unconditional promise of an attached full Decision Receipt. The seven-layer explainer and advanced details have clear Expand/Collapse affordances and large click targets.
5. **Private Beta onboarding shown by default**: five actionable stages Find → Evaluate → Understand → Track → Manage, with real workspace links. Returning testers can go straight to Saved Decisions.
6. **Customer App sidebar simplified**: core workflow is aligned with Private Beta (“Tracking” on both); optional decision/evidence tools move under a clearly named “More decision tools” disclosure rather than appearing as competing primary paths.
7. **Shared UX stylesheet** handles keyboard focus, hover states, disclosure affordances, 44px+ interactive areas, mobile stacking, and reduced-motion behavior. It is loaded by both authorized customer shells only.
8. **Regression coverage**: 27 targeted code-level assertions wired into the existing sitewide UX validation. Two existing priority tests updated to verify the new action-first design. No API, provider, decision-engine or tenancy rules changed.

## Important receipt distinction

- **Governed saved record returned**: “Open Decision Receipt” reveals the recorded, server-returned fields. Missing fields show “Not recorded”; it does not claim every detail of an unavailable historical receipt exists.
- **Earlier-rules or unavailable record**: “Decision Receipt unavailable” is visible before any expansion. Users may still review the saved verdict, evidence context and advanced trail without a synthetic receipt.
- The historical decision, evidence restrictions, and original data remain unchanged. This change **does not** retrieve or retain CardSight sale-level data.

## Acceptance plan — must be performed before merge or deployment

### Automated
- Node syntax checks on changed JavaScript.
- `npm run validate:customer-journey`.
- `npm run validate:sitewide-ux` and existing decision card, saved decision, tracking, authentication, tenant-isolation, and browser journey suites.
- Run the existing visual regression suite (desktop, tablet, mobile) against the draft preview once available; check horizontal scroll, readable text, focus order and tab navigation.
- No policy changes, no saved record mutations, no fabricated evidence, no increased evaluations.

### First-time-user walkthrough
Recruit five people not previously coached on FlipForge. Give only the beta access link and the tasks below. Observe without explaining where to click.

1. **Start**: identify the Find/Evaluate action and begin a card workflow.
2. **Understand**: open a saved card, say what the verdict means and find its reason/risk/value.
3. **Receipt**: independently locate the Decision Receipt action; on a legacy record, correctly recognize that an original receipt is unavailable and understand why.
4. **Evidence + Tracking**: open both from the same saved decision without another evaluation.
5. **Manage**: locate Portfolio, Alerts and Forge Heat without confusing them with the decision engine.
6. **Navigation**: repeat at phone width and using only Tab/Enter/Space where appropriate.

Record completion and hesitation points, button discoverability, misunderstandings and accessibility blockers. Any inability to find an important action without coaching requires UX revision before acceptance.

### Required screenshots
- Private Beta welcome with the five-step guide visible, desktop and phone.
- Saved Decisions list showing explicit “Open saved decision” links.
- Newer saved decision: primary action tiles and opened server-record receipt.
- Earlier-rules saved decision: conspicuous receipt-unavailable status.
- Expanded advanced evidence with changed Expand/Collapse label, desktop and phone.
- Full Customer App sidebar demonstrating aligned core navigation.

## Release boundary

This branch is only an implementation candidate. Founder review and successful CI, real-browser and uncoached usability acceptance are required before merge or deployment. Do not enable CardSight, change historical records, alter decision thresholds, or expand production scope.
