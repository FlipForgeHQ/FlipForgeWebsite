// Saved decision evidence consistency (review of PR #604, 2026-10-31). Display only: every value comes from a synthetic
// fixture shaped like the production API after the provider containment (sale records not kept, today's accepted count 0,
// the saved receipt's own count and Max Buy on governedDecision, decisionTime on /api/v1/evidence). Nothing is computed.
//
// Regressions covered (all found on the PR #604 head d248af8 and on main ee2ab07, i.e. live in production):
//   E1  A saved BUY made on 8 exact sales: the card page's traceback said "No accepted exact completed sales", the
//       Evidence readiness panel and the evidence passport said 0, the evidence-chain badge "0 accepted", and the
//       reported-sale panel "All saved exact accepted sales 0" - all contradicting the BUY and the hero's "based on 8".
//   E2  An unrecorded count must read "not recorded"/"Unavailable" on every one of those surfaces, never 0.
//   E3  The Evidence page headed a saved BUY "No sales support this decision yet" / "No exact completed sales support this
//       card yet"; the saved-decision date read 2026-10-08.
//   E4  The card page never showed the saved Max Buy, and the passport said "The saved decision does not show a Max Buy"
//       although the receipt recorded one. Legacy results and records without an established value still show none.
//   E5  Raw codes on the card page: "Workflow: UNKNOWN", "4 · decision" (lower-cased label), PSA "NOT_AVAILABLE", and a
//       missing PSA population shown as 0.
//   E6  The saved list's ask column is labelled "Ask when evaluated", not "Ask" (a saved ask is not a live price).
//
// The production host is mapped to the local server (saas-prototype/serve.mjs, port 4173 or FLIPFORGE_SDT_AUDIT_PORT).
import { chromium } from "playwright";

const PORT = process.env.FLIPFORGE_SDT_AUDIT_PORT || "4173";
const BETA = `http://goflipforge.com:${PORT}/app/beta/`;
const CUSTOMER = `http://goflipforge.com:${PORT}/app/customer/`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE || undefined;
const email = "saved-decisions-audit@flipforge.test";
const LEGACY_STATUS = "LEGACY_PROVIDER_DERIVED";
const LEGACY_NOTICE = "Saved before current evidence rules. The original evidence is withheld pending data licensing review; this result is not presented as currently supported.";

const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

// ---------- fixtures ----------
const CARDS = {
  "qa-sd-known": { title: "2005-06 Upper Deck Duncan Keith #230 Young Guns PSA 10", recommendation: "BUY", ask: 169.02, count: 8 },
  "qa-sd-unknown": { title: "2018 Topps Chrome Shohei Ohtani #150 PSA 9", recommendation: "WATCH", ask: 218.78, count: null },
  "qa-sd-noreceipt": { title: "2018 Prizm Luka Doncic #280 PSA 10", recommendation: "VERIFY", ask: 310, count: undefined, noReceipt: true },
  "qa-sd-legacy": { title: "2018 Topps Update Ronald Acuna Jr. #US250 PSA 10", recommendation: "BUY", ask: 1215, count: 4, legacy: true }
};
const IDS = Object.keys(CARDS);
const SUPPORTED_CENTS = 24794; // $247.94

function opportunity(id) {
  const c = CARDS[id];
  const evidence = { acceptedSales: 0, priceStatus: "LIVE_PRICING_ONLY", priceStatusLabel: "No price shown. Current sales of this exact card are checked when you evaluate it; past sale records are not kept." };
  if (c.noReceipt) delete evidence.acceptedSales; // current count not sent either
  const item = {
    id, title: c.title, cardIdentity: c.title, recommendation: c.recommendation, ask: c.ask, supportedValue: SUPPORTED_CENTS / 100,
    supportedValueCents: SUPPORTED_CENTS, confidence: 82, liquidity: 75, risk: 40, rank: 90, observedAt: "2026-10-08T17:55:16Z", platform: "EBAY",
    mappingState: "NOT_CONFIRMED", recommendationSource: "GOVERNED_SNAPSHOT", evidenceProvenanceStatus: "CURRENT_EVIDENCE_RULES", legacyNotice: null,
    legacyProvenanceVersion: "legacy-provenance-v1", evidence,
    governedDecision: c.noReceipt ? { available: false } : {
      available: true, recommendation: c.recommendation, confidence: 82, risk: 40, reason: `${c.recommendation}: saved reason.`, evaluatedAt: "2026-10-08T17:55:16Z",
      supportedValueCents: SUPPORTED_CENTS, supportedValueStatus: "ESTABLISHED", maximumBuyPriceCents: 17791, allInAskCents: Math.round(c.ask * 100),
      exactTrustedCompCount: c.count, snapshotCount: 2, immutable: true, transactionAuthority: false
    }
  };
  if (c.legacy) {
    Object.assign(item, {
      evidenceProvenanceStatus: LEGACY_STATUS, legacyNotice: LEGACY_NOTICE, currentlySupported: false,
      supportedValueStatus: "LEGACY_NOT_CURRENTLY_SUPPORTED", supportedValueStatusReason: LEGACY_STATUS,
      legacySavedValues: { supportedValue: 1675, immutable: true, meaning: "Values exactly as saved at decision time." },
      supportedValue: null, supportedValueCents: null
    });
    Object.assign(item.governedDecision, {
      evidenceProvenanceStatus: LEGACY_STATUS, legacyNotice: LEGACY_NOTICE, currentlySupported: false, supportedValueStatus: "LEGACY_NOT_CURRENTLY_SUPPORTED",
      legacySavedValues: { supportedValueCents: 167500, maximumBuyPriceCents: 140000, immutable: true },
      supportedValueCents: null, maximumBuyPriceCents: null
    });
  }
  return item;
}

