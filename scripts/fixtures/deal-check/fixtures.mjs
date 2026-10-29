// Synthetic Deal Check fixtures. Fictional cards and values; the SCHEMA mirrors the governed read model (G1) served by
// GET /api/v1/opportunities/{id} and the decision timeline served by GET /api/v1/lifecycle/{id} (FlipForge2
// SaaSTenantScopedProjectionService.opportunity, SaaSGovernedDecisionReadModel.governedDecision,
// SaaSDecisionTimelineService). No provider data, no real listing.
//
// engineReference() is a test-only transcription of FlipForge2 ProfitabilityGuardrailService.assess (policy
// profitability-margin-of-safety-v1.1). It exists so fixtures are internally consistent with the engine and so the
// validator can prove the browser's Max Buy explanation reproduces the engine. The browser never decides with it.

export const G1 = "governed-decision-read-model-v1";

export function engineReference({ supportedValueCents, allInAcquisitionCostCents, confidence, risk, evidenceQuality, acceptedExactEvidenceCount }) {
  const clamp = v => Math.max(0, Math.min(100, v));
  const accepted = Math.max(0, acceptedExactEvidenceCount);
  const liquidity = accepted >= 5 ? 75 : accepted >= 3 ? 65 : accepted >= 1 ? 55 : 35;
  const base = { HIGH: 300, MODERATE: 700, LOW: 1200 }[evidenceQuality] ?? 1800;
  const evidenceHaircut = Math.min(2500, base + Math.max(0, 80 - clamp(confidence)) * 10 + Math.max(0, clamp(risk) - 40) * 10);
  const stressHaircut = 500 + (risk >= 70 ? 300 : 0);
  const slip = liquidity >= 80 ? 75 : liquidity >= 65 ? 150 : liquidity >= 55 ? 300 : 500;
  const haircut = (c, bps) => Math.max(0, Math.round(Math.max(0, c) * Math.max(0, 1 - bps / 10000)));
  const friction = v => Math.max(0, Math.round(Math.max(0, v) * ((1350 + 100 + 50 + slip) / 10000)) + 500);
  const sv = supportedValueCents;
  const cons = haircut(sv, evidenceHaircut);
  const stress = haircut(cons, stressHaircut);
  const exit = v => Math.max(0, v - friction(v));
  const [eN, cN, sN] = [exit(sv), exit(cons), exit(stress)];
  const a = allInAcquisitionCostCents;
  const roi = p => (a <= 0 ? null : Math.round((p * 10000) / a));
  const forRoi = (n, bps) => (n <= 0 ? 0 : Math.max(0, Math.floor((n * 10000) / (10000 + bps))));
  const maximumBuyPriceCents = Math.max(0, Math.min(forRoi(eN, 1000), forRoi(cN, 500), sN, Math.max(0, eN - 2000)));
  return {
    liquidity, maximumBuyPriceCents,
    expectedNetProfitCents: eN - a, conservativeNetProfitCents: cN - a, stressNetProfitCents: sN - a,
    expectedRoiBasisPoints: roi(eN - a), conservativeRoiBasisPoints: roi(cN - a), stressRoiBasisPoints: roi(sN - a)
  };
}

function governed(fields) {
  return {
    available: true, status: "GOVERNED_SNAPSHOT", source: "IMMUTABLE_DECISION_SNAPSHOT", readModelVersion: "g1-qa",
    guardrailApplied: true, profitabilityCappedBuy: false, modeledEstimate: true, profitGuaranteed: false,
    whatWouldChange: [], whatWouldChangeSource: "DECISION_RECEIPT", snapshotCount: 1,
    snapshotVersion: "v7.00+v14.83+v16.05+v16.06", receiptVersion: "v1.4.0", evaluatedAt: "2026-10-27T15:04:11Z",
    immutable: true, recommendationAuthorityChanged: false, transactionAuthority: false, ...fields
  };
}

