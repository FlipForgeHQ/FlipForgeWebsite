// Customer trust display: what the saved-decision pages say about risk, confidence, legacy results, sources and the
// active card. Display only - every fixture value is shown as returned; no decision value is computed or changed.
//
// Regressions found 2026-10-19 on /app/beta:
//   R1  Card detail showed "Decision risk High — 100/100 final saved decision risk" for a saved risk of 35. The risk was
//       scraped from the metric text "35/100"; removing every non-digit made it 35100, clamped to 100.
//   R2  The Decision Card evidence passport showed "RISK + UNCERTAINTY Unavailable": it looked up the labels "Risk" and
//       "Current ask" after the page had renamed them "Decision risk" and "Listing price".
//   R3  Customer pages named the data provider ("CardSight sold evidence", "Saved CardSight accepted sales", raw codes
//       such as CARDSIGHT_EBAYSOLD_COMP) and called identity or evidence "Verified" (a global Server-owned -> Verified
//       rewrite).
//   R4  Pages opened without a card in the address showed the first card in the list, not the card in use.
//   R5  A missing confidence was shown as 0/100.
//   New: results the server marks with evidenceProvenanceStatus (not CURRENT) are shown as legacy results with the
//   server's legacyNotice, without current-support copy; records without the field show nothing extra.
//
// The production host is mapped to the local server (saas-prototype/serve.mjs), every app script runs, and every
// /api/v1 response is a synthetic fixture. Requires the local server on port 4173 (FLIPFORGE_TRUST_AUDIT_PORT).
import { chromium } from "playwright";

const PORT = process.env.FLIPFORGE_TRUST_AUDIT_PORT || "4173";
const APP = `http://goflipforge.com:${PORT}/app/beta/`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE || undefined;
const email = "trust-display-audit@flipforge.test";
const LEGACY_STATUS = "LEGACY_CARDSIGHT_DERIVED"; // first announced value (old shape)
const NEW_LEGACY_STATUS = "LEGACY_PROVIDER_DERIVED"; // FlipForge2#885 (new shape)
const NEW_CURRENT_STATUS = "CURRENT_EVIDENCE_RULES"; // FlipForge2#885: current items carry this value
const LEGACY_NOTICE = "Saved before current evidence rules. The original evidence is withheld pending data licensing review; this result is not presented as currently supported.";
const LEGACY_BADGE = "Legacy result — saved before current evidence rules";

const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

// ---------- fixtures ----------
const TITLES = { "qa-trust-a": "2018 Topps Chrome Shohei Ohtani #150 PSA 10", "qa-trust-b": "2018 Prizm Luka Doncic #280 PSA 10" };
const IDS = Object.keys(TITLES);
const BASE = { risk: 35, governedRisk: 35, confidence: 83, governedConfidence: 83, legacy: false, prices: true, provenance: undefined };

// New API shape (FlipForge2#885): every item carries a provenance status; a legacy item's value fields are null and the
// saved values move, unchanged, to legacySavedValues; price intelligence is unavailable.
function newShape(item, f) {
  item.legacyProvenanceVersion = "legacy-provenance-v1";
  if (!f.legacy) return Object.assign(item, { evidenceProvenanceStatus: NEW_CURRENT_STATUS, legacyNotice: null });
  Object.assign(item, {
    evidenceProvenanceStatus: NEW_LEGACY_STATUS, legacyNotice: LEGACY_NOTICE, currentlySupported: false,
    supportedValueStatus: "LEGACY_NOT_CURRENTLY_SUPPORTED", supportedValueStatusReason: NEW_LEGACY_STATUS,
    legacySavedValues: { supportedValue: item.supportedValue, discountPercent: 27.5, immutable: true, meaning: "Values exactly as saved at decision time." },
    supportedValue: null, discountPercent: null, supportedValueCents: null
  });
  Object.assign(item.governedDecision, {
    evidenceProvenanceStatus: NEW_LEGACY_STATUS, legacyNotice: LEGACY_NOTICE, currentlySupported: false, supportedValueStatus: "LEGACY_NOT_CURRENTLY_SUPPORTED",
    legacySavedValues: { supportedValueCents: 167500, maximumBuyPriceCents: 140000, immutable: true },
    supportedValueCents: null, maximumBuyPriceCents: null, expectedNetProfitCents: null, conservativeNetProfitCents: null, stressNetProfitCents: null,
    expectedRoiBasisPoints: null, conservativeRoiBasisPoints: null, stressRoiBasisPoints: null
  });
  return item;
}

