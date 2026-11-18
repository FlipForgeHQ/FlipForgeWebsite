# Phase 6: Instagram engagement-to-beta recruitment kit (founder-run)

Phase 6 scope item 7. The authorization record is in the backend repo:
`docs/roadmap/PHASE6_REAL_WORLD_VALIDATION_DECISION_INTELLIGENCE_BETA_EXPANSION.md`.

**This kit never posts, sends DMs, scrapes, follows, likes or calls any Instagram or Graph API.** Every account
action is the founder's own, done by hand in the Instagram app. Each one needs the founder's approval (approval item
N6).

It lives under `docs/`, so it is **never published**:
- `scripts/strip-internal-from-publish.mjs` removes `docs/` from the Netlify build;
- `internal-path-guard` answers 404 for `/docs/*`.

Open the files from your own computer.

## Files

| File | What it is |
|---|---|
| `link-builder-and-tracker.html` | Offline page. Builds tagged beta links and tracks per-post counts that you type in, then exports `ff-p6-instagram-tracker-v1` JSON for the backend funnel (`Phase6Tools funnel`). It makes no network request. |
| `TEMPLATES.md` | Caption, story, bio and comment-reply templates for you to type by hand. |
| `CONSENT_AND_PRIVACY.md` | What the funnel may and may not collect. It also covers Instagram rules, endorsement disclosure, giveaways and age. |

## Workflow

1. **Build the link.**
   - Open `link-builder-and-tracker.html` and choose a campaign (e.g. `beta-wave-1`) and a content tag per post
     (e.g. `reel-verify-explainer`).
   - It builds `https://goflipforge.com/beta-application.html?utm_source=instagram&utm_medium=social&utm_campaign=…&utm_content=…`.
   - The tags follow the same rule the site already enforces (`validateCampaign` in
     `netlify/modern-functions/lib/beta-operations-core.mjs`): a known source and short lowercase slugs. The site
     drops anything else.
2. **Post it yourself.** Put the link in your bio, link sticker or link tool, and post using `TEMPLATES.md`.
3. **The site attributes applications.** When someone applies through the link, the existing beta application stores
   the campaign labels with the application. The privacy policy already discloses this under "Website measurement".
   No handle is involved.
4. **Copy in Instagram's counts, weekly.** From Instagram's own insights screen, copy each post's reach, likes,
   comments, saves, shares, profile visits and link taps into the tracker. Do not copy names, handles or comment text.
5. **Copy in the application counts.** From the beta operator console (`operator-beta.html`, campaign table), copy the
   applications per campaign link into the tracker.
6. **Export and build the dashboard.**
   - Export the JSON.
   - On the founder PC, run
     `Phase6Tools funnel --tracker export.json --out funnel.json`.
   - Then run `Phase6Tools dashboard-adoption --funnel funnel.json …`.

## Validation

`node scripts/validate-phase6-instagram-kit.mjs` runs in CI (`phase6-instagram-beta-kit.yml`). It proves:
- the kit makes no network call and loads no external resource;
- the kit names no Instagram or Graph API host;
- every link the builder can make is accepted by the site's own `validateCampaign`, and bad tags are refused;
- the tracker has no field for a handle, name, email or phone number;
- its export matches the backend funnel format;
- `docs/` is stripped from the publish and guarded with a 404.
