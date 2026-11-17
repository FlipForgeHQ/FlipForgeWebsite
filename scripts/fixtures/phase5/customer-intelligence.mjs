// Phase 5 Customer Intelligence: synthetic API fixtures for the mocked customer journey audit
// (scripts/audit-phase5-customer-journey-ci.mjs). Every value is synthetic. Shapes follow FlipForge2
// docs/saas/PHASE5_CUSTOMER_INTELLIGENCE_CONTRACT.md (branch phase5/customer-intelligence-rc, PR #986):
//   section 1  value-withheld marker (valuesWithheld, valuesWithheldLabel, valuesWithheldNotice, supportedValueStatus,
//              maximumBuyApplies = false, withheldBasisSales; every value figure null);
//   section 2  outcome-checkpoint-timeline-v2 (streams A / B / C per checkpoint, movement enum, whatChanged,
//              verificationNeeded; top-level verification, answers, streamLabels, movementLabels).
// No individual sale price appears anywhere: only counts, quality, confidence, risk, the customer's own ask and the
// server's supported values for decisions on 4 or more sales.

export const WITHHELD_LABEL = "Based on 1 sale: value withheld";
export const NOTICE = "Based on 1 sale: value withheld. A value calculated from a single data-provider sale would disclose that sale's price, so Supported Value, Max Buy and modeled profit are not shown.";
export const TENANT_EMAIL = "phase5-journey-a@flipforge.test";

const STATE_LABELS = { AWAITING_CHECKPOINT: "Awaiting Checkpoint", PRICE_OBSERVED: "Price Observed", NO_RELIABLE_EVIDENCE: "No Reliable Evidence",
  NO_NEW_SALES: "No New Sales", WINDOW_CLOSED: "Window Closed", CUSTOMER_REPORTED_UNVERIFIED: "Customer-Reported — Unverified",
  HISTORICAL_RECONSTRUCTION: "Historical Reconstruction" };
export { STATE_LABELS };
export const MOVEMENT_LABELS = { INCREASED: "Supported market estimate increased", DECREASED: "Supported market estimate decreased",
  UNCHANGED: "Supported market estimate unchanged (within 5%)", UNAVAILABLE: "Supported market estimate unavailable", NOT_YET_AVAILABLE: "Not yet available" };
export const STREAM_LABELS = { A: "Derived market estimate", B: "Independently confirmed price", C: "Customer-Reported — Unverified" };
const SERVER_MOVEMENT_LABELS = { INCREASED: "Derived market estimate increased", DECREASED: "Derived market estimate decreased",
  UNCHANGED: "Derived market estimate unchanged (within 5%)", UNAVAILABLE: "Derived market estimate unavailable", NOT_YET_AVAILABLE: "Not yet available" };

const DATES = { 7: ["Sep 8, 2026", "Sep 10, 2026"], 14: ["Sep 15, 2026", "Sep 18, 2026"], 30: ["Oct 1, 2026", "Oct 6, 2026"] };
const none = (explanation = "No comparison: this checkpoint has no reliable price.") => ({ comparable: false, changeCents: null, changePercent: null, direction: null, explanation });
const cmp = (cents, pct, dir, explanation, prior) => ({ comparable: true, changeCents: cents, changePercent: pct, direction: dir, explanation, ...(prior ? { comparedWithHorizonDays: prior } : {}) });

// Stream A: direction only (contract 2.4): never a value or a percentage.
const streamA = (movement, reasonCode, explanation, sales = null, basis = null) => ({ stream: "A", label: "Derived market estimate", movement,
  movementLabel: SERVER_MOVEMENT_LABELS[movement], reasonCode, explanation, basis, acceptedSalesAtCheckpoint: sales, derivedOnly: true, valueShown: false, realizedReturn: false });

