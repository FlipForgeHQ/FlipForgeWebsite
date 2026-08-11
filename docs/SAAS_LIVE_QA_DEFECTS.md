# SaaS Live QA Defects

## 2026-08-11 — eBay Browse item ID rejected before Smart Opportunity

**Status:** Fixed in branch `agent/fix-ebay-discover-evaluation-id` pending merge/deploy validation.

During signed-in production QA, Discover successfully returned an official eBay Browse listing and opened the provider-returned listing URL, but `Evaluate with Smart Opportunity` failed in the browser with `DISCOVER_EVALUATION_INVALID: The listing ID is not safe for evaluation.`

Root cause: eBay Browse REST item IDs can use the form `v1|itemId|variationId`, while the browser-side `SAFE_EXTERNAL_ID` allowlist did not include `|` and was also narrower than the authoritative evaluation service's 200-character external listing ID bound.

Fix: allow `|` while retaining the strict character allowlist and align the browser maximum to 200 characters. Added a regression validator using the production-observed format `v1|257660255939|0` and negative unsafe-character/length cases.

Required live retest after production deploy: rerun the same Ohtani Discover candidate and confirm `Evaluate with Smart Opportunity` reaches authoritative evaluation and opens the tenant-owned saved Card Intelligence record.