function valueIntelligence(supportedCents) {
  return supportedCents
    ? { basis: "DIRECT_EXACT_SOLD", confidenceBand: "MODERATE", explanation: "Supported value is backed by exact completed-sale evidence.", version: "vi-qa",
        recommendationAuthority: false, priceAdjustmentApplied: false, exactEvidenceRequired: true, directSupportedValueCents: supportedCents,
        referenceLowCents: 0, referenceMidpointCents: 0, referenceHighCents: 0, analogCompletedSaleCount: 0 }
    : { basis: "NO_EXACT_EVIDENCE", confidenceBand: "NONE", explanation: "No supported value is established without accepted exact completed-sale evidence.", version: "vi-qa",
        recommendationAuthority: false, priceAdjustmentApplied: false, exactEvidenceRequired: true, directSupportedValueCents: 0,
        referenceLowCents: 0, referenceMidpointCents: 0, referenceHighCents: 0, analogCompletedSaleCount: 0 };
}

function card({ id, title, ask, sv, mappingState = "CONFIRMED", accepted, excluded = 0, reasons = [], gd, legacy = false, thresholds = null }) {
  const opportunity = {
    id, platform: "EBAY", title, cardIdentity: title, recommendation: gd.recommendation, baseRecommendation: gd.baseRecommendation || gd.recommendation,
    recommendationSource: "GOVERNED_SNAPSHOT", ask, supportedValue: sv ? sv / 100 : 0, supportedValueCents: sv,
    supportedValueStatus: sv ? "ESTABLISHED" : "NOT_ESTABLISHED", supportedValueStatusReason: sv ? null : "NO_EXACT_EVIDENCE",
    confidence: gd.confidence, risk: gd.risk, liquidity: 65, evidenceCount: accepted, mappingState, workflowStatus: gd.workflowStatus || null,
    observedAt: "2026-10-27T15:04:05Z", changeSummary: "NO PRICE CHANGE",
    evidence: { acceptedSales: accepted, notAdmittedSales: excluded, notAdmittedReasons: reasons, marketplaces: [] },
    evidenceProvenanceStatus: legacy ? "LEGACY_DERIVED" : "CURRENT",
    ...(legacy ? { currentlySupported: false, legacyNotice: "Saved before current evidence rules; not presented as currently supported." } : {}),
    valueIntelligence: valueIntelligence(sv),
    governedDecision: governed(gd)
  };
  return {
    kind: "opportunity-detail", readOnly: true, governedDecisionReadModelVersion: G1, opportunity,
    priceIntelligence: thresholds
      ? { kind: "counterfactual-price-intelligence", readOnly: true, available: true, thresholdsInvented: false, changesRecommendationAuthority: false, thresholds, transitions: [] }
      : { kind: "counterfactual-price-intelligence", readOnly: true, available: true, thresholdsInvented: false, changesRecommendationAuthority: false, thresholds: {}, transitions: [] }
  };
}

export const IDS = Object.freeze({
  buy: "EBAY-QA-DEALCHECK-BUY-01",
  watch: "EBAY-QA-DEALCHECK-WATCH-02",
  verify: "EBAY-QA-DEALCHECK-VERIFY-03",
  pass: "EBAY-QA-DEALCHECK-PASS-04",
  legacy: "EBAY-QA-DEALCHECK-LEGACY-05",
  verifyThin: "EBAY-QA-DEALCHECK-VERIFY-THIN-06"
});

