// Forge Heat v2 customer display (2026-11-02, FlipForge2 #968). Display only: every number comes from a synthetic
// fixture shaped like /api/v1/forge-heat v2; the browser never scores, ranks or changes a decision.
//
//   H1  Ranked cards show the saved Max Buy and the room under it; the deep dive leads with it.
//   H2  "Near your buying limit" lists BUY/WATCH that failed only on price, says they are not ranked, and offers
//       Open decision and Re-evaluate. A VERIFY or a ranked item smuggled into that list is never shown.
//   H3  The new reasons (identity not confirmed, no Max Buy, above Max Buy) read in plain words, never as codes.
//   H4  An older (v1) backend still renders, without the Max Buy columns or the near-limit section.
//   H5  No horizontal page overflow at phone width; no page errors.
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_HEAT_AUDIT_URL || "http://127.0.0.1:4173/app";
const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const ranked = {
  rank: 1, requestId: "req-heat-v2-001", opportunityId: "opp-heat-v2-001", cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 Refractor PSA 10",
  marketplace: "EBAY", externalListingId: "listing-heat-001", recommendation: "BUY", heat: 82, heatBand: "HOT", confidence: 91, risk: 22,
  acceptedExactSales: 18, evidenceScore: 90, allInAskCents: 40000, supportedValueCents: 52000, supportedValueGapCents: 12000, supportedValueGapPct: 30.0,
  maximumBuyPriceCents: 46000, maxBuyHeadroomCents: 6000, maxBuyHeadroomPct: 15.0, liquidity: 70, exactIdentityConfirmed: true,
  supportRating: "SUPPORTED", evaluatedAt: "2026-11-01T01:30:00Z", snapshotAgeDays: 1,
  whyHot: ["The saved all-in ask is 15.0% below the saved Max Buy of $460.00.", "Supported value is 30.0% above the saved all-in ask.", "18 exact trusted completed sales support the decision context."],
  couldCool: ["New completed-sale evidence can move supported value, confidence, and risk."],
  invalidates: ["The all-in ask rises above the saved Max Buy of $460.00."], transactionAuthority: false
};
const near = [
  { requestId: "req-near-1", opportunityId: "opp-near-1", cardIdentity: "2019 Prizm Zion Williamson #248 PSA 10", recommendation: "WATCH",
    allInAskCents: 48000, maximumBuyPriceCents: 45000, aboveMaxBuyCents: 3000, aboveMaxBuyPct: 6.7, evaluatedAt: "2026-11-01T01:30:00Z", heatAvailable: false, ranked: false, transactionAuthority: false },
  { requestId: "req-near-2", opportunityId: "opp-near-verify", cardIdentity: "Smuggled VERIFY card", recommendation: "VERIFY",
    allInAskCents: 46000, maximumBuyPriceCents: 45000, aboveMaxBuyCents: 1000, aboveMaxBuyPct: 2.2, heatAvailable: false, ranked: false, transactionAuthority: false },
  { requestId: "req-near-3", opportunityId: "opp-near-ranked", cardIdentity: "Smuggled ranked card", recommendation: "WATCH",
    allInAskCents: 46000, maximumBuyPriceCents: 45000, aboveMaxBuyCents: 1000, aboveMaxBuyPct: 2.2, heatAvailable: true, ranked: true, transactionAuthority: false }
];

function envelope(correlationId, { v2 = true, empty = false } = {}) {
  const item = v2 ? ranked : Object.fromEntries(Object.entries(ranked).filter(([k]) => !/maximumBuy|maxBuy|liquidity|exactIdentity/.test(k)));
  const data = {
    kind: "forge-heat", heatVersion: "FORGE_HEAT_V1", serviceVersion: "visual-qa", proFeature: true, locked: false,
    access: { allowed: true, currentPlan: "PRO", requiredPlan: "PRO", privateBetaPreview: false, accessState: "ACTIVE" },
    authority: { recommendationAuthority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", forgeHeatRecommendationAuthority: false, clientComputed: false, transactionAuthority: false },
    scope: { code: "SAVED_EVALUATED_UNIVERSE", marketWide: false, continuousMarketScannerActive: false, ...(v2 ? { rankingBasis: "MAX_BUY_HEADROOM" } : {}) },
    componentAvailability: { momentum: { available: false, reason: "Heat history is not yet sufficient." }, netEconomics: { available: false, reason: "V1 reports supported-value gap, not net profit." } },
    summary: { latestEvaluationsConsidered: 9, heatEligible: empty ? 0 : 1, surfaced: empty ? 0 : 1, unscored: empty ? 9 : 8,
      unscoredReasonCounts: [
        { code: "EXACT_IDENTITY_NOT_CONFIRMED", count: 3, cards: [{ opportunityId: "opp-id-1", cardIdentity: "2020 Prizm Joe Burrow #307 PSA 10", evaluatedAt: "2026-11-01T01:30:00Z" }], cardsNotListed: 2 },
        { code: "MAX_BUY_UNAVAILABLE", count: 2, cards: [], cardsNotListed: 2 },
        { code: "ASK_ABOVE_MAX_BUY", count: 4, cards: [], cardsNotListed: 4 }
      ] },
    top5: empty ? [] : [item], hiddenGems: [], highestEdge: empty ? [] : [item], unscoredPreview: [],
    ...(v2 ? { rankingBasis: "MAX_BUY_HEADROOM", nearBuyingLimit: near } : {})
  };
  return { meta: { contractVersion: "1.0", engineVersion: "visual-heat-v2", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence",
    correlationId, generatedAt: "2026-11-02T02:00:00Z", evidenceFreshness: "SAVED_COMPLETED_EVALUATION_SNAPSHOT", limitations: [] }, data };
}

const browser = await chromium.launch({ headless: true });
async function open(options, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message.slice(0, 160)));
  await page.addInitScript(() => { try { window.localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); } catch (_) {} });
  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ id: "qa-user" }), getSnapshot: () => ({ authenticated: true, email: "qa@goflipforge.com", fullName: "QA User", membershipActive: true, membershipConfigured: true }) });` }));
  await page.route("**/api/v1/forge-heat?**", route => route.fulfill({ status: 200, contentType: "application/json; charset=utf-8",
    body: JSON.stringify(envelope(route.request().headers()["x-correlation-id"] || "heat-qa", options)) }));
  await page.goto(`${baseUrl}/#/forge-heat`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForSelector(".forge-heat-shell", { timeout: 8000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }));
  const text = await page.evaluate(() => document.querySelector("#main-content")?.innerText || "");
  return { context, page, errors, text };
}