function cp(h, st, extra = {}, a = null) {
  const priced = st === "PRICE_OBSERVED";
  const c = Object.assign({
    horizonDays: h, label: `Day ${h}`, dueOnText: DATES[h][0], windowClosesOnText: DATES[h][1], windowState: "CLOSED",
    state: st, stateLabel: STATE_LABELS[st], underlyingState: st, reasonCode: "SYNTHETIC",
    explanation: {
      WINDOW_CLOSED: `The Day ${h} window closed on ${DATES[h][1]} with no reliable pricing evidence recorded. It stays closed and is never filled in later from estimates.`,
      NO_RELIABLE_EVIDENCE: "Fewer than 2 qualifying completed sales of this exact card were available, so no price is recorded.",
      NO_NEW_SALES: `No new completed sale of this exact card was found after the decision, so there is no new market price for Day ${h}.`,
      PRICE_OBSERVED: "Completed sales of this exact card, recorded after the decision by an independent source that passed FlipForge's provenance checks, put the supported value at this checkpoint.",
      AWAITING_CHECKPOINT: `Day ${h} is due on ${DATES[h][0]}.`,
      CUSTOMER_REPORTED_UNVERIFIED: "You reported a price for this period. It is your own report: FlipForge has not verified it and does not count it as a market price."
    }[st],
    evidence: { observedValueCents: null, reliability: priced ? "INDEPENDENTLY_VERIFIED" : "NONE", acceptedSalesAtCheckpoint: null, recordedValueWithheld: false },
    comparisonToBaseline: none(), comparisonToPrior: h === 7 ? none("Day 7 is the first checkpoint.") : none(),
    customerReports: [], evidenceConflict: { present: false }, historicalReconstruction: null,
    whatChanged: "", verificationNeeded: false
  }, extra);
  const streamAValue = a || (st === "AWAITING_CHECKPOINT"
    ? streamA("NOT_YET_AVAILABLE", c.windowState === "OPEN" ? "WINDOW_OPEN" : "NOT_YET_DUE", `Day ${h} has not been recorded yet.`)
    : streamA("UNAVAILABLE", "NO_DERIVED_ESTIMATE_RECORDED", "No derived estimate was recorded for this checkpoint."));
  c.streams = {
    derivedMarketEstimate: streamAValue,
    independentlyConfirmed: { stream: "B", label: "Independently confirmed transactions", priceObserved: priced, observedValueCents: priced ? c.evidence.observedValueCents : null,
      acceptedSalesAtCheckpoint: priced ? c.evidence.acceptedSalesAtCheckpoint : null },
    customerReported: { stream: "C", label: "Customer-Reported — Unverified", reportCount: c.customerReports.length, verified: false, countedAsMarketPrice: false, reports: c.customerReports }
  };
  if (!c.whatChanged) c.whatChanged = st === "AWAITING_CHECKPOINT" ? `Nothing yet: Day ${h} has not been recorded.`
    : `${SERVER_MOVEMENT_LABELS[streamAValue.movement]}. ${priced ? "An independently confirmed price was recorded." : "No independently confirmed price."} ${c.customerReports.length ? `${c.customerReports.length} unverified report of yours.` : "No report of yours."}`;
  return c;
}
const report = (action, cents, on, platform = null) => ({ label: STATE_LABELS.CUSTOMER_REPORTED_UNVERIFIED, action, reportedPriceCents: cents, reportedOn: on,
  reportedPlatform: platform, window: "D14", verified: false, countedAsMarketPrice: false, usedInComparisons: false });

function timeline(id, verdict, checkpoints, conclusion, decision = {}, extra = {}) {
  const c = CARDS[id];
  const withheld = c && c.withheld ? withheldStamp(c.sales) : {};
  return Object.assign({
    kind: "outcome-checkpoint-timeline", version: "outcome-checkpoint-timeline-v2", opportunityId: id, timeZone: "America/New_York",
    available: true, status: "AVAILABLE", readOnly: true, historicalRescoring: false, historicalBackfill: false, syntheticPrices: false,
    askingPricesUsedAsSales: false, customerReportsVerified: false, reconstructionsMergedWithLive: false, unverifiedObservationValuesShown: false,
    providerRequestMade: false, customerAccuracyClaimAuthorized: false, transactionAuthority: false,
    derivedEstimateIsRealizedReturn: false, individualSalePricesShown: false,
    streamLabels: { A: "Derived market estimate", B: "Independently confirmed transactions", C: "Customer-Reported — Unverified" },
    movementLabels: SERVER_MOVEMENT_LABELS,
    originalDecision: Object.assign({ requestId: `req-${id}`, recommendation: verdict, decidedOn: "2026-09-01", decidedOnText: "Sep 1, 2026", reasonCode: "SYNTHETIC",
      reasonExplanation: `${verdict}: the saved reason for this synthetic decision.`, why: [`Synthetic receipt line for ${verdict}.`],
      askCents: c.askCents, baselineSupportedValueCents: c.withheld ? null : c.supportedCents, baselineSupported: !c.withheld && Boolean(c.supportedCents),
      baselineExplanation: c.withheld ? NOTICE : "The original decision's supported value is the baseline for later checkpoints.",
      receiptPresent: true, laterReevaluationCount: 0, immutable: true,
      valuesWithheld: c.withheld ? withheld.valuesWithheld : null, valuesWithheldLabel: c.withheld ? withheld.valuesWithheldLabel : null,
      evidenceSupport: { acceptedExactSales: c.sales, evidenceQuality: c.quality, supportRating: c.quality, confidence: c.confidence, risk: c.risk,
        dataProviderEvidenceUsed: Boolean(c.withheld), individualSalePricesShown: false } }, decision),
    checkpoints, customerReportsOutsideCheckpoints: [], conclusion,
    verification: Object.assign({ needed: false, reasons: [], explanation: "Independent exact-card evidence confirmed the decision's basis." }, extra.verification || {}),
    answers: { whatWasRecommended: `${verdict} on Sep 1, 2026.`, whyRecommended: `${verdict}: the saved reason for this synthetic decision.`,
      whatEvidenceSupported: `${c.sales} exact completed sale${c.sales === 1 ? "" : "s"}; evidence quality ${c.quality.toLowerCase()}; confidence ${c.confidence}/100; risk ${c.risk}/100. Individual sale prices are not shown.`,
      whatEvidenceAppeared: "See each checkpoint.", whatChangedSince: "See each checkpoint.", whatCanBeConcluded: conclusion.statement,
      isVerificationNeeded: extra.verification?.needed ? "Yes." : "No." },
    summary: { priceObservedCheckpoints: checkpoints.filter(x => x.state === "PRICE_OBSERVED").length }, historicalReconstructionDisplay: "OFF_PENDING_COMPLIANCE_APPROVAL"
  }, c.withheld ? { valuesWithheld: withheld.valuesWithheld, valuesWithheldLabel: withheld.valuesWithheldLabel, valuesWithheldNotice: NOTICE } : {},
  Object.fromEntries(Object.entries(extra).filter(([k]) => k !== "verification")));
}
const NO_EVIDENCE = { code: "NO_RELIABLE_EVIDENCE", canConclude: false, statement: "No reliable market evidence was recorded at Day 7, Day 14 or Day 30. FlipForge cannot say how this decision turned out, and it will not estimate an outcome." };
const NEEDS = (reasons, explanation) => ({ verification: { needed: true, reasons, explanation } });

