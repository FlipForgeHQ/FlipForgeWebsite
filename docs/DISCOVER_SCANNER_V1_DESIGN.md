# Discover Scanner v1 — Senior Engineering Design

## Product goal

Turn customer Discover from a stacked active-listing card view into a fast comparison and selection workspace without creating a second decision engine in the browser.

The scanner is a presentation and selection layer over authoritative Discover data. Smart Opportunity remains the only BUY/WATCH/VERIFY/PASS authority.

## v1 architecture

### 1. Server-owned search scope

The existing exact-card search contract remains unchanged:

- exact card identity;
- optional target maximum buy;
- bounded result count;
- provider-backed active listings;
- server-owned Discovery rank and Discovery score;
- server-provided trusted sold-evidence context;
- explicit evaluator eligibility.

No new client-side query can assert identity, evidence, confidence, supported value, grading authority, or recommendation authority.

### 2. Browser-only result refinement

After the authoritative response is validated, the scanner may reorganize only the already-returned exact listings.

v1 view controls:

- maximum all-in ask;
- trusted sold context present / absent;
- minimum server-provided confidence;
- connected source;
- listing state;
- listing format;
- view sorting by server rank, ask, confidence, trusted sales, risk, or Discovery score.

These controls do not trigger a network request and do not mutate the returned candidate objects.

The UI must explicitly state that filtering and sorting do not recalculate:

- server rank;
- evidence;
- confidence;
- risk;
- Discovery score;
- Smart Opportunity recommendation.

### 3. Explicit listing selection

No listing is auto-selected.

The customer chooses one exact returned listing. Selection expands the existing listing details and exposes the existing governed evaluation action.

The scanner does not construct a new evaluation contract. It reuses the already bound `data-discovery-evaluate` control owned by `customer-discovery.js`, which reconstructs the existing allowlisted evaluation payload and posts to `/api/v1/evaluations`.

### 4. Responsive information architecture

Desktop is a dense scanner:

| Select | Server rank | Listing | All-in ask | Sold context | Confidence | Listing state | Discovery score |

The listing cell carries connected-source context. Confidence carries risk context. Ask may carry listing-format context.

Tablet and mobile collapse the same row into labeled cells rather than forcing horizontal scrolling.

Selecting a listing expands:

- price position;
- ranking context;
- server ranking explanation;
- open-listing link;
- governed evaluation button;
- active-listing/evidence boundary.

## Why v1 does not expose sport/year/set/parallel filters yet

The current production Discover endpoint searches one exact card identity. Adding global sport/year/release/parallel facets only in the browser would be fake filtering because the browser has never received the rest of the market.

A real market scanner requires a server-owned scan contract.

## v2 backend contract

Add a separate read-only endpoint rather than overloading the proven exact-card path:

`POST /api/v1/discover/scan`

Recommended request shape:

```json
{
  "scope": {
    "sport": "BASEBALL",
    "player": "Shohei Ohtani",
    "year": 2018,
    "releaseId": "server-authorized-id",
    "parallelId": "server-authorized-id",
    "grader": "PSA",
    "grade": "10"
  },
  "price": {
    "minCents": 0,
    "maxCents": 100000
  },
  "marketplaces": ["EBAY"],
  "listingFormats": ["FIXED_PRICE"],
  "page": {
    "limit": 50,
    "cursor": null
  }
}
```

### v2 rules

1. Release, set, insert and parallel facets come from the authoritative Release Registry / Card Taxonomy Intelligence layer.
2. Unknown or unverified release taxonomy never becomes an inferred exact identity.
3. The response states the taxonomy version and provenance used for scope classification.
4. Cursor pagination is server-owned and opaque.
5. Provider credentials remain server-side.
6. Active asks remain non-evidence.
7. Scanner search creates no tenant-owned opportunity.
8. Evaluation remains explicit per listing.
9. No browser-computed price gap or recommendation is introduced.
10. Sorting by server rank remains the default.

## Decision filtering belongs elsewhere

Raw Discover listings do not yet have BUY/WATCH/VERIFY/PASS decisions.

Therefore v1 and v2 should not offer a recommendation filter unless a listing has already passed through governed evaluation. Filtering by decision belongs naturally in Saved Decisions / Opportunities.

Pre-evaluating every Discover row merely to make a decision filter available would increase provider/evaluation cost, create stale-decision problems, and blur the explicit-evaluation boundary.

## Scaling

For larger result sets:

- use server cursor pagination;
- cap each browser page;
- keep DOM rendering bounded;
- add row virtualization only after real result volumes justify it;
- preserve server rank as immutable row metadata;
- never rely on browser sorting to define canonical rank.

## Release gates

A scanner change is releaseable only when:

- existing Discover authority validation still passes;
- scanner validator passes;
- production-route authority remains green;
- customer-state destructive audit remains green;
- customer chaos stress remains green;
- full-site desktop/tablet/mobile visual QA remains green;
- no new browser storage, provider credential, evidence acceptance, grading authority, recommendation authority, or transaction authority appears.

## Phase sequence

1. **v1 preview:** exact-result scanner table + browser view filters + explicit selection.
2. **v1 validation:** usability, mobile density, accessibility, stress, and existing authority gates.
3. **v2 backend:** authoritative market-scan endpoint + taxonomy-backed facets + pagination.
4. **v2 UI:** sport/player/year/release/parallel/grade filters backed by real server scope.
5. **Later:** saved scanner presets only after a server-side tenant-owned preference model is deliberately designed.
