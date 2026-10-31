// Saved Decisions + Tracking customer display (2026-10-31, PR #604). Display only: every value comes from a synthetic
// fixture and is shown as returned; no decision, receipt or snapshot is computed or changed.
//
// Regressions covered:
//   C1  A saved decision whose exact-sale count was not recorded must show "Unavailable", never 0 (Number(null) is 0),
//       and today's count must not be shown in its place.
//   C2  With sale records not kept, today's accepted-sale count is 0 even for a decision made on 8 exact sales. The saved
//       list, card page and Home dashboard show the saved receipt's value and count, labelled "at decision".
//   C3  The ask on a saved decision is the saved evaluation's ask, not a re-checked listing: it is labelled
//       "Ask when evaluated", never "Current ask" or "Listing price".
//   C4  Legacy (CardSight-era) results stay restricted: no supported value, no "at decision" value or count, evidence
//       withheld, legacy badge shown, and the data provider is never named.
//   C5  Decision history reads in plain language: money in dollars, unknown counts as "unavailable", no internal
//       workflow states, no ISO timestamps.
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
    internalOperatorFieldsExcluded: true, transactionAuthority: false
  };
}

const entry = (id, n, extra) => Object.assign({
  requestId: `qa-${id}-${n}`, cardIdentity: CARDS[id].title, marketplace: "EBAY", workflowStatus: "ACTIVE_WATCHLIST", supportedValueCents: SUPPORTED_CENTS,
  evidenceQuality: "MODERATE", reviewEvidenceCount: 0, rejectedEvidenceCount: 0, confidence: 82, risk: 40, exactIdentityEligible: true, decisionContractAvailable: true,
  profitabilitySnapshotPresent: true, whatWouldChange: [], immutable: true
}, extra);
function timeline(id) {
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

try {
  // ---- C1/C2/C4: saved list (desktop and phone) ----
  for (const [label, device] of [["desktop", null], ["phone", PHONE]]) {
    const { context, page, errors, text } = await open(BETA, "opportunities", { device });
    const known = await rowText(page, "qa-sd-known");
    const unknown = await rowText(page, "qa-sd-unknown");
    const none = await rowText(page, "qa-sd-noreceipt");
    const legacy = await rowText(page, "qa-sd-legacy");
    check(`C2 ${label} list: decision made on 8 exact sales shows its saved value and count, labelled at decision`,
      known && /^\$248 at decision$/.test(known.supported) && /^8 exact sales at decision$/.test(known.evidence), JSON.stringify(known));
    check(`C1 ${label} list: saved decision with no recorded count shows Unavailable, not 0`,
      unknown && /^Unavailable/.test(unknown.evidence) && !/\b0\b/.test(unknown.evidence), JSON.stringify(unknown));
    check(`C1 ${label} list: record with no receipt and no count shows Unavailable, not 0`,
      none && none.evidence === "Unavailable", JSON.stringify(none));
    check(`C4 ${label} list: legacy result shows no supported value and withheld evidence`,
      legacy && legacy.supported === "Not currently supported" && legacy.evidence === "Withheld" && !/\$|at decision/.test(legacy.supported + legacy.evidence), JSON.stringify(legacy));
    const tile = await page.evaluate(() => [...document.querySelectorAll("#main-content .staging-metrics article")].map(a => a.innerText.replace(/\s+/g, " ").trim()));
    check(`C1 ${label} list: "Decided on exact sales" counts only recorded counts above 0 and excludes legacy`, tile.some(t => /^decided on exact sales 1$/i.test(t)), tile.join(" | "));
    check(`C4 ${label} list: data provider never named`, !PROVIDER.test(text));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${label} list: no horizontal page overflow`, overflow <= 1, String(overflow));
    check(`${label} list: no page errors`, errors.length === 0, errors.join(" | "));
    await context.close();
  }

  // ---- C2/C3: card page, count recorded ----
  {
    const { context, errors, text } = await open(BETA, "opportunities/qa-sd-known");
    check("C3 card page labels the saved ask \"Ask when evaluated\"", /Ask when evaluated/i.test(text));
    check("C3 card page never calls the saved ask current or a listing price", !/Current ask|Listing price/i.test(text));
    check("C2 card page shows the supported value at decision with its exact-sale count", /\$248[\s\S]{0,40}At decision · based on 8 exact sales/.test(text));
    check("C3 Price Intelligence ask is labelled as evaluated", !/CURRENT ASK/.test(text));
    check("card page: no page errors", errors.length === 0, errors.join(" | "));
    await context.close();
  }
  // ---- C1: card page, count not recorded ----
  {
    const { context, text } = await open(BETA, "opportunities/qa-sd-unknown");
    check("C1 card page never claims a value is based on 0 exact sales", !/based on 0 exact sale/i.test(text));
    check("C1 card page does not present an at-decision value when the count is unknown", !/At decision · based on/.test(text));
    await context.close();
  }
  // ---- C4: legacy card page ----
  {
    const { context, page, text } = await open(BETA, "opportunities/qa-sd-legacy");
    check("C4 legacy card page shows the legacy badge", await page.locator("#main-content [data-ff-legacy-result]").count() > 0);
    check("C4 legacy card page shows no at-decision value", !/At decision · based on|at decision/.test(text));
    check("C4 legacy card page says it is not currently supported", /not currently supported/i.test(text));
    check("C4 legacy card page never names the data provider", !PROVIDER.test(text));
    await context.close();
  }
  // ---- C1/C2: Home dashboard (full customer app) ----
  {
    const { context, page, errors } = await open(CUSTOMER, "dashboard", { wait: 6000 });
    const rows = await page.evaluate(() => [...document.querySelectorAll("#main-content .ff-v2-table tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.innerText.replace(/\s+/g, " ").trim())));
    const byTitle = title => rows.find(cells => (cells[0] || "").includes(title)) || [];
    const sales = cells => cells[5] || "";
    check("C2 Home: decision on 8 exact sales shows 8 at decision", /^8 at decision$/.test(sales(byTitle(CARDS["qa-sd-known"].title))), JSON.stringify(byTitle(CARDS["qa-sd-known"].title)));
    check("C1 Home: unrecorded count shows Unavailable, not 0", /^Unavailable/.test(sales(byTitle(CARDS["qa-sd-unknown"].title))), JSON.stringify(byTitle(CARDS["qa-sd-unknown"].title)));
    check("C1 Home: record with no count shows Unavailable, not 0", /^Unavailable/.test(sales(byTitle(CARDS["qa-sd-noreceipt"].title))), JSON.stringify(byTitle(CARDS["qa-sd-noreceipt"].title)));
    check("C4 Home: legacy row shows its evidence as withheld, with no count", sales(byTitle(CARDS["qa-sd-legacy"].title)) === "Withheld", JSON.stringify(byTitle(CARDS["qa-sd-legacy"].title)));
    check("Home: no page errors", errors.length === 0, errors.join(" | "));
    await context.close();
  }
  // ---- C5: tracking timeline and history ----
  for (const [label, device] of [["desktop", null], ["phone", PHONE]]) {
    const { context, page, errors } = await open(BETA, "tracking/qa-sd-known", { device, wait: 5500 });
    const timelineText = await page.evaluate(() => document.querySelector("#main-content .customer-decision-timeline-panel")?.innerText || "");
    const historyText = await page.evaluate(() => document.querySelector("#main-content .customer-lifecycle-history")?.innerText || "");
    check(`C5 ${label} timeline: verdict change in words`, /Decision changed from WATCH to BUY\./.test(timelineText), timelineText.slice(0, 200));
    check(`C5 ${label} timeline: ask change in dollars`, /All-in ask changed from \$189\.97 to \$177\.91\./.test(timelineText));
    check(`C5 ${label} timeline: unknown earlier count reads unavailable, not 0`, /Accepted exact sales changed from unavailable to 8\./.test(timelineText) && !/from 0 to 8/.test(timelineText));
    check(`C5 ${label} timeline: negative profit shown with a minus sign`, /Conservative profit at this price changed from −\$2\.44 to \$9\.62\./.test(timelineText));
    check(`C5 ${label} timeline: internal workflow states hidden`, !/Workflow status|ACTIVE_WATCHLIST|READY_FOR_OPERATOR_REVIEW/.test(timelineText));
    check(`C5 ${label} timeline: dates readable, no ISO timestamps`, /Oct 31, 2026, 1:55 PM UTC/.test(timelineText) && !ISO.test(timelineText));
    check(`C5 ${label} history: plain labels`, /Saved · Watching/.test(historyText) && /No outcome recorded/.test(historyText) && !/CREATED|WATCHING|NONE|Result: recorded/.test(historyText) && !ISO.test(historyText), historyText.replace(/\s+/g, " "));
    check(`${label} tracking: no page errors`, errors.length === 0, errors.join(" | "));
    await context.close();
  }
} catch (error) {
  failures.push(`audit did not complete: ${String(error.message || error).split("\n")[0]}`);
} finally {
  await browser.close();
}

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`\n${passes.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
