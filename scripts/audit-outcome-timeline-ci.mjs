// Outcome Checkpoint Timeline v1 (decision-outcome-timeline-v1.js): one Day 7 / 14 / 30 timeline on Saved Decisions
// and Tracking. Display only: every value comes from a synthetic fixture shaped like FlipForge2's
// outcome-checkpoint-timeline-v1 and is shown as returned; nothing is computed, estimated or written.
//
// Covered (directive sections 4, 5 and 7):
//   T1  Each state reads with its exact plain-language label: Awaiting Checkpoint, Price Observed, No Reliable Evidence,
//       No New Sales, Window Closed, Customer-Reported — Unverified, Historical Reconstruction.
//   T2  No checkpoint ever reads "Waiting for observation" (expired windows read Window Closed).
//   T3  Comparisons show a percentage only where the server marked them comparable; otherwise "No comparison".
//   T4  The same timeline (same text) is on Saved Decisions and on Tracking; the three questions are answered.
//   T5  Customer reports are labelled "Customer-Reported — Unverified" and never counted as a market price.
//   T6  A timeline that breaks an integrity promise is not shown (Saved Decisions) and Tracking falls back without
//       "Waiting for observation".
//   T7  Desktop 1440, tablet 834 and phone 390: no horizontal overflow, no page errors, no provider name; screenshots.
//   T8  Saved Decisions reads the timeline with one GET /api/v1/lifecycle/{id}; no write is sent.
//
// Screenshots go to FF_OTL_SHOTS (default output/outcome-timeline). The production host is mapped to the local server
// (saas-prototype/serve.mjs, port 4173 or FLIPFORGE_OTL_AUDIT_PORT). FF_OTL_MODE=before runs the same journeys
// against a build without the timeline and only captures screenshots (for before/after review).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const PORT = process.env.FLIPFORGE_OTL_AUDIT_PORT || "4173";
const BETA = `http://goflipforge.com:${PORT}/app/beta/`;
const SHOTS = process.env.FF_OTL_SHOTS || "output/outcome-timeline";
const BEFORE = process.env.FF_OTL_MODE === "before";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE || undefined;
const email = "outcome-timeline-audit@flipforge.test";
fs.mkdirSync(SHOTS, { recursive: true });

const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

// ---------- fixtures (synthetic, outcome-checkpoint-timeline-v1 shape) ----------
const LABELS = { AWAITING_CHECKPOINT: "Awaiting Checkpoint", PRICE_OBSERVED: "Price Observed", NO_RELIABLE_EVIDENCE: "No Reliable Evidence",
  NO_NEW_SALES: "No New Sales", WINDOW_CLOSED: "Window Closed", CUSTOMER_REPORTED_UNVERIFIED: "Customer-Reported — Unverified",
  HISTORICAL_RECONSTRUCTION: "Historical Reconstruction" };
