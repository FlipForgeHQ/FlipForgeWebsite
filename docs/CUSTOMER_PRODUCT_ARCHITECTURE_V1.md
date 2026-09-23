# FlipForge Customer Product Architecture v1

Status: preview architecture; not production-promoted

## Locked boundary

Private Beta and the future full customer portal are intentionally different product experiences.

### Private Beta

Purpose: prove that Card Decision Intelligence helps a tester make a better-informed card decision.

Canonical loop:

**Find → Evaluate → Understand → Save / Track → Feedback**

Beta is deliberately limited. It does not need to expose the complete customer portal.

### Full Customer Portal

Purpose: operate the complete FlipForge decision lifecycle.

Primary navigation:

**Home → Discover → Decisions → Monitor → Portfolio**

The product loop is:

**SCAN → DECIDE → PROVE → MONITOR → LEARN**

## Architectural principle

The redesign is composition, not duplication.

Existing governed backend routes remain authoritative. The customer architecture reorganizes them around the decision object rather than exposing every subsystem as a top-level product.

No presentation layer may create a second:

- recommendation authority;
- identity authority;
- evidence authority;
- supported-value authority;
- grading authority;
- outcome authority;
- transaction authority.

## Decision Workspace

A tenant-owned saved decision is the core customer object.

The workspace composes existing governed views while preserving the same opportunity ID:

| Workspace view | Native governed route |
| --- | --- |
| Decision | `#/opportunities/{id}` |
| Why | `#/evidence/{id}?focus=why` |
| Evidence | `#/evidence/{id}` |
| Grade | `#/psa-advisor/{id}` |
| Monitor | `#/tracking/{id}` |
| Exit | `#/sell/{id}` |
| Receipt | native Decision Receipt within `#/opportunities/{id}` |

The Receipt view must open the existing server-owned receipt object. It must never rebuild a receipt in the architecture layer.

## Discover

Discover becomes the market-selection surface.

v1:
- exact-card provider search;
- dense scanner table;
- view-only sorting and filters;
- explicit listing selection;
- explicit governed evaluation.

v2:
- server-owned market scan;
- taxonomy-backed sport/player/year/release/parallel/grade facets;
- server cursor pagination;
- no browser inference of exact identity.

## Decisions

Saved Decisions becomes **Decisions**.

It is the customer library of governed FlipForge decisions. Opening a decision enters the Decision Workspace.

## Monitor

Outcome Intelligence, tracking, reminders, decision history, and future evidence-change monitoring converge under **Monitor**.

Monitor records or reports changes. It does not rewrite historical T0 decisions.

Long-term Monitor should answer:
- what changed since the decision;
- whether accepted evidence changed;
- whether evidence became stale;
- whether identity/taxonomy status changed;
- whether price context moved materially;
- whether a governed re-evaluation created a new saved decision snapshot;
- what the actual customer outcome was at 7 / 14 / 30.

## Portfolio

Portfolio remains decision-connected rather than becoming a generic price tracker.

A holding should connect to:
- acquisition facts;
- original decision;
- current evidence state;
- monitoring state;
- governed reference-value context when eligible;
- Exit Review.

Insufficient evidence remains insufficient evidence.

## Supporting intelligence

Forge Heat, Market View, Compare, PSA tools, and export capabilities remain available as supporting intelligence but do not compete with the five primary navigation objects.

## Preview activation

The architecture preview is intentionally feature-gated.

On the full customer deploy preview:

`/app/customer/?ffArchitecture=1#/dashboard`

Without `ffArchitecture=1`, the current customer experience remains unchanged.

The Private Beta shell never loads the full customer architecture assets.

## Release sequence

1. Validate five-part information architecture on desktop/tablet/mobile.
2. Validate Decision Workspace route continuity and saved ID preservation.
3. Validate Discover Scanner separately.
4. Run all authority, customer-state, auth-recovery, lifecycle, and chaos gates.
5. Only after preview approval, replace the old full-customer navigation.
6. Keep Private Beta limited and independently validated.
7. Build server-owned Discover Scan v2.
8. Build server-owned change-monitoring contract.
9. Productize 7 / 14 / 30 Outcome Intelligence.
10. Activate commercial plan packaging only after activation/retention behavior is measured.
