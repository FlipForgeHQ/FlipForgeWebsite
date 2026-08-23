# FlipForge Visual Identity — LOCKED

**Status:** APPROVED / LOCKED  
**Effective:** 2026-08-23

This document is the repository-level visual lock for FlipForge website and authenticated SaaS product identity.

## Primary website/app header lockup

Use the **horizontal** lockup:

1. Approved cube-in-corners icon on the left.
2. `FLIPFORGE™` wordmark to the right.
3. `CARD INTELLIGENCE` beneath the wordmark in small caps with wide tracking.
4. `Before you buy. Know Why.` beneath the descriptor in the approved extended website lockup.

### Approved icon source

`/brand/v2/master/FlipForge_Icon_Transparent_DarkBG.svg`

Do not redraw the center as a flat square. Use the approved three-dimensional gold cube vector.

## Typography

Primary family: **Geist Sans**.

Preferred hierarchy:
- Semibold for the wordmark and strong labels.
- Medium / Regular for product UI and supporting copy.
- Preserve deliberate tracking in the wordmark and descriptor.

The self-hosted Geist variable font in `assets/fonts/` is the website source. Use the repository-defined system fallback stack only when that asset cannot load.

## Locked palette

- Black: `#000000`
- White: `#FFFFFF`
- Silver: `#8B8F98`
- Gold: `#D4AF37`
- Deep Gold: `#B8860B`

## Compact usage

Use the icon without the wordmark for:
- favicon;
- app icon;
- very small navigation states;
- loading/compact UI where the full lockup would become unreadable.

## Tagline

Official display lockup:

`Before you buy. Know Why.`

Normal prose:

`Before you buy. Know Why.`

## Do not

- Do not use the retired CSS-drawn flat center square as the primary mark.
- Do not change the locked palette without a new approved brand version.
- Do not remove the tagline from the primary website lockup. Icon-only and space-constrained application surfaces remain approved compact exceptions.
- Do not stretch, recolor, or alter the approved icon proportions.
- Do not replace Geist Sans with an alternate typography direction without an explicit new approval.

## Implementation

The authenticated SaaS shell loads `saas-prototype/final-brand-lock.css`, which intentionally overrides feature-level styling for the primary brand identity. The brand manifest at `brand/v2/manifest.json` records the same locked decision.