const none = (explanation = "No comparison: this checkpoint has no reliable price.") => ({ comparable: false, changeCents: null, changePercent: null, direction: null, explanation });
const cmp = (cents, pct, dir, explanation, prior) => ({ comparable: true, changeCents: cents, changePercent: pct, direction: dir, explanation, ...(prior ? { comparedWithHorizonDays: prior } : {}) });
const DATES = { 7: ["Sep 8, 2026", "Sep 10, 2026"], 14: ["Sep 15, 2026", "Sep 18, 2026"], 30: ["Oct 1, 2026", "Oct 6, 2026"] };
function cp(h, st, extra = {}) {
  const priced = st === "PRICE_OBSERVED";
  return Object.assign({
    horizonDays: h, label: `Day ${h}`, dueOnText: DATES[h][0], windowClosesOnText: DATES[h][1], windowState: "CLOSED",
    state: st, stateLabel: LABELS[st], underlyingState: st, reasonCode: "SYNTHETIC",
    explanation: {
      WINDOW_CLOSED: `The Day ${h} window closed on ${DATES[h][1]} with no reliable pricing evidence recorded. It stays closed and is never filled in later from estimates.`,
      NO_RELIABLE_EVIDENCE: "Fewer than 2 qualifying completed sales of this exact card were available, so no price is recorded.",
      NO_NEW_SALES: `No new completed sale of this exact card was found after the decision, so there is no new market price for Day ${h}.`,
      PRICE_OBSERVED: "Completed sales of this exact card, recorded after the decision by an independent source that passed FlipForge's provenance checks, put the supported value at this checkpoint. No source confirms that a buyer paid.",
      AWAITING_CHECKPOINT: `Day ${h} is due on ${DATES[h][0]}.`,
      CUSTOMER_REPORTED_UNVERIFIED: "You reported a price for this period. It is your own report: FlipForge has not verified it and does not count it as a market price."
    }[st],
    evidence: { observedValueCents: null, reliability: priced ? "INDEPENDENTLY_VERIFIED" : "NONE", acceptedSalesAtCheckpoint: null, recordedValueWithheld: false },
    comparisonToBaseline: none(), comparisonToPrior: h === 7 ? none("Day 7 is the first checkpoint.") : none(),
    customerReports: [], evidenceConflict: { present: false }, historicalReconstruction: null
  }, extra);
}
const report = (action, cents, on, platform = null) => ({ label: LABELS.CUSTOMER_REPORTED_UNVERIFIED, action, reportedPriceCents: cents, reportedOn: on,
  reportedPlatform: platform, window: "D7", verified: false, countedAsMarketPrice: false, usedInComparisons: false });
