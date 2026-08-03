# FlipForge SaaS Paddle Customer Checkout

## Purpose

This phase connects the already-governed Paddle checkout preparation engine to the authenticated FlipForge customer surface while keeping production billing separately disabled.

The customer path is:

1. the signed FlipForge user opens **Plan & Usage**;
2. the server-owned entitlement response determines whether checkout is available;
3. the browser may select only `COLLECTOR` or `PRO`;
4. the browser sends only `planCode` plus a one-time `Idempotency-Key` to `POST /api/v1/billing/paddle/checkout`;
5. the Netlify customer gateway resolves trusted tenant membership and injects the private backend service token and tenant context;
6. the authoritative backend resolves the plan to a server-owned Paddle price and prepares one provider transaction;
7. FlipForge returns a validated HTTPS checkout handoff URL;
8. the browser navigates to that returned URL;
9. Paddle handles payment credentials;
10. only the verified Paddle webhook may activate paid FlipForge entitlement afterward.

## Customer gateway boundary

The customer gateway allowlists exactly:

`POST /api/v1/billing/paddle/checkout`

It does **not** allowlist:

`POST /api/v1/billing/paddle/webhook`

The checkout route uses the normal customer trust chain:

- signed Netlify Identity context;
- active FlipForge tenant membership from signed app metadata;
- server-injected `X-FlipForge-Tenant-Id`;
- server-injected backend service token;
- customer request `Idempotency-Key` validated by the gateway and backend.

Browser-supplied tenant or user identity headers remain forbidden.

## Browser data contract

The browser sends only:

```json
{
  "planCode": "COLLECTOR"
}
```

or:

```json
{
  "planCode": "PRO"
}
```

The browser never supplies or receives:

- Paddle API key;
- Paddle webhook signing secret;
- Paddle price ID;
- raw FlipForge tenant ID;
- opaque `flipforge_billing_ref`;
- card number;
- CVV;
- bank account;
- payment token.

## Checkout handoff validation

Before navigation, the customer code requires the returned FlipForge envelope to confirm:

- `kind = paddle-checkout`;
- provider is `PADDLE`;
- returned plan matches the selected FlipForge plan;
- checkout URL is HTTPS and contains no userinfo or fragment;
- customer price ID is not included;
- opaque billing reference is not included;
- `paidAccessActivated = false`;
- `webhookRequiredForPaidActivation = true`;
- `paymentCredentialsHandledByFlipForge = false`;
- `transactionAuthority = false`.

The browser opens no unvalidated provider URL.

## Idempotency

Each new customer checkout action creates one safe request key. The same key is forwarded through the customer gateway to the authoritative backend.

Stable checkout outcomes include:

- `CHECKOUT_IDEMPOTENCY_KEY_REQUIRED`;
- `INVALID_CHECKOUT_IDEMPOTENCY_KEY`;
- `CHECKOUT_IDEMPOTENCY_CONFLICT`;
- `CHECKOUT_IN_PROGRESS`;
- `CHECKOUT_REQUIRES_NEW_REQUEST_ID`;
- `CHECKOUT_OUTCOME_UNKNOWN`;
- `SUBSCRIPTION_ALREADY_ACTIVE`;
- `CHECKOUT_UNAVAILABLE`;
- `CHECKOUT_PROVIDER_REJECTED`.

Raw Paddle rejection bodies and backend configuration details are not returned to the customer.

## Activation boundary

The existence of the route and UI controls does not activate checkout by itself.

The authoritative backend requires `FLIPFORGE_PADDLE_CHECKOUT_ENABLED=true` before checkout can be connected. A live Paddle API key additionally requires `FLIPFORGE_PADDLE_LIVE_CHECKOUT_ENABLED=true`.

Sandbox proof is required before any live activation decision.

Production billing, live payment acceptance, upgrades, downgrades, cancellation, refunds, invoices, tax operations, and customer billing-portal management remain separate phases and require explicit approval.

## Validation

Run:

```bash
npm run validate:paddle-customer-checkout
```

The validator proves the exact gateway allowlist, signed tenant injection, service-token secrecy, checkout idempotency, webhook exclusion, bridge-disabled fail-closed behavior, safe error normalization, Plan & Usage browser boundaries, and no direct paid-access or transaction authority.