export function details() {
  const buyEngine = engineReference({ supportedValueCents: 85000, allInAcquisitionCostCents: 59995, confidence: 85, risk: 30, evidenceQuality: "HIGH", acceptedExactEvidenceCount: 8 });
  const watchEngine = engineReference({ supportedValueCents: 85000, allInAcquisitionCostCents: 75995, confidence: 83, risk: 70, evidenceQuality: "HIGH", acceptedExactEvidenceCount: 62 });
  const passEngine = engineReference({ supportedValueCents: 41000, allInAcquisitionCostCents: 48900, confidence: 78, risk: 45, evidenceQuality: "MODERATE", acceptedExactEvidenceCount: 4 });
  // VERIFY with no supported value: the engine still writes Max Buy and profits, modelling value as $0
  // (SaaSProfitabilityGuardrailProjectionService always puts them). Max Buy 0 and profit = −ask are what the server sends.
  const verifyEngine = engineReference({ supportedValueCents: 0, allInAcquisitionCostCents: 42000, confidence: 40, risk: 80, evidenceQuality: "INSUFFICIENT", acceptedExactEvidenceCount: 0 });
  // VERIFY with an established value but only 2 exact sales (BUY needs 3): a real, positive Max Buy exists.
  const thinEngine = engineReference({ supportedValueCents: 30000, allInAcquisitionCostCents: 18500, confidence: 70, risk: 50, evidenceQuality: "LOW", acceptedExactEvidenceCount: 2 });
  const strip = ({ liquidity, ...rest }) => rest;
  return {
    [IDS.buy]: card({
      id: IDS.buy, title: "2018 Topps Chrome #150 S. Okada Refractor PSA 9", ask: 599.95, sv: 85000, accepted: 8, excluded: 3,
      reasons: ["wrong grade", "duplicate"],
      gd: { recommendation: "BUY", baseRecommendation: "BUY", profitabilityGateStatus: "BUY_ELIGIBLE", allInAskCents: 59995, supportedValueCents: 85000,
        supportedValueStatus: "ESTABLISHED", exactTrustedCompCount: 8, confidence: 85, risk: 30, ...strip(buyEngine),
        reason: "BUY is based on an all-in ask of $599.95, an exact median of $850.00 and 8 accepted exact sales.",
        nextAction: "Review the listing photos and seller terms before you buy.", missingRequirement: "None - evidence is ready for review",
        whatWouldChange: ["A price above Max Buy or new exact sales well below $850 would weaken this BUY."], workflowStatus: "READY_FOR_OPERATOR_REVIEW", snapshotCount: 2 }
    }),
    [IDS.watch]: card({
      id: IDS.watch, title: "2019 Prism Series J. Carver #48 Silver PSA 9", ask: 759.95, sv: 85000, accepted: 62, excluded: 438, mappingState: "NOT_CONFIRMED",
      reasons: ["wrong parallel", "wrong grade", "outlier"], thresholds: { buyAtOrBelowCents: 64000, watchAtOrBelowCents: 80000 },
      gd: { recommendation: "WATCH", baseRecommendation: "WATCH", profitabilityGateStatus: "MARGIN_OF_SAFETY_NOT_MET", allInAskCents: 75995, supportedValueCents: 85000,
        supportedValueStatus: "ESTABLISHED", exactTrustedCompCount: 62, confidence: 83, risk: 70, ...strip(watchEngine),
        reason: "WATCH is based on an all-in ask of $759.95, an exact median of $850.00, and 62 accepted exact comps.",
        nextAction: "Track the listing and wait for a better price or stronger evidence.", missingRequirement: "None - evidence is ready for review",
        whatWouldChange: ["Track the listing and wait for a better price or stronger evidence."], workflowStatus: "ACTIVE_WATCHLIST", snapshotCount: 2 }
    }),
    [IDS.verify]: card({
      id: IDS.verify, title: "2024 Panini Prizm #301 C. Willard PSA 10", ask: 420, sv: null, accepted: 0, mappingState: "NOT_CONFIRMED",
      gd: { recommendation: "VERIFY", baseRecommendation: "VERIFY", profitabilityGateStatus: "VERIFY_REQUIRED", allInAskCents: 42000, supportedValueCents: null,
        supportedValueStatus: "NOT_ESTABLISHED", ...strip(verifyEngine), exactTrustedCompCount: 0, confidence: 40, risk: 80,
        reason: "VERIFY: no exact completed-sale evidence is accepted for this card yet.", missingRequirement: "exact completed-sale evidence for this card",
        nextAction: "Confirm the exact card identity before relying on this listing.", workflowStatus: "MANUAL_VERIFICATION" }
    }),
    [IDS.pass]: card({
      id: IDS.pass, title: "2022 Topps Update #US44 R. Juliano PSA 10", ask: 489, sv: 41000, accepted: 4,
      gd: { recommendation: "PASS", baseRecommendation: "PASS", profitabilityGateStatus: "NEGATIVE_NET_ECONOMICS", allInAskCents: 48900, supportedValueCents: 41000,
        supportedValueStatus: "ESTABLISHED", exactTrustedCompCount: 4, confidence: 78, risk: 45, ...strip(passEngine),
        reason: "PASS: modeled net economics are negative at this ask.", nextAction: "Skip this listing.", workflowStatus: "PASS" }
    }),
    [IDS.verifyThin]: card({
      id: IDS.verifyThin, title: "2021 Bowman Chrome #BCP-9 T. Rowan Auto /499", ask: 185, sv: 30000, accepted: 2,
      gd: { recommendation: "VERIFY", baseRecommendation: "VERIFY", profitabilityGateStatus: "VERIFY_REQUIRED", allInAskCents: 18500, supportedValueCents: 30000,
        supportedValueStatus: "ESTABLISHED", exactTrustedCompCount: 2, confidence: 70, risk: 50, ...strip(thinEngine),
        reason: "VERIFY: only 2 exact completed sales are accepted; at least 3 are required.", missingRequirement: "at least one more exact completed sale",
        nextAction: "Wait for another exact sale or verify the card independently.", workflowStatus: "MANUAL_VERIFICATION" }
    }),
    [IDS.legacy]: card({
      id: IDS.legacy, title: "2017 Optic #8 L. Marlow Holo PSA 10", ask: 300, sv: 52000, accepted: 1, legacy: true,
      gd: { recommendation: "WATCH", baseRecommendation: "WATCH", profitabilityGateStatus: "VERIFY_REQUIRED", allInAskCents: 30000, supportedValueCents: 52000,
        supportedValueStatus: "ESTABLISHED", exactTrustedCompCount: 1, confidence: 60, risk: 60, maximumBuyPriceCents: 35000,
        expectedNetProfitCents: 12000, conservativeNetProfitCents: 6000, stressNetProfitCents: 2000,
        reason: "WATCH (legacy result).", nextAction: "Re-evaluate under current rules.", workflowStatus: "ACTIVE_WATCHLIST" }
    })
  };
}