function timeline(id, verdict, checkpoints, conclusion, decision = {}) {
  return {
    kind: "outcome-checkpoint-timeline", version: "outcome-checkpoint-timeline-v1", opportunityId: id, timeZone: "America/New_York",
    available: true, status: "AVAILABLE", readOnly: true, historicalRescoring: false, historicalBackfill: false, syntheticPrices: false,
    askingPricesUsedAsSales: false, customerReportsVerified: false, reconstructionsMergedWithLive: false, unverifiedObservationValuesShown: false,
    providerRequestMade: false, customerAccuracyClaimAuthorized: false, transactionAuthority: false,
    originalDecision: Object.assign({ requestId: `req-${id}`, recommendation: verdict, decidedOnText: "Sep 1, 2026", reasonCode: "SYNTHETIC",
      reasonExplanation: `${verdict}: the saved reason for this synthetic decision.`, why: [`Synthetic receipt line for ${verdict}.`],
      baselineSupportedValueCents: 10000, baselineSupported: true, baselineExplanation: "The original decision's supported value is the baseline for later checkpoints.",
      receiptPresent: true, laterReevaluationCount: 0, immutable: true }, decision),
    checkpoints, customerReportsOutsideCheckpoints: [], conclusion,
    summary: { priceObservedCheckpoints: checkpoints.filter(c => c.state === "PRICE_OBSERVED").length }, historicalReconstructionDisplay: "OFF_PENDING_COMPLIANCE_APPROVAL"
  };
}
const NO_EVIDENCE = { code: "NO_RELIABLE_EVIDENCE", canConclude: false, statement: "No reliable market evidence was recorded at Day 7, Day 14 or Day 30. FlipForge cannot say how this decision turned out, and it will not estimate an outcome." };
const CARDS = {
  "otl-closed": { title: "2020 Prizm Justin Herbert #325 PSA 10", verdict: "BUY",
    timeline: id => timeline(id, "BUY", [cp(7, "WINDOW_CLOSED"), cp(14, "WINDOW_CLOSED"), cp(30, "WINDOW_CLOSED")], NO_EVIDENCE) },
  "otl-observed": { title: "2018 Topps Chrome Shohei Ohtani #150 PSA 9", verdict: "BUY",
    timeline: id => timeline(id, "BUY", [
      cp(7, "PRICE_OBSERVED", { evidence: { observedValueCents: 11000, reliability: "INDEPENDENTLY_VERIFIED", acceptedSalesAtCheckpoint: 2 },
        comparisonToBaseline: cmp(1000, 10.0, "UP", "Supported value is 10.0% above the original decision's supported value.") }),
      cp(14, "NO_RELIABLE_EVIDENCE"),
      cp(30, "PRICE_OBSERVED", { evidence: { observedValueCents: 9500, reliability: "INDEPENDENTLY_VERIFIED", acceptedSalesAtCheckpoint: 3 },
        comparisonToBaseline: cmp(-500, -5.0, "DOWN", "Supported value is 5.0% below the original decision's supported value."),
        comparisonToPrior: cmp(-1500, -13.6, "DOWN", "Supported value is 13.6% below Day 7.", 7) })
    ], { code: "MOVEMENT_OBSERVED", canConclude: true, latestEvidenceHorizonDays: 30, direction: "DOWN",
      statement: "At Day 30, exact-card completed sales from an independent source put the supported value 5.0% below the original decision's supported value. That is not in line with the original BUY. This describes one card's market movement; it does not show whether FlipForge's decisions are accurate in general." }) },
  "otl-pending": { title: "2023 Bowman Chrome Jackson Holliday #BCP-1 PSA 10", verdict: "WATCH",
    timeline: id => timeline(id, "WATCH", [cp(7, "AWAITING_CHECKPOINT", { windowState: "OPEN", explanation: "Day 7 is due now. Its window is open until Nov 12, 2026; nothing has been recorded yet.", dueOnText: "Nov 10, 2026", windowClosesOnText: "Nov 12, 2026" }),
      cp(14, "AWAITING_CHECKPOINT", { windowState: "NOT_YET_DUE", dueOnText: "Nov 17, 2026", windowClosesOnText: "Nov 20, 2026", explanation: "Day 14 is due on Nov 17, 2026." }),
      cp(30, "AWAITING_CHECKPOINT", { windowState: "NOT_YET_DUE", dueOnText: "Dec 3, 2026", windowClosesOnText: "Dec 8, 2026", explanation: "Day 30 is due on Dec 3, 2026." })],
    { code: "PENDING", canConclude: false, statement: "No reliable market evidence has been recorded so far, so no outcome can be stated yet. Still to come: Day 7 (window open until Nov 12, 2026), Day 14 (due Nov 17, 2026), Day 30 (due Dec 3, 2026)." },
    { decidedOnText: "Nov 3, 2026" }) },
  "otl-nonew": { title: "2019 Prizm Zion Williamson #248 PSA 10", verdict: "PASS",
    timeline: id => timeline(id, "PASS", [cp(7, "NO_NEW_SALES"),
      cp(14, "NO_RELIABLE_EVIDENCE", { evidence: { observedValueCents: null, reliability: "NOT_INDEPENDENTLY_VERIFIED", recordedValueWithheld: true },
        explanation: "A checkpoint was recorded, but its sources did not pass FlipForge's provenance checks (restricted or unconfirmed sources), so its value is not shown or used." }),
      cp(30, "WINDOW_CLOSED")], NO_EVIDENCE, { baselineSupported: false, baselineSupportedValueCents: null,
      baselineExplanation: "The original decision had no supported market value, so there is no baseline to compare later evidence with." }) },
  "otl-reported": { title: "2018 Prizm Luka Doncic #280 PSA 10", verdict: "VERIFY",
    timeline: id => timeline(id, "VERIFY", [
      cp(7, "CUSTOMER_REPORTED_UNVERIFIED", { underlyingState: "WINDOW_CLOSED", customerReports: [report("BOUGHT", 9500, "2026-09-03")],
        historicalReconstruction: { state: "HISTORICAL_RECONSTRUCTION", stateLabel: LABELS.HISTORICAL_RECONSTRUCTION, result: "Recalculated value", reconstructedValueCents: 10400,
          asOfDate: "2026-09-08", liveTracking: false, countedInCheckpoint: false, usedInComparisons: false,
          explanation: "Recalculated later, in a one-time look-back, from sales dated up to Day 7. It is not live tracking, is not independently verified, and is not counted in this checkpoint's result or comparisons." } }),
      cp(14, "WINDOW_CLOSED"),
      cp(30, "CUSTOMER_REPORTED_UNVERIFIED", { underlyingState: "WINDOW_CLOSED", customerReports: [report("SOLD", 14000, "2026-09-20", "EBAY")] })
    ], { code: "NO_RELIABLE_EVIDENCE", canConclude: false, statement: NO_EVIDENCE.statement + " Your own reports are shown, but they are unverified and are not used in this conclusion." }) },
  "otl-conflict": { title: "2021 Prizm Ja Morant #10 PSA 10", verdict: "BUY",
    timeline: id => timeline(id, "BUY", [
      cp(7, "PRICE_OBSERVED", { evidence: { observedValueCents: 10000, reliability: "INDEPENDENTLY_VERIFIED", acceptedSalesAtCheckpoint: 2 },
        comparisonToBaseline: cmp(0, 0.0, "STABLE", "Supported value is within 5% of the original decision's supported value."),
        customerReports: [report("SOLD", 7000, "2026-09-06")],
        evidenceConflict: { present: true, explanation: "Your own report differs from the independent market evidence by more than 5%. FlipForge uses only the independent market evidence for comparisons; your report is shown as you entered it." } }),
      cp(14, "WINDOW_CLOSED"), cp(30, "WINDOW_CLOSED")
    ], { code: "MOVEMENT_OBSERVED", canConclude: true, latestEvidenceHorizonDays: 7, direction: "STABLE",
      statement: "At Day 7, exact-card completed sales from an independent source put the supported value within 5% of the original decision's supported value. That is in line with the original BUY. This describes one card's market movement; it does not show whether FlipForge's decisions are accurate in general. Your own reports are shown, but they are unverified and are not used in this conclusion." }) },
  "otl-invalid": { title: "2011 Topps Update Mike Trout #US175 PSA 9", verdict: "BUY",
    timeline: id => Object.assign(timeline(id, "BUY", [cp(7, "WINDOW_CLOSED"), cp(14, "WINDOW_CLOSED"), cp(30, "WINDOW_CLOSED")], NO_EVIDENCE), { customerReportsVerified: true }) }
};
const IDS = Object.keys(CARDS);

