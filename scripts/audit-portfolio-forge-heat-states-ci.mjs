// Portfolio and Forge Heat customer states, in the full app shell (every script; only server responses are controlled).
//
// Portfolio:
//   - when card values are paused (every holding reports earlier reported-sale history as not used), one plain
//     "Card values are paused" message replaces per-row "Unavailable" and the partial-coverage warning; the cards and
//     what was paid are still shown;
//   - with Sell Watch on, the saved selling-cost channels are listed and every card links to Check a price on its
//     tracked card; with Sell Watch off (404) there is no Sell Watch section, link or column;
//   - no horizontal overflow on a phone.
// Forge Heat:
//   - when nothing qualifies, the empty state says why, grouping the server's own reasons with counts;
//   - with no evaluations at all it says to evaluate a card, with no reasons block;
//   - a page with ranked cards is unchanged (no reasons block).
// Synthetic fixtures only: no network, no provider calls, no marketplace data.
import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const email = "states-audit@flipforge.test";
const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);
const meta = correlationId => ({ contractVersion: "1.0", engineVersion: "states-audit", authority: "Smart Opportunity",
  gradingAuthority: "Existing PSA intelligence", correlationId, limitations: ["Synthetic audit fixture."] });

// ---- fixtures ------------------------------------------------------------------------------------------------------
const pausedReference = { available: false, status: "PROVIDER_STORED_HISTORY_NOT_RETAINED", valueCents: null,
  method: "AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES", acceptedExactCompletedSales: 0, minimumAcceptedExactSales: 3,
  maximumLatestSaleAgeDays: 30, latestSaleAgeDays: null, latestSaleDate: null, marketplaces: [], exactIdentityRequired: true,
  activeListingsUsed: false, providerCallPerformed: false, persistedAsValuation: false, appraisal: false, transactionAuthority: false };
const pausedPerformance = { available: false, status: "REFERENCE_VALUE_UNAVAILABLE", method: "EVIDENCE_REFERENCE_MINUS_CUSTOMER_COST_BASIS",
  realized: false, feesIncluded: false, taxesIncluded: false, liquidationEstimate: false, appraisal: false, transactionAuthority: false,
  acquisitionCostCents: null, referenceValueCents: null, referenceDeltaCents: null, referenceDeltaPercent: null };
const holdings = [
  ["opp-ohtani-psa10", 121500, "2026-09-13T00:00:00Z"],
  ["opp-lebron-psa9", 48000, "2026-08-02T00:00:00Z"]
];
function portfolio() {
  return { kind: "portfolio", configured: true, readOnly: false, status: "CUSTOMER_COST_BASIS_AVAILABLE_REFERENCE_VALUE_UNAVAILABLE",
    currentValueConfigured: true, currentValueType: "EVIDENCE_SUPPORTED_REFERENCE_NOT_APPRAISAL",
    currentValueMethod: "AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES", performanceConfigured: true, performanceType: "UNREALIZED_REFERENCE_COMPARISON",
    count: holdings.length, totalCostBasisCents: 169500, referenceValueAvailableCount: 0, performanceAvailableCount: 0,
    completeReferenceCoverage: false, completePerformanceCoverage: false, coveredReferenceValueCents: 0, coveredCostBasisCents: 0,
    coveredReferenceDeltaCents: 0, completePortfolioReferenceValueCents: null, completePortfolioReferenceDeltaCents: null,
    feesIncluded: false, taxesIncluded: false, liquidationEstimate: false, appraisal: false, transactionAuthority: false,
    items: holdings.map(([id, cost, at]) => ({ opportunityId: id, trackingStatus: "OWNED", outcomeStatus: "ACQUIRED",
      acquisitionCostCents: cost, acquiredAt: at, referenceValue: { ...pausedReference }, referencePerformance: { ...pausedPerformance } })),
    writeContract: "/api/v1/lifecycle/{opportunityId}" };
}
const opportunities = { kind: "opportunities", items: [
  { id: "opp-ohtani-psa10", title: "2018 Topps Chrome Shohei Ohtani #150 PSA 10", cardIdentity: "2018 Topps Chrome #150 Shohei Ohtani PSA 10" },
  { id: "opp-lebron-psa9", title: "2003 Topps Chrome LeBron James #111 PSA 9", cardIdentity: "2003 Topps Chrome #111 LeBron James PSA 9" }] };
