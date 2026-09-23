# FlipForge Public Site — Production Build Brief v1
**Status:** Design/engineering handoff  
**Scope:** Public marketing site only  
**Branch target:** PR #436 / `design/homepage-real-graphics-motion`  
**Release rule:** Do not merge to production until final visual QA is approved.  
**Brand:** FlipForge™ — Card Decision Intelligence™  
**Locked slogan:** **Before you buy. Know Why.**

---

# 1. Objective

The public site must stop reading as a polished SaaS template and start reading as a premium product launch for a serious sports-card decision system.

The visual standard is the approved black / gold / white-silver cinematic direction:
- premium launch-film composition
- real visual storytelling
- slab/card imagery used as a product object
- depth, controlled glow, particles, light rails, dimensional framing
- graphics that explain the product
- sparse, high-confidence typography
- strong contrast and breathing room
- product UI/details embedded inside composed scenes rather than generic cards

The user should understand the product visually before they need to understand the architecture.

---

# 2. Global Art Direction

## Required visual language

| Area | Standard |
|---|---|
| Background | Near-black / deep graphite, not flat pure black everywhere |
| Primary accent | Champagne gold / FlipForge gold |
| Secondary accent | White / cool silver |
| Positive state | Restrained green only when semantically necessary |
| Negative state | Restrained red only for rejected evidence / blocked records |
| Lighting | Directional gold glow, edge-light, halo, controlled particles |
| Depth | Layered planes, perspective, slab/card depth, glass panels |
| Typography | Bold, minimal, editorial; one dominant statement per scene |
| UI | Compact, real product cues; no generic dashboard wall |
| Motion | Product-connected only: resolve, reject, recalc, lock, reveal |
| Texture | Subtle grain / particles / data lines; never decorative noise |
| Brand lockup | Official logo and slogan only; never redraw casually |

## Prohibited visual patterns

- generic SaaS card grids as the primary visual
- random neon sci-fi scanning beams
- stock imagery
- clip-art icons
- decorative gold borders everywhere
- fake claims or fabricated data presented as live proof
- tiny text-heavy dashboards
- repeated disclaimers
- duplicated “Card Decision Intelligence™” labels where the logo already carries it
- retired slogan: “Signal. Confidence. Advantage.”
- forbidden old homepage asset: `assets/images/flipforge-approved-decision-visual.webp`

---

# 3. Sitewide Graphic System

Every major public page must contain at least:
1. **One hero-grade composed visual**
2. **One supporting explanatory graphic**
3. **One premium branded close / CTA treatment**

Graphics should not be standalone decoration. Every graphic must answer one of these:
- What is the exact card?
- Which evidence counts?
- What value is actually supported?
- What uncertainty remains?
- What is the next move?
- Why should the user trust the reasoning?
- What happens after the decision?

---

# 4. Homepage

## Section 1 — Hero
**Asset name:** `ff-home-identity-lock-v1`

**Purpose:** Explain FlipForge in under five seconds.

**Headline:**  
**Bring the card. Get a decision you can understand.**

**Support copy:**  
FlipForge checks the exact card, tests the evidence, rebuilds supported value, and returns a clear next move: BUY, WATCH, VERIFY, or PASS.

**Primary CTA:** Request Beta Access  
**Secondary CTA:** Watch FlipForge in 30 Seconds

**Graphic:**  
A cinematic slabbed-card object floats above a restrained pedestal / decision workspace. Around it:
- Identity — VERIFIED
- Evidence — QUALIFIED
- Value — SUPPORTED
- Risk — VISIBLE
- Decision — VERIFY

The card should be the visual focal point. UI labels sit around the card as supporting evidence, not as the main attraction.

**Motion:**  
Idle state → identity fields resolve → evidence labels appear → supported value appears → decision locks.

**Acceptance standard:**  
A first-time visitor must be able to answer “what does FlipForge do?” without scrolling.

---

## Section 2 — Evidence Filter
**Asset name:** `ff-home-evidence-filter-v1`

**Headline:**  
**The price looked right. The evidence wasn’t.**

**Support copy:**  
FlipForge qualifies what deserves to count before price gets a vote.

**Graphic sequence:**  
7 candidate comps → filter plane → 5 rejected → 2 qualified → supported value → VERIFY.

