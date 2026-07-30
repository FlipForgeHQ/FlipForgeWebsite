(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const ALLOWED_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const READ_PATHS = Object.freeze({
    health: "/api/v1/health",
    dashboard: "/api/v1/dashboard",
    opportunities: "/api/v1/opportunities"
  });

  const state = {
    loading: false,
    loaded: false,
    health: null,
    dashboard: null,
    opportunities: null,
    detail: null,
    evidence: null,
    psa: null,
    selectedId: "",
    error: null,
    partialErrors: []
  };

  function eligibleHost() {
    return ALLOWED_HOST.test(String(window.location.hostname || ""));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(safeNumber(value));
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `staging-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function identityAuthorization() {
    const identity = window.netlifyIdentity;
    if (!identity || typeof identity.currentUser !== "function") return null;
    const user = identity.currentUser();
    if (!user || typeof user.jwt !== "function") return null;
    const token = await user.jwt();
    return typeof token === "string" && token.trim() ? `Bearer ${token.trim()}` : null;
  }

  function requireAllowedPath(path) {
    const value = String(path || "");
    if (Object.values(READ_PATHS).includes(value)) return value;
    const match = value.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor)\/([^/?#]+)$/);
    if (!match || !SAFE_ID.test(decodeURIComponent(match[2]))) {
      throw new Error("The requested staging API path is not allowlisted.");
    }
    return value;
  }

  function validEnvelope(payload, expectedCorrelationId) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    const meta = payload.meta;
    if (!meta || typeof meta !== "object") return false;
    return meta.contractVersion === CONTRACT_VERSION
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.correlationId === expectedCorrelationId
      && Object.prototype.hasOwnProperty.call(payload, "data");
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      const error = new Error("The staging response exceeded the browser safety limit.");
      error.code = "STAGING_RESPONSE_TOO_LARGE";
      throw error;
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      const error = new Error("The staging gateway returned invalid JSON.");
      error.code = "STAGING_INVALID_JSON";
      throw error;
    }
  }

  async function request(path) {
    const safePath = requireAllowedPath(path);
    const requestCorrelationId = correlationId();
    const authorization = await identityAuthorization();
    const headers = {
      Accept: "application/json",
      "X-Correlation-Id": requestCorrelationId
    };
    if (authorization) headers.Authorization = authorization;

    const response = await fetch(safePath, {
      method: "GET",
      headers,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      const upstream = payload && payload.error ? payload.error : {};
      const error = new Error(upstream.message || `Staging request failed with status ${response.status}.`);
      error.code = upstream.code || "STAGING_REQUEST_FAILED";
      error.status = response.status;
      error.correlationId = upstream.correlationId || requestCorrelationId;
      throw error;
    }

    if (safePath !== READ_PATHS.health && !validEnvelope(payload, requestCorrelationId)) {
      const error = new Error("The staging response failed the FlipForge authority contract.");
      error.code = "STAGING_CONTRACT_INVALID";
      throw error;
    }

    return payload;
  }

  function resetSelected() {
    state.detail = null;
    state.evidence = null;
    state.psa = null;
    state.selectedId = "";
    state.partialErrors = [];
  }

  async function loadBase() {
    state.loading = true;
    state.error = null;
    resetSelected();
    renderCurrent();

    try {
      state.health = await request(READ_PATHS.health);
      const configured = state.health && state.health.data && state.health.data.status === "configured";
      if (!configured) {
        state.dashboard = null;
        state.opportunities = null;
        state.loaded = true;
        return;
      }

      const [dashboard, opportunities] = await Promise.all([
        request(READ_PATHS.dashboard),
        request(READ_PATHS.opportunities)
      ]);
      state.dashboard = dashboard;
      state.opportunities = opportunities;
      state.loaded = true;
    } catch (error) {
      state.error = error;
      state.loaded = true;
    } finally {
      state.loading = false;
      renderCurrent();
    }
  }

  async function loadDetail(id) {
    if (!SAFE_ID.test(String(id || ""))) {
      state.error = Object.assign(new Error("The saved opportunity identifier is invalid."), { code: "INVALID_OPPORTUNITY_ID" });
      renderCurrent();
      return;
    }

    state.loading = true;
    state.error = null;
    state.partialErrors = [];
    state.selectedId = id;
    renderCurrent();

    const encoded = encodeURIComponent(id);
    const requests = [
      ["detail", `/api/v1/opportunities/${encoded}`],
      ["evidence", `/api/v1/evidence/${encoded}`],
      ["psa", `/api/v1/psa-advisor/${encoded}`]
    ];

    const results = await Promise.allSettled(requests.map(([, path]) => request(path)));
    results.forEach((result, index) => {
      const [key] = requests[index];
      if (result.status === "fulfilled") state[key] = result.value;
      else state.partialErrors.push({ key, error: result.reason });
    });

    if (!state.detail) {
      state.error = state.partialErrors.find(item => item.key === "detail")?.error || new Error("Opportunity detail is unavailable.");
    }
    state.loading = false;
    renderCurrent();
  }

  function statusBadge(label, stateName) {
    return `<span class="staging-status staging-status-${escapeHtml(stateName)}">${escapeHtml(label)}</span>`;
  }

  function errorPanel(error) {
    if (!error) return "";
    const code = escapeHtml(error.code || "STAGING_UNAVAILABLE");
    const message = escapeHtml(error.message || "The staging connection is unavailable.");
    const guidance = error.status === 401
      ? "A configured authentication provider and signed-in preview user are required."
      : error.status === 403
        ? "The signed-in preview user does not have an active tenant membership."
        : "No mock data has been substituted for this staging response.";
    return `<section class="panel staging-error" role="alert"><div class="panel-body"><strong>${code}</strong><p>${message}</p><small>${escapeHtml(guidance)}</small></div></section>`;
  }

  function healthPanel() {
    const data = state.health && state.health.data ? state.health.data : null;
    if (!data) return "";
    const configured = data.status === "configured";
    return `<section class="panel staging-health">
      <header class="panel-header"><div><h2>Gateway health</h2><p>Public, non-sensitive configuration state from the same-origin gateway.</p></div>${statusBadge(configured ? "Configured" : "Disabled", configured ? "ok" : "warn")}</header>
      <div class="panel-body staging-key-grid">
        <div><span>Bridge enabled</span><strong>${data.bridgeEnabled === true ? "Yes" : "No"}</strong></div>
        <div><span>Upstream configured</span><strong>${data.upstreamConfigured === true ? "Yes" : "No"}</strong></div>
        <div><span>Authentication required</span><strong>${data.authenticationRequired === false ? "No" : "Yes"}</strong></div>
        <div><span>Tenant membership required</span><strong>${data.tenantMembershipRequired === false ? "No" : "Yes"}</strong></div>
      </div>
    </section>`;
  }

  function metricCards() {
    const metrics = state.dashboard?.data?.metrics;
    if (!metrics) return "";
    const values = [
      ["Tracked opportunities", metrics.trackedOpportunities],
      ["Evidence ready", metrics.evidenceReady],
      ["Population available", metrics.populationContextAvailable],
      ["Needs verification", metrics.needsVerification]
    ];
    return `<section class="staging-metrics" aria-label="Authoritative staging metrics">${values.map(([label, value]) => `<article class="panel"><div class="panel-body"><span>${escapeHtml(label)}</span><strong>${escapeHtml(safeNumber(value))}</strong></div></article>`).join("")}</section>`;
  }

  function opportunityRows() {
    const items = state.opportunities?.data?.items;
    if (!Array.isArray(items)) return "";
    if (!items.length) return `<div class="staging-empty">No tenant-owned saved opportunities were returned.</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Saved card</th><th>Decision</th><th>Ask</th><th>Supported</th><th>Confidence</th><th>Evidence</th><th>Mapping</th></tr></thead><tbody>${items.map(item => {
      const id = String(item.id ?? "");
      const validId = SAFE_ID.test(id);
      const label = item.title || item.cardIdentity || id;
      return `<tr ${validId ? `data-staging-opportunity="${escapeHtml(id)}" tabindex="0"` : ""}>
        <td><strong>${escapeHtml(label)}</strong><small>${escapeHtml(item.cardIdentity || id)}</small></td>
        <td>${statusBadge(item.recommendation || "UNKNOWN", String(item.recommendation || "unknown").toLowerCase())}</td>
        <td>${money(item.ask)}</td>
        <td>${money(item.supportedValue)}</td>
        <td>${escapeHtml(safeNumber(item.confidence))}/100</td>
        <td>${escapeHtml(safeNumber(item.evidence?.acceptedSales))}</td>
        <td>${escapeHtml(item.mappingState || "UNKNOWN")}</td>
      </tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function baseView() {
    const configured = state.health?.data?.status === "configured";
    return `<div class="page staging-page">
      <header class="page-heading"><div><span class="eyebrow">Controlled deploy-preview integration</span><h1>Staging Data</h1><p>Authenticated, tenant-scoped saved intelligence from the authoritative FlipForge API. This route never falls back to mock records.</p></div><div class="page-actions"><button class="button button-secondary" type="button" data-staging-refresh>Refresh connection</button></div></header>
      <div class="boundary-note"><strong>Staging boundary:</strong> Read-only browser integration. Smart Opportunity and existing PSA intelligence remain authoritative. No provider call, evidence acceptance, billing, purchase, or production activation is performed here.</div>
      ${state.loading ? `<div class="staging-loading" role="status">Loading staging connection…</div>` : ""}
      ${errorPanel(state.error)}
      ${healthPanel()}
      ${configured && !state.error ? `${metricCards()}${state.opportunities ? `<section class="panel"><header class="panel-header"><div><h2>Tenant-owned opportunities</h2><p>Saved recommendations displayed exactly as returned by the authoritative API.</p></div></header><div class="panel-body">${opportunityRows()}</div></section>` : ""}` : ""}
      ${!configured && state.health ? `<section class="panel"><div class="panel-body staging-empty"><strong>Staging gateway is not active.</strong><p>No customer data request was attempted, and the prototype cockpit remains mock-backed.</p></div></section>` : ""}
    </div>`;
  }

  function detailView() {
    const item = state.detail?.data?.opportunity;
    if (!item) return baseView();
    const evidence = state.evidence?.data;
    const psa = state.psa?.data;
    return `<div class="page staging-page">
      <header class="page-heading"><div><span class="eyebrow">Tenant-scoped saved record</span><h1>${escapeHtml(item.title || item.cardIdentity || item.id)}</h1><p>${escapeHtml(item.cardIdentity || "Saved Smart Opportunity record")}</p></div><div class="page-actions"><a class="button button-secondary" href="#/staging">Back to staging list</a><button class="button button-secondary" type="button" data-staging-refresh>Refresh</button></div></header>
      <div class="boundary-note"><strong>Authority boundary:</strong> Values, decision, evidence state, and PSA context are displayed exactly as saved. This screen cannot rescore, rerank, accept evidence, or predict a grade.</div>
      ${state.loading ? `<div class="staging-loading" role="status">Loading saved detail…</div>` : ""}
      ${errorPanel(state.error)}
      <section class="staging-metrics">
        <article class="panel"><div class="panel-body"><span>Decision</span><strong>${escapeHtml(item.recommendation || "UNKNOWN")}</strong></div></article>
        <article class="panel"><div class="panel-body"><span>Current ask</span><strong>${money(item.ask)}</strong></div></article>
        <article class="panel"><div class="panel-body"><span>Supported value</span><strong>${money(item.supportedValue)}</strong></div></article>
        <article class="panel"><div class="panel-body"><span>Confidence</span><strong>${escapeHtml(safeNumber(item.confidence))}/100</strong></div></article>
      </section>
      <div class="staging-detail-grid">
        <section class="panel"><header class="panel-header"><div><h2>Saved decision factors</h2><p>No browser-side calculation.</p></div></header><div class="panel-body staging-key-grid">
          <div><span>Liquidity</span><strong>${escapeHtml(safeNumber(item.liquidity))}/100</strong></div>
          <div><span>Risk</span><strong>${escapeHtml(safeNumber(item.risk))}/100</strong></div>
          <div><span>Rank</span><strong>${escapeHtml(safeNumber(item.rank))}/100</strong></div>
          <div><span>Evidence count</span><strong>${escapeHtml(safeNumber(item.evidenceCount))}</strong></div>
          <div><span>Mapping</span><strong>${escapeHtml(item.mappingState || "UNKNOWN")}</strong></div>
          <div><span>Context</span><strong>${escapeHtml(item.contextStatus || "UNKNOWN")}</strong></div>
        </div></section>
        <section class="panel"><header class="panel-header"><div><h2>Evidence authority</h2><p>Completed-sale eligibility remains server governed.</p></div></header><div class="panel-body staging-key-grid">
          <div><span>Accepted exact sales</span><strong>${escapeHtml(safeNumber(evidence?.acceptedExactCompletedSales ?? item.evidence?.acceptedSales))}</strong></div>
          <div><span>Visible but ineligible</span><strong>${escapeHtml(safeNumber(evidence?.visibleButAuthorityIneligible))}</strong></div>
          <div><span>Average accepted price</span><strong>${money(item.evidence?.averagePrice)}</strong></div>
          <div><span>Latest sale date</span><strong>${escapeHtml(item.evidence?.latestSaleDate || "Unavailable")}</strong></div>
        </div></section>
        <section class="panel"><header class="panel-header"><div><h2>Saved PSA guidance</h2><p>Existing PSA intelligence only.</p></div></header><div class="panel-body staging-key-grid">
          <div><span>Guidance status</span><strong>${escapeHtml(psa?.guidanceStatus || "Unavailable")}</strong></div>
          <div><span>Population available</span><strong>${psa?.populationContext?.available === true ? "Yes" : "No"}</strong></div>
          <div><span>PSA 10 population</span><strong>${escapeHtml(safeNumber(psa?.populationContext?.psa10Population))}</strong></div>
          <div><span>PSA 9 population</span><strong>${escapeHtml(safeNumber(psa?.populationContext?.psa9Population))}</strong></div>
        </div></section>
      </div>
      ${state.partialErrors.length ? `<section class="panel staging-warning"><div class="panel-body"><strong>Some saved context is unavailable.</strong><ul>${state.partialErrors.filter(item => item.key !== "detail").map(item => `<li>${escapeHtml(item.key.toUpperCase())}: ${escapeHtml(item.error?.code || item.error?.message || "Unavailable")}</li>`).join("")}</ul><small>No replacement or fabricated data was shown.</small></div></section>` : ""}
    </div>`;
  }

  let currentMain = null;
  let currentId = "";

  function bindActions() {
    if (!currentMain) return;
    currentMain.querySelectorAll("[data-staging-refresh]").forEach(button => button.addEventListener("click", () => {
      if (currentId) loadDetail(currentId);
      else loadBase();
    }));
    currentMain.querySelectorAll("[data-staging-opportunity]").forEach(row => {
      const open = () => { window.location.hash = `#/staging/${encodeURIComponent(row.dataset.stagingOpportunity)}`; };
      row.addEventListener("click", open);
      row.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }

  function renderCurrent() {
    if (!currentMain) return;
    currentMain.innerHTML = currentId ? detailView() : baseView();
    bindActions();
  }

  function render(main, id = "") {
    currentMain = main;
    currentId = decodeURIComponent(String(id || ""));
    if (!eligibleHost()) {
      main.innerHTML = `<div class="page"><header class="page-heading"><div><span class="eyebrow">Unavailable route</span><h1>Staging Data</h1><p>This diagnostic route is restricted to deploy previews and local development.</p></div></header><div class="boundary-note">The production website remains mock-backed and the API gateway remains disabled unless separately activated.</div></div>`;
      return;
    }
    if (currentId) loadDetail(currentId);
    else loadBase();
  }

  const navLink = document.querySelector("[data-route='staging']");
  if (navLink && eligibleHost()) navLink.hidden = false;

  window.FlipForgeStagingReadAdapter = Object.freeze({
    isEligible: eligibleHost,
    render,
    refresh: () => currentId ? loadDetail(currentId) : loadBase()
  });
})();
