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

  let currentMain = null;
  let currentId = "";
  let currentSurface = "staging";

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
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(safeNumber(value));
  }

  function customerSurface() {
    return currentSurface === "customer";
  }

  function listRoute() {
    return customerSurface() ? "#/opportunities" : "#/staging";
  }

  function detailRoute(id) {
    const prefix = customerSurface() ? "#/opportunities/" : "#/staging/";
    return `${prefix}${encodeURIComponent(id)}`;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `staging-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function requireAllowedPath(path) {
    const value = String(path || "");
    if (Object.values(READ_PATHS).includes(value)) return value;
    const match = value.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor)\/([^/?#]+)$/);
    if (!match) throw new Error("The requested staging API path is not allowlisted.");
    let decoded = "";
    try {
      decoded = decodeURIComponent(match[2]);
    } catch (_) {
      throw new Error("The requested staging API identifier is invalid.");
    }
    if (!SAFE_ID.test(decoded)) throw new Error("The requested staging API identifier is invalid.");
    return value;
  }

  function validEnvelope(payload, expectedCorrelationId) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    const meta = payload.meta;
    return Boolean(meta)
      && meta.contractVersion === CONTRACT_VERSION
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId
      && Object.prototype.hasOwnProperty.call(payload, "data");
  }

  function validHealth(payload, expectedCorrelationId) {
    return Boolean(payload && payload.meta && payload.data)
      && payload.meta.contractVersion === CONTRACT_VERSION
      && payload.meta.correlationId === expectedCorrelationId;
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
    const headers = { Accept: "application/json", "X-Correlation-Id": requestCorrelationId };

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

    const valid = safePath === READ_PATHS.health
      ? validHealth(payload, requestCorrelationId)
      : validEnvelope(payload, requestCorrelationId);
    if (!valid) {
      const error = new Error("The staging response failed the FlipForge authority contract.");
      error.code = "STAGING_CONTRACT_INVALID";
      throw error;
    }
    return payload;
  }

  function clearDetail() {
    state.detail = null;
    state.evidence = null;
    state.psa = null;
    state.selectedId = "";
    state.partialErrors = [];
  }

  async function loadBase() {
    state.loading = true;
    state.error = null;
    clearDetail();
    renderCurrent();
    try {
      state.health = await request(READ_PATHS.health);
      const data = state.health && state.health.data;
      const configured = data && data.status === "configured";
      if (!configured) {
        state.dashboard = null;
        state.opportunities = null;
        return;
      }
      [state.dashboard, state.opportunities] = await Promise.all([
        request(READ_PATHS.dashboard),
        request(READ_PATHS.opportunities)
      ]);
    } catch (error) {
      state.error = error;
    } finally {
      state.loading = false;
      renderCurrent();
    }
  }

  async function loadDetail(id) {
    clearDetail();
    state.error = null;
    state.loading = true;
    state.selectedId = String(id || "");
    renderCurrent();

    if (!SAFE_ID.test(state.selectedId)) {
      state.error = Object.assign(new Error("The saved opportunity identifier is invalid."), {
        code: "INVALID_OPPORTUNITY_ID"
      });
      state.loading = false;
      renderCurrent();
      return;
    }

    const encoded = encodeURIComponent(state.selectedId);
    const requests = [
      ["detail", `/api/v1/opportunities/${encoded}`],
      ["evidence", `/api/v1/evidence/${encoded}`],
      ["psa", `/api/v1/psa-advisor/${encoded}`]
    ];
    const results = await Promise.allSettled(requests.map(([, path]) => request(path)));
    results.forEach((result, index) => {
      const key = requests[index][0];
      if (result.status === "fulfilled") state[key] = result.value;
      else state.partialErrors.push({ key, error: result.reason });
    });
    if (!state.detail) {
      state.error = state.partialErrors.find(item => item.key === "detail")?.error
        || new Error("Opportunity detail is unavailable.");
    }
    state.loading = false;
    renderCurrent();
  }

  function badge(label, tone) {
    return `<span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function errorPanel(error) {
    if (!error) return "";
    const guidance = error.status === 401
      ? "A configured authentication provider and signed-in preview user are required."
      : error.status === 403
        ? "The signed-in preview user does not have an active tenant membership."
        : "No mock data has been substituted for this staging response.";
    const signIn = customerSurface() && error.status === 401
      ? `<div class="customer-intelligence-actions"><a class="button button-primary" href="/staging-auth.html?returnTo=%2Fsaas-prototype%2F%23%2Fopportunities">Sign in securely</a></div>`
      : "";
    return `<section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error.code || "STAGING_UNAVAILABLE")}</strong><p>${escapeHtml(error.message)}</p><small>${escapeHtml(guidance)}</small>${signIn}</div></section>`;
  }

  function healthPanel() {
    const data = state.health && state.health.data;
    if (!data) return "";
    const configured = data.status === "configured";
    const values = [
      ["Bridge enabled", data.bridgeEnabled === true ? "Yes" : "No"],
      ["Upstream configured", data.upstreamConfigured === true ? "Yes" : "No"],
      ["Authentication required", data.authenticationRequired === false ? "No" : "Yes"],
      ["Tenant membership required", data.tenantMembershipRequired === false ? "No" : "Yes"]
    ];
    return `<section class="panel staging-health"><header class="panel-header"><div><h2>Gateway health</h2><p>Public, non-sensitive configuration state from the same-origin gateway.</p></div>${badge(configured ? "Configured" : "Disabled", configured ? "ok" : "warn")}</header><div class="panel-body staging-key-grid">${values.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</div></section>`;
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

  function opportunityTable() {
    const items = state.opportunities?.data?.items;
    if (!Array.isArray(items) || !items.length) {
      return `<div class="staging-empty">No tenant-owned saved opportunities were returned.</div>`;
    }
    const rows = items.map(item => {
      const id = String(item.id ?? "");
      const clickable = SAFE_ID.test(id);
      const label = item.title || item.cardIdentity || id;
      return `<tr ${clickable ? `data-staging-opportunity="${escapeHtml(id)}" tabindex="0"` : ""}><td><strong>${escapeHtml(label)}</strong><small>${escapeHtml(item.cardIdentity || id)}</small></td><td>${badge(item.recommendation || "UNKNOWN", String(item.recommendation || "unknown").toLowerCase())}</td><td>${money(item.ask)}</td><td>${money(item.supportedValue)}</td><td>${escapeHtml(safeNumber(item.confidence))}/100</td><td>${escapeHtml(safeNumber(item.evidence?.acceptedSales))}</td><td>${escapeHtml(item.mappingState || "UNKNOWN")}</td></tr>`;
    }).join("");
    return `<div class="table-wrap"><table><thead><tr><th>Saved card</th><th>Decision</th><th>Ask</th><th>Supported</th><th>Confidence</th><th>Evidence</th><th>Mapping</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function baseView() {
    if (customerSurface()) return customerBaseView();
    const configured = state.health?.data?.status === "configured";
    return `<div class="page staging-page"><header class="page-heading"><div><span class="eyebrow">Controlled deploy-preview integration</span><h1>Staging Data</h1><p>Authenticated, tenant-scoped saved intelligence from the authoritative FlipForge API. This route never falls back to mock records.</p></div><div class="page-actions"><button class="button button-secondary" type="button" data-staging-refresh>Refresh connection</button></div></header><div class="boundary-note"><strong>Staging boundary:</strong> Read-only browser integration. Smart Opportunity and existing PSA intelligence remain authoritative. No provider call, evidence acceptance, billing, purchase, or production activation is performed here.</div>${state.loading ? `<div class="staging-loading" role="status">Loading staging connection…</div>` : ""}${errorPanel(state.error)}${healthPanel()}${configured && !state.error ? `${metricCards()}${state.opportunities ? `<section class="panel"><header class="panel-header"><div><h2>Tenant-owned opportunities</h2><p>Saved recommendations displayed exactly as returned by the authoritative API.</p></div></header><div class="panel-body">${opportunityTable()}</div></section>` : ""}` : ""}${!configured && state.health ? `<section class="panel"><div class="panel-body staging-empty"><strong>Staging gateway is not active.</strong><p>No customer data request was attempted, and the prototype cockpit remains mock-backed.</p></div></section>` : ""}</div>`;
  }

  function customerBaseView() {
    const configured = state.health?.data?.status === "configured";
    const meta = state.opportunities?.meta || state.dashboard?.meta || {};
    const limitations = safeArray(meta.limitations);
    return `<div class="page staging-page customer-intelligence-page"><header class="page-heading"><div><span class="eyebrow">Saved customer intelligence</span><h1>Tracked Opportunities</h1><p>Every card here is a tenant-owned record saved in SQLite and governed by FlipForge's existing decision authority.</p></div><div class="page-actions"><button class="button button-secondary" type="button" data-staging-refresh>Refresh</button><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div></header><div class="boundary-note"><strong>Customer boundary:</strong> This workspace reads saved Smart Opportunity, evidence, and PSA output. It never substitutes mock records, recalculates a decision, or authorizes a transaction.</div>${state.loading ? `<div class="staging-loading" role="status">Loading your saved intelligence…</div>` : ""}${errorPanel(state.error)}${configured && !state.error ? `${metricCards()}<section class="panel customer-intelligence-list"><header class="panel-header"><div><h2>Your tracked decision records</h2><p>Evaluations are tracked automatically after the authoritative service saves them and grants tenant ownership.</p></div><span class="staging-status staging-status-ok">SQLite saved</span></header><div class="panel-body">${opportunityTable()}</div></section><section class="panel customer-contract-panel"><div class="panel-body"><div><span>Engine</span><strong>${escapeHtml(meta.engineVersion || "Authoritative service")}</strong></div><div><span>Evidence freshness</span><strong>${escapeHtml(meta.evidenceFreshness || "Unavailable")}</strong></div><div><span>Customer controls</span><strong>Read, evaluate, understand, track</strong></div><div><span>Execution authority</span><strong>None</strong></div></div>${limitations.length ? `<details><summary>Known limitations</summary><ul>${limitations.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}</section>` : ""}${!configured && state.health ? `<section class="panel"><div class="panel-body staging-empty"><strong>Customer intelligence is safely offline.</strong><p>The preview gateway is disabled, so no tenant data request was attempted and no mock data was substituted.</p></div></section>` : ""}</div>`;
  }

  function detailView() {
    if (customerSurface()) return customerDetailView();
    const item = state.detail?.data?.opportunity;
    if (!item) {
      return `<div class="page staging-page"><header class="page-heading"><div><span class="eyebrow">Tenant-scoped saved record</span><h1>Staging Opportunity</h1><p>Loading an authoritative saved record without a mock fallback.</p></div><div class="page-actions"><a class="button button-secondary" href="#/staging">Back to staging list</a></div></header>${state.loading ? `<div class="staging-loading" role="status">Loading saved detail…</div>` : ""}${errorPanel(state.error)}</div>`;
    }
    const evidence = state.evidence?.data;
    const psa = state.psa?.data;
    const metrics = [
      ["Decision", item.recommendation || "UNKNOWN"],
      ["Current ask", money(item.ask)],
      ["Supported value", money(item.supportedValue)],
      ["Confidence", `${safeNumber(item.confidence)}/100`]
    ];
    const factorValues = [
      ["Liquidity", `${safeNumber(item.liquidity)}/100`],
      ["Risk", `${safeNumber(item.risk)}/100`],
      ["Rank", `${safeNumber(item.rank)}/100`],
      ["Evidence count", safeNumber(item.evidenceCount)],
      ["Mapping", item.mappingState || "UNKNOWN"],
      ["Context", item.contextStatus || "UNKNOWN"]
    ];
    const evidenceValues = [
      ["Accepted exact sales", safeNumber(evidence?.acceptedExactCompletedSales ?? item.evidence?.acceptedSales)],
      ["Visible but ineligible", safeNumber(evidence?.visibleButAuthorityIneligible)],
      ["Average accepted price", money(item.evidence?.averagePrice)],
      ["Latest sale date", item.evidence?.latestSaleDate || "Unavailable"]
    ];
    const psaValues = [
      ["Guidance status", psa?.guidanceStatus || "Unavailable"],
      ["Population available", psa?.populationContext?.available === true ? "Yes" : "No"],
      ["PSA 10 population", safeNumber(psa?.populationContext?.psa10Population)],
      ["PSA 9 population", safeNumber(psa?.populationContext?.psa9Population)]
    ];
    const grid = values => `<div class="panel-body staging-key-grid">${values.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;
    return `<div class="page staging-page"><header class="page-heading"><div><span class="eyebrow">Tenant-scoped saved record</span><h1>${escapeHtml(item.title || item.cardIdentity || item.id)}</h1><p>${escapeHtml(item.cardIdentity || "Saved Smart Opportunity record")}</p></div><div class="page-actions"><a class="button button-secondary" href="#/staging">Back to staging list</a><button class="button button-secondary" type="button" data-staging-refresh>Refresh</button></div></header><div class="boundary-note"><strong>Authority boundary:</strong> Values, decision, evidence state, and PSA context are displayed exactly as saved. This screen cannot rescore, rerank, accept evidence, or predict a grade.</div>${errorPanel(state.error)}<section class="staging-metrics">${metrics.map(([label, value]) => `<article class="panel"><div class="panel-body"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div></article>`).join("")}</section><div class="staging-detail-grid"><section class="panel"><header class="panel-header"><div><h2>Saved decision factors</h2><p>No browser-side calculation.</p></div></header>${grid(factorValues)}</section><section class="panel"><header class="panel-header"><div><h2>Evidence authority</h2><p>Completed-sale eligibility remains server governed.</p></div></header>${grid(evidenceValues)}</section><section class="panel"><header class="panel-header"><div><h2>Saved PSA guidance</h2><p>Existing PSA intelligence only.</p></div></header>${grid(psaValues)}</section></div>${state.partialErrors.length ? `<section class="panel staging-warning"><div class="panel-body"><strong>Some saved context is unavailable.</strong><ul>${state.partialErrors.filter(entry => entry.key !== "detail").map(entry => `<li>${escapeHtml(entry.key.toUpperCase())}: ${escapeHtml(entry.error?.code || entry.error?.message || "Unavailable")}</li>`).join("")}</ul><small>No replacement or fabricated data was shown.</small></div></section>` : ""}</div>`;
  }

  function tracebackStep(label, title, detail, tone = "ok") {
    const mark = tone === "ok" ? "✓" : tone === "warn" ? "!" : "•";
    return `<article class="customer-trace-step"><span class="check-mark ${escapeHtml(tone)}">${mark}</span><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div></article>`;
  }

  function linkedEvidenceTable(evidence) {
    const items = safeArray(evidence?.linkedEvidence);
    if (!items.length) return `<div class="staging-empty"><strong>No linked evidence rows are available.</strong><p>The browser has not invented replacement comps.</p></div>`;
    const rows = items.map(item => `<tr><td><strong>${escapeHtml(item.sourceName || "Saved source")}</strong><small>${escapeHtml(item.type || "Unknown type")}</small></td><td>${money(item.amount)}</td><td>${escapeHtml(item.soldAt || item.recordedAt || "Unavailable")}</td><td>${item.identityMatch === true ? badge("Exact match", "ok") : badge("Mismatch", "warn")}</td><td>${item.authorityEligible === true ? badge("Eligible", "buy") : badge("Ineligible", "pass")}</td></tr>`).join("");
    return `<div class="table-wrap"><table><thead><tr><th>Evidence source</th><th>Amount</th><th>Sale date</th><th>Identity</th><th>Authority</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function customerDetailView() {
    const item = state.detail?.data?.opportunity;
    if (!item) {
      return `<div class="page staging-page customer-intelligence-page"><header class="page-heading"><div><span class="eyebrow">Saved decision workspace</span><h1>Card Intelligence</h1><p>Loading the tenant-owned record, evidence chain, and saved PSA guidance.</p></div><div class="page-actions"><a class="button button-secondary" href="#/opportunities">Back to tracked cards</a></div></header>${state.loading ? `<div class="staging-loading" role="status">Loading card intelligence…</div>` : ""}${errorPanel(state.error)}</div>`;
    }

    const evidence = state.evidence?.data || {};
    const psa = state.psa?.data || {};
    const snapshot = psa.savedPsaSnapshot || {};
    const meta = state.detail?.meta || {};
    const acceptedSales = safeNumber(evidence.acceptedExactCompletedSales ?? item.evidence?.acceptedSales);
    const ineligible = safeNumber(evidence.visibleButAuthorityIneligible);
    const ask = safeNumber(item.ask);
    const supported = safeNumber(item.supportedValue);
    const gap = supported - ask;
    const gapPercent = ask > 0 ? (gap / ask) * 100 : 0;
    const mappingConfirmed = String(item.mappingState || "").toUpperCase() === "CONFIRMED";
    const evidenceReady = acceptedSales > 0;
    const psaAvailable = psa.guidanceStatus === "SAVED_GUIDANCE_AVAILABLE";
    const title = item.title || item.cardIdentity || item.id;

    return `<div class="page staging-page customer-intelligence-page"><header class="page-heading"><div><span class="eyebrow">Saved decision workspace</span><h1>Card Intelligence</h1><p>See the decision, the exact evidence behind it, what remains unresolved, and the saved grading context before you act.</p></div><div class="page-actions"><a class="button button-secondary" href="#/opportunities">Tracked cards</a><button class="button button-secondary" type="button" data-staging-refresh>Refresh</button><a class="button button-primary" href="#/evaluate">Evaluate another</a></div></header><section class="panel customer-intelligence-hero"><div class="panel-body"><div class="customer-hero-copy"><span class="eyebrow">${escapeHtml(item.platform || "Saved marketplace record")}</span><div class="customer-hero-title">${badge(item.recommendation || "UNKNOWN", String(item.recommendation || "unknown").toLowerCase())}<h2>${escapeHtml(title)}</h2></div><p>${escapeHtml(item.cardIdentity || "Saved exact-card identity")}</p><div class="customer-tracked-state"><span class="check-mark ok">✓</span><span><strong>Tracked in SQLite</strong><small>Tenant-owned saved record · ${escapeHtml(item.observedAt || "Observation time unavailable")}</small></span></div></div><div class="customer-value-summary"><span>Current ask</span><strong>${money(ask)}</strong><span>Supported value</span><strong class="value-positive">${money(supported)}</strong><small>${gap >= 0 ? "+" : ""}${money(gap)} · ${gapPercent.toFixed(1)}% saved value gap</small></div></div></section><div class="customer-intelligence-metrics"><article><span>Confidence</span><strong>${safeNumber(item.confidence)}/100</strong></article><article><span>Liquidity</span><strong>${safeNumber(item.liquidity)}/100</strong></article><article><span>Risk</span><strong>${safeNumber(item.risk)}/100</strong></article><article><span>Rank</span><strong>${safeNumber(item.rank)}/100</strong></article></div><div class="customer-intelligence-grid"><div class="stack"><section class="panel"><header class="panel-header"><div><h2>Decision Traceback</h2><p>A readable path through the saved authority inputs. No browser-side scoring.</p></div><span class="staging-status staging-status-${escapeHtml(String(item.recommendation || "unknown").toLowerCase())}">${escapeHtml(item.recommendation || "UNKNOWN")}</span></header><div class="panel-body customer-traceback">${tracebackStep("1 · Identity", mappingConfirmed ? "Exact identity confirmed" : "Identity needs verification", item.statusMessage || `Mapping state: ${item.mappingState || "UNKNOWN"}.`, mappingConfirmed ? "ok" : "warn")}${tracebackStep("2 · Evidence", evidenceReady ? `${acceptedSales} accepted exact completed sale${acceptedSales === 1 ? "" : "s"}` : "No accepted exact completed sales", `${ineligible} visible record${ineligible === 1 ? " is" : "s are"} authority-ineligible. Active asks never become sold evidence.`, evidenceReady ? "ok" : "warn")}${tracebackStep("3 · Market factors", `Liquidity ${safeNumber(item.liquidity)} · Risk ${safeNumber(item.risk)} · Rank ${safeNumber(item.rank)}`, item.changeSummary || "Saved factors are displayed exactly as returned by Smart Opportunity.", "neutral")}${tracebackStep("4 · Authority output", item.recommendation || "UNKNOWN", `Workflow: ${item.workflowStatus || "UNKNOWN"}. ${item.authorityBoundary || "Smart Opportunity remains authoritative."}`, "neutral")}</div></section><section class="panel"><header class="panel-header"><div><h2>Evidence Chain</h2><p>Linked completed-sale evidence and exclusions from the saved ledger.</p></div><span class="staging-status ${evidenceReady ? "staging-status-ok" : "staging-status-warn"}">${acceptedSales} accepted</span></header><div class="panel-body">${linkedEvidenceTable(evidence)}</div></section></div><div class="stack"><section class="panel"><header class="panel-header"><div><h2>Evidence readiness</h2><p>What can and cannot support this saved decision.</p></div></header><div class="panel-body staging-key-grid"><div><span>Accepted exact sales</span><strong>${acceptedSales}</strong></div><div><span>Visible but ineligible</span><strong>${ineligible}</strong></div><div><span>Average accepted price</span><strong>${money(item.evidence?.averagePrice)}</strong></div><div><span>Latest accepted sale</span><strong>${escapeHtml(item.evidence?.latestSaleDate || "Unavailable")}</strong></div><div><span>Mapping</span><strong>${escapeHtml(item.mappingState || "UNKNOWN")}</strong></div><div><span>Evidence freshness</span><strong>${escapeHtml(meta.evidenceFreshness || "Unavailable")}</strong></div></div></section><section class="panel"><header class="panel-header"><div><h2>Saved PSA guidance</h2><p>Existing PSA intelligence only; no grade is predicted here.</p></div>${badge(psaAvailable ? "Available" : "Insufficient context", psaAvailable ? "ok" : "warn")}</header><div class="panel-body staging-key-grid"><div><span>Guidance status</span><strong>${escapeHtml(psa.guidanceStatus || "Unavailable")}</strong></div><div><span>Readiness</span><strong>${escapeHtml(snapshot.readinessStatus || "Unavailable")}</strong></div><div><span>PSA 10 population</span><strong>${escapeHtml(safeNumber(psa.populationContext?.psa10Population))}</strong></div><div><span>PSA 9 population</span><strong>${escapeHtml(safeNumber(psa.populationContext?.psa9Population))}</strong></div><div><span>Manual verification</span><strong>${snapshot.manualVerificationRequired === true ? "Required" : "Not returned"}</strong></div><div><span>Recalculated</span><strong>${psa.recalculated === true ? "Yes" : "No"}</strong></div></div>${psa.authorityConflict ? `<div class="boundary-note"><strong>Authority conflict:</strong> ${escapeHtml(psa.authorityConflict)}</div>` : ""}</section><section class="panel customer-decision-boundary"><div class="panel-body"><span class="eyebrow">Before you buy. Know why.</span><h2>${escapeHtml(item.recommendation || "UNKNOWN")} is decision support</h2><p>${escapeHtml(item.statusMessage || item.authorityBoundary || "Review the saved evidence and unresolved limits before acting outside FlipForge.")}</p><small>No bid, checkout, payment, evidence acceptance, or grade prediction is authorized.</small></div></section></div></div>${state.partialErrors.length ? `<section class="panel staging-warning"><div class="panel-body"><strong>Some saved context is unavailable.</strong><ul>${state.partialErrors.filter(entry => entry.key !== "detail").map(entry => `<li>${escapeHtml(entry.key.toUpperCase())}: ${escapeHtml(entry.error?.code || entry.error?.message || "Unavailable")}</li>`).join("")}</ul><small>No replacement or fabricated data was shown.</small></div></section>` : ""}</div>`;
  }

  function bindActions() {
    if (!currentMain) return;
    currentMain.querySelectorAll("[data-staging-refresh]").forEach(button => button.addEventListener("click", () => currentId ? loadDetail(currentId) : loadBase()));
    currentMain.querySelectorAll("[data-staging-opportunity]").forEach(row => {
      const open = () => { window.location.hash = detailRoute(row.dataset.stagingOpportunity); };
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
    currentSurface = "staging";
    currentMain = main;
    try {
      currentId = decodeURIComponent(String(id || ""));
    } catch (_) {
      currentId = String(id || "");
    }
    if (!eligibleHost()) {
      main.innerHTML = `<div class="page"><header class="page-heading"><div><span class="eyebrow">Unavailable route</span><h1>Staging Data</h1><p>This diagnostic route is restricted to deploy previews and local development.</p></div></header><div class="boundary-note">The production website remains mock-backed and the API gateway remains disabled unless separately activated.</div></div>`;
      return;
    }
    if (currentId) loadDetail(currentId);
    else loadBase();
  }

  function renderCustomer(main, id = "") {
    currentSurface = "customer";
    currentMain = main;
    try {
      currentId = decodeURIComponent(String(id || ""));
    } catch (_) {
      currentId = String(id || "");
    }
    if (!eligibleHost()) return false;
    if (currentId) loadDetail(currentId);
    else loadBase();
    return true;
  }

  const navLink = document.querySelector("[data-route='staging']");
  if (navLink && eligibleHost()) navLink.hidden = false;

  window.FlipForgeStagingReadAdapter = Object.freeze({
    isEligible: eligibleHost,
    render,
    renderCustomer,
    refresh: () => currentId ? loadDetail(currentId) : loadBase()
  });
})();
