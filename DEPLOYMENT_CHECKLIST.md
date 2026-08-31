# FlipForge Production Deployment Checklist

Use this checklist for controlled private-beta Website/SaaS production releases. Repository merge, CI success, deploy completion, live verification, and commercial authorization are separate states.

## 1. Repository and CI

- Merge only an approved `main` pull request with the required authority, identity, evidence, security, prototype-isolation, and responsive visual gates green.
- Record the merge commit SHA.
- Do not treat a Deploy Preview as proof that production has updated.

## 2. Netlify production identity

- Require the `Live Production Parity` GitHub Actions workflow to pass on the exact `main` commit being treated as the production candidate.
- The parity workflow waits for Netlify convergence and then requires live `https://goflipforge.com/deploy-meta.json` to report the exact GitHub `main` commit plus the locked production authority boundaries.
- A stale live commit, malformed manifest, wrong branch/context, missing production boundary, recommendation/grading authority drift, browser recommendation authority, or transaction authority must fail the parity workflow.
- For manual cross-checking, open `https://goflipforge.com/deploy-meta.json` after the production deploy.
- Require `context` = `production`.
- Require `commitRef` to equal the approved Website `main` merge SHA.
- Require `appBoundary` = `PRODUCTION_SERVER_OWNED_FAIL_CLOSED`.
- Require `productionDiagnosticsSeparated` = `true`.
- Require `browserRecommendationAuthority` = `false` and `transactionAuthority` = `false`.
- If the automated parity gate is red or the manifest is missing, stale, malformed, or references a different commit, production parity is **not verified**.

## 3. Production app boundary

- Confirm `/app/` does not expose preview-only `Staging Data` or `Staging Evaluate` navigation.
- Confirm the production Dashboard never displays prototype/mock intelligence before, during, or after an API failure.
- Confirm Dashboard reads the same-origin server-owned health, dashboard, and opportunities contracts and fails closed on authentication, membership, contract, or upstream failure.
- Preserve Smart Opportunity as the sole `BUY / WATCH / VERIFY / PASS` authority and Existing PSA intelligence as the sole grading-guidance authority.

## 4. Controlled private-beta customer path

Using an invited test account, verify the actual production build on desktop, tablet, and mobile:

1. sign in;
2. Discover an exact card/listing where an approved provider is configured;
3. Evaluate through the governed server path;
4. open the saved Card Intelligence / Opportunity record;
5. review Traceback, Evidence, PSA context, Compare, Tracking/lifecycle, and supporting customer workspaces;
6. exercise honest empty, 401/403, unavailable-provider, invalid-contract, and other fail-closed states appropriate to the route.

Do not substitute preview fixtures for this production proof.

## 5. Beta application and commercial boundaries

- Confirm the Private Beta application submits to the same-site server endpoint `/api/beta/applications` and enters the server-side review queue.
- Confirm submission does not create an account or paid subscription.
- Confirm paid checkout remains inactive unless a separately approved commercial launch gate explicitly authorizes it.
- Confirm no customer surface has transaction authority.

## 6. Proof-study preservation

- Do not recreate or modify the frozen `FF-PROOF-25-V1` cohort during a Website deployment.
- Do not rerun Day 7.
- Do not collect Day 14 or Day 30 before the governed due window.
- Do not publish a customer-facing accuracy/performance percentage without separate methodology review and authorization.

## 7. Release record

Record:

- Website merge SHA;
- production `deploy-meta.json` commit SHA;
- `Live Production Parity` workflow result;
- production verification date/time;
- signed-in QA result and tested viewport classes;
- any open S1/S2 blocker;
- whether private-beta expansion is GO or NO-GO.

A release is not considered production-verified until the deployment identity and live customer-path checks above are complete.
