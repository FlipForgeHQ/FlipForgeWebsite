(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const HEAT_VERSION = "FORGE_HEAT_V1";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

  const state = {
    main: null,
    loading: false,
    payload: null,
    error: null,
    tab: "top5"
  };

  function productionHost() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `forge-heat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function moneyCents(value) {
    if (!Number.isSafeInteger(value)) return "Unavailable";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value / 100);
  }

  function signedMoneyCents(value) {
    if (!Number.isSafeInteger(value)) return "Unavailable";
    const formatted = moneyCents(Math.abs(value));
    return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
  }

  function signedPercent(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "Unavailable";
    return `${parsed > 0 ? "+" : ""}${parsed.toFixed(1)}%`;
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

  function validOpportunity(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if (!SAFE_ID.test(String(item.requestId || "")) || !SAFE_ID.test(String(item.opportunityId || ""))) return false;
    if (typeof item.cardIdentity !== "string" || !item.cardIdentity.trim()) return false;
    if (!Number.isInteger(item.heat) || item.heat < 0 || item.heat > 100) return false;
    if (!Number.isInteger(item.confidence) || item.confidence < 0 || item.confidence > 100) return false;
    if (!Number.isInteger(item.risk) || item.risk < 0 || item.risk > 100) return false;
    if (!Number.isInteger(item.acceptedExactSales) || item.acceptedExactSales < 3) return false;
    if (!Number.isSafeInteger(item.allInAskCents) || item.allInAskCents <= 0) return false;
    if (!Number.isSafeInteger(item.supportedValueCents) || item.supportedValueCents <= item.allInAskCents) return false;
    if (!Number.isSafeInteger(item.supportedValueGapCents) || item.supportedValueGapCents <= 0) return false;
    if (!Number.isFinite(Number(item.supportedValueGapPct)) || Number(item.supportedValueGapPct) <= 0) return false;
    if (!Array.isArray(item.whyHot) || !Array.isArray(item.couldCool) || !Array.isArray(item.invalidates)) return false;
    if (item.transactionAuthority !== false) return false;
    return item.recommendation === "BUY" || item.recommendation === "WATCH";
  }

  function validData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    if (data.kind !== "forge-heat" || data.heatVersion !== HEAT_VERSION || data.proFeature !== true) return false;
    if (!data.access || typeof data.access.allowed !== "boolean" || data.access.requiredPlan !== "PRO") return false;
    if (!data.authority || data.authority.recommendationAuthority !== "Smart Opportunity") return false;
    if (data.authority.forgeHeatRecommendationAuthority !== false || data.authority.clientComputed !== false || data.authority.transactionAuthority !== false) return false;
    if (!data.scope || data.scope.code !== "SAVED_EVALUATED_UNIVERSE" || data.scope.marketWide !== false || data.scope.continuousMarketScannerActive !== false) return false;
    if (!Array.isArray(data.top5) || !Array.isArray(data.hiddenGems) || !Array.isArray(data.highestEdge)) return false;
    if (data.locked === true) return data.top5.length === 0 && data.hiddenGems.length === 0 && data.highestEdge.length === 0;
    return [...data.top5, ...data.hiddenGems, ...data.highestEdge].every(validOpportunity);
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      throw Object.assign(new Error("The Forge Heat response exceeded the browser safety limit."), { code: "FORGE_HEAT_RESPONSE_TOO_LARGE" });
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw Object.assign(new Error("The Forge Heat gateway returned invalid JSON."), { code: "FORGE_HEAT_INVALID_JSON" });
    }
  }

  async function load() {
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
        code: upstream.code || "FORGE_HEAT_REQUEST_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    if (!validEnvelope(payload, requestCorrelationId) || !validData(payload.data)) {
      throw Object.assign(new Error("The Forge Heat response failed the FlipForge authority contract."), { code: "FORGE_HEAT_CONTRACT_INVALID" });
    }
    return payload;
  }

  function bandLabel(value) {
    return ({
      WHITE_HOT: "WHITE HOT",
      HOT: "HOT",
      HEATING_UP: "HEATING UP",
      WARM: "WARM"
    })[String(value || "")] || "HEAT";
  }

  function list(items) {
    const values = safeArray(items).filter(value => typeof value === "string" && value.trim());
    if (!values.length) return `<li>No additional factor was reported.</li>`;
    return values.map(value => `<li>${escapeHtml(value)}</li>`).join("");
  }

  function opportunityCard(item) {
    const id = SAFE_ID.test(String(item.opportunityId || "")) ? item.opportunityId : "";
    return `<article class="forge-heat-card">
      <div class="forge-heat-card-head">
        <div class="forge-heat-rank" aria-label="Rank ${escapeHtml(item.rank)}">${escapeHtml(item.rank)}</div>
        <div class="forge-heat-identity">
          <span class="forge-heat-kicker">${escapeHtml(item.marketplace || "Saved evaluation")} · ${escapeHtml(item.recommendation)}</span>
          <h3>${escapeHtml(item.cardIdentity)}</h3>
          <p>Evaluated ${escapeHtml(item.evaluatedAt || "Unavailable")} · ${escapeHtml(item.acceptedExactSales)} exact trusted sales</p>
        </div>
        <div class="forge-heat-score" aria-label="Forge Heat ${escapeHtml(item.heat)} out of 100">
          <strong>${escapeHtml(item.heat)}</strong>
          <span>${escapeHtml(bandLabel(item.heatBand))}</span>
        </div>
      </div>

      <div class="forge-heat-metrics">
        <div><span>All-in ask</span><strong>${moneyCents(item.allInAskCents)}</strong></div>
        <div><span>Supported value</span><strong>${moneyCents(item.supportedValueCents)}</strong></div>
        <div><span>Supported-value gap</span><strong>${signedMoneyCents(item.supportedValueGapCents)} <small>${signedPercent(item.supportedValueGapPct)}</small></strong></div>
        <div><span>Forge Confidence</span><strong>${escapeHtml(item.confidence)}/100</strong></div>
        <div><span>Opportunity Risk</span><strong>${escapeHtml(item.risk)}/100</strong></div>
        <div><span>Exact evidence</span><strong>${escapeHtml(item.acceptedExactSales)} sales</strong></div>
      </div>

      <div class="forge-heat-reason-grid">
        <section><span class="forge-heat-section-label">Why it qualifies</span><ul>${list(item.whyHot)}</ul></section>
        <section><span class="forge-heat-section-label">What could cool it</span><ul>${list(item.couldCool)}</ul></section>
        <section><span class="forge-heat-section-label">What invalidates it</span><ul>${list(item.invalidates)}</ul></section>
      </div>

      <div class="forge-heat-card-foot">
        <span>Forge Heat ranks the opportunity. Smart Opportunity owns the ${escapeHtml(item.recommendation)} decision.</span>
        ${id ? `<a class="button button-secondary" href="#/opportunities/${escapeHtml(id)}">Open decision →</a>` : ""}
      </div>
    </article>`;
  }

  function emptyState(tab) {
    const copy = tab === "hiddenGems"
      ? "No current saved evaluation satisfies the Hidden Gem evidence, confidence, risk, and Heat thresholds."
      : tab === "highestEdge"
        ? "No saved BUY/WATCH evaluation currently has enough evidence and positive supported-value gap to surface."
        : "No saved evaluation currently clears the Forge Heat V1 gates.";
    return `<section class="forge-heat-empty"><strong>No qualifying opportunities yet.</strong><p>${escapeHtml(copy)}</p><a class="button button-primary" href="#/discover">Discover cards</a></section>`;
  }

  function historyBuilding(data) {
    const reason = data?.componentAvailability?.momentum?.reason || "Heat history is not yet sufficient.";
    return `<section class="forge-heat-history">
      <span class="forge-heat-history-icon" aria-hidden="true">↗</span>
      <div><span class="eyebrow">History building</span><h2>Heating Up is evidence-gated.</h2><p>${escapeHtml(reason)}</p><p>FlipForge will not manufacture momentum from a single snapshot. This view activates after governed Heat history exists.</p></div>
    </section>`;
  }

  function tabs() {
    const options = [
      ["top5", "🔥 Top 5"],
      ["hiddenGems", "💎 Hidden Gems"],
      ["highestEdge", "↗ Highest Edge"],
      ["heatingUp", "⚡ Heating Up"]
    ];
    return `<div class="forge-heat-tabs" role="tablist" aria-label="Forge Heat views">${options.map(([key, label]) =>
      `<button type="button" role="tab" data-heat-tab="${key}" aria-selected="${state.tab === key ? "true" : "false"}" class="${state.tab === key ? "is-active" : ""}">${label}</button>`
    ).join("")}</div>`;
  }

  function tabDescription(tab) {
    if (tab === "hiddenGems") return "High-confidence, lower-risk opportunities with deeper exact-sale support that simple discount sorting can overlook.";
    if (tab === "highestEdge") return "Largest positive gap between the saved all-in ask and evidence-supported value among Heat-eligible decisions. This is not net profit or ROI.";
    if (tab === "heatingUp") return "Opportunity acceleration requires governed Heat history and is intentionally unavailable until those snapshots exist.";
    return "The strongest evidence-adjusted opportunities in your saved evaluated universe.";
  }

  function lockedView(data) {
    return `<div class="forge-heat-shell">
      ${heading(data)}
      <section class="forge-heat-lock">
        <span class="forge-heat-lock-mark" aria-hidden="true">PRO</span>
        <div><span class="eyebrow">Premium intelligence</span><h2>Forge Heat is included with FlipForge Pro.</h2><p>${escapeHtml(data.upgradeMessage || "Upgrade to Pro to unlock evidence-adjusted opportunity ranking.")}</p><p>Your current plan: <strong>${escapeHtml(data.access?.currentPlan || "Unknown")}</strong></p><a class="button button-primary" href="#/account">View Plan &amp; Usage</a></div>
      </section>
    </div>`;
  }

  function heading(data) {
    const summary = data?.summary || {};
    return `<header class="forge-heat-hero">
      <div>
        <div class="forge-heat-title-row"><span class="eyebrow">PRO INTELLIGENCE · ${escapeHtml(data?.heatVersion || HEAT_VERSION)}</span><span class="forge-heat-pro-chip">PRO</span></div>
        <h1>Forge Heat™</h1>
        <p class="forge-heat-lead">Evidence-backed opportunity intelligence. FlipForge does not just find the gap—it tests whether the opportunity deserves to be trusted.</p>
      </div>
      <div class="forge-heat-boundary"><strong>Current scope</strong><span>Your saved, completed evaluation universe</span><small>Not market-wide yet · No browser-side scoring · No transaction authority</small></div>
      ${data && data.locked === false ? `<div class="forge-heat-summary">
        <div><span>Evaluations considered</span><strong>${escapeHtml(summary.latestEvaluationsConsidered ?? 0)}</strong></div>
        <div><span>Heat eligible</span><strong>${escapeHtml(summary.heatEligible ?? 0)}</strong></div>
        <div><span>Surfaced</span><strong>${escapeHtml(summary.surfaced ?? 0)}</strong></div>
        <div><span>Engine</span><strong>V1</strong></div>
      </div>` : ""}
    </header>`;
  }

  function page(data) {
    if (data.locked) return lockedView(data);
    const selected = state.tab === "hiddenGems" ? data.hiddenGems
      : state.tab === "highestEdge" ? data.highestEdge
        : data.top5;
    const content = state.tab === "heatingUp"
      ? historyBuilding(data)
      : safeArray(selected).length
        ? `<div class="forge-heat-list">${safeArray(selected).map(opportunityCard).join("")}</div>`
        : emptyState(state.tab);

    return `<div class="forge-heat-shell">
      ${heading(data)}
      <section class="forge-heat-intelligence-bar">
        <div><span>Identity</span><strong>Completed evaluation snapshot</strong></div>
        <div><span>Evidence gate</span><strong>≥ 3 exact trusted sales</strong></div>
        <div><span>Authority</span><strong>Smart Opportunity</strong></div>
        <div><span>Heat calculation</span><strong>Server-owned</strong></div>
      </section>
      ${tabs()}
      <div class="forge-heat-tab-copy"><strong>${escapeHtml(state.tab === "top5" ? "Top 5" : state.tab === "hiddenGems" ? "Hidden Gems" : state.tab === "highestEdge" ? "Highest Edge" : "Heating Up")}</strong><span>${escapeHtml(tabDescription(state.tab))}</span></div>
      ${content}
      <section class="forge-heat-roadmap-boundary"><strong>What V1 does not fake</strong><p>Momentum, price stability, governed scarcity, configurable selling-cost economics, market-wide scanning, and historical Heat performance remain unavailable until their server-side inputs are implemented and validated.</p></section>
    </div>`;
  }

  function loading() {
    return `<div class="forge-heat-shell"><header class="forge-heat-hero"><div><span class="eyebrow">PRO INTELLIGENCE</span><h1>Forge Heat™</h1><p class="forge-heat-lead">Loading server-owned opportunity intelligence…</p></div></header><div class="staging-loading" role="status">Challenging saved decisions against Forge Heat gates…</div></div>`;
  }

  function errorView(error) {
    const signIn = error?.status === 401
      ? `<a class="button button-primary" href="${productionHost() ? "/production-auth.html?return=%2Fapp%2F%23%2Fforge-heat" : "/staging-auth.html?returnTo=%2Fsaas-prototype%2F%23%2Fforge-heat"}">Sign in securely</a>`
      : `<button class="button button-primary" type="button" data-forge-heat-retry>Retry</button>`;
    return `<div class="forge-heat-shell"><header class="forge-heat-hero"><div><span class="eyebrow">PRO INTELLIGENCE</span><h1>Forge Heat™</h1></div></header><section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error?.code || "FORGE_HEAT_UNAVAILABLE")}</strong><p>${escapeHtml(error?.message || "Forge Heat intelligence is unavailable.")}</p><small>No Heat score was calculated in the browser or substituted from mock data.</small><div class="page-actions">${signIn}</div></div></section></div>`;
  }

  function wire() {
    if (!state.main) return;
    state.main.querySelectorAll("[data-heat-tab]").forEach(button => {
      button.addEventListener("click", () => {
        state.tab = button.getAttribute("data-heat-tab") || "top5";
        renderState();
      });
    });
    const retry = state.main.querySelector("[data-forge-heat-retry]");
    if (retry) retry.addEventListener("click", refresh);
  }

  function renderState() {
    if (!state.main) return;
    if (state.loading) state.main.innerHTML = loading();
    else if (state.error) state.main.innerHTML = errorView(state.error);
    else if (state.payload) state.main.innerHTML = page(state.payload.data);
    else state.main.innerHTML = loading();
    wire();
  }

  async function refresh() {
    state.loading = true;
    state.error = null;
    renderState();
    try {
      state.payload = await load();
    } catch (error) {
      state.payload = null;
      state.error = error;
    } finally {
      state.loading = false;
      renderState();
    }
  }

  function render(main) {
    state.main = main;
    state.tab = "top5";
    state.payload = null;
    state.error = null;
    refresh();
  }

  window.FlipForgeCustomerForgeHeat = Object.freeze({
    isEligible: eligibleHost,
    render,
    refresh
  });
})();
