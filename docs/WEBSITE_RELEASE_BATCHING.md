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
  - ~~automatically on weekdays at 22:17 UTC (6:17 PM EDT), only if `main` has changed~~ — **paused 2026-10-27: manual releases only, after explicit founder approval.** GitHub started this repository's scheduled jobs 3–9 hours late (Release Website ran at 01:28 UTC for the Oct 26 22:17 slot; the daily 06:17 UTC chaos audit runs 10:38–14:06 UTC) and skipped the Oct 24 and Oct 27 release slots entirely;
  - on demand, when someone runs the workflow (kind `manual` or `emergency`, with a required reason).
- **Safety rules, enforced by `scripts/ci/release-website.mjs`:**
  - only commits already on `main` can be released;
  - the four required checks (Pre-Beta Security gate, Independent Audit C-L gate, Validate core SaaS Beta Complete static gate, Validate workflow action references) must have succeeded on that commit. A failed re-run is never hidden by an older success;
  - forward only: `release` never moves backwards, and nothing is force-pushed or rewritten;
  - when `release` already equals the target, or already serves exactly the target's files, nothing is pushed and no
    build starts.
- **Commits made directly on `release`** (for example a backport PR merged into `release`, as #594 and #597 were on
  2026-10-30) put `release` off `main`'s history. Main allows squash merges only, so main can never absorb them, and a
  plain fast-forward is no longer possible. The workflow handles this without force-pushing or changing any branch rule:
  - **Proof:** `release` must currently serve exactly the files of a commit on `main`. That is the target, or one of
    its first-parent ancestors within the last 500 commits. If so, nothing on `release` is missing from `main`.
  - **Reconcile:** it creates one merge commit whose parents are the current `release` head and the target, and whose
    file tree is exactly the target's tree. It pushes that as an ordinary forward update. Netlify builds that commit, so
    production serves exactly the target's files.
  - **Refusal:** if `release` serves files that match no `main` commit (a real fix made only on `release`), the
    release is refused and `release` is left unchanged. Land the fix on `main` first, then release.
  - Once reconciled, later releases go out the same way automatically. The released commit's tree always equals the
    target commit's tree. The workflow output `sha` is the pushed `release` commit (what Netlify reports), and
    `content_sha` is the `main` commit whose files it serves.
  - Prefer releasing through this workflow. A backport PR into `release` is still possible in an emergency, but it is
    no longer needed to get past a divergence.
- **After each release**, the workflow waits for Netlify and verifies that `goflipforge.com/deploy-meta.json` reports the released commit on the `release` branch.
- **Tests:** `scripts/validate-website-release-batching.mjs` checks all of this in an offline Git sandbox, including the divergence and refusal cases (28 checks). It runs in the Live Production Parity Static Assurance workflow.

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

## Controlled production activation

> **Decision, 2026-10-24: start with Option A (no key).** The release App's private key could not be regenerated from the GitHub settings page, so the founder chose the tested no-key setup. For Option A:
> - the **protect release** ruleset keeps **Restrict deletions** and **Block force pushes** but **not** Restrict updates;
> - the variable `WEBSITE_RELEASE_APP_ID` is deleted from the `website-release` environment;
> - the preflight then runs its read-only Option A checks, and every release pushes with the workflow token.
>
> Moving to Option B later only needs a valid App key, the App ID variable and Restrict updates turned back on.

**Status, 2026-10-24.**
- **Done:** #556 is merged and inert. The `website-release` environment allows `main` only; this was tested, and a job from another branch was refused. The private App **FlipForge website release** is installed on this repository only.
- **Still off:** batching. Netlify still builds production from `main`.

Option B (the GitHub App) is the chosen design. Option A, below, is kept only as a documented fallback.

### Stage 1: preflight (no production change)

1. **Founder: create the ruleset.** Settings → Rules → Rulesets → New branch ruleset, named **Protect release**.
   - **Enforcement:** Active.
   - **Bypass list:** the **FlipForge website release** App, set to *Always allow*. Nothing else.
   - **Targets:** include by pattern `release`, and include by pattern `release-preflight`.
   - **Rules:** Restrict deletions, Restrict updates, Block force pushes. Nothing else.

   No production effect: Netlify does not build `release` yet.
2. **Merge the preflight pull request** (founder approval). It adds a manual-only workflow. Nothing runs on its own.
3. **Founder: run the preflight.** Go to Actions → **Release Website Preflight** → *Run workflow* on `main`. Every check must pass:

| Check | What it proves |
| --- | --- |
| P1 | Batching is off and the main-merge parity check still runs |
| P2 | Live production is still built from `main` (deploy-meta.json) |
| P3 | The App token is created from the environment secret and reaches only this repository |
| P4 | `release` and `release-preflight` both block deletion, force pushes and updates |
| P5 | The App can fast-forward the protected scratch branch (bypass works) |
| P6 | The ordinary workflow token is refused (updates really are restricted) |
| P7 | The real `release` branch was not touched |

The preflight then deletes `release-preflight`, using the App. It changes no variable or Netlify setting. If a check fails, fix it and run the preflight again. Nothing needs undoing.

### Stage 2: activation (one sitting, about 30 minutes, founder present, ideally a quiet hour)

| Step | Action | Production effect | Verify |
| --- | --- | --- | --- |
| A1 | Netlify → Project configuration → Branches and deploy contexts. **Check, before changing anything**, that *Branch deploys* is **None**. If it is not, set it to None first. | None | Screenshot of the setting |
| A2 | The founder creates the branch `release` from `main` on GitHub's Branches page. Creation is not restricted. | None (Netlify does not build it) | The `release` commit equals the live `main` commit |
| A3 | Netlify: set **Production branch** to `release`. | **One production deploy of the same commit already live** (about 15 credits; content identical) | deploy-meta.json shows `branch: release` and the same `commitRef`. Smoke test: home page, sign-in page, signed-in dashboard, Saved Decisions, one Discover search |
| A4 | GitHub → Variables: `WEBSITE_RELEASE_BATCHING` = `enabled`. | Merges to `main` stop deploying. The main-merge parity job is skipped by design. | The next merge shows no Netlify production deploy |
| A5 | Actions → **Release Website**: kind `manual`, reason "activation check", `dry_run` on. | None | Summary: "Nothing to release" (release equals main), credential "GitHub App (Option B)" |
| A6 | First real release, after the next merge to `main`: run **Release Website** without the dry run. Or let the weekday 22:17 UTC schedule do it. | One production deploy containing the batched merges | The workflow's verify step passes. deploy-meta.json shows `branch: release` and the released commit. Repeat the A3 smoke test |

### Immediate rollback

Choose by symptom. Each option is independent of the others.

1. **A bad release is live.** In Netlify → Deploys, open the previous production deploy and choose **Publish deploy**. It is live in under a minute, with no build and no credits. Then revert on `main` and run an emergency release.
2. **Stop batching entirely.**
   1. Set the variable `WEBSITE_RELEASE_BATCHING` to `disabled`.
   2. In Netlify, set the production branch back to `main`.

   **Caution:** `main` may contain merges that were not yet released. Switching back deploys them. If that is not wanted, do option 1 first.
3. **The App or its key is suspect.** In the App's settings, delete its private key, or uninstall the App. Releases then stop, because the next run cannot get a token. Production keeps serving the last release. Then do option 2 if needed.

### Risks and how each is covered

- **A release deploys untested code.** The script only releases commits that are on `main` and that have passed all 4 required checks. It refuses anything else.
- **Someone moves `release` directly.** Updates are restricted, and only the App can bypass. Only a workflow running from `main` can obtain the App's key; this was tested.
- **Branch deploys cost credits.** A1 confirms *Branch deploys = None* before any branch is created.
- **The verify step runs before Netlify finishes.** It retries for up to about 13 minutes before failing.
- **Rollback ships unreleased work.** The caution under rollback option 2 covers this.

### Option A (fallback, not chosen)

A ruleset on `release` with **Restrict deletions** and **Block force pushes** only, no bypass, pushed with the ordinary workflow token. It needs no secret. But anyone with write access, or a workflow on any branch, could move `release` forward to unreviewed code.

**Tested 2026-10-23** on the throwaway branch `release-probe`:

| Test | Result |
| --- | --- |
| Workflow token fast-forwards to `main` | Allowed |
| Force push that rewinds | Refused |
| Deletion | Refused |
| Force push from a normal account | Refused |
| A workflow on another branch pushes a commit that is not on `main` | **Allowed (the gap)** |

Two further facts shaped the choice:
- "GitHub Actions" is not offered as a ruleset bypass, and deploy keys are disabled for the organization. That is why Option B uses a GitHub App.
- **Tested 2026-10-24:** a job from a non-`main` branch was refused access to the `website-release` environment (run 40053904513).

With Option B the workflow pushes with a short-lived GitHub App token. The run summary names the credential used. No build hooks are needed.
