(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const PATHS = Object.freeze({
    health: "/api/v1/health",
    dashboard: "/api/v1/dashboard",
    opportunities: "/api/v1/opportunities"
  });
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

  const main = document.querySelector("#main-content");
  let generation = 0;
  let lastSnapshot = null;

  function appEligible() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
  }

  function productionHost() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function safeNumber(value) {
    return numberOrNull(value) ?? 0;
  }

  function money(value) {
    const number = numberOrNull(value);
    if (number === null) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(number);
  }

  function integer(value) {
    const number = numberOrNull(value);
    return number === null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number);
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `ff-dashboard-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      const error = new Error("The dashboard response exceeded the browser safety limit.");
      error.code = "DASHBOARD_RESPONSE_TOO_LARGE";
      throw error;
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      const error = new Error("The customer gateway returned invalid JSON.");
      error.code = "DASHBOARD_INVALID_JSON";
      throw error;
    }
  }

  function validHealth(payload, requestCorrelationId) {
    return Boolean(payload && payload.meta && payload.data)
      && payload.meta.contractVersion === CONTRACT_VERSION
      && payload.meta.correlationId === requestCorrelationId;
  }

  function validAuthorityEnvelope(payload, requestCorrelationId) {
    const meta = payload && payload.meta;
    return Boolean(meta)
      && meta.contractVersion === CONTRACT_VERSION
      && meta.correlationId === requestCorrelationId
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && Object.prototype.hasOwnProperty.call(payload, "data");
  }

  async function request(path, health = false) {
    if (!Object.values(PATHS).includes(path)) throw new Error("Dashboard API path is not allowlisted.");
    const requestCorrelationId = correlationId();
    const response = await fetch(path, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Correlation-Id": requestCorrelationId
      },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload && payload.error ? payload.error : {};
      const error = new Error(upstream.message || `Customer request failed with status ${response.status}.`);
      error.code = upstream.code || "DASHBOARD_REQUEST_FAILED";
      error.status = response.status;
      error.correlationId = upstream.correlationId || requestCorrelationId;
      throw error;
    }
    const valid = health
      ? validHealth(payload, requestCorrelationId)
      : validAuthorityEnvelope(payload, requestCorrelationId);
    if (!valid) {
      const error = new Error("The customer response failed the FlipForge authority contract.");
      error.code = "DASHBOARD_CONTRACT_INVALID";
      throw error;
    }
    return payload;
  }

  function relativeTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Live tenant data";
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return "Updated just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `Updated ${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Updated ${hours} hr ago`;
    return `Updated ${date.toLocaleDateString()}`;
  }

  function recommendationPill(value) {
    const label = String(value || "UNKNOWN").toUpperCase();
    const state = label.toLowerCase().replace(/[^a-z]/g, "");
    return `<span class="ff-recommendation-pill" data-state="${escapeHtml(state)}">${escapeHtml(label)}</span>`;
  }

  function percentOf(part, total) {
    return total > 0 ? (part / total) * 100 : 0;
  }

  function confidenceBins(items) {
    const bins = [
      { label: "80 – 100", min: 80, max: 100, color: "#38b84f", count: 0 },
      { label: "60 – 79", min: 60, max: 79.999, color: "#e7b72f", count: 0 },
      { label: "40 – 59", min: 40, max: 59.999, color: "#e56b32", count: 0 },
      { label: "20 – 39", min: 20, max: 39.999, color: "#df403e", count: 0 },
      { label: "0 – 19", min: 0, max: 19.999, color: "#5d6670", count: 0 }
    ];
    items.forEach(item => {
      const confidence = numberOrNull(item && item.confidence);
      if (confidence === null) return;
      const bin = bins.find(entry => confidence >= entry.min && confidence <= entry.max);
      if (bin) bin.count += 1;
    });
    return bins;
  }

  function factorRow(label, value, kind = "normal") {
    const number = numberOrNull(value);
    const bounded = number === null ? 0 : Math.max(0, Math.min(100, number));
    const fill = kind === "risk"
      ? "linear-gradient(90deg,#8f332f,#e05a4e)"
      : "linear-gradient(90deg,#b98c1e,#e2bf58)";
    return `<div class="ff-factor-row"><span>${escapeHtml(label)}</span><span class="ff-factor-track"><span style="width:${bounded}%;background:${fill}"></span></span><strong>${number === null ? "—" : `${Math.round(number)}`}</strong></div>`;
  }

  function kpiCard(label, value, note, tone = "neutral") {
    return `<article class="ff-kpi-card" data-tone="${escapeHtml(tone)}"><span class="ff-kpi-label">${escapeHtml(label)}</span><strong class="ff-kpi-value">${escapeHtml(value)}</strong><small class="ff-kpi-note">${escapeHtml(note)}</small></article>`;
  }

  function errorMarkup(error) {
    const status = Number(error && error.status) || 0;
    const code = String(error && error.code || "DASHBOARD_UNAVAILABLE");
    const message = status === 401
      ? "Sign in with an invited FlipForge account to load tenant-owned intelligence."
      : status === 403
        ? "This signed-in account does not currently have one active FlipForge tenant membership."
        : String(error && error.message || "The dashboard could not load authoritative customer data.");
    const signIn = status === 401
      ? `<a class="button button-primary" href="${productionHost() ? "/production-auth.html?return=%2Fapp%2F%23%2Fdashboard" : "/staging-auth.html?returnTo=%2Fsaas-prototype%2F%23%2Fdashboard"}">Sign in securely</a>`
      : "";
    return `<div class="ff-commercial-error" role="alert"><strong>${escapeHtml(code)}</strong><p>${escapeHtml(message)}</p>${signIn}</div>`;
  }

  function emptySpotlight() {
    return `<section class="ff-v2-panel"><div class="ff-v2-panel-body ff-commercial-empty"><strong>No saved decisions yet.</strong><p>Evaluate one exact card to create the first tenant-owned Smart Opportunity record.</p><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div></section>`;
  }

  function decisionSpotlight(item) {
    if (!item) return emptySpotlight();
    const title = item.title || item.cardIdentity || "Saved FlipForge decision";
    const identity = item.cardIdentity || "Exact-card identity returned by the authoritative service";
    const confidence = numberOrNull(item.confidence);
    const ask = numberOrNull(item.ask);
    const supported = numberOrNull(item.supportedValue);
    const gap = ask !== null && supported !== null ? supported - ask : null;
    const exactSales = numberOrNull(item.evidence && item.evidence.acceptedSales);
    const id = String(item.id || "");
    const detailHref = SAFE_ID.test(id) ? `#/opportunities/${encodeURIComponent(id)}` : "#/opportunities";

    return `<section class="ff-v2-panel">
      <div class="ff-v2-panel-body">
        <div class="ff-decision-spotlight">
          <div class="ff-decision-identity">
            <span class="ff-decision-kicker">Decision spotlight · server order preserved</span>
            ${recommendationPill(item.recommendation)}
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(identity)}</p>
            <div class="ff-decision-stats">
              <div><span>Ask</span><strong>${escapeHtml(money(ask))}</strong></div>
              <div><span>Supported value</span><strong>${escapeHtml(money(supported))}</strong></div>
              <div><span>Value gap</span><strong class="${gap !== null && gap > 0 ? "ff-positive" : ""}">${gap === null ? "—" : escapeHtml(money(gap))}</strong></div>
              <div><span>Exact accepted sales</span><strong>${exactSales === null ? "—" : escapeHtml(integer(exactSales))}</strong></div>
            </div>
            <div class="ff-dashboard-actions"><a class="button button-primary" href="${detailHref}">View full analysis</a><a class="button button-secondary" href="#/tracking">Open watchlist</a></div>
          </div>
          <div class="ff-confidence-block">
            <div class="ff-confidence-ring" style="--confidence:${confidence === null ? 0 : Math.max(0, Math.min(100, confidence))}"><div class="ff-confidence-ring-copy"><strong>${confidence === null ? "—" : Math.round(confidence)}</strong><span>Decision confidence</span></div></div>
            <div class="ff-factor-list">
              ${factorRow("Confidence", item.confidence)}
              ${factorRow("Liquidity", item.liquidity)}
              ${factorRow("Risk", item.risk, "risk")}
              ${factorRow("Rank", item.rank)}
            </div>
          </div>
        </div>
      </div>
    </section>`;
  }

  function distributionPanel(items) {
    const bins = confidenceBins(items);
    const total = bins.reduce((sum, bin) => sum + bin.count, 0);
    const percentages = bins.map(bin => percentOf(bin.count, total));
    const donutStyle = total
      ? `--a:${percentages[0]};--b:${percentages[1]};--c:${percentages[2]};--d:${percentages[3]};--e:${percentages[4]}`
      : "background:#303943";
    return `<section class="ff-v2-panel">
      <header class="ff-v2-panel-head"><div><h2>Saved confidence distribution</h2><p>Display-only aggregation of server-returned confidence scores. No browser rescoring or reranking.</p></div></header>
      <div class="ff-v2-panel-body ff-distribution">
        <div class="ff-donut" style="${donutStyle}"><div class="ff-donut-copy"><strong>${total}</strong><span>scored records</span></div></div>
        <div class="ff-distribution-list">${bins.map(bin => `<div class="ff-distribution-row"><i style="background:${bin.color}"></i><span>${bin.label}</span><strong>${bin.count}${total ? ` · ${percentOf(bin.count,total).toFixed(0)}%` : ""}</strong></div>`).join("")}</div>
      </div>
    </section>`;
  }

  function marketIndexPanel() {
    return `<section class="ff-v2-panel">
      <header class="ff-v2-panel-head"><div><h2>Market Index</h2><p>Market-wide trend intelligence</p></div><span class="ff-recommendation-pill" data-state="watch">NOT CONFIGURED</span></header>
      <div class="ff-v2-panel-body ff-market-placeholder"><strong>—</strong><p>FlipForge does not yet have an authoritative market-wide index engine. This panel intentionally stays blank rather than presenting a fabricated index or chart.</p><div class="ff-market-baseline" aria-hidden="true"></div></div>
    </section>`;
  }

  function recentDecisions(items) {
    if (!items.length) return `<div class="ff-v2-panel-body ff-commercial-empty"><strong>No recent decisions.</strong><p>Saved Smart Opportunity records will appear here after evaluation.</p></div>`;
    const rows = items.slice(0, 6).map(item => {
      const id = String(item.id || "");
      const href = SAFE_ID.test(id) ? `#/opportunities/${encodeURIComponent(id)}` : "#/opportunities";
      const title = item.title || item.cardIdentity || id || "Saved decision";
      const exactSales = numberOrNull(item.evidence && item.evidence.acceptedSales);
      return `<tr><td><a href="${href}">${escapeHtml(title)}</a><br><small>${escapeHtml(item.cardIdentity || item.platform || "Saved record")}</small></td><td>${recommendationPill(item.recommendation)}</td><td>${escapeHtml(money(item.ask))}</td><td>${escapeHtml(money(item.supportedValue))}</td><td>${numberOrNull(item.confidence) === null ? "—" : `${Math.round(Number(item.confidence))}`}</td><td>${exactSales === null ? "—" : escapeHtml(integer(exactSales))}</td><td>${escapeHtml(item.mappingState || "UNKNOWN")}</td></tr>`;
    }).join("");
    return `<div class="ff-v2-table-wrap"><table class="ff-v2-table"><thead><tr><th>Card</th><th>Decision</th><th>Ask</th><th>Supported</th><th>Confidence</th><th>Exact sales</th><th>Mapping</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function attentionPanel(metrics, tracked) {
    const needsVerification = safeNumber(metrics.needsVerification);
    const evidenceReady = safeNumber(metrics.evidenceReady);
    const populationReady = safeNumber(metrics.populationContextAvailable);
    const evidenceDetail = tracked > 0 ? `${evidenceReady} of ${tracked} tracked decisions are server-reported evidence ready.` : "No tracked decision count is available yet.";
    const populationDetail = tracked > 0 ? `${populationReady} of ${tracked} tracked decisions include saved PSA population context.` : "No tracked decision count is available yet.";
    return `<section class="ff-v2-panel"><header class="ff-v2-panel-head"><div><h2>Attention queue</h2><p>Server-reported states that deserve review. This is not an external notification service.</p></div><a class="panel-link" href="#/alerts">Open alerts →</a></header><div class="ff-v2-panel-body ff-attention-list">
      <div class="ff-attention-item"><span class="ff-attention-icon">${needsVerification > 0 ? "!" : "✓"}</span><span><strong>${needsVerification > 0 ? `${needsVerification} decision${needsVerification === 1 ? "" : "s"} need verification` : "No verification backlog reported"}</strong><small>${needsVerification > 0 ? "Open the saved decision and resolve the server-reported review state before relying on it." : "The dashboard endpoint currently reports zero decisions needing verification."}</small></span></div>
      <div class="ff-attention-item"><span class="ff-attention-icon">E</span><span><strong>Evidence coverage</strong><small>${escapeHtml(evidenceDetail)}</small></span></div>
      <div class="ff-attention-item"><span class="ff-attention-icon">P</span><span><strong>PSA context</strong><small>${escapeHtml(populationDetail)}</small></span></div>
    </div></section>`;
  }

  function renderSnapshot(snapshot) {
    if (!main || routeName() !== "dashboard") return;
    const dashboard = snapshot.dashboard || {};
    const opportunities = snapshot.opportunities || {};
    const metrics = dashboard.data && dashboard.data.metrics ? dashboard.data.metrics : {};
    const items = Array.isArray(opportunities.data && opportunities.data.items) ? opportunities.data.items : [];
    const tracked = safeNumber(metrics.trackedOpportunities);
    const evidenceReady = safeNumber(metrics.evidenceReady);
    const populationReady = safeNumber(metrics.populationContextAvailable);
    const reviewCount = safeNumber(metrics.needsVerification);
    const focus = items[0] || null;
    const focusConfidence = focus && numberOrNull(focus.confidence);
    const freshness = relativeTime(dashboard.meta && dashboard.meta.generatedAt || opportunities.meta && opportunities.meta.generatedAt);

    main.innerHTML = `<div class="page ff-commercial-dashboard" data-commercial-dashboard-v2>
      <header class="ff-dashboard-head">
        <div><h1>Dashboard</h1><p>Your tenant-owned decision intelligence at a glance: saved opportunities, evidence readiness, confidence, review states, and the next action—without inventing market data.</p></div>
        <div class="ff-dashboard-head-actions"><span class="ff-data-freshness">◷ ${escapeHtml(freshness)}</span><button class="button button-secondary" type="button" data-commercial-dashboard-refresh>↻ Refresh</button><a class="button button-primary" href="#/evaluate">+ Evaluate Card</a></div>
      </header>

      <section class="ff-kpi-grid" aria-label="Authoritative dashboard metrics">
        ${kpiCard("Tracked Decisions", integer(tracked), "Tenant-owned SQLite records")}
        ${kpiCard("Evidence Ready", integer(evidenceReady), "Confirmed mapping with accepted sales", evidenceReady > 0 ? "good" : "neutral")}
        ${kpiCard("PSA Context", integer(populationReady), "Saved population context available")}
        ${kpiCard("Decision Confidence", focusConfidence === null ? "—" : `${Math.round(focusConfidence)}`, focus ? "Focused saved decision · not a synthetic ForgeScore" : "No saved decision available", focusConfidence !== null && focusConfidence >= 80 ? "good" : "neutral")}
        ${kpiCard("Needs Verification", integer(reviewCount), "Server-reported review state", reviewCount > 0 ? "attention" : "good")}
      </section>

      <div class="ff-dashboard-main-grid">
        <div class="ff-dashboard-stack">
          ${decisionSpotlight(focus)}
          <section class="ff-v2-panel"><header class="ff-v2-panel-head"><div><h2>Recent saved decisions</h2><p>Records stay in the order returned by the authoritative service.</p></div><a class="panel-link" href="#/opportunities">View all →</a></header>${recentDecisions(items)}</section>
        </div>
        <div class="ff-dashboard-stack">
          ${distributionPanel(items)}
          ${marketIndexPanel()}
          ${attentionPanel(metrics, tracked)}
        </div>
      </div>

      <div class="ff-dashboard-boundary"><strong>Authority boundary:</strong> Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. Existing PSA intelligence remains the sole grading-guidance authority. Confidence distribution is display-only aggregation of saved server scores. The Market Index remains unavailable until an authoritative market-index engine exists. No browser scoring, evidence acceptance, grade prediction, purchase, sale, or transaction authority is added by this dashboard.</div>
    </div>`;

    const refresh = main.querySelector("[data-commercial-dashboard-refresh]");
    if (refresh) refresh.addEventListener("click", () => loadDashboard(true));
  }

  function renderLoading() {
    if (!main || routeName() !== "dashboard") return;
    main.innerHTML = `<div class="page ff-commercial-dashboard" data-commercial-dashboard-v2><header class="ff-dashboard-head"><div><h1>Dashboard</h1><p>Loading tenant-owned FlipForge intelligence.</p></div></header><div class="ff-commercial-loading" role="status">Loading authoritative dashboard data…</div></div>`;
  }

  function renderError(error) {
    if (!main || routeName() !== "dashboard") return;
    main.innerHTML = `<div class="page ff-commercial-dashboard" data-commercial-dashboard-v2><header class="ff-dashboard-head"><div><h1>Dashboard</h1><p>FlipForge fails closed when the authenticated customer intelligence path is unavailable.</p></div><div class="ff-dashboard-head-actions"><button class="button button-secondary" type="button" data-commercial-dashboard-refresh>↻ Retry</button></div></header>${errorMarkup(error)}</div>`;
    const refresh = main.querySelector("[data-commercial-dashboard-refresh]");
    if (refresh) refresh.addEventListener("click", () => loadDashboard(true));
  }

  async function loadDashboard(force = false) {
    if (!appEligible() || routeName() !== "dashboard" || !main) return;
    const current = ++generation;
    if (!force && lastSnapshot) {
      renderSnapshot(lastSnapshot);
    } else {
      renderLoading();
    }
    try {
      const health = await request(PATHS.health, true);
      if (current !== generation || routeName() !== "dashboard") return;
      if (!health.data || health.data.status !== "configured" || health.data.bridgeEnabled !== true) {
        const error = new Error("The authenticated customer API bridge is not configured for this app host.");
        error.code = "CUSTOMER_API_NOT_CONFIGURED";
        throw error;
      }
      const [dashboard, opportunities] = await Promise.all([
        request(PATHS.dashboard),
        request(PATHS.opportunities)
      ]);
      if (current !== generation || routeName() !== "dashboard") return;
      lastSnapshot = { health, dashboard, opportunities };
      renderSnapshot(lastSnapshot);
    } catch (error) {
      if (current !== generation || routeName() !== "dashboard") return;
      renderError(error);
    }
  }

  function polishShell() {
    if (!appEligible()) return;
    document.body.classList.add("ff-commercial-shell");
    const chip = document.querySelector(".prototype-chip");
    if (chip) chip.textContent = productionHost() ? "PRIVATE BETA" : "BETA PREVIEW";
    const planCard = document.querySelector(".plan-card");
    if (planCard) {
      const eyebrow = planCard.querySelector(".eyebrow");
      const strong = planCard.querySelector("strong");
      const small = planCard.querySelector("small");
      if (eyebrow) eyebrow.textContent = "Tenant access";
      if (strong) strong.textContent = "Plan & Usage";
      if (small) small.textContent = "Plan state, evaluation usage, checkout availability, and billing access are server-owned.";
    }
    if (productionHost()) document.title = "FlipForge | Card Intelligence";
  }

  function showDashboardBanner() {
    if (routeName() !== "dashboard") return;
    const banner = document.querySelector(".prototype-banner");
    if (!banner) return;
    const title = banner.querySelector("strong");
    const copy = banner.querySelector("span");
    if (title) title.textContent = "PRIVATE BETA INTELLIGENCE";
    if (copy) copy.textContent = "Authenticated tenant-scoped decisions · SQLite saved · No transaction authority";
  }

  function apply() {
    if (!appEligible()) return;
    polishShell();
    if (routeName() !== "dashboard") {
      generation += 1;
      return;
    }
    showDashboardBanner();
    loadDashboard(false);
  }

  window.addEventListener("hashchange", () => queueMicrotask(apply));
  window.addEventListener("flipforge:identity-change", () => {
    if (routeName() === "dashboard") loadDashboard(true);
  });
  queueMicrotask(apply);
})();
