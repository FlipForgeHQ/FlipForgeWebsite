# Phase 7 Day-0 Proof Capture

Bulk Evaluate preserves the authoritative evaluation request ID returned for each successful row so a completed 25-card Day-0 batch can be handed to the private proof-cohort operator without copying IDs manually from logs or SQLite.

## Locked proof handoff

The **Download Day-0 proof IDs** control remains disabled unless all of the following are true:

- the CSV is explicitly tagged `FF_25_CARD_PROOF_V1`;
- exactly 25 rows are present;
- all 25 card identities resolved through the authenticated server-owned Card Intelligence search/resolve boundary before Day-0 evaluation began;
- every row completed successfully through `/api/v1/evaluations`;
- every completed response returned the same authoritative request ID sent as the row's idempotency key;
- the CSV sport labels resolve to the pre-registered Phase 7 allocation: 7 MLB, 6 NFL, 6 NBA, 6 NHL.

The export is JSON and includes the 25 request IDs plus resolved card identity, external listing ID, original decision, confidence, risk, exact trusted comp count, sport label, and identity-preflight provenance for audit/reconciliation.

## Identity-first proof behavior

The Phase 7 template activates a proof-only preflight before any Day-0 evaluation request is submitted.

For each of the 25 rows, FlipForge:

1. searches the authenticated `/api/v1/card-intelligence/search` route using the proposed card identity;
2. requires exactly one selectable exact-card candidate;
3. resolves that opaque selection token through `/api/v1/card-intelligence/resolve`;
4. requires `readyForEvaluation=true` and a non-blank resolved card identity;
5. replaces the typed identity with the server-resolved identity for the Day-0 evaluation.

If any one of the 25 rows is ambiguous or cannot resolve, the proof preflight stops and **no Day-0 evaluations are submitted**. The row must be corrected and a new Phase 7 CSV uploaded.

This prevents the proof study from bypassing FlipForge Identity Intelligence just because the cards are being evaluated in bulk.

Normal Bulk Evaluate is unchanged: the identity preflight runs only for a 25-row CSV explicitly tagged with the Phase 7 proof-study version.

## Source-of-truth boundary

The browser export is explicitly `auditExportOnly`. Authoritative cohort membership remains in FlipForge SQLite and is created only through the private backend `SaaSProofCohortOperator create25` path.

Bulk Evaluate does not call a proof-cohort endpoint, does not receive tenant headers or service credentials, and cannot edit a frozen cohort.

## Authority preserved

- Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- Card Intelligence preflight performs identity assistance only and is required to report no evidence acceptance, Smart Opportunity recalculation, provider payload persistence, or transaction authority.
- The page submits completed rows sequentially to the existing evaluation endpoint only after the entire Phase 7 identity preflight succeeds.
- The page performs no browser-side scoring, evidence acceptance, or recommendation changes.
- No accuracy claim, self-training authority, billing authority, or transaction authority is added.

## Phase 7 template

The Phase 7 template contains exactly 25 proof-tagged sport slots in the locked 7/6/6/6 allocation. Listing ID, proposed card identity, URL, and price remain blank so the real Day-0 opportunities are selected prospectively and completed against live listings rather than fabricated in the repository.
