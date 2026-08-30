# FlipForge SaaS Beta Complete — Live Customer QA

Status: **LIVE PROOF REQUIRED**

This checklist is the final customer-facing proof for the locked Core Platform Definition of Done in `docs/SAAS_CORE_PLATFORM_COMPLETION_PLAN.md`.

A green static/CI gate is a prerequisite. It does **not** by itself declare FlipForge Beta Complete. Beta Complete requires one controlled, signed-in production customer session on `goflipforge.com/app/` that proves the end-to-end workflow below and records any defects found.

## Safety rules for the QA session

- Use an invited FlipForge customer account with an active tenant membership.
- Never paste or record service tokens, provider credentials, Paddle secrets, webhook secrets, raw JWTs, tenant IDs, or database contents in the QA evidence.
- Do not alter production environment variables, database seed state, disaster-recovery state, or billing activation switches during this product QA.
- Paid checkout and customer portal activation are out of scope until the core platform is Beta Complete.
- A provider outage or unavailable source must render an honest unavailable/error state; it must never be replaced with fabricated listing or sold data.
- An active marketplace listing must never be represented as a completed sale.
- Smart Opportunity remains the sole BUY / WATCH / VERIFY / PASS authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- No step may authorize a bid, purchase, listing, payment, or sale.

## Evidence record

For each step record only:

- date/time;
- browser + viewport class (`desktop`, `tablet`, or `mobile`);
- route tested;
- PASS / FAIL / BLOCKED;
- short defect description if not PASS;
- non-sensitive screenshot if useful;
- GitHub issue/PR number for any fix.

Do not record account email, raw request headers, tenant identifiers, auth cookies, or secrets.

## Locked production identities — 2026-08-30

Website production:
- repository: `FlipForgeHQ/FlipForgeWebsite`
- branch: `main`
- commit: `665cd8694708387d66b40c89d54b5786b1465bf8`
- context: `production`
- appBoundary: `PRODUCTION_SERVER_OWNED_FAIL_CLOSED`
- productionDiagnosticsSeparated: `true`
- recommendationAuthority: `Smart Opportunity`
- gradingAuthority: `Existing PSA intelligence`
- browserRecommendationAuthority: `false`
- transactionAuthority: `false`

Java production service:
- service: `flipforge-saas-production`
- repository: `FlipForgeHQ/FlipForge2`
- branch: `main`
- commit: `e46c4b7dbcf0137e8f81edd8b636485c70f70cb0`
- commit identity: `Map quality-blocked high-edge signals to VERIFY (#365)`

Do not infer a different Java production commit from repository `main`; the identity above is the actual running Render service reported by its environment.

## Customer clarity acceptance

The live signed-in experience must preserve the current customer-first hierarchy:

- Card Intelligence leads with **Decision → Value → Risk → Why → Evidence**.
- Evaluate presents **Card → Cost → Decision**.
- Saved Evaluate result leads with **Decision → Supported Value → All-in Cost → Risk → Why → What to do next**.
- BUY / WATCH / VERIFY / PASS have consistent plain-language meanings across the signed-in product and public explanation.
- Advanced/raw scores and authority detail remain available without dominating the first view.
- A tester can answer within roughly 10 seconds: **What does FlipForge recommend? Why? What would you do next?**

## 1. Discover an exact card

Route: `/app/#/discover`

**PASS when:**

- the signed-in customer can enter one exact-card query;
- the request runs through the authenticated same-origin customer gateway;
- returned candidates identify their connected source/provider;
- the Discovery score is clearly separate from BUY / WATCH / VERIFY / PASS authority;
- no search result is persisted as a tenant-owned decision merely by searching;
- an unavailable provider produces an honest unavailable/error state with no sample fallback.

## 2. Inspect the actual marketplace listing

From a provider-returned Discover candidate, open the original marketplace listing.

**PASS when:**

- the source link is the URL returned by the authorized provider;
- the source marketplace/provider is visible before the customer leaves FlipForge;
- FlipForge does not reconstruct or guess the listing URL;
- the listing remains labeled as an active listing, not a sold comp.

If the connected provider returns no source URL for the test record, mark this step **BLOCKED — PROVIDER DID NOT RETURN SOURCE URL**, not failed and not simulated.

## 3. Review decision context before evaluation

On the Discover candidate, verify listing price, evidence context, and limitations.

**PASS when:**

- active-listing price/context is visible without being counted as completed-sale evidence;
- evidence readiness/limitations are understandable;
- no unsupported whole-market claim or fabricated Market Index is shown;
- the next authoritative action is an explicit Smart Opportunity evaluation.

## 4. Evaluate with Smart Opportunity

Route: `/app/#/evaluate` or the Evaluate action from Discover.

**PASS when:**

- the customer can submit listing identity and complete acquisition cost;
- the request is tenant-scoped and idempotent through the same-origin gateway;
- the result is one of BUY / WATCH / VERIFY / PASS from Smart Opportunity;
- successful completion is persisted to SQLite and grants tenant ownership;
- the browser does not verify evidence/identity, recalculate PSA guidance, or authorize a transaction;
- a rejected/invalid request fails closed with useful error copy and no invented result;
- the first view presents **Decision → Supported Value → All-in Cost → Risk → Why → What to do next** before raw scores and implementation detail.

## 5. Open saved Card Intelligence and understand why

Route: `/app/#/opportunities/<saved-id>`

**PASS when:**

