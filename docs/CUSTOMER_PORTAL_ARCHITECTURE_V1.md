# FlipForge Customer Portal Architecture v1

## Product lock

FlipForge has two intentionally different customer-facing surfaces.

### Full Customer Portal

The full product is the complete FlipForge operating environment.

Primary architecture:

**Home → Discover → Decisions → Monitor → Portfolio**

The portal contains the complete customer workflow, including advanced intelligence, saved decisions, evidence, grading context, monitoring, portfolio, Exit Review, receipts, Forge Heat, Market View and related governed tools.

### Private Beta

Private Beta is **not** the entire Customer Portal.

It is a deliberately smaller preview of FlipForge intelligence used to:

- demonstrate the core value proposition;
- let testers experience a controlled subset of intelligence;
- collect comprehension and workflow feedback;
- validate whether FlipForge reasoning changes or improves customer decisions.

Customer Portal expansion must not automatically expand Beta. Beta receives only deliberately approved preview capabilities.

## Architecture principle

FlipForge should feel like one decision system, not a menu of unrelated tools.

The customer mental model becomes:

1. **Home** — what needs attention and what should I do next?
2. **Discover** — find and select the exact card/listing.
3. **Decisions** — review governed saved decisions.
4. **Monitor** — see what changed and manage review/outcome state.
5. **Portfolio** — understand owned-card context tied back to decisions.

## Discover family

Discover owns market selection.

Contextual tools may include:

- Scanner;
- Manual Evaluate;
- Forge Heat;
- Market View.

These remain distinct governed capabilities but no longer need permanent top-level navigation.

## Decision Workspace

A saved decision becomes the central product object.

For a specific tenant-owned saved decision, the customer gets one persistent workspace with these views:

- **Decision** — verdict, meaning, supported value, confidence, risk, CDI Signal Stack;
- **Evidence** — accepted/excluded evidence and evidence integrity;
- **Grade** — PSA/grading intelligence already governed by the existing grading authority;
- **Monitor** — lifecycle state, review timing, outcome checkpoints and immutable Decision Timeline;
- **Exit** — existing advisory Exit Review;
- **Receipt** — Decision Dossier / audit export.

The workspace navigation carries the same exact saved opportunity ID across views. No tab creates a new decision or recomputes authority in the browser.

## Monitor family

Monitor replaces the mental split between Tracking, Alerts and Outcome Intelligence.

The canonical Monitor surface should progressively combine:

- review due state;
- lifecycle status;
- 7/14/30 checkpoints;
- immutable Decision Timeline;
- what changed since the original decision;
- alert rules;
- future governed change intelligence.

Alerts remain a contextual view rather than a primary product destination.

## Portfolio

Portfolio remains downstream of decisions and explicit ownership facts.

It should answer:

- what do I own?
- what did I pay?
- what decision led here?
- what is the current evidence status?
- what needs review?
- where evidence gates allow it, what reference context is supportable?

It must not become an ungoverned generic valuation dashboard.

## Navigation rule

The full Customer Portal primary sidebar contains only:

- Home
- Discover
- Decisions
- Monitor
- Portfolio

Deeper tools are contextual rather than permanently exposed.

## Commercial effect

This architecture compresses many technically strong routes into a smaller customer mental model while preserving the underlying capabilities.

The intended customer loop is:

**SCAN → DECIDE → PROVE → MONITOR → LEARN**

## Authority boundary

This architecture is presentation and navigation composition only unless a separate backend phase explicitly changes a server contract.

It does not move into the browser:

- identity approval;
- evidence acceptance;
- supported-value authority;
- BUY/WATCH/VERIFY/PASS authority;
- grading authority;
- lifecycle truth;
- entitlement authority;
- tenant authority;
- transaction authority.

## Phase sequence

### Phase A — Portal information architecture
- five primary destinations;
- contextual subnavigation;
- preserve all existing governed routes;
- keep Beta unchanged.

### Phase B — Decision Workspace
- make one saved decision the central object;
- Decision / Evidence / Grade / Monitor / Exit / Receipt;
- retain exact saved opportunity ID across all views.

### Phase C — Market Scanner
- ship exact-listing scanner UI;
- later add real taxonomy-backed server scan contract.

### Phase D — Decision Monitoring
- expose server-owned change signals;
- show “what changed since this decision” without rewriting history;
- integrate review timing and outcome checkpoints.

### Phase E — Outcome proof
- productize T0 → Day 7 / 14 / 30 comparison;
- calibration and reasoning-support reporting;
- no inflated accuracy claims.

## Beta boundary release rule

A full Customer Portal feature must fail validation if it leaks into the Beta preview without an explicit Beta product decision.
