# FlipForge Pre-Beta Destructive Customer-State Audit

## Purpose

This audit exists to find workflow/state defects before a beta tester finds them in production.

It is intentionally different from a happy-path smoke test. A happy-path test proves that one clean customer flow works. This audit attacks the transitions between flows: changing the card, changing the grade, retrying after an error, refreshing, navigating away and back, superseding an identity choice, and submitting while a request is already in flight.

The audit is release-blocking for customer-state regressions. It does not replace signed-in production QA; it reduces how many defects should survive long enough to require that QA.

## Locked product boundaries

Every scenario must preserve these boundaries:

- Discover is active-listing discovery only.
- Active listings are not completed-sale evidence.
- Smart Opportunity remains the only BUY / WATCH / VERIFY / PASS authority.
- Identity must fail closed when exact card identity is not confirmed.
- A declared grader/grade must not disappear, mutate, or leak into the next search.
- An old card number, player, selection token, result limit, or target max buy must not leak into the next search.
- Excluded identity-review results are never evaluation-eligible.
- The browser never supplies tenant/user identity headers.
- No browser path gains transaction authority.

## Automated destructive matrix

The browser audit in `scripts/audit-prebeta-customer-state-ci.mjs` runs the following scenarios against the built customer app with synthetic server contracts.

| # | State transition | Required behavior | Severity if broken |
|---|---|---|---|
| 1 | Imperfect identity -> exact identity -> Discover | Marketplace search waits for explicit server-authorized selection | S1 |
| 2 | PSA 10 results -> type PSA 9 in same field | Search actions re-arm without `+ New card`; PSA 10 cannot leak | S1 |
| 3 | Ohtani -> Acuna | Previous player/card state is replaced | S1 |
| 4 | Completed search -> Refresh results | Exact completed query repeats unchanged | S2 |
| 5 | No results -> different search | Empty state cannot trap the customer | S2 |
| 6 | Graded search -> ungraded search | Previous grader/grade is cleared | S1 |
| 7 | Identity assist open -> customer changes card -> selects | Old selection token is invalidated; only new token may resolve | S1 |
| 8 | Provider error -> retry | Customer input survives; retry remains usable | S2 |
| 9 | Discover -> explicit Evaluate -> return to Discover | Evaluation handoff cannot poison later Discover state | S1 |
| 10 | Same form submitted twice while request is in flight | One coherent Discover request is allowed | S2 |
| 11 | Target max buy / result limit changed between searches | Previous secondary parameters cannot leak | S2 |
| 12 | Card #150 -> #151 | Previous card number cannot survive | S1 |
| 13 | Browser API boundary inspection | No tenant/user identity headers or recommendation/transaction-authority fields | S1 |

## CI implementation

Workflow: `.github/workflows/prebeta-customer-state-audit.yml`

The workflow:

1. checks out the exact PR/main commit;
2. builds the production customer-app assets;
3. installs Chromium through Playwright;
4. starts the local app at the production `/app/` path;
5. runs the deterministic Discover/static contract validators;
6. runs the destructive browser state matrix;
7. saves `qa-artifacts/prebeta-customer-state/customer-state-audit.json` as a CI artifact.

The SaaS Beta Complete static gate also verifies that this audit script, documentation, package command, and CI workflow remain present and connected. Removing the audit therefore breaks Beta Complete rather than silently reducing coverage.

## Release rule

- Any S1 failure blocks merge/release.
- Any reproducible S2 workflow failure blocks beta expansion until fixed or explicitly waived in a release record.
- S3 cosmetic findings may be scheduled, but must not hide an S1/S2 state defect.
- Green CI is necessary but not sufficient. Signed-in production QA is still required for the exact deployed commit.

## How to extend the audit

Whenever a real customer-state bug is found, add the exact reproduction sequence to this matrix before closing the defect. That converts a one-time bug into a permanent regression test.

New features should add destructive transitions, not only clean-path tests. At minimum ask:

- What happens when the customer changes their mind halfway through?
- What happens when the previous request fails?
- What happens when a previous result is still visible?
- What happens after navigation away and back?
- What state must be cleared, and what state must be retained?
- What must never be inherited from the prior card?

## Scope after Discover

This first destructive browser gate concentrates on the highest-risk customer-state surface: Discover -> identity -> listing search -> explicit evaluation handoff -> return to Discover. Existing core validators continue to cover Evaluate, saved intelligence, lifecycle, portfolio, compare, evidence and account authority boundaries.

As those surfaces gain richer repeated-edit behavior, the same destructive method should be extended across the full saved-decision lifecycle: Evaluate -> Understand -> Save -> Track -> change lifecycle state -> revisit -> export.
