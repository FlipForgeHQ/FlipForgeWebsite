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
    const horizons = timeline.checkpoints.map(c => Number(c?.horizonDays));
    if (horizons.length !== 3 || !HORIZONS.every((h, i) => horizons[i] === h)) return false;
    return timeline.checkpoints.every(c => isObject(c) && Object.prototype.hasOwnProperty.call(STATE_LABELS, c.state)
      && c.state !== "HISTORICAL_RECONSTRUCTION" && isObject(c.evidence) && isObject(c.comparisonToBaseline) && isObject(c.comparisonToPrior)
      && Array.isArray(c.customerReports) && c.customerReports.every(r => isObject(r) && r.verified === false && r.countedAsMarketPrice === false)
      && (c.state === "PRICE_OBSERVED" || !finite(c.evidence.observedValueCents))
      && (c.state === "PRICE_OBSERVED" || c.comparisonToBaseline.comparable !== true));
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

  function checkpointMarkup(c) {
    const label = STATE_LABELS[c.state];
    const price = c.state === "PRICE_OBSERVED" && finite(c.evidence.observedValueCents) ? money(c.evidence.observedValueCents) : "None";
    const reliability = RELIABILITY_LABELS[c.evidence.reliability] || RELIABILITY_LABELS.NONE;
    const conflict = c.evidenceConflict?.present === true ? `<p class="ff-otl-conflict" data-ff-otl-conflict>${escapeHtml(text(c.evidenceConflict.explanation))}</p>` : "";
    const reports = c.customerReports.length ? `<ul class="ff-otl-reports">${c.customerReports.map(reportLine).join("")}</ul>` : "";
    const windowWord = c.windowState === "CLOSED" ? "Window closed" : c.windowState === "OPEN" ? "Window open until" : "Window closes";
    return `<article class="customer-outcome-checkpoint ff-otl-checkpoint" data-state="${escapeHtml(c.state)}" data-ff-otl-horizon="${escapeHtml(c.horizonDays)}">`
      + `<div class="customer-outcome-checkpoint-head"><span class="eyebrow">Day ${escapeHtml(c.horizonDays)}</span><strong class="ff-otl-state" data-ff-otl-state="${escapeHtml(c.state)}">${escapeHtml(label)}</strong></div>`
      + `<p class="ff-otl-dates">Due ${escapeHtml(text(c.dueOnText))} · ${escapeHtml(windowWord)} ${escapeHtml(text(c.windowClosesOnText))}</p>`
      + `<p class="ff-otl-explanation">${escapeHtml(text(c.explanation))}</p>`
      + `<div class="customer-outcome-checkpoint-grid"><span><small>Price at checkpoint</small><strong>${escapeHtml(price)}</strong></span>`
      + `<span><small>Evidence</small><strong>${escapeHtml(reliability)}</strong></span>`
      + comparisonLine("Change vs. original decision", c.comparisonToBaseline)
      + comparisonLine(c.horizonDays === 7 ? "Change vs. earlier checkpoint" : `Change vs. ${finite(c.comparisonToPrior.comparedWithHorizonDays) ? `Day ${c.comparisonToPrior.comparedWithHorizonDays}` : "earlier checkpoint"}`, c.comparisonToPrior)
      + `</div>${conflict}${reports}${reconstructionMarkup(c.historicalReconstruction)}</article>`;
  }

  function header(badge) {
    return `<header class="panel-header"><div><span class="eyebrow">Outcome Intelligence</span><h2>Day 7 · Day 14 · Day 30</h2>`
      + `<p>What reliable evidence showed after your saved decision. Dates are Eastern Time.</p></div>${badge}</header>`;
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
    const reliable = timeline.checkpoints.filter(c => c.state === "PRICE_OBSERVED").length;
    const why = Array.isArray(d.why) ? d.why.filter(line => typeof line === "string" && line.trim()).slice(0, 3) : [];
    const baseline = d.baselineSupported === true && finite(d.baselineSupportedValueCents)
      ? `<span><small>Supported value at decision</small><strong>${escapeHtml(money(d.baselineSupportedValueCents))}</strong></span>`
      : `<span><small>Comparison baseline</small><strong>None</strong><em>${escapeHtml(text(d.baselineExplanation))}</em></span>`;
    const receipt = d.receiptPresent === true
      ? `<span><small>Decision Receipt</small><strong>Preserved, unchanged</strong></span>`
      : `<span><small>Decision Receipt</small><strong>Saved before receipts</strong></span>`;
    const outside = Array.isArray(timeline.customerReportsOutsideCheckpoints) && timeline.customerReportsOutsideCheckpoints.length
      ? `<ul class="ff-otl-reports">${timeline.customerReportsOutsideCheckpoints.filter(r => isObject(r) && r.verified === false).map(reportLine).join("")}</ul>` : "";
    return `<section class="panel customer-outcome-panel ff-otl" ${PANEL} ${BOUND}="${id}">`
      + header(`<span class="badge ${reliable ? "badge-ok" : "badge-neutral"}" data-ff-otl-badge>${reliable}/3 with a reliable price</span>`)
      + `<div class="panel-body"><div class="customer-outcome-boundary"><strong>Tracking, not a new recommendation.</strong>`
      + `<span>Each checkpoint shows only what was recorded. A missing price is never estimated or filled in later, your own reports are never treated as verified, and one card's result does not show whether FlipForge's decisions are accurate in general.</span></div>`
      + `<section class="ff-otl-question" data-ff-otl-question="recommended"><h3>1. What FlipForge recommended</h3>`
      + `<p class="ff-otl-answer"><b>${escapeHtml(text(d.recommendation))}</b> on ${escapeHtml(text(d.decidedOnText))}. ${escapeHtml(text(d.reasonExplanation))}</p>`
      + (why.length ? `<ul class="ff-otl-why">${why.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : "")
      + `<div class="customer-outcome-baseline">${baseline}${receipt}<span><small>Later re-evaluations</small><strong>${escapeHtml(String(Number(d.laterReevaluationCount) || 0))}</strong></span></div></section>`
      + `<section class="ff-otl-question" data-ff-otl-question="evidence"><h3>2. What reliable evidence appeared</h3>`
      + `<div class="customer-outcome-checkpoints">${timeline.checkpoints.map(checkpointMarkup).join("")}</div>${outside}</section>`
      + `<section class="ff-otl-question" data-ff-otl-question="conclusion"><h3>3. What can be concluded</h3>`
      + `<p class="ff-otl-answer" data-ff-otl-conclusion="${escapeHtml(text(timeline.conclusion.code))}">${escapeHtml(text(timeline.conclusion.statement))}</p></section>`
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

  window.FlipForgeOutcomeTimeline = Object.freeze({ valid, markup, mount, STATE_LABELS });
})();
