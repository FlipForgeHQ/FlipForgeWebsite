# FlipForge SaaS Customer Portfolio Reference Value

## Purpose

The private-beta Portfolio combines tenant-owned lifecycle holdings with already-governed saved exact-card completed-sale evidence. It does not create a second recommendation engine, evidence authority, grading authority, portfolio database, pricing oracle, or transaction system.

Smart Opportunity remains the sole `BUY / WATCH / VERIFY / PASS` authority.

## Customer path

1. The signed-in tester opens Portfolio.
2. The browser checks the same-origin private-beta health contract.
3. The browser reads `GET /api/v1/portfolio` and `GET /api/v1/opportunities` with same-origin credentials.
4. The server returns tenant-owned `OWNED` lifecycle records, customer-entered acquisition cost, evidence-reference coverage, and server-calculated reference performance where eligible.
5. The browser formats the returned cents and percentages. The browser formats server-returned values and does not calculate a replacement value, reference delta, recommendation, or appraisal.

## Reference-value evidence gate

An evidence-supported reference value is available only when the authoritative backend confirms all of the following:

- exact-card provider identity is confirmed;
- at least **3 accepted exact completed sales** are saved;
- the accepted-sale average is positive;
- the latest accepted sale date is valid and is no more than **30 days old**;
- the latest accepted sale date is not in the future.

The method is `AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES` over already-governed saved evidence.

Active listings and asking prices are never used as completed-sale reference-value inputs.

If any gate fails, the holding remains visible with cost basis but the reference value stays unavailable with the server-returned reason.

## Performance boundary

Reference performance is available only when the same holding has both:

- an eligible evidence-supported reference value; and
- a positive customer-entered acquisition cost.

The authoritative server returns the unrealized reference delta and percent. The browser does not recalculate them.

Reference performance is not realized gain/loss. It excludes:

- marketplace and payment fees;
- shipping and insurance;
- taxes;
- liquidation discounts;
- sale timing and negotiation;
- any guaranteed proceeds assumption.

## Coverage-aware totals

Portfolio never extrapolates value across uncovered holdings.

- `coveredReferenceValueCents` includes only holdings with eligible reference values.
- `coveredCostBasisCents` and `coveredReferenceDeltaCents` include only holdings with eligible reference performance.
- whole-portfolio reference value remains null unless every owned holding has eligible reference coverage.
- whole-portfolio reference delta remains null unless every owned holding has eligible reference performance.

The interface explicitly distinguishes **partial coverage** from **complete coverage**.

## Browser and identity boundary

The Portfolio adapter:

- runs only on deploy-preview/local private-beta hosts;
- sends no trusted tenant or user header;
- sends no service token or provider credential;
- uses same-origin credentials and no-store requests;
- persists no Portfolio state in browser storage;
- validates Smart Opportunity and existing PSA authority provenance;
- rejects contract responses that allow active-listing contamination, valuation persistence, appraisal status, or transaction authority.

Tenant identity remains a trusted gateway responsibility.

## Production boundary

Production activation remains a separate explicit decision. This phase does not enable the production gateway, provision provider credentials, make a live provider call from the browser, add billing, or authorize any transaction.

## Validation

Run:

```bash
npm run validate:customer-portfolio
```

The validator proves a mixed-coverage browser scenario: one fresh evidence-supported holding and one stale holding. It verifies that FlipForge renders the eligible reference and server-returned performance while refusing a fabricated whole-portfolio total for the uncovered holding.