function evidence(id) {
  const c = CARDS[id];
  return {
    kind: "evidence", readOnly: true, opportunityId: id, cardIdentity: c.title, acceptedExactCompletedSales: 0, visibleButAuthorityIneligible: 0,
    currentAdmission: { admitted: 0, excluded: 0, held: 0, notUsed: 0, linkedRows: 0, policy: "qa" }, linkedEvidence: [], manualCandidates: [], timeline: [],
    providerEvidenceSummary: { label: "Reported completed sale (data provider)", saleDetailsWithheld: true, storedRowsLinked: 0, storedRowsAdmittedNow: 0, storedRowReasons: {},
      evidenceMode: "PROVIDER_SALES_OFF", storedSaleRecordsKept: false, liveQualifiedSales: 0, liveAvailable: false, liveExpiresAt: null },
    priceStatusLabel: "No price shown. Current sales of this exact card are checked when you evaluate it; past sale records are not kept.",
    evidenceProvenanceStatus: c.legacy ? LEGACY_STATUS : "CURRENT_EVIDENCE_RULES", legacyNotice: c.legacy ? LEGACY_NOTICE : null,
    internalOperatorFieldsExcluded: true, transactionAuthority: false,
    decisionTime: c.legacy
      ? { available: true, evaluatedAt: "2026-10-08T17:55:16Z", recommendation: c.recommendation, askPrice: c.ask, supportedValue: null, salesCountAtDecision: c.count ?? null, immutable: true,
          legacySavedValues: { supportedValue: 1675, immutable: true }, evidenceProvenanceStatus: LEGACY_STATUS, legacyNotice: LEGACY_NOTICE, currentlySupported: false }
      : { available: true, evaluatedAt: "2026-10-08T17:55:16Z", recommendation: c.recommendation, askPrice: c.ask, supportedValue: c.count ? 247.94 : null, salesCountAtDecision: c.count ?? null, immutable: true }
  };
}

const entry = (id, n, extra) => Object.assign({
  requestId: `qa-${id}-${n}`, cardIdentity: CARDS[id].title, marketplace: "EBAY", workflowStatus: "ACTIVE_WATCHLIST", supportedValueCents: SUPPORTED_CENTS,
  evidenceQuality: "MODERATE", reviewEvidenceCount: 0, rejectedEvidenceCount: 0, confidence: 82, risk: 40, exactIdentityEligible: true, decisionContractAvailable: true,
  profitabilitySnapshotPresent: true, whatWouldChange: [], immutable: true
}, extra);
function timeline(id) {
  const result = timelineData(id);
  // E7: a snapshot with no evidence-supported value records 0 cents (production VERIFY, 2026-10-31).
  if (id === "qa-sd-unknown") result.entries.forEach(e => { e.supportedValueCents = 0; });
  return result;
}
function timelineData(id) {
  return {
    kind: "decision-timeline", opportunityId: id, available: true, timelineVersion: "v1.5.0", snapshotCount: 2, changedEntryCount: 1,
    historicalSnapshotsImmutable: true, historicalRescoring: false, historicalBackfill: false, transactionAuthority: false,
    entries: [
      entry(id, 0, { evaluatedAt: "2026-10-08T17:55:16.566881179Z", decision: "WATCH", allInAskCents: 18997, acceptedEvidenceCount: null, changedFromPrevious: false, changes: [], whatChanged: [] }),
      entry(id, 1, { evaluatedAt: "2026-10-31T13:55:33.866282507Z", decision: "BUY", allInAskCents: 17791, acceptedEvidenceCount: 8, changedFromPrevious: true,
        changes: [
          { code: "DECISION_CHANGED", before: "WATCH", after: "BUY", description: "Decision changed from WATCH to BUY." },
          { code: "WORKFLOW_STATUS_CHANGED", before: "ACTIVE_WATCHLIST", after: "READY_FOR_OPERATOR_REVIEW", description: "Workflow status changed from ACTIVE_WATCHLIST to READY_FOR_OPERATOR_REVIEW." },
          { code: "ASK_CHANGED", before: 18997, after: 17791, description: "Ask changed from 18997 to 17791." },
          { code: "ACCEPTED_EVIDENCE_CHANGED", before: null, after: 8, description: "Accepted evidence changed from null to 8." },
          { code: "CONSERVATIVE_NET_PROFIT_CHANGED", before: -244, after: 962, description: "Conservative net profit changed." }
        ],
        whatChanged: ["Decision changed from WATCH to BUY.", "Workflow status changed from ACTIVE_WATCHLIST to READY_FOR_OPERATOR_REVIEW."] })
    ]
  };
}

