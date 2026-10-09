/*
 * FlipForge Dashboard V3 renderer (behind the flag).
 *
 * Decision Command Center (①), Decision Dossier sections ②–⑦, Decision
 * Lifecycle (⑧, latest governed snapshot facts only) and Secondary Analytics
 * (⑨, server metrics and counts of server verdicts, below the dossier).
 *
 * Activation (all three required, otherwise V2 renders):
 *   1. ?dashboard=v3  OR  localStorage["flipforge.dashboard.renderer"] === "v3"
 *   2. the backend response carries the G1 governed-decision contract
 *      (data.governedDecisionReadModelVersion on /dashboard and /opportunities)
 *   3. window.FlipForgeDashboardV3Disabled is not set
 *
 * Authority boundary: presentation only. This renderer never calculates
 * BUY/WATCH/VERIFY/PASS, Max Buy or profitability outputs, never scores, ranks
 * or re-sorts decisions, never accepts/rejects evidence, predicts grades,
 * creates urgency, or invents missing values. Missing data renders as
 * "Not established", "Not calculated for this decision" or "—", never $0.
 */
(() => {
  "use strict";

  const VERSION = "dashboard-v3-buyer-clarity.1";
  const CONTRACT_VERSION = "1.0";
  const G1_PREFIX = "governed-decision-read";
  const RENDERER_KEY = "flipforge.dashboard.renderer";
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const MOBILE_QUERY = "(max-width: 560px)";
  const PATHS = Object.freeze({
    health: "/api/v1/health",
    dashboard: "/api/v1/dashboard",
    opportunities: "/api/v1/opportunities"
  });
  const DETAIL_PREFIX = "/api/v1/opportunities/";
  const VERDICTS = Object.freeze(["BUY", "WATCH", "VERIFY", "PASS"]);

  const NOT_ESTABLISHED = "Not established";
  const NOT_CALCULATED = "Not calculated for this decision";
  const DASH = "—";
  const REASON_CLAMP_CHARACTERS = 180;

  /* ------------------------------------------------------------------ *
   * Pure helpers (exported for the static contract validator)
   * ------------------------------------------------------------------ */

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function numberOrNull(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    if (typeof value !== "number" && typeof value !== "string") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function text(value) {
    const string = value === null || value === undefined ? "" : String(value).trim();
    return string;
  }

  function moneyFromCents(cents, missing) {
    const number = numberOrNull(cents);
    if (number === null) return missing;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(number / 100);
  }

  // The buyer-facing ask/limit comparison must not round $608.79 up to $609.
  function exactMoneyFromCents(cents, missing = DASH) {
    const number = numberOrNull(cents);
    return number === null ? missing : new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(number / 100);
  }

  function moneyFromDollars(dollars, missing) {
    const number = numberOrNull(dollars);
    if (number === null) return missing;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(number);
  }

  function percentFromBasisPoints(bp, missing) {
    const number = numberOrNull(bp);
    if (number === null) return missing;
    return `${(number / 100).toFixed(1)}%`;
  }

  function integerText(value) {
    const number = numberOrNull(value);
    return number === null ? DASH : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number);
  }

  function scoreText(value) {
    const number = numberOrNull(value);
    return number === null ? DASH : (number >= 0 && number <= 100 ? `${Math.round(number)}/100` : String(Math.round(number)));
  }

  function dateText(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return DASH;
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  }

  function dateTimeText(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return DASH;
    return `${date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC`;
  }

  function freshnessText(value, now = Date.now()) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Freshness not reported";
    const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
    if (seconds < 60) return "Updated just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `Updated ${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Updated ${hours} hr ago`;
    return `Updated ${dateText(value)}`;
  }

  function verdictOf(value) {
    const label = text(value).toUpperCase();
    return VERDICTS.includes(label) ? label : "UNKNOWN";
  }

  /* Display copy for known server enums. Labels only: the underlying server fact is unchanged. */
  const MAPPING_LABELS = Object.freeze({
    CONFIRMED: "Exact identity confirmed",
    NOT_CONFIRMED: "Identity still needs confirmation",
    UNCONFIRMED: "Identity still needs confirmation"
  });
  const SUPPORTED_REASON_LABELS = Object.freeze({
    NO_EXACT_EVIDENCE: "No accepted exact sales",
    NO_SUPPORTED_VALUE: "No supported value was established"
  });
  const SOURCE_LABELS = Object.freeze({
    DECISION_RECEIPT: "Decision receipt"
  });
  const WORKFLOW_LABELS = Object.freeze({
    ACTIVE_WATCHLIST: "On your watchlist",
    READY_FOR_OPERATOR_REVIEW: "Ready for your review",
    MANUAL_VERIFICATION: "Needs manual verification",
    PASS: "Passed"
  });
  const CHANGE_LABELS = Object.freeze({
    "NO PRICE CHANGE": "No price change",
    NO_PRICE_CHANGE: "No price change"
  });
  const BASIS_LABELS = Object.freeze({
    DIRECT_EXACT_SOLD: "Exact completed sales of this card",
    NO_EXACT_EVIDENCE: "No accepted exact sales"
  });

  /** Neutral fallback for an unknown enum: sentence case, no added meaning. */
  function humanize(value) {
    const raw = text(value);
    if (!raw) return "";
    if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(raw)) return raw;
    const words = raw.toLowerCase().split("_").join(" ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function labelFor(map, value) {
    const raw = text(value).toUpperCase();
    return raw ? (map[raw] || humanize(raw)) : "";
  }

  function isG1Contract(payload) {
    const version = payload && payload.data && payload.data.governedDecisionReadModelVersion;
    return typeof version === "string" && version.startsWith(G1_PREFIX);
  }

  /** Server-owned view of one saved decision. Reads only; never derives a verdict. */
  function decisionModel(item, detail) {
    const source = item || {};
    const governed = source.governedDecision && typeof source.governedDecision === "object" ? source.governedDecision : {};
    const governedAvailable = governed.available === true;
    const evidence = source.evidence && typeof source.evidence === "object" ? source.evidence : {};
    const detailOpportunity = detail && detail.opportunity && typeof detail.opportunity === "object" ? detail.opportunity : null;
    const valueIntelligence = detailOpportunity && detailOpportunity.valueIntelligence && typeof detailOpportunity.valueIntelligence === "object"
      ? detailOpportunity.valueIntelligence : null;
    const priceIntelligence = detail && detail.priceIntelligence && typeof detail.priceIntelligence === "object" ? detail.priceIntelligence : null;

    const supportedStatus = text(source.supportedValueStatus || governed.supportedValueStatus).toUpperCase();
    const supportedCents = supportedStatus === "NOT_ESTABLISHED"
      ? null
      : numberOrNull(source.supportedValueCents ?? governed.supportedValueCents);
    // Ask: the governed all-in ask when the snapshot recorded it; otherwise the saved listing ask.
    const askCents = numberOrNull(governed.allInAskCents) ?? (numberOrNull(source.ask) === null ? null : Math.round(Number(source.ask) * 100));

    return {
      id: text(source.id),
      title: text(source.title) || text(source.cardIdentity) || "Saved FlipForge decision",
      identity: text(source.cardIdentity),
      verdict: verdictOf(source.recommendation),
      baseVerdict: verdictOf(source.baseRecommendation || governed.baseRecommendation),
      recommendationSource: text(source.recommendationSource),
      governedAvailable,
      reason: text(governed.reason),
      nextAction: text(governed.nextAction),
      missingRequirement: text(governed.missingRequirement),
      profitabilityCappedBuy: governed.profitabilityCappedBuy === true,
      whatWouldChange: Array.isArray(governed.whatWouldChange) ? governed.whatWouldChange.map(text).filter(Boolean) : [],
      whatWouldChangeSource: text(governed.whatWouldChangeSource),
      evaluatedAt: text(governed.evaluatedAt),
      askCents,
      supportedCents,
      supportedStatus,
      supportedStatusReason: text(source.supportedValueStatusReason),
      maxBuyCents: numberOrNull(governed.maximumBuyPriceCents),
      expectedNetCents: numberOrNull(governed.expectedNetProfitCents),
      conservativeNetCents: numberOrNull(governed.conservativeNetProfitCents),
      stressNetCents: numberOrNull(governed.stressNetProfitCents),
      expectedRoiBp: numberOrNull(governed.expectedRoiBasisPoints),
      conservativeRoiBp: numberOrNull(governed.conservativeRoiBasisPoints),
      stressRoiBp: numberOrNull(governed.stressRoiBasisPoints),
      // Evidence counts. The governed snapshot count is the evidence behind THIS decision;
      // evidence.acceptedSales is the current saved completed-sale evidence and can differ.
      decisionEvidenceCount: governedAvailable ? numberOrNull(governed.exactTrustedCompCount) : null,
      currentSavedSales: numberOrNull(evidence.acceptedSales),
      excludedCount: numberOrNull(evidence.excludedSales ?? evidence.excludedCount),
      excludedReasons: Array.isArray(evidence.exclusionReasons) ? evidence.exclusionReasons.map(text).filter(Boolean) : [],
      earliestSaleDate: text(evidence.earliestSaleDate),
      latestSaleDate: text(evidence.latestSaleDate),
      evidenceFreshnessStatus: text(evidence.freshnessStatus).toUpperCase(),
      mappingState: text(source.mappingState).toUpperCase(),
      // Governed confidence/risk lead; item-level values are used only when the governed value is unavailable.
      confidence: governedAvailable && numberOrNull(governed.confidence) !== null ? numberOrNull(governed.confidence) : numberOrNull(source.confidence),
      risk: governedAvailable && numberOrNull(governed.risk) !== null ? numberOrNull(governed.risk) : numberOrNull(source.risk),
      liquidity: numberOrNull(source.liquidity),
      supportedValueBasis: valueIntelligence ? text(valueIntelligence.basis) : "",
      supportedValueExplanation: valueIntelligence ? text(valueIntelligence.explanation) : "",
      priceTransitions: priceIntelligence && Array.isArray(priceIntelligence.transitions) ? priceIntelligence.transitions : [],
      // ⑧ Lifecycle facts, exactly as served (no history is reconstructed).
      snapshotCount: governedAvailable ? numberOrNull(governed.snapshotCount) : null,
      snapshotVersion: governedAvailable ? text(governed.snapshotVersion) : "",
      receiptVersion: governedAvailable ? text(governed.receiptVersion) : "",
      observedAt: text(source.observedAt),
      changeSummary: text(source.changeSummary),
      workflowStatus: text(source.workflowStatus)
    };
  }

  /** Uncertainty statements built only from server facts. No thresholds. */
  function unknownsOf(model) {
    const unknowns = [];
    if (model.profitabilityCappedBuy) {
      unknowns.push({ key: "capped", tag: "Profit protection applied", text: "The saved decision did not meet the required margin of safety, even if some profit scenarios were positive." });
    }
    if (model.verdict === "VERIFY") {
      const need = model.missingRequirement && !/^none\b/i.test(model.missingRequirement) ? model.missingRequirement : "additional verification";
      unknowns.push({ key: "verify", tag: "Needs verification", text: `FlipForge needs ${need} before it will commit.` });
    }
    if (model.supportedStatus === "NOT_ESTABLISHED") {
      unknowns.push({ key: "supported", tag: "Supported value not established", text: model.supportedStatusReason ? `${labelFor(SUPPORTED_REASON_LABELS, model.supportedStatusReason)}.` : "The server did not establish a supported value for this card." });
    }
    const evidenceCount = model.decisionEvidenceCount !== null ? model.decisionEvidenceCount : model.currentSavedSales;
    if (evidenceCount === 0) {
      unknowns.push({ key: "sales", tag: "No accepted exact sales", text: "No completed sale was accepted as exact evidence for this card." });
    }
    if (model.mappingState && model.mappingState !== "CONFIRMED") {
      unknowns.push({ key: "mapping", tag: "Mapping not confirmed", text: `${labelFor(MAPPING_LABELS, model.mappingState)}.` });
    }
    if (model.excludedCount !== null && model.excludedCount > 0) {
      unknowns.push({ key: "excluded", tag: "Excluded evidence present", text: `${integerText(model.excludedCount)} sale${model.excludedCount === 1 ? "" : "s"} excluded by the server.` });
    }
    if (model.currentSavedSales !== null && model.currentSavedSales > 0 && !model.latestSaleDate) {
      unknowns.push({ key: "undated", tag: "Undated evidence", text: "Accepted sales were returned without completed-sale dates." });
    } else if (model.evidenceFreshnessStatus && /STALE/.test(model.evidenceFreshnessStatus)) {
      unknowns.push({ key: "stale", tag: "Stale evidence", text: `Evidence freshness: ${humanize(model.evidenceFreshnessStatus).toLowerCase()}.` });
    }
    if (model.verdict !== "VERIFY" && model.missingRequirement && !/^none\b/i.test(model.missingRequirement)) {
      unknowns.push({ key: "missing", tag: "Missing requirement", text: model.missingRequirement });
    }
    return unknowns;
  }

  function verdictBadge(verdict) {
    return `<span class="ffv3-verdict" data-verdict="${escapeHtml(verdict.toLowerCase())}">${escapeHtml(verdict)}</span>`;
  }

  function bar(label, value, tone) {
    const number = numberOrNull(value);
    const width = number === null ? 0 : Math.max(0, Math.min(100, number));
    return `<div class="ffv3-bar" data-tone="${tone}"><span class="ffv3-bar-label">${escapeHtml(label)}</span><span class="ffv3-bar-track"><span class="ffv3-bar-fill" style="width:${width}%"></span></span><strong>${escapeHtml(scoreText(value))}</strong></div>`;
  }

  function fact(label, value, extra = "") {
    return `<div class="ffv3-fact"${extra}><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  function detailHref(id) {
    return SAFE_ID.test(id) ? `#/opportunities/${encodeURIComponent(id)}` : "#/opportunities";
  }

  // Read-only explanation of a saved WATCH price threshold: never changes a verdict or Max Buy.
  function priceSummaryMarkup(model) {
    if (model.verdict !== "WATCH" || model.askCents === null || model.maxBuyCents === null || model.askCents <= model.maxBuyCents) return "";
    return `<p class="ffv3-price-signal" data-ffv3-price-signal data-ffv3-over-max>At this price, you would pay <strong>${escapeHtml(exactMoneyFromCents(model.askCents - model.maxBuyCents))} more than your modeled Max Buy.</strong></p>`;
  }

  // Snapshot-backed count and separately attributed current exclusion details. Never invent sale rows.
  function evidencePreviewMarkup(model) {
    const count = model.decisionEvidenceCount;
    const accepted = count === null ? "Exact-sale count not established" : `${integerText(count)} exact sale${count === 1 ? "" : "s"} used for this saved decision`;
    const excluded = model.excludedCount === null
      ? "Which sales were left out, and why, is not shown in this view yet"
      : `${integerText(model.excludedCount)} excluded from current saved sales${model.excludedReasons.length ? ` · ${model.excludedReasons.join("; ")}` : ""}`;
    return `<div class="ffv3-evidence-preview" data-ffv3-evidence-preview><span>Evidence behind the decision</span><strong>${escapeHtml(accepted)}</strong><small>${escapeHtml(excluded)}</small></div>`;
  }

  /* ① Decision Command Center — server order, display only. */
  function commandBarMarkup(view) {
    return `<header class="ffv3-command-bar" data-ffv3-section="command-bar">
      <div class="ffv3-command-title"><span class="ffv3-kicker">Your decisions</span><h1>Dashboard</h1></div>
      <dl class="ffv3-command-stats">
        ${fact("Tracked decisions", integerText(view.tracked))}
        ${fact("Needs verification", integerText(view.needsVerification), ' data-ffv3-needs-verification')}
        ${fact("Freshness", view.freshness)}
      </dl>
      <div class="ffv3-command-actions"><button type="button" class="ffv3-btn ffv3-btn-quiet" data-ffv3-refresh>Refresh</button><a class="ffv3-btn ffv3-btn-gold" href="#/evaluate" data-ffv3-evaluate>Evaluate a card</a></div>
    </header>`;
  }

  function ledgerRowMarkup(model, selected) {
    const supported = model.supportedCents === null ? NOT_ESTABLISHED : moneyFromCents(model.supportedCents, NOT_ESTABLISHED);
    return `<li class="ffv3-row${selected ? " is-selected" : ""}" data-verdict="${escapeHtml(model.verdict.toLowerCase())}">
      <button type="button" class="ffv3-row-button" data-ffv3-select="${escapeHtml(model.id)}" aria-pressed="${selected ? "true" : "false"}">
        <span class="ffv3-row-head">${verdictBadge(model.verdict)}${model.profitabilityCappedBuy ? '<span class="ffv3-tag" data-tag="guardrail">Profit protection</span>' : ""}<span class="ffv3-row-title">${escapeHtml(model.title)}</span></span>
        ${model.identity && model.identity !== model.title ? `<span class="ffv3-row-identity">${escapeHtml(model.identity)}</span>` : ""}
        <span class="ffv3-row-grid">
          <span><small>Ask</small><b>${escapeHtml(moneyFromCents(model.askCents, DASH))}</b></span>
          <span><small>Sale value</small><b>${escapeHtml(supported)}</b></span>
          ${model.decisionEvidenceCount !== null
            ? `<span data-ffv3-row-evidence="decision"><small>Exact sales at decision</small><b>${escapeHtml(integerText(model.decisionEvidenceCount))}</b></span>`
            : `<span data-ffv3-row-evidence="current"><small>Current saved sales</small><b>${escapeHtml(integerText(model.currentSavedSales))}</b></span>`}
          <span><small>Confidence</small><b>${escapeHtml(scoreText(model.confidence))}</b></span>
          <span><small>Risk</small><b>${escapeHtml(scoreText(model.risk))}</b></span>
        </span>
        <span class="ffv3-row-next">${escapeHtml(model.nextAction || DASH)}</span>
        <span class="ffv3-row-fresh">${escapeHtml(model.evaluatedAt ? `Evaluated ${dateText(model.evaluatedAt)}` : "Evaluation date not reported")}</span>
      </button>
    </li>`;
  }

  function ledgerMarkup(models, selectedId) {
    return `<section class="ffv3-ledger" data-ffv3-section="ledger" aria-label="Saved decisions in server order">
      <header class="ffv3-section-head"><h2>Saved decisions</h2></header>
      <ol class="ffv3-rows">${models.map(model => ledgerRowMarkup(model, model.id === selectedId)).join("")}</ol>
    </section>`;
  }

  /* ② Verdict */
  function verdictMarkup(model) {
    const keyUnknown = unknownsOf(model)[0] || null;
    const nextStep = model.nextAction;
    const sourceTag = model.governedAvailable
      ? '<span class="ffv3-tag" data-tag="source">Saved decision</span>'
      : '<span class="ffv3-tag" data-tag="source">Saved evidence unavailable</span>';
    return `<section class="ffv3-dossier-verdict" data-ffv3-section="verdict">
      <p class="ffv3-verdict-word" data-verdict="${escapeHtml(model.verdict.toLowerCase())}">${escapeHtml(model.verdict)}</p>
      <div class="ffv3-verdict-line">${model.profitabilityCappedBuy ? '<span class="ffv3-tag" data-tag="guardrail" data-ffv3-guardrail>Profit protection applied</span>' : ""}${sourceTag}</div>
      <h2 class="ffv3-dossier-title">${escapeHtml(model.title)}</h2>
      ${priceSummaryMarkup(model)}
      ${model.identity && model.identity === model.title ? "" : `<p class="ffv3-identity">${escapeHtml(model.identity ? `Exact identity: ${model.identity}` : "Exact identity not reported")}</p>`}
      ${nextStep ? `<p class="ffv3-key-unknown" data-ffv3-key-unknown><span>Next step</span> ${escapeHtml(nextStep)}</p>` : keyUnknown ? `<p class="ffv3-key-unknown" data-ffv3-key-unknown><span>What to know</span> ${escapeHtml(keyUnknown.tag)}</p>` : ""}
    </section>`;
  }

  /* ③ Decision Economics: buyer-led, display-only arithmetic from the saved ask and Max Buy. */
  function economicsMarkup(model) {
    const supported = model.supportedCents === null ? NOT_ESTABLISHED : exactMoneyFromCents(model.supportedCents);
    const delta = model.askCents !== null && model.maxBuyCents !== null ? model.askCents - model.maxBuyCents : null;
    const deltaLabel = delta === null ? "Price versus Max Buy" : delta === 0 ? "At Max Buy" : delta > 0 ? "Over your Max Buy" : "Under your Max Buy";
    const deltaAmount = delta === null ? DASH : exactMoneyFromCents(Math.abs(delta));
    const deltaState = delta === null ? "" : delta > 0 ? ' data-ffv3-delta="over"' : delta < 0 ? ' data-ffv3-delta="under"' : ' data-ffv3-delta="at"';
    const missing = [model.askCents, model.maxBuyCents].some(value => value === null);
    return `<section class="ffv3-economics" data-ffv3-section="economics">
      <header class="ffv3-section-head"><h3>What the numbers say</h3></header>
      <dl class="ffv3-econ-grid">
        ${fact("All-in ask", exactMoneyFromCents(model.askCents))}
        ${fact("Modeled Max Buy", exactMoneyFromCents(model.maxBuyCents))}
        ${fact(deltaLabel, deltaAmount, deltaState)}
        ${fact("Recent exact-sale value", supported)}
      </dl>
      ${missing ? `<p class="ffv3-legend" data-ffv3-econ-legend>— ${NOT_CALCULATED}</p>` : ""}
      ${evidencePreviewMarkup(model)}
    </section>`;
  }

  // Qualitative only: the saved read model does not supply the cost components, so no numbers are shown or derived here.
  function costNoteMarkup(model) {
    return model.supportedCents !== null && model.maxBuyCents !== null && model.supportedCents > model.maxBuyCents
      ? '<p class="ffv3-legend" data-ffv3-cost-note>Recent exact-sale value is before selling costs. Max Buy is lower because FlipForge subtracts estimated selling fees and shipping, a minimum profit, and a cushion for a price drop. A line-by-line breakdown is not available in this view yet.</p>'
      : "";
  }

  /* ④ Why FlipForge reached the decision */
  function whyMarkup(model, detailState) {
    const reason = model.reason || "A saved decision explanation was not provided.";
    const longReason = reason.length > REASON_CLAMP_CHARACTERS;
    const modeledValues = [model.expectedNetCents, model.conservativeNetCents, model.stressNetCents, model.expectedRoiBp, model.conservativeRoiBp, model.stressRoiBp];
    const modeledAvailable = modeledValues.some(value => value !== null);
    const modeled = (label, netCents, roiBp) => `<div class="ffv3-modeled-row" data-outcome="${netCents !== null && netCents < 0 ? "negative" : "neutral"}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(moneyFromCents(netCents, DASH))}</strong><em>${escapeHtml(roiBp === null ? DASH : `ROI ${percentFromBasisPoints(roiBp, DASH)}`)}</em></div>`;
    const modeledBody = modeledAvailable
      ? `${modeled("Base case", model.expectedNetCents, model.expectedRoiBp)}${modeled("Cautious case", model.conservativeNetCents, model.conservativeRoiBp)}${modeled("Downside scenario", model.stressNetCents, model.stressRoiBp)}`
      : `<p class="ffv3-note" data-ffv3-modeled-unavailable>${NOT_CALCULATED}.</p>`;
    let basis;
    if (detailState === "failed") {
      basis = '<p class="ffv3-note" data-ffv3-evidence-unavailable>Evidence detail is unavailable right now. The verdict, economics and next action above remain usable.</p>';
    } else if (detailState === "loading") {
      basis = '<p class="ffv3-note" data-ffv3-evidence-loading>Loading evidence detail for this decision…</p>';
    } else {
      basis = model.supportedValueBasis || model.supportedValueExplanation
        ? `<p class="ffv3-note">Supported-value basis: ${escapeHtml(labelFor(BASIS_LABELS, model.supportedValueBasis) || "Not reported")}${model.supportedValueExplanation ? `. ${escapeHtml(model.supportedValueExplanation)}` : ""}</p>`
        : '<p class="ffv3-note">Supported-value basis was not reported for this decision.</p>';
    }
    // Structured exclusion data is shown only when the server supplies it; it is never parsed from prose.
    const excluded = model.excludedCount === null
      ? ""
      : fact("Excluded sales", `${integerText(model.excludedCount)}${model.excludedReasons.length ? ` · ${model.excludedReasons.join("; ")}` : ""}`, " data-ffv3-excluded");
    const decisionEvidence = model.decisionEvidenceCount !== null
      ? `${integerText(model.decisionEvidenceCount)} exact sale${model.decisionEvidenceCount === 1 ? "" : "s"}`
      : NOT_ESTABLISHED;
    return `<section class="ffv3-why" data-ffv3-section="why">
      <header class="ffv3-section-head"><h3>Why this decision?</h3></header>
      ${costNoteMarkup(model)}
      <div class="ffv3-modeled"><div class="ffv3-modeled-head"><span>Estimated profit after costs</span><span class="ffv3-tag" data-tag="modeled">Modeled estimate</span></div>${modeledBody}</div>
      <p class="ffv3-reason${longReason ? " is-clamped" : ""}" id="ffv3-reason-${escapeHtml(model.id)}" data-ffv3-reason>${escapeHtml(reason)}</p>
      ${longReason ? `<button type="button" class="ffv3-link" data-ffv3-reason-toggle aria-expanded="false" aria-controls="ffv3-reason-${escapeHtml(model.id)}">Read full reason</button>` : ""}
      <div class="ffv3-evidence-lead" data-ffv3-decision-evidence>
        <span class="ffv3-evidence-label">Exact sales used for this decision</span>
        <strong>${escapeHtml(decisionEvidence)}</strong>
        <small>${escapeHtml(model.decisionEvidenceCount !== null ? "Recorded when the decision was saved; current sales may differ." : "No governed snapshot recorded an evidence count.")}</small>
      </div>
      <dl class="ffv3-why-grid">
        ${fact("Current saved sales", integerText(model.currentSavedSales), " data-ffv3-current-sales")}
        ${fact("Saved sale dates", model.earliestSaleDate || model.latestSaleDate ? `${dateText(model.earliestSaleDate)} – ${dateText(model.latestSaleDate)}` : DASH)}
        ${fact("Exact identity", model.identity || DASH)}
        ${fact("Mapping state", labelFor(MAPPING_LABELS, model.mappingState) || DASH)}
        ${excluded}
      </dl>
      ${model.decisionEvidenceCount !== null && model.currentSavedSales !== null && model.decisionEvidenceCount !== model.currentSavedSales
        ? '<p class="ffv3-note" data-ffv3-evidence-differs>Current saved sales can differ from the evidence recorded when this decision was made. The decision stands on its recorded evidence.</p>' : ""}
      <div class="ffv3-bars">${bar("Confidence score", model.confidence, "gold")}${bar("Liquidity", model.liquidity, "silver")}${bar("Risk score", model.risk, "silver")}</div>
      <p class="ffv3-legend" data-ffv3-score-legend>Scores run 0–100. Higher confidence means stronger evidence. Higher liquidity means easier to sell. Higher risk means more risk.</p>
      ${basis}
    </section>`;
  }

  /* ⑤ What FlipForge does not know */
  function unknownsMarkup(model) {
    const unknowns = unknownsOf(model);
    const body = unknowns.length
      ? `<ul class="ffv3-unknowns">${unknowns.map(entry => `<li data-unknown="${entry.key}"><span class="ffv3-tag" data-tag="${entry.key === "capped" ? "guardrail" : "unknown"}">${escapeHtml(entry.tag)}</span><span>${escapeHtml(entry.text)}</span></li>`).join("")}</ul>`
      : '<p class="ffv3-note">The server reported no open uncertainty items for this decision.</p>';
    return `<section class="ffv3-unknown" data-ffv3-section="unknowns"><header class="ffv3-section-head"><h3>What still needs verification</h3></header>${body}</section>`;
  }

  function transitionMarkup(entry) {
    const cents = numberOrNull(entry && (entry.allInAskCents ?? entry.askCents ?? entry.priceCents ?? entry.thresholdCents));
    const verdict = verdictOf(entry && (entry.recommendation ?? entry.toRecommendation));
    if (cents === null || verdict === "UNKNOWN") return "";
    return `<li>At an all-in ask of ${escapeHtml(moneyFromCents(cents, DASH))} → ${verdictBadge(verdict)}</li>`;
  }

  /* ⑥ What would change the decision */
  function changeMarkup(model, detailState) {
    const governed = model.whatWouldChange.length
      ? `<ul class="ffv3-list">${model.whatWouldChange.map(entry => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>${model.whatWouldChangeSource ? `<small class="ffv3-source">Source: ${escapeHtml(labelFor(SOURCE_LABELS, model.whatWouldChangeSource))}</small>` : ""}`
      : "";
    const transitions = detailState === "ready" ? model.priceTransitions.map(transitionMarkup).filter(Boolean) : [];
    const boundary = transitions.length
      ? `<div class="ffv3-boundary" data-ffv3-price-check><span class="ffv3-tag" data-tag="readonly">Read-only price check</span><ul class="ffv3-list">${transitions.join("")}</ul></div>`
      : "";
    const empty = !governed && !boundary ? '<p class="ffv3-note">The engine did not report a condition that would change this decision.</p>' : "";
    return `<section class="ffv3-change" data-ffv3-section="change"><header class="ffv3-section-head"><h3>What would change the decision</h3></header>${governed}${boundary}${empty}</section>`;
  }

  /* ⑦ Next Action */
  function nextActionMarkup(model) {
    return `<section class="ffv3-next" data-ffv3-section="next-action">
      <header class="ffv3-section-head"><h3>Next action</h3></header>
      <p class="ffv3-next-copy">${escapeHtml(model.nextAction || DASH)}</p>
      <div class="ffv3-next-actions">
        <a class="ffv3-btn ffv3-btn-gold" href="${detailHref(model.id)}" data-ffv3-action="analysis">View full analysis</a>
        <a class="ffv3-btn ffv3-btn-quiet" href="#/tracking" data-ffv3-action="track">Track</a>
        <a class="ffv3-btn ffv3-btn-quiet" href="#/evaluate" data-ffv3-action="re-evaluate">Re-evaluate</a>
      </div>
    </section>`;
  }

  /* ⑧ Decision Lifecycle: the latest governed snapshot and its count. Earlier snapshots are not
     reconstructed in the browser; only what the server reports is shown. */
  function lifecycleMarkup(model) {
    const snapshots = model.snapshotCount === null
      ? NOT_ESTABLISHED
      : `${integerText(model.snapshotCount)} immutable snapshot${model.snapshotCount === 1 ? "" : "s"}`;
    const versions = [model.snapshotVersion ? `Snapshot ${model.snapshotVersion}` : "", model.receiptVersion ? `Receipt ${model.receiptVersion}` : ""].filter(Boolean).join(" · ");
    return `<section class="ffv3-lifecycle" data-ffv3-section="lifecycle">
      <header class="ffv3-section-head"><h3>Decision lifecycle</h3></header>
      <dl class="ffv3-lifecycle-grid">
        ${fact("Latest governed decision", model.governedAvailable && model.evaluatedAt ? dateTimeText(model.evaluatedAt) : "No governed snapshot recorded", " data-ffv3-lifecycle-evaluated")}
        ${fact("Decision history", snapshots, " data-ffv3-lifecycle-count")}
        ${fact("Workflow", labelFor(WORKFLOW_LABELS, model.workflowStatus) || DASH)}
        ${fact("Latest listing observation", model.observedAt ? dateTimeText(model.observedAt) : DASH)}
        ${fact("Price since saved", labelFor(CHANGE_LABELS, model.changeSummary) || DASH)}
      </dl>
      <p class="ffv3-note">History is immutable. This view shows the latest governed snapshot and how many exist; earlier snapshots are not rebuilt here.</p>
      ${versions ? `<small class="ffv3-source" data-ffv3-lifecycle-versions>${escapeHtml(versions)}</small>` : ""}
    </section>`;
  }

  function dossierMarkup(model, detailState) {
    return `<article class="ffv3-dossier" data-ffv3-section="dossier" data-ffv3-selected="${escapeHtml(model.id)}" tabindex="-1" aria-label="Decision dossier">
      ${verdictMarkup(model)}${economicsMarkup(model)}${whyMarkup(model, detailState)}${unknownsMarkup(model)}${changeMarkup(model, detailState)}${nextActionMarkup(model)}${lifecycleMarkup(model)}
    </article>`;
  }

  /* ⑨ Secondary analytics: server metrics and plain counts of the verdicts the server returned.
     No ranking, scoring, urgency, trend or "top opportunity". Always below the decision experience. */
  function analyticsMarkup(view) {
    const counts = Object.fromEntries(VERDICTS.map(verdict => [verdict, view.models.filter(model => model.verdict === verdict).length]));
    const other = view.models.length - VERDICTS.reduce((sum, verdict) => sum + counts[verdict], 0);
    const mix = VERDICTS.map(verdict => `<li data-verdict-count="${verdict.toLowerCase()}">${verdictBadge(verdict)}<b>${escapeHtml(integerText(counts[verdict]))}</b></li>`).join("")
      + (other > 0 ? `<li data-verdict-count="other"><span class="ffv3-verdict">Other</span><b>${escapeHtml(integerText(other))}</b></li>` : "");
    return `<section class="ffv3-analytics" data-ffv3-section="analytics" aria-label="Secondary analytics">
      <header class="ffv3-section-head"><h2>Secondary analytics</h2><small>Counts of saved decisions returned by the server</small></header>
      <ul class="ffv3-mix">${mix}</ul>
      <dl class="ffv3-analytics-grid">
        ${fact("Tracked decisions", integerText(view.tracked))}
        ${fact("Needs verification", integerText(view.needsVerification))}
        ${fact("Evidence ready", integerText(view.evidenceReady))}
        ${fact("Population context available", integerText(view.populationContextAvailable))}
      </dl>
    </section>`;
  }

  function rootOpen(state, extra = "") {
    return `<div class="ffv3-root" data-decision-dashboard-v3 data-ffv3-state="${state}"${extra}>`;
  }

  function readyMarkup(view) {
    const selected = view.models.find(model => model.id === view.selectedId) || view.models[0];
    return `${rootOpen("ready", ` data-ffv3-tracked="${escapeHtml(numberOrNull(view.tracked) ?? view.models.length)}"`)}
      ${commandBarMarkup(view)}
      <div class="ffv3-layout">
        <div class="ffv3-dossier-slot" data-ffv3-dossier-slot>${dossierMarkup(selected, view.detailState)}</div>
        <div class="ffv3-ledger-slot">${ledgerMarkup(view.models, selected.id)}</div>
      </div>
      ${analyticsMarkup(view)}
    </div>`;
  }

  function loadingMarkup() {
    const line = width => `<span class="ffv3-skeleton-line" style="width:${width}%"></span>`;
    return `${rootOpen("loading", ' aria-busy="true"')}
      <header class="ffv3-command-bar" data-ffv3-section="command-bar"><div class="ffv3-command-title"><span class="ffv3-kicker">Your decisions</span><h1>Dashboard</h1></div><p class="ffv3-status" role="status">Loading saved decisions…</p></header>
      <div class="ffv3-layout">
        <div class="ffv3-dossier-slot"><article class="ffv3-dossier ffv3-skeleton" data-ffv3-skeleton="dossier">${line(30)}${line(80)}${line(55)}<div class="ffv3-skeleton-block"></div>${line(70)}${line(60)}</article></div>
        <div class="ffv3-ledger-slot"><section class="ffv3-ledger ffv3-skeleton" data-ffv3-skeleton="ledger">${[0, 1, 2].map(() => `<div class="ffv3-skeleton-row">${line(40)}${line(85)}</div>`).join("")}</section></div>
      </div>
    </div>`;
  }

  function emptyMarkup(view) {
    return `${rootOpen("empty", ' data-ffv3-tracked="0"')}
      ${commandBarMarkup(view)}
      <section class="ffv3-empty" data-ffv3-section="empty">
        <span class="ffv3-kicker">Your first decision</span>
        <h2>Evaluate your first card.</h2>
        <p>FlipForge runs four checks before it commits to a decision.</p>
        <ol class="ffv3-checks">
          <li><b>01</b><span><strong>Confirm the exact card</strong><small>Year, set, number, variant and grade must match.</small></span></li>
          <li><b>02</b><span><strong>Check trustworthy sales</strong><small>Only exact completed sales are accepted as evidence.</small></span></li>
          <li><b>03</b><span><strong>Compare price + uncertainty</strong><small>See whether the ask is supported and how sure the evidence is.</small></span></li>
          <li><b>04</b><span><strong>Read the decision + receipt</strong><small>BUY, WATCH, VERIFY or PASS with the reason trail preserved.</small></span></li>
        </ol>
        <div class="ffv3-next-actions"><a class="ffv3-btn ffv3-btn-gold" href="#/discover">Find a card to evaluate</a><a class="ffv3-btn ffv3-btn-quiet" href="#/evaluate">Enter a listing manually</a></div>
      </section>
    </div>`;
  }

  const SEAT_MESSAGES = Object.freeze({
    NOT_ADMITTED: "Not admitted: your invitation is active, but your Private Beta seat has not been reserved yet. Contact support@goflipforge.com and we will finish setting it up.",
    BETA_FULL: "Beta full: the FlipForge Private Beta has no open seats right now. Contact support@goflipforge.com."
  });

  function errorMarkup(error, signInHref) {
    const status = Number(error && error.status) || 0;
    const code = text(error && error.code) || "DASHBOARD_UNAVAILABLE";
    if (status === 401) {
      return `${rootOpen("signed-out")}<section class="ffv3-state" role="alert" data-ffv3-state-panel="401"><span class="ffv3-kicker">Sign-in required</span><h2>Sign in to load your saved decisions.</h2><p>Sign in with your invited FlipForge account to load tenant-owned decision data.</p><a class="ffv3-btn ffv3-btn-gold" href="${escapeHtml(signInHref)}">Sign in securely</a></section></div>`;
    }
    if (status === 403) {
      const reason = text(error && error.reason).toUpperCase();
      const message = SEAT_MESSAGES[reason] || "This signed-in account does not currently have one active FlipForge tenant membership.";
      return `${rootOpen("seat")}<section class="ffv3-state" role="alert" data-ffv3-state-panel="403" data-ffv3-seat="${escapeHtml(reason || "UNKNOWN")}"><span class="ffv3-kicker">Private Beta access</span><h2>Decision data is not available for this account.</h2><p>${escapeHtml(message)}</p></section></div>`;
    }
    if (code === "CUSTOMER_API_NOT_CONFIGURED") {
      return `${rootOpen("offline")}<section class="ffv3-state" role="alert" data-ffv3-state-panel="offline"><span class="ffv3-kicker">Decision data</span><h2>Decision data is offline.</h2><p>The authenticated customer data bridge is not available on this host. No sample data is shown.</p><button type="button" class="ffv3-btn ffv3-btn-quiet" data-ffv3-refresh>Retry</button></section></div>`;
    }
    const correlation = text(error && error.correlationId);
    return `${rootOpen("error")}<section class="ffv3-state" role="alert" data-ffv3-state-panel="load-failure"><span class="ffv3-kicker">${escapeHtml(code)}</span><h2>Saved decisions could not load.</h2><p>FlipForge fails closed when authoritative decision data is unavailable. Nothing is estimated in its place.</p>${correlation ? `<p class="ffv3-correlation">Correlation id: <code>${escapeHtml(correlation)}</code></p>` : ""}<button type="button" class="ffv3-btn ffv3-btn-gold" data-ffv3-refresh>Retry</button></section></div>`;
  }

  function viewFromSnapshot(snapshot, selectedId, detailState, details) {
    const dashboard = snapshot.dashboard || {};
    const opportunities = snapshot.opportunities || {};
    const metrics = dashboard.data && dashboard.data.metrics ? dashboard.data.metrics : {};
    const items = Array.isArray(opportunities.data && opportunities.data.items) ? opportunities.data.items : [];
    // Server order is preserved exactly: no sort, filter-by-score or rank is applied.
    const models = items.map(item => decisionModel(item, details && details[text(item && item.id)]));
    const resolvedId = models.some(model => model.id === selectedId) ? selectedId : (models[0] ? models[0].id : "");
    return {
      models,
      selectedId: resolvedId,
      detailState,
      tracked: metrics.trackedOpportunities,
      needsVerification: metrics.needsVerification,
      evidenceReady: metrics.evidenceReady,
      populationContextAvailable: metrics.populationContextAvailable,
      freshness: freshnessText(dashboard.meta && dashboard.meta.generatedAt || opportunities.meta && opportunities.meta.generatedAt)
    };
  }

  function markupForView(view) {
    return view.models.length ? readyMarkup(view) : emptyMarkup(view);
  }

  const api = {
    VERSION,
    isG1Contract,
    decisionModel,
    unknownsOf,
    humanize,
    viewFromSnapshot,
    markupForView,
    loadingMarkup,
    errorMarkup,
    dossierMarkup,
    requested: () => requested(),
    disabled: () => disabled()
  };

  /* ------------------------------------------------------------------ *
   * Runtime (browser only)
   * ------------------------------------------------------------------ */

  function requested() {
    let flag = false;
    try {
      flag = new URLSearchParams(String(window.location.search || "")).get("dashboard") === "v3";
    } catch (_) {}
    if (flag) return true;
    try {
      return window.localStorage.getItem(RENDERER_KEY) === "v3";
    } catch (_) {
      return false;
    }
  }

  function disabled() {
    return Boolean(window.FlipForgeDashboardV3Disabled);
  }

  function appEligible() {
    const host = String(window.location && window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host)) && APP_PATH.test(String(window.location.pathname || ""));
  }

  window.FlipForgeDashboardV3 = Object.freeze(api);

  const main = typeof document !== "undefined" && typeof document.querySelector === "function" ? document.querySelector("#main-content") : null;
  if (!main || !appEligible() || !requested() || disabled()) return;

  // Claim the Dashboard route before V2 starts. V2 stands down while this is "v3".
  window.FlipForgeDashboardRenderer = "v3";

  let generation = 0;
  let snapshot = null;
  let selectedId = "";
  const details = Object.create(null);
  const detailStates = Object.create(null);

  function routeName() {
    return String(window.location.hash || "#/dashboard").replace(/^#\/?/, "").split(/[/?]/)[0] || "dashboard";
  }

  function active() {
    return window.FlipForgeDashboardRenderer === "v3" && !disabled() && routeName() === "dashboard";
  }

  function signInHref() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""))
      ? "/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fdashboard"
      : "/staging-auth.html?returnTo=%2Fsaas-prototype%2F%23%2Fdashboard";
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `ff-dashboard-v3-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function allowlisted(path) {
    if (Object.values(PATHS).includes(path)) return true;
    if (!path.startsWith(DETAIL_PREFIX)) return false;
    let id = "";
    try { id = decodeURIComponent(path.slice(DETAIL_PREFIX.length)); } catch (_) { return false; }
    return SAFE_ID.test(id);
  }

  async function request(path, { health = false } = {}) {
    if (!allowlisted(path)) throw new Error("Dashboard V3 API path is not allowlisted.");
    const requestCorrelationId = correlationId();
    const response = await fetch(path, {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const body = await response.text();
    if (body.length > MAX_RESPONSE_CHARACTERS) {
      const error = new Error("The dashboard response exceeded the browser safety limit.");
      error.code = "DASHBOARD_RESPONSE_TOO_LARGE";
      error.correlationId = requestCorrelationId;
      throw error;
    }
    let payload = {};
    try {
      payload = body ? JSON.parse(body) : {};
    } catch (_) {
      const error = new Error("The customer gateway returned invalid JSON.");
      error.code = "DASHBOARD_INVALID_JSON";
      error.status = response.status;
      error.correlationId = requestCorrelationId;
      throw error;
    }
    if (!response.ok) {
      const upstream = payload && payload.error ? payload.error : {};
      const error = new Error(upstream.message || `Customer request failed with status ${response.status}.`);
      error.code = upstream.code || "DASHBOARD_REQUEST_FAILED";
      error.reason = upstream.reason || payload.reason || "";
      error.status = response.status;
      error.correlationId = upstream.correlationId || requestCorrelationId;
      throw error;
    }
    const meta = payload && payload.meta;
    const valid = health
      ? Boolean(meta && payload.data) && meta.contractVersion === CONTRACT_VERSION && meta.correlationId === requestCorrelationId
      : Boolean(meta) && meta.contractVersion === CONTRACT_VERSION && meta.correlationId === requestCorrelationId
        && typeof meta.engineVersion === "string" && meta.engineVersion.length > 0
        && meta.authority === "Smart Opportunity" && meta.gradingAuthority === "Existing PSA intelligence"
        && Object.prototype.hasOwnProperty.call(payload, "data");
    if (!valid) {
      const error = new Error("The customer response failed the FlipForge authority contract.");
      error.code = "DASHBOARD_CONTRACT_INVALID";
      error.correlationId = requestCorrelationId;
      throw error;
    }
    return payload;
  }

  function shellEvaluateVisible() {
    const shell = document.querySelector("[data-ff-global-new-card]");
    if (!shell || typeof shell.getClientRects !== "function" || !shell.getClientRects().length) return false;
    const style = typeof window.getComputedStyle === "function" ? window.getComputedStyle(shell) : null;
    return !style || (style.visibility !== "hidden" && style.display !== "none");
  }

  // One obvious Evaluate action: the shell's topbar action wins when it is visible.
  function reconcileEvaluateAction() {
    const own = main.querySelector("[data-ffv3-evaluate]");
    if (own) own.hidden = shellEvaluateVisible();
  }

  function bindRoot() {
    reconcileEvaluateAction();
    main.querySelectorAll("[data-ffv3-refresh]").forEach(node => node.addEventListener("click", () => load(true)));
    main.querySelectorAll("[data-ffv3-select]").forEach(node => node.addEventListener("click", () => select(node.getAttribute("data-ffv3-select"), true)));
    bindDossier();
  }

  function bindDossier() {
    main.querySelectorAll("[data-ffv3-reason-toggle]").forEach(button => button.addEventListener("click", () => {
      const reason = main.querySelector("[data-ffv3-reason]");
      if (!reason) return;
      const expanded = reason.classList.toggle("is-clamped") === false;
      button.setAttribute("aria-expanded", expanded ? "true" : "false");
      button.textContent = expanded ? "Show less" : "Read full reason";
    }));
  }

  function currentView() {
    const state = detailStates[selectedId];
    return viewFromSnapshot(snapshot, selectedId, state === "ready" || state === "failed" ? state : "loading", details);
  }

  function render() {
    if (!active() || !snapshot) return;
    const view = currentView();
    selectedId = view.selectedId;
    if (view.models.length && !detailStates[selectedId]) view.detailState = "loading";
    main.innerHTML = markupForView(view);
    bindRoot();
    if (selectedId) loadDetail(selectedId);
  }

  function renderDossierOnly() {
    if (!active() || !snapshot) return;
    const slot = main.querySelector("[data-ffv3-dossier-slot]");
    if (!slot) return render();
    const view = currentView();
    const model = view.models.find(entry => entry.id === view.selectedId);
    if (!model) return;
    slot.innerHTML = dossierMarkup(model, view.detailState);
    bindDossier();
    main.querySelectorAll("[data-ffv3-select]").forEach(node => {
      const selected = node.getAttribute("data-ffv3-select") === view.selectedId;
      node.setAttribute("aria-pressed", selected ? "true" : "false");
      const row = node.closest(".ffv3-row");
      if (row) row.classList.toggle("is-selected", selected);
    });
  }

  function select(id, userInitiated) {
    if (!snapshot || !id) return;
    selectedId = id;
    renderDossierOnly();
    loadDetail(id);
    if (userInitiated && typeof window.matchMedia === "function" && window.matchMedia(MOBILE_QUERY).matches) {
      const dossier = main.querySelector("[data-ffv3-dossier-slot]");
      if (dossier && typeof dossier.scrollIntoView === "function") dossier.scrollIntoView({ block: "start", behavior: "instant" });
    }
    // Move keyboard/screen-reader focus to the swapped dossier so the newly shown decision is
    // announced, without a second scroll jump.
    const target = main.querySelector('[data-ffv3-section="dossier"]');
    if (userInitiated && target && typeof target.focus === "function") target.focus({ preventScroll: true });
  }

  async function loadDetail(id) {
    if (!SAFE_ID.test(id) || detailStates[id] === "ready" || detailStates[id] === "pending") return;
    detailStates[id] = "pending";
    const current = generation;
    try {
      const payload = await request(`${DETAIL_PREFIX}${encodeURIComponent(id)}`);
      if (current !== generation) return;
      details[id] = payload.data || {};
      detailStates[id] = "ready";
    } catch (_) {
      if (current !== generation) return;
      detailStates[id] = "failed";
    }
    if (selectedId === id) renderDossierOnly();
  }

  function fallBackToV2() {
    window.FlipForgeDashboardRenderer = "v2";
    if (main.querySelector("[data-decision-dashboard-v3]")) main.innerHTML = "";
    if (typeof window.FlipForgeDashboardV2Reload === "function") window.FlipForgeDashboardV2Reload();
  }

  async function load(force) {
    if (!active()) return;
    const current = ++generation;
    if (!force && snapshot) {
      render();
      return;
    }
    Object.keys(detailStates).forEach(key => { delete detailStates[key]; delete details[key]; });
    main.innerHTML = loadingMarkup();
    try {
      const health = await request(PATHS.health, { health: true });
      if (current !== generation || !active()) return;
      if (!health.data || health.data.status !== "configured" || health.data.bridgeEnabled !== true) {
        const error = new Error("The authenticated customer API bridge is not configured for this app host.");
        error.code = "CUSTOMER_API_NOT_CONFIGURED";
        throw error;
      }
      const [dashboard, opportunities] = await Promise.all([request(PATHS.dashboard), request(PATHS.opportunities)]);
      if (current !== generation || !active()) return;
      if (!isG1Contract(dashboard) || !isG1Contract(opportunities)) {
        fallBackToV2();
        return;
      }
      snapshot = { dashboard, opportunities };
      render();
    } catch (error) {
      if (current !== generation || !active()) return;
      main.innerHTML = errorMarkup(error, signInHref());
      bindRoot();
    }
  }

  function apply() {
    if (!active()) {
      generation += 1;
      return;
    }
    load(false);
  }

  window.addEventListener("hashchange", () => queueMicrotask(apply));
  window.addEventListener("flipforge:identity-change", () => {
    if (active()) {
      snapshot = null;
      load(true);
    }
  });
  queueMicrotask(apply);
})();
