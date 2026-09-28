# FlipForge Private Beta — Wave 1 Launch Pack

Status: **READY TO OPERATE**  
Effective: **2026-09-16**

## Purpose

Move FlipForge from internal proof into controlled real-user validation without reopening completed architecture/security work or expanding faster than the evidence supports.

Wave 1 is intentionally small. The objective is to learn whether real collectors can complete the exact-card decision loop, understand Card Decision Intelligence™, find the reasoning useful, and choose to use FlipForge again before another meaningful purchase.

Private Beta is not a separate application. Invited testers use the definitive customer SaaS at `/app/customer/`, with onboarding at `/app/customer/#/beta-start`.

This launch does **not** authorize billing, a public accuracy percentage, transactions, auto-buying, grade prediction, recommendation recomputation from tester feedback, or production self-training.

## Wave 1 cohort

Cohort slug: `wave-1-sep-2026`

Initial size: **5 invited testers**.  
Expansion ceiling before founder review: **10 testers total**.

Preferred first-five mix:

- at least 2 experienced collectors who regularly buy graded cards;
- at least 1 grading-focused collector;
- at least 1 active buyer who compares multiple listings before purchase;
- at least 1 user who is less familiar with advanced card-data tools, to expose comprehension problems.

Do not optimize Wave 1 for praise. Prefer people who will challenge identity, evidence, supported value, risk, and BUY / WATCH / VERIFY / PASS reasoning.

## Founder-selected tester criteria

A strong Wave 1 tester should meet most of these conditions:

1. Buys or seriously evaluates sports cards with real money.
2. Can bring one real listing they would genuinely consider buying.
3. Is willing to inspect the reasoning rather than judge FlipForge only by whether they agree with the result.
4. Will report confusing, missing, or incorrect behavior directly.
5. Can return for at least one follow-up checkpoint.

Do not require a tester to be an expert. A mixed skill level is intentional.

## Invitation message

**Subject:** You’re invited to the FlipForge Private Beta

Hi {{first_name}},

You’ve been selected to join the FlipForge private beta and help test a different way to evaluate sports-card deals: not just what a card costs, but whether the evidence behind the decision actually holds up.

For your first session, bring **one real sports-card listing you would seriously consider buying**. FlipForge will walk you through exact-card identity, market evidence, supported value, risk, and the reasoning behind the final decision state.

Activate your account using the secure invitation, accept the Private Beta Terms, then continue into the Private Beta Guide inside the FlipForge customer app.

Please pay particular attention to anything FlipForge excludes, withholds, or flags for verification. We are testing the quality and usefulness of the reasoning—not looking for compliments.

FlipForge is decision support. It does not authorize a purchase, guarantee profit, or predict a future grade.

Todd  
Founder, FlipForge  
**Before you buy. Know Why.**

## First-session mission

The in-product Private Beta Guide reduces the first session to **five tasks**:

1. **Bring one real card.** Use a sports-card listing the tester would genuinely consider buying.
2. **Verify the exact identity.** Confirm year, set, player, card number, parallel/variation, grader, and grade.
3. **Get the FlipForge decision.** Use the real all-in acquisition cost and read BUY / WATCH / VERIFY / PASS before deeper analysis.
4. **Challenge the evidence.** Inspect what evidence was accepted, excluded, or withheld and whether the Decision Receipt / traceback makes sense.
5. **Track it and report what changed.** Save or track the decision, complete the structured beta check, rate the first-session experience, and report any blocker.

The original decision remains preserved. Tester feedback never rewrites it.

## Structured decision and product-value check

The saved-decision screen now captures seven governed fields from active invited testers:

### Comprehension

- `decisionUnderstood`: YES / PARTLY / NO
- `nextStepClear`: YES / PARTLY / NO
- `evidenceImpact`: INCREASED / NO_CHANGE / DECREASED / NOT_VIEWED
- `mostUsefulLayer`: IDENTITY / EVIDENCE / ECONOMICS / RISK_UNCERTAINTY / DECISION / RECEIPT / OUTCOME / NONE

### Product value

- `surfacedImportant`: YES / NO / UNSURE
- `decisionEffect`: CHANGED / CONFIRMED / NEITHER
- `futureUse`: YES / MAYBE / NO

The three product-value questions therefore no longer require an off-platform follow-up spreadsheet or email tally.

These are **product-value signals**, not accuracy statistics.

## Privacy-preserving response counting

Each new beta feedback record may include a server-generated `testerKey` derived from the signed Identity account through a one-way SHA-256 namespace digest.

The tester key exists only to count unique tester participation without storing the tester's email in the scorecard. The operator scorecard does not display the key.

Beta feedback must not contain card identities, listing URLs, passwords, access tokens, provider credentials, tenant IDs, or other sensitive data.

## Beta issue flow

