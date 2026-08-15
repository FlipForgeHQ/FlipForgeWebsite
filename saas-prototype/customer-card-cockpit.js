(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const HEAT_VERSION = "FORGE_HEAT_V1";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;

  const state = { routeId: "", payload: null, error: null, loading: false, requestSerial: 0 };

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    const path = String(window.location.pathname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host)) && APP_PATH.test(path);
  }

  function routeOpportunityId() {
    const parts = String(window.location.hash || "").replace(/^#\/?/, "").split(/[/?]/).filter(Boolean);
    if (parts[0] !== "opportunities" || parts.length < 2) return "";
    try {
      const decoded = decodeURIComponent(parts[1]);
      return SAFE_ID.test(decoded) ? decoded : "";
    } catch (_) {
      return "";
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function safeArray(value) { return Array.isArray(value) ? value : []; }
  function correlationId() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `card-cockpit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  function moneyCents(value) {
    if (!Number.isSafeInteger(value)) return "Unavailable";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
  }
  function signedMoneyCents(value) {
    if (!Number.isSafeInteger(value)) return "Unavailable";
    const formatted = moneyCents(Math.abs(value));
    return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
  }
  function signedPercent(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `${parsed > 0 ? "+" : ""}${parsed.toFixed(1)}%` : "Unavailable";
  }

  function validEnvelope(payload, expectedCorrelationId) {
    const meta = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.meta : null;
    return Boolean(meta)
      && meta.contractVersion === CONTRACT_VERSION
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId
      && Object.prototype.hasOwnProperty.call(payload, "data");
  }

  function validHeatData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    if (data.kind !== "forge-heat" || data.heatVersion !== HEAT_VERSION || data.proFeature !== true) return false;
    if (!data.authority || data.authority.recommendationAuthority !== "Smart Opportunity") return false;
    if (data.authority.forgeHeatRecommendationAuthority !== false || data.authority.clientComputed !== false || data.authority.transactionAuthority !== false) return false;
    if (!data.scope || data.scope.code !== "SAVED_EVALUATED_UNIVERSE" || data.scope.marketWide !== false) return false;
    return Array.isArray(data.top5) && Array.isArray(data.hiddenGems) && Array.isArray(data.highestEdge);
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) throw Object.assign(new Error("The Forge Heat response exceeded the browser safety limit."), { code: "FORGE_HEAT_RESPONSE_TOO_LARGE" });
    try { return text ? JSON.parse(text) : {}; }
    catch (_) { throw Object.assign(new Error("The Forge Heat gateway returned invalid JSON."), { code: "FORGE_HEAT_INVALID_JSON" }); }
  }

  async function loadHeat(serial) {
    const requestCorrelationId = correlationId();
    const response = await fetch("/api/v1/forge-heat?limit=500", {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Forge Heat request failed with status ${response.status}.`), {
        code: upstream.code || "FORGE_HEAT_REQUEST_FAILED", status: response.status, correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    if (!validEnvelope(payload, requestCorrelationId) || !validHeatData(payload.data)) {
      throw Object.assign(new Error("The Forge Heat response failed the FlipForge authority contract."), { code: "FORGE_HEAT_CONTRACT_INVALID" });
    }
    return serial === state.requestSerial ? payload : null;
  }

  function uniqueHeatItems(data) {
    const map = new Map();
    for (const item of [...safeArray(data?.top5), ...safeArray(data?.hiddenGems), ...safeArray(data?.highestEdge)]) {
      const id = String(item?.opportunityId || "");
      if (SAFE_ID.test(id) && !map.has(id)) map.set(id, item);
    }
    return map;
  }
  function unscoredReason(data, opportunityId) {
    return safeArray(data?.unscoredPreview).find(item => String(item?.opportunityId || "") === opportunityId) || null;
  }
  function bandLabel(value) {
    return ({ WHITE_HOT: "WHITE HOT", HOT: "HOT", HEATING_UP: "HEATING UP", WARM: "WARM" })[String(value || "")] || "HEAT";
  }
  function list(items) {
    const values = safeArray(items).filter(value => typeof value === "string" && value.trim());
    return values.length ? values.map(value => `<li>${escapeHtml(value)}</li>`).join("") : "<li>No additional factor was reported.</li>";
  }

  function loadingPanel() {
    return `<section class="forge-heat-card" data-forge-cockpit data-forge-cockpit-state="loading" aria-live="polite"><div class="forge-heat-card-head"><div class="forge-heat-rank" aria-hidden="true">🔥</div><div class="forge-heat-identity"><span class="forge-heat-kicker">PRO INTELLIGENCE</span><h3>Checking Forge Heat…</h3><p>Loading the server-owned opportunity ranking for this saved decision.</p></div></div></section>`;
  }
  function lockedPanel(data) {
    return `<section class="forge-heat-lock" data-forge-cockpit data-forge-cockpit-state="locked"><span class="forge-heat-lock-mark" aria-hidden="true">PRO</span><div><span class="eyebrow">Forge Heat™</span><h2>Premium opportunity intelligence</h2><p>${escapeHtml(data?.upgradeMessage || "Forge Heat is included with FlipForge Pro.")}</p><p>Smart Opportunity remains the recommendation authority; no Heat score is exposed for this plan.</p><a class="button button-primary" href="#/account">View Plan &amp; Usage</a></div></section>`;
  }
  function scoredPanel(item) {
    return `<section class="forge-heat-card" data-forge-cockpit data-forge-cockpit-state="scored"><div class="forge-heat-card-head"><div class="forge-heat-rank" aria-hidden="true">🔥</div><div class="forge-heat-identity"><span class="forge-heat-kicker">PRO INTELLIGENCE · SERVER-OWNED</span><h3>Forge Heat™</h3><p>This opportunity is currently surfaced by Forge Heat V1. Smart Opportunity still owns the ${escapeHtml(item.recommendation || "saved")} decision.</p></div><div class="forge-heat-score" aria-label="Forge Heat ${escapeHtml(item.heat)} out of 100"><strong>${escapeHtml(item.heat)}</strong><span>${escapeHtml(bandLabel(item.heatBand))}</span></div></div><div class="forge-heat-metrics"><div><span>Supported-value gap</span><strong>${signedMoneyCents(item.supportedValueGapCents)} <small>${signedPercent(item.supportedValueGapPct)}</small></strong></div><div><span>Forge Confidence</span><strong>${escapeHtml(item.confidence)}/100</strong></div><div><span>Opportunity Risk</span><strong>${escapeHtml(item.risk)}/100</strong></div><div><span>Exact evidence</span><strong>${escapeHtml(item.acceptedExactSales)} sales</strong></div><div><span>All-in ask</span><strong>${moneyCents(item.allInAskCents)}</strong></div><div><span>Supported value</span><strong>${moneyCents(item.supportedValueCents)}</strong></div></div><div class="forge-heat-reason-grid"><section><span class="forge-heat-section-label">Why it qualifies</span><ul>${list(item.whyHot)}</ul></section><section><span class="forge-heat-section-label">What could cool it</span><ul>${list(item.couldCool)}</ul></section><section><span class="forge-heat-section-label">What invalidates it</span><ul>${list(item.invalidates)}</ul></section></div><div class="forge-heat-card-foot"><span>Heat prioritizes the opportunity. It does not bid, buy, sell, or change BUY/WATCH/VERIFY/PASS.</span><a class="button button-secondary" href="#/forge-heat">Open Forge Heat →</a></div></section>`;
  }
  function withheldPanel(unscored) {
    return `<section class="forge-heat-card" data-forge-cockpit data-forge-cockpit-state="withheld"><div class="forge-heat-card-head"><div class="forge-heat-rank" aria-hidden="true">—</div><div class="forge-heat-identity"><span class="forge-heat-kicker">PRO INTELLIGENCE · EVIDENCE GATE</span><h3>Forge Heat withheld</h3><p>FlipForge will not manufacture an opportunity score when the saved decision does not clear the Heat gates.</p></div></div><div class="forge-heat-roadmap-boundary"><strong>Why no Heat score</strong><ul>${list(unscored?.reasons)}</ul></div><div class="forge-heat-card-foot"><span>Smart Opportunity remains the decision authority.</span><a class="button button-secondary" href="#/forge-heat">Open Forge Heat →</a></div></section>`;
  }
  function notSurfacedPanel() {
    return `<section class="forge-heat-card" data-forge-cockpit data-forge-cockpit-state="not-surfaced"><div class="forge-heat-card-head"><div class="forge-heat-rank" aria-hidden="true">•</div><div class="forge-heat-identity"><span class="forge-heat-kicker">PRO INTELLIGENCE</span><h3>Not currently surfaced</h3><p>This saved decision is not in the current server-returned Top 5, Hidden Gems, or Highest Edge set. The browser does not infer a Heat score.</p></div></div><div class="forge-heat-card-foot"><span>Current V1 scope is your saved evaluated universe, not continuous market-wide scanning.</span><a class="button button-secondary" href="#/forge-heat">Review Forge Heat →</a></div></section>`;
  }
  function errorPanel(error) {
    return `<section class="forge-heat-card" data-forge-cockpit data-forge-cockpit-state="error"><div class="forge-heat-card-head"><div class="forge-heat-rank" aria-hidden="true">!</div><div class="forge-heat-identity"><span class="forge-heat-kicker">PRO INTELLIGENCE</span><h3>Forge Heat unavailable</h3><p>${escapeHtml(error?.message || "The server-owned Heat projection could not be loaded.")}</p></div></div><div class="forge-heat-card-foot"><span>No fallback or browser-generated Heat score was substituted.</span><a class="button button-secondary" href="#/forge-heat">Open Forge Heat →</a></div></section>`;
  }

  function panelModel(opportunityId) {
    if (state.loading) return { key: "loading", html: loadingPanel() };
    if (state.error) return { key: `error:${state.error.code || state.error.message || "unknown"}`, html: errorPanel(state.error) };
    const data = state.payload?.data;
    if (!data) return { key: "loading", html: loadingPanel() };
    if (data.locked === true) return { key: `locked:${data.access?.currentPlan || "unknown"}`, html: lockedPanel(data) };
    const item = uniqueHeatItems(data).get(opportunityId);
    if (item) return { key: `scored:${item.heat}:${item.confidence}:${item.risk}:${item.acceptedExactSales}:${item.supportedValueGapCents}`, html: scoredPanel(item) };
    const unscored = unscoredReason(data, opportunityId);
    if (unscored) return { key: `withheld:${JSON.stringify(unscored.reasons || [])}`, html: withheldPanel(unscored) };
    return { key: "not-surfaced", html: notSurfacedPanel() };
  }

  function mount() {
    if (!eligibleHost()) return;
    const main = document.querySelector("#main-content");
    const opportunityId = routeOpportunityId();
    if (!main || !opportunityId) return;
    const hero = main.querySelector(".customer-intelligence-hero");
    if (!hero) return;

    const model = panelModel(opportunityId);
    const existing = main.querySelector("[data-forge-cockpit]");
    if (existing?.dataset?.forgeCockpitKey === model.key) return;
    if (existing) existing.remove();
    hero.insertAdjacentHTML("beforebegin", model.html);
    const inserted = main.querySelector("[data-forge-cockpit]");
    if (inserted) inserted.dataset.forgeCockpitKey = model.key;
  }

  async function ensureHeatForRoute() {
    if (!eligibleHost()) return;
    const opportunityId = routeOpportunityId();
    if (!opportunityId) {
      state.routeId = ""; state.payload = null; state.error = null; state.loading = false;
      return;
    }
    if (state.routeId === opportunityId && (state.loading || state.payload || state.error)) { mount(); return; }

    state.routeId = opportunityId;
    state.payload = null;
    state.error = null;
    state.loading = true;
    const serial = ++state.requestSerial;
    mount();
    try {
      const payload = await loadHeat(serial);
      if (payload && serial === state.requestSerial && state.routeId === opportunityId) state.payload = payload;
    } catch (error) {
      if (serial === state.requestSerial && state.routeId === opportunityId) state.error = error;
    } finally {
      if (serial === state.requestSerial && state.routeId === opportunityId) state.loading = false;
      mount();
    }
  }

  const main = document.querySelector("#main-content");
  if (main) {
    let observerQueued = false;
    const observer = new MutationObserver(() => {
      if (observerQueued) return;
      observerQueued = true;
      queueMicrotask(() => { observerQueued = false; mount(); });
    });
    observer.observe(main, { childList: true, subtree: true });
  }

  window.addEventListener("hashchange", () => {
    state.requestSerial++;
    state.routeId = "";
    state.payload = null;
    state.error = null;
    state.loading = false;
    queueMicrotask(ensureHeatForRoute);
  });

  queueMicrotask(ensureHeatForRoute);
  window.FlipForgeCustomerCardCockpit = Object.freeze({
    version: "1.1",
    heatVersion: HEAT_VERSION,
    isEligible: eligibleHost,
    refresh: () => {
      state.routeId = "";
      state.payload = null;
      state.error = null;
      queueMicrotask(ensureHeatForRoute);
    }
  });
})();