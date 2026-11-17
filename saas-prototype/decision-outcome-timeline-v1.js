(() => {
  "use strict";

  // Outcome Checkpoint Timeline v1: one Day 7 / Day 14 / Day 30 timeline for a saved decision, shown on Saved
  // Decisions and on Tracking from the same server object (lifecycle detail -> data.outcomeTimeline, built by the
  // FlipForge2 outcome-checkpoint-timeline-v1 service). Display only: every state, date, value and comparison is the
  // server's; the browser computes no price, percentage, due date or outcome, and never back-fills a checkpoint.
  //
  // Saved Decisions: this module reads the same GET /api/v1/lifecycle/{id} the Tracking page reads and adds the panel
  // to the route-owned saved-decision view. Tracking: customer-lifecycle.js calls markup() with the detail it loaded.

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const ROUTE = /^#\/opportunities\/([^/?#]+)$/;
  const PANEL = "data-ff-outcome-timeline";
  const BOUND = "data-ff-outcome-timeline-opportunity";
  const HORIZONS = [7, 14, 30];

  // Plain-language labels, fixed here so no response can relabel a state as more certain than it is.
  const STATE_LABELS = Object.freeze({
    AWAITING_CHECKPOINT: "Awaiting Checkpoint",
    PRICE_OBSERVED: "Price Observed",
    NO_RELIABLE_EVIDENCE: "No Reliable Evidence",
    // V1.0: a recorded checkpoint with no independently confirmed price and no new derived estimate.
    NO_NEW_VERIFIED_EVIDENCE: "No new verified evidence",
    NO_NEW_SALES: "No New Sales",
    WINDOW_CLOSED: "Window Closed",
    CUSTOMER_REPORTED_UNVERIFIED: "Customer-Reported — Unverified",
    HISTORICAL_RECONSTRUCTION: "Historical Reconstruction"
  });
  const RELIABILITY_LABELS = Object.freeze({
    INDEPENDENTLY_VERIFIED: "Exact-card completed sales, independent source",
    NOT_INDEPENDENTLY_VERIFIED: "Did not pass provenance checks",
    NONE: "No reliable pricing evidence"
  });
  const ACTION_LABELS = Object.freeze({ BOUGHT: "Bought", SOLD: "Sold", PASSED: "Passed" });
  const PLATFORM_LABELS = Object.freeze({ EBAY: "eBay", GOLDIN: "Goldin", FANATICS_COLLECT: "Fanatics Collect", HERITAGE: "Heritage",
    PWCC: "PWCC", MYSLABS: "MySlabs", ALT: "Alt", WHATNOT: "Whatnot", COMC: "COMC", MERCARI: "Mercari",
    FACEBOOK_MARKETPLACE: "Facebook Marketplace", CARD_SHOW: "Card show", LOCAL_SHOP: "Local shop", PRIVATE_SALE: "Private sale", OTHER: "Other" });
  const state = { opportunityId: "", detail: null, loading: false, failed: false, attempts: 0, serial: 0 };

  const escapeHtml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const money = cents => finite(cents) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents) / 100) : "";
  const percent = value => finite(value) ? `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(1)}%` : "";
  const text = value => typeof value === "string" ? value : "";
  // A calendar date (YYYY-MM-DD) the customer entered, written out without any time-zone conversion.
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayText = value => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    return m && MONTHS[Number(m[2]) - 1] ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : String(value || "");
  };
  const uuid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `timeline-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const eligibleHost = () => (PRODUCTION_HOST.test(location.hostname) || PREVIEW_HOST.test(location.hostname)) && APP_PATH.test(location.pathname);

  // Phase 5 (outcome-checkpoint-timeline-v2, PHASE5_CUSTOMER_INTELLIGENCE_CONTRACT section 2): the three evidence
  // streams are shown apart, each with its own fixed label. Stream A is direction only (no value, no percentage).
  const STREAM_LABELS = Object.freeze({ A: "Derived market estimate", B: "Independently confirmed price", C: "Customer-Reported — Unverified" });
  // "Supported market estimate" wording, fixed here: never a return, a profit or a gain.
  const MOVEMENT_LABELS = Object.freeze({
    INCREASED: "Supported market estimate increased",
    DECREASED: "Supported market estimate decreased",
    UNCHANGED: "Supported market estimate unchanged (within 5%)",
    UNAVAILABLE: "Supported market estimate unavailable",
    NOT_YET_AVAILABLE: "Not yet available"
  });
  // V1.0: a due checkpoint with no new derived estimate may carry the latest earlier direction, as already shown there.
  // The words are fixed here; the server's text is not displayed, and no value or percentage is ever accepted.
  const CARRIED_FORWARD_WORDS = Object.freeze({ INCREASED: "Increased", DECREASED: "Decreased", UNCHANGED: "Unchanged (within 5%)" });
  const QUALITY_LABELS = Object.freeze({ STRONG: "Strong", HIGH: "Strong", MODERATE: "Moderate", MEDIUM: "Moderate", LIMITED: "Limited",
    WEAK: "Weak", LOW: "Weak", REVIEW: "Needs review", NONE: "None" });
  const VERIFICATION_REASONS = Object.freeze({
    VERIFY_VERDICT: "The original decision was VERIFY: the card or its evidence still has to be confirmed.",
    VALUES_WITHHELD_FEW_SALES: "The decision rests on too few sales to show a value.",
    NO_INDEPENDENT_CONFIRMATION: "No checkpoint so far has an independently confirmed price.",
    CUSTOMER_REPORT_CONFLICT: "Your own report differs from the independent market evidence.",
    LEGACY_BASELINE: "The original decision was saved before current evidence rules."
  });
  const WITHHELD_CODES = ["SINGLE_PROVIDER_SALE_BASIS", "FEW_PROVIDER_SALES_BASIS"];

  const v2 = timeline => /^outcome-checkpoint-timeline-v([2-9]|\d{2,})$/.test(String(timeline?.version || ""));
  const score = value => finite(value) ? `${Math.round(Number(value))}/100` : "Not recorded";
  const quality = value => {
    const code = String(value || "").toUpperCase();
    return QUALITY_LABELS[code] || (/^[A-Z][A-Z_]+$/.test(code) ? code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ") : "Not recorded");
  };
  function withheldLabel(...records) {
    for (const r of records) {
      if (!isObject(r) || !WITHHELD_CODES.includes(String(r.valuesWithheld || "").toUpperCase())) continue;
      const label = text(r.valuesWithheldLabel).trim();
      if (/^Based on [1-3] sales?: value withheld$/.test(label)) return label;
      const basis = Number(r.withheldBasisSales);
      return Number.isInteger(basis) && basis >= 2 && basis <= 3 ? `Based on ${basis} sales: value withheld` : "Based on 1 sale: value withheld";
    }
    return "";
  }

  // The server object must keep every integrity promise, or nothing is shown.
  function valid(timeline, opportunityId) {
    if (!isObject(timeline) || timeline.kind !== "outcome-checkpoint-timeline") return false;
    if (!/^outcome-checkpoint-timeline-v\d+$/.test(String(timeline.version || ""))) return false;
    if (String(timeline.opportunityId || "") !== String(opportunityId || "")) return false;
    if (timeline.historicalBackfill !== false || timeline.customerAccuracyClaimAuthorized !== false) return false;
    if (typeof timeline.available !== "boolean" || !Array.isArray(timeline.checkpoints)) return false;
    if (timeline.available !== true) return true;
    if (timeline.customerReportsVerified !== false || timeline.reconstructionsMergedWithLive !== false
      || timeline.unverifiedObservationValuesShown !== false || timeline.syntheticPrices !== false
      || timeline.askingPricesUsedAsSales !== false || timeline.providerRequestMade !== false) return false;
    if (!isObject(timeline.originalDecision) || !isObject(timeline.conclusion)) return false;
    // v2: a derived estimate is never a realized result and no individual sale price is ever served.
    if (v2(timeline) && (timeline.derivedEstimateIsRealizedReturn !== false || timeline.individualSalePricesShown !== false)) return false;
    // A withheld decision carries no baseline value.
    if (withheldLabel(timeline, timeline.originalDecision) && finite(timeline.originalDecision.baselineSupportedValueCents)) return false;
    const horizons = timeline.checkpoints.map(c => Number(c?.horizonDays));
    if (horizons.length !== 3 || !HORIZONS.every((h, i) => horizons[i] === h)) return false;
    return timeline.checkpoints.every(c => isObject(c) && Object.prototype.hasOwnProperty.call(STATE_LABELS, c.state)
      && c.state !== "HISTORICAL_RECONSTRUCTION" && isObject(c.evidence) && isObject(c.comparisonToBaseline) && isObject(c.comparisonToPrior)
      && Array.isArray(c.customerReports) && c.customerReports.every(r => isObject(r) && r.verified === false && r.countedAsMarketPrice === false)
      && (c.state === "PRICE_OBSERVED" || !finite(c.evidence.observedValueCents))
      && (c.state === "PRICE_OBSERVED" || c.comparisonToBaseline.comparable !== true)
      && validStreams(c));
  }

  function validStreams(c) {
    if (c.streams === undefined || c.streams === null) return true;
    if (!isObject(c.streams)) return false;
    const a = c.streams.derivedMarketEstimate, b = c.streams.independentlyConfirmed, r = c.streams.customerReported;
    if (a !== undefined && (!isObject(a) || a.valueShown !== false || a.realizedReturn !== false
      || (a.movement !== undefined && !Object.prototype.hasOwnProperty.call(MOVEMENT_LABELS, a.movement))
      || finite(a.valueCents) || finite(a.changePercent))) return false;
    const cf = a?.carriedForward;
    if (cf !== undefined && cf !== null && (!isObject(cf) || cf.newEstimate !== false || cf.valueShown !== false
      || finite(cf.valueCents) || finite(cf.changePercent))) return false;
    if (b !== undefined && (!isObject(b) || (b.priceObserved === true) !== (c.state === "PRICE_OBSERVED"))) return false;
    if (r !== undefined && (!isObject(r) || r.verified !== false || r.countedAsMarketPrice !== false)) return false;
    return true;
  }

  function comparisonLine(label, comparison) {
    const shown = comparison?.comparable === true && finite(comparison.changePercent);
    const value = shown ? `${percent(comparison.changePercent)} (${money(comparison.changeCents)})` : "No comparison";
    return `<span data-ff-otl-comparison="${shown ? "shown" : "none"}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong>`
      + `<em>${escapeHtml(text(comparison?.explanation))}</em></span>`;
  }

  function reportLine(report) {
    const parts = [ACTION_LABELS[report.action] || "Recorded"];
    if (finite(report.reportedPriceCents)) parts.push(money(report.reportedPriceCents));
    if (text(report.reportedOn)) parts.push(dayText(report.reportedOn));
    if (text(report.reportedPlatform)) parts.push(PLATFORM_LABELS[report.reportedPlatform] || "Other");
    return `<li data-ff-otl-report><b>${escapeHtml(STATE_LABELS.CUSTOMER_REPORTED_UNVERIFIED)}</b> <span>You reported: ${escapeHtml(parts.join(" · "))}. Not verified by FlipForge and not counted as a market price.</span></li>`;
  }

  function reconstructionMarkup(recon) {
    if (!isObject(recon) || recon.state !== "HISTORICAL_RECONSTRUCTION" || recon.liveTracking !== false || recon.countedInCheckpoint !== false) return "";
    const value = finite(recon.reconstructedValueCents) ? ` · ${money(recon.reconstructedValueCents)}` : "";
    return `<div class="ff-otl-reconstruction" data-ff-otl-reconstruction><b>${escapeHtml(STATE_LABELS.HISTORICAL_RECONSTRUCTION)}</b>`
      + `<span>${escapeHtml(text(recon.result))}${escapeHtml(value)}</span><p>${escapeHtml(text(recon.explanation))}</p></div>`;
  }

  // V1.0 carry-forward line: only an earlier checkpoint's shown direction, labelled as not a new estimate.
  function carriedForwardLine(c, a) {
    const cf = a?.carriedForward;
    if (!isObject(cf) || cf.newEstimate !== false) return "";
    const from = Number(cf.fromHorizonDays);
    const word = CARRIED_FORWARD_WORDS[cf.movement];
    if (!word || !HORIZONS.includes(from) || from >= Number(c.horizonDays)) return "";
    return `<p class="ff-otl-carried" data-ff-otl-carried-forward="${escapeHtml(from)}"><b>Latest derived estimate: Day ${escapeHtml(from)} — ${escapeHtml(word)}</b>`
      + `<small>Carried forward from the Day ${escapeHtml(from)} checkpoint. Not a new estimate: no new derived market estimate was recorded for Day ${escapeHtml(c.horizonDays)}.</small></p>`;
  }

  // Stream A: direction only. An older (v1) service sends no stream A, which reads "Not recorded" (never guessed).
  function streamA(c) {
    const a = isObject(c.streams?.derivedMarketEstimate) ? c.streams.derivedMarketEstimate : null;
    const movement = a && Object.prototype.hasOwnProperty.call(MOVEMENT_LABELS, a.movement) ? a.movement : "";
    const value = movement ? MOVEMENT_LABELS[movement] : "Not recorded";
    const sales = a && finite(a.acceptedSalesAtCheckpoint) ? `${Number(a.acceptedSalesAtCheckpoint)} exact sale${Number(a.acceptedSalesAtCheckpoint) === 1 ? "" : "s"} at this checkpoint. ` : "";
    return `<div class="ff-otl-stream" data-ff-otl-stream="A" data-ff-otl-movement="${escapeHtml(movement || "NOT_RECORDED")}"><dt><b>A</b> ${escapeHtml(STREAM_LABELS.A)}</dt>`
      + `<dd><strong>${escapeHtml(value)}</strong><small>${escapeHtml(sales + (a ? text(a.explanation) : "This service version does not record a derived estimate for checkpoints."))}</small>${carriedForwardLine(c, a)}</dd></div>`;
  }

  function streamB(c) {
    const b = isObject(c.streams?.independentlyConfirmed) ? c.streams.independentlyConfirmed : null;
    const observed = c.state === "PRICE_OBSERVED" && finite(c.evidence.observedValueCents);
    const sales = finite(b?.acceptedSalesAtCheckpoint ?? c.evidence.acceptedSalesAtCheckpoint) ? Number(b?.acceptedSalesAtCheckpoint ?? c.evidence.acceptedSalesAtCheckpoint) : null;
    const value = observed ? money(c.evidence.observedValueCents) : "None recorded";
    const detail = observed
      ? `Supported value from ${sales === null ? "" : `${sales} `}independent exact-card completed sale${sales === 1 ? "" : "s"}. ${RELIABILITY_LABELS.INDEPENDENTLY_VERIFIED}.`
      : RELIABILITY_LABELS[c.evidence.reliability] || RELIABILITY_LABELS.NONE;
    const priorLabel = c.horizonDays === 7 ? "Change vs. earlier checkpoint" : `Change vs. ${finite(c.comparisonToPrior.comparedWithHorizonDays) ? `Day ${c.comparisonToPrior.comparedWithHorizonDays}` : "earlier checkpoint"}`;
    return `<div class="ff-otl-stream" data-ff-otl-stream="B" data-ff-otl-price-observed="${observed}"><dt><b>B</b> ${escapeHtml(STREAM_LABELS.B)}</dt>`
      + `<dd><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small><div class="customer-outcome-checkpoint-grid">`
      + comparisonLine("Change vs. original decision", c.comparisonToBaseline) + comparisonLine(priorLabel, c.comparisonToPrior) + `</div></dd></div>`;
  }

  function streamC(c) {
    const reports = c.customerReports;
    return `<div class="ff-otl-stream" data-ff-otl-stream="C"><dt><b>C</b> ${escapeHtml(STREAM_LABELS.C)}</dt>`
      + `<dd>${reports.length ? `<ul class="ff-otl-reports">${reports.map(reportLine).join("")}</ul>` : "<strong>None reported</strong><small>Nothing you reported falls in this checkpoint.</small>"}</dd></div>`;
  }

  function checkpointMarkup(c) {
    const label = STATE_LABELS[c.state];
    const conflict = c.evidenceConflict?.present === true ? `<p class="ff-otl-conflict" data-ff-otl-conflict>${escapeHtml(text(c.evidenceConflict.explanation))}</p>` : "";
    const windowWord = c.windowState === "CLOSED" ? "Window closed" : c.windowState === "OPEN" ? "Window open until" : "Window closes";
    const changed = text(c.whatChanged).trim() ? `<p class="ff-otl-changed" data-ff-otl-what-changed><b>What changed:</b> ${escapeHtml(c.whatChanged)}</p>` : "";
    const verify = c.verificationNeeded === true ? `<p class="ff-otl-verify" data-ff-otl-verification-needed>Additional verification needed</p>` : "";
    return `<article class="customer-outcome-checkpoint ff-otl-checkpoint" data-state="${escapeHtml(c.state)}" data-ff-otl-horizon="${escapeHtml(c.horizonDays)}">`
      + `<div class="customer-outcome-checkpoint-head"><span class="eyebrow">Day ${escapeHtml(c.horizonDays)}</span><strong class="ff-otl-state" data-ff-otl-state="${escapeHtml(c.state)}">${escapeHtml(label)}</strong></div>`
      + `<p class="ff-otl-dates">Due ${escapeHtml(text(c.dueOnText))} · ${escapeHtml(windowWord)} ${escapeHtml(text(c.windowClosesOnText))}</p>`
      + `<p class="ff-otl-explanation">${escapeHtml(text(c.explanation))}</p>${changed}`
      + `<dl class="ff-otl-streams">${streamA(c)}${streamB(c)}${streamC(c)}</dl>`
      + `${verify}${conflict}${reconstructionMarkup(c.historicalReconstruction)}</article>`;
  }

  function header(badge) {
    return `<header class="panel-header"><div><span class="eyebrow">Outcome Intelligence</span><h2>Day 7 · Day 14 · Day 30</h2>`
      + `<p>What FlipForge concluded, what evidence supported it and what changed at each checkpoint. Dates are Eastern Time.</p></div>${badge}</header>`;
  }

  function verificationMarkup(timeline) {
    const v = timeline.verification;
    if (!isObject(v) || typeof v.needed !== "boolean") return "";
    if (!v.needed) return `<div class="ff-otl-verification" data-ff-otl-verification="not-needed"><strong>No additional verification needed</strong><span>${escapeHtml(text(v.explanation))}</span></div>`;
    const reasons = Array.isArray(v.reasons) ? v.reasons.map(code => VERIFICATION_REASONS[code]).filter(Boolean) : [];
    return `<div class="ff-otl-verification" data-ff-otl-verification="needed"><strong>Additional verification needed</strong><span>${escapeHtml(text(v.explanation))}</span>`
      + (reasons.length ? `<ul>${reasons.map(r => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : "") + `</div>`;
  }

  function markup(timeline) {
    const id = escapeHtml(timeline?.opportunityId || "");
    if (!timeline || timeline.available !== true) {
      const none = timeline?.status === "NO_SAVED_DECISION";
      return `<section class="panel customer-outcome-panel ff-otl" ${PANEL} ${BOUND}="${id}">${header('<span class="badge badge-neutral">Unavailable</span>')}`
        + `<div class="panel-body staging-empty consumer-state consumer-state-empty"><strong>${none ? "No saved decision to track yet." : "Outcome checkpoints are not available right now."}</strong>`
        + `<p>FlipForge never estimates a missing checkpoint or fills one in later.</p></div></section>`;
    }
    const d = timeline.originalDecision;
    const answers = isObject(timeline.answers) ? timeline.answers : {};
    const support = isObject(d.evidenceSupport) ? d.evidenceSupport : {};
    const reliable = timeline.checkpoints.filter(c => c.state === "PRICE_OBSERVED").length;
    const why = Array.isArray(d.why) ? d.why.filter(line => typeof line === "string" && line.trim()).slice(0, 3) : [];
    const withheld = withheldLabel(d, timeline);
    const baseline = withheld
      ? `<span data-ff-otl-baseline="withheld"><small>Supported value at decision</small><strong data-ff-value-withheld>${escapeHtml(withheld)}</strong><em>No buying limit or value is shown for this decision. ${escapeHtml(text(d.baselineExplanation) && !/value withheld/.test(d.baselineExplanation) ? d.baselineExplanation : "")}</em></span>`
      : d.baselineSupported === true && finite(d.baselineSupportedValueCents)
        ? `<span data-ff-otl-baseline="value"><small>Supported value at decision</small><strong>${escapeHtml(money(d.baselineSupportedValueCents))}</strong></span>`
        : `<span data-ff-otl-baseline="none"><small>Comparison baseline</small><strong>None</strong><em>${escapeHtml(text(d.baselineExplanation))}</em></span>`;
    const receipt = d.receiptPresent === true
      ? `<span><small>Decision Receipt</small><strong>Preserved, unchanged</strong></span>`
      : `<span><small>Decision Receipt</small><strong>Saved before receipts</strong></span>`;
    const salesCount = support.acceptedExactSales ?? d.evidenceCount;
    const evidenceFacts = [
      ["Exact completed sales", finite(salesCount) ? String(Number(salesCount)) : "Not recorded"],
      ["Evidence quality", quality(support.evidenceQuality ?? d.evidenceQuality)],
      ["Confidence", score(support.confidence ?? d.confidence)],
      ["Risk", score(support.risk ?? d.risk)]
    ];
    if (finite(d.askCents)) evidenceFacts.push(["Your ask (all-in)", money(d.askCents)]);
    const outside = Array.isArray(timeline.customerReportsOutsideCheckpoints) && timeline.customerReportsOutsideCheckpoints.length
      ? `<ul class="ff-otl-reports">${timeline.customerReportsOutsideCheckpoints.filter(r => isObject(r) && r.verified === false).map(reportLine).join("")}</ul>` : "";
    const evidenceAnswer = text(answers.whatEvidenceSupported).trim();
    return `<section class="panel customer-outcome-panel ff-otl" ${PANEL} ${BOUND}="${id}"${withheld ? " data-ff-otl-withheld" : ""}>`
      + header(`<span class="badge ${reliable ? "badge-ok" : "badge-neutral"}" data-ff-otl-badge>${reliable}/3 with an independently confirmed price</span>`)
      + `<div class="panel-body"><div class="customer-outcome-boundary"><strong>Tracking, not a new recommendation.</strong>`
      + `<span>Each checkpoint shows only what was recorded, in three separate streams. A missing price is never estimated or filled in later, your own reports are never treated as verified, a movement in the supported market estimate is not money made or lost, and one card's result does not show whether FlipForge's decisions are accurate in general.</span></div>`
      + `<section class="ff-otl-question" data-ff-otl-question="recommended"><h3>1. What FlipForge originally concluded and why</h3>`
      + `<p class="ff-otl-answer"><b>${escapeHtml(text(d.recommendation))}</b> on ${escapeHtml(text(d.decidedOnText))}. ${escapeHtml(text(d.reasonExplanation))}</p>`
      + (why.length ? `<ul class="ff-otl-why">${why.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : "")
      + `<h4 class="ff-otl-subhead">Market evidence behind it</h4>${evidenceAnswer ? `<p class="ff-otl-answer" data-ff-otl-evidence-answer>${escapeHtml(evidenceAnswer)}</p>` : ""}`
      + `<div class="customer-outcome-baseline ff-otl-evidence" data-ff-otl-evidence>${evidenceFacts.map(([k, v]) => `<span><small>${escapeHtml(k)}</small><strong>${escapeHtml(v)}</strong></span>`).join("")}</div>`
      + `<p class="ff-otl-note">Counts, quality, confidence and risk only: individual sale prices are never shown.</p>`
      + `<div class="customer-outcome-baseline">${baseline}${receipt}<span><small>Later re-evaluations</small><strong>${escapeHtml(String(Number(d.laterReevaluationCount) || 0))}</strong></span></div></section>`
      + `<section class="ff-otl-question" data-ff-otl-question="evidence"><h3>2. What changed at Day 7, Day 14 and Day 30</h3>`
      + `<p class="ff-otl-legend"><b>A</b> ${escapeHtml(STREAM_LABELS.A)}: FlipForge's own estimate, direction only · <b>B</b> ${escapeHtml(STREAM_LABELS.B)}: independent exact-card completed sales · <b>C</b> ${escapeHtml(STREAM_LABELS.C)}: what you reported</p>`
      + `<div class="customer-outcome-checkpoints">${timeline.checkpoints.map(checkpointMarkup).join("")}</div>${outside}</section>`
      + `<section class="ff-otl-question" data-ff-otl-question="conclusion"><h3>3. What can be concluded</h3>`
      + `<p class="ff-otl-answer" data-ff-otl-conclusion="${escapeHtml(text(timeline.conclusion.code))}">${escapeHtml(text(timeline.conclusion.statement))}</p>`
      + verificationMarkup(timeline) + `</section>`
      + `</div></section>`;
  }

  // ---- Saved Decisions mount -------------------------------------------------------------------------------------

  function routeOpportunityId() {
    const match = String(location.hash || "").match(ROUTE);
    if (!match) return "";
    let id = "";
    try { id = decodeURIComponent(match[1]); } catch (_) { return ""; }
    return SAFE_ID.test(id) ? id : "";
  }

  function savedDecisionView(id) {
    const view = document.getElementById("main-content")?.querySelector(".customer-saved-decisions-page");
    if (!view || !view.querySelector("[data-card-reevaluate]")) return null;
    return view.querySelector("[data-ff-card-id]")?.getAttribute("data-ff-card-id") === id ? view : null;
  }

  function removeStalePanels(id) {
    document.querySelectorAll(`#main-content .customer-saved-decisions-page [${PANEL}]`).forEach(panel => {
      if (!id || panel.getAttribute(BOUND) !== id) panel.remove();
    });
  }

  async function load(id) {
    const correlationId = uuid();
    const response = await fetch(`/api/v1/lifecycle/${encodeURIComponent(id)}`, {
      method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json", "X-Correlation-Id": correlationId }
    });
    const body = await response.text();
    if (body.length > MAX_RESPONSE_CHARACTERS) throw new Error("The response was too large.");
    let payload = {};
    try { payload = body ? JSON.parse(body) : {}; } catch (_) { throw new Error("The response was not valid JSON."); }
    if (!response.ok) throw Object.assign(new Error("The request failed."), { status: response.status });
    const data = payload?.data;
    if (payload?.meta?.contractVersion !== CONTRACT_VERSION || payload.meta.correlationId !== correlationId
      || data?.kind !== "lifecycle-detail" || String(data.opportunityId || "") !== id) throw new Error("The response failed the FlipForge contract.");
    return data;
  }

  function paint(id) {
    const anchor = savedDecisionView(id);
    if (!anchor || id !== state.opportunityId || !state.detail) return false;
    const timeline = state.detail.outcomeTimeline;
    removeStalePanels(id);
    if (!valid(timeline, id)) return true; // an older service or a failed contract: show nothing rather than guess
    const html = markup(timeline);
    const existing = anchor.querySelector(`[${PANEL}]`);
    if (existing) { existing.outerHTML = html; return true; }
    const record = anchor.querySelector("[data-decision-outcome-panel]");
    if (record) record.insertAdjacentHTML("beforebegin", html);
    else anchor.insertAdjacentHTML("beforeend", html);
    return true;
  }

  async function mount() {
    if (!eligibleHost()) return true;
    const id = routeOpportunityId();
    removeStalePanels(id);
    if (!id) { state.opportunityId = ""; state.detail = null; return true; }
    if (!savedDecisionView(id)) return false;
    if (id === state.opportunityId && state.detail) return paint(id);
    if (id === state.opportunityId && (state.loading || state.failed)) return true;
    state.opportunityId = id; state.detail = null; state.failed = false; state.loading = true;
    const serial = ++state.serial;
    try {
      const detail = await load(id);
      if (serial !== state.serial || id !== state.opportunityId) return true;
      state.detail = detail;
    } catch (_) {
      if (serial === state.serial) state.failed = true;
      return true;
    } finally {
      if (serial === state.serial) state.loading = false;
    }
    return paint(id);
  }

  // Bounded retries after a route change (the saved-decision view renders asynchronously); no page-wide observer.
  function schedule() {
    state.attempts = 0;
    const tick = async () => {
      if (await mount() && document.querySelector(`[${PANEL}]`) || ++state.attempts >= 24) return;
      window.setTimeout(tick, 250);
    };
    tick();
  }
  window.addEventListener("hashchange", () => { state.serial++; state.opportunityId = ""; state.detail = null; removeStalePanels(""); schedule(); });
  schedule();

  window.FlipForgeOutcomeTimeline = Object.freeze({ valid, markup, mount, STATE_LABELS, STREAM_LABELS, MOVEMENT_LABELS });
})();
