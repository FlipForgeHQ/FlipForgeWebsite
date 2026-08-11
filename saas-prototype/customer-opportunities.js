(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const FIXED_PATHS = new Set(["/api/v1/health", "/api/v1/dashboard", "/api/v1/opportunities"]);

  const state = { main: null, requestedId: "", selectedId: "", loading: false, health: null, dashboard: null, opportunities: null, detail: null, evidence: null, psa: null, error: null, partialErrors: [] };

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
  function supportedValueAvailable(item, acceptedSalesOverride) {
    const acceptedSales = safeNumber(acceptedSalesOverride ?? item?.evidence?.acceptedSales);
    return acceptedSales > 0 && safeNumber(item?.supportedValue) > 0;
  }
  function supportedValueText(item, acceptedSalesOverride) {
    return supportedValueAvailable(item, acceptedSalesOverride) ? money(item?.supportedValue) : "Unavailable";
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

  function badge(label, tone = "neutral") { return `<span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`; }
  function pageHeading(title, description, actions = "") { return `<header class="page-heading"><div><span class="eyebrow">Tenant-owned saved intelligence</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</header>`; }
  function errorPanel(error) {
    if (!error) return "";
    const guidance = error.status === 401 ? "Sign in with an invited FlipForge private-beta account." : error.status === 403 ? "The signed-in account needs an active FlipForge tenant membership." : "No mock record or browser-generated recommendation was substituted.";
    const returnPath = state.selectedId ? `/app/#/opportunities/${encodeURIComponent(state.selectedId)}` : "/app/#/opportunities";
    const signIn = error.status === 401 ? `<div class="customer-intelligence-actions"><a class="button button-primary" href="${productionHost() ? `/production-auth.html?return=${encodeURIComponent(returnPath)}` : `/staging-auth.html?returnTo=${encodeURIComponent(returnPath.replace(/^\/app/, "/saas-prototype"))}`}">Sign in securely</a></div>` : "";
    return `<section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error.code || "CARD_INTELLIGENCE_UNAVAILABLE")}</strong><p>${escapeHtml(error.message)}</p><small>${escapeHtml(guidance)}</small>${signIn}</div></section>`;
  }
  function opportunityItems() { return safeArray(state.opportunities?.data?.items).filter(item => SAFE_ID.test(String(item?.id || ""))); }
  function metricCards() {
    const metrics = state.dashboard?.data?.metrics || {};
    const values = [["Tracked decisions", safeNumber(metrics.trackedOpportunities)], ["Evidence ready", safeNumber(metrics.evidenceReady)], ["Population context", safeNumber(metrics.populationContextAvailable)], ["Needs verification", safeNumber(metrics.needsVerification)]];
    return `<section class="staging-metrics" aria-label="Authoritative saved intelligence metrics">${values.map(([label, value]) => `<article class="panel"><div class="panel-body"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div></article>`).join("")}</section>`;
  }
  function opportunityTable() {
    const items = opportunityItems();
    if (!items.length) return `<div class="staging-empty"><strong>No saved decisions yet.</strong><p>Evaluate one exact card to create the first tenant-owned SQLite record.</p><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Saved card</th><th>Decision</th><th>Ask</th><th>Supported</th><th>Confidence</th><th>Evidence</th><th>Mapping</th></tr></thead><tbody>${items.map(item => { const display = cardDisplay(item); return `<tr data-customer-opportunity="${escapeHtml(item.id)}" tabindex="0"><td><strong>${escapeHtml(display.title)}</strong>${display.identity ? `<small>${escapeHtml(display.identity)}</small>` : ""}</td><td>${badge(item.recommendation || "UNKNOWN", String(item.recommendation || "unknown").toLowerCase())}</td><td>${money(item.ask)}</td><td>${escapeHtml(supportedValueText(item))}</td><td>${safeNumber(item.confidence)}/100</td><td>${safeNumber(item.evidence?.acceptedSales)}</td><td>${escapeHtml(item.mappingState || "UNKNOWN")}</td></tr>`; }).join("")}</tbody></table></div>`;
  }
  function listView() {
    const configured = state.health?.data?.status === "configured";
    const meta = state.opportunities?.meta || state.dashboard?.meta || {};
    const limitations = safeArray(meta.limitations);
    const actions = `<button class="button button-secondary" type="button" data-customer-opportunities-refresh>Refresh</button><a class="button button-primary" href="#/evaluate">Evaluate a card</a>`;
    return `<div class="page customer-intelligence-page">${pageHeading("Opportunities", "Every card here is a tenant-owned decision saved in SQLite and governed by FlipForge's existing authority.", actions)}<div class="boundary-note"><strong>Customer boundary:</strong> This workspace reads saved Smart Opportunity, evidence, and PSA outputs. It never substitutes mock records, recalculates a decision, or authorizes a transaction.</div>${state.loading ? `<div class="staging-loading" role="status">Loading your saved intelligence…</div>` : ""}${errorPanel(state.error)}${configured && !state.error ? `${metricCards()}<section class="panel customer-intelligence-list"><header class="panel-header"><div><h2>Your tracked decision records</h2><p>Evaluations appear here after the authoritative service saves them and grants tenant ownership.</p></div><span class="staging-status staging-status-ok">SQLite saved</span></header><div class="panel-body">${opportunityTable()}</div></section><section class="panel customer-contract-panel"><div class="panel-body"><div><span>Engine</span><strong>${escapeHtml(meta.engineVersion || "Authoritative service")}</strong></div><div><span>Evidence freshness</span><strong>${escapeHtml(meta.evidenceFreshness || "Unavailable")}</strong></div><div><span>Customer controls</span><strong>Read, evaluate, understand, track</strong></div><div><span>Execution authority</span><strong>None</strong></div></div>${limitations.length ? `<details><summary>Known limitations</summary><ul>${limitations.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}</section>` : ""}${!configured && state.health ? `<section class="panel"><div class="panel-body staging-empty"><strong>Customer intelligence is safely offline.</strong><p>The customer gateway is disabled, so no tenant data request was attempted and no mock data was substituted.</p></div></section>` : ""}</div>`;
  }
  function tracebackStep(label, title, detail, tone = "ok") { const mark = tone === "ok" ? "✓" : tone === "warn" ? "!" : "•"; return `<article class="customer-trace-step"><span class="check-mark ${escapeHtml(tone)}">${mark}</span><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div></article>`; }
  function linkedEvidenceTable(evidence) {
    const items = safeArray(evidence?.linkedEvidence);
    if (!items.length) return `<div class="staging-empty"><strong>No linked evidence rows are available.</strong><p>No replacement comp was invented.</p></div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Evidence source</th><th>Amount</th><th>Sale date</th><th>Identity</th><th>Authority</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(item.sourceName || "Saved source")}</strong><small>${escapeHtml(item.type || "Unknown type")}</small></td><td>${money(item.amount)}</td><td>${escapeHtml(item.soldAt || item.recordedAt || "Unavailable")}</td><td>${item.identityMatch === true ? badge("Exact match", "ok") : badge("Mismatch", "warn")}</td><td>${item.authorityEligible === true ? badge("Eligible", "buy") : badge("Ineligible", "pass")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function detailView() {
    const item = state.detail?.data?.opportunity;
    if (!item) return `<div class="page customer-intelligence-page">${pageHeading("Card Intelligence", "Loading the tenant-owned decision, evidence chain, and saved PSA guidance.", `<a class="button button-secondary" href="#/opportunities">Back to opportunities</a>`)}${state.loading ? `<div class="staging-loading" role="status">Loading card intelligence…</div>` : ""}${errorPanel(state.error)}</div>`;
    const evidence = state.evidence?.data || {};
    const psa = state.psa?.data || {};
    const snapshot = psa.savedPsaSnapshot || {};
    const meta = state.detail?.meta || {};
    const acceptedSales = safeNumber(evidence.acceptedExactCompletedSales ?? item.evidence?.acceptedSales);
    const ineligible = safeNumber(evidence.visibleButAuthorityIneligible);
    const ask = safeNumber(item.ask), supported = safeNumber(item.supportedValue), supportedAvailable = supportedValueAvailable(item, acceptedSales), gap = supportedAvailable ? supported - ask : 0, gapPercent = supportedAvailable && ask > 0 ? (gap / ask) * 100 : 0;
    const mappingConfirmed = String(item.mappingState || "").toUpperCase() === "CONFIRMED", evidenceReady = acceptedSales > 0, psaAvailable = psa.guidanceStatus === "SAVED_GUIDANCE_AVAILABLE";
    const display = cardDisplay(item);
    const title = display.title;
    const actions = `<a class="button button-secondary" href="#/opportunities">Opportunities</a><a class="button button-secondary" href="#/compare?left=${encodeURIComponent(item.id)}">Compare</a><a class="button button-secondary" href="#/evidence/${encodeURIComponent(item.id)}">Evidence</a><a class="button button-secondary" href="#/psa-advisor/${encodeURIComponent(item.id)}">PSA guidance</a><a class="button button-secondary" href="#/tracking/${encodeURIComponent(item.id)}">Track</a><a class="button button-secondary" href="#/export/${encodeURIComponent(item.id)}">Audit export</a><button class="button button-secondary" type="button" data-customer-opportunities-refresh>Refresh</button>`;
    return `<div class="page customer-intelligence-page">${pageHeading("Card Intelligence", "See the decision, exact evidence, unresolved limits, and saved grading context before you act.", actions)}<section class="panel customer-intelligence-hero"><div class="panel-body"><div class="customer-hero-copy"><span class="eyebrow">${escapeHtml(item.platform || "Saved marketplace record")}</span><div class="customer-hero-title">${badge(item.recommendation || "UNKNOWN", String(item.recommendation || "unknown").toLowerCase())}<h2>${escapeHtml(title)}</h2></div>${display.identity ? `<p>${escapeHtml(display.identity)}</p>` : ""}<div class="customer-tracked-state"><span class="check-mark ok">✓</span><span><strong>Tracked in SQLite</strong><small>Tenant-owned saved record · ${escapeHtml(item.observedAt || "Observation time unavailable")}</small></span></div></div><div class="customer-value-summary"><span>Current ask</span><strong>${money(ask)}</strong><span>Supported value</span><strong${supportedAvailable ? " class=\"value-positive\"" : ""}>${escapeHtml(supportedValueText(item, acceptedSales))}</strong><small>${supportedAvailable ? `${gap >= 0 ? "+" : ""}${money(gap)} · ${gapPercent.toFixed(1)}% saved value gap` : "No accepted exact completed-sale evidence supports a value yet."}</small></div></div></section><div class="customer-intelligence-metrics"><article><span>Confidence</span><strong>${safeNumber(item.confidence)}/100</strong></article><article><span>Liquidity</span><strong>${safeNumber(item.liquidity)}/100</strong></article><article><span>Risk</span><strong>${safeNumber(item.risk)}/100</strong></article><article><span>Rank</span><strong>${safeNumber(item.rank)}/100</strong></article></div><div class="customer-intelligence-grid"><div class="stack"><section class="panel"><header class="panel-header"><div><h2>Decision Traceback</h2><p>A readable path through the saved authority inputs. No browser-side scoring.</p></div>${badge(item.recommendation || "UNKNOWN", String(item.recommendation || "unknown").toLowerCase())}</header><div class="panel-body customer-traceback">${tracebackStep("1 · Identity", mappingConfirmed ? "Exact identity confirmed" : "Identity needs verification", item.statusMessage || `Mapping state: ${item.mappingState || "UNKNOWN"}.`, mappingConfirmed ? "ok" : "warn")}${tracebackStep("2 · Evidence", evidenceReady ? `${acceptedSales} accepted exact completed sale${acceptedSales === 1 ? "" : "s"}` : "No accepted exact completed sales", `${ineligible} visible record${ineligible === 1 ? " is" : "s are"} authority-ineligible. Active asks never become sold evidence.`, evidenceReady ? "ok" : "warn")}${tracebackStep("3 · Market factors", `Liquidity ${safeNumber(item.liquidity)} · Risk ${safeNumber(item.risk)} · Rank ${safeNumber(item.rank)}`, item.changeSummary || "Saved factors are displayed exactly as returned by Smart Opportunity.", "neutral")}${tracebackStep("4 · Authority output", item.recommendation || "UNKNOWN", `Workflow: ${item.workflowStatus || "UNKNOWN"}. ${item.authorityBoundary || "Smart Opportunity remains authoritative."}`, "neutral")}</div></section><section class="panel"><header class="panel-header"><div><h2>Evidence Chain</h2><p>Linked completed-sale evidence and exclusions from the saved ledger.</p></div><span class="staging-status ${evidenceReady ? "staging-status-ok" : "staging-status-warn"}">${acceptedSales} accepted</span></header><div class="panel-body">${linkedEvidenceTable(evidence)}</div></section></div><div class="stack"><section class="panel"><header class="panel-header"><div><h2>Evidence readiness</h2><p>What can and cannot support this saved decision.</p></div></header><div class="panel-body staging-key-grid"><div><span>Accepted exact sales</span><strong>${acceptedSales}</strong></div><div><span>Visible but ineligible</span><strong>${ineligible}</strong></div><div><span>Average accepted price</span><strong>${acceptedSales > 0 ? money(item.evidence?.averagePrice) : "Unavailable"}</strong></div><div><span>Latest accepted sale</span><strong>${escapeHtml(item.evidence?.latestSaleDate || "Unavailable")}</strong></div><div><span>Mapping</span><strong>${escapeHtml(item.mappingState || "UNKNOWN")}</strong></div><div><span>Evidence freshness</span><strong>${escapeHtml(meta.evidenceFreshness || "Unavailable")}</strong></div></div></section><section class="panel"><header class="panel-header"><div><h2>Saved PSA guidance</h2><p>Existing PSA intelligence only; no grade is predicted here.</p></div>${badge(psaAvailable ? "Available" : "Insufficient context", psaAvailable ? "ok" : "warn")}</header><div class="panel-body staging-key-grid"><div><span>Guidance status</span><strong>${escapeHtml(psa.guidanceStatus || "Unavailable")}</strong></div><div><span>Readiness</span><strong>${escapeHtml(snapshot.readinessStatus || "Unavailable")}</strong></div><div><span>PSA 10 population</span><strong>${safeNumber(psa.populationContext?.psa10Population)}</strong></div><div><span>PSA 9 population</span><strong>${safeNumber(psa.populationContext?.psa9Population)}</strong></div><div><span>Manual verification</span><strong>${snapshot.manualVerificationRequired === true ? "Required" : "Not returned"}</strong></div><div><span>Recalculated</span><strong>${psa.recalculated === true ? "Yes" : "No"}</strong></div></div>${psa.authorityConflict ? `<div class="boundary-note"><strong>Authority conflict:</strong> ${escapeHtml(psa.authorityConflict)}</div>` : ""}</section><section class="panel customer-decision-boundary"><div class="panel-body"><span class="eyebrow">Before you buy. Know why.</span><h2>${escapeHtml(item.recommendation || "UNKNOWN")} is decision support</h2><p>${escapeHtml(item.statusMessage || item.authorityBoundary || "Review the saved evidence and unresolved limits before acting outside FlipForge.")}</p><small>No bid, checkout, payment, evidence acceptance, or grade prediction is authorized.</small></div></section></div></div>${state.partialErrors.length ? `<section class="panel staging-warning"><div class="panel-body"><strong>Some saved context is unavailable.</strong><ul>${state.partialErrors.filter(entry => entry.key !== "detail").map(entry => `<li>${escapeHtml(entry.key.toUpperCase())}: ${escapeHtml(entry.error?.code || entry.error?.message || "Unavailable")}</li>`).join("")}</ul><small>No replacement or fabricated data was shown.</small></div></section>` : ""}</div>`;
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
  }
  async function load() {
    state.loading = true; state.health = null; state.dashboard = null; state.opportunities = null; state.detail = null; state.evidence = null; state.psa = null; state.error = null; state.partialErrors = []; renderCurrent();
    try {
      state.health = await request("/api/v1/health");
      if (state.health?.data?.status !== "configured") return;
      [state.dashboard, state.opportunities] = await Promise.all([request("/api/v1/dashboard"), request("/api/v1/opportunities")]);
      if (state.opportunities?.data?.kind !== "opportunities" || !Array.isArray(state.opportunities?.data?.items)) throw Object.assign(new Error("The saved opportunity list failed the customer contract."), { code: "OPPORTUNITIES_LIST_INVALID" });
      if (!state.requestedId) return;
      const ids = opportunityItems().map(item => String(item.id));
      if (!SAFE_ID.test(state.requestedId) || !ids.includes(state.requestedId)) throw Object.assign(new Error("The requested saved card was not returned for this tenant."), { code: "RESOURCE_NOT_FOUND", status: 404 });
      state.selectedId = state.requestedId;
      const encoded = encodeURIComponent(state.selectedId);
      const requests = [["detail", `/api/v1/opportunities/${encoded}`], ["evidence", `/api/v1/evidence/${encoded}`], ["psa", `/api/v1/psa-advisor/${encoded}`]];
      const settled = await Promise.allSettled(requests.map(([, path]) => request(path)));
      settled.forEach((result, index) => { const key = requests[index][0]; if (result.status === "fulfilled") state[key] = result.value; else state.partialErrors.push({ key, error: result.reason }); });
      const returned = state.detail?.data?.opportunity;
      if (!returned || String(returned.id || "") !== state.selectedId) throw state.partialErrors.find(entry => entry.key === "detail")?.error || Object.assign(new Error("The saved Card Intelligence record is unavailable."), { code: "OPPORTUNITY_DETAIL_INVALID" });
      if (state.evidence && (state.evidence?.data?.kind !== "evidence" || String(state.evidence?.data?.opportunityId || "") !== state.selectedId)) { state.partialErrors.push({ key: "evidence", error: Object.assign(new Error("Evidence did not match the selected saved card."), { code: "EVIDENCE_CONTRACT_INVALID" }) }); state.evidence = null; }
      if (state.psa && (state.psa?.data?.kind !== "psa-advisor" || String(state.psa?.data?.opportunityId || "") !== state.selectedId || state.psa?.data?.recalculated !== false)) { state.partialErrors.push({ key: "psa", error: Object.assign(new Error("PSA guidance did not match the selected saved card."), { code: "PSA_CONTRACT_INVALID" }) }); state.psa = null; }
    } catch (error) { state.error = error; }
    finally { state.loading = false; renderCurrent(); }
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