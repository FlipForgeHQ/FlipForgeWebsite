# FlipForge Private Beta Acquisition and Onboarding

Status: **ACTIVE PRIVATE-BETA OPERATING CONTRACT**  
Effective: **2026-08-23**

## Funnel events

FlipForge records only these first-party, anonymous conversion events:

| Event | Meaning |
|---|---|
| `sample_dossier_viewed` | A visitor reached the customer-safe sample dossier. |
| `beta_cta_clicked` | A visitor selected a link to the beta application. |
| `beta_form_started` | A visitor first interacted with the beta application form. |
| `beta_application_received` | The same-site post-submit confirmation page loaded. |
| `app_preview_clicked` | A visitor selected an App Preview entry point. |
| `onboarding_guide_clicked` | An applicant selected the onboarding guide from the receipt page. |
| `onboarding_guide_viewed` | A visitor loaded the beta onboarding guide. |
| `onboarding_workspace_clicked` | A visitor selected the invitation-only workspace entry point. |

The event service accepts only an allowlisted event name, page category, placement category, schema version, and server timestamp. It does not intentionally record a visitor ID, name, email address, account, card, listing, query string, referrer, or user-agent value. The browser script uses no analytics cookies, local storage, or session storage.

Structured events are written as `flipforge_conversion_event` records in the Netlify conversion function logs. Initial funnel review should count events by name and page over the same reporting window. These are directional interaction counts, not unique visitors.

## Initial funnel measures

1. **Dossier-to-application interest:** `beta_cta_clicked` after sample-dossier traffic.
2. **Application start rate:** `beta_form_started` divided by beta-application visits from hosting analytics.
3. **Application completion proxy:** `beta_application_received` divided by `beta_form_started`.
4. **Onboarding preparation:** `onboarding_guide_clicked` divided by `beta_application_received`; use `onboarding_guide_viewed` as the guide-load count.
5. **Invited-workspace intent:** `onboarding_workspace_clicked` divided by onboarding-guide traffic.

Do not describe these counts as product accuracy, investment performance, unique-person conversion, or paid-customer conversion.

## Applicant and tester path

1. Applicant submits the same-site Netlify form.
2. Confirmation page states `Awaiting selection review` and links to the public preparation guide.
3. Operator reviews fit, capacity, testing focus, and likely testing frequency.
4. Selected tester receives an invitation and activates authenticated access.
5. First authenticated route is the existing in-product Private Beta Guide.
6. Tester completes one exact-card loop: Discover → Evaluate → Card Intelligence → Traceback → Compare → Track → Decision Dossier → focused feedback.
7. Tester revisits the preserved decision at 7 / 14 / 30-day checkpoints where possible.

## Operator email templates

### Selection and invitation

**Subject:** Your FlipForge private-beta invitation

Hi {{first_name}},

You have been selected for the invitation-only FlipForge private beta. Your first goal is not to test every feature. It is to run one exact-card decision through identity, evidence, recommendation, and traceback, then tell us where the reasoning helped or failed.

Activate your account using the invitation sent separately, then open the Private Beta Guide before starting.

Prepare one case with the year, set, player, card number, parallel or insert, grader, grade, and the decision you are trying to make. Do not send passwords, access tokens, provider keys, tenant IDs, listing URLs, or private personal information in feedback.

FlipForge is decision support. It does not authorize a purchase, guarantee profit, or predict a future grade.

Todd  
Founder, FlipForge

### First-session follow-up

**Subject:** Complete one FlipForge decision loop

Hi {{first_name}},

For your first session, use one exact card and complete the full path from Discover through the Decision Dossier. Pay particular attention to what FlipForge accepts, excludes, or withholds.

When you send feedback, identify the route, expected behavior, actual behavior, and why the difference matters. Use a sanitized example label rather than pasting a listing URL or private identifier.

### Day-7 checkpoint

**Subject:** FlipForge day-7 evidence check

Hi {{first_name}},

Please revisit the saved decision from your first test case. Record whether the listing status, available evidence, price context, identity confidence, or risk changed. Do not rewrite the original decision; compare the new evidence with what FlipForge preserved on day 0.

The same review continues at days 14 and 30 when the case remains active.

## Non-negotiable boundaries

- Active listings are discovery leads, not completed-sale evidence.
- Weak or mismatched evidence remains visible but cannot quietly support value.
- Approved recommendation states remain BUY CANDIDATE, WATCH, VERIFY, and PASS.
- No public accuracy percentage is authorized.
- No guaranteed profit, fraud-filtering, transaction authority, or grade prediction claim is permitted.
- SQLite remains the product source of truth; funnel logs are website interaction evidence only.