// ---------------------------------------------------------------------------------------------------------------------
// Cards. Verdicts BUY / WATCH / VERIFY / PASS; one-sale withheld (WATCH, VERIFY); a few-sales withheld (2 sales, live
// and independent mixed); multi-sale BUY with every movement direction; independent single sale (not withheld:
// verdict VERIFY, no Max Buy); PASS.
// ---------------------------------------------------------------------------------------------------------------------
export const CARDS = {
  "p5-multi-buy": {
    title: "2020 Prizm Justin Herbert #325 PSA 10", verdict: "BUY", sales: 5, quality: "STRONG", confidence: 82, risk: 30,
    supportedCents: 10000, maxBuyCents: 8500, askCents: 8000, withheld: false, owned: true, paidCents: 7900,
    timeline: id => timeline(id, "BUY", [
      cp(7, "PRICE_OBSERVED", { evidence: { observedValueCents: 11000, reliability: "INDEPENDENTLY_VERIFIED", acceptedSalesAtCheckpoint: 3 },
        comparisonToBaseline: cmp(1000, 10.0, "UP", "Supported value is 10.0% above the original decision's supported value.") },
        streamA("INCREASED", "MATERIAL_INCREASE", "FlipForge's own estimate moved up by more than 5%.", 3, "INDEPENDENT_DERIVED")),
      cp(14, "NO_NEW_SALES", {}, streamA("UNCHANGED", "WITHIN_THRESHOLD", "FlipForge's own estimate stayed within 5% of the decision.", 3, "INDEPENDENT_DERIVED")),
      cp(30, "PRICE_OBSERVED", { evidence: { observedValueCents: 9500, reliability: "INDEPENDENTLY_VERIFIED", acceptedSalesAtCheckpoint: 4 },
        comparisonToBaseline: cmp(-500, -5.0, "DOWN", "Supported value is 5.0% below the original decision's supported value."),
        comparisonToPrior: cmp(-1500, -13.6, "DOWN", "Supported value is 13.6% below Day 7.", 7) },
        streamA("DECREASED", "MATERIAL_DECREASE", "FlipForge's own estimate moved down by more than 5%.", 4, "INDEPENDENT_DERIVED"))
    ], { code: "MOVEMENT_OBSERVED", canConclude: true, latestEvidenceHorizonDays: 30, direction: "DOWN",
      statement: "At Day 30, exact-card completed sales from an independent source put the supported value 5.0% below the original decision's supported value. This describes one card's market movement; it does not show whether FlipForge's decisions are accurate in general." })
  },
  "p5-one-sale-watch": {
    title: "2023 Bowman Chrome Jackson Holliday #BCP-1 PSA 10", verdict: "WATCH", sales: 1, quality: "LIMITED", confidence: 41, risk: 64,
    supportedCents: null, maxBuyCents: null, askCents: 12500, withheld: true, owned: true, paidCents: 12000, alerted: true,
    timeline: id => timeline(id, "WATCH", [
      cp(7, "NO_RELIABLE_EVIDENCE", { evidence: { observedValueCents: null, reliability: "NONE", acceptedSalesAtCheckpoint: 1, recordedValueWithheld: true },
        explanation: "One new completed sale was recorded. A value from one sale is withheld, so no price is shown.", verificationNeeded: true },
        streamA("UNAVAILABLE", "BASELINE_VALUE_WITHHELD", "The decision's value was withheld (1 sale), so no direction can be stated.", 1, "DATA_PROVIDER_DERIVED")),
      cp(14, "AWAITING_CHECKPOINT", { windowState: "OPEN", dueOnText: "Nov 17, 2026", windowClosesOnText: "Nov 20, 2026", explanation: "Day 14 is due on Nov 17, 2026." }),
      cp(30, "AWAITING_CHECKPOINT", { windowState: "NOT_YET_DUE", dueOnText: "Dec 3, 2026", windowClosesOnText: "Dec 8, 2026", explanation: "Day 30 is due on Dec 3, 2026." })
    ], { code: "PENDING", canConclude: false, statement: "No reliable market evidence has been recorded so far, so no outcome can be stated yet." },
    { decidedOnText: "Nov 3, 2026" }, NEEDS(["VALUES_WITHHELD_FEW_SALES", "NO_INDEPENDENT_CONFIRMATION"], "More exact-card completed sales are needed before a value can be shown."))
  },
  "p5-one-sale-verify": {
    title: "2019 Prizm Zion Williamson #248 PSA 10", verdict: "VERIFY", sales: 1, quality: "LIMITED", confidence: 38, risk: 70,
    supportedCents: null, maxBuyCents: null, askCents: 21000, withheld: true,
    timeline: id => timeline(id, "VERIFY", [cp(7, "WINDOW_CLOSED", { verificationNeeded: true }), cp(14, "WINDOW_CLOSED", { verificationNeeded: true },
      streamA("UNAVAILABLE", "D14_PROVIDER_COLLECTION_NOT_PERMITTED", "Day 14 is not collected from the data provider.")), cp(30, "WINDOW_CLOSED", { verificationNeeded: true })], NO_EVIDENCE,
    {}, NEEDS(["VERIFY_VERDICT", "VALUES_WITHHELD_FEW_SALES", "NO_INDEPENDENT_CONFIRMATION"], "The card and its evidence still need to be confirmed."))
  },
  "p5-few-mixed": {
    title: "2018 Topps Chrome Shohei Ohtani #150 PSA 9", verdict: "WATCH", sales: 2, quality: "MODERATE", confidence: 60, risk: 45,
    supportedCents: null, maxBuyCents: null, askCents: 16000, withheld: true, fewSales: true,
    timeline: id => timeline(id, "WATCH", [
      cp(7, "PRICE_OBSERVED", { evidence: { observedValueCents: 20200, reliability: "INDEPENDENTLY_VERIFIED", acceptedSalesAtCheckpoint: 2 } },
        streamA("UNAVAILABLE", "BASELINE_VALUE_WITHHELD", "The decision's value was withheld (2 sales), so no direction can be stated.", 2, "MIXED_DERIVED")),
      cp(14, "CUSTOMER_REPORTED_UNVERIFIED", { underlyingState: "WINDOW_CLOSED", customerReports: [report("SOLD", 23000, "2026-09-16", "EBAY")] }),
      cp(30, "WINDOW_CLOSED")
    ], { code: "NO_BASELINE", canConclude: false, statement: "The original decision's value was withheld, so later prices cannot be compared with it. Your own reports are shown, but they are unverified and are not used in this conclusion." },
    {}, NEEDS(["VALUES_WITHHELD_FEW_SALES"], "The decision rests on 2 sales, one from the data provider."))
  },
  "p5-independent-verify": {
    title: "2011 Topps Update Mike Trout #US175 PSA 9", verdict: "VERIFY", sales: 1, quality: "LIMITED", confidence: 45, risk: 58,
    supportedCents: 30000, maxBuyCents: null, askCents: 29000, withheld: false,
    timeline: id => timeline(id, "VERIFY", [
      cp(7, "NO_RELIABLE_EVIDENCE", { verificationNeeded: true }, streamA("UNAVAILABLE", "INSUFFICIENT_EVIDENCE", "Not enough new exact sales to estimate a direction.")),
      cp(14, "NO_NEW_SALES", { verificationNeeded: true }, streamA("UNAVAILABLE", "NO_NEW_SALES", "No new exact sales.")), cp(30, "WINDOW_CLOSED", { verificationNeeded: true })], NO_EVIDENCE,
    {}, NEEDS(["VERIFY_VERDICT", "NO_INDEPENDENT_CONFIRMATION"], "One independent sale supports this decision; a second exact-card sale is needed to confirm it."))
  },
  "p5-pass": {
    title: "2021 Prizm Ja Morant #10 PSA 10", verdict: "PASS", sales: 4, quality: "MODERATE", confidence: 74, risk: 72,
    supportedCents: 9000, maxBuyCents: null, askCents: 15000, withheld: false,
    timeline: id => timeline(id, "PASS", [cp(7, "WINDOW_CLOSED"), cp(14, "WINDOW_CLOSED"), cp(30, "WINDOW_CLOSED")], NO_EVIDENCE)
  }
};
export const IDS = Object.keys(CARDS);
// Another account's saved decision: this tenant gets 404 for it on every record route.
export const OTHER_TENANT_ID = "p5-other-tenant-card";