// The pre-timeline service shape (what production returns today): checkpoints with no observation.
const legacyChange = id => ({ kind: "decision-change-intelligence", available: true, opportunityId: id, historicalRescoring: false, historicalBackfill: false,
  transactionAuthority: false, customerAccuracyClaimAuthorized: false, selfTrainingAuthorized: false,
  outcomeReconciliation: { t0Decision: CARDS[id].verdict, t0EvaluatedAt: "2026-09-01T14:00:00Z", t0SupportedValueCents: 10000, observedCheckpointCount: 0,
    historicalBackfill: false, customerAccuracyClaimAuthorized: false,
    checkpoints: [7, 14, 30].map(h => ({ horizonDays: h, measurementState: "MISSING_OBSERVATION", available: false })) } });

function opportunity(id) {
  const c = CARDS[id];
  return { id, title: c.title, cardIdentity: c.title, recommendation: c.verdict, ask: 80, supportedValue: 100, supportedValueCents: 10000, confidence: 70,
    liquidity: 70, risk: 35, rank: 80, observedAt: "2026-09-01T14:00:00Z", platform: "EBAY", mappingState: "NOT_CONFIRMED", recommendationSource: "GOVERNED_SNAPSHOT",
    evidenceProvenanceStatus: "CURRENT_EVIDENCE_RULES", legacyNotice: null, legacyProvenanceVersion: "legacy-provenance-v1",
    evidence: { acceptedSales: 0, priceStatus: "LIVE_PRICING_ONLY", priceStatusLabel: "No price shown. Current sales of this exact card are checked when you evaluate it; past sale records are not kept." },
    governedDecision: { available: true, recommendation: c.verdict, confidence: 70, risk: 35, reason: `${c.verdict}: saved reason.`, evaluatedAt: "2026-09-01T14:00:00Z",
      supportedValueCents: 10000, supportedValueStatus: "ESTABLISHED", maximumBuyPriceCents: c.verdict === "VERIFY" ? null : 8500, allInAskCents: 8000,
      exactTrustedCompCount: 3, snapshotCount: 1, immutable: true, transactionAuthority: false } };
}
const evidence = id => ({ kind: "evidence", readOnly: true, opportunityId: id, cardIdentity: CARDS[id].title, acceptedExactCompletedSales: 0, visibleButAuthorityIneligible: 0,
  currentAdmission: { admitted: 0, excluded: 0, held: 0, notUsed: 0, linkedRows: 0, policy: "qa" }, linkedEvidence: [], manualCandidates: [], timeline: [],
  providerEvidenceSummary: { label: "Reported completed sale (data provider)", saleDetailsWithheld: true, storedRowsLinked: 0, storedRowsAdmittedNow: 0, storedRowReasons: {},
    evidenceMode: "PROVIDER_SALES_OFF", storedSaleRecordsKept: false, liveQualifiedSales: 0, liveAvailable: false, liveExpiresAt: null },
  priceStatusLabel: "No price shown.", evidenceProvenanceStatus: "CURRENT_EVIDENCE_RULES", legacyNotice: null, internalOperatorFieldsExcluded: true, transactionAuthority: false });
