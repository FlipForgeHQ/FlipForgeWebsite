# FlipForge SaaS Customer Account Lifecycle Foundation

Status: **IMPLEMENTED / PREPARED for deploy-preview validation; not production activated**

## Purpose

This phase turns the controlled Netlify Identity staging login into a complete invitation-only account lifecycle foundation without adding billing, public signup, provider administration, or transaction authority.

The deploy-preview flow now supports:

- invited-user account activation;
- secure sign in and sign out;
- password-recovery email requests with non-enumerating responses;
- recovery callback handling and new-password completion;
- self-service display-name updates;
- sanitized session status for the customer account screen;
- active/inactive membership status without displaying a raw tenant identifier;
- a safe same-origin return from the isolated sign-in page to the SaaS account route.

## Authority boundaries

- Smart Opportunity remains the sole `BUY / WATCH / VERIFY / PASS` authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- SQLite remains the authoritative application and staging store.
- Netlify Identity owns authentication only; it does not score, accept evidence, grant paid entitlements, or create transaction authority.
- Tenant access continues to come only from administrator-signed roles and the server-side gateway.
- Browser code cannot choose a tenant, alter signed membership, or inject trusted identity headers.

## Lifecycle boundary

Public signup remains disabled. Accounts must be invited and assigned administrator-controlled staging membership before data access is available.

Password recovery intentionally returns the same customer-facing message whether or not an invited account exists. Recovery and invitation tokens are processed in memory and removed from the address bar before passwords are submitted.

The account screen consumes only a sanitized browser snapshot:

- authenticated or signed out;
- email;
- self-service display name;
- membership configured or not configured;
- membership active or inactive.

It does not render the raw tenant ID, Identity subject, signed role names, JWT, refresh token, service token, or provider credential.

## Explicitly unavailable

- Billing and paid entitlement authority remain unavailable.
- Production customer activation remains unavailable.
- Public self-service signup remains unavailable.
- Email-address mutation remains unavailable in this phase.
- Customer tenant provisioning remains an administrator operation.
- Provider administration remains server/operator only.
- Bidding, purchasing, checkout, payment, listing, and resale remain unavailable.

## Validation

Run from `FlipForgeWebsite`:

```powershell
npm run build:identity
npm run validate:identity
npm run validate:account-lifecycle
```

The Netlify build runs these gates before publishing the static deploy preview. This phase does not enable the API bridge or change any production environment variable.