function opportunity(id, f) {
  const item = {
    id, title: TITLES[id], cardIdentity: TITLES[id], recommendation: "BUY", ask: 1215, supportedValue: 1675,
    confidence: f.confidence, liquidity: 75, risk: f.risk, rank: 80, observedAt: "2026-10-06T23:54:44Z", platform: "EBAY",
    mappingState: "CONFIRMED", recommendationSource: "GOVERNED_SNAPSHOT",
    governedDecision: { available: true, recommendation: "BUY", risk: f.governedRisk, confidence: f.governedConfidence, reason: "BUY: saved reason.", evaluatedAt: "2026-10-06T23:54:44Z" },
    evidence: { acceptedSales: 1, marketplaces: ["CARDSIGHT_EBAY"], priceStatusLabel: "Reported sale prices, matched to the exact card" }
  };
  if (f.shape === "new") return newShape(item, f);
  if (f.provenance !== undefined) item.evidenceProvenanceStatus = f.provenance;
  if (f.legacy) Object.assign(item, { evidenceProvenanceStatus: LEGACY_STATUS, legacyNotice: LEGACY_NOTICE });
  return item;
}

// New /api/v1/evidence shape: provider rows are counted (and summarised by reason in providerEvidenceSummary) but never
// listed; counts include them. A legacy decision's saved value is in decisionTime.legacySavedValues.
function newEvidence(id, f) {
  const listed = f.legacy ? [] : [{ id: 41, sourceName: "eBay", type: "SOLD_COMP", amount: 1650, soldAt: "2026-10-01T00:00:00Z", identityMatch: true, authorityEligible: true, currentAdmissionStatus: "ADMITTED" }];
  const providerRows = 3;
  const decisionTime = { available: true, evaluatedAt: "2026-10-06T23:54:44Z", recommendation: "BUY", askPrice: 1215, supportedValue: 1675, salesCountAtDecision: 4, immutable: true };
  if (f.legacy) Object.assign(decisionTime, { supportedValue: null, legacySavedValues: { supportedValue: 1675, immutable: true }, evidenceProvenanceStatus: NEW_LEGACY_STATUS, legacyNotice: LEGACY_NOTICE, currentlySupported: false, supportedValueStatus: "LEGACY_NOT_CURRENTLY_SUPPORTED" });
  return {
    kind: "evidence", readOnly: true, opportunityId: id, cardIdentity: TITLES[id],
    acceptedExactCompletedSales: listed.length, visibleButAuthorityIneligible: providerRows,
    currentAdmission: { admitted: listed.length, excluded: 0, held: 0, notUsed: providerRows, linkedRows: listed.length + providerRows, policy: "qa" },
    decisionTime, linkedEvidence: listed, manualCandidates: [],
    providerEvidenceSummary: { label: "Reported completed sale (data provider)", saleDetailsWithheld: true, storedRowsLinked: providerRows, storedRowsAdmittedNow: 0,
      storedRowReasons: { PROVIDER_STORED_HISTORY_NOT_RETAINED: providerRows }, evidenceMode: "PROVIDER_SUSPENDED_V1", storedSaleRecordsKept: false, liveQualifiedSales: 0, liveAvailable: false, liveExpiresAt: null },
    timeline: [{ recordedAt: "2026-10-06T23:54:44Z", eventType: "EVIDENCE_ATTACHED", reason: "Saved evidence event.", previousState: null, currentState: "ATTACHED", referenceId: null }],
    priceStatusLabel: "No price shown. Current sales of this exact card are checked when you evaluate it; past sale records are not kept.",
    evidenceProvenanceStatus: f.legacy ? NEW_LEGACY_STATUS : NEW_CURRENT_STATUS, legacyNotice: f.legacy ? LEGACY_NOTICE : null,
    internalOperatorFieldsExcluded: true, transactionAuthority: false
  };
}

