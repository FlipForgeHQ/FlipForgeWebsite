# FlipForge SaaS Customer Decision Dossier

## Scope

This phase adds an audit-safe, tenant-owned export workspace to the existing private-beta application. It does not create another recommendation engine, grading authority, data store, provider connection, billing system, or transaction path.

## Export contract

The browser reads the existing same-origin customer API only after gateway health reports `configured`. One complete dossier requires all four sources to match the same tenant-owned saved opportunity ID:

1. saved Smart Opportunity record;
2. governed evidence ledger;
3. saved PSA guidance with `recalculated=false`;
4. customer lifecycle snapshot and append-only history.

If any source is missing, mismatched, oversized, invalid, unauthorized, or contract-incompatible, the export fails closed. No partial dossier or mock replacement is produced.

## Integrity

The browser creates a deterministic JSON payload and calculates a SHA-256 digest with Web Crypto. The download contains the payload and a manifest that records the digest, schema version, selected opportunity ID, generation time, and `partialExport=false`.

SHA-256 detects payload changes. It is not a digital signature and does not prove who created or received the file.

The CSV download is a human-readable summary. It includes the same payload digest and one row for each returned lifecycle event. JSON remains the complete export.

## Security and privacy boundaries

- Authentication uses secure same-origin Identity cookies.
- Tenant and user identity are injected only by the trusted gateway.
- The browser sends no tenant header, user header, service token, provider credential, or authority override.
- Export preparation uses memory only; no dossier is written to local storage, session storage, cookies, or a new database.
- Downloads remain on the tester's device unless the tester shares them.
- Correlation IDs are used for source requests but raw authentication claims and secrets are not exported.

## Authority boundaries

Smart Opportunity remains the sole recommendation authority. Existing PSA intelligence remains the sole grading-guidance authority. SQLite remains the source of truth.

The dossier does not rescore, rerank, accept evidence, predict a grade, calculate current portfolio value or performance, or authorize a bid, purchase, listing, offer, checkout, payment, or transfer. Supported value remains saved decision-support context, not guaranteed sale proceeds.

## Environment boundary

The export route runs only on approved deploy previews and local development. Production remains unchanged and disabled. When the preview bridge is disabled, the route performs the public health request only and creates no sample export.

## Validation

Run:

```powershell
node .\scripts\validate-saas-customer-export.mjs
```

The Netlify build runs this gate with the retained Identity, account, Dashboard, Evaluate, Card Intelligence, Compare, management, lifecycle, private-beta, gateway, tenant, staging, prototype, visual, and brand suites.
