# FlipForge Private Beta — Wave 1 Launch Pack

Status: **READY TO OPERATE**  
Effective: **2026-09-04**

## Purpose

Move FlipForge from internal readiness proof into controlled real-user validation without reopening completed architecture/security audits or expanding faster than the evidence supports.

Wave 1 is intentionally small. The objective is to learn whether serious collectors understand the product, complete the exact-card decision loop, find the reasoning useful, and return to use it again.

This document supplements the existing private-beta operating contracts:

- `docs/PRIVATE_BETA_ACQUISITION_AND_ONBOARDING.md`
- `docs/PRIVATE_BETA_OPERATOR_WORKFLOW.md`
- `docs/SAAS_PRIVATE_BETA_READINESS.md`
- in-product `#/beta-start` Private Beta Guide

It does not authorize billing, a public accuracy percentage, transactions, auto-buying, grade prediction, or production self-training.

## Wave 1 cohort

Target cohort slug: `wave-1-sep-2026`

Initial size: **5 invited testers**.

Expansion ceiling before review: **10 testers total**.

Preferred tester mix:

- at least 2 experienced collectors who regularly buy graded cards;
- at least 1 grading-focused collector;
- at least 1 active buyer who compares multiple listings before purchase;
- at least 1 user who is less familiar with advanced card-data tools, to expose comprehension problems.

Do not optimize Wave 1 for praise. Prefer testers who will challenge identity, evidence, supported value, and the final BUY CANDIDATE / WATCH / VERIFY / PASS reasoning.

## Launch gate

Before the first invitation is sent, require all of the following:

- master independent audit is closed completed;
- production signed-in customer-path QA is closed completed;
- local managed backup is READY;
- latest managed backup has verified Cloudflare R2 offsite copy;
- non-destructive production restore rehearsal is READY;
- previously exposed/replaced R2 credential has been revoked;
- temporary local presigned PUT/GET URL files have been deleted;
- no public CardSight accuracy percentage is displayed or implied;
- billing and transaction authority remain disabled.

## Invitation message

**Subject:** Your FlipForge private-beta invitation

Hi {{first_name}},

You have been selected for the invitation-only FlipForge private beta.

For your first session, do not try to test every feature. Bring one real sports-card listing you would seriously consider buying and run one exact-card decision from Discover through Card Intelligence and the Decision Dossier.

The question we are testing is simple: **Does FlipForge help you understand whether the evidence behind the deal actually holds up before you spend?**

Please pay particular attention to anything FlipForge excludes, withholds, or flags for verification. We want to know where the reasoning helps, where it confuses you, and where you believe it is wrong.

Activate your account using the invitation sent separately, then open the Private Beta Guide before beginning.

FlipForge is decision support. It does not authorize a purchase, guarantee profit, or predict a future grade.

Todd  
Founder, FlipForge

## First-session assignment

Each tester should complete **one exact-card loop** before broad exploration:

1. Open the Private Beta Guide.
2. Search one exact card in Discover.
3. Confirm that the returned identity matches year, set, player, card number, parallel/variation, grader, and grade.
4. Select one real listing or enter one manually in Evaluate.
5. Review Card Intelligence before accepting the recommendation state.
6. Open Decision Traceback and inspect what evidence was accepted, excluded, or withheld.
7. Save/track the decision and create a Decision Dossier when available.
8. Submit structured feedback from the Private Beta Guide.

The original decision is preserved. Later evidence is compared with it; it is not rewritten in hindsight.

## What Wave 1 must measure

### Already captured by the current product

The current beta system can provide:

- application and invitation state;
- activation state;
- structured feedback category;
- route where feedback occurred;
- 1–5 experience rating;
- GENERAL / DAY_7 / DAY_14 / DAY_30 checkpoint;
- `REASONING_HELD`, `REASONING_CHANGED`, or `MORE_EVIDENCE_NEEDED` outcome signal;
- feedback review state NEW / UNDER_REVIEW / RESOLVED;
- anonymous onboarding/funnel interaction counts already defined by the acquisition contract.

### Operator scorecard fields

For Wave 1, maintain these additional cohort-level counts without putting card identities, listing URLs, tenant IDs, credentials, or private customer data into the scorecard:

| Metric | Definition |
|---|---|
| Invited | Number moved to `INVITE_SENT`. |
| Activated | Number synchronized to `ACTIVATED`. |
| Activation rate | Activated / Invited. |
| First-session respondents | Activated testers who submit GENERAL feedback after attempting the first exact-card loop. |
| First-session response rate | First-session respondents / Activated. |
| Clear-or-better rate | Ratings 4–5 / rated first-session responses. |
| Blocked-or-difficult rate | Ratings 1–2 / rated first-session responses. |
| Day-7 participation | Testers submitting a DAY_7 outcome review / eligible activated testers. |
| Reasoning held | DAY_7 responses marked `REASONING_HELD`. |
| Reasoning changed | DAY_7 responses marked `REASONING_CHANGED`. |
| More evidence needed | DAY_7 responses marked `MORE_EVIDENCE_NEEDED`. |
| Repeated blocker | Same material workflow/identity/evidence defect reported by 2+ testers. |

## Three product-value questions

The current structured feedback form does **not yet** directly capture the following three questions. Until they are added to the product, ask them during the Wave 1 follow-up and record only aggregate counts:

1. **Did FlipForge surface something important you would otherwise have missed?** — Yes / No / Unsure
2. **Did the reasoning change or confirm what you planned to do?** — Changed / Confirmed / Neither
3. **Would you use FlipForge before another meaningful card purchase?** — Yes / Maybe / No

These are product-value signals, not accuracy statistics.

## Wave 1 decision rules

Do not expand the cohort merely because invitations are available.

- If activation rate is below **70%**, treat onboarding/invitation friction as the priority before expanding.
- If blocked-or-difficult feedback reaches **30% or more**, stop expansion and fix the dominant workflow issue.
- If the same material identity/evidence/customer-path defect is reported by **2 or more testers**, classify it before sending more invitations.
- Do not expand beyond the first 5 until at least **3 testers complete the first exact-card loop** and there is no unresolved S1/S2 beta blocker.
- A strong early product signal is at least **3 of the first 5 activated testers** saying they would use FlipForge before another meaningful purchase. This is directional beta evidence only, not a population-level conversion claim.

## Day-7 review scorecard

Complete one cohort review seven days after the first Wave 1 activations.

Record:

- invited;
- activated;
- completed first-session responses;
- median/typical rating and ratings distribution;
- top 3 repeated confusion points;
- top 3 reasons testers found the reasoning useful;
- count of repeated material defects;
- DAY_7 outcome participation;
- reasoning-held / changed / insufficient-evidence counts;
- aggregate answers to the three product-value questions;
- fixes shipped during the week;
- items intentionally deferred;
- recommendation: `HOLD AT 5`, `EXPAND TO 10`, or `PAUSE AND FIX`.

## Follow-up message after first session

**Subject:** One question after your first FlipForge decision

Hi {{first_name}},

Thanks for running your first FlipForge case. I am interested in the decision process more than whether you liked the interface.

Please answer these three questions:

1. Did FlipForge surface something important you would otherwise have missed?
2. Did the reasoning change your planned decision, confirm it, or neither?
3. Would you use FlipForge before another meaningful card purchase?

If something appeared wrong, tell us the route, what you expected, what happened instead, and why it mattered. Please keep card/listing identifiers and private information out of email and feedback.

## Day-7 message

**Subject:** FlipForge Wave 1 — Day 7 check

Hi {{first_name}},

Please revisit the saved decision from your first test case and submit the Day 7 outcome review from the Private Beta Guide.

Do not change the original decision. Compare what FlipForge preserved on Day 0 with what is true now: listing status, new evidence, price context, identity confidence, and risk.

The goal is to learn what held up, what changed, and where more evidence is still required.

## Accuracy-claim boundary

Wave 1 does not authorize a public CardSight accuracy rate.

Do not convert:

- tester agreement;
- experience ratings;
- outcome-review participation;
- reasoning-held counts; or
- small-cohort product-value responses

into an advertised accuracy percentage.

Public statistical claims require a separately governed metric definition, denominator, blind/evaluable sample policy, exclusions, minimum sample size, confidence treatment, and approved claim language.

## Operator sequence

1. Perform the security cleanup gate.
2. Open `/operator-beta.html` and Refresh & Sync.
3. Select the first five qualified applications.
4. Move each through UNDER_REVIEW → APPROVED with cohort `wave-1-sep-2026`.
5. Send the Identity invitation only after approval.
6. Verify `INVITE_SENT` and later `ACTIVATED` states.
7. Send the Wave 1 invitation message.
8. Review new feedback daily; resolve blockers before expanding.
9. Complete the Day-7 Wave 1 scorecard.
10. Expand to 10 only when the Wave 1 decision rules support it.