function evidence(id, f) {
  if (f.shape === "new") return newEvidence(id, f);
  const rows = f.prices
    ? [
        { sourceName: "CardSight", type: "CARDSIGHT_EBAYSOLD_COMP", amount: 1650, soldAt: "2026-10-01T00:00:00Z", identityMatch: true, authorityEligible: true, currentAdmissionStatus: "ADMITTED" },
        { sourceName: "CARDSIGHT_EBAY", type: "SOLD_COMP", amount: 1700, soldAt: "2026-09-21T00:00:00Z", identityMatch: true, authorityEligible: false, currentAdmissionStatus: "EXCLUDED" }
      ]
    : [
        { sourceName: "CardSight", type: "CARDSIGHT_EBAYSOLD_COMP", identityMatch: true, authorityEligible: true, currentAdmissionStatus: "ADMITTED" },
        { sourceName: "CARDSIGHT_EBAY", type: "SOLD_COMP_AUCTION", identityMatch: true, authorityEligible: false, currentAdmissionStatus: "EXCLUDED" }
      ];
  const data = { kind: "evidence", opportunityId: id, acceptedExactCompletedSales: 1, visibleButAuthorityIneligible: 1, priceStatusLabel: "Reported sale prices, matched to the exact card",
    linkedEvidence: rows, timeline: [], manualCandidates: [], transactionAuthority: false };
  if (f.legacy) Object.assign(data, { evidenceProvenanceStatus: LEGACY_STATUS, legacyNotice: LEGACY_NOTICE });
  return data;
}

const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) }).catch(() => {});
const envelope = (correlationId, data) => ({
  meta: { contractVersion: "1.0", engineVersion: "trust-display-audit", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence",
    correlationId, generatedAt: "2026-10-19T12:00:00Z", evidenceFreshness: "QA_FIXTURE", limitations: [] },
  data
});

function fixture(f) {
  return async route => {
    const url = new URL(route.request().url());
    const cid = route.request().headers()["x-correlation-id"] || "trust-display-audit";
    if (route.request().method().toUpperCase() !== "GET") return json(route, 405, { error: { code: "QA_READ_ONLY", message: "No writes.", correlationId: cid } });
    const p = url.pathname;
    const record = p.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor|lifecycle)\/([^/]+)$/);
    if (record) {
      const id = decodeURIComponent(record[2]);
      if (!TITLES[id]) return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Unknown synthetic record.", correlationId: cid } });
      if (record[1] === "opportunities") {
        const detail = { kind: "opportunity-detail", opportunity: opportunity(id, f), sourceOfTruth: "SQLite", transactionAuthority: false };
        if (f.shape === "new" && f.legacy) detail.priceIntelligence = { available: false, status: "LEGACY_NOT_CURRENTLY_SUPPORTED", reason: LEGACY_NOTICE };
        return json(route, 200, envelope(cid, detail));
      }
      if (record[1] === "evidence") return json(route, 200, envelope(cid, evidence(id, f)));
      if (record[1] === "psa-advisor") return json(route, 200, envelope(cid, { kind: "psa-advisor", opportunityId: id, cardIdentity: TITLES[id], guidanceStatus: "SAVED_GUIDANCE_AVAILABLE",
        authoritativeOpportunityRecommendation: "BUY", recalculated: false, savedPsaSnapshot: {}, populationContext: {}, transactionAuthority: false,
        ...(f.legacy ? { evidenceProvenanceStatus: LEGACY_STATUS, legacyNotice: LEGACY_NOTICE } : {}) }));
      return json(route, 200, envelope(cid, { kind: "lifecycle-detail", opportunityId: id, sourceOfTruth: "SQLite",
        lifecycle: { opportunityId: id, trackingStatus: "WATCHING", outcomeStatus: "NONE", reviewAt: null, alertEnabled: false, version: 1 },
        history: [{ recordedAt: "2026-10-06T23:54:44Z", eventType: "CREATED", trackingStatus: "WATCHING", outcomeStatus: "NONE", recordVersion: 1 }],
        decisionTimeline: { available: false, entries: [] }, transactionAuthority: false }));
    }
    if (p.startsWith("/api/v1/card-intelligence/")) {
      // Data provider suspended (FlipForge2#885 default): identity assist reports unavailable.
      return json(route, 503, { error: { code: "CARD_INTELLIGENCE_UNAVAILABLE", message: "Card intelligence is unavailable.", correlationId: cid } });
    }
    if (p === "/api/v1/health") return json(route, 200, envelope(cid, { status: "configured", bridgeEnabled: true, providerEvidenceMode: "PROVIDER_SUSPENDED_V1", evidenceStorageGuard: "VERIFIED" }));
    if (p === "/api/v1/entitlements") return json(route, 200, envelope(cid, { kind: "entitlements", membershipActive: true, current: { code: "PRIVATE_BETA", accessState: "ACTIVE" }, plan: { code: "PRIVATE_BETA" }, usage: { completedEvaluations: 0 } }));
    if (p === "/api/v1/opportunities") return json(route, 200, envelope(cid, { kind: "opportunities", items: IDS.map(id => opportunity(id, f)), count: IDS.length, sourceOfTruth: "SQLite", transactionAuthority: false }));
    if (p === "/api/v1/dashboard") return json(route, 200, envelope(cid, { metrics: { trackedOpportunities: IDS.length }, items: IDS.map(id => opportunity(id, f)) }));
    if (p === "/api/v1/lifecycle") return json(route, 200, envelope(cid, { kind: "lifecycle", sourceOfTruth: "SQLite", items: [], transactionAuthority: false }));
    if (p === "/api/v1/compare") {
      const ids = String(url.searchParams.get("ids") || "").split(",");
      if (ids.length !== 2 || !ids.every(id => TITLES[id])) return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Unknown pair.", correlationId: cid } });
      return json(route, 200, envelope(cid, { kind: "compare", count: 2, items: ids.map(id => opportunity(id, f)), sameExactCardIdentity: false, comparisonBoundary: "Display only." }));
    }
    return json(route, 404, { error: { code: "QA_NOT_MOCKED", message: p, correlationId: cid } });
  };
}