**Visible rejection reasons:**  
Wrong parallel / wrong grade / duplicate / identity conflict.

**Motion:**  
Candidate comps enter in a fan → rejected evidence moves away / fades → qualified comps remain → value recalculates → VERIFY appears.

**Acceptance standard:**  
This graphic must visually explain the core moat without requiring the paragraph.

---

## Section 3 — Product Film
**Asset name:** `ff-home-film-30-v1`

**Length:** 30 seconds

**Scene timing:**
- 0:00–0:05 — Asking price / apparent deal
- 0:05–0:12 — Exact identity resolves
- 0:12–0:20 — 7 comps → 2 qualified
- 0:20–0:27 — supported value recalculates → VERIFY
- 0:27–0:30 — brand close

**Brand close:**  
FlipForge  
**Before you buy. Know Why.**

**Acceptance standard:**  
No generic embed styling. It must feel like a product film, not a video player dropped into a page.

---

## Section 4 — What Just Happened?
**Asset name:** `ff-home-decision-chain-v1`

**Headline:**  
**Bad evidence stopped before price got a vote.**

**Graphic:**  
Exact card → qualified evidence → supported value → decision.

**Acceptance standard:**  
Keep copy minimal. This section exists to explain the prior graphic, not introduce new architecture.

---

## Section 5 — What Is FlipForge?
**Asset name:** `ff-home-core-model-v1`

**Graphic steps:**
- Know the card
- Test the evidence
- Understand value
- Make the decision

**Acceptance standard:**  
Four steps maximum. No taxonomy / governance / provenance wall.

---

## Section 6 — Decision Proof
**Asset name:** `ff-home-proof-v1`

**Copy direction:**  
Compact proof snapshot only. Full methodology remains on the dedicated page.

**Acceptance standard:**  
Only use verified current figures. If figures are not verified, omit them rather than present placeholders as live proof.

---

## Section 7 — Brand Close / Beta CTA
**Asset name:** `ff-home-brand-close-v1`

**Headline:**  
**Before you buy. Know Why.**

**Support:**  
Bring the card you are actually thinking about buying.

**Acceptance standard:**  
Strong, cinematic final frame. The site should end with a brand memory, not a generic footer CTA.

---

# 5. Product Page

## Hero — Product Workflow
**Asset:** `ff-product-workflow-v1`

**Headline:**  
**See what FlipForge actually does.**

**Graphic:**  
Bring card → verify identity → test evidence → rebuild supported value → BUY / WATCH / VERIFY / PASS.

**Motion:**  
A single card moves through the system. The viewer should see one continuous workflow.

---

## Exact Card First
**Asset:** `ff-product-identity-v1`

**Headline:**  
**One wrong detail can make the whole analysis meaningless.**

**Visible fields:**  
Year / product / set / card number / parallel / grader / grade.

**Graphic:**  
Large card/slab with identity fields resolving around it.

---

## Qualified Evidence
**Asset:** `ff-product-evidence-v1`

**Headline:**  
**Bad evidence stops before it can strengthen the case.**

**Graphic:**  
Qualified lane vs rejected lane.

**Acceptance standard:**  
Wrong-parallel / wrong-grade / duplicate states must be visually obvious.

---

## Supported Value
**Asset:** `ff-product-value-v1`

**Headline:**  
**Price is an input. Supported value is the intelligence.**

**Graphic:**  
Displayed reference → rejected evidence removed → supported value.

---

## Clear Next Move
**Asset:** `ff-product-decision-v1`

**Graphic:**  
BUY / WATCH / VERIFY / PASS shown as premium decision states with one active state.

**Acceptance standard:**  
The active decision dominates. The other states are context, not equal visual weight.

---

# 6. Decision Intelligence Page

## Hero — Decision Receipt
**Asset:** `ff-di-receipt-hero-v1`

**Headline:**  
**Clarity builds value.**

**Support:**  
The FlipForge Decision Receipt turns scattered market evidence into a governed, explainable decision.

**Graphic:**  
A premium 3D receipt object with edge lighting and connected decision layers.

**Receipt visible fields:**  
Identity state / evidence authority / supported value / uncertainty / decision / trace state.

---

## Layer Reveal
**Asset:** `ff-di-layer-reveal-v1`

