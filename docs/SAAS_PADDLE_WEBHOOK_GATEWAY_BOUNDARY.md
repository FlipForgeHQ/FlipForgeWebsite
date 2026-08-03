# FlipForge SaaS Paddle Webhook Customer-Gateway Boundary

## Purpose

The authoritative backend has a provider-facing Paddle webhook boundary at:

`POST /api/v1/billing/paddle/webhook`

That provider route must **never be added to the customer gateway allowlist** in `netlify/functions/flipforge-api.js`.

The Netlify customer gateway exists for authenticated FlipForge customer traffic. Paddle webhook traffic is provider-to-backend traffic authenticated with `Paddle-Signature`, not with Netlify Identity or FlipForge tenant membership.

## Required separation

The customer gateway must reject the Paddle webhook path before:

- resolving Netlify user identity;
- resolving signed tenant membership;
- evaluating preview tenant bypass;
- checking whether the SaaS bridge is enabled;
- attaching the backend FlipForge service token;
- attaching `X-FlipForge-Tenant-Id`;
- calling the private backend.

The expected customer-gateway result for the exact Paddle path is:

- HTTP `404`;
- error code `ROUTE_NOT_ALLOWED`;
- zero upstream fetches.

This remains true even when the caller:

- is a signed active FlipForge tester;
- is anonymous;
- supplies a header named `Paddle-Signature`;
- sends a subscription-looking JSON body.

## Identity boundary

Netlify signed membership is customer identity. It cannot establish provider billing identity.

Likewise, browser tenant identity cannot establish billing identity for a Paddle webhook. The authoritative backend resolves billing ownership only after Paddle signature verification and through its private opaque billing-reference registry.

The customer gateway therefore must never transform customer identity into a Paddle webhook request.

## Secret boundary

A rejected Paddle webhook request must never receive or expose:

- `FLIPFORGE_API_SERVICE_TOKEN`;
- raw tenant ID;
- Paddle webhook secret;
- Paddle subscription or event credentials;
- payment credentials.

The gateway does not possess the Paddle webhook signing secret and does not verify Paddle webhook signatures.

## Browser boundary

There is no customer navigation item, route, form, or control for the provider webhook.

The provider webhook is not:

- an upgrade endpoint;
- a checkout endpoint;
- a customer billing portal;
- a customer subscription-change endpoint.

FlipForge may separately expose the authenticated customer checkout endpoint at `POST /api/v1/billing/paddle/checkout`. That does not weaken this provider boundary: the checkout route uses customer authentication, trusted tenant membership, and a customer idempotency key, while the webhook remains direct provider-to-backend traffic authenticated only by `Paddle-Signature`.

## Validation

Run:

```bash
npm run validate:paddle-webhook-gateway-boundary
```

The validator checks source and performs dynamic Netlify-function calls proving:

1. the exact Paddle webhook path is absent from the gateway allowlist;
2. customer UI/navigation contains no provider webhook path;
3. signed customer webhook requests receive `ROUTE_NOT_ALLOWED`;
4. anonymous provider-looking webhook requests also receive `ROUTE_NOT_ALLOWED`;
5. a supplied `Paddle-Signature` header does not change gateway behavior;
6. no webhook request reaches the configured private upstream;
7. no service token or tenant ID is returned;
8. webhook sibling paths remain denied;
9. the separate authenticated checkout route does not proxy or authenticate the webhook.

## Activation boundary

This customer-gateway boundary does not activate staging or production billing.

The backend Paddle webhook endpoint requires a separately configured private hosted environment, Paddle credentials, persistent SQLite, HTTPS routing, and explicit deployment approval.

Production billing activation remains a separate explicit decision after checkout, provider configuration, recovery, monitoring, and operational validation are complete.
