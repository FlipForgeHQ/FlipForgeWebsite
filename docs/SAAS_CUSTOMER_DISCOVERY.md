# FlipForge SaaS Customer Discover

## Purpose

The private-beta Discover workspace connects the existing SaaS shell to the authoritative provider-backed active-listing search introduced in FlipForge2. It does not create a browser recommendation engine, a second evidence authority, or a provider administration surface.

## Customer path

1. The signed-in tester enters one exact card identity, an optional target maximum buy, and a bounded result limit.
2. The browser checks the same-origin gateway health contract.
3. `POST /api/v1/discover` is sent through the existing Netlify gateway with same-origin credentials. The browser sends no tenant header, user header, provider credential, service token, or authority override.
4. The authoritative service returns active-listing candidates ranked by the existing discovery/evidence context.
5. The customer reviews active asking cost, listing freshness, connected-source rank, and existing trusted completed-sale context.
6. No Discover search or result is saved.
7. The customer must explicitly click **Evaluate with Smart Opportunity** for a candidate that contains the minimum evaluator-safe fields.
8. The browser reconstructs an allowlisted evaluation payload and sends it to the existing `POST /api/v1/evaluations` route with a fresh idempotency key.
9. Only a contract-valid authoritative evaluation may navigate to the newly saved tenant-owned opportunity.

## Display boundary

The interface uses the terms **Discovery score** and **Best connected candidate**. It explicitly states that:

- the score is not `BUY / WATCH / VERIFY / PASS`;
- best candidate means best among currently connected returned sources, not the entire market;
- an active listing is not a sold comp;
- asking prices never become completed-sale evidence;
- Smart Opportunity evaluation is a separate explicit action.

## Provider boundary

The browser accepts only customer-safe provider metadata:

- provider ID/name;
- automated/available state;
- customer-safe availability status.

The response contract rejects provider setup actions and requires `providerCredentialsExposed=false` and `customerCanConfigureProvider=false`.

## Evaluation handoff boundary

Before evaluation, the browser rebuilds the payload from these allowlisted fields only:

- external listing ID;
- marketplace;
- exact card identity;
- listing URL;
- seller;
- item price cents;
- shipping cents;
- buyer premium cents;
- tax cents;
- listing format.

IDs, marketplace values, URLs, text lengths, and integer-cent fields are validated again in the browser. The browser cannot forward a recommendation, confidence/value override, tenant ID, evidence acceptance, provider credential, grading authority, or transaction instruction from a Discover result.

## Fail-closed behavior

- Disabled bridge: health request only; no provider search and no sample result.
- Provider unavailable: authoritative empty state; no sample result.
- Invalid Discover contract: no candidate actions are rendered.
- Candidate missing evaluator-safe fields: Evaluate control is disabled/refused.
- Invalid authoritative evaluation contract: no navigation to a saved opportunity.
- Production hostname: the private-beta adapter refuses to activate.

## Validation

Run:

```bash
npm run validate:customer-discovery
```

The validator proves the complete simulated browser path from health → Discover POST → active-listing result → explicit evaluation POST → saved tenant-owned opportunity navigation, while retaining gateway, Identity, private-beta, lifecycle, Decision Dossier, visual, and brand validation.

## Production boundary

The tracked gateway remains environment-gated and the customer adapter remains deploy-preview/local only. This phase does not activate production traffic, expose provider credentials, add billing, or create transaction authority.
