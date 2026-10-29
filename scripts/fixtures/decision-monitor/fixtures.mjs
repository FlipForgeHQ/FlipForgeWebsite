// Synthetic Decision Change Monitor / Collection Intelligence fixtures. Fictional cards and values. Shapes mirror
// FlipForge2 SaaSTenantCustomerLifecycleService (lifecycle detail, portfolio) and SaaSDecisionTimelineService (timeline
// entries and change codes). Governed decisions are reused from the Deal Check fixtures.
import fs from "node:fs";
import { details, IDS } from "../deal-check/fixtures.mjs";

export { IDS };
// Fixed "now" for deterministic ages: 33 days after the BUY and WATCH decisions (2026-10-27).
export const NOW = Date.parse("2026-11-30T12:00:00Z");
export const UNLINKED_ID = "EBAY-QA-MONITOR-UNLINKED-09";

const template = JSON.parse(fs.readFileSync(new URL("../customer-reported-sales/lifecycle-detail.json", import.meta.url), "utf8")).data;

function record(id, { status = "WATCHING", outcome = "NONE", cost = null, acquiredAt = null } = {}) {
  return { opportunityId: id, trackingStatus: status, reviewAt: null, outcomeStatus: outcome, acquisitionCostCents: cost, acquiredAt,
    dispositionProceedsCents: null, disposedAt: null, alertEnabled: false, version: 1, createdAt: "2026-10-27T16:00:00Z", updatedAt: "2026-10-27T16:00:00Z" };
}

function entry(id, fields) {
  return { requestId: `qa-${id}-${fields.evaluatedAt}`, cardIdentity: details()[id]?.opportunity.cardIdentity || id, marketplace: "eBay",
    workflowStatus: "SAVED", reviewEvidenceCount: null, rejectedEvidenceCount: null, exactIdentityEligible: true, decisionContractAvailable: true,
    decisionContractVersion: "v1.3", receiptVersion: "v1.4.0", profitabilitySnapshotPresent: true, profitabilityAvailable: true,
    profitabilityGateStatus: "BUY_ELIGIBLE", liquidity: 75, profitabilityPolicyVersion: "profitability-margin-of-safety-v1.1",
    whatWouldChange: [], immutable: true, changedFromPrevious: false, changes: [], whatChanged: [], evidenceQuality: "HIGH",
    evidenceProvenanceStatus: "CURRENT_EVIDENCE_RULES", legacyNotice: null, ...fields };
}

export function timelines() {
  const D = details();
  const buy = D[IDS.buy].opportunity.governedDecision;
  const watch = D[IDS.watch].opportunity.governedDecision;
  return {
    // Re-evaluated: ask fell from above Max Buy to inside it, decision WATCH → BUY, more exact sales.
    [IDS.buy]: [
      entry(IDS.buy, { evaluatedAt: "2026-10-20T13:00:00Z", decision: "WATCH", allInAskCents: 68000, supportedValueCents: 85000, acceptedEvidenceCount: 6,
        confidence: 82, risk: 34, maximumBuyPriceCents: buy.maximumBuyPriceCents, expectedNetProfitCents: buy.expectedNetProfitCents + 59995 - 68000 }),
      entry(IDS.buy, { evaluatedAt: buy.evaluatedAt, decision: "BUY", allInAskCents: 59995, supportedValueCents: 85000, acceptedEvidenceCount: 8,
        confidence: 85, risk: 30, maximumBuyPriceCents: buy.maximumBuyPriceCents, expectedNetProfitCents: buy.expectedNetProfitCents, changedFromPrevious: true,
        changes: [
          { code: "DECISION_CHANGED", before: "WATCH", after: "BUY", description: "Decision changed from WATCH to BUY" },
          { code: "ASK_CHANGED", before: 68000, after: 59995, description: "All-in ask fell from $680.00 to $599.95" },
          { code: "ACCEPTED_EVIDENCE_CHANGED", before: 6, after: 8, description: "Accepted exact sales rose from 6 to 8" },
          { code: "RISK_CHANGED", before: 34, after: 30, description: "Risk fell from 34 to 30" }
        ],
        whatChanged: ["Decision changed from WATCH to BUY", "All-in ask fell from $680.00 to $599.95"] })
    ],
    // One saved evaluation only; risk rose at a later re-evaluation is not present.
    [IDS.watch]: [
      entry(IDS.watch, { evaluatedAt: watch.evaluatedAt, decision: "WATCH", allInAskCents: 75995, supportedValueCents: 85000, acceptedEvidenceCount: 62,
        confidence: 83, risk: 70, maximumBuyPriceCents: watch.maximumBuyPriceCents, expectedNetProfitCents: watch.expectedNetProfitCents,
        exactIdentityEligible: false, profitabilityGateStatus: "MARGIN_OF_SAFETY_NOT_MET" })
    ]
  };
}

