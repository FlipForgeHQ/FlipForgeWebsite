// Saved-decision provider attribution (HCI decision path, backend PR #1023). Display only: every value comes from a
// synthetic fixture shaped like the production API. A decision made on licensed Hobby Card Index sales carries
// governedDecision.sourceAttributions; the licence requires "Prices from Hobby Card Index" wherever a figure derived from
// those sales is shown. Nothing is computed here.
//
//   A1  A saved decision with the attribution shows the credit, as a link to hobbycardindex.com opening in a new tab,
//       beside the supported value on the card page and in the Decision Receipt ("Price source").
//   A2  The saved list shows the credit under that decision's supported value, and only there.
//   A3  A decision without an attribution shows no credit anywhere (no provider is named for other evidence).
//   A4  Anything other than the one approved credit (another text, another link, a javascript: link) is never rendered.
//   A5  Desktop and phone: no page errors, no sideways scroll.
//
// The production host is mapped to the local server (saas-prototype/serve.mjs, port 4173 or FLIPFORGE_SDT_AUDIT_PORT).
import { chromium } from "playwright";

const PORT = process.env.FLIPFORGE_SDT_AUDIT_PORT || "4173";
const BETA = `http://goflipforge.com:${PORT}/app/beta/`;
const CUSTOMER = `http://goflipforge.com:${PORT}/app/customer/`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE || undefined;
const email = "attribution-audit@flipforge.test";
const CREDIT = "Prices from Hobby Card Index";
const CREDIT_URL = "https://hobbycardindex.com";