const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) }).catch(() => {});
const envelope = (correlationId, data) => ({
  meta: { contractVersion: "1.0", engineVersion: "saved-decisions-audit", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence",
    correlationId, generatedAt: "2026-10-31T14:00:00Z", evidenceFreshness: "MIXED_DISPLAY_ONLY", limitations: [] },
  data
});
const lifecycle = id => ({ opportunityId: id, trackingStatus: "WATCHING", outcomeStatus: "NONE", reviewAt: null, alertEnabled: false,
  acquisitionCostCents: null, acquiredAt: null, dispositionProceedsCents: null, disposedAt: null, version: 1 });

async function fixture(route) {
  const url = new URL(route.request().url());
  const cid = route.request().headers()["x-correlation-id"] || "saved-decisions-audit";
  if (route.request().method().toUpperCase() !== "GET") return json(route, 405, { error: { code: "QA_READ_ONLY", message: "No writes.", correlationId: cid } });
  const p = url.pathname;
  const record = p.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor|lifecycle)\/([^/]+)$/);
  if (record) {
    const id = decodeURIComponent(record[2]);
    if (!CARDS[id]) return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Unknown synthetic record.", correlationId: cid } });
    if (record[1] === "opportunities") {
      const detail = { kind: "opportunity-detail", opportunity: opportunity(id), sourceOfTruth: "SQLite", transactionAuthority: false };
      if (CARDS[id].legacy) detail.priceIntelligence = { available: false, status: "LEGACY_NOT_CURRENTLY_SUPPORTED", reason: LEGACY_NOTICE };
      return json(route, 200, envelope(cid, detail));
    }
    if (record[1] === "evidence") return json(route, 200, envelope(cid, evidence(id)));
    if (record[1] === "psa-advisor") return json(route, 200, envelope(cid, { kind: "psa-advisor", opportunityId: id, cardIdentity: CARDS[id].title, guidanceStatus: "NOT_AVAILABLE",
      authoritativeOpportunityRecommendation: CARDS[id].recommendation, recalculated: false, savedPsaSnapshot: {}, populationContext: {}, transactionAuthority: false }));
    return json(route, 200, envelope(cid, { kind: "lifecycle-detail", opportunityId: id, sourceOfTruth: "SQLite", lifecycle: lifecycle(id),
      history: [{ recordedAt: "2026-10-08T17:55:16Z", eventType: "CREATED", trackingStatus: "WATCHING", outcomeStatus: "NONE", recordVersion: 1 }],
      decisionTimeline: timeline(id), transactionAuthority: false }));
  }
  if (p.startsWith("/api/v1/card-intelligence/")) return json(route, 503, { error: { code: "CARD_INTELLIGENCE_UNAVAILABLE", message: "Unavailable.", correlationId: cid } });
  if (p === "/api/v1/health") return json(route, 200, envelope(cid, { status: "configured", bridgeEnabled: true, providerEvidenceMode: "PROVIDER_SALES_OFF", evidenceStorageGuard: "VERIFIED" }));
  if (p === "/api/v1/entitlements") return json(route, 200, envelope(cid, { kind: "entitlements", membershipActive: true, current: { code: "PRIVATE_BETA", accessState: "ACTIVE" }, plan: { code: "PRIVATE_BETA" }, usage: { completedEvaluations: 0 } }));
  if (p === "/api/v1/opportunities") return json(route, 200, envelope(cid, { kind: "opportunities", items: IDS.map(opportunity), count: IDS.length, sourceOfTruth: "SQLite", transactionAuthority: false }));
  if (p === "/api/v1/dashboard") return json(route, 200, envelope(cid, { kind: "dashboard", readOnly: true, source: "SQLite saved governed records",
    metrics: { trackedOpportunities: IDS.length, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 1 }, opportunities: IDS.map(opportunity), items: IDS.map(opportunity) }));
  if (p === "/api/v1/lifecycle") return json(route, 200, envelope(cid, { kind: "lifecycle", sourceOfTruth: "SQLite", items: IDS.map(lifecycle), transactionAuthority: false }));
  return json(route, 404, { error: { code: "QA_NOT_MOCKED", message: p, correlationId: cid } });
}

