# FlipForge Customer Subscription Entitlements

## Purpose

This phase adds a read-only **Plan & Usage** workspace to the private-beta customer application.

The browser does not become a billing authority. It reads the existing tenant-scoped `GET /api/v1/entitlements` route through the same signed-membership Netlify gateway already used by the customer application.

## Customer route

The existing `#/account` route now opens Plan & Usage on eligible deploy previews.

The workspace displays only server-returned state:

- current access/plan name;
- access state and entitlement source;
- whether a paid plan is actually verified active;
- completed evaluations in the current usage window;
- monthly allowance when one exists;
- remaining evaluations when bounded;
- planned Scout, Collector, and Pro plan contracts;
- whether billing is connected;
- whether checkout is available.

No sample subscription or browser-generated allowance is substituted when the bridge is disabled or the entitlement request fails.

## Private-beta truth

Existing invited beta tenants remain `PRIVATE_BETA` unless the authoritative backend returns a different governed state.

Private beta is not presented as Scout, Collector, Pro, or a paid subscription.

When billing is disconnected the workspace explicitly says billing is not connected and does not render upgrade, checkout, card-entry, cancellation, or payment controls.

## Gateway boundary

`GET /api/v1/entitlements` was already present in the explicit gateway allowlist before this phase.

The browser sends only:

- a same-origin authenticated GET;
- `Accept: application/json`;
- a correlation ID.

It does not send or construct:

- `X-FlipForge-Tenant-Id`;
- `X-FlipForge-User-Id`;
- backend service tokens;
- plan overrides;
- payment credentials.

The Netlify server-side gateway derives the tenant from signed app metadata and adds the trusted tenant header plus service token only on the upstream request.

## Offline behavior

The Plan & Usage adapter checks `/api/v1/health` first.

If the private-beta bridge is not configured, the page displays a safe offline state and does not request tenant entitlements. No mock plan, usage count, or paid status is invented.

## Authority boundaries

The customer Plan & Usage workspace is read-only. It cannot:

- change Scout, Collector, Pro, or private-beta state;
- connect a billing provider;
- create checkout sessions;
- process a card, ACH payment, invoice, refund, or tax;
- grant an entitlement;
- modify monthly usage;
- accept evidence;
- recalculate Smart Opportunity or PSA guidance;
- bid, buy, pay, list, sell, or authorize any transaction.

The authoritative backend remains the only source for entitlement and usage state.

## Validation

Run:

```bash
npm run validate:customer-entitlements
```

The validator proves:

- the account route uses the entitlement adapter;
- the adapter is deploy-preview/local only;
- only health and entitlement GET routes are allowed;
- same-origin authentication and no-store caching are used;
- Smart Opportunity and existing PSA authority metadata are validated;
- read-only and zero-transaction-authority flags are required;
- no payment/upgrade controls or client tenant headers are present;
- a signed active tenant can read the existing entitlement gateway route;
- tenant identity and service token are attached only to the upstream server request;
- neither secret value is returned to the browser;
- private-beta and 5/75/300 planned plan state survives the gateway unchanged;
- a disabled bridge makes zero upstream calls.

## Production boundary

This phase does not connect billing or activate staging/production. Paid checkout, hard write-path quota enforcement, subscription-provider webhooks, cancellation/refund handling, and production billing operations remain separate explicit phases.