function withheldStamp(sales = 1) {
  const few = sales >= 2;
  const label = few ? `Based on ${sales} sales: value withheld` : WITHHELD_LABEL;
  return { valuesWithheld: few ? "FEW_PROVIDER_SALES_BASIS" : "SINGLE_PROVIDER_SALE_BASIS", valuesWithheldLabel: label,
    valuesWithheldNotice: few ? `${label}. A value calculated from so few sales, one of them from the data provider, would disclose a sale's price, so Supported Value, Max Buy and modeled profit are not shown.` : NOTICE,
    supportedValueStatus: few ? "WITHHELD_FEW_PROVIDER_SALES" : "WITHHELD_SINGLE_PROVIDER_SALE", maximumBuyApplies: false, withheldBasisSales: sales };
}
const stampFor = id => CARDS[id].withheld ? withheldStamp(CARDS[id].sales) : {};

export function governed(id) {
  const c = CARDS[id];
  return Object.assign({ available: true, recommendation: c.verdict, confidence: c.confidence, risk: c.risk,
    reason: c.withheld ? `${c.verdict}: one exact completed sale supports this decision ([value withheld: 1 sale]).` : `${c.verdict}: saved reason.`,
    evaluatedAt: "2026-09-01T14:00:00Z", supportedValueCents: c.supportedCents, supportedValueStatus: c.withheld ? "WITHHELD_SINGLE_PROVIDER_SALE" : c.supportedCents ? "ESTABLISHED" : "NOT_ESTABLISHED",
    maximumBuyPriceCents: c.maxBuyCents, allInAskCents: c.askCents, exactTrustedCompCount: c.sales, evidenceQuality: c.quality, snapshotCount: 1, immutable: true,
    expectedNetProfitCents: c.withheld ? null : c.maxBuyCents ? 1200 : null, expectedRoiBasisPoints: c.withheld ? null : c.maxBuyCents ? 1500 : null,
    exactIdentityBasis: { status: "CONFIRMED" }, transactionAuthority: false },
  stampFor(id));
}