const decisionTimeline = id => ({ kind: "decision-timeline", opportunityId: id, available: true, timelineVersion: "v1.5.0", snapshotCount: 1, changedEntryCount: 0,
  historicalSnapshotsImmutable: true, historicalRescoring: false, historicalBackfill: false, transactionAuthority: false,
  entries: [{ requestId: `req-${id}`, cardIdentity: CARDS[id].title, marketplace: "EBAY", workflowStatus: "ACTIVE_WATCHLIST", supportedValueCents: 10000,
    evidenceQuality: "MODERATE", reviewEvidenceCount: 0, rejectedEvidenceCount: 0, confidence: 70, risk: 35, exactIdentityEligible: true, decisionContractAvailable: true,
    profitabilitySnapshotPresent: true, whatWouldChange: [], immutable: true, evaluatedAt: "2026-09-01T14:00:00Z", decision: CARDS[id].verdict, allInAskCents: 8000,
    acceptedEvidenceCount: 3, changedFromPrevious: false, changes: [], whatChanged: [] }] });
const lifecycle = id => ({ opportunityId: id, trackingStatus: "WATCHING", outcomeStatus: "NONE", reviewAt: null, alertEnabled: false,
  acquisitionCostCents: null, acquiredAt: null, dispositionProceedsCents: null, disposedAt: null, version: 1 });

const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) }).catch(() => {});
const envelope = (correlationId, data) => ({ meta: { contractVersion: "1.0", engineVersion: "outcome-timeline-audit", authority: "Smart Opportunity",
  gradingAuthority: "Existing PSA intelligence", correlationId, generatedAt: "2026-11-10T15:00:00Z", evidenceFreshness: "MIXED_DISPLAY_ONLY", limitations: [] }, data });

