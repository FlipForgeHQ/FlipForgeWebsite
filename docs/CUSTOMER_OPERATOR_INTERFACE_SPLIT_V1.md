# FlipForge SaaS Surface and Operator Split v2

## Purpose

FlipForge uses **one authoritative decision engine** with exactly **two hosted SaaS product experiences**:

1. **Private Beta** — invitation-only tester experience at `/app/beta/`.
2. **Customer** — the real customer experience, held from public launch until release.

The owner/operator tools are administrative controls, not a third product version. Hosted SaaS has no DEV mode; development remains outside the hosted product.

## Canonical owner entry

Private Owner Hub:

`/owner`

The Owner Hub is operator-only, `noindex`, absent from public navigation, and provides one controlled launch point for:

- Private Beta: `/app/beta/#/beta-start`
- Customer owner preview: `/owner/customer/#/dashboard`
- Beta Operations: `/operator-beta.html`
- Public website: `/`

## Private Beta

Private Beta is the invitation-only tester-facing SaaS experience. It uses the same FlipForge engine and authority boundaries as Customer, with beta-specific onboarding, capability limits, and feedback controls.

Canonical onboarding route:

`/app/beta/#/beta-start`

## Customer

The Customer experience is the real customer SaaS presentation. Before public launch, the public customer route remains unpublished.

The owner may inspect the same customer document through:

`/owner/customer/#/dashboard`

That preview is not a DEV build and not a third SaaS version. It is an operator-gated view of the Customer experience.

## Beta Operations

Beta Operations remains separate at:

`/operator-beta.html`

It manages tester invitations, activation, access, removal/deletion of controlled test accounts, comprehension signals, and feedback. It is an owner tool, not a product version.

## Authority boundaries

This surface split does not change:

- Smart Opportunity BUY/WATCH/VERIFY/PASS authority;
- PSA grading-guidance authority;
- evidence eligibility or acceptance;
- tenant/account isolation;
- billing authority;
- provider administration;
- transaction authority;
- the canonical backend source of truth.

## Public boundary

The public website must not link to the Owner Hub, Beta Operations, or the pre-launch Customer owner preview.

The future public Customer route remains unpublished until launch. Private Beta remains invitation-only.

## Mental model

**FlipForge Engine → Private Beta or Customer**

Owner Hub and Beta Operations sit outside those two product experiences as private administrative controls.
