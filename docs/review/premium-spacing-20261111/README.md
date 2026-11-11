# Premium spacing and design-system pass (2026-11-11): audit and evidence

Each JPG in this folder shows one page at one width, before (left) and after (right), full page.
Widths: desktop 1440, tablet 834, mobile 390. The 360px viewport was measured but has no screenshot.
Docs are stripped from the published site (`scripts/strip-internal-from-publish.mjs`).

## Phase 1: what the rendered audit found

All 17 sitemap pages were measured in Chromium at 1440, 834, 390 and 360px. For each page the audit recorded:
- every blank vertical band between visible content, and the boxes that produce it;
- section transitions;
- container edges;
- heading sizes, button styles and corner radii.

| # | Problem | Where | CSS responsible |
|---|---|---|---|
| 1 | Up to **200px of empty space** where black and white sections meet; 100px between the dark sections | Home | `--ff-space-section-lg: clamp(56px,7vw,104px)` (public-shell-contract-v1.css), used as `--pad` top and bottom by `.ff10-demo`, `.ff10-app`, `.ff10-aud`, `.ff10-final` |
| 2 | **Two content edges on the same page.** Headings and intro panels sit at the 1180px column; sections, callouts, proof strips and tables sit 22px inside it (1136px). About and Proof use a third column (1120px). FAQ and the legal card are centred inside it (930px / 1050px) | Product, Launch Plans, Evidence Lab, FAQ, Beta, Onboarding, About, Proof, legal | `.section{max-width:1180px;padding:… 22px}` (award-winning-v1.css, site-complete-v10.css, marketing-*.css); `--ab-max:1120px`; `.ff-proof-page-wrap{width:min(1120px,100%)}`; `.faq-list{max-width:930px}`; `.ff10-legal .legal-card{max-width:1050px}` |
| 3 | **Inverted heading hierarchy.** Chapter openers render at 64px and the intro panel's second heading at 50px (weight 930), both larger than the 48px page title. Legal titles are 64px, Proof 86px, Dossier 76px, the article 84px. Several section titles are 43–52px | All internal pages | `.ffg-heading h2{font-size:clamp(34px,5vw,64px)}` (sitewide-graphics-v1.css); `.ff10-feature-story h2`; page-specific `h1` sizes outside the typography contract |
| 4 | **Three button styles.** Header: sentence case, 14px, 10px corners. Home: sentence case, 16px, 6px corners. Internal pages: UPPERCASE, 12px, weight 900, tracked, 9px corners | Every page | `.btn{font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;border-radius:9px}` (site.css) |
| 5 | **Fourteen corner radii** (8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22 and 26px) on panels and cards | Every page | Page-specific panel rules (phase2, award-winning, dossier, proof, decision-intelligence) |
| 6 | Nested paddings stacked: section padding + card padding + page end (100–125px) | Legal pages, Proof, Beta callout | `.ff10-legal .section` + `.legal-card` padding; `.callout` margin-top inside a padded section; `.ff-proof-page-section{padding-top:56px}` under a 44px hero padding |
| 7 | Mobile gutters vary between 10px and 22px from section to section | Product, Launch Plans, FAQ | `.ffg-wrap` (14px), `.section` (18px), intro panels (18px) |

Not treated as defects, deliberately left as they are:
- intentional open space inside the homepage hero and its display headline;
- the narrower 980px media figures (product screenshots, approved graphics), which are image framing;
- the About page's 68-character reading measure;
- the Connect link page's own layout.

## What changed

Four CSS files changed; there are no HTML, JS, content, backend or data changes.

- **`assets/css/public-shell-contract-v1.css`.** The shared spacing tokens are tighter:
  - `--ff-space-section-lg` is now 28–52px (was 56–104px);
  - `--ff-space-block-lg` is now 28–44px;
  - `--ff-space-block` is now 20–32px;
  - `--ff-space-page-end` is now 32–48px;
  - `--ff-space-section` is unchanged, because CI pins it.

  It also adds new tokens: `--ff-container` (1180px), `--ff-gutter` (22px desktop, 18px phone) and three radii (panel 16, card 12, control 8). The header button and Menu use the control radius.
- **`assets/css/public-typography-contract-v1.css`.**
  - A new role, `--ff-type-feature-title` (30–42px desktop, 26–32px phone), sits between the page title and the section title.
  - Chapter openers use it, as do the intro panel's second heading and the Decision Intelligence closing heading.
  - Legal, Proof, Dossier and article titles use the page-title size.
  - Callout, case-card, onboarding, dossier and proof headings use the section-title size.
- **`assets/css/public-design-system-v2.css`** (new, imported by `brand-v2.css`, public pages only). It covers four things:
  - **One content column.** Content now aligns on one 1180px column with one gutter: sections, About, Proof, FAQ and the legal card.
  - **Vertical rhythm.** Adjacent sections share one gap. A panel no longer adds a margin on top of its section's padding. Legal and Proof spacing no longer stacks. Where two dark homepage sections meet, the shared gap has a 48px minimum.
  - **One button family.** Buttons are sentence case, 15px, weight 700 and at least 48px tall, with 8px corners. The gold hover is flat, as on the header button, and there is a visible focus ring.
  - **Three radii.** Panels use 16px, cards 12px and controls 8px.

The signed-in app does not load `brand-v2.css` and is unaffected.

## Measured result

Homepage gap between sections, measured from the last line of one section to the first line of the next:

| Junction | 1440 before → after | 834 | 390 |
|---|---|---|---|
| Hero → "Would you buy this card?" (black → white) | 212 → 139px | 75 → 42px | 88 → 56px |
| Inside the app → Who it's for (dark → dark) | 102 → 53px | 59 → 49px | 57 → 49px |
| Who it's for → Final call to action (dark → dark) | 101 → 52px | 59 → 48px | 56 → 48px |

Page height in px, before → after:

| Page | Desktop 1440 | Tablet 834 | Mobile 390 |
|---|---|---|---|
| Home | 7,160 → 6,727 | 8,372 → 8,196 | 11,086 → 10,922 |
| Decision Intelligence | 4,361 → 4,258 | 5,003 → 4,981 | 6,920 → 6,869 |
| Product | 3,513 → 3,403 | 4,529 → 4,498 | 6,087 → 6,029 |
| Launch Plans | 4,100 → 4,026 | 6,333 → 6,292 | 7,952 → 7,894 |
| Evidence Lab | 6,554 → 6,302 | 8,091 → 7,955 | 11,427 → 11,312 |
| About | 5,348 → 5,251 | 5,362 → 5,323 | 7,849 → 7,814 |
| FAQ | 3,940 → 3,679 | 4,082 → 3,963 | 4,808 → 4,705 |
| Private Beta | 4,132 → 3,969 | 5,711 → 5,633 | 7,972 → 7,835 |
| Beta onboarding | 3,684 → 3,349 | 4,910 → 4,854 | 7,440 → 7,305 |
| Decision Proof | 3,145 → 2,680 | 3,337 → 3,230 | 4,806 → 4,638 |
| Sample Dossier | 3,047 → 2,889 | 3,922 → 3,882 | 6,184 → 6,108 |
| Price is not proof | 6,579 → 6,413 | 6,319 → 6,246 | 9,283 → 9,234 |
| Privacy | 4,355 → 4,550 | 4,782 → 4,752 | 8,931 → 8,983 |

Privacy is taller on desktop on purpose: its text now keeps a 76-character reading measure inside the full-width card.

There is no horizontal overflow on any of the 17 pages at 1440, 834, 390 or 360px.