export function timeline(id) {
  if (id === IDS.buy) {
    return {
      kind: "decision-timeline", opportunityId: id, snapshotCount: 3, changedEntryCount: 1, historicalSnapshotsImmutable: true, historicalRescoring: false,
      entries: [
        { requestId: "qa-req-0000", evaluatedAt: "2026-10-12T09:00:00Z", decision: "VERIFY", allInAskCents: 70000, supportedValueCents: null, acceptedEvidenceCount: 0,
          maximumBuyPriceCents: 0, expectedNetProfitCents: -70000, profitabilityAvailable: false, profitabilityPolicyVersion: "profitability-margin-of-safety-v1.1", changes: [], whatChanged: [], immutable: true },
        { requestId: "qa-req-0001", evaluatedAt: "2026-10-20T13:00:00Z", decision: "WATCH", allInAskCents: 68000, supportedValueCents: 85000, acceptedEvidenceCount: 6,
          maximumBuyPriceCents: 63000, profitabilityPolicyVersion: "profitability-margin-of-safety-v1.1", changes: [], whatChanged: [], immutable: true },
        { requestId: "qa-req-0002", evaluatedAt: "2026-10-27T15:04:11Z", decision: "BUY", allInAskCents: 59995, supportedValueCents: 85000, acceptedEvidenceCount: 8,
          maximumBuyPriceCents: details()[IDS.buy].opportunity.governedDecision.maximumBuyPriceCents, profitabilityPolicyVersion: "profitability-margin-of-safety-v1.1",
          changes: [{ code: "ASK_CHANGED", description: "All-in ask fell from $680.00 to $599.95" }], whatChanged: ["All-in ask fell from $680.00 to $599.95", "Decision changed from WATCH to BUY"], immutable: true }
      ]
    };
  }
  return null; // 404: no historical snapshot list for this id
}

export function envelope(correlationId, data) {
  return {
    meta: { contractVersion: "1.0", engineVersion: "deal-check-qa", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence",
      correlationId, generatedAt: "2026-10-29T00:00:00Z", evidenceFreshness: "QA_FIXTURE", limitations: ["Synthetic Deal Check fixture only."] },
    data
  };
}