- the newly saved record appears in Opportunities;
- Card Intelligence loads the matching tenant-owned record;
- the first view leads with **Decision → Value → Risk → Why → Evidence**;
- Decision details preserve the reasoning trail for identity, evidence, saved market factors, and authority output;
- Evidence distinguishes accepted completed-sale evidence from visible-but-ineligible records;
- Supported Value and Risk are understandable without requiring the customer to interpret raw scores;
- Confidence, Liquidity, numeric Risk, Rank, and deeper authority detail remain available behind progressive disclosure;
- saved PSA guidance is labeled as context and does not predict a grade;
- partial evidence/PSA context fails honestly without fabricated replacement data.

## 6. Track and revisit the card

Route: `/app/#/tracking/<saved-id>`

**PASS when:**

- the customer can save a supported tracking state;
- saved lifecycle state survives a refresh and can be revisited;
- optimistic version protection prevents stale overwrites;
- lifecycle history records the change;
- tracking state does not change Smart Opportunity, evidence eligibility, PSA guidance, or transaction authority.

## 7. Exercise acquisition / pass / sold lifecycle rules

Use the same test record or a disposable tenant-owned QA record.

**PASS when:**

- `OWNED` requires acquisition facts;
- `SOLD` requires acquisition and disposition facts;
- `PASSED` can be recorded without pretending a transaction occurred;
- invalid state/fact combinations are rejected clearly;
- lifecycle history remains append-only from the customer perspective.

Do not enter fabricated financial facts into a record that is intended to represent a real holding. Use a clearly designated QA record for transition testing.

## 8. Validate supporting customer workspaces

Test: Compare, Evidence, PSA Advisor, Portfolio, Alerts, Sell/Exit Review, Audit Export, Forge Heat, and Plan & Usage.

**PASS when:**

- Compare uses saved authoritative records and does not invent a winner;
- Evidence preserves completed-sale eligibility boundaries;
- PSA Advisor displays existing saved guidance only;
- Portfolio shows customer-recorded cost basis/holdings without inventing current value, profit, fees, taxes, or liquidation value;
- Alerts show persisted in-app review rules and clearly disclose that email/SMS/push delivery is not connected where unavailable;
- Sell/Exit Review provides decision support without sale/listing execution authority;
- Audit Export/Decision Dossier is complete when offered and does not silently produce a partial authoritative record;
- Forge Heat remains a presentation over saved evidence-qualified evaluations and does not become a second recommendation authority;
- production Plan & Usage shows server-owned access/usage and keeps checkout disabled/deferred until Beta Complete.

## 9. Loading, empty, unavailable, auth, and error states

For at least one route in each major workflow family, exercise or inspect:

- loading state;
- no-data/empty state;
- 401 signed-out state;
- inactive/missing membership 403 state where practical with an approved test account;
- provider/gateway unavailable state where safely reproducible;
- malformed/invalid customer input;
- stale lifecycle write/version conflict.

**PASS when:** every state explains what happened, offers a safe next action where appropriate, and never substitutes mock/fabricated customer intelligence.

## 10. Desktop and responsive usability

Run the core loop on:

- desktop viewport;
- narrow/tablet viewport;
- mobile viewport.

**PASS when:**

- primary navigation remains reachable;
- tables/cards/forms do not materially clip or overlap;
- primary actions remain usable by keyboard and pointer;
- focus is visible;
- important authority/source/error copy remains readable;
- no route becomes unusable because of horizontal overflow or hidden controls;
- Guided Mode remains contained and does not obscure the primary decision/result.

## 11. Customer comprehension

After a real saved evaluation is displayed, do not coach the tester before asking:

1. What does FlipForge recommend?
2. Why did it reach that decision?
3. What would you do next?

**PASS when:** the tester can answer all three correctly from the first-view experience within roughly 10 seconds without needing raw-score interpretation or architecture knowledge.

## Retained correctness regression set

Do not manufacture a BUY, alter evidence, rewrite identity, or change authority merely to make a scenario pass.

- [ ] Exact base card — representative target such as `2018 Topps Chrome Shohei Ohtani #150 PSA 9`; exact base evidence only.
- [ ] Exact plain Refractor/parallel — no base or neighboring-parallel sold-evidence borrowing.
- [ ] Wrong grade isolation — no silent grade normalization or inherited target value authority.
- [ ] Wrong parallel isolation — mismatched parallel cannot support target value.
- [ ] Missing/ambiguous/conflicting card number — fail closed or require identity resolution; no silent choice.
- [ ] Insufficient evidence — no fabricated supported value; VERIFY/evidence-required behavior when appropriate.
- [ ] Overpriced listing — strong identity/evidence alone must not force BUY.
- [ ] Naturally favorable listing, if available — observe Smart Opportunity output; do not force a BUY expectation.

## Final Beta Complete decision

FlipForge may be marked **CORE PLATFORM BETA COMPLETE** only when all of the following are true:

1. the `SaaS Beta Complete Gate` GitHub Actions workflow is green on the exact Website `main` candidate being evaluated;
2. the live Netlify production manifest matches Website commit `665cd8694708387d66b40c89d54b5786b1465bf8`;
3. the running Render Java service identity is `flipforge-saas-production` / `FlipForgeHQ/FlipForge2` / `main` / `e46c4b7dbcf0137e8f81edd8b636485c70f70cb0` for this QA session;
4. steps 1–11 above are PASS, except a provider-dependent source-link step may be BLOCKED only when the authorized provider itself did not return that capability and the UI disclosed the limitation honestly;
5. the retained correctness regressions show no authority contamination;
6. no Severity 1 or Severity 2 customer-workflow defect remains open;
7. no unresolved defect violates tenant isolation, authentication, evidence authority, grading authority, secret handling, or zero-transaction-authority rules.

Only after that decision should the separate paid-billing launch work resume.