export function lifecycleRecords() {
  return {
    [IDS.buy]: record(IDS.buy, { status: "OWNED", outcome: "ACQUIRED", cost: 61000, acquiredAt: "2026-10-28T00:00:00Z" }),
    [IDS.watch]: record(IDS.watch, { status: "OWNED", outcome: "ACQUIRED", cost: 72000, acquiredAt: "2026-10-29T00:00:00Z" }),
    [IDS.verify]: record(IDS.verify, { status: "OWNED", outcome: "ACQUIRED", cost: 40000, acquiredAt: "2026-10-28T00:00:00Z" }),
    [IDS.pass]: record(IDS.pass, { status: "WATCHING" }),
    [UNLINKED_ID]: record(UNLINKED_ID, { status: "OWNED", outcome: "ACQUIRED", cost: 15000, acquiredAt: "2026-09-01T00:00:00Z" })
  };
}

export function lifecycleDetail(id) {
  const tl = timelines()[id] || [];
  const rec = lifecycleRecords()[id] || record(id);
  const timeline = tl.length
    ? { ...template.decisionTimeline, opportunityId: id, entries: tl, snapshotCount: tl.length, changedEntryCount: tl.filter(e => e.changedFromPrevious).length, available: true }
    : { kind: "decision-timeline", available: false, status: "NO_IMMUTABLE_DECISION_HISTORY", snapshotCount: 0, entries: [], opportunityId: id };
  const dci = JSON.parse(JSON.stringify(template.decisionChangeIntelligence));
  dci.opportunityId = id;
  return { ...template, opportunityId: id, lifecycle: rec, history: [], decisionTimeline: timeline, decisionChangeIntelligence: dci };
}

export function lifecycleList() {
  const recs = lifecycleRecords();
  return { ...template, kind: "lifecycle", count: Object.keys(recs).length, items: Object.values(recs) };
}

export function opportunitiesList() {
  const D = details();
  return { kind: "opportunities", governedDecisionReadModelVersion: "governed-decision-read-model-v1", readOnly: true,
    items: Object.values(D).map(d => d.opportunity), count: Object.keys(D).length };
}

export function portfolio() {
  const owned = Object.values(lifecycleRecords()).filter(r => r.trackingStatus === "OWNED");
  // Same paused shape the existing Portfolio audit uses (the gateway rewrites the provider's name in the status).
  const paused = { available: false, status: "PROVIDER_STORED_HISTORY_NOT_RETAINED", valueCents: null,
    method: "AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES", acceptedExactCompletedSales: 0, minimumAcceptedExactSales: 3,
    maximumLatestSaleAgeDays: 30, latestSaleAgeDays: null, latestSaleDate: null, marketplaces: [], exactIdentityRequired: true,
    activeListingsUsed: false, providerCallPerformed: false, persistedAsValuation: false, appraisal: false, transactionAuthority: false };
  const perf = { available: false, status: "REFERENCE_VALUE_UNAVAILABLE", method: "EVIDENCE_REFERENCE_MINUS_CUSTOMER_COST_BASIS",
    realized: false, feesIncluded: false, taxesIncluded: false, liquidationEstimate: false, appraisal: false, transactionAuthority: false,
    acquisitionCostCents: null, referenceValueCents: null, referenceDeltaCents: null, referenceDeltaPercent: null };
  return { kind: "portfolio", configured: true, readOnly: false, status: "CUSTOMER_COST_BASIS_AVAILABLE_REFERENCE_VALUE_UNAVAILABLE",
    currentValueConfigured: true, currentValueType: "EVIDENCE_SUPPORTED_REFERENCE_NOT_APPRAISAL", currentValueMethod: "AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES",
    performanceConfigured: true, performanceType: "UNREALIZED_REFERENCE_COMPARISON", count: owned.length,
    totalCostBasisCents: owned.reduce((t, r) => t + r.acquisitionCostCents, 0), referenceValueAvailableCount: 0, performanceAvailableCount: 0,
    completeReferenceCoverage: false, completePerformanceCoverage: false, coveredReferenceValueCents: 0, coveredCostBasisCents: 0, coveredReferenceDeltaCents: 0,
    completePortfolioReferenceValueCents: null, completePortfolioReferenceDeltaCents: null, feesIncluded: false, taxesIncluded: false,
    liquidationEstimate: false, appraisal: false, transactionAuthority: false,
    items: owned.map(r => ({ ...r, referenceValue: { ...paused }, referencePerformance: { ...perf } })), writeContract: "/api/v1/lifecycle/{opportunityId}" };
}
