# Phase 7 Day-0 Proof Capture

Bulk Evaluate preserves the authoritative evaluation request ID returned for each successful row so the completed 25-card Day-0 batch can be reconciled back to the exact SHA-256-locked listing selection before immutable proof-cohort creation.

## Locked proof handoff

The **Download Day-0 proof IDs** control remains disabled unless all of the following are true:

- the CSV is explicitly tagged `FF_25_CARD_PROOF_V1`;
- exactly 25 rows are present;
- all 25 card identities resolved through the authenticated server-owned Card Intelligence search/resolve boundary before Day-0 evaluation began;
- every row completed successfully through `/api/v1/evaluations`;
- every completed response returned the same authoritative request ID sent as the row's idempotency key;
- the CSV sport labels resolve to the pre-registered Phase 7 allocation: 7 MLB, 6 NFL, 6 NBA, 6 NHL.

The export is JSON and includes the 25 request IDs plus resolved card identity, external listing ID, original decision, confidence, risk, exact trusted comp count, sport label, and identity-preflight provenance for audit/reconciliation.

## Day-0 selection must already be hash-locked

Before Bulk Evaluate begins, the approved Phase 7 path requires:

1. one governed 25-of-25 JSON selection from the private backend selector;
2. the SHA-256 of that exact saved JSON to be recorded;
3. the Bulk Evaluate CSV to be produced only with `SaaSProofDay0ListingSelectionOperator export-locked` against that exact fingerprint;
4. no second marketplace selection after the accepted JSON is fingerprinted.

For the currently accepted V1 selection, the recorded SHA-256 is:

`0c9373ea0619a44d8168ecfc10e28d8c8bae5aeb66dc5458141d0f7b36b30c1f`

The browser proof-ID export does not replace that selection authority. It supplies the immutable evaluation request IDs that must later be bound back to the locked selection.

## Identity-first proof behavior

The Phase 7 proof-tagged CSV activates a proof-only preflight before any Day-0 evaluation request is submitted.

For each of the 25 rows, FlipForge:

1. searches the authenticated `/api/v1/card-intelligence/search` route using the proposed card identity;
2. requires exactly one selectable exact-card candidate;
3. resolves that opaque selection token through `/api/v1/card-intelligence/resolve`;
4. requires `readyForEvaluation=true` and a non-blank resolved card identity;
5. replaces the typed identity with the server-resolved identity for the Day-0 evaluation.

If any one of the 25 rows is ambiguous or cannot resolve, proof preflight stops and **no Day-0 evaluations are submitted**. The row must be corrected without changing the pre-registered selection rule or cherry-picking based on a recommendation or later outcome.

Normal Bulk Evaluate remains unchanged: this identity preflight runs only for a 25-row CSV explicitly tagged with the Phase 7 proof-study version.

## Final source-of-truth boundary

The browser export is explicitly `auditExportOnly`. It cannot create or mutate proof-cohort membership.

The real `FF_25_CARD_PROOF_V1` cohort must be frozen with the private backend:

`SaaSProofDay0CohortFreezeOperator freeze25`

That operator requires:

- the original saved 25-of-25 selection JSON;
- its recorded SHA-256;
- exactly 25 distinct completed evaluation request IDs;
- the authoritative SQLite database.

Before creating the cohort, it independently verifies that every saved evaluation snapshot matches exactly one locked selection row by marketplace, external listing ID, and Day-0 all-in ask. Hash mismatch, selection tampering, listing substitution, ask changes, duplicate request IDs, missing rows, or cross-tenant snapshots fail closed.

A successful final freeze reports `phase7LockedSelectionVerified=true`, the exact `phase7LockedSelectionSha256`, `phase7VerifiedRequestCount=25`, `memberCount=25`, and `day0SnapshotCount=25`.

The lower-level `SaaSProofCohortOperator create25` is not the approved final-freeze path for this real V1 study because it does not independently bind request IDs back to the hash-locked Day-0 selection.

## Authority preserved

- Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- Card Intelligence preflight performs identity assistance only and is required to report no evidence acceptance, Smart Opportunity recalculation, provider payload persistence, or transaction authority.
- The page submits completed rows sequentially to the existing evaluation endpoint only after the entire Phase 7 identity preflight succeeds.
- The page performs no browser-side scoring, evidence acceptance, or recommendation changes.
- Final proof freeze performs no marketplace search and creates no evidence, recommendation, grading, billing, accuracy-claim, self-training, or transaction authority.
