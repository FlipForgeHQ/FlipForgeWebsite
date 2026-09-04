# FlipForge Founder-Selected Beta Tester Flow

Status: **PREVIEW / PR REVIEW**  
Effective candidate: **2026-09-04**

## Purpose

Allow the founder to personally select a private-beta tester without forcing that person through the public application questionnaire, while preserving the same controlled invitation, tenant membership, Beta Terms, feedback, and no-transaction boundaries.

## Operator flow

1. Open `/operator-beta.html` with the `flipforge-operator` role.
2. Use **Add a founder-selected tester**.
3. Enter name, email, and beta test group. Wave 1 defaults to `wave-1-sep-2026`.
4. FlipForge creates one deduplicated application-compatible record with:
   - `status=APPROVED`;
   - `selectionSource=FOUNDER_SELECTED`;
   - `betaTermsAccepted=false`;
   - no paid entitlement, billing authority, or transaction authority.
5. Refresh the Applications queue, select the tester, and use the existing **Send Identity Invitation** action.
6. The normal server-owned invitation path assigns one signed tenant membership to the invited Identity account.

Founder selection is not Terms acceptance. The founder never accepts Beta Terms on behalf of the tester.

## Tester activation flow

1. Tester opens the Netlify Identity invitation.
2. The activation panel requires the tester to open/read and explicitly accept the FlipForge Private Beta Terms before the invitation form may submit.
3. The existing Identity client accepts the invitation and creates the password-controlled account.
4. A same-origin authenticated request records the accepted Terms version and timestamp against the tester's application-bound Identity membership.
5. If the receipt cannot be recorded immediately, the browser retains only a bounded pending-acceptance marker and presents a blocking retry screen rather than treating the receipt as complete.
6. After acceptance is recorded, the tester lands on `/app/#/beta-start` and follows the existing Private Beta Guide.

Current Terms version: `2026-08-15`.

## First-session guidance

The existing Private Beta Guide remains authoritative for onboarding:

`Discover → Evaluate → Card Intelligence → Decision Traceback → Compare → Track → Decision Dossier → Feedback`

For Wave 1, the tester should bring one real sports-card listing they would seriously consider and complete one exact-card loop before broad exploration.

## Data and security boundaries

- Founder-selected records use the same site-scoped beta application store and email deduplication index as public applications.
- The founder-selection endpoint requires a signed operator role and same-origin POST.
- Terms receipts require an authenticated active tester and must match both the application-bound Identity user ID and email.
- Terms writes use an ETag conditional update so concurrent changes fail closed.
- No password, invitation token, provider credential, tenant secret, listing URL, or card identity is written to Terms receipts.
- No billing, purchase, sale, grading, evidence-acceptance, recommendation, or transaction authority is created by this flow.
- No public CardSight accuracy claim is authorized by participation or acceptance.

## Operational result

The operator experience becomes:

**Add founder-selected tester → Send Identity Invitation → tester accepts Beta Terms + sets password → Private Beta Guide → first exact-card test → structured feedback → 7 / 14 / 30 outcome review.**