export function opportunity(id) {
  const c = CARDS[id];
  return Object.assign({ id, title: c.title, cardIdentity: c.title, recommendation: c.verdict, ask: c.askCents / 100,
    supportedValue: c.supportedCents === null ? null : c.supportedCents / 100, supportedValueCents: c.supportedCents,
    confidence: c.confidence, liquidity: 60, risk: c.risk, rank: 70, observedAt: "2026-09-01T14:00:00Z", platform: "EBAY", mappingState: "CONFIRMED",
    recommendationSource: "GOVERNED_SNAPSHOT", evidenceProvenanceStatus: "CURRENT_EVIDENCE_RULES", legacyNotice: null,
    evidence: { acceptedSales: 0, priceStatus: "LIVE_PRICING_ONLY", averagePrice: null },
    governedDecision: governed(id) }, stampFor(id));
}

const evidence = id => ({ kind: "evidence", readOnly: true, opportunityId: id, cardIdentity: CARDS[id].title, acceptedExactCompletedSales: 0, visibleButAuthorityIneligible: 0,
  currentAdmission: { admitted: 0, excluded: 0, held: 0, notUsed: 0, linkedRows: 0, policy: "qa" }, linkedEvidence: [], manualCandidates: [], timeline: [],
  providerEvidenceSummary: { label: "Reported completed sale (data provider)", saleDetailsWithheld: true, storedRowsLinked: 0, storedRowsAdmittedNow: 0, storedRowReasons: {},
    evidenceMode: "PROVIDER_SALES_OFF", storedSaleRecordsKept: false, liveQualifiedSales: 0, liveAvailable: false, liveExpiresAt: null },
  priceStatusLabel: "No price shown.", evidenceProvenanceStatus: "CURRENT_EVIDENCE_RULES", legacyNotice: null, internalOperatorFieldsExcluded: true, transactionAuthority: false,
  ...stampFor(id) });

const decisionTimeline = id => {
  const c = CARDS[id];
  return { kind: "decision-timeline", opportunityId: id, available: true, timelineVersion: "v1.5.0", snapshotCount: 1, changedEntryCount: 0,
    historicalSnapshotsImmutable: true, historicalRescoring: false, historicalBackfill: false, transactionAuthority: false,
    entries: [Object.assign({ requestId: `req-${id}`, cardIdentity: c.title, marketplace: "EBAY", workflowStatus: "ACTIVE_WATCHLIST", supportedValueCents: c.supportedCents,
      evidenceQuality: c.quality, reviewEvidenceCount: 0, rejectedEvidenceCount: 0, confidence: c.confidence, risk: c.risk, exactIdentityEligible: true, decisionContractAvailable: true,
      profitabilitySnapshotPresent: !c.withheld, whatWouldChange: [], immutable: true, evaluatedAt: "2026-09-01T14:00:00Z", decision: c.verdict, allInAskCents: c.askCents,
      maximumBuyPriceCents: c.maxBuyCents, acceptedEvidenceCount: c.sales, changedFromPrevious: false, changes: [], whatChanged: [] },
    stampFor(id))] };
};
const legacyChange = id => ({ kind: "decision-change-intelligence", available: true, opportunityId: id, historicalRescoring: false, historicalBackfill: false,
  transactionAuthority: false, customerAccuracyClaimAuthorized: false, selfTrainingAuthorized: false,
  outcomeReconciliation: { t0Decision: CARDS[id].verdict, t0EvaluatedAt: "2026-09-01T14:00:00Z", t0SupportedValueCents: CARDS[id].supportedCents, observedCheckpointCount: 0,
    historicalBackfill: false, customerAccuracyClaimAuthorized: false,
    checkpoints: [7, 14, 30].map(h => ({ horizonDays: h, measurementState: "MISSING_OBSERVATION", available: false })) } });
export const lifecycle = id => ({ opportunityId: id, trackingStatus: CARDS[id].owned ? "OWNED" : "WATCHING", outcomeStatus: CARDS[id].owned ? "ACQUIRED" : "NONE",
  reviewAt: null, alertEnabled: Boolean(CARDS[id].alerted), acquisitionCostCents: CARDS[id].owned ? CARDS[id].paidCents : null,
  acquiredAt: CARDS[id].owned ? "2026-09-02T00:00:00Z" : null, dispositionProceedsCents: null, disposedAt: null, version: 1 });

export function lifecycleDetail(id) {
  return { kind: "lifecycle-detail", opportunityId: id, sourceOfTruth: "SQLite", lifecycle: lifecycle(id),
    history: [{ recordedAt: "2026-09-01T14:00:00Z", eventType: "CREATED", trackingStatus: "WATCHING", outcomeStatus: "NONE", recordVersion: 1 }],
    decisionTimeline: decisionTimeline(id), decisionChangeIntelligence: legacyChange(id), outcomeTimeline: CARDS[id].timeline(id), transactionAuthority: false,
    ...stampFor(id) };
}

