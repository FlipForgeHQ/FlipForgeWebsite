# Website release batching

**Status: draft, inert.** Nothing changes until the founder completes the rollout steps below. Until then, production keeps deploying from `main` on every merge.

## Why

Netlify charges **15 credits per production deploy**. Deploy previews are free. Usage for the billing period 2026-09-29 to 10-28, read on 2026-10-23:

| Item | Usage | Credits |
| --- | --- | ---: |
| Production deploys | 85 deploys | 1,275 |
| AI inference (Netlify agent in the dashboard; unused by site code) | | 88.6 |
| Compute | | 31.2 |
| Web requests | 152,263 | 30.5 |
| Bandwidth | | 9.3 |
| **Total so far** | | **1,434.5** |

The plan includes 1,000 credits a month, and the previous period used 4,255. Of this period's 85 deploys, 66 came from merges to `main`. The other 19 were manual or repeated deploys. Only 2 of the 66 merges changed nothing that ships, so skipping deploys for "unimportant" files would save almost nothing. The cost comes from deploying on **every** merge.

## How it works

- **Netlify builds production from a `release` branch** instead of `main`. Merges to `main` no longer start a paid build. Pull requests still get free deploy previews.
- **The Release Website workflow** (`.github/workflows/release-website.yml`) moves `release` forward to the latest tested `main`:
  - automatically on weekdays at 22:17 UTC (6:17 PM EDT), only if `main` has changed;
  - on demand, when someone runs the workflow (kind `manual` or `emergency`, with a required reason).
- **Safety rules, enforced by `scripts/ci/release-website.mjs`:**
  - only commits already on `main` can be released;
  - the four required checks (Pre-Beta Security gate, Independent Audit C-L gate, Validate core SaaS Beta Complete static gate, Validate workflow action references) must have succeeded on that commit. A failed re-run is never hidden by an older success;
  - fast-forward only: `release` never moves backwards, and nothing is force-pushed or rewritten;
  - when `release` already equals the target, nothing is pushed and no build starts.
- **After each release**, the workflow waits for Netlify and verifies that `goflipforge.com/deploy-meta.json` reports the released commit on the `release` branch.
- **Tests:** `scripts/validate-website-release-batching.mjs` checks all of this in an offline Git sandbox (16 checks). It runs in the Live Production Parity Static Assurance workflow.

## Current vs batched

| | Current | With release batching |
| --- | --- | --- |
| What starts a production deploy | Every merge to `main`, plus manual redeploys | One scheduled release per weekday (only if `main` changed), plus on-demand releases |
| Production deploys a month | about 100 (85 in the first 25 days of this period) | about 26 (22 weekday releases plus about 4 on demand) |
| Production deploy credits a month | about 1,500 | about 390 |
| Total credits a month (other usage unchanged at about 160) | about 1,660; above the 1,000 included, so extra packs are bought | **about 550; inside the 1,000 included** |
| Estimated extra spend | about $11–38 a month in packs ($5.39 per 500-credit pack, from invoices) | $0 beyond the $9 plan |
| Time from merge to live | Minutes | Up to one working day, or minutes with an on-demand release |
| Verification | Parity check on each `main` merge | Parity check on each release |
| Previews | Free, unchanged | Free, unchanged |

Stopping use of Netlify's in-dashboard AI agent would save about 90 more credits a month. That is independent of this change.

## Emergency release

1. Merge the fix to `main` and let the required checks pass.
2. In GitHub, go to **Actions → Release Website → Run workflow**. Set kind to `emergency` and enter a reason. Leave `ref` as `main`, or give a specific commit on `main`.
3. The workflow releases and verifies production within a few minutes.

The safety checks still apply in an emergency. If the required checks cannot pass and production must change immediately, use **Rollback A** below, or switch batching off (**Rollback C**).

## Rollback procedures

- **A. Instant: republish the previous good deploy.** In Netlify, open **Deploys**, pick the last good production deploy and choose **Publish deploy**. This needs no rebuild and takes seconds. Then fix forward on `main` and run an emergency release. The parity check reports a mismatch until the next release; that is expected.
- **B. Revert a change.** Revert the pull request on `main`, wait for the required checks, then run an emergency release.
- **C. Turn batching off and return to today's behaviour.**
  1. In Netlify, set the production branch back to `main`.
  2. Set the repository variable `WEBSITE_RELEASE_BATCHING` to `disabled`, or delete it.

  Every merge then deploys again, and the main-merge parity check runs again.

The `release` branch is never rewound. A rollback is a Netlify republish or a forward revert, never a force-push.

## Rollout (founder, after review)

1. Merge this pull request. It is inert until steps 2–5.
2. In GitHub, create the `release` branch at the current `main` commit (for example, from the branches page). Alternatively, the first run of the workflow creates it.
3. **Protect `release` before it becomes the production branch.** Today only `main` has rules (ruleset "Protect website main"). Without protection, anyone with write access could push unreviewed code straight to production. GitHub does **not** offer "GitHub Actions" as a ruleset bypass on this repository (checked 2026-10-23), so choose one of these:
   - **Option B, recommended: a deploy key (one secret, needs founder approval).**
     1. Create an SSH key pair.
     2. Add the public half as a **deploy key with write access**: Settings → Deploy keys.
     3. Create the environment **`website-release`**: Settings → Environments. Under **Deployment branches**, choose **Selected branches** and allow only `main`.
     4. Store the private half there as the environment secret **`WEBSITE_RELEASE_DEPLOY_KEY`**.
     5. Create the ruleset for `release`: **Restrict deletions**, **Block force pushes** and **Restrict updates**. Bypass list: **Deploy keys** only.

     With this option, only this workflow, running from `main`, can move `release`. A workflow on any other branch cannot read the environment secret. A person pushing directly is refused.
   - **Option A, no secret: deletions and force pushes blocked.** Create the ruleset for `release` with **Restrict deletions** and **Block force pushes**, and no bypass. Do **not** tick Restrict updates, because the workflow token would then be refused too.

     The release script still only moves `release` forward to commits on `main`. But anyone with write access to the repository, or a workflow on any branch, could also move it forward to unreviewed code. Today that is only the founder and Claude sessions.

   **Tested 2026-10-23** on a throwaway branch `release-probe` with Option A's ruleset:
   - the workflow token moved the branch forward to `main`: **allowed**;
   - a force push that rewinds it: **refused**;
   - deleting the branch: **refused**;
   - a force push from a normal account: **refused**;
   - a push of a commit that is not on `main`, from a workflow on another branch: **allowed**. This is the gap Option B closes.
4. In GitHub, go to **Settings → Secrets and variables → Actions → Variables** and add the repository variable `WEBSITE_RELEASE_BATCHING` = `enabled`. This is a plain variable, not a secret.
5. In Netlify, go to **Project configuration → Build & deploy → Branches and deploy contexts**. Set the **Production branch** to `release`, and set **Branch deploys** to *None*. Keep **Deploy previews** on.
6. Run **Release Website** once with kind `manual`, reason "first release", and `dry_run` on. Then run it again without the dry run, and confirm the verify step passes.
7. After one billing cycle, compare production deploy credits with this table.

No build hooks are needed. With Option A the workflow pushes with the repository's own workflow token (`contents: write`). With Option B it pushes with the deploy key from the `website-release` environment. The run summary says which one was used.
