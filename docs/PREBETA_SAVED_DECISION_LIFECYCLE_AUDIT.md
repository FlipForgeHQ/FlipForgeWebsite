# FlipForge Pre-Beta Destructive Saved-Decision Lifecycle Audit

## Purpose

This is the second destructive pre-beta workflow layer.

Layer 1 (`PREBETA_CUSTOMER_STATE_AUDIT.md`) attacks Discover, identity resolution, repeated search state, and the explicit evaluation handoff. This layer begins once an authoritative Smart Opportunity record exists and attacks what happens next:

**Saved decision -> Understand -> Track -> change lifecycle state -> revisit -> Decision Dossier export**

The goal is to catch state bleed, stale writes, route races, cross-record substitution, duplicate lifecycle mutations, and stale exports before a beta tester can create them in production.

## Locked product boundaries

Every scenario must preserve these rules:

- Smart Opportunity remains the recommendation authority.
- Existing PSA intelligence remains the grading-guidance authority.
- Saved decisions and lifecycle records are tenant-owned server state; the browser never invents a replacement record.
- Lifecycle writes record customer workflow facts only. They do not rescore, rerank, verify evidence, predict a grade, or alter BUY / WATCH / VERIFY / PASS.
- Optimistic `expectedVersion` protection must reject stale lifecycle writes.
- A rejected lifecycle write must not append history or change the authoritative snapshot.
- A completed save may not repaint a route the customer has already left.
- Record A may never leak into record B after selector or route changes.
- Decision Dossier must re-read the governed opportunity, evidence, PSA, and lifecycle sources for the selected record.
- A prepared dossier must not silently survive a later lifecycle change as though it were current.
- No lifecycle or export path gains transaction authority.
- The browser never supplies tenant/user identity headers.

## Automated destructive matrix

| # | State transition | Required behavior | Severity if broken |
|---|---|---|---|
| 1 | Saved Decisions -> exact Card Intelligence detail | Selected record only; no cross-record substitution | S1 |
| 2 | Card Intelligence -> Tracking | Exact opportunity ID survives the route transition | S1 |
| 3 | Tracking record A -> record B -> record A | Status, version, and form state are record-scoped | S1 |
| 4 | WATCHING -> incomplete OWNED | Server rejects; snapshot/history remain unchanged | S1 |
| 5 | WATCHING -> valid OWNED | Current `expectedVersion` is used; exactly one event is appended | S1 |
| 6 | Double submit during slow lifecycle save | One authoritative PUT only | S2 |
| 7 | Browser version stale vs newer server version | 409 conflict fails closed; newer server state survives | S1 |
| 8 | Save in flight -> navigate to Card Intelligence | Old save completion cannot repaint Tracking over the new route | S1 navigation-race |
| 9 | Leave Tracking -> revisit exact record | Latest persisted version/status reloads | S1 |
| 10 | Latest lifecycle -> Decision Dossier | Export re-reads complete governed source set and creates SHA-256 digest | S1 |
| 11 | Prepare dossier -> change lifecycle -> return to export | Old digest is discarded; rebuilt dossier reflects new state | S1 |
| 12 | Export record A -> record B | Opportunity/evidence/PSA/lifecycle sources remain one-record coherent | S1 |
| 13 | Inspect lifecycle/export traffic | No tenant/user headers, recommendation authority, or transaction authority supplied by browser | S1 |

## CI implementation

Workflow: `.github/workflows/prebeta-saved-decision-lifecycle-audit.yml`

The workflow:

1. checks out the exact PR/main commit;
2. builds the production customer-app assets;
3. runs the existing customer intelligence, lifecycle, and export contract validators;
4. installs Playwright Chromium;
5. serves the app at the production `/app/` path;
6. runs `scripts/audit-prebeta-saved-decision-lifecycle-ci.mjs`;
7. uploads `qa-artifacts/prebeta-saved-decision-lifecycle/saved-decision-lifecycle-audit.json` for 30 days.

The SaaS Beta Complete gate also runs `validate-prebeta-saved-decision-lifecycle-audit.mjs`, so removing or disconnecting this layer breaks the release gate.

## Release policy

- **S1 failures block merge/release.**
- Reproducible S2 failures block beta expansion until fixed or explicitly waived in a release record.
- S3 cosmetic findings can be scheduled only when they do not hide a state, authority, or data-integrity defect.
- Green CI is necessary but not sufficient. Signed-in production QA is still required for the exact deployed commit.

## Why the navigation-race test is S1

A lifecycle save is asynchronous. The customer is free to leave Tracking while that request is still in flight. When the response returns, the old request must not regain control of `#main-content` and overwrite Card Intelligence, Export, or another route. Route ownership must always beat stale async completion.

## Regression rule

Every real saved-decision, tracking, lifecycle, or export state bug must be reproduced in this matrix before the defect is closed. The fix is not complete until the new destructive scenario passes and remains wired into CI.

## Combined pre-beta coverage

Together, the two destructive layers now cover:

**Find exact card -> Discover -> explicit Evaluate -> saved Smart Opportunity -> Card Intelligence -> Tracking -> lifecycle update -> revisit -> Decision Dossier**

They do not replace backend Java authority tests, SQLite integration tests, signed-in production QA, or the 100 + 20 CardSight audit. They are the browser-state regression layer that attacks how customers move between those governed systems.