function fixture(requests) {
  return route => {
    const url = new URL(route.request().url());
    const method = route.request().method().toUpperCase();
    const cid = route.request().headers()["x-correlation-id"] || "outcome-timeline-audit";
    requests.push(`${method} ${url.pathname}`);
    if (method !== "GET") return json(route, 405, { error: { code: "QA_READ_ONLY", message: "No writes.", correlationId: cid } });
    const p = url.pathname;
    const record = p.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor|lifecycle)\/([^/]+)$/);
    if (record) {
      const id = decodeURIComponent(record[2]);
      if (!CARDS[id]) return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Unknown synthetic record.", correlationId: cid } });
      if (record[1] === "opportunities") return json(route, 200, envelope(cid, { kind: "opportunity-detail", opportunity: opportunity(id), sourceOfTruth: "SQLite", transactionAuthority: false }));
      if (record[1] === "evidence") return json(route, 200, envelope(cid, evidence(id)));
      if (record[1] === "psa-advisor") return json(route, 200, envelope(cid, { kind: "psa-advisor", opportunityId: id, cardIdentity: CARDS[id].title, guidanceStatus: "NOT_AVAILABLE",
        authoritativeOpportunityRecommendation: CARDS[id].verdict, recalculated: false, savedPsaSnapshot: {}, populationContext: {}, transactionAuthority: false }));
      return json(route, 200, envelope(cid, { kind: "lifecycle-detail", opportunityId: id, sourceOfTruth: "SQLite", lifecycle: lifecycle(id),
        history: [{ recordedAt: "2026-09-01T14:00:00Z", eventType: "CREATED", trackingStatus: "WATCHING", outcomeStatus: "NONE", recordVersion: 1 }],
        decisionTimeline: decisionTimeline(id), decisionChangeIntelligence: legacyChange(id), outcomeTimeline: CARDS[id].timeline(id), transactionAuthority: false }));
    }
    if (p.startsWith("/api/v1/decision-outcomes/")) return json(route, 404, { error: { code: "ROUTE_NOT_FOUND", message: "Off.", correlationId: cid } });
    if (p.startsWith("/api/v1/card-intelligence/")) return json(route, 503, { error: { code: "CARD_INTELLIGENCE_UNAVAILABLE", message: "Unavailable.", correlationId: cid } });
    if (p === "/api/v1/health") return json(route, 200, envelope(cid, { status: "configured", bridgeEnabled: true, providerEvidenceMode: "PROVIDER_SALES_OFF", evidenceStorageGuard: "VERIFIED" }));
    if (p === "/api/v1/entitlements") return json(route, 200, envelope(cid, { kind: "entitlements", membershipActive: true, current: { code: "PRIVATE_BETA", accessState: "ACTIVE" }, plan: { code: "PRIVATE_BETA" }, usage: { completedEvaluations: 0 } }));
    if (p === "/api/v1/opportunities") return json(route, 200, envelope(cid, { kind: "opportunities", items: IDS.map(opportunity), count: IDS.length, sourceOfTruth: "SQLite", transactionAuthority: false }));
    if (p === "/api/v1/dashboard") return json(route, 200, envelope(cid, { kind: "dashboard", readOnly: true, source: "SQLite saved governed records",
      metrics: { trackedOpportunities: IDS.length, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 1 }, opportunities: IDS.map(opportunity), items: IDS.map(opportunity) }));
    if (p === "/api/v1/lifecycle") return json(route, 200, envelope(cid, { kind: "lifecycle", sourceOfTruth: "SQLite", items: IDS.map(lifecycle), transactionAuthority: false }));
    if (p === "/api/v1/alerts") return json(route, 200, envelope(cid, { kind: "alerts", items: [], count: 0, transactionAuthority: false }));
    return json(route, 404, { error: { code: "QA_NOT_MOCKED", message: p, correlationId: cid } });
  };
}

// ---------- session ----------
const browser = await chromium.launch({ executablePath, args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"] });
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  tablet: { viewport: { width: 834, height: 1112 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
};
async function open(route, device, wait = 4500) {
  const context = await browser.newContext(DEVICES[device]);
  await context.addInitScript(() => { try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); localStorage.setItem("flipforge.guidedMode.enabled", "false"); } catch (_) {} });
  await context.route(/\/assets\/js\/flipforge-identity\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${email}"}),getSnapshot:()=>({authenticated:true,email:"${email}",fullName:"Outcome Timeline Audit",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${email}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"t"});` }));
  await context.route(/\/assets\/js\/flipforge-production-signin\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  const requests = [];
  await context.route("**/api/v1/**", fixture(requests));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message.slice(0, 160)));
  await page.goto(`${BETA}#/${route}`, { waitUntil: "load" });
  await page.waitForTimeout(wait);
  const text = await page.evaluate(() => document.querySelector("#main-content")?.innerText || "");
  return { context, page, errors, text, requests };
}
async function shot(page, name) {
  const panel = page.locator("#main-content [data-ff-outcome-timeline], #main-content [data-ff-outcome-intelligence]").first();
  if (await panel.count()) { await panel.scrollIntoViewIfNeeded().catch(() => {}); await panel.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {}); }
  else await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }).catch(() => {});
}
const panelText = page => page.evaluate(() => document.querySelector("#main-content [data-ff-outcome-timeline]")?.innerText.replace(/\s+/g, " ").trim() || "");
const states = page => page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-outcome-timeline] [data-ff-otl-state]")].map(e => e.innerText.trim()));
const WAITING = /waiting for observation/i;
const PROVIDER = /CardSight|CARDSIGHT/;

