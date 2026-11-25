# Research content on the website

Every research figure on goflipforge.com comes from one versioned file, `contracts/research-findings-v1.json`. The
file is never served: `/contracts/*` answers 404.

## Files

| File | Role |
|---|---|
| `contracts/research-findings-v1.json` | The source. Each finding has its value, classification, source, sample, method, limitations and publication status. |
| `scripts/build-research-sections.mjs` | Renders the homepage and Decision Proof blocks from the source. It has a `--check` mode (used in CI and the Netlify build) and a `--preview` mode. |
| `scripts/validate-research-content-v1.mjs` | Checks governance, with 43 checks covering: arithmetic, publication gating, provider rights, honest labels, and analytics allow-lists. |
| `scripts/audit-research-sections-ci.mjs` | Rendered audit of public and preview pages, desktop and phone. |
| `assets/css/research-sections-v1.css`, `assets/js/research-sections-v1.js` | Presentation, counters, chart tooltips and engagement counts. |

## Publication

**Public pages.** A finding appears on a public page only when all of these are true:
- `publication.status` is `APPROVED`;
- `blockers` is empty;
- `approvedBy` and `approvedOn` are set.

Everything else appears only in the internal preview. `node scripts/build-research-sections.mjs --preview` writes
`research-preview/`. That folder is git-ignored, answers 404 if served, and is removed from the publish directory.

**Unreconciled figures.** A figure that cannot be traced to a FlipForge record is `UNRECONCILED`. It never appears as a
finding. The preview names it only in the reconciliation note.

## Approving a finding

1. **Clear every blocker.** For figures derived from Hobby Card Index, that means HCI's written permission to show
   them publicly. Approved provider figures carry the credit "Prices from Hobby Card Index".
2. **Record the approval.** Set `status` to `APPROVED`, empty `blockers`, and fill in `approvedBy` and `approvedOn`.
   Bump `version`.
3. **Rebuild and check:**
   ```
   node scripts/build-research-sections.mjs
   node scripts/validate-research-content-v1.mjs
   ```

## Adding D7, D14 and D30 results (backend issue #1024)

1. Add the results as findings.
   - Use classification `INDEPENDENTLY_VERIFIED_OUTCOME` for outcomes measured from an authorized independent source.
   - Use `PROVIDER_REPORTED_OUTCOME` for results reported by one provider only.
2. Update `accountability.horizons`.
3. Rebuild.

No layout change is needed.

## Rules the validator enforces

**Labelling:**
- The diagnostic valuation difference is never called accuracy.
- Modeled economics are never called realized results or an avoided-loss rate.
- Synthetic tests are never presented as purchasing accuracy.

**Withdrawn and unnamed data:**
- Proof100 stays withdrawn.
- The former listing-data provider is never named.

## Supported modeled-loss finding (`modeled-losses-three`)

| Item | Value |
|---|---|
| Result | $117.59 modeled loss on $951.43 of asking prices (12.36%) |
| Sample | The 4 of 21 Nov 20, 2026 real-listing evaluations whose asking price was below FlipForge's own supported value. 3 of the 4 modeled a loss. |
| Method | Modeled net proceeds = supported value − 13% selling fees − $5 fulfilment. Modeled result = net proceeds − asking price, rounded to the cent per listing. The total is the sum of the three negative results. |
| Listings | Trout #US175 PSA 10: ask $906.49, value $922.50, −$108.91 · Morant #249 PSA 10: ask $24.95, value $26.00, −$7.33 · Tatis Jr. #203 PSA 10: ask $19.99, value $27.17, −$1.35 · (Ohtani #150 PSA 10: ask $945, value $1,225, +$115.75, not a loss) |
| Evidence source | FlipForge's own disclosed supported values from the Nov 20 staging run (FlipForge2 issue #1024, initial analysis). This is not provider-derived, but the values were built from licensed listing data at the time. |
| Limitations | Selected listings, not a rate. Modeled, not realized. The engine's own value is the price input, not independent market truth. None of the four received BUY, so this is not an avoided loss. Issue #1024: never publish as an avoided-loss rate. |
| Status | INTERNAL_PREVIEW, pending founder approval. |

Two other requested figures could not be traced to any FlipForge record and were removed on Nov 25, 2026 (founder decision).
