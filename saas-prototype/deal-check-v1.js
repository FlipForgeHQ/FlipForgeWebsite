/*
 * FlipForge Deal Check™ v1 · Decision Scenario Lab™ · Decision Receipt Pro™ (Phase 1 slice)
 *
 * Where: the saved-decision page (#/opportunities/{id}) — the screen every Discover → exact-card verification →
 * Evaluate run lands on. Deal Check is inserted directly under the existing decision hero; nothing is rebuilt.
 *
 * Data: GET /api/v1/opportunities/{id} (governed read model G1: opportunity.governedDecision + priceIntelligence)
 * and, optionally, GET /api/v1/lifecycle/{id} (immutable decision timeline). Both are read-only and already behind
 * the gateway allowlist. No provider call, no evaluation, no quota use, no write.
 *
 * Authority boundary (presentation only):
 *  - BUY/WATCH/VERIFY/PASS, Max Buy, profit, ROI and supported value are shown exactly as the frozen decision
 *    snapshot recorded them. This file never calculates or changes a verdict, a Max Buy or a supported value.
 *  - Break-even Buy Price and per-case net proceeds are exact arithmetic on two saved values
 *    (all-in ask + saved net profit = the engine's modeled net proceeds; ProfitabilityGuardrailService).
 *  - The Max Buy explanation reproduces the engine's four published limits from saved net proceeds and is shown
 *    ONLY when the reproduction equals the saved Max Buy to the cent. Otherwise it says so.
 *  - Scenario Lab results are labelled simulations, never persisted, never sent anywhere, and never produce a
 *    verdict. With no established supported value the lab is blocked: an asking price is never used as value.
 *  - No individual sale price, date or link is shown (provider containment); only server counts.
 *  - Missing values render as "Not established" / "Not calculated", never $0.
 *
 * Activation: preview hosts and localhost by default. On goflipforge.com it stays off unless the page is opened with
 * ?dealcheck=1 (session only). window.FlipForgeDealCheckDisabled = true is a kill switch everywhere.
 */
