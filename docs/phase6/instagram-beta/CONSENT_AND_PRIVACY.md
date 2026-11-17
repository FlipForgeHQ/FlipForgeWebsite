# Consent and privacy: Instagram recruitment funnel

## What the funnel may use

| Data | Where it comes from | Kept where |
|---|---|---|
| Campaign labels (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`) | The link the applicant clicked. Validated server-side by a known source and short slugs | With the beta application (already disclosed in `privacy.html`, "Website measurement") |
| The beta application itself | What the applicant types and submits, with their consent checkboxes (`beta_updates_consent`, `beta_terms_accepted`) | The existing private beta review queue (unchanged) |
| Per-post aggregate counts (reach, likes, comments, saves, shares, profile visits, link taps) | Typed in by the founder from Instagram's own insights screen | The founder's browser (local storage of the offline tracker) and exported JSON on the founder's PC |
| Application counts per campaign link | Copied by the founder from the operator console's campaign table | Same |

## What the funnel must never hold

- Instagram handles, names, profile links or follower lists.
- Comment or DM text, screenshots of DMs, or anyone's photos.
- Emails or phone numbers.
- Anything scraped or pulled from an Instagram or Graph API.

The tracker has no field for any of these. The backend importer refuses a file containing an `@handle`, an email or
a link.

## Consent

Joining the beta is consented to in the existing application form: a required updates consent, plus the Beta Terms
and Privacy acknowledgement. Nothing in this kit adds a new collection point or a new consent.

Liking or commenting on a post is **not** consent to be contacted or recorded. Do not message people who only
engaged. Reply only to people who message first, by hand (see `TEMPLATES.md`).

## Blind spots to check before the first campaign (founder decisions)

1. **Age.** Confirm that the Beta Terms require testers to be 18 or older, and say so in recruitment posts
   ("18+ collectors"). Instagram's audience includes minors.
2. **Instagram terms.** No automation, bots, follow/unfollow tools, bulk DMs or third-party growth services. These
   risk the account and breach the platform terms.
3. **FTC endorsement guides.** Perks for posts require clear disclosure by the tester. Never write reviews for testers.
4. **Giveaways and contests.** These need official rules, eligibility (age and jurisdiction), no purchase necessary,
   and Instagram's promotion release. They need separate approval.
5. **Paid promotion or boosting.** This creates Meta ad-platform data processing and needs separate approval. The
   privacy policy may need an update first.
6. **Retention.** Delete tracker exports older than 12 months. Funnel-event records already expire at 90 days per
   the privacy policy.
7. **Claims.** Never present beta outcome tracking as an accuracy claim (`disclaimers.json` → `accuracy`).
