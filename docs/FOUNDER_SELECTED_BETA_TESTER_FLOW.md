# FlipForge Founder-Selected Beta Tester Flow

Status: **PREVIEW / PR REVIEW**  
Effective candidate: **2026-09-04**

## Purpose

Allow the founder to personally invite a private-beta tester without forcing that person through the public application questionnaire or a manual review sequence, while preserving controlled Identity access, tenant membership, Beta Terms, feedback, and no-transaction boundaries.

## Operator flow

1. Open `/operator-beta.html` with the `flipforge-operator` role.
2. Use **Invite a tester**.
3. Enter name, email, and beta test group. Wave 1 defaults to `wave-1-sep-2026`.
4. Select **Send private beta invite**.
5. FlipForge creates one deduplicated application-compatible record behind the scenes with:
   - `status=APPROVED`;
   - `selectionSource=FOUNDER_SELECTED`;
   - `betaTermsAccepted=false`;
   - no paid entitlement, billing authority, recommendation authority, or transaction authority.
6. The same operator action immediately sends the normal server-owned Identity invitation. The founder does not need to reopen the record or manually move it through review states.

If the record is created but the Identity invitation fails, FlipForge keeps the approved record and tells the operator to retry the existing **Send Identity Invitation** action from Applications. It does not silently duplicate the tester.

Founder selection is not Terms acceptance. The founder never accepts Beta Terms on behalf of the tester.

## Tester activation flow

1. Tester receives the branded FlipForge private-beta invitation.
2. Tester opens the secure Netlify Identity invitation.
3. The activation panel requires the tester to open/read and explicitly accept the FlipForge Private Beta Terms before active access may be granted.
4. The Identity client accepts the invitation and creates the password-controlled account.
5. A same-origin authenticated request records the accepted Terms version and timestamp against the tester's application-bound Identity membership.
6. If the receipt cannot be recorded immediately, the browser retains only a bounded pending-acceptance marker and presents a blocking retry screen rather than treating the receipt as complete.
7. After acceptance is recorded, the tester lands on `/app/#/beta-start` and follows the existing Private Beta Guide.

Current Terms version: `2026-08-15`.

## First-session guidance

The existing Private Beta Guide remains authoritative for onboarding:

`Discover → Evaluate → Card Intelligence → Decision Traceback → Compare → Track → Decision Dossier → Feedback`

For Wave 1, the tester should bring one real sports-card listing they would seriously consider and complete one exact-card loop before broad exploration.

## Public applicants remain separate

The public application flow still uses its governed review states because those people were not personally selected by the founder:

`SUBMITTED → UNDER_REVIEW / WAITLISTED / DECLINED → APPROVED → INVITE_SENT → ACTIVATED`

The direct founder-selected path intentionally skips only the unnecessary selection review:

`FOUNDER_SELECTED → INVITE_SENT → TERMS_ACCEPTED → ACTIVATED`

## Data and security boundaries

- Founder-selected records use the same site-scoped beta application store and email deduplication index as public applications.
- The founder-selection endpoint requires a signed operator role and same-origin POST.
- The direct UI calls the existing operator-owned invitation path after the founder-selected record is created; it does not add a second invitation authority.
- Founder-selected Identity membership is held in `terms_pending` until the Terms receipt is recorded.
- Terms receipts must match the application-bound Identity user ID, email, and tenant membership.
- Terms writes use an ETag conditional update so concurrent changes fail closed.
- No password, invitation token, provider credential, tenant secret, listing URL, or card identity is written to Terms receipts.
- No billing, purchase, sale, grading, evidence-acceptance, recommendation, or transaction authority is created by this flow.
- No public CardSight accuracy claim is authorized by participation or acceptance.

## Operational result

The founder experience becomes:

**Name + email + beta group → Send private beta invite.**

The tester experience becomes:

**Invitation email → accept Beta Terms + set password → Private Beta Guide → first exact-card test → structured feedback → 7 / 14 / 30 outcome review.**