// POST /api/v1/evaluations for the one-sale WATCH card: the safeguard withholds every derived figure.
export function evaluation(id, requestId = `req-${id}`) {
  const c = CARDS[id];
  const decision = Object.assign({ recommendation: c.verdict, supportedValueCents: c.supportedCents, maximumBuyPriceCents: c.maxBuyCents,
    exactTrustedCompCount: c.sales, confidence: c.confidence, risk: c.risk, workflowStatus: "ACTIVE_WATCHLIST",
    reason: c.withheld ? "One exact completed sale supports this card ([value withheld: 1 sale]); more sales are needed." : "Exact completed sales support this card.",
    missingRequirement: c.withheld ? "At least 2 exact completed sales." : "None returned.", nextAction: "Watch for more exact sales.",
    expectedNetProfitCents: c.withheld ? null : 1200, expectedRoiBasisPoints: c.withheld ? null : 1500, marginCents: c.withheld ? null : 500 },
  stampFor(id));
  return Object.assign({ kind: "evaluation", requestId, opportunityId: id, persistedToSqlite: true, tenantOwned: true, quotaEnforced: true,
    requestCanVerifyEvidence: false, requestCanVerifyIdentity: false, evidenceAcceptedByRequest: false, psaRecalculated: false, transactionAuthorized: false,
    providerCredentialsExposed: false, idempotentReplay: false, decision, normalizedRequest: { allInAskCents: c.askCents, itemPriceCents: c.askCents },
    decisionReceipt: Object.assign({ recommendation: c.verdict, exactTrustedCompCount: c.sales, supportedValueCents: c.supportedCents, maximumBuyPriceCents: c.maxBuyCents, allInAskCents: c.askCents }, stampFor(id)),
    evidenceEnrichment: { qualifiedRows: c.withheld ? 1 : 0 },
    tenantIsolation: { enforced: true, idempotencyScope: "TENANT", opportunityOwnership: "GRANTED_ON_COMPLETION", defaultAccess: "DENY" } },
  stampFor(id));
}

const pausedReference = { available: false, status: "PROVIDER_STORED_HISTORY_NOT_RETAINED", valueCents: null,
  method: "AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES", acceptedExactCompletedSales: 0, minimumAcceptedExactSales: 3,
  maximumLatestSaleAgeDays: 30, latestSaleAgeDays: null, latestSaleDate: null, marketplaces: [], exactIdentityRequired: true, activeListingsUsed: false, providerCallPerformed: false, persistedAsValuation: false, appraisal: false, transactionAuthority: false };
const pausedPerformance = { available: false, status: "REFERENCE_VALUE_UNAVAILABLE", method: "EVIDENCE_REFERENCE_MINUS_CUSTOMER_COST_BASIS", realized: false, feesIncluded: false, taxesIncluded: false, liquidationEstimate: false,
  appraisal: false, transactionAuthority: false, acquisitionCostCents: null, referenceValueCents: null, referenceDeltaCents: null, referenceDeltaPercent: null };
export function portfolio(empty = false) {
  const owned = empty ? [] : IDS.filter(id => CARDS[id].owned);
  return { kind: "portfolio", configured: true, readOnly: false, status: "CUSTOMER_COST_BASIS_AVAILABLE_REFERENCE_VALUE_UNAVAILABLE",
    currentValueConfigured: true, currentValueType: "EVIDENCE_SUPPORTED_REFERENCE_NOT_APPRAISAL", currentValueMethod: "AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES",
    performanceConfigured: true, performanceType: "UNREALIZED_REFERENCE_COMPARISON", count: owned.length,
    totalCostBasisCents: owned.reduce((n, id) => n + CARDS[id].paidCents, 0), referenceValueAvailableCount: 0, performanceAvailableCount: 0,
    completeReferenceCoverage: false, completePerformanceCoverage: false, coveredReferenceValueCents: 0, coveredCostBasisCents: 0, coveredReferenceDeltaCents: 0,
    completePortfolioReferenceValueCents: null, completePortfolioReferenceDeltaCents: null, feesIncluded: false, taxesIncluded: false, liquidationEstimate: false,
    appraisal: false, transactionAuthority: false,
    items: owned.map(id => Object.assign({ opportunityId: id, trackingStatus: "OWNED", outcomeStatus: "ACQUIRED", acquisitionCostCents: CARDS[id].paidCents,
      acquiredAt: "2026-09-02T00:00:00Z", referenceValue: { ...pausedReference }, referencePerformance: { ...pausedPerformance } },
    stampFor(id))),
    writeContract: "/api/v1/lifecycle/{opportunityId}" };
}

export function alerts() {
  return { kind: "alerts", configured: true, acknowledgementConfigured: true, notificationDeliveryConfigured: false, transactionAuthority: false,
    items: [{ alertId: "a".repeat(64), opportunityId: "p5-one-sale-watch", kind: "REVIEW_DUE", due: true, reviewAt: "2026-11-10T00:00:00Z",
      title: "Your scheduled review is due", customerExplanation: "Review this card: Based on 1 sale: value withheld.", needsAttention: true, reviewed: false,
      valuesWithheld: "SINGLE_PROVIDER_SALE_BASIS", maximumBuyApplies: false, maximumBuyPriceCents: null }],
    decisionReviewSignals: [
      { alertId: "b".repeat(64), opportunityId: "p5-one-sale-verify", kind: "VERIFICATION_PENDING", decision: "VERIFY",
        title: "Verification still needed", customerExplanation: "This VERIFY decision rests on one exact sale. Based on 1 sale: value withheld.",
        needsAttention: true, reviewed: false, valuesWithheld: "SINGLE_PROVIDER_SALE_BASIS", maximumBuyApplies: false },
      { alertId: "c".repeat(64), opportunityId: "p5-multi-buy", kind: "DECISION_RECHECK_DUE", decision: "BUY", ageDays: 50,
        title: "Decision is 50 days old", customerExplanation: "The latest saved decision is 50 days old. Re-check the price and evidence before relying on it.",
        needsAttention: true, reviewed: false }
    ] };
}

