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

The export is `flipforge-phase7-day0-proof-ids.json`. It includes the 25 request IDs plus resolved card identity, external listing ID, original decision, confidence, risk, exact trusted comp count, sport label, identity-preflight provenance, and explicit authority flags for audit/reconciliation.

## Day-0 selection must already be hash-locked

Before Bulk Evaluate begins, the approved Phase 7 path requires:

1. one governed 25-of-25 JSON selection from the private backend selector;
2. the SHA-256 of that exact saved JSON to be recorded;
3. the Bulk Evaluate CSV to be produced only with `SaaSProofDay0ListingSelectionOperator export-locked` against that exact fingerprint;
4. no second marketplace selection after the accepted JSON is fingerprinted.

For the currently accepted V1 selection, the recorded SHA-256 is:

`0c9373ea0619a44d8168ecfc10e28d8c8bae5aeb66dc5458141d0f7b36b30c1f`

The browser proof-ID export does not replace that selection authority. It is the preferred transport handoff for the immutable evaluation request IDs that must be reconciled back to the locked selection.

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

## Preferred final source-of-truth boundary

The browser export is explicitly `auditExportOnly`. It cannot create or mutate proof-cohort membership.

The real `FF_25_CARD_PROOF_V1` cohort is frozen with the private backend:

`SaaSProofDay0CohortFreezeOperator freeze25`

Preferred input is the downloaded proof-ID audit file itself:

```text
java -cp /app/FlipForge.jar com.flipforge2.saas.SaaSProofDay0CohortFreezeOperator freeze25 \
  --tenant <trusted-tenant-context> \
  --database /data/flipforge2.sqlite \
  --selection-file /data/proof/FF_25_CARD_PROOF_V1-day0-selection-YYYYMMDD.json \
  --selection-sha256 0c9373ea0619a44d8168ecfc10e28d8c8bae5aeb66dc5458141d0f7b36b30c1f \
  --proof-export-file /data/proof/flipforge-phase7-day0-proof-ids.json
```

The operator validates the proof-ID file before using it. The approved contract requires:

- `studyVersion=FF_25_CARD_PROOF_V1`;
- `source=identity-preflight-completed-authoritative-bulk-evaluations`;
- `sourceOfTruth=SQLITE`;
- `auditExportOnly=true`;
- exactly 25 member rows and 25 distinct request IDs;
- 7 MLB / 6 NFL / 6 NBA / 6 NHL;
- `identityPreflight.required=true` and `identityPreflight.allResolved=true` from the server-owned search/resolve lane;
- Smart Opportunity as recommendation authority;
- existing PSA intelligence as grading-guidance authority;
- no accuracy-claim, self-training, or transaction authority;
- unique ordered slots and listing IDs;
- verified card identity for every member.

The backend then independently cross-checks every proof-export member against authoritative SQLite and the original locked selection. Slot, sport, external listing ID, and card identity must match the corresponding saved evaluation and locked row; the saved evaluation must also preserve the locked marketplace and Day-0 all-in ask.

The proof-ID file is independently SHA-256 fingerprinted during freeze. A successful final freeze reports:

- `phase7LockedSelectionVerified=true`;
- the exact `phase7LockedSelectionSha256`;
- `phase7ProofIdExportVerified=true`;
- `phase7ProofIdExportSha256=<fingerprint of the downloaded audit file>`;
- `phase7VerifiedRequestCount=25`;
- `memberCount=25`;
- `day0SnapshotCount=25`.

Hash mismatch, selection tampering, proof-export identity-preflight removal, unsafe authority flags, sport drift, listing substitution, card-identity tampering, duplicate request IDs, ask changes, missing rows, or cross-tenant snapshots fail closed.

The lower-level repeated `--request-id` mode remains a controlled fallback, but the proof-ID file is preferred because it eliminates manual transcription and gives the final audit handoff its own recorded fingerprint.

`SaaSProofCohortOperator create25` is not the approved final-freeze path for this real V1 study because it does not independently bind the browser handoff and request IDs back to the hash-locked Day-0 selection.

## Authority preserved

- Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- Card Intelligence preflight performs identity assistance only and is required to report no evidence acceptance, Smart Opportunity recalculation, provider payload persistence, or transaction authority.
- The page submits completed rows sequentially to the existing evaluation endpoint only after the entire Phase 7 identity preflight succeeds.
- The page performs no browser-side scoring, evidence acceptance, or recommendation changes.
- Final proof freeze performs no marketplace search and creates no evidence, recommendation, grading, billing, accuracy-claim, self-training, or transaction authority.
