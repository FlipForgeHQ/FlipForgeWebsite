# FlipForge Private Beta Canonical Route — Revised 2026-09-28

Status: **ACTIVE PRODUCT CONTRACT**  
Effective: **2026-09-16**

## Canonical model

FlipForge Private Beta uses a dedicated invitation-only Private Beta surface. The future customer application remains unpublished and is not a public login destination before launch.

Canonical Private Beta application base:

`/app/beta/`

Canonical private-beta onboarding route:

`/app/beta/#/beta-start`

The retired pre-canonical beta-shell onboarding target must not be emitted by invitation, Terms-acceptance, onboarding, operator, launch, or support code. `/app` may remain only as a Netlify compatibility alias that canonicalizes to `/app/beta/`.

## Activation contract

After an invited tester accepts the Private Beta Terms and the acceptance receipt is recorded, the browser must open:

`/app/beta/#/beta-start`

The `beta-start` guide renders inside the dedicated Private Beta shell. The future customer application remains separate and unpublished.

## Product boundary

Beta access is controlled by signed Identity membership and tenant roles. Beta status changes access and capability availability; it does not create a second source of truth, second recommendation engine, second browser application, or separate beta product.

## Surface rule

The dedicated Private Beta document must load the Private Beta Guide stylesheet and adapter so `#/beta-start` renders in place. The customer document remains an internal DEV surface and must not be published through production routing.

## UI rule

Any capability unavailable during private beta must be clearly labeled as unavailable, limited, beta, or coming later. A visible control must not look production-ready and then silently dead-end because its backend authority is intentionally inactive.

## Documentation rule

All operator instructions, invitation callbacks, launch packs, readiness docs, onboarding material, and support guidance must refer to the same canonical Private Beta route.

## Regression rule

Private-beta validation must fail if:

- the retired beta-shell onboarding target reappears in invitation or Terms-completion code;
- the Private Beta surface stops loading `private-beta.css` or `private-beta.js`;
- invitation or Terms-completion code routes testers to `/app/customer/`;
- canonical beta documentation stops naming `/app/beta/#/beta-start`;
- any activation path exposes the unpublished customer application.
