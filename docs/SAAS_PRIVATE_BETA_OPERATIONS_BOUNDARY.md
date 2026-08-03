# FlipForge SaaS Private Beta Operations Boundary

## Purpose

The authoritative FlipForge backend now has a private operator runtime status route for controlled beta operation. This website phase proves that the route remains outside every customer-facing browser and gateway path.

The backend-only route is:

- `GET /api/v1/operator/status`

It is service-token-only on the private backend and must never be added to the customer gateway allowlist.

## Customer gateway rule

`netlify/functions/flipforge-api.js` continues to use an explicit route allowlist. The operator path is intentionally absent.

A signed, active private-beta customer requesting `/api/v1/operator/status` through the website gateway must receive:

- HTTP `404`;
- stable code `ROUTE_NOT_ALLOWED`;
- no upstream backend call;
- no service token;
- no tenant identifier;
- no operator telemetry.

This remains true even when the private-beta bridge is enabled and the upstream backend is otherwise configured.

## Browser separation

No customer navigation, customer route hook, private-beta guide, or Portfolio/Discover/Evaluate workspace may expose the operator route.

The operator telemetry is an owner/operator concern. Beta customers continue to see only customer intelligence and customer workflow surfaces.

## Why this boundary matters

Operational counters can reveal service behavior and should not become part of the customer API contract. Keeping the route backend-only prevents:

- accidental browser access to runtime counters;
- expansion of customer authorization into operator authorization;
- tenant-selection ambiguity;
- coupling customer UI behavior to process-local telemetry;
- pressure to expose logs, payloads, or infrastructure details.

## Validation

Run:

```bash
npm run validate:private-beta-operations-boundary
```

The validator proves both static and runtime boundaries:

- the gateway source does not allowlist `/api/v1/operator/status`;
- the SaaS customer navigation and route hook contain no operator route;
- the private-beta guide contains no operator control;
- a signed active customer receives `404 ROUTE_NOT_ALLOWED`;
- the rejected request makes zero upstream calls;
- the response contains no backend service token or tenant ID;
- caching remains disabled;
- no transaction control is introduced.

## Production boundary

This phase does not activate staging or production, change authentication roles, configure provider credentials, enable external alerts, add billing, or create any transaction authority.

Production activation remains a separate explicit decision.