try {
  if (BEFORE) {
    for (const id of ["otl-closed", "otl-observed"]) {
      for (const device of Object.keys(DEVICES)) {
        for (const [page, route] of [["saved", `opportunities/${id}`], ["tracking", `tracking/${id}`]]) {
          const s = await open(route, device);
          await shot(s.page, `before-${page}-${id}-${device}`);
          check(`before ${page} ${id} ${device}: captured`, true);
          if (page === "tracking" && device === "desktop") console.log(`BEFORE ${id} tracking shows "Waiting for observation": ${WAITING.test(s.text)}`);
          await s.context.close();
        }
      }
    }
  } else {
    const seenLabels = new Set();
    for (const id of IDS.filter(x => x !== "otl-invalid")) {
      const expected = CARDS[id].timeline(id);
      let savedText = "";
      for (const device of Object.keys(DEVICES)) {
        const saved = await open(`opportunities/${id}`, device);
        const sPanel = await panelText(saved.page);
        const sStates = await states(saved.page);
        sStates.forEach(l => seenLabels.add(l));
        check(`T4 ${id} ${device}: Saved Decisions shows the Day 7 / 14 / 30 timeline`, sStates.length === 3, sStates.join(" | "));
        check(`T1 ${id} ${device}: labels match the server states exactly`, sStates.join("|") === expected.checkpoints.map(c => LABELS[c.state]).join("|"), sStates.join(" | "));
        check(`T2 ${id} ${device}: Saved Decisions never reads "Waiting for observation"`, !WAITING.test(saved.text));
        check(`T4 ${id} ${device}: the three questions are answered`, /1\. What FlipForge recommended/.test(sPanel) && /2\. What reliable evidence appeared/.test(sPanel)
          && /3\. What can be concluded/.test(sPanel) && sPanel.includes(expected.conclusion.statement));
        const order = await saved.page.evaluate(() => {
          const view = document.querySelector("#main-content .customer-saved-decisions-page");
          const panels = view ? [...view.querySelectorAll("[data-ff-outcome-timeline]")] : [];
          return { count: panels.length, insideSignal: panels.some(p => p.closest("[data-ff-cdi-signal]")) };
        });
        check(`T4 ${id} ${device}: exactly one timeline, outside the CDI Signal Stack`, order.count === 1 && !order.insideSignal, JSON.stringify(order));
        const lifecycleGets = saved.requests.filter(r => r === `GET /api/v1/lifecycle/${id}`).length;
        check(`T8 ${id} ${device}: Saved Decisions reads the timeline with GET /api/v1/lifecycle/{id} only, no writes`,
          lifecycleGets >= 1 && !saved.requests.some(r => !r.startsWith("GET ")), saved.requests.filter(r => r.includes("lifecycle")).join(" | "));
        const overflow = await saved.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`T7 ${id} ${device}: Saved Decisions has no horizontal overflow`, overflow <= 1, String(overflow));
        check(`T7 ${id} ${device}: Saved Decisions has no page errors and never names the provider`, saved.errors.length === 0 && !PROVIDER.test(saved.text), saved.errors.join(" | "));
        await shot(saved.page, `after-saved-${id}-${device}`);
        if (device === "desktop") savedText = sPanel;
        await saved.context.close();

        const tracking = await open(`tracking/${id}`, device);
        const tPanel = await panelText(tracking.page);
        check(`T4 ${id} ${device}: Tracking shows the same timeline`, (await states(tracking.page)).join("|") === sStates.join("|"));
        if (device === "desktop") check(`T4 ${id}: Saved Decisions and Tracking show identical timeline text`, tPanel === savedText, `${tPanel.length} vs ${savedText.length}`);
        check(`T2 ${id} ${device}: Tracking never reads "Waiting for observation"`, !WAITING.test(tracking.text));
        const tOverflow = await tracking.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`T7 ${id} ${device}: Tracking has no horizontal overflow, no page errors, no provider name`, tOverflow <= 1 && tracking.errors.length === 0 && !PROVIDER.test(tracking.text),
          `${tOverflow} ${tracking.errors.join(" | ")}`);
        await shot(tracking.page, `after-tracking-${id}-${device}`);
        await tracking.context.close();
      }
      // T3: percentages only where comparable.
      const s = await open(`opportunities/${id}`, "desktop");
      const shown = await s.page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-outcome-timeline] [data-ff-otl-comparison]")]
        .map(e => ({ shown: e.getAttribute("data-ff-otl-comparison"), text: e.querySelector("strong")?.innerText || "" })));
      const expectedShown = expected.checkpoints.flatMap(c => [c.comparisonToBaseline.comparable === true, c.comparisonToPrior.comparable === true]);
      check(`T3 ${id}: a percentage appears only where the server marked a comparison comparable`,
        shown.length === 6 && shown.every((e, i) => (e.shown === "shown") === expectedShown[i] && (e.shown === "shown" ? /%/.test(e.text) : e.text === "No comparison")), JSON.stringify(shown));
      const reports = await s.page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-otl-report]")].map(e => e.innerText));
      const expectedReports = expected.checkpoints.reduce((n, c) => n + c.customerReports.length, 0);
      check(`T5 ${id}: every customer report is labelled "Customer-Reported — Unverified" and not counted as a market price`,
        reports.length === expectedReports && reports.every(r => r.includes("Customer-Reported — Unverified") && /not counted as a market price/.test(r)), reports.join(" | "));
      await s.context.close();
    }
    for (const label of Object.values(LABELS)) {
      const found = label === LABELS.HISTORICAL_RECONSTRUCTION
        ? fs.existsSync(path.join(SHOTS, "after-saved-otl-reported-desktop.png")) : seenLabels.has(label);
      check(`T1 the label "${label}" is rendered`, found);
    }
    {
      const s = await open("opportunities/otl-reported", "desktop");
      const recon = await s.page.evaluate(() => document.querySelector("#main-content [data-ff-otl-reconstruction]")?.innerText || "");
      check("T1 a historical reconstruction reads Historical Reconstruction and says it is not live tracking",
        recon.includes("Historical Reconstruction") && /not live tracking/.test(recon) && /not counted/.test(recon), recon);
      await s.context.close();
    }
    // T6: a timeline that breaks an integrity promise is not shown; Tracking falls back without "Waiting for observation".
    {
      const s = await open("opportunities/otl-invalid", "desktop");
      check("T6 Saved Decisions shows no timeline when the server object breaks a promise", await s.page.locator("#main-content [data-ff-outcome-timeline]").count() === 0);
      await s.context.close();
      const t = await open("tracking/otl-invalid", "desktop");
      check("T6 Tracking falls back to the earlier panel without \"Waiting for observation\"",
        await t.page.locator("#main-content [data-ff-outcome-intelligence]").count() === 1 && !WAITING.test(t.text) && /Not recorded/.test(t.text));
      await shot(t.page, "after-tracking-otl-invalid-fallback-desktop");
      await t.context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`Outcome timeline audit (${BEFORE ? "before" : "after"}): ${passes.length} passed, ${failures.length} failed. Screenshots: ${SHOTS}`);
for (const f of failures) console.log(`FAIL ${f}`);
if (!BEFORE) for (const p of passes) console.log(`PASS ${p}`);
process.exit(failures.length ? 1 : 0);
