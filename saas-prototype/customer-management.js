(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const ROUTES = new Set(["psa-advisor", "evidence", "sell", "portfolio", "alerts"]);
  const FIXED_PATHS = new Set([
    "/api/v1/health",
    "/api/v1/opportunities",
    "/api/v1/portfolio",
    "/api/v1/alerts"
  ]);

  const state = {
    main: null,
    route: "",
    requestedId: "",
    selectedId: "",
    loading: false,
    health: null,
    opportunities: null,
    detail: null,
    evidence: null,
    psa: null,
    feature: null,
    error: null,
    partialErrors: []
  };

  function eligibleHost() {
    return PREVIEW_HOST.test(String(window.location.hostname || ""));
  }

  function handles(route) {
    return ROUTES.has(String(route || ""));
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

  function safeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function numberOrUnavailable(value) {
    if (value === null || value === undefined || value === "") return "Unavailable";
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : "Unavailable";
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
    return `customer-management-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function allowedPath(path) {
    const value = String(path || "");
    if (FIXED_PATHS.has(value)) return value;
    const match = value.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor)\/([^/?#]+)$/);
    if (!match) throw new Error("The requested customer API path is not allowlisted.");
    let decoded;
    try {
      decoded = decodeURIComponent(match[2]);
    } catch (_) {
      throw new Error("The requested saved identifier is invalid.");
    }
    if (!SAFE_ID.test(decoded)) throw new Error("The requested saved identifier is invalid.");
    return value;
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

  function validHealth(payload, expectedCorrelationId) {
    return Boolean(payload?.meta && payload?.data)
      && payload.meta.contractVersion === CONTRACT_VERSION
      && payload.meta.correlationId === expectedCorrelationId;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      throw Object.assign(new Error("The customer response exceeded the browser safety limit."), {
        code: "CUSTOMER_RESPONSE_TOO_LARGE"
      });
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw Object.assign(new Error("The customer gateway returned invalid JSON."), {
        code: "CUSTOMER_INVALID_JSON"
      });
    }
  }

  async function request(path) {
    const safePath = allowedPath(path);
    const requestCorrelationId = correlationId();
    const response = await fetch(safePath, {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Customer request failed with status ${response.status}.`), {
        code: upstream.code || "CUSTOMER_REQUEST_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    const valid = safePath === "/api/v1/health"
      ? validHealth(payload, requestCorrelationId)
      : validEnvelope(payload, requestCorrelationId);
    if (!valid) {
      throw Object.assign(new Error("The customer response failed the FlipForge authority contract."), {
        code: "CUSTOMER_CONTRACT_INVALID"
      });
    }
    return payload;
  }

  function badge(label, tone = "neutral") {
    return `<span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function pageHeading(eyebrow, title, description, actions = "") {
    return `<header class="page-heading"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</header>`;
  }

  function boundary(text) {
    return `<div class="boundary-note"><strong>Authority boundary:</strong> ${escapeHtml(text)}</div>`;
  }

  function errorPanel(error) {
    if (!error) return "";
    const signIn = error.status === 401
      ? `<div class="customer-management-actions"><a class="button button-primary" href="/staging-auth.html?returnTo=%2Fsaas-prototype%2F%23%2F${encodeURIComponent(state.route)}">Sign in securely</a></div>`
      : "";
    return `<section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error.code || "CUSTOMER_UNAVAILABLE")}</strong><p>${escapeHtml(error.message)}</p><small>No sample or browser-invented replacement was shown.</small>${signIn}</div></section>`;
  }

  function loadingPanel(message) {
    return `<div class="staging-loading customer-management-loading" role="status">${escapeHtml(message)}</div>`;
  }

  function offlinePanel() {
    return `<section class="panel"><div class="panel-body staging-empty"><strong>This private-beta workspace is safely offline.</strong><p>The preview bridge is disabled, so no tenant request was attempted and no sample data was substituted.</p></div></section>`;
  }

  function opportunityItems() {
    return safeArray(state.opportunities?.data?.items).filter(item => SAFE_ID.test(String(item?.id || "")));
  }

  function selectedOpportunity() {
    return opportunityItems().find(item => String(item.id) === state.selectedId) || null;
  }

  function selector(label = "Saved tracked card") {
    const items = opportunityItems();
    if (!items.length) return "";
    return `<label class="customer-management-selector"><span>${escapeHtml(label)}</span><select data-customer-management-select>${items.map(item => {
      const id = String(item.id);
      const title = item.title || item.cardIdentity || id;
      return `<option value="${escapeHtml(id)}" ${id === state.selectedId ? "selected" : ""}>${escapeHtml(title)}</option>`;
    }).join("")}</select></label>`;
  }

  function emptyTrackedState() {
    return `<section class="panel"><div class="panel-body staging-empty"><strong>No tracked card is available.</strong><p>Evaluate one exact card to create a tenant-owned SQLite record before opening this workspace.</p><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div></section>`;
  }

  function workspaceActions(routes) {
    const links = state.selectedId
      ? routes.map(([route, label]) => `<a class="button button-secondary" href="#/${route}/${encodeURIComponent(state.selectedId)}">${escapeHtml(label)}</a>`).join("")
      : `<a class="button button-secondary" href="#/opportunities">Tracked cards</a>`;
    return `${links}<button class="button button-secondary" type="button" data-customer-management-refresh>Refresh</button>`;
  }

  function evidenceRows(data) {
    const items = safeArray(data?.linkedEvidence);
    if (!items.length) return `<div class="staging-empty"><strong>No linked evidence rows are available.</strong><p>No replacement comp was invented.</p></div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Source</th><th>Amount</th><th>Sale date</th><th>Identity</th><th>Authority</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(item.sourceName || "Saved source")}</strong><small>${escapeHtml(item.type || "Unknown type")}</small></td><td>${money(item.amount)}</td><td>${escapeHtml(item.soldAt || item.recordedAt || "Unavailable")}</td><td>${item.identityMatch === true ? badge("Exact match", "ok") : badge("Mismatch", "warn")}</td><td>${item.authorityEligible === true ? badge("Eligible", "buy") : badge("Ineligible", "pass")}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function evidenceTimeline(data) {
    const items = safeArray(data?.timeline);
    if (!items.length) return `<div class="staging-empty">No evidence-ledger timeline events were returned.</div>`;
    return `<div class="customer-management-timeline">${items.map(item => `<article><span class="customer-management-timeline-mark" aria-hidden="true"></span><div><span>${escapeHtml(item.recordedAt || "Time unavailable")}</span><strong>${escapeHtml(item.eventType || "Evidence event")}</strong><p>${escapeHtml(item.reason || `${item.previousState || "Unknown"} → ${item.currentState || "Unknown"}`)}</p></div></article>`).join("")}</div>`;
  }

  function manualCandidates(data) {
    const items = safeArray(data?.manualCandidates);
    if (!items.length) return `<div class="staging-empty">No manual evidence candidates were returned.</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Candidate</th><th>Price</th><th>Sale date</th><th>Match confidence</th><th>State</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(item.saleTitle || item.cardIdentity || "Saved candidate")}</strong><small>${escapeHtml(item.sourceMarketplace || "Source unavailable")}</small></td><td>${money(item.salePrice)}</td><td>${escapeHtml(item.saleDate || "Unavailable")}</td><td>${escapeHtml(safeNumber(item.matchConfidence))}/100</td><td>${item.linkedToOpportunity === true ? badge("Linked", "ok") : badge("Candidate only", "warn")}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function evidenceView() {
    const data = state.evidence?.data;
    const item = selectedOpportunity();
    const actions = workspaceActions([["opportunities", "Card Intelligence"], ["psa-advisor", "PSA guidance"]]);
    return `<div class="page customer-management-page">${pageHeading("Saved evidence workspace", "Evidence Center", "Inspect completed-sale eligibility, exclusions, candidates, and ledger history for one tenant-owned decision.", actions)}${boundary("The evidence ledger remains server-governed. This customer screen cannot accept, reject, hold, relink, or convert active asks into completed-sale evidence.")}<section class="panel customer-management-select-panel"><div class="panel-body">${selector()}</div></section>${data && item ? `<section class="customer-management-metrics"><article><span>Accepted exact sales</span><strong>${safeNumber(data.acceptedExactCompletedSales)}</strong></article><article><span>Visible but ineligible</span><strong>${safeNumber(data.visibleButAuthorityIneligible)}</strong></article><article><span>Ledger events</span><strong>${safeArray(data.timeline).length}</strong></article><article><span>Manual candidates</span><strong>${safeArray(data.manualCandidates).length}</strong></article></section><div class="customer-management-grid"><div class="stack"><section class="panel"><header class="panel-header"><div><h2>Linked evidence</h2><p>Saved rows remain eligible only when accepted, completed, and exact-identity matched.</p></div></header><div class="panel-body">${evidenceRows(data)}</div></section><section class="panel"><header class="panel-header"><div><h2>Manual evidence candidates</h2><p>Unlinked candidates remain visible but cannot support value authority.</p></div></header><div class="panel-body">${manualCandidates(data)}</div></section></div><section class="panel"><header class="panel-header"><div><h2>Evidence history</h2><p>Read-only events from the saved evidence ledger.</p></div></header><div class="panel-body">${evidenceTimeline(data)}</div></section></div>` : emptyTrackedState()}${state.partialErrors.length ? errorPanel(state.partialErrors[0]) : ""}</div>`;
  }

  function flagRow(label, value, warning = false) {
    return `<div class="customer-management-flag" data-tone="${warning ? "attention" : "neutral"}"><span>${escapeHtml(label)}</span><strong>${value === true ? "Required" : value === false ? "Not returned" : escapeHtml(value || "Unavailable")}</strong></div>`;
  }

  function psaView() {
    const data = state.psa?.data;
    const snapshot = data?.savedPsaSnapshot || {};
    const population = data?.populationContext || {};
    const actions = workspaceActions([["opportunities", "Card Intelligence"], ["evidence", "Evidence"]]);
    return `<div class="page customer-management-page">${pageHeading("Saved grading context", "PSA Advisor", "Review the existing saved PSA decision snapshot and population context without predicting a grade.", actions)}${boundary("Existing PSA intelligence remains the sole grading-guidance authority. This route reads a saved snapshot and never runs or persists a new analysis.")}<section class="panel customer-management-select-panel"><div class="panel-body">${selector()}</div></section>${data ? `<section class="customer-management-metrics"><article><span>Guidance</span><strong>${escapeHtml(data.guidanceStatus || "Unavailable")}</strong></article><article><span>Smart Opportunity</span><strong>${escapeHtml(data.authoritativeOpportunityRecommendation || "Unavailable")}</strong></article><article><span>Readiness</span><strong>${escapeHtml(snapshot.readinessStatus || "Unavailable")}</strong></article><article><span>Recalculated</span><strong>${data.recalculated === true ? "Yes" : "No"}</strong></article></section>${data.authorityConflict ? `<section class="panel staging-warning"><div class="panel-body"><strong>Authority conflict</strong><p>${escapeHtml(data.authorityConflict)}</p></div></section>` : ""}<div class="customer-management-grid"><section class="panel"><header class="panel-header"><div><h2>Saved PSA snapshot</h2><p>Captured context, not a new raw-card grade prediction.</p></div>${badge(data.guidanceStatus === "SAVED_GUIDANCE_AVAILABLE" ? "Available" : "Insufficient context", data.guidanceStatus === "SAVED_GUIDANCE_AVAILABLE" ? "ok" : "warn")}</header><div class="panel-body customer-management-key-grid"><div><span>Captured</span><strong>${escapeHtml(snapshot.capturedAt || "Unavailable")}</strong></div><div><span>Review priority</span><strong>${escapeHtml(numberOrUnavailable(snapshot.reviewPriority))}</strong></div><div><span>Recommendation ceiling</span><strong>${escapeHtml(snapshot.recommendationCeiling || "Unavailable")}</strong></div><div><span>Latest PSA score</span><strong>${escapeHtml(numberOrUnavailable(snapshot.latestPsaScore))}</strong></div><div><span>Latest PSA impact</span><strong>${escapeHtml(snapshot.latestPsaImpact || "Unavailable")}</strong></div><div><span>Source version</span><strong>${escapeHtml(snapshot.sourceVersion || "Unavailable")}</strong></div></div>${snapshot.boundaryMessage ? `<div class="boundary-note">${escapeHtml(snapshot.boundaryMessage)}</div>` : ""}</section><div class="stack"><section class="panel"><header class="panel-header"><div><h2>Population context</h2><p>Display context only; population cannot predict grade or value.</p></div></header><div class="panel-body customer-management-key-grid"><div><span>Available</span><strong>${population.available === true ? "Yes" : "No"}</strong></div><div><span>PSA 10 population</span><strong>${escapeHtml(numberOrUnavailable(population.psa10Population))}</strong></div><div><span>PSA 9 population</span><strong>${escapeHtml(numberOrUnavailable(population.psa9Population))}</strong></div><div><span>Total population</span><strong>${escapeHtml(numberOrUnavailable(population.totalPopulation))}</strong></div><div><span>Freshness</span><strong>${escapeHtml(population.freshness || "Unavailable")}</strong></div><div><span>Display only</span><strong>${population.displayOnly === false ? "No" : "Yes"}</strong></div></div></section><section class="panel"><header class="panel-header"><div><h2>Review requirements</h2><p>Flags returned by the saved PSA authority.</p></div></header><div class="panel-body customer-management-flags">${flagRow("Manual verification", snapshot.manualVerificationRequired, snapshot.manualVerificationRequired === true)}${flagRow("Evidence refresh", snapshot.evidenceRefreshRequired, snapshot.evidenceRefreshRequired === true)}${flagRow("Fresh comp evidence", snapshot.freshCompEvidenceRequired, snapshot.freshCompEvidenceRequired === true)}${flagRow("Additional snapshot", snapshot.additionalSnapshotRequired, snapshot.additionalSnapshotRequired === true)}</div></section></div></div>` : emptyTrackedState()}${state.partialErrors.length ? errorPanel(state.partialErrors[0]) : ""}</div>`;
  }

  function sellView() {
    const item = state.detail?.data?.opportunity;
    const evidence = state.evidence?.data || {};
    const accepted = safeNumber(evidence.acceptedExactCompletedSales ?? item?.evidence?.acceptedSales);
    const mappingConfirmed = String(item?.mappingState || "").toUpperCase() === "CONFIRMED";
    const actions = workspaceActions([["opportunities", "Card Intelligence"], ["evidence", "Evidence"]]);
    return `<div class="page customer-management-page">${pageHeading("Exit planning", "Exit Review", "Review the saved decision, evidence, and market factors that matter before planning a sale outside FlipForge.", actions)}${boundary("This workspace does not create a sell recommendation, calculate guaranteed proceeds, list a card, contact a marketplace, accept an offer, or handle payment.")}<section class="panel customer-management-select-panel"><div class="panel-body">${selector()}</div></section>${item ? `<section class="panel customer-exit-hero"><div class="panel-body"><div><span class="eyebrow">Saved authority output</span><div class="customer-exit-title">${badge(item.recommendation || "UNKNOWN", String(item.recommendation || "unknown").toLowerCase())}<h2>${escapeHtml(item.title || item.cardIdentity || item.id)}</h2></div><p>${escapeHtml(item.cardIdentity || "Saved exact-card identity")}</p></div><div class="customer-exit-values"><span>Current ask</span><strong>${money(item.ask)}</strong><span>Supported value</span><strong>${money(item.supportedValue)}</strong></div></div></section><section class="customer-management-metrics"><article><span>Liquidity</span><strong>${safeNumber(item.liquidity)}/100</strong></article><article><span>Risk</span><strong>${safeNumber(item.risk)}/100</strong></article><article><span>Confidence</span><strong>${safeNumber(item.confidence)}/100</strong></article><article><span>Accepted exact sales</span><strong>${accepted}</strong></article></section><div class="customer-management-grid"><section class="panel"><header class="panel-header"><div><h2>Saved exit context</h2><p>Inputs are shown unchanged; the browser creates no timing or sale authority.</p></div></header><div class="panel-body customer-management-checklist"><div data-state="${mappingConfirmed ? "ready" : "attention"}"><span>${mappingConfirmed ? "✓" : "!"}</span><span><strong>Exact identity</strong><small>${escapeHtml(item.mappingState || "UNKNOWN")} mapping state returned by the service.</small></span></div><div data-state="${accepted > 0 ? "ready" : "attention"}"><span>${accepted > 0 ? "✓" : "!"}</span><span><strong>Completed-sale support</strong><small>${accepted} accepted exact completed sale${accepted === 1 ? "" : "s"}; active asks remain ineligible.</small></span></div><div data-state="neutral"><span>•</span><span><strong>Saved market factors</strong><small>Liquidity ${safeNumber(item.liquidity)}, risk ${safeNumber(item.risk)}, confidence ${safeNumber(item.confidence)}.</small></span></div></div></section><section class="panel"><header class="panel-header"><div><h2>Outside costs still required</h2><p>FlipForge does not invent transaction assumptions.</p></div></header><div class="panel-body customer-management-checklist"><div data-state="attention"><span>!</span><span><strong>Marketplace and payment fees</strong><small>Verify the actual platform terms before estimating proceeds.</small></span></div><div data-state="attention"><span>!</span><span><strong>Shipping, insurance, and taxes</strong><small>These are outside the saved Smart Opportunity value and vary by transaction.</small></span></div><div data-state="ready"><span>✓</span><span><strong>No transaction action</strong><small>No listing, offer, checkout, or payment control exists here.</small></span></div></div></section></div><section class="panel customer-exit-boundary"><div class="panel-body"><span class="eyebrow">Before you sell. Know the evidence.</span><h2>No sell recommendation was created.</h2><p>The saved ${escapeHtml(item.recommendation || "UNKNOWN")} decision remains unchanged. Use the returned evidence and unresolved costs to plan your next step outside FlipForge.</p></div></section>` : emptyTrackedState()}${state.partialErrors.length ? errorPanel(state.partialErrors[0]) : ""}</div>`;
  }

  function unavailableFeatureView(kind) {
    const data = state.feature?.data || {};
    const meta = state.feature?.meta || {};
    const title = kind === "portfolio" ? "Portfolio" : "Alerts";
    const description = kind === "portfolio"
      ? "Check whether an authoritative tenant-owned holdings source is connected."
      : "Check whether authenticated customer alert rules and delivery are connected.";
    const reason = kind === "portfolio"
      ? "No holdings, cost basis, performance, or gain is fabricated from tracked opportunities."
      : "No DEV alert, mock rule, fake unread count, or in-memory toggle is presented as a customer alert.";
    return `<div class="page customer-management-page">${pageHeading("Server-backed capability status", title, description, `<button class="button button-secondary" type="button" data-customer-management-refresh>Refresh status</button>`)}${boundary(`${reason} Smart Opportunity and PSA authority remain unchanged.`)}<section class="customer-management-status-hero" data-configured="${data.configured === true}"><span class="eyebrow">Authoritative service response</span><h2>${data.configured === true ? "Connected" : "Not connected"}</h2><p>${escapeHtml(data.status || "STATUS_UNAVAILABLE")}</p></section><div class="customer-management-grid"><section class="panel"><header class="panel-header"><div><h2>Current state</h2><p>Returned directly by the tenant-scoped API.</p></div>${badge(data.configured === true ? "Configured" : "Unavailable", data.configured === true ? "ok" : "warn")}</header><div class="panel-body customer-management-key-grid"><div><span>Configured</span><strong>${data.configured === true ? "Yes" : "No"}</strong></div><div><span>Returned items</span><strong>${safeArray(data.items).length}</strong></div><div><span>Read only</span><strong>${data.readOnly === false ? "No" : "Yes"}</strong></div><div><span>Evidence freshness</span><strong>${escapeHtml(meta.evidenceFreshness || "UNAVAILABLE")}</strong></div></div></section><section class="panel"><header class="panel-header"><div><h2>Why it is unavailable</h2><p>The product tells the truth instead of filling the page with sample records.</p></div></header><div class="panel-body"><ul class="customer-management-limitations">${safeArray(meta.limitations).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></section></div><section class="panel"><div class="panel-body staging-empty"><strong>${title} remains intentionally unavailable.</strong><p>${escapeHtml(reason)}</p><a class="button button-primary" href="#/opportunities">Return to tracked cards</a></div></section></div>`;
  }

  function pageMarkup() {
    if (state.loading) {
      return `<div class="page customer-management-page">${pageHeading("Private beta customer workspace", "Loading saved intelligence", "Reading only tenant-owned data from the approved same-origin gateway.")}${loadingPanel("Loading authoritative customer context…")}</div>`;
    }
    if (state.error) {
      return `<div class="page customer-management-page">${pageHeading("Private beta customer workspace", "Customer workspace unavailable", "The request failed closed without a mock fallback.")}${errorPanel(state.error)}</div>`;
    }
    if (state.health?.data?.status !== "configured") {
      const title = state.route === "psa-advisor"
        ? "PSA Advisor"
        : state.route === "evidence"
          ? "Evidence Center"
          : state.route === "sell"
            ? "Exit Review"
            : state.route === "portfolio"
              ? "Portfolio"
              : "Alerts";
      return `<div class="page customer-management-page">${pageHeading("Private beta customer workspace", title, "This route is prepared for a controlled tenant-scoped beta session.")}${offlinePanel()}</div>`;
    }
    if (state.route === "evidence") return evidenceView();
    if (state.route === "psa-advisor") return psaView();
    if (state.route === "sell") return sellView();
    return unavailableFeatureView(state.route);
  }

  function bindActions() {
    if (!state.main || typeof state.main.querySelector !== "function") return;
    state.main.querySelector("[data-customer-management-refresh]")?.addEventListener("click", load);
    const select = state.main.querySelector("[data-customer-management-select]");
    select?.addEventListener("change", () => {
      const id = String(select.value || "");
      if (!SAFE_ID.test(id)) return;
      window.location.hash = `#/${state.route}/${encodeURIComponent(id)}`;
    });
  }

  function renderCurrent() {
    if (!state.main) return;
    state.main.innerHTML = pageMarkup();
    bindActions();
  }

  function resetData() {
    state.health = null;
    state.opportunities = null;
    state.detail = null;
    state.evidence = null;
    state.psa = null;
    state.feature = null;
    state.error = null;
    state.partialErrors = [];
    state.selectedId = "";
  }

  function chooseId() {
    const ids = opportunityItems().map(item => String(item.id));
    if (state.requestedId) {
      if (!SAFE_ID.test(state.requestedId) || !ids.includes(state.requestedId)) {
        throw Object.assign(new Error("The requested tracked card was not returned for this tenant."), {
          code: "RESOURCE_NOT_FOUND",
          status: 404
        });
      }
      return state.requestedId;
    }
    return ids[0] || "";
  }

  async function loadSelectedWorkspace() {
    state.opportunities = await request("/api/v1/opportunities");
    if (state.opportunities?.data?.kind !== "opportunities" || !Array.isArray(state.opportunities?.data?.items)) {
      throw Object.assign(new Error("The tracked-card list failed the customer management contract."), {
        code: "CUSTOMER_LIST_INVALID"
      });
    }
    state.selectedId = chooseId();
    if (!state.selectedId) return;
    const encoded = encodeURIComponent(state.selectedId);
    if (state.route === "evidence") {
      state.evidence = await request(`/api/v1/evidence/${encoded}`);
      if (state.evidence?.data?.kind !== "evidence" || String(state.evidence?.data?.opportunityId || "") !== state.selectedId) {
        throw Object.assign(new Error("The Evidence response did not match the selected tracked card."), { code: "EVIDENCE_CONTRACT_INVALID" });
      }
      return;
    }
    if (state.route === "psa-advisor") {
      state.psa = await request(`/api/v1/psa-advisor/${encoded}`);
      if (state.psa?.data?.kind !== "psa-advisor" || String(state.psa?.data?.opportunityId || "") !== state.selectedId || state.psa?.data?.recalculated !== false) {
        throw Object.assign(new Error("The PSA response did not match the selected saved guidance contract."), { code: "PSA_CONTRACT_INVALID" });
      }
      return;
    }
    const results = await Promise.allSettled([
      request(`/api/v1/opportunities/${encoded}`),
      request(`/api/v1/evidence/${encoded}`)
    ]);
    if (results[0].status === "fulfilled") state.detail = results[0].value;
    else state.partialErrors.push(results[0].reason);
    if (results[1].status === "fulfilled") state.evidence = results[1].value;
    else state.partialErrors.push(results[1].reason);
    if (!state.detail || String(state.detail?.data?.opportunity?.id || "") !== state.selectedId) {
      throw state.partialErrors[0] || Object.assign(new Error("The saved exit-review record is unavailable."), { code: "EXIT_REVIEW_CONTRACT_INVALID" });
    }
  }

  async function load() {
    state.loading = true;
    resetData();
    renderCurrent();
    try {
      state.health = await request("/api/v1/health");
      if (state.health?.data?.status !== "configured") return;
      if (state.route === "portfolio" || state.route === "alerts") {
        state.feature = await request(`/api/v1/${state.route}`);
        if (state.feature?.data?.kind !== state.route || typeof state.feature?.data?.configured !== "boolean" || !Array.isArray(state.feature?.data?.items)) {
          throw Object.assign(new Error("The feature status response failed the customer contract."), { code: "FEATURE_STATUS_INVALID" });
        }
        return;
      }
      await loadSelectedWorkspace();
    } catch (error) {
      state.error = error;
    } finally {
      state.loading = false;
      renderCurrent();
    }
  }

  function render(main, route, id = "") {
    if (!eligibleHost() || !handles(route)) return false;
    state.main = main;
    state.route = String(route);
    try {
      state.requestedId = decodeURIComponent(String(id || ""));
    } catch (_) {
      state.requestedId = String(id || "");
    }
    load();
    return true;
  }

  window.FlipForgeCustomerManagement = Object.freeze({
    isEligible: eligibleHost,
    handles,
    render,
    refresh: load
  });
})();
