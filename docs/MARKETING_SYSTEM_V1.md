# FlipForge Marketing System v1

## Status

Authoritative implementation plan and operating contract for governed marketing documents.

## Objective

Make FlipForge marketing behave like the product architecture: one governed source, deterministic outputs, validation before release, and no silent drift between the website, customer application, sales documents, campaign materials, and printable collateral.

## Core architecture

```text
marketing/content/*.json
        ↓
scripts/marketing/build-marketing.mjs
        ↓
marketing/generated/*.html
        ↓
marketing-preview/<document>/index.html
        ↓
optional local PDF + PNG export
```

Every production build runs the marketing generator and validator before Netlify publishes the site.

## Authoritative marketing sources

### Brand

`marketing/content/brand.json`

Locks FLIPFORGE, CARD DECISION INTELLIGENCE, Card Decision Intelligence™, the exact slogan “Before you buy. Know Why.”, the approved website logo assets, and BUY/WATCH/VERIFY/PASS.

### Category and positioning

`marketing/content/positioning.json`

Defines FlipForge as a sports-card decision engine and explicitly rejects price-guide, marketplace, collection-tracker, prediction-bot, and auto-buy framing.

### Seven-layer Card Decision Intelligence

`marketing/content/decision-intelligence.json`

1. Identity Intelligence
2. Evidence Intelligence
3. Economic Intelligence
4. Risk + Uncertainty Intelligence
5. Decision Intelligence
6. Decision Traceback / Decision Receipt
7. Outcome Intelligence

### Claim governance

`marketing/content/disclaimers.json` and `marketing/content/proof-points.json`

Generated public materials cannot claim guaranteed returns, guaranteed winners, 100% accuracy, automatic buying, transaction authority, risk-free outcomes, or unauthorized prediction claims. Study accuracy is not a public marketing claim unless independently authorized under a separate claim standard.

## Document package

The governed first release contains:

1. Product One-Pager
2. Card Decision Intelligence Explainer
3. Why FlipForge Exists
4. How FlipForge Builds a Decision
5. Dealer / Flipper Sell Sheet
6. Collector / Investor Sell Sheet
7. Sample Decision Dossier

All seven use the same source language and CSS system.

## Campaign package

The campaign source currently defines:

- Deal or Decoy — 24% → 2.3% → VERIFY
- The Wrong Comp Problem
- More Data ≠ Better Evidence
- Show Me Why / Decision Receipt
- What Happened Next? / Outcome Intelligence

Campaign definitions are structured content, not independent claims. New formats should reuse this source instead of copying text into isolated files.

## Preview center

`/marketing-preview/` is an unlinked, noindex internal preview center. It is not an authentication boundary and must not contain secrets or unreleased sensitive data. Its purpose is visual review before a document is exported or promoted publicly.

## Local operator workflow

```bash
git checkout main
git pull
git checkout -b feature/<marketing-change>
npm run marketing:all
```

For printable exports:

```bash
npm install --no-save playwright@1.55.0
npx playwright install chromium
npm run export:marketing
```

## Release workflow

1. Change governed content or templates.
2. Run `npm run marketing:all`.
3. Review `/marketing-preview/` locally or in deploy preview.
4. Run optional PDF/PNG export.
5. Open PR.
6. Marketing System Assurance must pass.
7. Existing website security/brand/product gates must also pass.
8. Merge only after green CI.
9. Netlify rebuilds the marketing package before production publish.

## Authority boundaries

Marketing remains a read-only explanation layer. It cannot:

- create or modify Card Decision Intelligence authority;
- alter Smart Opportunity or PSA decision logic;
- manufacture evidence or sold comps;
- perform transactions;
- rewrite T0 outcomes;
- publish unauthorized accuracy claims;
- imply that a price or grade alone is the FlipForge decision.

## Future extension path

The same source can later feed:

- website hero and feature copy validation;
- email campaigns;
- social carousel JSON;
- video shot-list generation;
- dealer leave-behinds;
- press/media briefs;
- partner decks;
- launch kits;
- release-specific evidence case studies.

The governing rule remains unchanged: **change the source once, regenerate everywhere.**