**States:**  
Collapsed → Traceback Reveal → Full Receipt.

**Motion:**  
The receipt expands into transparent intelligence planes. Each layer activates in order.

**Acceptance standard:**  
This should be one of the highest-quality visual sequences on the site.

---

## Seven-Layer System
**Asset:** `ff-di-seven-layers-v1`

**Layers:**  
Identity / Evidence / Economics / Risk + Uncertainty / Decision / Traceback / Outcome.

**Graphic:**  
Layers orbit or attach to the receipt in a controlled system diagram.

**Acceptance standard:**  
Readable in under ten seconds. Do not turn this into an architecture chart.

---

## Traceback
**Asset:** `ff-di-traceback-v1`

**Headline:**  
**A decision you can not only trust, but understand.**

**Graphic:**  
Receipt with stacked planes revealing what counted, what was rejected, and what uncertainty remains.

---

# 7. Evidence Lab

## Hero — Evidence Case File
**Asset:** `ff-lab-casefile-hero-v1`

**Headline:**  
**Test the evidence, not just the price.**

**Graphic:**  
Forensic comparison scene with target card, candidate comp, highlighted mismatch, and final ruling.

---

## Busted Comp Series
**Asset family:** `ff-lab-busted-comp-XX`

**Template:**  
Target card → candidate evidence → mismatch highlight → allowed / blocked ruling.

**Case labels:**  
Wrong parallel / wrong grade / duplicate / identity conflict / weak support.

**Headline pattern:**  
**Looks close is not close enough.**

**Acceptance standard:**  
Every case should feel like a visual investigation, not an article card.

---

## Qualified Evidence Standard
**Asset:** `ff-lab-qualified-standard-v1`

**Graphic:**  
Two lanes:
- QUALIFIED
- REJECTED

**Criteria:**  
Exact identity / correct grade / no duplicates / relevant market fit / sufficient support.

---

## Evidence Changes Value
**Asset:** `ff-lab-price-distortion-v1`

**Headline:**  
**The wrong evidence can make a deal look stronger than it is.**

**Graphic:**  
Raw price signal → evidence cleanup → supported value.

---

# 8. Private Beta Page

## Hero — Bring the Card
**Asset:** `ff-beta-bring-card-v1`

**Headline:**  
**Bring the card you’re actually thinking about buying.**

**Graphic:**  
Listing / card enters FlipForge → identity → evidence → value → decision receipt.

**Acceptance standard:**  
The beta page must visually feel like entry into the product, not a form page.

---

## What You Get
**Asset:** `ff-beta-result-v1`

**Graphic:**  
A compact Decision Receipt with:
- exact card
- qualified evidence
- supported value
- next move

---

## Returning User
**Asset:** `ff-beta-return-v1`

**Copy:**  
**Already in beta? Continue where you left off.**

**Graphic:**  
Subtle continuation / dashboard-entry visual. Keep this restrained.

---

# 9. About Page

## Hero — FlipForge Core
**Asset:** `ff-about-core-v1`

**Headline:**  
**Built for decisions that deserve more than a price.**

**Graphic:**  
Central FlipForge cube with four connected systems:
Identity / Evidence / Economics / Outcome.

---

## Principles
**Asset family:** `ff-about-principle-XX`

**Principles:**  
No forced match / no silent substitution / no fabricated value / no hindsight rescoring / reason preserved.

**Acceptance standard:**  
Micro-graphics must look like part of the FlipForge product language, not iconography from a template library.

---

## Brand Close
**Asset:** `ff-about-brand-close-v1`

**Copy:**  
**A higher standard for a more confident market.**

---

# 10. Launch Plans

## Hero — User Depth
**Asset:** `ff-plans-depth-v1`

**Headline:**  
**Choose how deeply you want to investigate the decision.**

**Graphic:**  
Scout → Collector → Pro as three increasing levels of depth, not three generic pricing cards.

---

## Why Pay
**Asset:** `ff-plans-value-v1`

**Graphic:**  
Uncertainty clarified / weak comp rejected / decision preserved.

**Message:**  
The value is better decision context, not access to a larger dashboard.

---

## Beta Boundary
**Asset:** `ff-plans-beta-boundary-v1`

**Copy:**  
**Private beta now. Broader launch later.**