(() => {
  "use strict";
  if (typeof window !== "undefined" && window.FlipForgeDealCheck) return;

  const VERSION = "deal-check-v1.0.0";
  const CONTRACT_VERSION = "1.0";
  const G1_PREFIX = "governed-decision-read";
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const VERDICTS = Object.freeze(["BUY", "WATCH", "VERIFY", "PASS"]);
  const NOT_ESTABLISHED = "Not established";
  const NOT_CALCULATED = "Not calculated";
  const SECTION_ATTR = "data-ff-deal-check";

  /*
   * Published constants of the engine's profitability policy (FlipForge2 ProfitabilityGuardrailService,
   * profitability-margin-of-safety-v1.1). Used ONLY to explain a saved Max Buy and to label reserves; every use is
   * checked against the saved snapshot (see maxBuyReasoning). They never produce a decision.
   */
  const POLICY = Object.freeze({
    version: "profitability-margin-of-safety-v1.1",
    sellingFeeReserveBps: 1350,
    lossReturnReserveBps: 100,
    insuranceReserveBps: 50,
    outboundShippingReserveCents: 500,
    minExpectedRoiBps: 1000,
    minConservativeRoiBps: 500,
    minExpectedProfitCents: 2000
  });

  /*
   * Subscription architecture hook. Every tier gets the SAME governed decision; tiers only change workflow depth.
   * Intended mapping (not enforced yet — billing and entitlements are unchanged):
   *   dealCheck: all tiers · scenarioLab: Collector+ · receiptHistory: Pro.
   * A feature is withheld only when the server's plan explicitly carries `false` for it. Today no plan does, so
   * nothing is withheld and no customer entitlement changes.
   */
  const FEATURE_TIERS = Object.freeze({ dealCheck: "SCOUT", scenarioLab: "COLLECTOR", receiptHistory: "PRO" });
  function featureAvailable(name, plan) {
    if (!Object.prototype.hasOwnProperty.call(FEATURE_TIERS, name)) return false;
    const flags = plan && typeof plan === "object" ? plan : null;
    return !(flags && flags[name] === false);
  }

  /* ------------------------------------------------------------------ *
   * Pure helpers (exported for the static validator)
   * ------------------------------------------------------------------ */

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function text(value) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""; }
  function int(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  function money(cents, fallback = NOT_ESTABLISHED) {
    if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return fallback;
    const value = Number(cents) / 100;
    const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
    return value < 0 ? `−${formatted}` : formatted;
  }
  function signedMoney(cents, fallback = NOT_CALCULATED) {
    if (cents === null || cents === undefined) return fallback;
    return cents > 0 ? `+${money(cents)}` : money(cents);
  }
  function percentFromBp(bp, fallback = "—") {
    if (bp === null || bp === undefined || !Number.isFinite(Number(bp))) return fallback;
    const value = Number(bp) / 100;
    const formatted = `${Math.abs(value).toFixed(1)}%`;
    return value < 0 ? `−${formatted}` : formatted;
  }
  function dateText(value) {
    const raw = text(value);
    if (!raw) return "";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(parsed);
  }
  function verdictOf(value) {
    const raw = text(value).toUpperCase();
    return VERDICTS.includes(raw) ? raw : "";
  }
  function roiBp(profitCents, costCents) {
    if (profitCents === null || costCents === null || costCents <= 0) return null;
    return Math.round((profitCents * 10000) / costCents);
  }
  function floorForRoi(netExitCents, requiredRoiBps) {
    if (netExitCents === null) return null;
    if (netExitCents <= 0) return 0;
    return Math.max(0, Math.floor((netExitCents * 10000) / (10000 + requiredRoiBps)));
  }

  /** Server-owned view of one saved decision. Reads only; never derives a verdict, Max Buy or value. */
  function dealModel(detailData, timelineData) {
    const data = detailData && typeof detailData === "object" ? detailData : {};
    const opportunity = data.opportunity && typeof data.opportunity === "object" ? data.opportunity : {};
    const governed = opportunity.governedDecision && typeof opportunity.governedDecision === "object" ? opportunity.governedDecision : {};
    const governedAvailable = governed.available === true;
    const g1 = typeof data.governedDecisionReadModelVersion === "string" && data.governedDecisionReadModelVersion.startsWith(G1_PREFIX);
    const evidence = opportunity.evidence && typeof opportunity.evidence === "object" ? opportunity.evidence : {};
    const price = data.priceIntelligence && typeof data.priceIntelligence === "object" ? data.priceIntelligence : {};
    const thresholds = price.thresholds && typeof price.thresholds === "object" ? price.thresholds : {};

    const legacy = (() => {
      const status = text(opportunity.evidenceProvenanceStatus);
      if (status) return !/^CURRENT(?:_|$)/i.test(status);
      return opportunity.currentlySupported === false || text(opportunity.supportedValueStatus).toUpperCase() === "LEGACY_NOT_CURRENTLY_SUPPORTED";
    })();

    const supportedStatus = text(governed.supportedValueStatus || opportunity.supportedValueStatus).toUpperCase();
    const supportedCents = legacy || supportedStatus === "NOT_ESTABLISHED"
      ? null
      : int(governedAvailable ? governed.supportedValueCents : opportunity.supportedValueCents);

    const snapshotAskCents = governedAvailable ? int(governed.allInAskCents) : null;
    const listingAskCents = int(opportunity.ask) === null ? null : Math.round(Number(opportunity.ask) * 100);
    const askCents = snapshotAskCents ?? listingAskCents;
    const askFromSnapshot = snapshotAskCents !== null;

    // The engine always writes Max Buy and profits, even with no supported value (it then models value as $0, giving
    // Max Buy 0 and profit = −ask). Those are not economics of this card, so they are shown only when the snapshot is
    // governed, current (not legacy) and an evidence-supported value is established.
    const economics = governedAvailable && !legacy && supportedCents !== null && supportedCents > 0;
    const pick = field => (economics ? int(governed[field]) : null);
    const net = { expected: pick("expectedNetProfitCents"), conservative: pick("conservativeNetProfitCents"), stress: pick("stressNetProfitCents") };
    const roi = { expected: pick("expectedRoiBasisPoints"), conservative: pick("conservativeRoiBasisPoints"), stress: pick("stressRoiBasisPoints") };
    // Net proceeds after FlipForge's selling reserves = saved all-in ask + saved net profit (exact, same snapshot).
    const netExit = {};
    for (const key of ["expected", "conservative", "stress"]) {
      netExit[key] = askFromSnapshot && net[key] !== null ? snapshotAskCents + net[key] : null;
    }
    const maxBuyCents = pick("maximumBuyPriceCents");
    const breakEvenCents = netExit.expected !== null && netExit.expected > 0 ? netExit.expected : null;

    const timelineEntries = (() => {
      const source = timelineData && typeof timelineData === "object" ? timelineData : null;
      const timeline = source && (source.kind === "decision-timeline" ? source : source.decisionTimeline);
      return timeline && Array.isArray(timeline.entries) ? timeline.entries.filter(entry => entry && typeof entry === "object") : [];
    })();
    const latestEntry = timelineEntries.length ? timelineEntries[timelineEntries.length - 1] : null;

    const excludedCount = int(evidence.notAdmittedSales ?? evidence.excludedSales ?? evidence.excludedCount);
    const excludedReasons = (Array.isArray(evidence.notAdmittedReasons) ? evidence.notAdmittedReasons
      : Array.isArray(evidence.exclusionReasons) ? evidence.exclusionReasons : []).map(text).filter(Boolean).slice(0, 6);

    return {
      version: VERSION,
      g1,
      governedAvailable,
      id: text(opportunity.id),
      title: text(opportunity.title) || text(opportunity.cardIdentity) || "Saved FlipForge decision",
      verdict: verdictOf(governedAvailable ? governed.recommendation : opportunity.recommendation),
      baseVerdict: verdictOf(governed.baseRecommendation || opportunity.baseRecommendation),
      profitabilityCappedBuy: governed.profitabilityCappedBuy === true,
      gateStatus: text(governed.profitabilityGateStatus).toUpperCase(),
      reason: text(governed.reason),
      nextAction: text(governed.nextAction),
      missingRequirement: text(governed.missingRequirement),
      whatWouldChange: (Array.isArray(governed.whatWouldChange) ? governed.whatWouldChange : []).map(text).filter(Boolean),
      evaluatedAt: text(governed.evaluatedAt),
      receiptVersion: text(governed.receiptVersion),
      snapshotVersion: text(governed.snapshotVersion),
      snapshotCount: int(governed.snapshotCount),
      immutable: governed.immutable === true,
      legacy,
      legacyNotice: text(opportunity.legacyNotice),
      // Server-owned rules disclosure (FlipForge2 #950): a decision made under earlier profitability rules is kept
      // exactly as made; never re-scored here.
      earlierRules: governedAvailable && governed.decisionRules && governed.decisionRules.decidedUnderEarlierRules === true,
      rulesDisclosure: governedAvailable && governed.decisionRules ? text(governed.decisionRules.disclosure) : "",
      askCents,
      askFromSnapshot,
      supportedCents,
      supportedStatus,
      maxBuyCents,
      // Headroom only against the snapshot all-in ask; a bare listing price leaves out shipping and tax.
      headroomCents: askFromSnapshot && maxBuyCents !== null ? maxBuyCents - snapshotAskCents : null,
      breakEvenCents,
      net,
      roi,
      netExit,
      exactSales: governedAvailable ? int(governed.exactTrustedCompCount) : int(opportunity.evidenceCount),
      // After containment the server keeps no sale records ("LIVE_PRICING_ONLY": sales are checked live at evaluation
      // and not stored), so a saved-sales count is not applicable rather than zero.
      currentSavedSales: /LIVE_PRICING_ONLY/i.test(text(evidence.priceStatus)) ? null : int(evidence.acceptedSales),
      // FlipForge's own exact-card concerns for the saved decision (governed checklist, category IDENTITY). The
      // provider catalog mapping state is not used for warnings: with the provider suspended it is never confirmed.
      identityIssues: (governedAvailable && governed.verificationChecklist && Array.isArray(governed.verificationChecklist.items)
        ? governed.verificationChecklist.items : []).filter(item => item && text(item.category).toUpperCase() === "IDENTITY")
        .map(item => text(item.issue) || text(item.line)).filter(Boolean).slice(0, 3),
      excludedCount,
      excludedReasons,
      saleDetailsWithheld: evidence.saleDetailsWithheld === true,
      freshness: text(evidence.freshnessStatus).toUpperCase(),
      latestSaleDate: text(evidence.latestSaleDate),
      mappingState: text(opportunity.mappingState).toUpperCase(),
      confidence: governedAvailable && int(governed.confidence) !== null ? int(governed.confidence) : int(opportunity.confidence),
      risk: governedAvailable && int(governed.risk) !== null ? int(governed.risk) : int(opportunity.risk),
      priceThresholds: {
        available: price.available !== false && price.changesRecommendationAuthority === false,
        buyAtOrBelowCents: int(thresholds.buyAtOrBelowCents),
        watchAtOrBelowCents: int(thresholds.watchAtOrBelowCents)
      },
      timeline: timelineEntries.map(entry => ({
        requestId: text(entry.requestId),
        evaluatedAt: text(entry.evaluatedAt),
        decision: verdictOf(entry.decision),
        allInAskCents: int(entry.allInAskCents),
        supportedValueCents: int(entry.supportedValueCents),
        maximumBuyPriceCents: entry.profitabilityAvailable === false || !(int(entry.supportedValueCents) > 0) ? null : int(entry.maximumBuyPriceCents),
        acceptedEvidenceCount: int(entry.acceptedEvidenceCount),
        whatChanged: Array.isArray(entry.whatChanged) ? entry.whatChanged.map(text).filter(Boolean)
          : Array.isArray(entry.changes) ? entry.changes.map(change => text(change && change.description)).filter(Boolean) : []
      })),
      policyVersion: latestEntry ? text(latestEntry.profitabilityPolicyVersion) : "",
      // Liquidity the engine used for THIS decision's Max Buy (profitability snapshot on the matching timeline entry).
      // The opportunity-level liquidity is never used: it can be a display default (50), not a governed assessment.
      savedLiquidity: (() => {
        const at = text(governed.evaluatedAt);
        const match = at ? timelineEntries.find(entry => text(entry.evaluatedAt) === at) : null;
        return match && match.profitabilityAvailable !== false ? int(match.liquidity) : null;
      })()
    };
  }

  /**
   * Which of the engine's four Max Buy limits set the saved Max Buy. Reproduced from saved net proceeds and returned
   * only when the reproduction equals the saved Max Buy exactly; otherwise `reproduced` is false and nothing is claimed.
   */
  function maxBuyReasoning(model) {
    const out = { reproduced: false, limits: [], binding: "" };
    if (!model || model.maxBuyCents === null || model.netExit.expected === null || model.netExit.conservative === null || model.netExit.stress === null) return out;
    if (model.policyVersion && model.policyVersion !== POLICY.version) return out;
    const limits = [
      { key: "expectedRoi", label: `Base case keeps at least a ${POLICY.minExpectedRoiBps / 100}% return after costs`, cents: floorForRoi(model.netExit.expected, POLICY.minExpectedRoiBps) },
      { key: "conservativeRoi", label: `Cautious case keeps at least a ${POLICY.minConservativeRoiBps / 100}% return`, cents: floorForRoi(model.netExit.conservative, POLICY.minConservativeRoiBps) },
      { key: "stress", label: "Downside case does not lose money", cents: Math.max(0, model.netExit.stress) },
      { key: "minimumProfit", label: `Base case keeps at least ${money(POLICY.minExpectedProfitCents)} profit`, cents: Math.max(0, model.netExit.expected - POLICY.minExpectedProfitCents) }
    ];
    const reproducedValue = Math.max(0, Math.min(...limits.map(limit => limit.cents)));
    if (reproducedValue !== model.maxBuyCents) return out;
    const binding = limits.reduce((best, limit) => (limit.cents < best.cents ? limit : best), limits[0]);
    return { reproduced: true, limits, binding: binding.key };
  }

  const MAX_INPUT_CENTS = 100_000_000; // $1,000,000
  function boundedCents(value) {
    const parsed = int(value);
    if (parsed === null) return null;
    return Math.min(MAX_INPUT_CENTS, Math.max(0, parsed));
  }

  /**
   * Decision Scenario Lab™. Hypothetical economics only. Returns numbers and labels — never a verdict.
   * inputs: { itemCents, inboundShippingCents, taxCents, costMode: "reserves"|"custom", feeBps, outboundShippingCents,
   *           otherCostsCents, targetProfitCents, targetRoiBps }
   */
  function scenario(model, inputs = {}) {
    const result = { available: false, blocked: "", simulation: true, verdict: null };
    if (!model || !model.governedAvailable) { result.blocked = "This saved decision has no frozen economics to simulate against."; return result; }
    if (model.legacy) { result.blocked = "This result was saved before current evidence rules, so it is not used for simulations."; return result; }
    if (model.supportedCents === null) { result.blocked = "Scenario Lab needs an evidence-supported value. None is established for this card, and FlipForge never substitutes an asking price for value."; return result; }
    if (!model.askFromSnapshot || model.netExit.expected === null) { result.blocked = "The saved receipt did not record the economics needed for a simulation."; return result; }

    // An omitted price (programmatic default) starts at the saved all-in ask; an empty or invalid field is refused.
    if (inputs.itemCents === "invalid") { result.blocked = "Enter an all-in price, for example 650 or 650.00."; return result; }
    const item = inputs.itemCents === undefined ? model.askCents : boundedCents(inputs.itemCents);
    if (item === null) { result.blocked = "Enter an all-in price, for example 650 or 650.00."; return result; }
    const purchaseCents = item + (boundedCents(inputs.inboundShippingCents) || 0) + (boundedCents(inputs.taxCents) || 0);
    if (!(purchaseCents > 0)) { result.blocked = "Enter a purchase price above $0."; return result; }

    const custom = inputs.costMode === "custom";
    const cases = [];
    if (custom) {
      // Your costs are what you enter: an empty field is $0 / 0%, never a hidden FlipForge default.
      const feeBps = Math.min(5000, Math.max(0, int(inputs.feeBps) ?? 0));
      const outbound = boundedCents(inputs.outboundShippingCents) || 0;
      const other = boundedCents(inputs.otherCostsCents) || 0;
      const sellingCosts = Math.round((model.supportedCents * feeBps) / 10000) + outbound + other;
      const netExit = Math.max(0, model.supportedCents - sellingCosts);
      cases.push({ key: "custom", label: "At the supported value, after your costs", netExitCents: netExit, sellingCostsCents: sellingCosts });
    } else {
      cases.push({ key: "expected", label: "Base case", netExitCents: model.netExit.expected });
      if (model.netExit.conservative !== null) cases.push({ key: "conservative", label: "Cautious case", netExitCents: model.netExit.conservative });
      if (model.netExit.stress !== null) cases.push({ key: "stress", label: "Downside", netExitCents: model.netExit.stress });
    }
    for (const entry of cases) {
      entry.profitCents = entry.netExitCents - purchaseCents;
      entry.roiBp = roiBp(entry.profitCents, purchaseCents);
      entry.savedProfitCents = custom ? null : model.net[entry.key];
    }
    const lead = cases[0];
    const targetProfit = boundedCents(inputs.targetProfitCents);
    const targetRoi = int(inputs.targetRoiBps);
    const targetLimits = [];
    if (targetProfit !== null && targetProfit > 0) targetLimits.push(Math.max(0, lead.netExitCents - targetProfit));
    if (targetRoi !== null && targetRoi > 0 && targetRoi <= 50000) targetLimits.push(floorForRoi(lead.netExitCents, targetRoi));

    return {
      available: true,
      blocked: "",
      simulation: true,
      verdict: null,
      costMode: custom ? "custom" : "reserves",
      purchaseCents,
      savedAskCents: model.askCents,
      priceChangeCents: purchaseCents - model.askCents,
      vsMaxBuyCents: model.maxBuyCents === null ? null : purchaseCents - model.maxBuyCents,
      breakEvenCents: lead.netExitCents > 0 ? lead.netExitCents : null,
      targetLimitCents: targetLimits.length ? Math.min(...targetLimits) : null,
      cases
    };
  }

  /**
   * Exit Difficulty from the engine's governed liquidity rule (ProfitabilityGuardrailService.liquidityForAcceptedEvidence:
   * ≥5 exact sales → 75, ≥3 → 65, ≥1 → 55, else 35) and the slippage reserve the engine applies for that band. It is a
   * count-of-exact-sales measure, not buyer demand or time to sell, and is never favourable by default:
   *  - no saved exact-sale count, or a legacy result → "Not established";
   *  - a saved liquidity that disagrees with the engine's band for the saved count → "Not established" (contradiction);
   *  - the opportunity-level liquidity field (may default to 50) is ignored.
   */
  const LIQUIDITY_BANDS = Object.freeze([
    { min: 5, liquidity: 75, level: "lower", label: "Lower", slippageBps: 150 },
    { min: 3, liquidity: 65, level: "moderate", label: "Moderate", slippageBps: 150 },
    { min: 1, liquidity: 55, level: "higher", label: "Higher", slippageBps: 300 },
    { min: 0, liquidity: 35, level: "high", label: "High", slippageBps: 500 }
  ]);
  function exitDifficulty(model) {
    const none = reason => ({ established: false, level: "unknown", label: "Not established", detail: reason, source: "" });
    if (!model || model.legacy) return none("This result was saved before current evidence rules.");
    if (model.exactSales === null || model.exactSales < 0) return none("The saved decision did not record how many exact sales it used.");
    const band = LIQUIDITY_BANDS.find(entry => model.exactSales >= entry.min);
    if (model.savedLiquidity !== null && model.savedLiquidity !== undefined && model.savedLiquidity !== band.liquidity) {
      return none("The saved liquidity and the saved exact-sale count disagree, so no exit estimate is shown.");
    }
    const basis = `${model.exactSales} exact completed sale${model.exactSales === 1 ? "" : "s"} accepted at decision`;
    return {
      established: true,
      level: band.level,
      label: band.label,
      liquidity: band.liquidity,
      slippageBps: band.slippageBps,
      detail: `${basis}; FlipForge reserves ${(band.slippageBps / 100).toFixed(band.slippageBps % 100 ? 2 : 0)}% for price slippage when selling. Based on sales count only, not buyer demand or time to sell.`,
      source: model.savedLiquidity !== null && model.savedLiquidity !== undefined ? "Saved profitability assessment" : "Engine rule on the saved exact-sale count"
    };
  }

  /** Evidence & risk against the engine's published BUY bar (≥3 exact sales, confidence ≥75, risk ≤55). Not a score. */
  function evidenceStrength(model) {
    if (!model || model.legacy) return { met: false, label: "Not current", detail: "Saved before current evidence rules." };
    const misses = [];
    if (model.exactSales === null || model.exactSales < 3) misses.push(model.exactSales ? `only ${model.exactSales} exact sale${model.exactSales === 1 ? "" : "s"}` : "no exact sales");
    if (model.confidence === null || model.confidence < 75) misses.push(model.confidence === null ? "confidence not recorded" : `confidence ${model.confidence}/100`);
    if (model.risk === null || model.risk > 55) misses.push(model.risk === null ? "risk not recorded" : `risk ${model.risk}/100`);
    return misses.length
      ? { met: false, label: "Below the evidence bar", detail: `${misses.join(" · ").replace(/^./, c => c.toUpperCase())}. A BUY needs at least 3 exact sales, confidence 75+ and risk 55 or less.` }
      : { met: true, label: "Meets the evidence bar", detail: `${model.exactSales} exact sales · confidence ${model.confidence}/100 · risk ${model.risk}/100.` };
  }

  /** One-line verdict framing from saved facts only. */
  function headline(model) {
    const over = model.headroomCents !== null && model.headroomCents < 0 ? money(-model.headroomCents) : "";
    switch (model.verdict) {
      case "BUY": return model.headroomCents !== null ? `The all-in price is ${money(model.headroomCents)} inside the evidence-supported buying limit.` : "The saved evidence and price support this BUY.";
      case "WATCH":
        if (over) return `The all-in price is ${over} above the evidence-supported buying limit.`;
        if (model.profitabilityCappedBuy && model.gateStatus === "MARGIN_OF_SAFETY_NOT_MET") return "Profit protection held this back: too little cushion if prices drop.";
        return "The price is not the only issue — evidence or risk is not strong enough for a BUY yet.";
      case "VERIFY": return model.maxBuyCents !== null
        ? "Verify before you rely on this price. The buying limit is for reference until the evidence clears."
        : "Verify before you rely on any price. FlipForge will not set a buying limit yet.";
      case "PASS": return over ? `The economics do not work: ${over} above the buying limit.` : "The economics do not work at this price.";
      default: return "No customer-facing decision was returned for this card.";
    }
  }

  function checks(model) {
    const rows = [];
    // 1. Identity
    if (model.legacy) rows.push({ key: "identity", label: "Exact card", status: "warn", value: "Legacy result", note: model.legacyNotice || "Saved before current evidence rules." });
    else if (model.identityIssues.length) rows.push({ key: "identity", label: "Exact card", status: "warn", value: "Card match needs checking", note: model.identityIssues[0] });
    else if (model.mappingState === "CONFIRMED") rows.push({ key: "identity", label: "Exact card", status: "pass", value: "Card match confirmed", note: "The saved identity is matched to one exact card before evidence counts." });
    else if (model.governedAvailable && model.verdict && model.verdict !== "VERIFY") rows.push({ key: "identity", label: "Exact card", status: "pass", value: "Exact-card checks passed", note: "FlipForge's exact-card checks passed when this decision was saved." });
    else rows.push({ key: "identity", label: "Exact card", status: "warn", value: "See the verification checklist", note: "Confirm the exact set, number, parallel and grade before relying on the price." });
    // 2. Evidence
    const sales = model.exactSales;
    const excluded = model.excludedCount !== null && model.excludedCount > 0 ? ` · ${model.excludedCount} not counted` : "";
    if (sales === null) rows.push({ key: "evidence", label: "Evidence", status: "warn", value: NOT_ESTABLISHED, note: "The saved decision did not record its exact-sale count." });
    else if (sales >= 3) rows.push({ key: "evidence", label: "Evidence", status: "pass", value: `${sales} exact sales accepted${excluded}`, note: "Reported completed sales matched to this exact card." });
    else if (sales > 0) rows.push({ key: "evidence", label: "Evidence", status: "warn", value: `${sales} exact sale${sales === 1 ? "" : "s"} accepted${excluded}`, note: "A BUY needs at least 3 accepted exact sales." });
    else rows.push({ key: "evidence", label: "Evidence", status: "fail", value: `No exact sales accepted${excluded}`, note: "No supported value without exact completed-sale evidence." });
    // 3. Economics
    if (model.maxBuyCents === null) rows.push({ key: "economics", label: "Economics", status: model.verdict === "VERIFY" ? "warn" : "neutral", value: "Max Buy not calculated", note: model.supportedCents === null ? "There is no supported value to calculate from." : "The saved decision did not record a buying limit." });
    else if (model.headroomCents === null) rows.push({ key: "economics", label: "Economics", status: "neutral", value: `Max Buy ${money(model.maxBuyCents)}`, note: "The saved decision did not record its all-in price, so no comparison is made." });
    else if (model.verdict === "VERIFY") rows.push({ key: "economics", label: "Economics", status: "warn", value: `${money(Math.abs(model.headroomCents))} ${model.headroomCents >= 0 ? "under" : "over"} Max Buy`, note: "Reference only: the evidence requirements must clear before price decides anything." });
    else if (model.headroomCents >= 0) rows.push({ key: "economics", label: "Economics", status: "pass", value: `${money(model.headroomCents)} under Max Buy`, note: "The all-in price keeps the required profit and price-drop cushion." });
    else rows.push({ key: "economics", label: "Economics", status: "fail", value: `${money(-(model.headroomCents ?? 0))} over Max Buy`, note: "Paying this much gives up FlipForge's profit protection." });
    // 4. Risk
    if (model.risk !== null) rows.push({ key: "risk", label: "Risk", status: model.risk <= 55 ? "pass" : model.risk >= 70 ? "fail" : "warn", value: `${model.risk}/100${model.confidence !== null ? ` · confidence ${model.confidence}/100` : ""}`, note: "A BUY needs risk at or below 55 and confidence at or above 75." });
    return rows;
  }

  function changeConditions(model) {
    const out = [];
    const seen = new Set();
    const add = (value, source) => {
      const clean = text(value);
      if (!clean || seen.has(clean.toLowerCase())) return;
      seen.add(clean.toLowerCase());
      out.push({ text: clean, source });
    };
    const evidenceFirst = model.verdict === "VERIFY" || model.gateStatus === "VERIFY_REQUIRED" || model.supportedCents === null;
    if (evidenceFirst) {
      const need = model.missingRequirement && !/^none\b/i.test(model.missingRequirement) ? model.missingRequirement : "stronger exact-card evidence";
      add(`A lower price alone will not change this decision. FlipForge first needs ${need}.`, "receipt");
    } else if (model.maxBuyCents !== null && model.headroomCents !== null && model.headroomCents < 0) {
      add(`An all-in price at or below ${money(model.maxBuyCents)} would be inside the buying limit${model.verdict === "PASS" || model.verdict === "WATCH" ? " (other BUY checks still apply)" : ""}.`, "receipt");
    }
    // The saved price analysis runs the base engine only (before profit protection). It adds information only when it
    // is stricter than Max Buy; otherwise Max Buy is the price condition and repeating a higher figure would confuse.
    const buyAt = model.priceThresholds.buyAtOrBelowCents;
    if (model.priceThresholds.available && buyAt !== null && model.verdict !== "BUY" && !evidenceFirst && (model.maxBuyCents === null || buyAt < model.maxBuyCents)) {
      add(`FlipForge's saved price analysis reaches BUY on evidence only at or below ${money(buyAt)}.`, "price-analysis");
    }
    model.whatWouldChange.forEach(entry => add(entry, "receipt"));
    if (model.identityIssues.length && !model.legacy) add("Confirming the exact card match.", "receipt");
    return out.slice(0, 5);
  }

  function risks(model) {
    const out = [];
    if (model.legacy) out.push("Saved before current evidence rules — not presented as currently supported.");
    if (model.profitabilityCappedBuy) {
      out.push(model.gateStatus === "MARGIN_OF_SAFETY_NOT_MET"
        ? "Profit protection applied: some profit scenarios were positive, but the cushion against a price drop was too thin."
        : model.gateStatus === "NEGATIVE_NET_ECONOMICS"
          ? "Profit protection applied: modeled profit after costs is negative at this price."
          : "Profit protection applied: identity, evidence or quality checks for a BUY were not all met.");
    }
    if (model.risk !== null && model.risk >= 70) out.push(`High decision risk (${model.risk}/100).`);
    if (model.exactSales !== null && model.exactSales < 3) out.push(model.exactSales === 0 ? "No accepted exact sales." : `Thin evidence: ${model.exactSales} accepted exact sale${model.exactSales === 1 ? "" : "s"}.`);
    if (model.excludedCount !== null && model.excludedCount > 0) out.push(`${model.excludedCount} sale${model.excludedCount === 1 ? " was" : "s were"} not counted (wrong card, grade or parallel, duplicates, outliers or held for review).`);
    if (/STALE/.test(model.freshness)) out.push("Evidence is stale — prices may have moved since these sales.");
    if (model.net.stress !== null && model.net.stress < 0) out.push(`Downside case loses ${money(-model.net.stress)} at the saved price.`);
    if (model.identityIssues.length) out.push(`Card match needs checking: ${model.identityIssues[0]}`);
    out.push("Selling costs are FlipForge policy reserves, not your marketplace's exact fees.");
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */

  function ladder(model, extra = null) {
    const marks = [];
    if (model.maxBuyCents !== null && model.maxBuyCents > 0) marks.push({ key: "maxbuy", label: "Max Buy", cents: model.maxBuyCents });
    const breakEven = extra && extra.breakEvenCents !== undefined ? extra.breakEvenCents : model.breakEvenCents;
    if (breakEven !== null) marks.push({ key: "breakeven", label: extra && extra.breakEvenLabel ? extra.breakEvenLabel : "Break-even", cents: breakEven });
    if (model.supportedCents !== null) marks.push({ key: "supported", label: "Supported value", cents: model.supportedCents });
    if (model.askCents !== null) marks.push({ key: "ask", label: extra ? "Saved ask" : "Asking (all-in)", cents: model.askCents });
    if (extra && extra.cents > 0) marks.push({ key: "sim", label: "Simulated", cents: extra.cents });
    if (marks.length < 2 || model.maxBuyCents === null) return "";
    const values = marks.map(mark => mark.cents);
    const lo = Math.max(0, Math.min(...values) * 0.82);
    const hi = Math.max(...values) * 1.06;
    const pos = cents => Math.max(0, Math.min(100, ((cents - lo) / (hi - lo || 1)) * 100));
    const maxPos = pos(model.maxBuyCents);
    const bePos = breakEven !== null ? pos(breakEven) : maxPos;
    const top = marks.filter(mark => mark.key === "ask" || mark.key === "sim");
    const bottom = marks.filter(mark => mark.key !== "ask" && mark.key !== "sim");
    const pin = (mark, row) => `<span class="ffdc-pin" data-mark="${mark.key}" data-row="${row}" style="--x:${pos(mark.cents).toFixed(2)}%"><span class="ffdc-pin-label">${escapeHtml(mark.label)}</span><strong>${escapeHtml(money(mark.cents))}</strong></span>`;
    return `<figure class="ffdc-ladder" data-ffdc-ladder aria-label="Price ladder: asking price against Max Buy, break-even and supported value">
      <div class="ffdc-ladder-row ffdc-ladder-top">${top.map(mark => pin(mark, "top")).join("")}</div>
      <div class="ffdc-ladder-track" aria-hidden="true">
        <span class="ffdc-zone" data-zone="buy" style="left:0;width:${maxPos.toFixed(2)}%"></span>
        <span class="ffdc-zone" data-zone="thin" style="left:${maxPos.toFixed(2)}%;width:${Math.max(0, bePos - maxPos).toFixed(2)}%"></span>
        <span class="ffdc-zone" data-zone="loss" style="left:${bePos.toFixed(2)}%;width:${Math.max(0, 100 - bePos).toFixed(2)}%"></span>
        ${marks.map(mark => `<span class="ffdc-tick" data-mark="${mark.key}" style="--x:${pos(mark.cents).toFixed(2)}%"></span>`).join("")}
      </div>
      <div class="ffdc-ladder-row ffdc-ladder-bottom">${bottom.map(mark => pin(mark, "bottom")).join("")}</div>
      <figcaption class="ffdc-ladder-key">
        <span data-zone="buy">Inside buying limit</span>
        <span data-zone="thin">Profitable but under-protected</span>
        <span data-zone="loss">Base case loses money</span>
      </figcaption>
    </figure>`;
  }

  function figure(label, value, note = "", tone = "") {
    return `<div class="ffdc-figure"${tone ? ` data-tone="${tone}"` : ""}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ""}</div>`;
  }

  function economicsTable(model) {
    const rows = [["Base case", "expected"], ["Cautious case", "conservative"], ["Downside", "stress"]];
    if (rows.every(([, key]) => model.net[key] === null)) {
      return `<p class="ffdc-muted">Profit and ROI were not calculated for this decision${model.supportedCents === null ? " because no supported value is established" : ""}.</p>`;
    }
    return `<table class="ffdc-table" data-ffdc-economics>
      <thead><tr><th scope="col">If it sells at…</th><th scope="col">Net proceeds</th><th scope="col">Profit after costs</th><th scope="col">ROI</th></tr></thead>
      <tbody>${rows.map(([label, key]) => `<tr data-negative="${model.net[key] !== null && model.net[key] < 0}"><th scope="row">${escapeHtml(label)}</th>
        <td>${escapeHtml(money(model.netExit[key], NOT_CALCULATED))}</td><td>${escapeHtml(signedMoney(model.net[key]))}</td><td>${escapeHtml(percentFromBp(model.roi[key]))}</td></tr>`).join("")}</tbody>
    </table>
    <p class="ffdc-muted">Modeled estimates at the saved all-in price of ${escapeHtml(money(model.askCents))}. Net proceeds are after FlipForge's selling reserves (fees ${POLICY.sellingFeeReserveBps / 100}%, returns ${POLICY.lossReturnReserveBps / 100}%, insurance ${POLICY.insuranceReserveBps / 100}%, price slippage and ${money(POLICY.outboundShippingReserveCents)} shipping). Cautious and downside cases apply evidence and stress haircuts. Not a guarantee.</p>`;
  }

  function reasoningMarkup(model) {
    if (model.maxBuyCents === null) {
      return `<p>${model.supportedCents === null ? "No Max Buy is set because no evidence-supported value is established. FlipForge will not set a buying limit from an asking price." : "The saved decision did not record a Max Buy."}</p>`;
    }
    const reasoning = maxBuyReasoning(model);
    if (!reasoning.reproduced) {
      return `<p>Max Buy is the lowest of four limits: a ${POLICY.minExpectedRoiBps / 100}% base-case return, a ${POLICY.minConservativeRoiBps / 100}% cautious-case return, no loss in the downside case and at least ${escapeHtml(money(POLICY.minExpectedProfitCents))} base-case profit. The saved receipt does not include enough detail to show which limit set this one.</p>`;
    }
    return `<p>Max Buy is the most you can pay and still meet all four of FlipForge's profit-protection limits. The lowest limit sets it:</p>
      <ol class="ffdc-limits">${reasoning.limits.map(limit => `<li data-binding="${limit.key === reasoning.binding}"><span>${escapeHtml(limit.label)}</span><strong>${escapeHtml(money(limit.cents))}</strong>${limit.key === reasoning.binding ? '<em>Sets Max Buy</em>' : ""}</li>`).join("")}</ol>`;
  }

  function historyMarkup(model) {
    if (!model.timeline.length && model.snapshotCount !== null && model.snapshotCount > 1) return `<p class="ffdc-muted">This card has ${model.snapshotCount} saved receipts, but their history could not be loaded right now. Each receipt stays frozen as evaluated.</p>`;
    if (!model.timeline.length) return `<p class="ffdc-muted">No earlier saved evaluations of this card. Re-evaluating later adds a new receipt beside this one; this receipt never changes.</p>`;
    return `<ol class="ffdc-history">${model.timeline.slice().reverse().slice(0, 8).map(entry => `<li>
        <span class="ffdc-chip" data-verdict="${escapeHtml((entry.decision || "none").toLowerCase())}">${escapeHtml(entry.decision || "—")}</span>
        <div><strong>${escapeHtml(dateText(entry.evaluatedAt) || "Date not recorded")}</strong>
        <span>All-in ${escapeHtml(money(entry.allInAskCents, "—"))} · Max Buy ${escapeHtml(money(entry.maximumBuyPriceCents, "Not set"))} · ${escapeHtml(entry.acceptedEvidenceCount === null ? "—" : `${entry.acceptedEvidenceCount} exact sales`)}</span>
        ${entry.whatChanged.length ? `<small>${escapeHtml(entry.whatChanged.slice(0, 2).join(" · "))}</small>` : ""}</div></li>`).join("")}</ol>
      <p class="ffdc-muted">Each evaluation is a separate frozen receipt. Earlier receipts are never rescored.</p>`;
  }

  function receiptMarkup(model) {
    const assumptions = [
      ["Purchase cost", model.askFromSnapshot ? `${money(model.askCents)} all-in (item, shipping, tax and premium as saved)` : NOT_ESTABLISHED],
      ["Selling fee reserve", `${POLICY.sellingFeeReserveBps / 100}% of sale price`],
      ["Returns and insurance", `${(POLICY.lossReturnReserveBps + POLICY.insuranceReserveBps) / 100}% of sale price`],
      ["Outbound shipping", money(POLICY.outboundShippingReserveCents)],
      ["Price slippage", "0.75%–5% depending on how many exact sales exist"],
      ["Minimum profit kept", `${money(POLICY.minExpectedProfitCents)} and a ${POLICY.minExpectedRoiBps / 100}% return`]
    ];
    const evidenceRows = [
      ["Exact sales behind this decision", model.exactSales === null ? NOT_ESTABLISHED : String(model.exactSales)],
      ["Sales saved for this card now", model.currentSavedSales === null ? "—" : String(model.currentSavedSales)],
      ["Not counted", model.excludedCount === null ? "Not reported" : String(model.excludedCount)]
    ];
    return `<section class="ffdc-receipt" data-ffdc-receipt aria-labelledby="ffdc-receipt-title">
      <header class="ffdc-receipt-head">
        <div><span class="ffdc-kicker">Decision Receipt Pro™</span><h3 id="ffdc-receipt-title">${model.maxBuyCents === null ? "What this decision is based on" : "Why the buying limit is what it is"}</h3></div>
        <dl class="ffdc-receipt-meta">
          <div><dt>Evaluated</dt><dd>${escapeHtml(dateText(model.evaluatedAt) || "Not recorded")}</dd></div>
          <div><dt>Receipt</dt><dd>${escapeHtml(model.receiptVersion || "—")}${model.immutable ? " · frozen" : ""}</dd></div>
          <div><dt>Saved evaluations</dt><dd>${escapeHtml(model.snapshotCount === null ? "—" : String(model.snapshotCount))}</dd></div>
        </dl>
      </header>
      <div class="ffdc-receipt-grid">
        <article><h4>Max Buy reasoning</h4>${reasoningMarkup(model)}</article>
        <article><h4>Evidence accepted vs. not counted</h4>
          <dl class="ffdc-dl">${evidenceRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
          ${model.excludedReasons.length ? `<p class="ffdc-muted">Not counted because: ${escapeHtml(model.excludedReasons.join(", "))}.</p>` : ""}
          <p class="ffdc-muted">Only reported completed sales matched to this exact card, grade and parallel count. Active listings and asking prices never count as evidence. Individual sale details are on the evidence page when your data licence allows.</p>
          ${SAFE_ID.test(model.id) ? `<a class="ffdc-link" href="#/evidence/${encodeURIComponent(model.id)}">Open the evidence page →</a>` : ""}
        </article>
        <article><h4>Economic assumptions</h4><dl class="ffdc-dl">${assumptions.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
          <p class="ffdc-muted">Policy reserves, not your marketplace's exact fees. Use Scenario Lab to try your own costs.</p></article>
        <article><h4>Principal risks and uncertainty</h4><ul class="ffdc-list">${risks(model).map(entry => `<li>${escapeHtml(entry)}</li>`).join("")}</ul></article>
        <article class="ffdc-receipt-wide"><h4>Decision history</h4>${historyMarkup(model)}</article>
      </div>
      <footer class="ffdc-receipt-foot">
        <p>Decision support only. Not financial advice. FlipForge does not buy, sell or bid for you. This receipt is frozen as evaluated and is not rescored.</p>
        <button type="button" class="ffdc-button ffdc-button-quiet" data-ffdc-print>Print or save receipt</button>
      </footer>
    </section>`;
  }

  function labMarkup(model) {
    const blocked = scenario(model, {}).blocked;
    const dollars = cents => (cents === null || cents === undefined ? "" : (cents / 100).toFixed(2));
    return `<details class="ffdc-lab" data-ffdc-lab${state.labOpen ? " open" : ""}>
      <summary><span class="ffdc-kicker">Decision Scenario Lab™</span><strong>Try a different price or your own selling costs</strong><small>Simulation only — your saved decision never changes.</small></summary>
      ${blocked ? `<div class="ffdc-lab-blocked" data-ffdc-lab-blocked><strong>Simulation unavailable</strong><p>${escapeHtml(blocked)}</p></div>` : `
      <div class="ffdc-lab-body">
        <form class="ffdc-lab-form" data-ffdc-lab-form novalidate>
          <fieldset><legend>Your purchase</legend>
            <label>All-in price ($)<input inputmode="decimal" name="price" value="${escapeHtml(dollars(model.askCents))}" aria-describedby="ffdc-item-note"></label>
            <small id="ffdc-item-note">Starts at the saved all-in price of ${escapeHtml(money(model.askCents))}, which already includes shipping and tax.</small>
            <label>Extra shipping to you ($)<input inputmode="decimal" name="inbound" value="0.00"></label>
            <label>Extra tax or buyer premium ($)<input inputmode="decimal" name="tax" value="0.00"></label>
          </fieldset>
          <fieldset><legend>Selling costs</legend>
            <div class="ffdc-segment" role="radiogroup" aria-label="Selling cost basis">
              <label><input type="radio" name="mode" value="reserves" checked> FlipForge reserves</label>
              <label><input type="radio" name="mode" value="custom"> My own costs</label>
            </div>
            <div class="ffdc-custom" data-ffdc-custom hidden>
              <label>Selling fees (%)<input inputmode="decimal" name="fee" value="${(POLICY.sellingFeeReserveBps / 100).toFixed(2)}"></label>
              <label>Shipping to buyer ($)<input inputmode="decimal" name="outbound" value="${(POLICY.outboundShippingReserveCents / 100).toFixed(2)}"></label>
              <label>Other costs ($)<input inputmode="decimal" name="other" value="0.00"></label>
            </div>
          </fieldset>
          <fieldset><legend>Your target (optional)</legend>
            <label>Profit you want ($)<input inputmode="decimal" name="targetProfit" placeholder="e.g. 50"></label>
            <label>Return you want (%)<input inputmode="decimal" name="targetRoi" placeholder="e.g. 20"></label>
          </fieldset>
          <button type="reset" class="ffdc-button ffdc-button-quiet">Reset to saved receipt</button>
        </form>
        <div class="ffdc-lab-out" data-ffdc-lab-out aria-live="polite"></div>
      </div>`}
    </details>`;
  }

  function labOutputMarkup(model, sim) {
    if (!sim.available) return `<div class="ffdc-lab-blocked"><strong>Simulation unavailable</strong><p>${escapeHtml(sim.blocked)}</p></div>`;
    const vs = sim.vsMaxBuyCents;
    const vsText = vs === null ? "No saved Max Buy to compare" : vs <= 0 ? `${money(-vs)} under the saved Max Buy` : `${money(vs)} over the saved Max Buy`;
    return `<div class="ffdc-sim-banner" data-ffdc-simulation>SIMULATION · not a FlipForge decision · nothing is saved</div>
      ${ladder(model, sim.costMode === "custom" ? { cents: sim.purchaseCents, breakEvenCents: sim.breakEvenCents, breakEvenLabel: "Your break-even" } : { cents: sim.purchaseCents })}
      <div class="ffdc-figures ffdc-figures-sim">
        ${figure("Simulated all-in cost", money(sim.purchaseCents), sim.priceChangeCents === 0 ? "Same as saved receipt" : `${signedMoney(sim.priceChangeCents)} vs. saved receipt`)}
        ${figure("Against saved Max Buy", vsText, "", vs === null ? "" : vs <= 0 ? "inside" : "over")}
        ${figure(sim.costMode === "custom" ? "Break-even with your costs" : "Break-even buy price", money(sim.breakEvenCents, NOT_CALCULATED), "Pay more and the base case loses money")}
        ${sim.targetLimitCents !== null ? figure("Most you could pay for your target", money(sim.targetLimitCents), "Your target, not FlipForge's Max Buy") : ""}
      </div>
      <table class="ffdc-table" data-ffdc-sim-table>
        <thead><tr><th scope="col">${sim.costMode === "custom" ? "Your costs" : "If it sells at…"}</th><th scope="col">Simulated profit</th><th scope="col">ROI</th>${sim.costMode === "custom" ? "" : '<th scope="col">Saved receipt</th>'}</tr></thead>
        <tbody>${sim.cases.map(entry => `<tr data-negative="${entry.profitCents < 0}"><th scope="row">${escapeHtml(entry.label)}</th><td>${escapeHtml(signedMoney(entry.profitCents))}</td><td>${escapeHtml(percentFromBp(entry.roiBp))}</td>${sim.costMode === "custom" ? "" : `<td>${escapeHtml(signedMoney(entry.savedProfitCents))}</td>`}</tr>`).join("")}</tbody>
      </table>
      <p class="ffdc-muted">${sim.costMode === "custom"
        ? `Your costs are applied to the saved supported value of ${escapeHtml(money(model.supportedCents))}: ${escapeHtml(money(sim.cases[0].sellingCostsCents))} in selling costs. Base case only — cautious and downside haircuts are not applied to your costs.`
        : "Uses the saved net proceeds for each case, so only your purchase cost changes."} The saved verdict, evidence and Max Buy are unchanged; a simulation never produces BUY, WATCH, VERIFY or PASS.</p>`;
  }

  function summaryMarkup(model) {
    const exit = exitDifficulty(model);
    const evidence = evidenceStrength(model);
    const base = model.net.expected;
    const range = [["Cautious", model.net.conservative], ["Downside", model.net.stress]].filter(([, cents]) => cents !== null).map(([label, cents]) => `${label} ${signedMoney(cents)}`).join(" · ");
    const profit = base === null
      ? figure("Potential profit", NOT_CALCULATED, model.supportedCents === null ? "No supported value to model from" : "Not recorded for this decision")
      : figure("Potential profit", signedMoney(base), `${range ? `${range} · ` : ""}modeled after costs at the saved price, not guaranteed`, base < 0 ? "over" : "");
    return `<div class="ffdc-figures ffdc-summary" data-ffdc-summary aria-label="Decision summary">
        ${profit}
        <div class="ffdc-figure" data-ffdc-exit="${escapeHtml(exit.level)}"><span>Exit difficulty</span><strong>${escapeHtml(exit.label)}</strong><small>${escapeHtml(exit.detail)}</small></div>
        <div class="ffdc-figure" data-ffdc-evidence="${evidence.met}"><span>Evidence &amp; risk</span><strong>${escapeHtml(evidence.label)}</strong><small>${escapeHtml(evidence.detail)}</small></div>
      </div>`;
  }

  function dealCheckMarkup(model) {
    const verdict = model.verdict || "NONE";
    const tone = verdict.toLowerCase();
    const headroom = model.headroomCents;
    const diff = headroom === null ? NOT_CALCULATED : headroom >= 0 ? `${money(headroom)} under` : `${money(-headroom)} over`;
    const conditions = changeConditions(model);
    return `<section class="ffdc" ${SECTION_ATTR}="${escapeHtml(model.id)}" data-ffdc-version="${VERSION}" data-verdict="${escapeHtml(tone)}" aria-labelledby="ffdc-title">
      <header class="ffdc-head">
        <div class="ffdc-head-copy">
          <span class="ffdc-kicker">FlipForge Deal Check™</span>
          <h2 id="ffdc-title"><span class="ffdc-verdict" data-verdict="${escapeHtml(tone)}">${escapeHtml(model.verdict || "—")}</span><span class="ffdc-headline">${escapeHtml(headline(model))}</span></h2>
          <p class="ffdc-reason">${escapeHtml(model.reason || "The saved decision did not include a written reason.")}</p>
        </div>
      </header>
      <div class="ffdc-figures" data-ffdc-figures>
        ${figure("Asking (all-in)", money(model.askCents), model.askFromSnapshot ? "As evaluated, incl. shipping and tax" : "Listing price")}
        ${figure("Max Buy", money(model.maxBuyCents, model.supportedCents === null ? "Not set" : NOT_CALCULATED), "Evidence-supported buying limit", "gold")}
        ${figure("Difference", diff, headroom === null ? "" : "Asking vs. Max Buy", headroom === null ? "" : headroom >= 0 ? "inside" : "over")}
      </div>
      ${summaryMarkup(model)}
      ${ladder(model)}
      <div class="ffdc-grid">
        <article class="ffdc-checks" aria-label="Decision checks">
          <h3>How FlipForge got here</h3>
          <ol>${checks(model).map(row => `<li data-status="${row.status}" data-ffdc-check="${row.key}"><span class="ffdc-check-dot" aria-hidden="true"></span><div><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong><small>${escapeHtml(row.note)}</small></div></li>`).join("")}</ol>
        </article>
        <article class="ffdc-change" aria-label="What would change this decision">
          <h3>What would change the decision</h3>
          ${conditions.length ? `<ul class="ffdc-list">${conditions.map(entry => `<li data-source="${entry.source}">${escapeHtml(entry.text)}</li>`).join("")}</ul>` : '<p class="ffdc-muted">The saved receipt did not record a change condition.</p>'}
          ${model.nextAction ? `<p class="ffdc-next"><span>Next step</span>${escapeHtml(model.nextAction)}</p>` : ""}
        </article>
      </div>
      ${["expected", "conservative", "stress"].every(key => model.net[key] === null) ? "" : `<details class="ffdc-more" data-ffdc-economics-panel>
        <summary>Profit, ROI and break-even at the saved price</summary>
        <div class="ffdc-more-body">
          <div class="ffdc-figures">${figure("Break-even buy price", money(model.breakEvenCents, NOT_CALCULATED), "Most you could pay for $0 base-case profit")}${figure("Supported value", money(model.supportedCents), "Before selling costs")}</div>
          ${economicsTable(model)}
        </div>
      </details>`}
      ${featureAvailable("scenarioLab", state.plan) ? labMarkup(model) : ""}
      ${receiptMarkup(model)}
      <p class="ffdc-saved" data-ffdc-saved><span aria-hidden="true">✓</span> Saved to your decisions${model.evaluatedAt ? ` · evaluated ${escapeHtml(dateText(model.evaluatedAt))}` : ""}. Re-evaluating creates a new receipt; this one stays as it is.</p>
    </section>`;
  }

  /* ------------------------------------------------------------------ *
   * Runtime
   * ------------------------------------------------------------------ */

  const state = { id: "", model: null, loading: "", error: null, labOpen: false, labValues: null, plan: null, serial: 0, scheduled: false, observer: null };

  /** Pure activation rule (exported for tests): preview/localhost on; goflipforge.com app paths only with ?dealcheck=1. */
  function enabledFor(location, disabled = false) {
    if (disabled === true || !location) return false;
    const host = String(location.hostname || "");
    if (PREVIEW_HOST.test(host)) return true;
    if (PRODUCTION_HOST.test(host) && APP_PATH.test(String(location.pathname || ""))) {
      return /(?:^\?|&)dealcheck=1(?:&|$)/.test(String(location.search || ""));
    }
    return false;
  }
  function enabled() {
    return typeof window !== "undefined" && enabledFor(window.location, window.FlipForgeDealCheckDisabled);
  }
  function routeId() {
    const match = String(window.location.hash || "").match(/^#\/?opportunities\/([^/?#]+)/);
    if (!match) return "";
    let id = match[1];
    try { id = decodeURIComponent(id); } catch (_) { /* keep raw */ }
    return SAFE_ID.test(id) ? id : "";
  }
  function correlationId() {
    return window.crypto && typeof window.crypto.randomUUID === "function" ? window.crypto.randomUUID() : `deal-check-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  async function getJson(path) {
    const id = correlationId();
    const response = await fetch(path, { method: "GET", headers: { Accept: "application/json", "X-Correlation-Id": id }, credentials: "same-origin", cache: "no-store", redirect: "error" });
    const body = await response.text();
    if (body.length > MAX_RESPONSE_CHARACTERS) throw Object.assign(new Error("Response too large."), { code: "DEAL_CHECK_RESPONSE_TOO_LARGE" });
    let payload;
    try { payload = body ? JSON.parse(body) : {}; } catch (_) { throw Object.assign(new Error("Invalid JSON."), { code: "DEAL_CHECK_INVALID_JSON" }); }
    if (!response.ok) throw Object.assign(new Error("Request failed."), { code: payload?.error?.code || "DEAL_CHECK_REQUEST_FAILED", status: response.status });
    const meta = payload && payload.meta;
    if (!meta || meta.contractVersion !== CONTRACT_VERSION || meta.authority !== "Smart Opportunity" || meta.correlationId !== id || !payload.data) {
      throw Object.assign(new Error("Response failed the FlipForge contract."), { code: "DEAL_CHECK_CONTRACT_INVALID" });
    }
    return payload.data;
  }

  async function load(id) {
    const serial = ++state.serial;
    state.loading = id;
    state.error = null;
    const encoded = encodeURIComponent(id);
    const [detail, timeline] = await Promise.allSettled([getJson(`/api/v1/opportunities/${encoded}`), getJson(`/api/v1/lifecycle/${encoded}`)]);
    if (serial !== state.serial) return;
    state.loading = "";
    state.id = id;
    if (detail.status !== "fulfilled" || String(detail.value?.opportunity?.id || "") !== id || detail.value?.kind !== "opportunity-detail") {
      state.model = null;
      state.error = detail.status === "rejected" ? detail.reason : new Error("Saved decision did not match.");
      return;
    }
    state.model = dealModel(detail.value, timeline.status === "fulfilled" ? timeline.value : null);
    state.labOpen = false;
    state.labValues = null;
  }

  function anchor(main) {
    return main.querySelector(".customer-intelligence-hero[data-ff-card-id]") || main.querySelector(".customer-intelligence-hero");
  }

  function readLabInputs(form) {
    const value = name => {
      // querySelector, not form.elements[name]: a control named like a collection method (e.g. "item") is shadowed.
      const field = form.querySelector(`[name="${name}"]`);
      if (!field) return null;
      const raw = String(field.value || "").replace(/[$,\s%]/g, "");
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };
    const cents = name => { const v = value(name); return v === null ? null : Math.round(v * 100); };
    const priceField = form.querySelector('[name="price"]');
    const priceRaw = priceField ? String(priceField.value || "").replace(/[$,\s]/g, "") : "";
    const priceValue = priceRaw && /^\d+(?:\.\d{0,2})?$/.test(priceRaw) ? Math.round(Number(priceRaw) * 100) : "invalid";
    const bps = name => { const v = value(name); return v === null ? null : Math.round(v * 100); };
    const mode = form.querySelector('input[name="mode"]:checked');
    return {
      itemCents: priceValue, inboundShippingCents: cents("inbound"), taxCents: cents("tax"),
      costMode: mode ? mode.value : "reserves", feeBps: bps("fee"), outboundShippingCents: cents("outbound"),
      otherCostsCents: cents("other"), targetProfitCents: cents("targetProfit"), targetRoiBps: bps("targetRoi")
    };
  }

  // Delegated handlers: other renderers may re-serialize the page, which drops element listeners. Delegation on the
  // document survives that, and always reads the form that is on the page now.
  function labUpdate(form) {
    const section = form.closest(`[${SECTION_ATTR}]`);
    const out = section && section.querySelector("[data-ffdc-lab-out]");
    if (!out || !state.model || section.getAttribute(SECTION_ATTR) !== state.model.id) return;
    const inputs = readLabInputs(form);
    const custom = form.querySelector("[data-ffdc-custom]");
    if (custom) custom.hidden = inputs.costMode !== "custom";
    state.labValues = [...form.elements].filter(el => el.name).map(el => [el.name, el.type === "radio" ? (el.checked ? el.value : null) : el.value]);
    out.innerHTML = labOutputMarkup(state.model, scenario(state.model, inputs));
  }

  function wireLab(section) {
    const form = section.querySelector("[data-ffdc-lab-form]");
    if (!form) return;
    if (state.labValues) {
      for (const [name, value] of state.labValues) {
        if (value === null) continue;
        form.querySelectorAll(`[name="${name}"]`).forEach(field => { if (field.type === "radio") field.checked = field.value === value; else field.value = value; });
      }
    }
    labUpdate(form);
  }

  function delegate() {
    const formOf = event => (event.target instanceof Element ? event.target.closest("[data-ffdc-lab-form]") : null);
    document.addEventListener("input", event => { const form = formOf(event); if (form) labUpdate(form); }, true);
    document.addEventListener("change", event => { const form = formOf(event); if (form) labUpdate(form); }, true);
    document.addEventListener("submit", event => { if (formOf(event)) event.preventDefault(); }, true);
    document.addEventListener("reset", event => { const form = formOf(event); if (form) { state.labValues = null; setTimeout(() => labUpdate(form), 0); } }, true);
    document.addEventListener("toggle", event => { if (event.target instanceof Element && event.target.matches("[data-ffdc-lab]")) state.labOpen = event.target.open; }, true);
    document.addEventListener("click", event => {
      const button = event.target instanceof Element ? event.target.closest("[data-ffdc-print]") : null;
      if (!button) return;
      document.documentElement.setAttribute("data-ffdc-printing", "true");
      window.print();
      setTimeout(() => document.documentElement.removeAttribute("data-ffdc-printing"), 500);
    }, true);
  }

  function apply() {
    state.scheduled = false;
    const main = document.querySelector("#main-content");
    const id = routeId();
    const existing = main ? main.querySelector(`[${SECTION_ATTR}]`) : null;
    if (!enabled() || !main || !id) { if (existing) existing.remove(); return; }
    if (existing && existing.getAttribute(SECTION_ATTR) !== id) existing.remove();
    if (state.id !== id && state.loading !== id) { load(id).then(schedule, schedule); return; }
    if (state.loading === id || !state.model || state.model.id !== id) return;
    const hero = anchor(main);
    if (!hero) return;
    const current = main.querySelector(`[${SECTION_ATTR}="${CSS.escape(id)}"]`);
    // Already on the page: never move it (other renderers also place panels near the hero; moving would ping-pong).
    if (current) return;
    const holder = document.createElement("div");
    holder.innerHTML = dealCheckMarkup(state.model);
    const section = holder.firstElementChild;
    hero.insertAdjacentElement("afterend", section);
    wireLab(section);
  }

  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    (window.requestAnimationFrame || setTimeout)(apply);
  }

  function start() {
    delegate();
    window.addEventListener("hashchange", schedule);
    state.observer = new MutationObserver(mutations => {
      // Ignore changes made inside Deal Check itself (Scenario Lab output).
      if (mutations.every(mutation => mutation.target instanceof Element && mutation.target.closest(`[${SECTION_ATTR}]`))) return;
      schedule();
    });
    const main = document.querySelector("#main-content") || document.body;
    state.observer.observe(main, { childList: true, subtree: true });
    schedule();
  }

  const api = Object.freeze({ version: VERSION, enabledFor, exitDifficulty, evidenceStrength, policy: POLICY, featureTiers: FEATURE_TIERS, featureAvailable, dealModel, maxBuyReasoning, scenario, headline, checks, changeConditions, risks, dealCheckMarkup: model => dealCheckMarkup(model), labOutputMarkup });
  if (typeof window !== "undefined") {
    window.FlipForgeDealCheck = api;
    if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
      else start();
    }
  }
})();
