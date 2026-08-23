# FlipForge Private Beta Operator Workflow

Status: **ACTIVE OWNER/OPERATOR CONTRACT**
Effective: **2026-08-23**

## Purpose

This workflow turns the public beta application into a controlled operating queue. It does not create public signup, paid access, transaction authority, or a second product source of truth.

Operator workspace: `/operator-beta.html` (not linked in public navigation and marked `noindex`).

## One-time operator access

The owner account must have the Netlify Identity role `flipforge-operator` (or the Identity account-level `admin` role). The browser receives only an `operatorActive` boolean. Every applicant read and mutation is independently authorized again inside the server function.

If the role is added while the owner is signed in, sign out and back in so Netlify Identity issues a refreshed signed session.

## Intake and storage

1. The public form posts to `POST /api/beta/applications`.
2. The server enforces field allowlists, length limits, consent, Beta Terms acceptance, same-origin submission, a 16 KB body limit, a honeypot, and platform rate limiting.
3. Normalized applicant records are stored in the site-scoped `flipforge-beta-applications` store using strong consistency.
4. A SHA-256 email index suppresses repeat submissions without putting an email address in a storage key.
5. Applicant details never enter anonymous conversion-event records or function-operation logs.

## Review states

| State | Meaning |
|---|---|
| `SUBMITTED` | Valid application stored; no review or access yet. |
| `UNDER_REVIEW` | Operator is evaluating fit and capacity. |
| `WAITLISTED` | Potential fit, but no current cohort placement. |
| `APPROVED` | Selection approved and a cohort assigned; access still does not exist. |
| `INVITE_SENT` | Netlify Identity invitation sent and signed tenant membership assigned. |
| `ACTIVATED` | Identity reports confirmation or sign-in for the invited account. |
| `DECLINED` | Not selected for the current private beta. |

State transitions are server-enforced and atomically version-checked against the stored record. Conflicting browser sessions fail with `VERSION_CONFLICT` instead of overwriting a newer decision. Invitation processing first reserves that application version so review actions cannot race the Identity side effect. Every transition appends a timestamped history entry; records are not silently rewritten or deleted by the operator workspace.

## Invitation authority

The Send Identity Invitation action is intentionally separate from approval.

1. Application must already be `APPROVED`.
2. A valid cohort slug is required.
3. The server calls the Netlify Identity admin-only `/invite` endpoint using the short-lived operator token available only inside Netlify Functions.
4. The server assigns `flipforge-active` and exactly one `flipforge-tenant--<tenantId>` role plus matching `app_metadata.flipforge` membership.
5. A pre-existing, unconfirmed self-registration that was not created by an Identity invitation is treated as an account conflict; no beta roles are granted.
6. The existing invitation callback asks the tester to choose a password of at least 15 characters.
7. Invitation or role-assignment failures fail closed. The applicant is not reported as activated.

The invitation grants no billing, bid, purchase, sale, grading, evidence-acceptance, or transaction authority.

## Funnel reporting

Anonymous conversion events are copied to the site-scoped `flipforge-conversion-events` store. Records contain only:

- allowlisted event name;
- allowlisted page category;
- allowlisted placement category;
- schema version; and
- server timestamp.

The operator dashboard reports the last 30 days and labels all counts as directional interactions rather than unique visitors. A daily retention job removes records before they can exceed 90 days; dashboard refresh also removes expired records. Funnel reporting is not product accuracy, investment performance, or a customer count.

## Tester feedback and outcome checkpoints

Invited testers submit structured feedback to `POST /api/beta/feedback`. The server requires a signed active tester membership, validates strict category, route, rating, checkpoint, outcome, and text limits, and stores the record separately from applications, conversion events, and authoritative evaluations.

Feedback may identify a general session or a Day 7, Day 14, or Day 30 checkpoint. Outcome options record whether the tester believes the original reasoning still holds, needs revision, or still lacks evidence. These are tester-reported calibration inputs—not an accuracy score, a changed recommendation, a completed-sale claim, or transaction authority.

The operator may move a feedback record through `NEW → UNDER_REVIEW → RESOLVED`, with version-checked updates and an append-only review history. Follow-up email is visible only when the tester explicitly grants permission; otherwise no tester email is stored with the feedback record.

## Privacy and security boundaries

- No analytics cookie, local storage, session storage, fingerprint, or persistent visitor ID.
- No name, email, account ID, card identity, listing URL, query string, referrer, or user-agent value in conversion events.
- Applicant records are available only through the server-verified operator role.
- Tester feedback is accepted only from signed active members and read only through the server-verified operator role.
- Platform rate limiting may use normal request metadata, including IP address, without writing it into FlipForge applicant or conversion records.
- Review notes must not contain passwords, access tokens, provider keys, tenant IDs, card records, or listing URLs.
- Public application confirmation never reveals whether an email already applied.

## Daily operator sequence

1. Open the operator workspace and select **Refresh & Sync**.
2. Review new `SUBMITTED` applications and move each to `UNDER_REVIEW`.
3. Record only minimal fit/capacity context.
4. Assign a cohort before moving a tester to `APPROVED`.
5. Confirm the email address and select **Send Identity Invitation**.
6. Verify the record becomes `INVITE_SENT`; never promise access before that state.
7. Refresh later to synchronize confirmed Identity accounts to `ACTIVATED`.
8. Use the existing in-product Getting Started guide for the first exact-card loop and 7 / 14 / 30-day evidence review.
