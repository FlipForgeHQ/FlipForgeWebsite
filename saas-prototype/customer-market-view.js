(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const MARKET_VIEW_VERSION = "MARKET_VIEW_V1";
  const ENDPOINT = "/api/v1/opportunities/__market-view-v1";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

  const state = {
    main: null,
    loading: false,
    payload: null,
    error: null
  };

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

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `market-view-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function number(value, digits = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "0";
    return parsed.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function percent(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `${parsed.toFixed(1)}%` : "0.0%";
  }

  function signedPercent(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "0.0%";
    return `${parsed > 0 ? "+" : ""}${parsed.toFixed(1)}%`;
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

  function nonNegative(value) {
    return Number.isFinite(Number(value)) && Number(value) >= 0;
  }

  function validCoverage(value, horizon) {
    return value
      && value.horizonDays === horizon
      && Number.isInteger(value.observed)
      && value.observed >= 0
      && Number.isInteger(value.eligible)
      && value.eligible >= 0
      && nonNegative(value.coveragePct)
      && Number(value.coveragePct) <= 100;
  }

  function validValueContext(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if (item.opportunityId && !SAFE_ID.test(String(item.opportunityId))) return false;
    if (typeof item.cardIdentity !== "string" || !item.cardIdentity.trim()) return false;
    if (!Number.isSafeInteger(item.allInAskCents) || item.allInAskCents <= 0) return false;
    if (!Number.isSafeInteger(item.supportedValueCents) || item.supportedValueCents <= item.allInAskCents) return false;
    if (!Number.isSafeInteger(item.supportedValueGapCents) || item.supportedValueGapCents <= 0) return false;
    if (!nonNegative(item.supportedValueGapPct)) return false;
    return Number.isInteger(item.confidence)
      && item.confidence >= 0
      && item.confidence <= 100
      && Number.isInteger(item.risk)
      && item.risk >= 0
      && item.risk <= 100
      && Number.isInteger(item.exactTrustedSales)
      && item.exactTrustedSales >= 0;
  }

  function validData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    if (data.kind !== "market-view" || data.marketViewVersion !== MARKET_VIEW_VERSION || data.readOnly !== true) return false;
    if (!data.scope
        || data.scope.code !== "SAVED_EVALUATED_UNIVERSE"
        || data.scope.label !== "Your Market"
        || data.scope.marketWide !== false
        || data.scope.continuousMarketScannerActive !== false) return false;
    if (!data.authority
        || data.authority.recommendationAuthority !== "Smart Opportunity"
        || data.authority.marketViewRecommendationAuthority !== false
        || data.authority.clientComputed !== false
        || data.authority.transactionAuthority !== false) return false;
    if (data.transactionAuthority !== false) return false;

    const summary = data.summary || {};
    if (!["evaluatedCards", "actionableSavedDecisions", "actionableSharePct", "positiveSupportedValueGap", "positiveGapSharePct", "freshWithin30Days", "freshnessPct"]
      .every(key => nonNegative(summary[key]))) return false;

    const mix = data.decisionMix || {};
    if (!["BUY", "WATCH", "VERIFY", "PASS", "OTHER"].every(key => Number.isInteger(mix[key]) && mix[key] >= 0)) return false;

    const evidence = data.evidenceHealth || {};
    if (!["strongEvidenceCards", "strongEvidencePct", "averageExactTrustedSales", "averageConfidence", "averageRisk"]
      .every(key => nonNegative(evidence[key]))) return false;

    const value = data.valueContext || {};
    if (value.profitOrRoi !== false || !Array.isArray(value.topPositiveGap) || !value.topPositiveGap.every(validValueContext)) return false;

    const coverage = data.outcomeCoverage || {};
    if (!validCoverage(coverage["7"], 7) || !validCoverage(coverage["14"], 14) || !validCoverage(coverage["30"], 30)) return false;

    return data.broaderMarket
      && data.broaderMarket.available === false
      && data.broaderMarket.marketWideVolume === false
      && data.broaderMarket.marketWideMomentum === false
      && data.broaderMarket.marketPriceIndex === false;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("Market View response exceeded the browser safety limit.");
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw new Error("Market View returned invalid JSON.");
    }
  }

  async function load() {
    const requestCorrelationId = correlationId();
    const response = await fetch(ENDPOINT, {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Market View request failed with status ${response.status}.`), {
        code: upstream.code || "MARKET_VIEW_REQUEST_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    if (!validEnvelope(payload, requestCorrelationId) || !validData(payload.data)) {
      throw new Error("Market View failed the FlipForge authority contract.");
    }
    return payload;
  }

  function metric(label, value, detail) {
    return `<article class="market-view-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
  }

  function decisionMix(data) {
    const total = Math.max(1, Number(data.summary?.evaluatedCards || 0));
    const mix = data.decisionMix || {};
    const entries = [
      ["BUY", mix.BUY || 0],
      ["WATCH", mix.WATCH || 0],
      ["VERIFY", mix.VERIFY || 0],
      ["PASS", mix.PASS || 0]
    ];
    if (mix.OTHER) entries.push(["OTHER", mix.OTHER]);
    return entries.map(([label, count]) => {
      const width = Math.max(0, Math.min(100, Number(count) * 100 / total));
      return `<div class="market-view-bar-row">
        <div class="market-view-bar-label"><span>${escapeHtml(label)}</span><strong>${escapeHtml(count)}</strong></div>
        <div class="market-view-bar-track" aria-label="${escapeHtml(label)} ${percent(width)}"><span style="width:${width.toFixed(1)}%"></span></div>
      </div>`;
    }).join("");
  }

  function valueRows(data) {
    const items = Array.isArray(data.valueContext?.topPositiveGap) ? data.valueContext.topPositiveGap : [];
    if (!items.length) {
      return `<div class="market-view-empty"><strong>No positive supported-value gaps yet.</strong><p>As you evaluate cards, Market View will summarize evidence-supported value context here.</p></div>`;
    }
    return items.map(item => {
      const id = SAFE_ID.test(String(item.opportunityId || "")) ? String(item.opportunityId) : "";
      return `<article class="market-view-value-row">
        <div class="market-view-rank">${escapeHtml(item.rank)}</div>
        <div class="market-view-value-identity"><strong>${escapeHtml(item.cardIdentity)}</strong><span>${escapeHtml(item.savedRecommendation || "Saved decision")} · ${escapeHtml(item.exactTrustedSales)} exact trusted sales</span></div>
        <div class="market-view-value-numbers"><strong>${signedPercent(item.supportedValueGapPct)}</strong><span>${moneyCents(item.allInAskCents)} → ${moneyCents(item.supportedValueCents)}</span></div>
        ${id ? `<a class="button button-secondary" href="#/opportunities/${escapeHtml(id)}">Open</a>` : ""}
      </article>`;
    }).join("");
  }

  function coverageCard(data, horizon) {
    const item = data.outcomeCoverage?.[String(horizon)] || { observed: 0, eligible: 0, coveragePct: 0 };
    const width = Math.max(0, Math.min(100, Number(item.coveragePct || 0)));
    return `<article class="market-view-coverage-card">
      <div><span>Day ${horizon}</span><strong>${percent(width)}</strong></div>
      <div class="market-view-coverage-track"><span style="width:${width.toFixed(1)}%"></span></div>
      <small>${escapeHtml(item.observed)} of ${escapeHtml(item.eligible)} evaluated cards have a governed Day ${horizon} observation.</small>
    </article>`;
  }

  function content(data) {
    const summary = data.summary || {};
    const evidence = data.evidenceHealth || {};
    const value = data.valueContext || {};
    return `<div class="market-view-shell">
      <header class="market-view-hero">
        <div>
          <span class="eyebrow">YOUR MARKET · ${escapeHtml(data.marketViewVersion)}</span>
          <h1>Market View</h1>
          <p>See the shape of the cards you have actually evaluated: decision breadth, evidence strength, value context, freshness, and outcome coverage.</p>
          <div class="market-view-actions"><a class="button button-primary" href="#/discover">Discover a card</a><a class="button button-secondary" href="#/forge-heat">Open Forge Heat</a></div>
        </div>
        <aside class="market-view-scope">
          <span>Current scope</span>
          <strong>${escapeHtml(data.scope?.label || "Your Market")}</strong>
          <p>Saved completed evaluations for this account.</p>
          <small>Not a whole-market scanner · No fabricated volume or momentum · No transaction authority</small>
        </aside>
      </header>

      <section class="market-view-metrics" aria-label="Your Market summary">
        ${metric("Evaluated cards", number(summary.evaluatedCards), "Latest saved evaluation per opportunity")}
        ${metric("BUY + WATCH", percent(summary.actionableSharePct), `${number(summary.actionableSavedDecisions)} saved decisions`)}
        ${metric("Positive value context", percent(summary.positiveGapSharePct), `${number(summary.positiveSupportedValueGap)} cards above saved all-in ask`)}
        ${metric("Freshness", percent(summary.freshnessPct), `${number(summary.freshWithin30Days)} evaluated within 30 days`)}
      </section>

      <section class="market-view-grid">
        <article class="market-view-panel">
          <header><span class="eyebrow">MARKET BREADTH</span><h2>What your saved decisions are saying</h2><p>This is distribution, not a new recommendation engine.</p></header>
          <div class="market-view-bars">${decisionMix(data)}</div>
        </article>

        <article class="market-view-panel">
          <header><span class="eyebrow">EVIDENCE HEALTH</span><h2>How well supported the evaluated universe is</h2><p>Evidence quality changes how much weight to place on the picture.</p></header>
          <div class="market-view-health-grid">
            <div><span>Strong evidence</span><strong>${percent(evidence.strongEvidencePct)}</strong><small>${number(evidence.strongEvidenceCards)} cards with 3+ exact trusted sales</small></div>
            <div><span>Avg exact sales</span><strong>${number(evidence.averageExactTrustedSales, 1)}</strong><small>Across evaluated cards</small></div>
            <div><span>Avg confidence</span><strong>${number(evidence.averageConfidence, 1)}/100</strong><small>Saved decision confidence</small></div>
            <div><span>Avg risk</span><strong>${number(evidence.averageRisk, 1)}/100</strong><small>Saved opportunity risk</small></div>
          </div>
        </article>
      </section>

      <section class="market-view-panel market-view-value-panel">
        <header class="market-view-section-heading"><div><span class="eyebrow">VALUE CONTEXT</span><h2>Where supported value sits above saved ask</h2><p>Median positive gap: <strong>${signedPercent(value.medianPositiveGapPct)}</strong>. This is evidence context—not profit or ROI.</p></div><a href="#/opportunities">View opportunities →</a></header>
        <div class="market-view-value-list">${valueRows(data)}</div>
      </section>

      <section class="market-view-panel">
        <header><span class="eyebrow">OUTCOME COVERAGE</span><h2>How much of the 7 / 14 / 30 proof cycle exists</h2><p>These percentages measure governed observation coverage. They do not imply market momentum.</p></header>
        <div class="market-view-coverage-grid">
          ${coverageCard(data, 7)}
          ${coverageCard(data, 14)}
          ${coverageCard(data, 30)}
        </div>
      </section>

      <section class="market-view-broader">
        <div class="market-view-broader-mark" aria-hidden="true">↗</div>
        <div><span class="eyebrow">BROADER MARKET</span><h2>Whole-market intelligence is not active yet.</h2><p>${escapeHtml(data.broaderMarket?.reason || "Governed market-wide scanner and history inputs are not active yet.")}</p><small>FlipForge will add broader volume, momentum, and market-index views only when the underlying data can support those claims.</small></div>
      </section>

      <p class="market-view-boundary"><strong>Decision boundary:</strong> Market View describes your evaluated universe. Smart Opportunity still owns BUY/WATCH/VERIFY/PASS. Forge Heat prioritizes qualified saved opportunities. Market View does neither.</p>
    </div>`;
  }

  function loading() {
    return `<div class="market-view-shell"><section class="market-view-loading" role="status"><span class="market-view-spinner" aria-hidden="true"></span><div><strong>Building your Market View…</strong><p>Reading saved evaluations and governed outcome coverage.</p></div></section></div>`;
  }

  function errorView(error) {
    return `<div class="market-view-shell"><section class="market-view-error" role="alert"><strong>Market View is temporarily unavailable.</strong><p>${escapeHtml(error?.message || "Try again in a moment.")}</p><button class="button button-primary" type="button" data-market-view-retry>Try again</button></section></div>`;
  }

  function emptyView() {
    return `<div class="market-view-shell">
      <header class="market-view-hero"><div><span class="eyebrow">YOUR MARKET · ${MARKET_VIEW_VERSION}</span><h1>Market View</h1><p>Your evaluated universe will appear here after you save completed card evaluations.</p><div class="market-view-actions"><a class="button button-primary" href="#/discover">Discover your first card</a></div></div><aside class="market-view-scope"><span>Current scope</span><strong>Your Market</strong><p>Saved completed evaluations for this account.</p><small>Not a whole-market scanner</small></aside></header>
      <section class="market-view-empty"><strong>No evaluated cards yet.</strong><p>Evaluate a card and FlipForge will begin building decision breadth, evidence health, value context, and 7/14/30 coverage.</p></section>
    </div>`;
  }

  function paint() {
    if (!state.main) return;
    if (state.loading) state.main.innerHTML = loading();
    else if (state.error) state.main.innerHTML = errorView(state.error);
    else if (!state.payload?.data?.summary?.evaluatedCards) state.main.innerHTML = emptyView();
    else state.main.innerHTML = content(state.payload.data);

    state.main.querySelector("[data-market-view-retry]")?.addEventListener("click", refresh);
  }

  async function refresh() {
    state.loading = true;
    state.error = null;
    paint();
    try {
      state.payload = await load();
    } catch (error) {
      state.payload = null;
      state.error = error;
    } finally {
      state.loading = false;
      paint();
    }
  }

  function render(main) {
    state.main = main;
    state.payload = null;
    state.error = null;
    refresh();
  }

  window.FlipForgeCustomerMarketView = Object.freeze({
    isEligible: eligibleHost,
    render,
    refresh,
    endpoint: ENDPOINT,
    version: MARKET_VIEW_VERSION
  });
})();
