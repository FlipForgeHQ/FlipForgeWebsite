# FlipForge Marketing System v1

This directory is the governed source for FlipForge marketing documents and campaigns.

## Principle

Marketing materials are generated from a shared source of truth instead of being maintained as independent copies. Brand language, Card Decision Intelligence™ terminology, decision states, evidence boundaries, public proof points, audience messaging, and disclaimers live under `marketing/content/`.

## Locked public language

- **FLIPFORGE**
- **CARD DECISION INTELLIGENCE**
- **Card Decision Intelligence™**
- **Before you buy. Know Why.**
- Decision states: **BUY / WATCH / VERIFY / PASS**

The internal strategic analogy “Bloomberg of sports cards” is not approved as generated public marketing copy.

## Source structure

- `content/brand.json` — locked brand and decision-state vocabulary
- `content/positioning.json` — category and product positioning
- `content/decision-intelligence.json` — four governed CDI systems and thirteen intelligence layers
- `content/product-messaging.json` — universal customer messaging
- `content/audience-messaging.json` — collector, investor, flipper, dealer, and grading-user framing
- `content/proof-points.json` — approved behavioral proof points
- `content/disclaimers.json` — required boundaries and forbidden claims
- `content/campaigns.json` — reusable campaign stories and formats
- `content/documents.json` — document package definition
- `templates/` — HTML shells
- `styles/flipforge-marketing.css` — shared web/print design system

## Generated package

`npm run build:marketing` creates:

- `marketing/generated/*.html`
- `marketing/generated/manifest.json`
- `/marketing-preview/` with the internal preview center and seven document previews

Generated output is intentionally ignored by Git because it is rebuilt from governed sources.

## Validation

Run:

```bash
npm run marketing:all
```

The validator fails if:

- locked descriptor/category/slogan language changes;
- BUY/WATCH/VERIFY/PASS changes;
- any of the thirteen CDI layer names or four-system structure drift;
- a required document disappears;
- forbidden performance/profit claims appear;
- the internal Bloomberg analogy leaks into generated public copy;
- generated outputs omit the disclaimer boundary;
- locked brand assets are missing.

## PDF and PNG export

Install Playwright locally once:

```bash
npm install --no-save playwright@1.55.0
npx playwright install chromium
```

Then export everything:

```bash
npm run export:marketing
```

Or export a specific document:

```bash
node scripts/marketing/export-marketing-pdf.mjs product-one-pager
```

Exports are written to `marketing/exports/` and are intentionally ignored by Git.

## Current document package

1. FlipForge Product Overview
2. What Is Card Decision Intelligence?
3. Why FlipForge Exists
4. How FlipForge Builds a Decision
5. FlipForge for Dealers & Flippers
6. FlipForge for Collectors & Investors
7. Sample FlipForge Decision Dossier

## Governance boundary

Marketing can explain governed product behavior but cannot create new authority. It cannot invent sold comps, promise returns, claim unapproved accuracy, imply transaction authority, or replace missing evidence with confidence language.