**Acceptance standard:**  
Do not visually imply active paid checkout or final pricing.

---

# 11. FAQ

## Hero
**Asset:** `ff-faq-core-v1`

**Headline:**  
**Questions, answered clearly.**

**Graphic:**  
Small restrained decision-core visual.

## Support Graphics
Use only four lightweight branded mini-illustrations:
- What FlipForge is
- What FlipForge is not
- What BUY / WATCH / VERIFY / PASS mean
- Private beta / transaction boundary

**Acceptance standard:**  
FAQ remains fast and readable. Do not turn it into another cinematic landing page.

---

# 12. Motion Language

All animation should follow one of these verbs:

**Resolve → Qualify → Reject → Recalculate → Lock → Reveal**

Examples:
- identity fields resolve into place
- bad evidence slides/falls away
- value updates after rejected evidence leaves
- decision ring closes / locks
- receipt opens into traceback layers

Do not use:
- scanning lasers
- random orbital movement
- constant particles with no purpose
- bouncing cards
- generic parallax for decoration
- motion that causes layout shift

Reduced-motion mode must preserve all information without animation.

---

# 13. Graphic Production Requirements

## Desktop
Target master composition: **1600 × 900** or **1920 × 1080**.

## Mobile
Every hero graphic needs a separate vertical crop/composition:
**1080 × 1350** or equivalent responsive composition.

Do not simply shrink the desktop artwork.

## Performance
- Prefer WebP / AVIF for raster assets.
- Use SVG only for clean interface/diagram assets.
- Hero graphics must be optimized before shipping.
- Lazy-load below-the-fold art.
- Above-the-fold graphic must reserve aspect ratio to prevent layout shift.

## Accessibility
- Decorative art: empty alt.
- Explanatory graphic: concise alt describing the conclusion, not every visual detail.
- Do not place essential information only inside an image.

---

# 14. Asset Naming

Use this convention:

`ff-[page]-[concept]-v1.[webp|avif|svg]`

Examples:
- `ff-home-identity-lock-v1.webp`
- `ff-home-evidence-filter-v1.webp`
- `ff-product-supported-value-v1.webp`
- `ff-di-receipt-hero-v1.webp`
- `ff-lab-busted-comp-wrong-parallel-v1.webp`
- `ff-beta-bring-card-v1.webp`

Motion poster images should use:
`ff-[page]-[concept]-poster-v1.webp`

---

# 15. Build Sequence

| Priority | Page | Work |
|---|---|---|
| P0 | Homepage | Identity hero, Evidence Filter, Decision Lock, Brand Close |
| P0 | Product | Workflow, Identity, Evidence, Supported Value, Decision |
| P0 | Decision Intelligence | Receipt hero, layer reveal, seven-layer graphic, traceback |
| P1 | Evidence Lab | Case-file hero, Busted Comp system, evidence-standard graphics |
| P1 | Private Beta | Bring-the-card hero, result graphic, returning-user visual |
| P2 | About | Core system, principles, brand close |
| P2 | Launch Plans | user-depth graphic, value graphic, beta boundary |
| P2 | FAQ | restrained hero and four supporting mini graphics |

---

# 16. Acceptance Gate

A page is not considered visually finished unless all of the following are true:

| Gate | Pass condition |
|---|---|
| Brand | Uses official FlipForge identity and locked slogan correctly |
| Hero | Contains a real composed visual, not only text + styled boxes |
| Product clarity | Visual explains a real part of the product |
| Premium quality | Comparable to approved cinematic references |
| Copy hierarchy | One dominant statement per scene |
| Mobile | Has a deliberate mobile composition |
| Motion | Product-connected and reduced-motion safe |
| Evidence truth | No fabricated metrics or unsupported claims |
| Performance | No material layout shift or oversized unoptimized assets |
| Cohesion | Feels like the same visual system as the homepage |

---

# 17. Final Creative Standard

The target is not “a nicer website.”

The target is:

**A premium Card Decision Intelligence product experience where every major page visually demonstrates why FlipForge is different.**

The approved reference quality establishes the bar:
- cinematic
- sophisticated
- product-led
- collectible-aware
- visually explanatory
- unmistakably FlipForge

When a section could belong to any SaaS company after replacing the logo, it is not finished.