const CODES = /\b(?:EXACT_IDENTITY_NOT_CONFIRMED|MAX_BUY_UNAVAILABLE|ASK_ABOVE_MAX_BUY|MAX_BUY_HEADROOM)\b/;
try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 1000 }], ["phone", { width: 390, height: 844 }]]) {
    const { context, page, errors, text } = await open({ v2: true }, viewport);
    const headers = await page.evaluate(() => [...document.querySelectorAll(".ff-heat-table thead th")].map(th => th.textContent.trim()));
    check(`H1 ${label}: ranked table shows Max Buy and room under it`, headers.includes("Max Buy") && headers.includes("Under Max Buy"), headers.join("|"));
    check(`H1 ${label}: the saved figures are shown as returned`, /\$460\.00/.test(text) && /\$60\.00 \(15\.0%\)/.test(text));
    check(`H1 ${label}: deep dive leads with room under the saved Max Buy`, /Under saved Max Buy/i.test(text));
    check(`H1 ${label}: the ranking basis is stated in words`, /Room under Max Buy/.test(text) && !CODES.test(text));
    const nearCards = await page.evaluate(() => [...document.querySelectorAll("[data-forge-heat-near-card]")].map(li => li.getAttribute("data-forge-heat-near-card")));
    check(`H2 ${label}: near-limit list shows only the WATCH that failed on price`, nearCards.length === 1 && nearCards[0] === "opp-near-1", nearCards.join(","));
    check(`H2 ${label}: it says the cards are not ranked and shows the distance`, /Near your buying limit · not ranked/i.test(text) && /\$30\.00 above \(6\.7%\)/.test(text));
    check(`H2 ${label}: open and re-evaluate links point at the saved decision`,
      await page.locator('[data-forge-heat-near-card="opp-near-1"] a[href="#/opportunities/opp-near-1"]').count() === 1
        && await page.locator('[data-forge-heat-near-card="opp-near-1"] a[href="#/evaluate/opp-near-1"]').count() === 1);
    check(`H2 ${label}: smuggled VERIFY or ranked items never appear`, !/Smuggled/.test(text));
    if (process.env.FLIPFORGE_HEAT_V2_SHOTS) await page.screenshot({ path: `${process.env.FLIPFORGE_HEAT_V2_SHOTS}/forge-heat-v2-${label}.png`, fullPage: true }).catch(() => {});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`H5 ${label}: no horizontal page overflow`, overflow <= 4, String(overflow));
    check(`H5 ${label}: no page errors`, errors.length === 0, errors.join(" | "));
    await context.close();
  }
  {
    const { context, errors, text } = await open({ v2: true, empty: true });
    check("H3 empty state: identity reason in plain words", /The saved decision did not confirm the exact card/.test(text));
    check("H3 empty state: Max Buy reasons in plain words", /No Max Buy was saved with the decision/.test(text) && /Priced above your saved Max Buy/.test(text));
    check("H3 empty state: no raw reason codes", !CODES.test(text), (text.match(CODES) || [""])[0]);
    check("H3 empty state: near-limit list still shown", /Near your buying limit/i.test(text));
    check("H3 empty state: no page errors", errors.length === 0, errors.join(" | "));
    await context.close();
  }
  {
    const { context, page, errors, text } = await open({ v2: false });
    const headers = await page.evaluate(() => [...document.querySelectorAll(".ff-heat-table thead th")].map(th => th.textContent.trim()));
    check("H4 v1 backend: ranked table renders without Max Buy columns", headers.includes("Value Gap") && !headers.includes("Max Buy"), headers.join("|"));
    check("H4 v1 backend: no near-limit section", !/Near your buying limit/i.test(text));
    check("H4 v1 backend: ranking basis reads as value gap", /Value gap \(V1\)/.test(text));
    check("H4 v1 backend: no page errors", errors.length === 0, errors.join(" | "));
    await context.close();
  }
} catch (error) {
  failures.push(`audit did not complete: ${String(error.message || error).split("\n")[0]}`);
} finally {
  await browser.close();
}
console.log("Forge Heat v2 customer display audit");
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure}`);
if (failures.length) process.exitCode = 1;