const R = { sales: "At least 3 exact trusted completed sales are required.", pass: "Smart Opportunity is PASS; Forge Heat cannot override it." };
export function forgeHeat() {
  const ranked = id => { const c = CARDS[id]; return { rank: 1, requestId: `req-${id}`, opportunityId: id, cardIdentity: c.title, recommendation: c.verdict, heat: 84, heatBand: "HOT",
    confidence: c.confidence, risk: c.risk, acceptedExactSales: c.sales, allInAskCents: c.askCents, supportedValueCents: c.supportedCents,
    maximumBuyPriceCents: c.maxBuyCents, supportedValueGapCents: c.supportedCents - c.askCents, supportedValueGapPct: 25, whyHot: ["Five matched sales."], couldCool: [],
    invalidates: [], transactionAuthority: false, evaluatedAt: "2026-10-20T00:00:00Z" }; };
  const unscored = (id, reasons) => Object.assign({ requestId: `req-${id}`, opportunityId: id, cardIdentity: CARDS[id].title, recommendation: CARDS[id].verdict,
    evaluatedAt: "2026-10-01T00:00:00Z", heatAvailable: false, reasons, supportedValueCents: null, maximumBuyPriceCents: null },
  stampFor(id));
  const top = [ranked("p5-multi-buy")];
  const preview = [unscored("p5-one-sale-watch", [R.sales]), unscored("p5-one-sale-verify", [R.sales]), unscored("p5-few-mixed", [R.sales]), unscored("p5-pass", [R.pass])];
  return { kind: "forge-heat", heatVersion: "FORGE_HEAT_V1", serviceVersion: "phase5-audit", proFeature: true, locked: false,
    access: { allowed: true, currentPlan: "PRIVATE_BETA", requiredPlan: "PRO", privateBetaPreview: true, accessState: "ACTIVE" },
    authority: { recommendationAuthority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", forgeHeatRecommendationAuthority: false, clientComputed: false, transactionAuthority: false },
    scope: { code: "SAVED_EVALUATED_UNIVERSE", marketWide: false, continuousMarketScannerActive: false, description: "Your saved evaluations." },
    componentAvailability: { momentum: { available: false, reason: "Heat history is not yet sufficient." } },
    // An older read path could still list a withheld decision among ranked cards: the page must drop it, not fail.
    top5: top, hiddenGems: [], highestEdge: [...top, Object.assign(ranked("p5-few-mixed"), stampFor("p5-few-mixed"), { supportedValueGapCents: null, supportedValueGapPct: null })],
    summary: { latestEvaluationsConsidered: IDS.length, heatEligible: 1, surfaced: 1, unscored: preview.length, unscoredReasonCounts: { [R.sales]: 3, [R.pass]: 1 } },
    unscoredPreview: preview };
}

export function marketView() {
  return { kind: "market-view", marketViewVersion: "MARKET_VIEW_V1", readOnly: true,
    scope: { code: "SAVED_EVALUATED_UNIVERSE", label: "Your Market", marketWide: false, continuousMarketScannerActive: false },
    authority: { recommendationAuthority: "Smart Opportunity", marketViewRecommendationAuthority: false, clientComputed: false, transactionAuthority: false },
    transactionAuthority: false,
    summary: { evaluatedCards: IDS.length, actionableSavedDecisions: 2, actionableSharePct: 33, positiveSupportedValueGap: 1, positiveGapSharePct: 17, freshWithin30Days: IDS.length, freshnessPct: 100 },
    decisionMix: { BUY: 2, WATCH: 1, VERIFY: 2, PASS: 1, OTHER: 0 },
    evidenceHealth: { strongEvidenceCards: 1, strongEvidencePct: 17, averageExactTrustedSales: 2.5, averageConfidence: 58, averageRisk: 55 },
    valueContext: { profitOrRoi: false, medianPositiveGapPct: 25, valuesWithheldCount: 2,
      topPositiveGap: [{ opportunityId: "p5-multi-buy", cardIdentity: CARDS["p5-multi-buy"].title, savedRecommendation: "BUY", rank: 1, allInAskCents: 8000, supportedValueCents: 10000, supportedValueGapCents: 2000, supportedValueGapPct: 25,
        confidence: 82, risk: 30, exactTrustedSales: 5 },
        // A one-sale decision as an older read path could still list it: the page must drop it, not fail or show a figure.
        { opportunityId: "p5-one-sale-watch", cardIdentity: CARDS["p5-one-sale-watch"].title, savedRecommendation: "WATCH", rank: 2, allInAskCents: 12500,
          supportedValueCents: null, supportedValueGapCents: null, supportedValueGapPct: null, confidence: 41, risk: 64, exactTrustedSales: 1,
          valuesWithheld: "SINGLE_PROVIDER_SALE_BASIS", maximumBuyApplies: false }],
    },
    outcomeCoverage: { "7": { horizonDays: 7, observed: 2, eligible: 6, coveragePct: 33 }, "14": { horizonDays: 14, observed: 0, eligible: 5, coveragePct: 0 }, "30": { horizonDays: 30, observed: 1, eligible: 4, coveragePct: 25 } },
    broaderMarket: { available: false, marketWideVolume: false, marketWideMomentum: false, marketPriceIndex: false, reason: "Synthetic Phase 5 fixture." } };
}

export const envelope = (correlationId, data) => ({ meta: { contractVersion: "1.0", engineVersion: "phase5-journey-audit", authority: "Smart Opportunity",
  gradingAuthority: "Existing PSA intelligence", correlationId, generatedAt: "2026-11-16T15:00:00Z", evidenceFreshness: "MIXED_DISPLAY_ONLY", limitations: [] }, data });

// Playwright route handler. `requests` collects "METHOD /path"; `options.evaluateId` picks the card a POST /evaluations
// returns. Writes other than the evaluation are refused (405) so no audit can change anything.
export function handler(requests, options = {}) {
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) }).catch(() => {});
  return route => {
    const url = new URL(route.request().url());
    const method = route.request().method().toUpperCase();
    const cid = route.request().headers()["x-correlation-id"] || "phase5-journey-audit";
    const p = url.pathname;
    requests.push(`${method} ${p}`);
    const err = (status, code, message) => json(route, status, { error: { code, message, correlationId: cid } });
    if (method === "POST" && p === "/api/v1/evaluations") return json(route, 200, envelope(cid, evaluation(options.evaluateId || "p5-one-sale-watch", route.request().headers()["idempotency-key"])));
    if (method !== "GET") return err(405, "QA_READ_ONLY", "No writes in this audit.");
    const record = p.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor|lifecycle|reevaluation-draft|sell-watch)\/([^/]+)$/);
    if (record) {
      const id = decodeURIComponent(record[2]);
      // Tenant isolation: another account's record (or an unknown one) is 404, exactly as the server answers.
      if (!CARDS[id]) return err(404, "RESOURCE_NOT_FOUND", "No saved decision with this id in your account.");
      const c = CARDS[id];
      if (record[1] === "opportunities") return json(route, 200, envelope(cid, { kind: "opportunity-detail", opportunity: opportunity(id), sourceOfTruth: "SQLite", transactionAuthority: false }));
      if (record[1] === "evidence") return json(route, 200, envelope(cid, evidence(id)));
      if (record[1] === "psa-advisor") return json(route, 200, envelope(cid, { kind: "psa-advisor", opportunityId: id, cardIdentity: c.title, guidanceStatus: "NOT_AVAILABLE",
        authoritativeOpportunityRecommendation: c.verdict, recalculated: false, savedPsaSnapshot: {}, populationContext: {}, transactionAuthority: false }));
      if (record[1] === "lifecycle") return json(route, 200, envelope(cid, lifecycleDetail(id)));
      return err(404, "ROUTE_NOT_FOUND", "Off.");
    }
    if (p.startsWith("/api/v1/decision-outcomes/")) return err(404, "ROUTE_NOT_FOUND", "Off.");
    if (p.startsWith("/api/v1/card-intelligence/")) return err(503, "CARD_INTELLIGENCE_UNAVAILABLE", "Unavailable.");
    if (p === "/api/v1/health") return json(route, 200, envelope(cid, { status: "configured", bridgeEnabled: true, providerEvidenceMode: "PROVIDER_SALES_OFF", evidenceStorageGuard: "VERIFIED" }));
    if (p === "/api/v1/entitlements") return json(route, 200, envelope(cid, { kind: "entitlements", readOnly: true, membershipActive: true,
      current: { code: "PRIVATE_BETA", accessState: "PRIVATE_BETA_ACTIVE", evaluationAllowanceScope: "PRIVATE_BETA_LIFETIME", effectiveEvaluationLimit: 50 },
      plan: { code: "PRIVATE_BETA" }, usage: { evaluationAllowanceScope: "PRIVATE_BETA_LIFETIME", completedEvaluations: 6, inProgressReservations: 0, admissionUsage: 6,
        evaluationAllowanceLimit: 50, remainingEvaluations: 44, evaluationAllowedNow: true } }));
    if (p === "/api/v1/opportunities") return json(route, 200, envelope(cid, { kind: "opportunities", items: IDS.map(opportunity), count: IDS.length, sourceOfTruth: "SQLite", transactionAuthority: false }));
    if (p === "/api/v1/dashboard") return json(route, 200, envelope(cid, { kind: "dashboard", readOnly: true, source: "SQLite saved governed records",
      metrics: { trackedOpportunities: IDS.length, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 2 }, opportunities: IDS.map(opportunity), items: IDS.map(opportunity) }));
    if (p === "/api/v1/lifecycle") return json(route, 200, envelope(cid, { kind: "lifecycle", sourceOfTruth: "SQLite", items: IDS.map(lifecycle), transactionAuthority: false }));
    if (p === "/api/v1/alerts") return json(route, 200, envelope(cid, alerts()));
    // options.emptyPortfolio: an account that owns no card (count 0, every total 0), as the real journey server serves it.
    if (p === "/api/v1/portfolio") return json(route, 200, envelope(cid, portfolio(Boolean(options.emptyPortfolio))));
    if (p === "/api/v1/forge-heat") return json(route, 200, envelope(cid, forgeHeat()));
    if (p === "/api/v1/market-view") return json(route, 200, envelope(cid, marketView()));
    if (p === "/api/v1/sell-watch" || p === "/api/v1/reported-sales" || p === "/api/v1/compare") return err(404, "ROUTE_NOT_FOUND", "Off.");
    if (p === "/api/v1/discover") return json(route, 200, envelope(cid, { kind: "discover", readOnly: true, query: url.searchParams.get("q") || "", requestedLimit: 25,
      targetMaxBuyCents: 0, transactionAuthority: false, candidateCount: 0, exactCandidateCount: 0, identityReviewCandidateCount: 0, evidenceSupportedCount: 0,
      evidenceSupportedBestAvailable: false, items: [] }));
    return err(404, "QA_NOT_MOCKED", p);
  };
}
