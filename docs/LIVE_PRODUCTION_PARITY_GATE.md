# Live Production Parity Gate

## Purpose

GitHub `main`, a successful CI run, and the Netlify production deployment are separate states. This gate verifies that the public production manifest is serving the exact `main` commit being evaluated before signed-in Beta Complete QA proceeds.

## Contract

The verifier reads `https://goflipforge.com/deploy-meta.json` and requires:

- `context=production`;
- `production=true`;
- `branch=main`;
- `commitRef` exactly equals the GitHub Actions commit SHA;
- `appBoundary=PRODUCTION_SERVER_OWNED_FAIL_CLOSED`;
- `productionDiagnosticsSeparated=true`;
- `recommendationAuthority=Smart Opportunity`;
- `gradingAuthority=Existing PSA intelligence`;
- `browserRecommendationAuthority=false`;
- `transactionAuthority=false`.

The existing deploy-manifest allowlist validation also remains authoritative.

## Deployment convergence

Netlify can finish after the GitHub `push` event. The workflow therefore retries the public manifest for up to ten minutes before declaring the deployment stale. It does not accept a previous production commit as proof for a newer `main` commit.

## Safety boundary

The check is public and read-only. It uses no Netlify token, customer credential, provider credential, tenant identifier, service token, or production secret. It does not sign in, mutate production state, activate billing, or replace the controlled signed-in production QA required by `docs/SAAS_BETA_COMPLETE_LIVE_QA.md`.

## Result meaning

- **PASS:** public Netlify production reports the exact GitHub commit and locked authority boundary.
- **FAIL:** production is stale, unreachable, malformed, on the wrong branch/context, or reports authority drift.

A PASS establishes source/deployment parity only. Beta Complete still requires the governed signed-in customer-path QA and retained correctness checks.