// ---------- session ----------
const browser = await chromium.launch({ executablePath, args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"] });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
async function open(base, route, { device = null, wait = 4500 } = {}) {
  const context = await browser.newContext(device || { viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); localStorage.setItem("flipforge.guidedMode.enabled", "false"); } catch (_) {} });
  await context.route(/\/assets\/js\/flipforge-identity\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${email}"}),getSnapshot:()=>({authenticated:true,email:"${email}",fullName:"Saved Decisions Audit",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${email}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"t"});` }));
  await context.route(/\/assets\/js\/flipforge-production-signin\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/v1/**", fixture);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message.slice(0, 160)));
  await page.goto(`${base}#/${route}`, { waitUntil: "load" });
  await page.waitForTimeout(wait);
  await page.evaluate(() => document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }));
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => document.querySelector("#main-content")?.innerText || "");
  return { context, page, errors, text };
}
const rowText = (page, id) => page.evaluate(card => {
  const row = document.querySelector(`#main-content tr[data-customer-opportunity="${card}"]`);
  if (!row) return null;
  return { supported: row.querySelector("[data-list-supported]")?.innerText.replace(/\s+/g, " ").trim() || "", evidence: row.querySelector("[data-list-evidence]")?.innerText.replace(/\s+/g, " ").trim() || "" };
}, id);
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const PROVIDER = /CardSight|CARDSIGHT/;
const sectionText = (page, selector) => page.evaluate(sel => [...document.querySelectorAll(sel)].map(n => n.textContent.replace(/\s+/g, " ").trim()).join(" | "), selector);
const keyValue = (page, label) => page.evaluate(l => {
  for (const div of document.querySelectorAll("#main-content .staging-key-grid > div, #main-content .provider-evidence-metric")) {
    if (div.querySelector("span")?.textContent.trim() === l) return div.querySelector("strong")?.textContent.trim() ?? null;
  }
  return null;
}, label);
const all = page => page.evaluate(() => document.querySelector("#main-content").textContent.replace(/\s+/g, " "));

try {
  for (const [label, device] of [["desktop", null], ["phone", PHONE]]) {
    // E1 + E4 + E5: BUY decided on 8 exact sales, receipt Max Buy $177.91.
    {
      const s = await open(BETA, "opportunities/qa-sd-known", { device });
      const text = await all(s.page);
      const traceback = await sectionText(s.page, "#main-content .customer-traceback");
      check(`E1 ${label} card: traceback says 8 exact completed sales at decision, never "No accepted exact completed sales"`,
        /2 · Evidence\s*8 exact completed sales at decision/.test(traceback) && !/No accepted exact completed sales/.test(text), traceback.slice(0, 260));
      check(`E1 ${label} card: Evidence readiness shows 8 at decision and today's records as not kept`,
        await keyValue(s.page, "Exact sales at decision") === "8" && await keyValue(s.page, "Accepted exact sales") === "Not kept");
      check(`E1 ${label} card: evidence-chain badge reads "8 at decision"`, /8 at decision/.test(await sectionText(s.page, "#main-content .staging-status")) && !/\b0 accepted\b/.test(text));
      const passport = await s.page.evaluate(() => document.querySelector('#main-content [data-ff-decision-card-evidence] article[data-tone="evidence"] strong')?.textContent.trim() || "");
      check(`E1 ${label} passport: Evidence reads "8 at decision", not 0`, passport === "8 at decision" && !/Evidence that counted\s*0/.test(text), passport);
      check(`E1 ${label} reported-sale panel: no "All saved exact accepted sales 0"; shows 8 at decision`,
        await keyValue(s.page, "Exact sales at decision") === "8" && !/All saved exact accepted sales\s*0/.test(text));
      check(`E4 ${label} card: saved Max Buy $177.91 shown, labelled at decision`, /Max Buy\s*\$177\.91\s*At decision/.test(text), (text.match(/Max Buy.{0,80}/) || [""])[0]);
      check(`E4 ${label} passport: no claim that the decision has no Max Buy`, !/does not show a Max Buy/.test(text));
      check(`E5 ${label} card: no "Workflow:" line, no UNKNOWN, decision step capitalised`, !/Workflow:|\bUNKNOWN\b/.test(text) && /4 · Decision/.test(traceback) && !/4 · decision/.test(traceback), traceback.slice(-160));
      check(`E5 ${label} card: PSA status in words and missing populations Unavailable`,
        await keyValue(s.page, "Guidance status") === "Not available" && await keyValue(s.page, "PSA 10 population") === "Unavailable" && await keyValue(s.page, "PSA 9 population") === "Unavailable" && !/NOT_AVAILABLE/.test(text));
      check(`${label} card: no page errors, no sideways scroll`, s.errors.length === 0 && await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), s.errors.join(" | "));
      await s.context.close();
    }
    // E2: count not recorded.
    {
      const s = await open(BETA, "opportunities/qa-sd-unknown", { device });
      const text = await all(s.page);
      const passport = await s.page.evaluate(() => document.querySelector('#main-content [data-ff-decision-card-evidence] article[data-tone="evidence"] strong')?.textContent.trim() || "");
      check(`E2 ${label} card: unrecorded count reads not recorded / Unavailable everywhere, never 0`,
        /Exact sales at decision not recorded/.test(text) && await keyValue(s.page, "Exact sales at decision") === "Unavailable" && passport === "Not recorded"
        && !/All saved exact accepted sales\s*0|Evidence that counted\s*0|\b0 accepted\b/.test(text), passport);
      await s.context.close();
    }
    // Legacy: restricted, no at-decision value, count or Max Buy.
    {
      const s = await open(BETA, "opportunities/qa-sd-legacy", { device });
      const text = await all(s.page);
      check(`E4 ${label} legacy card: no Max Buy, no "at decision" count, provider not named`, !/Max Buy\s*\$/.test(text) && !/exact completed sales at decision/.test(text) && !PROVIDER.test(text));
      check(`E4 ${label} legacy passport: does not claim the decision has no Max Buy (its legacy figures are shown as historical)`,
        !/does not show a Max Buy/.test(text) && /shown above as historical only/.test(text));
      await s.context.close();
    }
    // E3: Evidence page.
    {
      const s = await open(BETA, "evidence/qa-sd-known", { device });
      const text = await all(s.page);
      check(`E3 ${label} evidence page: saved BUY on 8 sales is not headed "No sales support this decision yet"`,
        /Evidence behind this saved decision/.test(text) && /8 exact completed sales supported this decision when it was made\./.test(text)
        && !/No sales support this decision yet|No exact completed sales support this card yet/.test(text));
      check(`E3 ${label} evidence page: decision date readable`, /Decision saved\s*Oct 8, 2026/.test(text) && !/2026-10-08/.test(text));
      await s.context.close();
      const u = await open(BETA, "evidence/qa-sd-unknown", { device });
      const utext = await all(u.page);
      check(`E3 ${label} evidence page: unrecorded count says so, never "No sales support"`, /did not record how many exact sales it used/.test(utext) && !/No sales support this decision yet/.test(utext));
      await u.context.close();
      const l = await open(BETA, "evidence/qa-sd-legacy", { device });
      const ltext = await all(l.page);
      check(`E3 ${label} evidence page: legacy result keeps its own wording`, !/supported this decision when it was made/.test(ltext) && !PROVIDER.test(ltext));
      await l.context.close();
    }
    // E7: Tracking timeline: a value of 0 cents is "Not established", never "$0.00".
    {
      const s = await open(BETA, "tracking/qa-sd-unknown", { device });
      const timelineText = await sectionText(s.page, "#main-content .customer-decision-timeline-entry");
      check(`E7 ${label} tracking timeline: no-value snapshot reads "Not established", never $0.00`, /Supported Value\s*Not established/.test(timelineText) && !/\$0\.00/.test(timelineText), timelineText.slice(0, 200));
      await s.context.close();
    }
    // E6: saved list.
    {
      const s = await open(BETA, "opportunities", { device });
      const headers = await s.page.evaluate(() => [...document.querySelectorAll("#main-content table thead th")].map(th => th.textContent.trim()));
      check(`E6 ${label} saved list: ask column is "Ask when evaluated"`, headers.some(h => /^Ask when evaluated$/i.test(h)) && !headers.some(h => /^Ask$/i.test(h)), JSON.stringify(headers));
      await s.context.close();
    }
  }
} finally {
  await browser.close();
}
for (const p of passes) console.log(`PASS ${p}`);
for (const f of failures) console.log(`FAIL ${f}`);
console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