const sellWatch = { kind: "sell-watch", configured: true, tenantScoped: true, authority: "POSITION_REVIEW_PROMPT_ONLY",
  transactionAuthority: false, acquisitionDecisionAffected: false, marketComparisonDisplayed: false,
  marketComparisonStatus: "NO_LICENSED_SOURCE_ACTIVE", count: 2, costBasisAvailableCount: 2,
  items: holdings.map(([id, cost]) => ({ opportunityId: id, acquisitionCostCents: cost, quantity: 1, costBasisStatus: "NET_ESTIMATE_AVAILABLE",
    marketComparison: { displayed: false, status: "NO_LICENSED_SOURCE_ACTIVE", evaluated: true } })),
  costProfiles: [{ channel: "MARKETPLACE", channelName: "Marketplace", version: 2 }, { channel: "AUCTION_HOUSE", channelName: "Auction house", version: 1 }],
  channels: [] };

// Reasons copied verbatim from FlipForge2 SaaSForgeHeatService.score() and the legacy marker it adds.
const R = {
  sales: "At least 3 exact trusted completed sales are required.",
  pass: "Smart Opportunity is PASS; Forge Heat cannot override it.",
  value: "Evidence-supported value is unavailable.",
  gap: "Evidence-supported value does not exceed the all-in ask.",
  age: "The saved evaluation is outside the Forge Heat V1 freshness window."
};
function heat({ considered, unscored, ranked = false, reasonCounts = null }) {
  const top = ranked ? [{ rank: 1, requestId: "req-heat-1", opportunityId: "opp-heat-1", cardIdentity: "2020 Prizm Justin Herbert #325 PSA 10",
    recommendation: "BUY", heat: 84, heatBand: "HOT", confidence: 82, risk: 30, acceptedExactSales: 6, allInAskCents: 30000,
    supportedValueCents: 36000, supportedValueGapCents: 6000, supportedValueGapPct: 20, whyHot: ["Six matched sales."], couldCool: [],
    invalidates: [], transactionAuthority: false, evaluatedAt: "2026-10-20T00:00:00Z" }] : [];
  return { kind: "forge-heat", heatVersion: "FORGE_HEAT_V1", serviceVersion: "audit", proFeature: true, locked: false,
    access: { allowed: true, currentPlan: "PRIVATE_BETA", requiredPlan: "PRO", privateBetaPreview: true, accessState: "ACTIVE" },
    authority: { recommendationAuthority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence",
      forgeHeatRecommendationAuthority: false, clientComputed: false, transactionAuthority: false },
    scope: { code: "SAVED_EVALUATED_UNIVERSE", marketWide: false, continuousMarketScannerActive: false, description: "Audit." },
    componentAvailability: { momentum: { available: false, reason: "Heat history is not yet sufficient." } },
    top5: top, hiddenGems: [], highestEdge: top,
    summary: { latestEvaluationsConsidered: considered, heatEligible: top.length, surfaced: top.length, unscored: unscored.length,
      legacyDerivedExcluded: unscored.filter(u => u.legacy).length, ...(reasonCounts ? { unscoredReasonCounts: reasonCounts } : {}) },
    unscoredPreview: unscored.slice(0, 10).map((u, i) => ({ requestId: `req-u-${i}`, opportunityId: `opp-u-${i}`,
      cardIdentity: `Synthetic card ${i}`, recommendation: "WATCH", evaluatedAt: "2026-10-01T00:00:00Z", heatAvailable: false,
      reasons: u.reasons, ...(u.legacy ? { evidenceProvenanceStatus: "LEGACY_PROVIDER_DERIVED", legacyNotice: "Earlier reported-sale history." } : {}) })) };
}
const mixed = [
  { reasons: [R.sales, R.value] }, { reasons: [R.sales] }, { reasons: [R.sales, R.gap] },
  { reasons: [R.pass, R.sales] }, { reasons: [R.age] }, { reasons: [R.sales], legacy: true }, { reasons: [], legacy: true }
];

// ---- browser -------------------------------------------------------------------------------------------------------
process.on("unhandledRejection", error => {
  console.log(`::error title=states-audit::${String(error?.message || error).split("\n")[0]}`);
  process.exit(1);
});
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });

async function session(hash, { viewport = { width: 1440, height: 1000 }, watch = "on", heatData = null } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => { errors.push(`dialog: ${dialog.type()}`); dialog.dismiss(); });
  await page.addInitScript(({ email }) => {
    localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
    let hash = 2166136261;
    for (const ch of email.toLowerCase()) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    const key = (hash >>> 0).toString(36);
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.welcome`, "seen");
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.enabled`, "off");
  }, { email });
  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "${email}" }), getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "States Audit", membershipActive: true, membershipConfigured: true }) });` }));
  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "(() => {})();" }));
  await page.route("**/api/v1/**", route => {
    const url = new URL(route.request().url());
    const correlationId = route.request().headers()["x-correlation-id"] || "states-audit";
    if (url.pathname === "/api/v1/health") return json(route, 200, { meta: { contractVersion: "1.0", correlationId }, data: { status: "configured" } });
    if (url.pathname === "/api/v1/portfolio") return json(route, 200, { meta: meta(correlationId), data: portfolio() });
    if (url.pathname === "/api/v1/opportunities") return json(route, 200, { meta: meta(correlationId), data: opportunities });
    if (url.pathname === "/api/v1/sell-watch") {
      if (watch === "off") return json(route, 404, { error: { code: "UPSTREAM_REJECTED", message: "Off in this audit.", correlationId } });
      return json(route, 200, { meta: meta(correlationId), data: sellWatch });
    }
    if (url.pathname === "/api/v1/forge-heat" && heatData) return json(route, 200, { meta: meta(correlationId), data: heatData });
    return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Not in this fixture.", correlationId } });
  });
  await page.goto(`${baseUrl}/${hash}`, { waitUntil: "load" });
  return { context, page, errors };
}
const text = async (page, selector) => (await page.locator(selector).first().innerText().catch(() => "")).replace(/\s+/g, " ");

// 1. Portfolio, values paused, Sell Watch on.
{
  const { context, page, errors } = await session("#/portfolio");
  await page.waitForSelector("[data-portfolio-values-paused]", { timeout: 30000 });
  await page.waitForSelector("[data-portfolio-sell-watch]", { timeout: 10000 }).catch(() => {});
  const t = await text(page, ".customer-portfolio-page");
  check("P1 one plain paused message", /Card values are paused/.test(t) && /moving to licensed sales data/.test(t), t.slice(0, 300));
  check("P2 no per-row Unavailable and no partial-coverage warning", !/Unavailable/.test(t) && !/Partial coverage/i.test(t) && !/Coverage-aware totals/i.test(t));
  check("P3 cards, what was paid and totals still shown", /Shohei Ohtani/.test(t) && /\$1,215\.00/.test(t) && /\$480\.00/.test(t) && /\$1,695\.00/.test(t) && /2026-09-13/.test(t));
  check("P4 Sell Watch section lists the saved channels", /Selling costs saved for: Marketplace, Auction house/.test(t));
  const links = await page.locator('.customer-portfolio-page a[href^="#/tracking/"]').evaluateAll(as => as.map(a => a.getAttribute("href")));
  check("P5 each card links to Check a price on its tracked card", links.includes("#/tracking/opp-ohtani-psa10") && links.includes("#/tracking/opp-lebron-psa9"), links.join(","));
  check("P6 no instruction wording", !/\b(should|recommend(ed)?|guaranteed|sell now)\b/i.test(t));
  check("P7 no page errors", errors.length === 0, errors.join(" | "));
  await page.locator(".customer-portfolio-page").screenshot({ path: process.env.STATES_SHOT_DIR ? `${process.env.STATES_SHOT_DIR}/portfolio-paused.png` : "/dev/null" }).catch(() => {});
  await context.close();
}
// 2. Portfolio, Sell Watch off.
{
  const { context, page } = await session("#/portfolio", { watch: "off" });
  await page.waitForSelector("[data-portfolio-values-paused]", { timeout: 30000 });
  await page.waitForTimeout(800);
  const t = await text(page, ".customer-portfolio-page");
  check("P8 Sell Watch off: no Sell Watch section, column or link", !/Sell Watch/.test(t) && !/Check a price/.test(t)
    && await page.locator('.customer-portfolio-page a[href^="#/tracking/"]').count() === 0);
  await context.close();
}
// 3. Portfolio on a phone.
{
  const { context, page } = await session("#/portfolio", { viewport: { width: 390, height: 844 } });
  await page.waitForSelector("[data-portfolio-values-paused]", { timeout: 30000 });
  await page.waitForTimeout(500);
  check("P9 no horizontal overflow on a phone", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await context.close();
}
// 4. Forge Heat, nothing qualifies: reasons with counts.
{
  const { context, page, errors } = await session("#/forge-heat", { heatData: heat({ considered: 9, unscored: mixed }) });
  await page.waitForSelector("[data-forge-heat-why]", { timeout: 30000 });
  const t = await text(page, "[data-forge-heat-why]");
  check("F1 empty state says why nothing qualifies", /Why nothing qualifies yet/i.test(t) && /Your 7 evaluations that were not ranked/.test(t), t);
  check("F2 reasons grouped and counted from the server's reasons", /Fewer than 3 exactly matched completed sales 4/.test(t)
    && /Based on earlier sales FlipForge no longer uses 2/.test(t) && /No evidence-supported value 1/.test(t)
    && /Supported value is not above the asking price 1/.test(t) && /The decision is not BUY or WATCH 1/.test(t)
    && /Evaluated more than 30 days ago 1/.test(t), t);
  check("F3 the most common reason is listed first", /^WHY NOTHING QUALIFIES YET .*? Fewer than 3 exactly matched completed sales 4/i.test(t), t.slice(0, 160));
  check("F4 no page errors", errors.length === 0, errors.join(" | "));
  await page.locator(".forge-heat-empty").screenshot({ path: process.env.STATES_SHOT_DIR ? `${process.env.STATES_SHOT_DIR}/heat-why.png` : "/dev/null" }).catch(() => {});
  await context.close();
}
// 4b. Forge Heat, nothing qualifies, newer backend: the server's counts over every unscored evaluation are used.
{
  const many = Array.from({ length: 25 }, () => ({ reasons: [R.sales] }));
  const counts = [{ code: "THIN_EXACT_EVIDENCE", count: 20 }, { code: "LEGACY_DERIVED_EXCLUDED", count: 3 },
    { code: "DECISION_NOT_BUY_OR_WATCH", count: 2 }, { code: "SOMETHING_NEW", count: 1 }];
  const { context, page, errors } = await session("#/forge-heat", { heatData: heat({ considered: 25, unscored: many, reasonCounts: counts }) });
  await page.waitForSelector("[data-forge-heat-why]", { timeout: 30000 });
  const t = await text(page, "[data-forge-heat-why]");
  check("F7 server counts: scope covers every evaluation that was not ranked", /All 25 of your evaluations that were not ranked/.test(t)
    && await page.locator('[data-forge-heat-why-source="server"]').count() === 1, t);
  check("F8 server counts are shown as given, not limited to the 10 in the preview", /Fewer than 3 exactly matched completed sales 20/.test(t)
    && /Based on earlier sales FlipForge no longer uses 3/.test(t) && /The decision is not BUY or WATCH 2/.test(t) && /Other 1/.test(t), t);
  check("F9 no page errors with server counts", errors.length === 0, errors.join(" | "));
  await context.close();
}
{
  const bad = [{ code: "THIN_EXACT_EVIDENCE", count: 999 }];
  const { context, page } = await session("#/forge-heat", { heatData: heat({ considered: 9, unscored: mixed, reasonCounts: bad }) });
  await page.waitForSelector("[data-forge-heat-why]", { timeout: 30000 });
  const t = await text(page, "[data-forge-heat-why]");
  check("F10 a count larger than the number not ranked is ignored: the preview grouping is shown instead",
    /Your 7 evaluations that were not ranked/.test(t) && !/999/.test(t), t);
  await context.close();
}
// 5. Forge Heat, no evaluations yet.
{
  const { context, page } = await session("#/forge-heat", { heatData: heat({ considered: 0, unscored: [] }) });
  await page.waitForSelector(".forge-heat-empty", { timeout: 30000 });
  const t = await text(page, ".forge-heat-empty");
  check("F5 no evaluations: says to evaluate a card, no reasons block", /Evaluate a card to start/.test(t) && await page.locator("[data-forge-heat-why]").count() === 0, t);
  await context.close();
}
// 6. Forge Heat with ranked cards: unchanged.
{
  const { context, page } = await session("#/forge-heat", { heatData: heat({ considered: 9, unscored: mixed, ranked: true }) });
  await page.waitForSelector(".forge-heat-shell", { timeout: 30000 });
  await page.waitForTimeout(800);
  check("F6 ranked cards: no reasons block", await page.locator("[data-forge-heat-why]").count() === 0);
  await context.close();
}
// 7. Forge Heat on a phone.
{
  const { context, page } = await session("#/forge-heat", { viewport: { width: 390, height: 844 }, heatData: heat({ considered: 9, unscored: mixed }) });
  await page.waitForSelector("[data-forge-heat-why]", { timeout: 30000 });
  check("F7 no horizontal overflow on a phone", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await context.close();
}

await browser.close();
console.log(`Portfolio and Forge Heat states audit: ${passes.length} passed, ${failures.length} failed.`);
for (const failure of failures) console.log(`FAIL ${failure}\n::error title=states-audit::${failure}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Portfolio and Forge Heat states\n\n${passes.length} passed, ${failures.length} failed.\n${failures.map(f => `- FAIL ${f}`).join("\n")}\n`);
}
if (failures.length) process.exit(1);
