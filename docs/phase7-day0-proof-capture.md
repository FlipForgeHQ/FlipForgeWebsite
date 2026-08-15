# Phase 7 Day-0 Proof Capture

Bulk Evaluate now preserves the authoritative evaluation request ID returned for each successful row so a completed 25-card Day-0 batch can be handed to the private proof-cohort operator without copying IDs manually from logs or SQLite.

## Locked proof handoff

The **Download Day-0 proof IDs** control remains disabled unless all of the following are true:

- exactly 25 rows are present;
- every row completed successfully through `/api/v1/evaluations`;
- every completed response returned the same authoritative request ID sent as the row's idempotency key;
- the CSV sport labels resolve to the pre-registered Phase 7 allocation: 7 MLB, 6 NFL, 6 NBA, 6 NHL.

The export is JSON and includes the 25 request IDs plus card identity, external listing ID, original decision, confidence, risk, exact trusted comp count, and sport label for audit/reconciliation.

## Source-of-truth boundary

The browser export is explicitly `auditExportOnly`. Authoritative cohort membership remains in FlipForge SQLite and is created only through the private backend `SaaSProofCohortOperator create25` path.

Bulk Evaluate does not call a proof-cohort endpoint, does not receive tenant headers or service credentials, and cannot edit a frozen cohort.

## Authority preserved

- Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- The page still submits rows sequentially to the existing evaluation endpoint.
- The page performs no browser-side scoring, evidence acceptance, or recommendation changes.
- No accuracy claim, self-training authority, billing authority, or transaction authority is added.

## Phase 7 template

The Phase 7 template contains exactly 25 sport slots in the locked 7/6/6/6 allocation. Listing ID, exact card identity, URL, and price are intentionally left blank so the real Day-0 opportunities are selected prospectively and completed against live listings rather than fabricated in the repository.