// ---------- session ----------
const browser = await chromium.launch({ executablePath, args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"] });
async function open(route, f = BASE, { active = "", storageThrows = false, wait = 4500, expandAll = true, host = "goflipforge.com" } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); } catch (_) {} });
  if (active) await context.addInitScript(id => { try { sessionStorage.setItem("flipforge.trackingContext.v1", id); } catch (_) {} }, active);
  if (storageThrows) await context.addInitScript(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) { if (this === window.sessionStorage) throw new Error("QA: session storage unavailable"); return get.call(this, key); };
    Storage.prototype.setItem = function () { throw new Error("QA: storage unavailable"); };
  });
  await context.route(/\/assets\/js\/flipforge-identity\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${email}"}),getSnapshot:()=>({authenticated:true,email:"${email}",fullName:"Trust Display Audit",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${email}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"t"});` }));
  await context.route(/\/assets\/js\/flipforge-production-signin\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/v1/**", fixture(f));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => { if (!/QA: (?:session )?storage unavailable/.test(e.message)) errors.push(e.message.slice(0, 160)); });
  await page.goto(`${APP.replace("goflipforge.com", host)}#/${route}`, { waitUntil: "load" });
  await page.waitForTimeout(wait);
  if (expandAll) {
    await page.evaluate(() => document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }));
    await page.waitForTimeout(400);
  }
  const text = await page.evaluate(() => document.querySelector("#main-content")?.innerText || "");
  return { context, page, errors, text };
}
const riskChip = page => page.evaluate(() => {
  const chip = document.querySelector("#main-content .ff-risk-summary");
  return chip ? chip.innerText.replace(/\s+/g, " ").trim() : "";
});
const passportRisk = page => page.evaluate(() => {
  const article = document.querySelector('#main-content [data-ff-decision-card-evidence] article[data-tone="risk"]');
  return article ? { value: article.querySelector("strong")?.textContent.trim(), small: article.querySelector("small")?.textContent.trim() } : null;
});
const metricValue = (page, label) => page.evaluate(l => {
  const article = [...document.querySelectorAll("#main-content .customer-intelligence-metrics article")].find(a => a.querySelector("span")?.textContent.trim() === l);
  return article ? article.querySelector("strong")?.textContent.trim() : null;
}, label);

// Customer-readable text that must never appear (rendered page text).
const PROHIBITED = [
  [/card\s*_?sight/i, "provider name"],
  [/\bverified\b/i, "\"verified\""],
  [/\btrusted now\b|what flipforge trusted/i, "\"trusted\" evidence label"],
  [/\b(?:trusted|trustworthy|verified|confirmed)\s+(?:exact\s+)?(?:completed\s+)?(?:sales?|sold|comps?)\b/i, "trusted/verified/confirmed sales"],
  [/\b[A-Z]+_[A-Z_]*(?:EBAY|COMP|SOLD)[A-Z_]*\b|\bSOLD_COMP\b|\bCARDSIGHT\b/, "raw source code"],
  [/\bundefined\b|\bNaN\b/, "\"undefined\"/\"NaN\""],
  [/final saved decision risk/i, "\"final\" risk wording"]
];
function prohibitedIn(text) {
  return PROHIBITED.filter(([pattern]) => pattern.test(text)).map(([pattern, label]) => `${label}: "${(text.match(pattern) || [""])[0]}"`);
}

const PAGES = [["Saved Decisions", "opportunities"], ["card detail", "opportunities/qa-trust-a"], ["Evidence", "evidence/qa-trust-a"], ["Compare", "compare"],
  ["PSA Advisor", "psa-advisor/qa-trust-a"], ["Audit Export", "export/qa-trust-a"], ["Decision Intelligence", "decision-intelligence"]];

try {
  // T1 (R1, R2): risk 35 / governed 35, BUY.
  {
    const s = await open("opportunities/qa-trust-a");
    const chip = await riskChip(s.page);
    check("T1 card detail: decision risk reads Moderate 35/100 for a saved risk of 35", /^Decision risk Moderate 35\/100 saved decision risk$/i.test(chip), chip);
    check("T1 card detail: no 100/100 risk and no \"final\" risk wording anywhere", !/100\/100/.test(s.text) && !/final saved decision risk/i.test(s.text));
    const passport = await passportRisk(s.page);
    check("T1 evidence passport: RISK + UNCERTAINTY shows 35/100 with confidence 83/100", passport?.value === "35/100" && passport?.small === "Confidence 83/100", JSON.stringify(passport));
    check("T1 evidence passport: economics layer reads the listing price ($1,215 ask)", /\$1,215 ask/.test(s.text));
    check("T1 card detail: decision-risk metric shows 35/100", await metricValue(s.page, "Decision risk") === "35/100", String(await metricValue(s.page, "Decision risk")));
    check("T1 card detail: no page errors", s.errors.length === 0, s.errors.join(" | "));
    await s.context.close();
  }
  // T2: governedDecision.risk is preferred over risk.
  {
    const s = await open("opportunities/qa-trust-a", { ...BASE, risk: 80, governedRisk: 35 });
    const chip = await riskChip(s.page);
    check("T2 card detail: governedDecision.risk (35) is shown in preference to risk (80)", /Moderate 35\/100/.test(chip) && !/80\/100/.test(chip), chip);
    await s.context.close();
  }
  // T3: risk missing everywhere -> Unavailable, never 0 or 100.
  {
    const s = await open("opportunities/qa-trust-a", { ...BASE, risk: null, governedRisk: null });
    const chip = await riskChip(s.page);
    const passport = await passportRisk(s.page);
    check("T3 card detail: missing risk shows \"Unavailable\" (never 0/100 or 100/100)", /^Decision risk Unavailable$/i.test(chip) && passport?.value === "Unavailable" && !/(?:^|\D)(?:0|100)\/100 (?:saved decision )?risk/.test(s.text), `${chip} / ${JSON.stringify(passport)}`);
    await s.context.close();
  }
  // T4 (R5): confidence null -> Unavailable; a real 0 stays 0.
  {
    const s = await open("opportunities/qa-trust-a", { ...BASE, confidence: null, governedConfidence: null });
    const passport = await passportRisk(s.page);
    check("T4 card detail: null confidence shows \"Unavailable\", not 0/100", await metricValue(s.page, "Confidence") === "Unavailable" && passport?.small === "Confidence Unavailable", `${await metricValue(s.page, "Confidence")} / ${JSON.stringify(passport)}`);
    await s.context.close();
    const list = await open("opportunities", { ...BASE, confidence: null });
    const cells = await list.page.evaluate(() => [...document.querySelectorAll("#main-content table tbody tr")].map(tr => [...tr.children].map(td => td.innerText.trim())));
    check("T4 Saved Decisions: null confidence shows \"Unavailable\" in every row", cells.length === 2 && cells.every(row => row.includes("Unavailable") && !row.includes("0/100")), JSON.stringify(cells));
    await list.context.close();
    const zero = await open("opportunities/qa-trust-a", { ...BASE, confidence: 0, governedConfidence: 0 });
    check("T4 card detail: a real confidence of 0 stays 0/100", await metricValue(zero.page, "Confidence") === "0/100", String(await metricValue(zero.page, "Confidence")));
    await zero.context.close();
    const compare = await open("compare", { ...BASE, confidence: null });
    check("T4 Compare: null confidence shows \"Unavailable\"", /CONFIDENCE\s+Unavailable\s+Unavailable|Confidence\s+Unavailable\s+Unavailable/i.test(compare.text), "");
    await compare.context.close();
  }
  // T5 (R3): no provider name, raw code, verified/trusted wording on any customer page; price-status label shown.
  for (const prices of [true, false]) {
    for (const [name, route] of PAGES) {
      const s = await open(route, { ...BASE, prices });
      const found = prohibitedIn(s.text);
      check(`T5 ${name}${prices ? "" : " (prices withheld)"}: no provider name, raw source code, verified/trusted/confirmed sales or "undefined"`, found.length === 0, found.join("; "));
      check(`T5 ${name}${prices ? "" : " (prices withheld)"}: no page errors`, s.errors.length === 0, s.errors.join(" | "));
      if (route.startsWith("evidence/")) {
        check(`T5 Evidence${prices ? "" : " (prices withheld)"}: the API's price-status label describes price support`, s.text.includes("Reported sale prices, matched to the exact card"));
        check(`T5 Evidence${prices ? "" : " (prices withheld)"}: sources read "eBay (reported sale)" / "Reported completed sale"`, /eBay \(reported sale\)/.test(s.text) && /Reported completed sale/.test(s.text));
        const tables = await s.page.evaluate(() => [...document.querySelectorAll("#main-content table")].map(t => ({
          head: [...t.querySelectorAll("thead th")].map(th => th.textContent.trim()),
          cells: [...t.querySelectorAll("tbody td")].map(td => td.textContent.trim())
        })));
        const evidenceTables = tables.filter(t => t.head.includes("Source"));
        if (prices) {
          check("T5 Evidence: with prices returned, amounts and dates are shown", evidenceTables.some(t => t.head.includes("Amount") && t.cells.includes("$1,650")));
        } else {
          check("T5 Evidence (prices withheld): tables render from counts and categories - no Amount/Sale date columns, no blank, $0 or \"undefined\" cell",
            evidenceTables.length >= 1 && evidenceTables.every(t => !t.head.includes("Amount") && !t.head.includes("Sale date") && t.cells.every(c => c && c !== "$0" && !/undefined|NaN/.test(c))),
            JSON.stringify(evidenceTables));
          check("T5 Evidence (prices withheld): a note says individual prices are not shown", /Individual sale prices and dates are not shown/.test(s.text));
        }
      }
      if (route === "opportunities/qa-trust-a" && !prices) {
        check("T5 card detail (prices withheld): no $0 in the evidence chain", !/\$0(?!\.\d|\d)/.test(s.text));
      }
      await s.context.close();
    }
  }
  // T6: legacy results are labelled everywhere they appear, without current-support copy.
  {
    const legacy = { ...BASE, legacy: true };
    for (const [name, route] of PAGES.filter(([n]) => n !== "Decision Intelligence")) {
      const s = await open(route, legacy);
      check(`T6 ${name}: legacy badge and the server's legacyNotice are shown`, s.text.includes(LEGACY_BADGE) && s.text.includes(LEGACY_NOTICE));
      // The Saved Decisions list also has a generic glossary of what BUY/WATCH/VERIFY/PASS mean; only the rows are
      // about these records.
      const scoped = route === "opportunities" ? await s.page.evaluate(() => [...document.querySelectorAll("#main-content table")].map(t => t.innerText).join("\n")) : s.text;
      const support = /Buy looks supported|supports this purchase|currently support this card|found enough support for a BUY|currently satisfy the exact-comparable rules/i;
      check(`T6 ${name}: no current-support copy on a legacy result`, !support.test(scoped), (scoped.match(support) || [""])[0]);
      if (route === "opportunities/qa-trust-a") {
        check("T6 card detail: the saved recommendation stays visible as historical", /Saved recommendation: BUY/.test(s.text) && /Saved BUY \(historical\)/.test(s.text));
      }
      check(`T6 ${name}: no page errors`, s.errors.length === 0, s.errors.join(" | "));
      await s.context.close();
    }
    // Records without the field, or with CURRENT, never show legacy status.
    for (const [label, f] of [["no evidenceProvenanceStatus field", BASE], ["evidenceProvenanceStatus CURRENT", { ...BASE, provenance: "CURRENT" }]]) {
      for (const [name, route] of PAGES) {
        const s = await open(route, f, { wait: 3500 });
        check(`T6 ${name} (${label}): no legacy badge or notice`, !s.text.includes(LEGACY_BADGE) && !/Saved BUY \(historical\)/.test(s.text) && !(await s.page.locator("[data-ff-legacy-result]").count()));
        await s.context.close();
      }
    }
  }
  // T7 (R4): pages opened without a card use the remembered active card when this tenant has it.
  {
    const selected = page => page.evaluate(() => [...document.querySelectorAll("#main-content select")].map(s => `${s.id || "select"}=${s.value}`).join(" "));
    for (const [name, route, expected] of [["Compare (Card A)", "compare", "compare-left=qa-trust-b"], ["PSA Advisor", "psa-advisor", "=qa-trust-b"], ["Evidence", "evidence", "=qa-trust-b"], ["Audit Export", "export", "=qa-trust-b"]]) {
      const s = await open(route, BASE, { active: "qa-trust-b", expandAll: false });
      const value = await selected(s.page);
      check(`T7 ${name}: without an id in the address, the remembered active card is selected`, value.includes(expected), value);
      await s.context.close();
      const stale = await open(route, BASE, { active: "qa-not-in-tenant", expandAll: false });
      const staleValue = await selected(stale.page);
      check(`T7 ${name}: a remembered card this tenant does not have is ignored (first card used)`, staleValue.includes(expected.replace("qa-trust-b", "qa-trust-a")), staleValue);
      await stale.context.close();
      const blocked = await open(route, BASE, { storageThrows: true, expandAll: false });
      const blockedValue = await selected(blocked.page);
      check(`T7 ${name}: unavailable session storage never breaks the page (first card used, no errors)`, blockedValue.includes(expected.replace("qa-trust-b", "qa-trust-a")) && blocked.errors.length === 0, `${blockedValue} ${blocked.errors.join(" | ")}`);
      await blocked.context.close();
    }
    const s = await open("opportunities/qa-trust-b", BASE, { expandAll: false });
    const links = await s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".ff-advanced-nav a[data-route]")].map(a => [a.dataset.route, a.getAttribute("href")])));
    check("T7 Advanced nav on a card: PSA Advisor, Evidence and Audit Export links include the card's id",
      links["psa-advisor"] === "#/psa-advisor/qa-trust-b" && links.evidence === "#/evidence/qa-trust-b" && links.export === "#/export/qa-trust-b", JSON.stringify(links));
    await s.page.evaluate(() => { location.hash = "#/dashboard"; });
    await s.page.waitForTimeout(1200);
    const generic = await s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".ff-advanced-nav a[data-route]")].map(a => [a.dataset.route, a.getAttribute("href")])));
    check("T7 Advanced nav off a card: links return to their generic routes", generic["psa-advisor"] === "#/psa-advisor" && generic.evidence === "#/evidence" && generic.export === "#/export", JSON.stringify(generic));
    await s.context.close();
  }
  // T8: new API shape (FlipForge2#885) - current items carry CURRENT_EVIDENCE_RULES; legacy items carry
  // LEGACY_PROVIDER_DERIVED with null values and legacySavedValues; evidence lists no provider rows.
  {
    const current = { ...BASE, shape: "new" };
    for (const [name, route] of PAGES) {
      const s = await open(route, current);
      check(`T8 ${name} (new shape, CURRENT_EVIDENCE_RULES): no legacy badge or notice`, !s.text.includes(LEGACY_BADGE) && !(await s.page.locator("[data-ff-legacy-result]").count()));
      const found = prohibitedIn(s.text);
      check(`T8 ${name} (new shape): no provider name, raw code, verified sales, "undefined" or NaN`, found.length === 0, found.join("; "));
      check(`T8 ${name} (new shape): no page errors`, s.errors.length === 0, s.errors.join(" | "));
      if (route.startsWith("evidence/")) {
        check("T8 Evidence (new shape): counts that include unlisted provider rows still render (no fail-closed notice)", !/Evidence temporarily unavailable/.test(s.text));
        check("T8 Evidence (new shape): provider rows are summarised by count and reason", /Reported completed sale \(data provider\): 0 counted now · 3 not counted/.test(s.text) && /3\s+Past sale records from our data provider are not kept/.test(s.text));
        check("T8 Evidence (new shape): listed non-provider rows still show their reported price", s.text.includes("$1,650"));
      }
      await s.context.close();
    }
    const legacy = { ...BASE, shape: "new", legacy: true };
    for (const [name, route] of PAGES.filter(([n]) => n !== "Decision Intelligence")) {
      const s = await open(route, legacy);
      check(`T8 ${name} (new shape, LEGACY_PROVIDER_DERIVED): legacy badge and the server's legacyNotice are shown`, s.text.includes(LEGACY_BADGE) && s.text.includes(LEGACY_NOTICE));
      check(`T8 ${name} (new shape, legacy): nulls never render as $0, NaN or "undefined"`, !/\$0(?![.,\d])|\bNaN\b|\bundefined\b|0\.0%/.test(s.text), (s.text.match(/\$0(?![.,\d])|\bNaN\b|\bundefined\b|0\.0%/) || [""])[0]);
      check(`T8 ${name} (new shape, legacy): no page errors`, s.errors.length === 0, s.errors.join(" | "));
      if (route === "opportunities/qa-trust-a") {
        check("T8 card detail (new shape, legacy): saved values shown only as \"at the time (legacy)\"", /Saved value at the time \(legacy\): \$1,675/.test(s.text) && /Max Buy at the time \(legacy\): \$1,400/.test(s.text));
        check("T8 card detail (new shape, legacy): supported value reads Unavailable / not currently supported", /SUPPORTED VALUE\s+Unavailable/i.test(s.text) && /Not currently supported/.test(s.text));
        // The Price Intelligence panel may sit in a collapsed advanced section, so its DOM text is read directly.
        const priceText = await s.page.evaluate(() => document.querySelector("[data-price-intelligence-panel]")?.textContent || "");
        check("T8 card detail (new shape, legacy): Price Intelligence says no thresholds for a legacy result", /Price thresholds are not shown for a result saved before current evidence rules/.test(priceText) && !/SAFETY_CONTRACT|did not satisfy/.test(priceText), priceText.replace(/\s+/g, " ").slice(0, 200));
        check("T8 card detail (new shape, legacy): no current-support copy", !/Buy looks supported|supports this purchase at the evaluated price|found enough support for a BUY/.test(s.text));
      }
      if (route === "compare") {
        check("T8 Compare (new shape, legacy): supported value and discount read Unavailable; saved value labelled legacy", /SUPPORTED VALUE\s+Unavailable\s+Unavailable/i.test(s.text) && /SAVED DISCOUNT\s+Unavailable\s+Unavailable/i.test(s.text) && /Saved value at the time \(legacy\): \$1,675/.test(s.text));
      }
      if (route.startsWith("evidence/")) {
        check("T8 Evidence (new shape, legacy): no fail-closed notice; decision time shows the saved value as legacy", !/Evidence temporarily unavailable/.test(s.text) && /Saved value at the time \(legacy\)\s*\$1,675/i.test(s.text));
        const emptyTables = await s.page.evaluate(() => [...document.querySelectorAll("#main-content table")].filter(t => !t.querySelector("tbody tr")).length);
        check("T8 Evidence (new shape, legacy): no empty sale table; counts and reasons instead", emptyTables === 0 && /0 counted now · 3 not counted/.test(s.text), `${emptyTables} empty tables`);
      }
      await s.context.close();
    }
  }
} catch (error) {
  failures.push(`audit did not complete: ${String(error.message || error).split("\n")[0]}`);
} finally {
  await browser.close();
}

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) {
  console.log(`FAIL ${line}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Customer trust display audit::${line.replace(/[\r\n]+/g, " ").slice(0, 900)}`);
}
console.log(`\nCustomer trust display audit: ${passes.length}/${passes.length + failures.length} passed.`);
process.exit(failures.length ? 1 : 0);