const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${String(detail).slice(0, 400)}]` : name);

const CARDS = {
  "qa-attr-hci": { title: "2020 Panini Prizm Justin Jefferson #398 PSA 10", recommendation: "BUY", ask: 55, value: 10325, maxBuy: 6121, count: 8,
    attributions: [{ text: CREDIT, url: CREDIT_URL, required: true }] },
  "qa-attr-plain": { title: "2018 Topps Update Juan Soto #US300 PSA 10", recommendation: "WATCH", ask: 44.99, value: 3784, maxBuy: 2900, count: 12,
    attributions: [] },
  "qa-attr-hostile": { title: "2019 Panini Prizm Zion Williamson #248 PSA 10", recommendation: "WATCH", ask: 25, value: 2050, maxBuy: 1500, count: 9,
    attributions: [{ text: "Prices from Some Other Site", url: "https://example.com", required: true },
      { text: CREDIT, url: "javascript:alert(1)", required: true }, { text: "<img src=x onerror=alert(1)>", url: CREDIT_URL }] }
};
const IDS = Object.keys(CARDS);

function opportunity(id) {
  const c = CARDS[id];
  return {
    id, title: c.title, cardIdentity: c.title, recommendation: c.recommendation, ask: c.ask, supportedValue: c.value / 100,
    supportedValueCents: c.value, confidence: 88, liquidity: 75, risk: 35, rank: 90, observedAt: "2026-11-25T03:00:00Z", platform: "EBAY",
    mappingState: "NOT_CONFIRMED", recommendationSource: "GOVERNED_SNAPSHOT", evidenceProvenanceStatus: "CURRENT_EVIDENCE_RULES", legacyNotice: null,
    evidence: { acceptedSales: 0, priceStatus: "LIVE_PRICING_ONLY" },
    governedDecision: {
      available: true, recommendation: c.recommendation, confidence: 88, risk: 35, reason: `${c.recommendation}: saved reason.`, evaluatedAt: "2026-11-25T03:00:00Z",
      supportedValueCents: c.value, supportedValueStatus: "ESTABLISHED", maximumBuyPriceCents: c.maxBuy, allInAskCents: Math.round(c.ask * 100),
      exactTrustedCompCount: c.count, snapshotCount: 1, immutable: true, transactionAuthority: false, sourceAttributions: c.attributions
    }
  };
}
function evidence(id) {
  const c = CARDS[id];
  return { kind: "evidence", readOnly: true, opportunityId: id, cardIdentity: c.title, acceptedExactCompletedSales: 0, visibleButAuthorityIneligible: 0,
    currentAdmission: { admitted: 0, excluded: 0, held: 0, notUsed: 0, linkedRows: 0, policy: "qa" }, linkedEvidence: [], manualCandidates: [], timeline: [],
    evidenceProvenanceStatus: "CURRENT_EVIDENCE_RULES", internalOperatorFieldsExcluded: true, transactionAuthority: false,
    decisionTime: { available: true, evaluatedAt: "2026-11-25T03:00:00Z", recommendation: c.recommendation, askPrice: c.ask, supportedValue: c.value / 100,
      salesCountAtDecision: c.count, immutable: true } };
}
function lifecycle(id) {
  return { opportunityId: id, trackingStatus: "WATCHING", outcomeStatus: "NONE", reviewAt: null, alertEnabled: true, version: 1, recordVersion: 1,
    acquisitionCostCents: null, acquiredAt: null, dispositionProceedsCents: null, disposedAt: null, updatedAt: "2026-11-25T03:00:00Z" };
}
const envelope = (correlationId, data) => ({
  meta: { contractVersion: "1.0", engineVersion: "attribution-audit", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence",
    correlationId, generatedAt: "2026-11-25T03:00:00Z", evidenceFreshness: "MIXED_DISPLAY_ONLY", limitations: [] },
  data
});
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) }).catch(() => {});

async function fixture(route) {
  const url = new URL(route.request().url());
  const cid = route.request().headers()["x-correlation-id"] || "attribution-audit";
  if (route.request().method().toUpperCase() !== "GET") return json(route, 405, { error: { code: "QA_READ_ONLY", message: "No writes.", correlationId: cid } });
  const p = url.pathname;
  const record = p.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor|lifecycle)\/([^/]+)$/);
  if (record) {
    const id = decodeURIComponent(record[2]);
    if (!CARDS[id]) return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Unknown synthetic record.", correlationId: cid } });
    if (record[1] === "opportunities") return json(route, 200, envelope(cid, { kind: "opportunity-detail", opportunity: opportunity(id), sourceOfTruth: "SQLite", transactionAuthority: false }));
    if (record[1] === "evidence") return json(route, 200, envelope(cid, evidence(id)));
    if (record[1] === "psa-advisor") return json(route, 200, envelope(cid, { kind: "psa-advisor", opportunityId: id, cardIdentity: CARDS[id].title, guidanceStatus: "NOT_AVAILABLE",
      authoritativeOpportunityRecommendation: CARDS[id].recommendation, recalculated: false, savedPsaSnapshot: {}, populationContext: {}, transactionAuthority: false }));
    return json(route, 200, envelope(cid, { kind: "lifecycle-detail", opportunityId: id, sourceOfTruth: "SQLite", lifecycle: lifecycle(id), history: [], transactionAuthority: false }));
  }
  if (p.startsWith("/api/v1/card-intelligence/")) return json(route, 503, { error: { code: "CARD_INTELLIGENCE_UNAVAILABLE", message: "Unavailable.", correlationId: cid } });
  if (p === "/api/v1/health") return json(route, 200, envelope(cid, { status: "configured", bridgeEnabled: true, providerEvidenceMode: "PROVIDER_SALES_OFF", evidenceStorageGuard: "VERIFIED" }));
  if (p === "/api/v1/entitlements") return json(route, 200, envelope(cid, { kind: "entitlements", membershipActive: true, current: { code: "PRIVATE_BETA", accessState: "ACTIVE" }, plan: { code: "PRIVATE_BETA" }, usage: { completedEvaluations: 0 } }));
  if (p === "/api/v1/opportunities") return json(route, 200, envelope(cid, { kind: "opportunities", items: IDS.map(opportunity), count: IDS.length, sourceOfTruth: "SQLite", transactionAuthority: false }));
  if (p === "/api/v1/dashboard") return json(route, 200, envelope(cid, { kind: "dashboard", readOnly: true, source: "SQLite saved governed records",
    metrics: { trackedOpportunities: IDS.length, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 0 }, opportunities: IDS.map(opportunity), items: IDS.map(opportunity) }));
  if (p === "/api/v1/lifecycle") return json(route, 200, envelope(cid, { kind: "lifecycle", sourceOfTruth: "SQLite", items: IDS.map(lifecycle), transactionAuthority: false }));
  return json(route, 404, { error: { code: "QA_NOT_MOCKED", message: p, correlationId: cid } });
}

const browser = await chromium.launch({ executablePath, args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"] });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
async function open(base, route, device) {
  const context = await browser.newContext(device || { viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); localStorage.setItem("flipforge.guidedMode.enabled", "false"); } catch (_) {} });
  await context.route(/\/assets\/js\/flipforge-identity\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${email}"}),getSnapshot:()=>({authenticated:true,email:"${email}",fullName:"Attribution Audit",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${email}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"t"});` }));
  await context.route(/\/assets\/js\/flipforge-production-signin\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/v1/**", fixture);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message.slice(0, 160)));
  page.on("dialog", d => { errors.push(`dialog ${d.message()}`); d.dismiss().catch(() => {}); });
  await page.goto(`${base}#/${route}`, { waitUntil: "load" });
  await page.waitForSelector("#main-content [data-customer-opportunity], #main-content .customer-intelligence-hero", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }));
  await page.waitForTimeout(300);
  return { context, page, errors };
}
const links = page => page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-source-attribution] a")].map(a => ({
  text: a.textContent.trim(), href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel"),
  inReceipt: Boolean(a.closest("[data-ff-ux-receipt-panel]")), inHero: Boolean(a.closest(".customer-intelligence-hero")) })));
const text = page => page.evaluate(() => document.querySelector("#main-content")?.textContent.replace(/\s+/g, " ") || "");
const noScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

try {
  for (const [label, device] of [["desktop", null], ["phone", PHONE]]) {
    for (const [surface, base] of [["beta", BETA], ["customer", CUSTOMER]]) {
      const tag = `${label} ${surface}`;
      {
        const s = await open(base, "opportunities/qa-attr-hci", device);
        const found = await links(s.page);
        const ok = found.filter(l => l.text === CREDIT && l.href === CREDIT_URL && l.target === "_blank" && /noopener/.test(l.rel || "") && /noreferrer/.test(l.rel || ""));
        check(`A1 ${tag} card page: the credit links to ${CREDIT_URL} in a new tab, beside the supported value`, ok.some(l => l.inHero), JSON.stringify(found));
        check(`A1 ${tag} Decision Receipt: "Price source" carries the credit`, ok.some(l => l.inReceipt) && /Price source\s*Prices from Hobby Card Index/.test(await text(s.page)),
          JSON.stringify(found));
        check(`A5 ${tag} card page: no page errors, no sideways scroll`, s.errors.length === 0 && await noScroll(s.page), s.errors.join(" | "));
        await s.context.close();
      }
      {
        const s = await open(base, "opportunities/qa-attr-plain", device);
        const t = await text(s.page);
        check(`A3 ${tag} decision without HCI sales: no credit and no provider named`, (await links(s.page)).length === 0 && !/Hobby Card Index|Price source/.test(t));
        await s.context.close();
      }
      {
        const s = await open(base, "opportunities/qa-attr-hostile", device);
        const t = await text(s.page);
        const html = await s.page.evaluate(() => document.querySelector("#main-content")?.innerHTML || "");
        check(`A4 ${tag} unapproved credits are never rendered (other text, other link, javascript: link, markup)`,
          (await links(s.page)).length === 0 && !/Some Other Site|example\.com/.test(t) && !/javascript:alert|onerror=/.test(html) && s.errors.length === 0,
          s.errors.join(" | "));
        await s.context.close();
      }
      {
        const s = await open(base, "opportunities", device);
        const cells = await s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#main-content tr[data-customer-opportunity]")].map(row =>
          [row.dataset.customerOpportunity, [...row.querySelectorAll("[data-list-supported] [data-ff-source-attribution] a")].map(a => `${a.textContent.trim()}|${a.getAttribute("href")}`)])));
        check(`A2 ${tag} saved list: the credit sits under the HCI decision's value only`,
          JSON.stringify(cells["qa-attr-hci"]) === JSON.stringify([`${CREDIT}|${CREDIT_URL}`]) && (cells["qa-attr-plain"] || []).length === 0
          && (cells["qa-attr-hostile"] || []).length === 0, JSON.stringify(cells));
        check(`A5 ${tag} saved list: no page errors, no sideways scroll`, s.errors.length === 0 && await noScroll(s.page), s.errors.join(" | "));
        await s.context.close();
      }
    }
  }
} finally {
  await browser.close();
}
for (const p of passes) console.log(`PASS ${p}`);
for (const f of failures) console.log(`FAIL ${f}`);
console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
