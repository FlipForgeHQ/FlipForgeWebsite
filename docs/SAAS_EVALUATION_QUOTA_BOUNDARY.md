# FlipForge Customer Evaluation Quota Boundary

## Purpose

This phase makes the customer-facing evaluation path accurately surface the server-owned quota decision introduced by the authoritative FlipForge2 backend.

The browser does not calculate, grant, extend, reset, or override evaluation allowance.

## Server-owned outcomes

The Netlify gateway preserves only two explicit, customer-safe upstream evaluation admission outcomes:

- `429 EVALUATION_LIMIT_REACHED` — the authoritative server says the bounded monthly evaluation allowance is full;
- `403 ENTITLEMENT_ACCESS_DENIED` — the authoritative server says the current tenant entitlement does not permit a new evaluation.

All other unrecognized upstream rejections continue through the generic safe rejection envelope.

The gateway does not return arbitrary backend error text.

## Retry-After

For a valid upstream `429`, the gateway may preserve `Retry-After` only when it is a bounded numeric value.

The browser cannot generate or alter the reset time.

## Evaluate workspace

The customer Evaluate screen now distinguishes:

- authentication failure;
- Netlify signed-membership failure;
- server-owned entitlement denial;
- server-owned monthly quota exhaustion;
- idempotency conflict;
- other safe failures.

Quota exhaustion directs the tester to **Plan & Usage** to review server-owned usage.

There is no browser override, fake result, automatic upgrade, checkout action, or payment control.

## Plan & Usage

When the backend returns the v15.06 usage fields, Plan & Usage displays:

- completed evaluations;
- in-progress reservations;
- admission usage;
- monthly allowance;
- remaining allowance.

For bounded plans, the progress meter uses admission usage because an in-progress evaluation temporarily reserves one slot to prevent concurrent overshoot.

Failed evaluations release their reservation. Completed idempotent replays do not consume another slot.

If an older compatible entitlement response lacks reservation fields, the UI safely falls back to completed usage rather than inventing a reservation.

## Private Beta

**Private Beta remains unbounded** by Scout / Collector / Pro commercial monthly limits during the current invitation-only beta.

Private Beta is still not represented as a paid plan.

## Billing boundary

This phase **does not connect billing** and does not create:

- checkout;
- upgrade/downgrade controls;
- card or bank entry;
- refunds;
- invoices;
- customer plan mutation;
- paid-plan activation.

Collector and Pro remain unavailable as active paid plans until a separately approved trusted billing integration exists.

## Identity and secret boundary

The browser never sends a raw tenant identifier or backend service token.

The gateway continues to derive tenant membership from signed app metadata and adds the trusted tenant header and service token only on the server-side upstream request.

Quota and entitlement error responses expose neither value.

## Authority boundary

The server remains authoritative. The **browser cannot override** quota, entitlement, Smart Opportunity, evidence, PSA, or transaction decisions.

This phase does not:

- change Smart Opportunity recommendation logic;
- change existing PSA intelligence;
- accept evidence;
- verify card identity;
- authorize a bid, purchase, payment, listing, or sale;
- activate staging or production.

## Validation

Run:

```bash
npm run validate:evaluation-quota-boundary
```

The validator proves:

- the gateway preserves the safe 429 quota code;
- the gateway preserves the safe 403 entitlement code;
- arbitrary upstream error text is stripped;
- numeric Retry-After is preserved for quota exhaustion;
- raw tenant identity and service token remain server-side;
- signed membership failures remain distinct from entitlement failures;
- the customer Evaluate screen points quota exhaustion to Plan & Usage;
- Plan & Usage renders in-progress reservation and admission usage when provided;
- no browser quota override or payment control is introduced.

Backend quota enforcement must merge before this customer surface.
