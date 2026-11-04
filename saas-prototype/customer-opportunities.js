(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const FIXED_PATHS = new Set(["/api/v1/health", "/api/v1/dashboard", "/api/v1/opportunities"]);

  const state = { main: null, requestedId: "", selectedId: "", loading: false, health: null, dashboard: null, opportunities: null, detail: null, evidence: null, psa: null, error: null, partialErrors: [] };
  // Every load gets a serial. Only the newest load may write state or paint: when a customer switches cards, a slower
  // response for the card they left (or an earlier failure) must never replace the card they are now viewing.
  let loadSerial = 0;
  const STALE = Symbol("stale-card-intelligence-load");
  // The route in the address bar. Other routes (Dashboard, Tracking...) are painted by other renderers into the same
  // #main-content, so a load may only write or paint while the address bar is still on the route it was started for.
  function routeKey() { return String(window.location.hash || "").replace(/^#\/?/, "").split("?")[0]; }
  // The card id in the address bar, or "" off a Card Intelligence route.
  function routeCardId() {
    const match = String(window.location.hash || "").match(/^#\/?opportunities\/([^/?#]+)/);
    if (!match) return "";
    try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
  }

  function productionHost() { return PRODUCTION_HOST.test(String(window.location.hostname || "")); }
  function eligibleHost() {
    const host = String(window.location.hostname || "");
    const pathname = String(window.location.pathname || "");
    if (PRODUCTION_HOST.test(host)) return APP_PATH.test(pathname);
    return PREVIEW_HOST.test(host);
  }
  function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function safeArray(value) { return Array.isArray(value) ? value : []; }
  function safeNumber(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function money(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(safeNumber(value)); }
  // The saved ask is shown exactly (cents included), the same as Max Buy; whole-dollar rounding hid the real amount.
  function moneyExact(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safeNumber(value)); }
  function moneyFromCents(value) { return money(safeNumber(value) / 100); }
  function correlationId() { return window.crypto && typeof window.crypto.randomUUID === "function" ? window.crypto.randomUUID() : `customer-opportunities-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function normalizeCardDisplay(value) {
    return String(value ?? "")
      .replace(/(^|\s)%(\d{1,4})(?=\s|$)/g, "$1#$2")
      .replace(/\s+/g, " ")
      .trim();
  }
  function cardDisplay(item) {
    const title = normalizeCardDisplay(item?.title);
    const identity = normalizeCardDisplay(item?.cardIdentity);
    const fallback = normalizeCardDisplay(item?.id);
    const primary = title || identity || fallback;
    const secondary = identity && identity.toLocaleLowerCase("en-US") !== primary.toLocaleLowerCase("en-US") ? identity : "";
    return { title: primary, identity: secondary };
  }
  function mappingConfirmed(item) { return String(item?.mappingState || "").toUpperCase() === "CONFIRMED"; }
  function mappingLabel(item) { return mappingConfirmed(item) ? "Catalog linked" : "Provider catalog reference unavailable"; }
  // /app/beta (index.html) is the page invited testers use; /app/customer (customer.html) marks itself on <html>.
  function betaSurface() { try { return !document.documentElement.classList.contains("ff-full-customer-app"); } catch (_) { return true; } }
  // Customer-facing page wording. This renderer is the only writer of these headings.
  const LIST_HEADING = ["Saved cards", "Saved Decisions", "Reopen a card to review the decision or continue tracking it."];
  const DETAIL_HEADING = ["Your result", "Your Decision", "Decision, value, risk, why, and evidence — with deeper detail when you need it."];
  const DECISION_COPY = Object.freeze({
    BUY: "The saved evidence supports this purchase at the evaluated price, within the stated risks and limits.",
    WATCH: "There may be an opportunity here, but the price or evidence is not strong enough yet.",
    VERIFY: "There is not enough matching evidence yet to make this purchase confidently.",
    PASS: "The current evidence does not justify this purchase at the evaluated price."
  });
  // Customer words for text the server sends (status messages, boundaries, change summaries). The page's own copy is
  // already written in these words; server text is translated here, at render, instead of by a page-wide rewrite.
  const SERVER_TEXT_EXACT = new Map([["NOT_CONFIRMED", "Not confirmed"], ["MIXED_DISPLAY_ONLY", "Display-only / mixed"], ["INSUFFICIENT_SAVED_CONTEXT", "Not enough saved context"], ["PSA_CONTEXT_MISSING", "PSA context missing"], ["NEEDS_VALUE_EVIDENCE", "Needs exact sold evidence"], ["GRANTED_ON_COMPLETION", "Saved after evaluation"], ["DENY", "Protected"]]);
  const SERVER_TEXT_WORDS = [
    [/\b(?:Saved|Tenant-owned) SQLite records\b/gi, "Saved decisions in your account"], [/\byour (?:tenant-owned|saved) workspace\b/gi, "your account"],
    [/\btenant-owned\b/gi, "saved to your account"], [/\btenant-scoped\b/gi, "account-specific"], [/\bSQLite saved\b/gi, "saved to your account"],
    [/\bSQLite\b/g, "your account"], [/\bprovider-backed\b/gi, "connected-source"], [/\bProvider context\b/g, "Marketplace context"],
    [/\bprovider context\b/gi, "marketplace context"], [/\bgoverned evidence\b/gi, "qualified evidence"], [/\bauthority-ineligible\b/gi, "not eligible"],
    [/\bAuthority output\b/g, "Decision"], [/\bauthority output\b/gi, "decision"], [/\bsole decision authority\b/gi, "decision engine"],
    [/\bsole BUY\/WATCH\/VERIFY\/PASS authority\b/gi, "BUY/WATCH/VERIFY/PASS decision engine"],
    [/Existing PSA intelligence remains the sole grading-guidance authority\.?/gi, "PSA Advisor provides grading guidance."],
    [/Smart Opportunity remains the sole BUY\/WATCH\/VERIFY\/PASS authority\.?/gi, "Smart Opportunity provides the BUY/WATCH/VERIFY/PASS decision."],
    [/No local scoring\.?/gi, "No hidden re-scoring."], [/authority-required/gi, "required"], [/authority-eligible/gi, "eligible"],
    [/browser-side/g, "local"], [/authority contract/g, "service validation"]
  ];
  function customerWords(value) {
    const text = String(value ?? "");
    const trimmed = text.trim();
    if (SERVER_TEXT_EXACT.has(trimmed)) return text.replace(trimmed, SERVER_TEXT_EXACT.get(trimmed));
    return SERVER_TEXT_WORDS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
  }
  function decisionKey() {
    return `<details class="ff-decision-key" data-ff-decision-key><summary>What do BUY / WATCH / VERIFY / PASS mean?</summary>
      <div class="ff-decision-key-grid">${Object.entries(DECISION_COPY).map(([key, copy]) => `<div><strong>${key}</strong><span>${copy}</span></div>`).join("")}</div></details>`;
  }
  // "2026-10-08T17:55:16.566881179Z" -> "Oct 8, 2026" (UTC date). Anything that is not an ISO timestamp is kept as is.
  function readableDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?$/.exec(String(value || "").trim());
    if (!match) return value;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? `${months[month - 1]} ${Number(match[3])}, ${match[1]}` : value;
  }
  // Shared display helpers (customer-trust-display-v1.js). Display only: values are shown as the API returned them.
  function trust() { return window.FlipForgeTrustDisplay || null; }
  function scoreText(value) { return trust() ? trust().scoreText(value) : (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? "Unavailable" : `${Number(value)}/100`); }
  function riskScore(item) { return trust() ? trust().riskValue(item) : item?.risk; }
  function legacyMarkup(item, options) { return trust() ? trust().legacyMarkup(item, options) : ""; }
  function supportedValueAvailable(item, acceptedSalesOverride) {
    const acceptedSales = safeNumber(acceptedSalesOverride ?? item?.evidence?.acceptedSales);
    return acceptedSales > 0 && safeNumber(item?.supportedValue) > 0;
  }
  function supportedValueText(item, acceptedSalesOverride) {
    return supportedValueAvailable(item, acceptedSalesOverride) ? money(item?.supportedValue) : "Unavailable";
  }
  // Saved-list columns (2026-10-31). Sale records are no longer kept, so today's accepted-sale count is 0 even for a
  // decision that was made on 8 exact sales. The list shows what the saved receipt recorded, labelled "at decision".
  // A legacy result keeps its historical wording; nothing here recalculates a decision.
  function freshnessText(value) {
    const code = String(value || "").trim().toUpperCase();
    if (!code) return "Unavailable";
    const known = { CURRENT: "Current", FRESH: "Current", STALE: "Stale", MIXED: "Mixed", MIXED_DISPLAY_ONLY: "Mixed · shown for context", UNKNOWN: "Unavailable" };
    return known[code] || (/^[A-Z][A-Z0-9_]+$/.test(code) ? code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ") : String(value));
  }
  function savedReceipt(item) {
    const governed = item?.governedDecision;
    if (!governed || governed.available !== true) return null;
    if (trust()?.isLegacy && trust().isLegacy(item)) return null;
    return governed;
  }
  function listSupportedCell(item) {
    if (trust()?.isLegacy && trust().isLegacy(item)) return `<span>Not currently supported</span>`;
    const receipt = savedReceipt(item);
    const cents = Number(receipt?.supportedValueCents);
    if (receipt && Number.isFinite(cents) && cents > 0) return `<span>${escapeHtml(moneyFromCents(cents))}</span><small class="ff-at-decision" style="display:block">at decision</small>`;
    return `<span>${escapeHtml(supportedValueText(item))}</span>`;
  }
  // A count the server did not send stays unknown. Number(null) is 0, so missing values are checked before converting.
  function knownCount(value) {
    if (value === null || value === undefined || typeof value === "boolean") return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
  }
  function listEvidenceCell(item) {
    if (trust()?.isLegacy && trust().isLegacy(item)) return `<span>Withheld</span>`;
    const receipt = savedReceipt(item);
    if (receipt) {
      // The saved decision exists: show its own count, never today's count in its place.
      const count = knownCount(receipt.exactTrustedCompCount);
      return count === null
        ? `<span data-count-unavailable>Unavailable</span><small class="ff-at-decision" style="display:block">not recorded at decision</small>`
        : `<span>${count} exact sale${count === 1 ? "" : "s"}</span><small class="ff-at-decision" style="display:block">at decision</small>`;
    }
    const current = knownCount(item.evidence?.acceptedSales);
    return current === null ? `<span data-count-unavailable>Unavailable</span>` : `<span>${current}</span>`;
  }
  function validValueIntelligence(value) {
    if (value == null) return true;
    if (typeof value !== "object" || Array.isArray(value)) return false;
    const numericFields = ["directSupportedValueCents", "referenceLowCents", "referenceMidpointCents", "referenceHighCents", "analogCompletedSaleCount"];
    return typeof value.basis === "string"
      && typeof value.confidenceBand === "string"
      && typeof value.explanation === "string"
      && typeof value.version === "string"
      && value.recommendationAuthority === false
      && value.priceAdjustmentApplied === false
      && typeof value.exactEvidenceRequired === "boolean"
      && numericFields.every(field => Number.isFinite(Number(value[field])) && Number(value[field]) >= 0)
      && safeNumber(value.referenceLowCents) <= safeNumber(value.referenceMidpointCents)
      && safeNumber(value.referenceMidpointCents) <= safeNumber(value.referenceHighCents);
  }

  function allowedPath(path) {
    const value = String(path || "");
    if (FIXED_PATHS.has(value)) return value;
    const match = value.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor)\/([^/?#]+)$/);
    if (!match) throw new Error("The requested Card Intelligence path is not allowlisted.");
    let decoded = "";
    try { decoded = decodeURIComponent(match[2]); } catch (_) { throw new Error("The requested saved-card identifier is invalid."); }
    if (!SAFE_ID.test(decoded)) throw new Error("The requested saved-card identifier is invalid.");
    return value;
  }
  function validEnvelope(payload, expectedCorrelationId) {
    const meta = payload?.meta;
    return Boolean(meta) && meta.contractVersion === CONTRACT_VERSION && typeof meta.engineVersion === "string" && meta.engineVersion.length > 0 && meta.authority === "Smart Opportunity" && meta.gradingAuthority === "Existing PSA intelligence" && meta.correlationId === expectedCorrelationId && Object.prototype.hasOwnProperty.call(payload, "data");
  }
  function validHealth(payload, expectedCorrelationId) { return Boolean(payload?.meta && payload?.data) && payload.meta.contractVersion === CONTRACT_VERSION && payload.meta.correlationId === expectedCorrelationId; }
  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) throw Object.assign(new Error("The Card Intelligence response exceeded the browser safety limit."), { code: "CARD_INTELLIGENCE_RESPONSE_TOO_LARGE" });
    try { return text ? JSON.parse(text) : {}; } catch (_) { throw Object.assign(new Error("The Card Intelligence gateway returned invalid JSON."), { code: "CARD_INTELLIGENCE_INVALID_JSON" }); }
  }
  async function request(path) {
    const safePath = allowedPath(path);
    const requestCorrelationId = correlationId();
    const response = await fetch(safePath, { method: "GET", headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId }, credentials: "same-origin", cache: "no-store", redirect: "error" });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Card Intelligence request failed with status ${response.status}.`), { code: upstream.code || "CARD_INTELLIGENCE_REQUEST_FAILED", status: response.status, correlationId: upstream.correlationId || requestCorrelationId });
    }
    const valid = safePath === "/api/v1/health" ? validHealth(payload, requestCorrelationId) : validEnvelope(payload, requestCorrelationId);
    if (!valid) throw Object.assign(new Error("The Card Intelligence response failed the FlipForge authority contract."), { code: "CARD_INTELLIGENCE_CONTRACT_INVALID" });
    return payload;
  }

  function badge(label, tone = "neutral") {
    const decision = String(label || "").trim().toUpperCase();
    const meaning = Object.prototype.hasOwnProperty.call(DECISION_COPY, decision) ? DECISION_COPY[decision] : "";
    const described = meaning ? ` data-ff-decision="${decision}" title="${escapeHtml(meaning)}" aria-label="${escapeHtml(`${decision}. ${meaning}`)}"` : "";
    return `<span class="staging-status staging-status-${escapeHtml(tone)}"${described}>${escapeHtml(label)}</span>`;
  }
  // A saved decision the server reports as preserved but not reproducible today (price-intelligence.js
  // savedDecisionReconciliation, from this page's own detail response): the hero badge names the saved verdict, with
  // the saved-vs-current summary as its label.
  function heroDecisionBadge(item, reconciliation) {
    const label = item.recommendation || "UNKNOWN";
    const tone = String(item.recommendation || "unknown").toLowerCase();
    if (!reconciliation) return badge(label, tone);
    const decision = String(label).trim().toUpperCase();
    const summary = escapeHtml(reconciliation.summary);
    const attributes = Object.prototype.hasOwnProperty.call(DECISION_COPY, decision)
      ? ` data-ff-decision="${decision}" title="${summary}" aria-label="${summary}"`
      : ` aria-label="${summary}" title="${summary}"`;
    return `<span class="staging-status staging-status-${escapeHtml(tone)}"${attributes}>${escapeHtml(reconciliation.heroBadge)}</span>`;
  }
  function valueIntelligencePanel(item) {
    const value = item?.valueIntelligence;
    if (!value || value.basis !== "ANALOG_REFERENCE_RANGE") return "";
    if (safeNumber(value.referenceHighCents) <= 0 || safeNumber(value.analogCompletedSaleCount) <= 0) return "";
    const range = `${moneyFromCents(value.referenceLowCents)} – ${moneyFromCents(value.referenceHighCents)}`;
    return `<section class="staging-value-intelligence" aria-label="Saved value intelligence context"><div class="staging-value-intelligence-head"><div><span class="eyebrow">Value intelligence</span><h3>Observed analog reference range</h3></div><span class="staging-value-context-badge">Context only</span></div><div class="staging-value-intelligence-grid"><div><span>Observed range</span><strong>${escapeHtml(range)}</strong></div><div><span>Reference midpoint</span><strong>${escapeHtml(moneyFromCents(value.referenceMidpointCents))}</strong></div><div><span>Analog completed sales</span><strong>${safeNumber(value.analogCompletedSaleCount)}</strong></div><div><span>Confidence band</span><strong>${escapeHtml(value.confidenceBand || "UNKNOWN")}</strong></div></div><p>${escapeHtml(value.explanation || "Governed analog completed-sale context is available for this saved card.")}</p><div class="boundary-note"><strong>Not a supported value:</strong> This observed range is saved read-only context. Matched exact sales are still required before it can become supported value, and it does not change the Smart Opportunity recommendation.</div></section>`;
  }
  function pageHeading([eyebrow, title, description], actions = "") { return `<header class="page-heading"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</header>`; }
  function errorPanel(error) {
    if (!error) return "";
    const guidance = error.status === 401 ? "Sign in with an invited FlipForge private-beta account." : error.status === 403 ? "The signed-in account needs an active FlipForge tenant membership." : "No mock record or browser-generated recommendation was substituted.";
    const returnPath = state.selectedId ? `/app/#/opportunities/${encodeURIComponent(state.selectedId)}` : "/app/#/opportunities";
    const signIn = error.status === 401 ? `<div class="customer-intelligence-actions"><a class="button button-primary" href="${productionHost() ? `/production-auth.html?return=${encodeURIComponent(returnPath)}` : `/staging-auth.html?returnTo=${encodeURIComponent(returnPath.replace(/^\/app/, "/saas-prototype"))}`}">Sign in securely</a></div>` : "";
    return `<section class="panel staging-error consumer-state consumer-state-error" role="alert"><div class="panel-body"><strong data-error-code="${escapeHtml(error.code || "CARD_INTELLIGENCE_UNAVAILABLE")}">We couldn't complete that request.</strong><p>${escapeHtml(error.message)}</p><small>${escapeHtml(guidance)}</small>${signIn}</div></section>`;
  }
  function opportunityItems() { return safeArray(state.opportunities?.data?.items).filter(item => SAFE_ID.test(String(item?.id || ""))); }
  function metricCards() {
    const metrics = state.dashboard?.data?.metrics || {};
    // While no sale records are kept, the server's "evidence ready" count is 0 for every card, including decisions
    // made on exact sales. Show instead how many saved receipts were decided on exact sales (read from the receipts).
    const items = opportunityItems();
    const salesOff = items.length > 0 && items.every(item => String(item?.evidence?.priceStatus || "").toUpperCase() === "LIVE_PRICING_ONLY");
    const evidenceTile = salesOff
      ? ["Decided on exact sales", items.filter(item => (knownCount(savedReceipt(item)?.exactTrustedCompCount) || 0) > 0).length]
      : ["Evidence ready", safeNumber(metrics.evidenceReady)];
    const values = [["Tracked decisions", safeNumber(metrics.trackedOpportunities)], evidenceTile, ["Population context", safeNumber(metrics.populationContextAvailable)], ["Needs verification", safeNumber(metrics.needsVerification)]];
    return `<section class="staging-metrics" aria-label="Authoritative saved intelligence metrics">${values.map(([label, value]) => `<article class="panel"><div class="panel-body"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div></article>`).join("")}</section>`;
  }
  function opportunityTable() {
    const items = opportunityItems();
    if (!items.length) return `<div class="staging-empty consumer-state consumer-state-empty"><strong>No saved decisions yet.</strong><p>Evaluate one exact card to create your first saved decision.</p><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Saved card</th><th>Decision</th><th>Ask when evaluated</th><th>Supported</th><th>Confidence</th><th>Evidence</th><th>Catalog link</th></tr></thead><tbody>${items.map(item => { const display = cardDisplay(item); return `<tr data-customer-opportunity="${escapeHtml(item.id)}" tabindex="0"><td><strong>${escapeHtml(display.title)}</strong>${display.identity ? `<small>${escapeHtml(display.identity)}</small>` : ""}${legacyMarkup(item, { compact: true })}</td><td>${badge(item.recommendation || "UNKNOWN", String(item.recommendation || "unknown").toLowerCase())}</td><td>${moneyExact(item.ask)}</td><td data-list-supported>${listSupportedCell(item)}</td><td>${escapeHtml(scoreText(item.confidence))}</td><td data-list-evidence>${listEvidenceCell(item)}</td><td>${escapeHtml(mappingLabel(item))}</td></tr>`; }).join("")}</tbody></table></div>`;
  }
  // Private Beta three-step workflow strip, under the page heading (formerly inserted by beta-customer-flow-v2.js).
  // Completed steps come from guided mode's saved progress; nothing here changes a decision.
  function workflowStripMarkup(current) {
    if (!betaSurface()) return "";
    let completed = new Set();
    try { completed = new Set(window.FlipForgeGuidedMode?.getProgress?.()?.completed || []); } catch (_) { completed = new Set(); }
    const steps = [["discover", "Evaluate", "#/discover"], ["understand", "Decision", "#/opportunities"], ["track", "Track", "#/tracking"]];
    return `<nav class="ff-workflow-strip" data-ff-workflow-strip aria-label="Your FlipForge card workflow">${steps.map(([key, label, href], index) => {
      const done = completed.has(key);
      return `<a class="ff-workflow-step" href="${href}" data-done="${done}"${key === current ? ' aria-current="step"' : ""}><span class="ff-workflow-step-number">${done ? "\u2713" : index + 1}</span><span>${label}</span></a>`;
    }).join("")}</nav>`;
  }

  function listView() {
    const configured = state.health?.data?.status === "configured";
    const meta = state.opportunities?.meta || state.dashboard?.meta || {};
    // Blank limitation lines are not shown (and no empty "Known limitations" disclosure).
    const limitations = safeArray(meta.limitations).filter(entry => String(entry ?? "").trim());
    const actions = `<button class="button button-secondary" type="button" data-customer-opportunities-refresh>Refresh</button><a class="button button-primary" href="#/evaluate">Evaluate a card</a>`;
    // The service summary (model, freshness, controls) is shown in the full customer app only; /app/beta keeps the
    // list to the saved cards themselves.
    const contract = betaSurface() ? "" : `<section class="panel customer-contract-panel"><div class="panel-body"><div><span>Model</span><strong>${escapeHtml(meta.engineVersion || "Authoritative service")}</strong></div><div><span>Evidence freshness</span><strong>${escapeHtml(freshnessText(meta.evidenceFreshness))}</strong></div><div><span>Customer controls</span><strong>Read, evaluate, understand, track</strong></div><div><span>Transaction actions</span><strong>None</strong></div></div>${limitations.length ? `<details><summary>Known limitations</summary><ul>${limitations.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}</section>`;
    return `<div class="page customer-intelligence-page customer-saved-decisions-page">${pageHeading(LIST_HEADING, actions)}${workflowStripMarkup("understand")}${decisionKey()}<div class="boundary-note"><strong>How this works:</strong> This workspace reads saved Smart Opportunity, evidence, and PSA outputs. It never substitutes mock records, recalculates a decision, or authorizes a transaction.</div>${state.loading ? `<div class="staging-loading consumer-state consumer-state-loading" role="status">Loading your saved intelligence…</div>` : ""}${errorPanel(state.error)}${configured && !state.error ? `${metricCards()}<section class="panel customer-intelligence-list"><header class="panel-header"><div><h2>Saved decisions</h2><p>Open a card to see the decision, value, risk, why, and evidence.</p></div><span class="staging-status staging-status-ok">Saved</span></header><div class="panel-body">${opportunityTable()}</div></section>${contract}` : ""}${!configured && state.health ? `<section class="panel"><div class="panel-body staging-empty consumer-state consumer-state-empty"><strong>Customer intelligence is safely offline.</strong><p>The customer gateway is disabled, so no account data request was attempted and no mock data was substituted.</p><a class="button button-secondary ff-empty-cta" href="#/discover">Discover a card</a></div></section>` : ""}</div>`;
  }
  // ---- Saved decision page parts. This renderer is the only writer of the saved decision page; the signal stack and
  // the evidence passport are markup modules it composes (customer-cdi-signal-stack-v1.js, decision-card-evidence-v1.js).
  const UNKNOWN_DECISION_COPY = "FlipForge has not returned a customer-facing decision for this saved record.";
  const METRIC_HELP = Object.freeze({
    Confidence: "How strongly the saved evidence and context support this result. It is not certainty.",
    Liquidity: "The saved liquidity factor returned by Smart Opportunity. Market activity does not remove risk.",
    Risk: "The saved uncertainty and downside factor returned by Smart Opportunity. It is not a price forecast.",
    Rank: "The saved opportunity-ranking factor returned by Smart Opportunity. It is not a price prediction."
  });
  // The saved, server-returned verdict of the record (never page text).
  function savedVerdict(item) {
    const value = String(item?.recommendation || "").trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(DECISION_COPY, value) ? value : "UNKNOWN";
  }
  // Decision risk as the API returned it for this saved card (governedDecision.risk, else risk). Display only.
  function decisionRisk(item) {
    const score = trust() ? trust().riskValue(item) : item?.risk;
    if (score === null || score === undefined || score === "" || !Number.isFinite(Number(score))) return { label: "Unavailable", score: "" };
    const value = Number(score);
    const bounded = Math.max(0, Math.min(100, value));
    const band = trust() ? trust().riskBand(value) : bounded >= 70 ? "High" : bounded >= 35 ? "Moderate" : "Low";
    return { label: band, score: `${value}/100` };
  }
  // A number shown on this page ("$169", "82/100"), or null when the text shows none ("Unavailable").
  function amountFromText(value) {
    const match = String(value || "").replace(/,/g, "").match(/\$?(-?\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
  }
  // 0-100 for the stack's visual; an unavailable score draws as 0 (the row still reads "Unavailable").
  function boundedScore(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; }
  // Plain-English reason and next step for the saved verdict (shown in the evidence passport). Wording only.
  function decisionNextCopy(decision, legacy, facts) {
    if (legacy) return { reason: `Saved recommendation: ${decision}. It is not presented as currently supported.`, next: "Evaluate the card again for a result under current evidence rules." };
    if (decision === "BUY") return { reason: "FlipForge found enough support for a BUY decision at the evaluated price.", next: "Review the exact evidence and risk before taking any action outside FlipForge." };
    if (decision === "WATCH") return { reason: "The current price or evidence does not support moving further yet.", next: "Add it to Tracking and watch for a better price or stronger evidence." };
    if (decision === "PASS") return { reason: "Price, evidence, risk, or a combination of those factors keeps this card below FlipForge's decision threshold.", next: "Read why, then move on or start another card." };
    if (decision !== "VERIFY") return { reason: "Read the plain-English result first, then open deeper intelligence only when you need it.", next: "Understand why the decision was reached before moving on." };
    const identity = /identity needs verification|mapping\s*(?:not confirmed|NOT_CONFIRMED)|provider UUID mapping remains unconfirmed/i.test(facts.serverText);
    const evidence = (!facts.atDecision && !facts.evidenceReady) || /no accepted exact completed sales|0 accepted|no exact sales|evidence-supported value is unavailable/i.test(facts.serverText);
    let reason = "FlipForge does not yet have enough matching evidence for a stronger decision.";
    if (identity && evidence) reason = "The exact card identity still needs confirmation, and there is not enough exact completed-sale evidence yet.";
    else if (identity) reason = "The exact card identity still needs confirmation before FlipForge can support a stronger decision.";
    else if (evidence) reason = "There is not enough exact completed-sale evidence yet to support a value or stronger decision.";
    return { reason, next: "Review what is missing, then decide whether to verify the identity or wait for stronger sold evidence." };
  }
  // "Saved" confirmation under the decision. On the private beta it also says when the customer has just evaluated the
  // card (flag set when Evaluate is pressed; read once) or when the server returned an existing saved decision.
  function savedDecisionBar(item) {
    const id = encodeURIComponent(item.id);
    if (!betaSurface()) return `<section class="ff-saved-decision-bar" data-ff-saved-decision-bar role="status"><div class="ff-saved-decision-copy"><span class="ff-saved-decision-check" aria-hidden="true">✓</span><div><strong>Saved automatically</strong><small>This evaluated decision is already in Saved Intelligence. Starting another card clears only the Discover workspace; this decision stays saved.</small></div></div><div class="ff-saved-decision-actions"><a class="button button-secondary" href="#/tracking/${id}">Track this card</a><button class="button button-primary" type="button" data-ff-new-card>+ Start another card</button><a class="button button-secondary" href="#/opportunities">View saved decisions</a></div></section>`;
    // "Just evaluated" is a one-time session flag kept by the save flow (customer-save-flow-v1.js); this renderer keeps
    // no browser state of its own.
    let justSaved = false;
    try { justSaved = window.FlipForgeSaveFlow?.consumeJustEvaluated?.() === true; } catch (_) { justSaved = false; }
    // Server semantic replay (semantic-replay-notice-v1.js): the saved decision was returned and no evaluation ran.
    let alreadyEvaluated = false;
    try {
      const marker = window.FlipForgeSemanticReplay?.current?.();
      alreadyEvaluated = Boolean(marker && marker.id === String(item.id) && Date.now() - marker.at <= 30000);
    } catch (_) { alreadyEvaluated = false; }
    if (alreadyEvaluated) justSaved = false;
    const heading = alreadyEvaluated ? "Already evaluated — saved decision" : justSaved ? "Evaluation complete & saved" : "Evaluation saved";
    return `<section class="ff-saved-decision-bar ff-save-confirmed${justSaved ? " ff-just-saved" : ""}" data-ff-saved-decision-bar role="status"><div class="ff-saved-decision-copy"><span class="ff-saved-decision-check" aria-hidden="true">✓</span><div><strong>${escapeHtml(heading)}</strong><small>This decision is saved to your account. Starting another card will not remove it.</small></div></div><div class="ff-saved-decision-actions"><a class="button button-primary" data-ff-show-why data-ff-native-evidence-link="" href="#/evidence/${id}">Understand this decision →</a><a class="button button-secondary" href="#/tracking/${id}">Track this card</a><button class="button button-secondary" type="button" data-ff-new-card>+ Start another card</button></div></section>`;
  }
  // Private beta comprehension check (POST /api/beta/feedback). It never changes the saved decision.
  const BETA_CHECK_ENDPOINT = "/api/beta/feedback";
  const BETA_CHECK_FIELDS = ["decisionUnderstood", "reasonUnderstood", "nextStepClear", "informationRelevant", "missingInfo", "evidenceImpact", "mostUsefulLayer"];
  function activeTester() { try { const session = window.FlipForgeIdentity?.getSnapshot?.(); return Boolean(session?.authenticated && session?.membershipActive); } catch (_) { return false; } }
  function betaDecisionCheck() {
    if (!betaSurface()) return "";
    const select = (name, label, options) => `<label><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}" required><option value="">Choose one</option>${options.map(([value, copy]) => `<option value="${escapeHtml(value)}">${escapeHtml(copy)}</option>`).join("")}</select></label>`;
    const yesNo = [["YES", "Yes"], ["PARTLY", "Partly"], ["NO", "No"]];
    const active = activeTester();
    return `<details class="ff-beta-cdi-check" data-ff-beta-cdi-check><summary><span><strong>Quick decision check</strong><small>Was this explanation clear and relevant to your card?</small></span><span aria-hidden="true">＋</span></summary><form data-ff-beta-cdi-form><div class="ff-beta-cdi-intro"><span>CARD DECISION INTELLIGENCE™</span><p>Help us learn whether the report explains what this decision means for your card—not whether you agree with it.</p></div><div class="ff-beta-cdi-grid">${select("decisionUnderstood", "Did you understand what this decision means for your card?", yesNo)}${select("reasonUnderstood", "Did you understand why FlipForge made that recommendation?", yesNo)}${select("nextStepClear", "Did you know what to do next?", yesNo)}${select("informationRelevant", "Was the information relevant to this card decision?", yesNo)}${select("missingInfo", "Was any information you needed missing?", [["NOTHING", "No, nothing was missing"], ["IDENTITY", "Card identity"], ["PRICE_VALUE", "Price, value or costs"], ["EVIDENCE", "Sales evidence"], ["RISK", "Risk or uncertainty"], ["NEXT_STEP", "What to do next"], ["OTHER", "Something else"]])}${select("evidenceImpact", "What did the evidence do to your confidence?", [["INCREASED", "Increased it"], ["NO_CHANGE", "No change"], ["DECREASED", "Decreased it"], ["NOT_VIEWED", "I did not view the evidence"]])}${select("mostUsefulLayer", "What helped most?", [["IDENTITY", "Exact card identity"], ["EVIDENCE", "Counted vs. excluded evidence"], ["ECONOMICS", "Price and supported value"], ["RISK_UNCERTAINTY", "Risk and uncertainty"], ["DECISION", "Why FlipForge made the call"], ["RECEIPT", "Decision Receipt / traceback"], ["OUTCOME", "Tracking what happens next"], ["NONE", "Nothing yet"]])}</div><label class="ff-beta-cdi-note"><span>What information was missing, irrelevant, or confusing? <small>Optional</small></span><textarea name="note" maxlength="600" placeholder="Tell us what you needed to understand this card decision better."></textarea></label><div class="ff-beta-cdi-actions"><button class="button button-secondary" type="submit"${active ? "" : " disabled"}>Send beta check</button><p data-ff-beta-cdi-message role="status" aria-live="polite">${active ? "" : "Active invited testers can submit this check."}</p></div><p class="ff-beta-cdi-boundary">This feedback does not change the saved decision, evidence authority, supported value, grading guidance, or transaction authority. Do not enter card identities, listing URLs, passwords, tokens, or other sensitive data.</p></form></details>`;
  }
  function bindBetaDecisionCheck(form) {
    const message = form.querySelector("[data-ff-beta-cdi-message]");
    const button = form.querySelector('button[type="submit"]');
    if (!message || !button || !activeTester()) return;
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const data = new FormData(form);
      const answers = Object.fromEntries(BETA_CHECK_FIELDS.map(field => [field, String(data.get(field) || "")]));
      if (BETA_CHECK_FIELDS.some(field => !answers[field])) {
        message.textContent = "Answer all seven quick questions before sending.";
        message.dataset.tone = "error";
        return;
      }
      const note = String(data.get("note") || "").trim();
      const payload = { category: "decision-explanation", route: "opportunities", checkpoint: "GENERAL", summary: note || "Card Decision Intelligence comprehension check completed.", ...answers };
      button.disabled = true;
      message.textContent = "Sending…";
      message.dataset.tone = "neutral";
      try {
        const response = await fetch(BETA_CHECK_ENDPOINT, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error("feedback rejected");
        form.reset();
        message.textContent = "Thank you. This helps us understand whether the decision was clear, relevant, and actionable.";
        message.dataset.tone = "ok";
      } catch (_) {
        message.textContent = "The beta check could not be saved. Your decision was not affected.";
        message.dataset.tone = "error";
      } finally {
        button.disabled = false;
      }
    });
  }
  // Full customer app: how to read each part of the decision (not offered on /app/beta).
  function decisionExplainer() {
    return `<section class="panel customer-intelligence-explainer" data-intelligence-explainer><header class="panel-header"><div><h2>How to read this decision</h2><p>FlipForge separates what the saved evaluation knows from what still requires judgment.</p></div><span class="staging-status staging-status-ok">Explainable</span></header><div class="panel-body customer-intelligence-explainer-grid"><article><span>Supported value</span><strong>Evidence-backed reference</strong><p>Uses the saved evaluation's accepted evidence. It is not a guaranteed future sale price.</p></article><article><span>Confidence</span><strong>Strength of support</strong><p>Shows how strongly the saved evidence and context support the result. It is not certainty.</p></article><article><span>Liquidity</span><strong>Market activity context</strong><p>Displays the saved liquidity factor returned by Smart Opportunity. Liquidity does not eliminate risk.</p></article><article><span>Risk</span><strong>Uncertainty and downside</strong><p>Displays the saved risk factor. It is not a prediction of future price movement.</p></article><article><span>Rank</span><strong>Saved opportunity factor</strong><p>Shows the rank returned by Smart Opportunity. It is not a price target or transaction instruction.</p></article><article><span>PSA guidance</span><strong>Saved grading context</strong><p>Existing PSA intelligence can provide context, but this screen does not predict a grade.</p></article></div><footer>Active marketplace listings remain discovery inputs. Only eligible completed-sale evidence can support sold-market evidence in the saved decision.</footer></section>`;
  }
  function tracebackStep(label, title, detail, tone = "ok") { const mark = tone === "ok" ? "✓" : tone === "warn" ? "!" : "•"; return `<article class="customer-trace-step"><span class="check-mark ${escapeHtml(tone)}">${mark}</span><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div></article>`; }
  function evidenceAuthorityBadge(item) { return item.authorityEligible === true ? badge("Counted now", "buy") : ({ EXCLUDED: badge("Excluded", "pass"), HELD: badge("Held for review", "warn"), NOT_USED: badge("Not used", "neutral") }[String(item.currentAdmissionStatus || "").toUpperCase()] || badge("Not counted", "neutral")); }
  function linkedEvidenceTable(evidence) {
    const items = safeArray(evidence?.linkedEvidence);
    // Rows from our data provider are summarised by count and reason (providerEvidenceSummary), never as a sale table.
    const provider = trust() ? trust().providerSummaryMarkup(evidence) : "";
    if (!items.length) return provider || `<div class="staging-empty consumer-state consumer-state-empty"><strong>No linked evidence rows are available.</strong><p>No replacement comp was invented.</p><a class="button button-secondary ff-empty-cta" href="#/discover">Discover a card</a></div>`;
    if (provider) return provider + trust().evidenceTable(items, { identityCell: item => item.identityMatch === true ? badge("Exact match", "ok") : badge("Mismatch", "warn"), statusCell: evidenceAuthorityBadge });
    // Rows render from counts and categories when sale prices or dates are withheld (never blank, "undefined" or "$0").
    if (trust()) return trust().evidenceTable(items, { identityCell: item => item.identityMatch === true ? badge("Exact match", "ok") : badge("Mismatch", "warn"), statusCell: evidenceAuthorityBadge });
    return `<div class="table-wrap"><table><thead><tr><th>Evidence source</th><th>Amount</th><th>Sale date</th><th>Identity</th><th>Authority</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(item.sourceName || "Saved source")}</strong><small>${escapeHtml(item.type || "Unknown type")}</small></td><td>${money(item.amount)}</td><td>${escapeHtml(item.soldAt || item.recordedAt || "Unavailable")}</td><td>${item.identityMatch === true ? badge("Exact match", "ok") : badge("Mismatch", "warn")}</td><td>${item.authorityEligible === true ? badge("Counted now", "buy") : ({ EXCLUDED: badge("Excluded", "pass"), HELD: badge("Held for review", "warn"), NOT_USED: badge("Not used", "neutral") }[String(item.currentAdmissionStatus || "").toUpperCase()] || badge("Not counted", "neutral"))}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function detailView() {
    const loaded = state.detail?.data?.opportunity;
    // Display only the record for the card that was requested and is still in the address bar.
    const item = loaded && String(loaded.id || "") === state.selectedId && routeCardId() === state.selectedId ? loaded : null;
    if (!item) return `<div class="page customer-intelligence-page customer-saved-decisions-page">${pageHeading([DETAIL_HEADING[0], DETAIL_HEADING[1], "Loading the saved decision and its evidence."], `<a class="button button-secondary" href="#/opportunities">Back to saved decisions</a>`)}${workflowStripMarkup("understand")}${state.loading ? `<div class="staging-loading consumer-state consumer-state-loading" role="status">Loading card intelligence…</div>` : ""}${errorPanel(state.error)}</div>`;
    const evidence = state.evidence?.data || {};
    const psa = state.psa?.data || {};
    const snapshot = psa.savedPsaSnapshot || {};
    const meta = state.detail?.meta || {};
    const acceptedSales = safeNumber(evidence.acceptedExactCompletedSales ?? item.evidence?.acceptedSales);
    const ineligible = safeNumber(evidence.visibleButAuthorityIneligible);
    // Sale records are no longer kept (review 2026-10-31): today's accepted count is 0 even for a decision made on exact
    // sales. Then every evidence section shows the count the saved receipt recorded, labelled "at decision", so a
    // saved BUY is never shown next to "No accepted exact completed sales". A count the receipt never recorded reads
    // "not recorded", never 0. Nothing is recalculated.
    const decisionReceipt = acceptedSales > 0 ? null : savedReceipt(item);
    const atDecision = Boolean(decisionReceipt);
    const salesAtDecision = atDecision ? knownCount(decisionReceipt.exactTrustedCompCount) : null;
    const salesWord = count => `${count} exact completed sale${count === 1 ? "" : "s"}`;
    const evidenceStep = !atDecision ? null : salesAtDecision === null
      ? tracebackStep("2 · Evidence", "Exact sales at decision not recorded", "This saved decision did not record how many exact completed sales it used, and no independent completed sales are counted for this card today. Sale records from our restricted data provider aren't kept.", "warn")
      : tracebackStep("2 · Evidence", `${salesWord(salesAtDecision)} at decision`, "Counted when this decision was made. They aren't listed or re-counted here: sale records from our restricted data provider aren't kept, and no independent completed sales are counted for this card today. Active asks never become sold evidence.", salesAtDecision > 0 ? "ok" : "warn");
    const chainBadge = !atDecision ? null : salesAtDecision === null ? ["Not recorded", "staging-status-warn"] : [`${salesAtDecision} at decision`, salesAtDecision > 0 ? "staging-status-ok" : "staging-status-warn"];
    // Max Buy from the saved receipt: shown only with an established supported value (the engine writes Max Buy 0 when
    // no value is established) and never for a legacy result. Exact cents, as recorded.
    const maxBuyReceipt = savedReceipt(item);
    const maxBuyCents = maxBuyReceipt && String(maxBuyReceipt.supportedValueStatus || "").toUpperCase() === "ESTABLISHED" && (knownCount(maxBuyReceipt.supportedValueCents) || 0) > 0 ? knownCount(maxBuyReceipt.maximumBuyPriceCents) : null;
    const maxBuyMarkup = maxBuyCents !== null && maxBuyCents > 0
      ? `<span>Max Buy</span><strong data-max-buy-at-decision>${escapeHtml(trust()?.centsText ? trust().centsText(maxBuyCents) : moneyFromCents(maxBuyCents))}</strong><small>At decision · the most you could pay, all-in, and keep FlipForge's profit protection. Not re-checked here.</small>`
      : "";
    const psaWords = { SAVED_GUIDANCE_AVAILABLE: "Saved guidance available", NOT_AVAILABLE: "Not available", INSUFFICIENT_CONTEXT: "Not enough context", UNAVAILABLE: "Not available" };
    const plainStatus = value => { const code = String(value || "").trim(); if (!code) return "Unavailable"; return psaWords[code.toUpperCase()] || (/^[A-Z][A-Z0-9_]+$/.test(code) ? code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ") : code); };
    const population = value => { const count = knownCount(value); return count === null ? "Unavailable" : String(count); };
    const ask = safeNumber(item.ask), supported = safeNumber(item.supportedValue), supportedAvailable = supportedValueAvailable(item, acceptedSales), gap = supportedAvailable ? supported - ask : 0, gapPercent = supportedAvailable && ask > 0 ? (gap / ask) * 100 : 0;
    const catalogLinked = mappingConfirmed(item), evidenceReady = acceptedSales > 0, psaAvailable = psa.guidanceStatus === "SAVED_GUIDANCE_AVAILABLE";
    const catalogLinkDetail = catalogLinked
      ? "The catalog link from our data provider is in place. The exact marketplace listing identity check remains a separate server-side check."
      : "The catalog link from our data provider is still pending. This is separate from the exact marketplace listing identity check.";
    const decisionBoundaryMessage = catalogLinked
      ? (item.statusMessage || item.authorityBoundary || "Review the saved evidence and unresolved limits before acting outside FlipForge.")
      : "The catalog link from our data provider remains separately governed. Review the saved exact evidence and market factors before acting outside FlipForge.";
    const display = cardDisplay(item);
    const title = display.title;
    const reconciliation = window.FlipForgePriceIntelligence?.savedDecisionReconciliation?.(state.detail?.data) || null;
    trust()?.remember(item);
    const legacy = legacyMarkup(item);
    const isLegacy = Boolean(trust()?.isLegacy && trust().isLegacy(item));
    const actions = `<a class="button button-secondary" href="#/opportunities">Saved decisions</a><a class="button button-secondary" href="#/tracking/${encodeURIComponent(item.id)}">Track</a><a class="button button-secondary" href="#/evaluate/${encodeURIComponent(item.id)}" data-card-reevaluate>Re-evaluate this listing</a><button class="button button-secondary" type="button" data-customer-opportunities-refresh>Refresh</button>`;
    const savedAt = readableDate(item.observedAt);
    const savedText = savedAt ? `Saved to your account · ${savedAt}` : "Saved to your account";
    const decision = savedVerdict(item);
    const meaning = isLegacy
      ? `Saved recommendation: ${decision}. ${trust()?.LEGACY_HISTORICAL || "It is not presented as currently supported."}`
      : (DECISION_COPY[decision] || UNKNOWN_DECISION_COPY);
    const risk = decisionRisk(item);
    // Supported value as this page shows it (also read by the signal stack and the evidence passport below).
    const receipt = !supportedAvailable ? savedReceipt(item) : null;
    const receiptCents = Number(receipt?.supportedValueCents), receiptSales = knownCount(receipt?.exactTrustedCompCount);
    const supportedAtDecision = Boolean(receipt && receiptCents > 0 && receiptSales > 0);
    const supportedText = supportedAtDecision ? moneyFromCents(receiptCents) : supportedValueText(item, acceptedSales);
    const supportedMarkup = supportedAtDecision
      // Sale records are no longer kept, so today's accepted-sale count can be 0 for a decision made on exact sales.
      // Then the saved receipt's value is shown, labelled as the value at decision (never recalculated here).
      ? `<strong data-supported-at-decision>${escapeHtml(supportedText)}</strong><small>At decision · based on ${receiptSales} exact sale${receiptSales === 1 ? "" : "s"}. Not re-checked here: sale records from our restricted data provider aren't kept.</small>`
      : `<strong${supportedAvailable ? " class=\"value-positive\"" : ""}>${escapeHtml(supportedText)}</strong><small>${supportedAvailable ? `${gap >= 0 ? "+" : ""}${money(gap)} · ${gapPercent.toFixed(1)}% difference from supported value` : isLegacy ? "Not currently supported. This result was saved before current evidence rules." : "No accepted exact completed-sale evidence supports a value yet."}</small>`;
    const askText = moneyExact(ask);
    const confidenceText = scoreText(item.confidence);
    const riskText = scoreText(riskScore(item));
    const maxBuyText = maxBuyCents !== null && maxBuyCents > 0 ? (trust()?.centsText ? trust().centsText(maxBuyCents) : moneyFromCents(maxBuyCents)) : "";
    const copy = decisionNextCopy(decision, isLegacy, { atDecision, evidenceReady, serverText: [item.statusMessage, item.authorityBoundary, item.changeSummary].join(" ") });
    const id = encodeURIComponent(item.id);
    const hero = `<section class="panel customer-intelligence-hero" data-ff-card-id="${escapeHtml(String(item.id || ""))}"><div class="panel-body"><div class="customer-hero-copy"><span class="eyebrow">${escapeHtml(item.platform || "Saved marketplace record")}</span><div class="customer-hero-title">${heroDecisionBadge(item, reconciliation)}<h2>${escapeHtml(title)}</h2></div><p class="ff-decision-meaning">${escapeHtml(meaning)}</p><div class="ff-risk-summary"><span>Decision risk</span><strong>${escapeHtml(risk.label)}</strong>${risk.score ? `<small>${escapeHtml(risk.score)} saved decision risk</small>` : ""}</div>${display.identity ? `<p>${escapeHtml(display.identity)}</p>` : ""}${legacy}<div class="customer-tracked-state"><span class="check-mark ok">✓</span><span><strong>Decision saved</strong><small>${escapeHtml(savedText)}</small></span></div></div><div class="customer-value-summary"><span>Ask when evaluated</span><strong>${askText}</strong><span>Supported value</span>${supportedMarkup}${maxBuyMarkup}${trust() ? trust().legacySavedValuesMarkup(item) : ""}<div class="customer-supported-value-note" data-supported-value-note="true"><strong>How to read supported value</strong><span>This is the value supported by accepted evidence in the saved evaluation. It is not a guaranteed sale price or an instruction to buy.</span></div></div></div></section>`;
    // The four checks behind the verdict (customer-cdi-signal-stack-v1.js markup). This page has no identity-check
    // result of its own for the Exact card tile, so the tile does not claim a failed check: it reads "See the decision
    // trail" and is marked "Not available yet" (the saved decision already reflects the server's identity gate).
    const stackModule = window.FlipForgeCustomerCdiSignalStackV1;
    const stack = typeof stackModule?.markup === "function" ? `<div data-ff-cdi-stack-host>${stackModule.markup(decision, {
      identity: title, reason: meaning, legacy: isLegacy, evidenceHref: `#/evidence/${id}`,
      signals: [
        { key: "exact", label: "Exact card", value: "See the decision trail", caption: "Confirm the saved card identity before relying on any comparison.", verified: null },
        { key: "sales", label: "Matched sales", value: "Review saved sales", caption: "See how many exact completed sales were allowed to support the decision.", accepted: null, excluded: null },
        { key: "price", label: "Price check", value: supportedText, caption: `Ask ${askText} · Supported ${supportedText}`, ask: amountFromText(askText), supported: amountFromText(supportedText) },
        { key: "uncertainty", label: "Uncertainty", value: `${confidenceText} confidence · ${riskText} risk`, caption: "Use the saved confidence and risk together, not as a guarantee.", confidence: boundedScore(amountFromText(confidenceText)), risk: boundedScore(amountFromText(riskText)) }
      ]
    })}</div>` : "";
    // Private beta: the evidence passport (decision-card-evidence-v1.js markup) and the quick decision check.
    const passportModule = betaSurface() ? window.FlipForgeDecisionCardEvidenceV1 : null;
    const passport = typeof passportModule?.markup === "function" ? passportModule.markup({
      decision,
      identity: meaning && meaning !== title ? `${title} · ${meaning}` : title,
      why: copy.reason,
      change: copy.next,
      accepted: atDecision ? (salesAtDecision === null ? "Not recorded" : `${salesAtDecision} at decision`) : String(acceptedSales),
      excluded: "Unavailable",
      ask: askText,
      supportedValue: supportedText,
      confidence: trust() ? trust().scoreText(trust().confidenceValue(item)) : confidenceText,
      risk: trust() ? trust().scoreText(trust().riskValue(item)) : riskText,
      exactIdentity: catalogLinked ? "Exact match" : "Needs review",
      legacy: isLegacy,
      economics: { "Max buy": maxBuyText, "Estimated costs": "", "Breakeven": "", "Potential profit": "" },
      observed: savedText,
      evidenceHref: `#/evidence/${id}`,
      trackingHref: `#/tracking/${id}`,
      receiptMode: "reference"
    }) : "";
    const metrics = `<details class="panel ff-decision-advanced"><summary><span><strong>More decision detail</strong><small>Confidence, liquidity, market factors and rank</small></span><span aria-hidden="true">+</span></summary><div class="customer-intelligence-metrics">${[["Confidence", confidenceText, METRIC_HELP.Confidence], ["Liquidity", `${safeNumber(item.liquidity)}/100`, METRIC_HELP.Liquidity], ["Decision risk", riskText, METRIC_HELP.Risk], ["Rank", `${safeNumber(item.rank)}/100`, METRIC_HELP.Rank]].map(([label, value, help]) => `<article><span>${label}</span><strong>${escapeHtml(value)}</strong><small class="customer-metric-help">${help}</small></article>`).join("")}</div></details>`;
    const grid = `<div class="customer-intelligence-grid"><div class="stack"><section class="panel" id="ff-decision-details"><header class="panel-header"><div><h2>Decision details</h2><p>How the saved decision was reached. No hidden re-scoring.</p></div>${badge(item.recommendation || "UNKNOWN", String(item.recommendation || "unknown").toLowerCase())}</header><div class="panel-body customer-traceback">${tracebackStep("1 · Provider catalog link", mappingLabel(item), catalogLinkDetail, catalogLinked ? "ok" : "warn")}${evidenceStep || tracebackStep("2 · Evidence", evidenceReady ? `${acceptedSales} accepted exact completed sale${acceptedSales === 1 ? "" : "s"}` : "No accepted exact completed sales", `${ineligible} visible record${ineligible === 1 ? " is" : "s are"} not counted now (excluded, held for review or not used). Active asks never become sold evidence.`, evidenceReady ? "ok" : "warn")}${tracebackStep("3 · Market factors", `Liquidity ${safeNumber(item.liquidity)} · Risk ${riskScore(item) ?? "Unavailable"} · Rank ${safeNumber(item.rank)}`, customerWords(item.changeSummary || "Saved factors are displayed exactly as returned by Smart Opportunity."), "neutral")}${tracebackStep("4 · Decision", item.recommendation || "UNKNOWN", customerWords(item.authorityBoundary || "Smart Opportunity remains authoritative."), "neutral")}</div></section><section class="panel" id="ff-evidence-chain"><header class="panel-header"><div><h2>Evidence</h2><p>Exact completed-sale evidence that can support the saved decision, plus excluded rows.</p></div><span class="staging-status ${chainBadge ? chainBadge[1] : evidenceReady ? "staging-status-ok" : "staging-status-warn"}">${escapeHtml(chainBadge ? chainBadge[0] : `${acceptedSales} accepted`)}</span></header><div class="panel-body">${linkedEvidenceTable(evidence)}</div></section></div><div class="stack"><section class="panel"><header class="panel-header"><div><h2>Evidence details</h2><p>What the engine could and could not use.</p></div></header><div class="panel-body staging-key-grid">${atDecision ? `<div><span>Exact sales at decision</span><strong data-sales-at-decision="${salesAtDecision === null ? "unknown" : salesAtDecision}">${salesAtDecision === null ? "Unavailable" : salesAtDecision}</strong></div><div><span>Accepted exact sales</span><strong>Not kept</strong></div>` : `<div><span>Accepted exact sales</span><strong>${acceptedSales}</strong></div>`}<div><span>Not counted now</span><strong>${ineligible}</strong></div><div><span>Average accepted price</span><strong>${acceptedSales > 0 && item.evidence?.averagePrice !== null && item.evidence?.averagePrice !== undefined && Number.isFinite(Number(item.evidence.averagePrice)) ? money(item.evidence.averagePrice) : "Unavailable"}</strong></div><div><span>Latest accepted sale</span><strong>${escapeHtml(item.evidence?.latestSaleDate || "Unavailable")}</strong></div><div><span>Provider catalog link</span><strong>${catalogLinked ? "Linked" : "Pending"}</strong></div><div><span>Evidence freshness</span><strong>${escapeHtml(freshnessText(meta.evidenceFreshness))}</strong></div></div></section><section class="panel" id="ff-psa-context"><header class="panel-header"><div><h2>PSA context</h2><p>Saved PSA guidance from the existing grading intelligence. No grade is predicted here.</p></div>${badge(psaAvailable ? "Available" : "Insufficient context", psaAvailable ? "ok" : "warn")}</header><div class="panel-body staging-key-grid"><div><span>Guidance status</span><strong>${escapeHtml(plainStatus(psa.guidanceStatus))}</strong></div><div><span>Readiness</span><strong>${escapeHtml(plainStatus(snapshot.readinessStatus))}</strong></div><div><span>PSA 10 population</span><strong>${escapeHtml(population(psa.populationContext?.psa10Population))}</strong></div><div><span>PSA 9 population</span><strong>${escapeHtml(population(psa.populationContext?.psa9Population))}</strong></div><div><span>Manual verification</span><strong>${snapshot.manualVerificationRequired === true ? "Required" : "Not returned"}</strong></div><div><span>Recalculated</span><strong>${psa.recalculated === true ? "Yes" : "No"}</strong></div></div>${psa.authorityConflict ? `<div class="boundary-note"><strong>Authority conflict:</strong> ${escapeHtml(customerWords(psa.authorityConflict))}</div>` : ""}</section><section class="panel customer-decision-boundary"><div class="panel-body"><span class="eyebrow">Before you buy. Know Why.</span><h2>${escapeHtml(reconciliation ? reconciliation.boundaryHeading : `${item.recommendation || "UNKNOWN"} is decision support`)}</h2><p>${escapeHtml(reconciliation ? reconciliation.boundaryText : customerWords(decisionBoundaryMessage))}</p><small>No bid, checkout, payment, evidence acceptance, or grade prediction is authorized.</small></div></section></div></div>`;
    const partial = state.partialErrors.length ? `<section class="panel staging-warning"><div class="panel-body"><strong>Some saved context is unavailable.</strong><ul>${state.partialErrors.filter(entry => entry.key !== "detail").map(entry => { const subject = ({ evidence: "evidence detail", psa: "grading context", lifecycle: "tracking", alerts: "alerts", reportedSales: "reported sales" })[entry.key] || "this section"; const said = trust()?.customerErrorText ? trust().customerErrorText(entry.error, subject) : { title: entry.error?.code || "Unavailable" }; return `<li data-error-code="${escapeHtml(entry.error?.code || "")}">${escapeHtml(said.title)}</li>`; }).join("")}</ul><small>No replacement or fabricated data was shown.</small></div></section>` : "";
    // Page order: the decision first, then the reasons, then the full evidence on request.
    return `<div class="page customer-intelligence-page customer-saved-decisions-page">${pageHeading(DETAIL_HEADING, actions)}${workflowStripMarkup("understand")}${hero}${savedDecisionBar(item)}${stack}${passport}${betaDecisionCheck()}${valueIntelligencePanel(item)}${metrics}${betaSurface() ? "" : decisionExplainer()}<details class="ff-cdi-deep ff-cdi-deep-saved" data-ff-cdi-deep><summary><span><strong>Full evidence &amp; saved decision detail</strong><small>Traceback, evidence rows, PSA context, and deeper factors.</small></span><b aria-hidden="true">＋</b></summary>${grid}</details>${partial}</div>`;
  }

  function renderCurrent() { if (!state.main) return; state.main.innerHTML = state.selectedId ? detailView() : listView(); bindActions(); }
  function bindActions() {
    if (!state.main) return;
    state.main.querySelectorAll?.("[data-customer-opportunity]").forEach(row => {
      const open = () => { window.location.hash = `#/opportunities/${encodeURIComponent(row.dataset.customerOpportunity)}`; };
      row.addEventListener("click", open);
      row.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    });
    state.main.querySelectorAll?.("[data-customer-opportunities-refresh]").forEach(button => button.addEventListener("click", load));
    state.main.querySelectorAll?.("[data-ff-beta-cdi-form]").forEach(bindBetaDecisionCheck);
  }

  function validateDetailPayloads() {
    const returned = state.detail?.data?.opportunity;
    if (!returned || String(returned.id || "") !== state.selectedId) {
      state.detail = null;
      state.evidence = null;
      state.psa = null;
      throw state.partialErrors.find(entry => entry.key === "detail")?.error
        || Object.assign(new Error("The saved Card Intelligence record is unavailable."), { code: "OPPORTUNITY_DETAIL_INVALID" });
    }
    if (!validValueIntelligence(returned.valueIntelligence)) {
      state.detail = null;
      throw Object.assign(new Error("Saved value intelligence crossed the Card Intelligence authority contract."), { code: "VALUE_INTELLIGENCE_CONTRACT_INVALID" });
    }
    if (state.evidence && (state.evidence?.data?.kind !== "evidence" || String(state.evidence?.data?.opportunityId || "") !== state.selectedId)) {
      state.partialErrors.push({ key: "evidence", error: Object.assign(new Error("Evidence did not match the selected saved card."), { code: "EVIDENCE_CONTRACT_INVALID" }) });
      state.evidence = null;
    }
    if (state.psa && (state.psa?.data?.kind !== "psa-advisor" || String(state.psa?.data?.opportunityId || "") !== state.selectedId || state.psa?.data?.recalculated !== false)) {
      state.partialErrors.push({ key: "psa", error: Object.assign(new Error("PSA guidance did not match the selected saved card."), { code: "PSA_CONTRACT_INVALID" }) });
      state.psa = null;
    }
  }

  async function loadDetailDirect(serial, route) {
    if (!SAFE_ID.test(state.requestedId)) {
      throw Object.assign(new Error("The requested saved-card identifier is invalid."), { code: "INVALID_OPPORTUNITY_ID" });
    }
    state.selectedId = state.requestedId;
    const encoded = encodeURIComponent(state.selectedId);
    const requests = [["detail", `/api/v1/opportunities/${encoded}`], ["evidence", `/api/v1/evidence/${encoded}`], ["psa", `/api/v1/psa-advisor/${encoded}`]];
    const settled = await Promise.allSettled(requests.map(([, path]) => request(path)));
    if (serial !== loadSerial || routeKey() !== route) throw STALE; // the customer has moved on; not this screen's data
    settled.forEach((result, index) => {
      const key = requests[index][0];
      if (result.status === "fulfilled") state[key] = result.value;
      else state.partialErrors.push({ key, error: result.reason });
    });
    validateDetailPayloads();
  }

  async function loadList(serial, route) {
    state.selectedId = "";
    // The service check and the list are requested together (one round trip, not two); the list is used only if the
    // service is configured. The server authorizes every request on its own.
    const settle = promise => promise.then(value => ({ value }), error => ({ error }));
    const healthRequest = settle(request("/api/v1/health"));
    const listRequest = settle(Promise.all([request("/api/v1/dashboard"), request("/api/v1/opportunities")]));
    const health = await healthRequest;
    if (serial !== loadSerial || routeKey() !== route) throw STALE;
    if (health.error) throw health.error;
    state.health = health.value;
    if (state.health?.data?.status !== "configured") return;
    const list = await listRequest;
    if (serial !== loadSerial || routeKey() !== route) throw STALE;
    if (list.error) throw list.error;
    const [dashboard, opportunities] = list.value;
    [state.dashboard, state.opportunities] = [dashboard, opportunities];
    if (state.opportunities?.data?.kind !== "opportunities" || !Array.isArray(state.opportunities?.data?.items)) {
      throw Object.assign(new Error("The saved opportunity list failed the customer contract."), { code: "OPPORTUNITIES_LIST_INVALID" });
    }
  }

  async function load() {
    const serial = ++loadSerial;
    const route = routeKey();
    state.loading = true;
    state.health = null;
    state.dashboard = null;
    state.opportunities = null;
    state.detail = null;
    state.evidence = null;
    state.psa = null;
    state.error = null;
    state.partialErrors = [];
    state.selectedId = state.requestedId;
    renderCurrent();
    try {
      if (state.requestedId) await loadDetailDirect(serial, route);
      else await loadList(serial, route);
    } catch (error) {
      if (error === STALE || serial !== loadSerial || routeKey() !== route) return; // a newer load or route owns the screen
      state.error = error;
    }
    // The page's later scripts (signal stack, evidence passport, Guided Mode progress) are composed into this render:
    // a response that arrives while the page is still parsing waits for them instead of painting without them.
    if (typeof document !== "undefined" && document.readyState === "loading") await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    if (serial !== loadSerial || routeKey() !== route) return;
    state.loading = false;
    renderCurrent();
  }

  function render(main, id = "") {
    if (!eligibleHost()) return false;
    state.main = main;
    try { state.requestedId = decodeURIComponent(String(id || "")); } catch (_) { state.requestedId = String(id || ""); }
    state.selectedId = state.requestedId;
    load();
    return true;
  }

  window.FlipForgeCustomerOpportunities = Object.freeze({ isEligible: eligibleHost, render, refresh: load });
})();
