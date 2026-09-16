# FlipForge Private Beta — Canonical Customer App Route

Status: **ACTIVE PRODUCT CONTRACT**  
Effective: **2026-09-16**

## Canonical model

FlipForge Private Beta is not a separate customer application. Invited beta testers use the same definitive customer SaaS experience as all customer-facing product work.

Canonical customer app base:

`/app/customer/`

Canonical private-beta onboarding route:

`/app/customer/#/beta-start`

The retired pre-canonical beta-shell onboarding target must not be emitted by invitation, Terms-acceptance, onboarding, operator, launch, or support code. `/app` may remain only as a Netlify compatibility alias that canonicalizes to `/app/customer/`.

## Activation contract

After an invited tester accepts the Private Beta Terms and the acceptance receipt is recorded, the browser must open:

`/app/customer/#/beta-start`

The `beta-start` guide renders inside the full customer shell. It is an onboarding route, not a separate beta UI.

## Product boundary

Beta access is controlled by signed Identity membership and tenant roles. Beta status changes access and capability availability; it does not create a second source of truth, second recommendation engine, second browser application, or separate beta product.

## Customer-shell rule

The definitive customer document must load the Private Beta Guide stylesheet and adapter so `#/beta-start` renders in-place. The beta Terms gate must also be present on the canonical customer app surface.

## UI rule

Any capability unavailable during private beta must be clearly labeled as unavailable, limited, beta, or coming later. A visible control must not look production-ready and then silently dead-end because its backend authority is intentionally inactive.

## Documentation rule

All operator instructions, invitation callbacks, launch packs, readiness docs, customer onboarding material, and support guidance must refer to the same canonical customer app and onboarding route.

## Regression rule

Private-beta validation must fail if:

- the retired beta-shell onboarding target reappears in invitation or Terms-completion code;
- the customer app stops loading `private-beta.css` or `private-beta.js`;
- the Terms-gate injector stops targeting `saas-prototype/customer.html`;
- canonical beta documentation stops naming `/app/customer/#/beta-start`;
- any activation path implies a separate authoritative beta customer application.