The Private Beta Guide includes a dedicated **Report a beta issue** flow.

Severity values:

- `S1_BLOCKING` — tester cannot continue;
- `S2_MAJOR` — major workflow problem;
- `S3_MINOR` — minor problem;
- `S4_COSMETIC` — visual/polish issue.

Issue reports enter the existing authenticated beta-feedback queue and do not mutate any evaluation or authority state. Unresolved S1/S2 issues are surfaced in the founder scorecard.

## Founder scorecard

`/operator-beta.html` contains the Wave 1 founder scorecard for `wave-1-sep-2026`.

It reports:

- invited testers;
- activated testers;
- activation rate;
- first-session tester participation;
- clear-or-better 4–5 rating rate when ratings are present;
- blocked-or-difficult 1–2 rating rate when ratings are present;
- unresolved S1/S2 beta blockers;
- testers who say FlipForge surfaced something important;
- testers whose decision was changed or confirmed;
- testers who say they would use FlipForge before another meaningful card purchase;
- the Decision Intelligence comprehension counts and most useful CDI layer.

The scorecard is read-only. It reads the existing operator endpoint and never changes customer data, recommendations, evidence, grading guidance, or entitlements.

## Wave 1 decision rules

The operator scorecard converts the current cohort signals into one operating state:

### `BUILD FIRST 5`

Use while fewer than five Wave 1 testers have been invited.

### `PAUSE AND FIX`

Use when either condition is true:

- an unresolved S1/S2 beta blocker exists; or
- at least three first-session ratings exist and 30% or more are rated 1–2.

### `HOLD — FIX ACTIVATION`

Use when at least three invitations have been sent and activation is below 70%.

### `EXPAND TO 10`

Expansion is allowed only after the first five are in motion, no pause condition exists, at least three testers have completed the structured first-session check, and at least three product-value responses say `futureUse=YES`.

### `HOLD AT 5`

Use when five have been invited but there is not yet enough evidence to expand and no pause condition exists.

These are founder operating rules for a tiny private beta. They are not statistical population claims.

## Day-7 review

Seven days after the first Wave 1 activations, review:

- invited and activated counts;
- first-session participation;
- Decision Intelligence understanding;
- next-step clarity;
- evidence confidence effect;
- most useful CDI layer;
- product-value responses;
- unresolved and resolved beta issues;
- DAY_7 outcome participation;
- `REASONING_HELD`, `REASONING_CHANGED`, and `MORE_EVIDENCE_NEEDED` counts;
- fixes shipped during the week;
- items intentionally deferred;
- whether the founder scorecard says HOLD, EXPAND, or PAUSE.

Do not change the original Day-0 decision during review.

## Follow-up message after first session

**Subject:** One question after your first FlipForge decision

Hi {{first_name}},

Thanks for running your first FlipForge case. The most useful thing you can do now is make sure you submitted the short beta check on the saved decision screen and the 1–5 session rating in the Private Beta Guide.

If something appeared wrong, use **Report a beta issue** in the Private Beta Guide. Tell us what happened and what you expected instead, but do not include card/listing identifiers or private account information.

The goal is to learn whether the reasoning was clear, useful, and worth returning to before another real purchase.

## Day-7 message

**Subject:** FlipForge Wave 1 — Day 7 check

Hi {{first_name}},

Please revisit the saved decision from your first test case and submit the Day 7 outcome review from the Private Beta Guide in the FlipForge customer app.

Do not change the original decision. Compare what FlipForge preserved on Day 0 with what is true now: listing status, new evidence, price context, identity confidence, and risk.

The goal is to learn what held up, what changed, and where more evidence is still required.

## Accuracy-claim boundary

Wave 1 does not authorize a public CardSight or FlipForge accuracy rate.

Do not convert tester agreement, experience ratings, comprehension, `futureUse`, outcome participation, reasoning-held counts, or small-cohort product-value responses into an advertised accuracy percentage.

Public statistical claims require a separately governed metric definition, denominator, blind/evaluable sample policy, exclusions, minimum sample size, confidence treatment, and approved claim language.

## Operator sequence

1. Open `/operator-beta.html` and use **Refresh & Sync**.
2. Personally selected testers: use **Invite a tester**, enter name/email/group `wave-1-sep-2026`, and send the private beta invite.
3. Public applicants: review fit and move qualified applicants through the normal approval path before invitation.
4. Tester accepts the Private Beta Terms and activates the account.
5. Verify `INVITE_SENT`, Terms receipt, and then `ACTIVATED`.
6. Tester lands at `/app/customer/#/beta-start` and completes the five-task mission.
7. Review the founder scorecard and new feedback daily.
8. Treat unresolved S1/S2 reports as blockers before expansion.
9. Complete the Day-7 review.
10. Expand to 10 only when the Wave 1 scorecard supports it.
