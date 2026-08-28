(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const ROUTES = new Set(["tracking", "portfolio", "alerts"]);
  const FIXED_PATHS = new Set([
    "/api/v1/health",
    "/api/v1/opportunities",
    "/api/v1/lifecycle",
    "/api/v1/portfolio",
    "/api/v1/alerts"
  ]);

  const state = {
    main: null,
    route: "",
    requestedId: "",
    selectedId: "",
    loading: false,
    saving: false,
    health: null,
    opportunities: null,
    lifecycle: null,
    detail: null,
    feature: null,
    error: null,
    notice: ""
  };

  function productionHost() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
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
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function moneyFromCents(value) {
    if (value === null || value === undefined || value === "") return "Not recorded";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    }).format(safeNumber(value) / 100);
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `customer-lifecycle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function allowedPath(path) {
    const value = String(path || "");
    if (FIXED_PATHS.has(value)) return value;
    const match = value.match(/^\/api\/v1\/lifecycle\/([^/?#]+)$/);
    if (!match) throw new Error("The requested lifecycle API path is not allowlisted.");
    let decoded;
    try {
      decoded = decodeURIComponent(match[1]);
    } catch (_) {
      throw new Error("The requested lifecycle identifier is invalid.");
    }
    if (!SAFE_ID.test(decoded)) throw new Error("The requested lifecycle identifier is invalid.");
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
      throw Object.assign(new Error("The lifecycle response exceeded the browser safety limit."), {
        code: "LIFECYCLE_RESPONSE_TOO_LARGE"
      });
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw Object.assign(new Error("The lifecycle gateway returned invalid JSON."), {
        code: "LIFECYCLE_INVALID_JSON"
      });
    }
  }

  async function request(path, options = {}) {
    const safePath = allowedPath(path);
    const method = String(options.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "PUT") throw new Error("The lifecycle browser allows GET and PUT only.");
    if (method === "PUT" && !/^\/api\/v1\/lifecycle\//.test(safePath)) {
      throw new Error("Lifecycle writes require one tenant-owned saved opportunity.");
    }
    const requestCorrelationId = correlationId();
    const response = await fetch(safePath, {
      method,
      headers: {
        Accept: "application/json",
        "X-Correlation-Id": requestCorrelationId,
        ...(method === "PUT" ? { "Content-Type": "application/json" } : {})
      },
      body: method === "PUT" ? JSON.stringify(options.body || {}) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Lifecycle request failed with status ${response.status}.`), {
        code: upstream.code || "LIFECYCLE_REQUEST_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    const valid = safePath === "/api/v1/health"
      ? validHealth(payload, requestCorrelationId)
      : validEnvelope(payload, requestCorrelationId);
    if (!valid) {
      throw Object.assign(new Error("The lifecycle response failed the FlipForge authority contract."), {
        code: "LIFECYCLE_CONTRACT_INVALID"
      });
    }
    return payload;
  }

  function pageHeading(eyebrow, title, description, actions = "") {
    return `<header class="page-heading"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</header>`;
  }

  function badge(label, tone = "neutral") {
    return `<span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function boundary(text) {
    return `<div class="boundary-note"><strong>Authority boundary:</strong> ${escapeHtml(text)}</div>`;
  }

  function errorPanel(error) {
    const signIn = error?.status === 401
      ? `<a class="button button-primary" href="${productionHost() ? `/production-auth.html?return=${encodeURIComponent(`/app/#/${state.route}`)}` : `/staging-auth.html?returnTo=${encodeURIComponent(`/saas-prototype/#/${state.route}`)}`}">Sign in securely</a>`
      : "";
    return `<section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error?.code || "LIFECYCLE_UNAVAILABLE")}</strong><p>${escapeHtml(error?.message || "The customer lifecycle workspace is unavailable.")}</p><small>No browser-only replacement was saved.</small>${signIn}</div></section>`;
  }

  function offlinePanel() {
    return `<section class="panel"><div class="panel-body staging-empty"><strong>This lifecycle workspace is safely offline.</strong><p>The customer gateway is disabled, so no tenant request or customer write was attempted.</p></div></section>`;
  }

  function opportunityItems() {
    return safeArray(state.opportunities?.data?.items).filter(item => SAFE_ID.test(String(item?.id || "")));
  }

  function lifecycleItems() {
    return safeArray(state.lifecycle?.data?.items).filter(item => SAFE_ID.test(String(item?.opportunityId || "")));
  }

  function titleFor(id) {
    const opportunity = opportunityItems().find(item => String(item.id) === String(id));
    return opportunity?.title || opportunity?.cardIdentity || String(id || "Saved opportunity");
  }

  function chosenLifecycle() {
    return state.detail?.data?.lifecycle
      || lifecycleItems().find(item => String(item.opportunityId) === state.selectedId)
      || null;
  }

  function selector() {
    const items = lifecycleItems();
    if (!items.length) return "";
    return `<label class="customer-management-selector"><span>Tracked card</span><select data-lifecycle-select>${items.map(item => `<option value="${escapeHtml(item.opportunityId)}" ${item.opportunityId === state.selectedId ? "selected" : ""}>${escapeHtml(titleFor(item.opportunityId))}</option>`).join("")}</select></label>`;
  }

  function localDateTime(value) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const pad = number => String(number).padStart(2, "0");
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  }

  function dateOnly(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  }

  function selected(value, expected) {
    return String(value || "") === expected ? "selected" : "";
  }

  function historyMarkup() {
    const history = safeArray(state.detail?.data?.history);
    if (!history.length) return `<div class="staging-empty"><strong>No lifecycle history yet.</strong><p>The first saved change will create an append-only event.</p></div>`;
    return `<div class="customer-lifecycle-history">${history.map(event => `<article><span>${escapeHtml(event.recordedAt || "Time unavailable")}</span><strong>${escapeHtml(event.eventType || "UPDATED")} · ${escapeHtml(event.trackingStatus || "UNKNOWN")}</strong><p>Outcome ${escapeHtml(event.outcomeStatus || "NONE")} · Version ${safeNumber(event.recordVersion)}</p></article>`).join("")}</div>`;
  }

  function trackingView() {
    const lifecycle = chosenLifecycle();
    const items = lifecycleItems();
    const due = items.filter(item => item.alertEnabled && item.reviewAt && new Date(item.reviewAt).getTime() <= Date.now()).length;
    const owned = items.filter(item => item.trackingStatus === "OWNED").length;
    const actions = `<a class="button button-secondary" href="#/opportunities/${encodeURIComponent(state.selectedId || "")}">Card Intelligence</a><a class="button button-secondary" href="#/export/${encodeURIComponent(state.selectedId || "")}">Audit export</a><button class="button button-secondary" type="button" data-lifecycle-refresh>Refresh</button>`;
    if (!items.length) {
      return `<div class="page customer-lifecycle-page">${pageHeading("Customer lifecycle", "Tracking", "Manage review timing and outcomes for tenant-owned saved decisions.", actions)}${boundary("Tracking state records customer workflow facts only. It cannot change Smart Opportunity, PSA guidance, or evidence eligibility.")}<section class="panel"><div class="panel-body staging-empty"><strong>No saved opportunity is available.</strong><p>Evaluate a card first; the authoritative result will create the tenant-owned tracking boundary.</p><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div></section></div>`;
    }
    return `<div class="page customer-lifecycle-page">${pageHeading("Customer lifecycle", "Tracking", "Persist review timing, watch state, acquisition or pass outcomes, and in-app review reminders.", actions)}${boundary("These are customer workflow facts in SQLite. They never rescore, rerank, verify evidence, predict a grade, buy, sell, list, or handle payment.")}${state.notice ? `<div class="customer-lifecycle-notice" role="status">${escapeHtml(state.notice)}</div>` : ""}<section class="panel customer-management-select-panel"><div class="panel-body">${selector()}</div></section><section class="customer-management-metrics"><article><span>Tenant-owned records</span><strong>${items.length}</strong></article><article><span>Current holdings</span><strong>${owned}</strong></article><article><span>Reviews due</span><strong>${due}</strong></article><article><span>Selected version</span><strong>${safeNumber(lifecycle?.version)}</strong></article></section>${lifecycle ? `<div class="customer-lifecycle-grid"><section class="panel"><header class="panel-header"><div><h2>${escapeHtml(titleFor(lifecycle.opportunityId))}</h2><p>Save one complete lifecycle snapshot with optimistic version protection.</p></div>${badge(lifecycle.trackingStatus || "WATCHING", lifecycle.trackingStatus === "OWNED" ? "buy" : lifecycle.trackingStatus === "SOLD" ? "ok" : "warn")}</header><div class="panel-body"><form class="customer-lifecycle-form" data-lifecycle-form><div class="customer-lifecycle-fields"><label><span>Tracking status</span><select name="trackingStatus" required><option ${selected(lifecycle.trackingStatus, "WATCHING")}>WATCHING</option><option ${selected(lifecycle.trackingStatus, "REVIEW")}>REVIEW</option><option ${selected(lifecycle.trackingStatus, "OWNED")}>OWNED</option><option ${selected(lifecycle.trackingStatus, "SOLD")}>SOLD</option><option ${selected(lifecycle.trackingStatus, "PASSED")}>PASSED</option><option ${selected(lifecycle.trackingStatus, "ARCHIVED")}>ARCHIVED</option></select></label><label><span>Outcome</span><select name="outcomeStatus" required><option ${selected(lifecycle.outcomeStatus, "NONE")}>NONE</option><option ${selected(lifecycle.outcomeStatus, "ACQUIRED")}>ACQUIRED</option><option ${selected(lifecycle.outcomeStatus, "SOLD")}>SOLD</option><option ${selected(lifecycle.outcomeStatus, "PASSED")}>PASSED</option></select></label><label><span>Review time</span><input name="reviewAt" type="datetime-local" value="${escapeHtml(localDateTime(lifecycle.reviewAt))}"></label><label class="customer-lifecycle-check"><input name="alertEnabled" type="checkbox" ${lifecycle.alertEnabled ? "checked" : ""}><span>Enable in-app review reminder</span></label><label><span>Acquisition cost</span><input name="acquisitionCost" type="number" min="0" step="0.01" value="${lifecycle.acquisitionCostCents == null ? "" : escapeHtml((lifecycle.acquisitionCostCents / 100).toFixed(2))}" placeholder="Required for OWNED or SOLD"></label><label><span>Acquired date</span><input name="acquiredAt" type="date" value="${escapeHtml(dateOnly(lifecycle.acquiredAt))}"></label><label><span>Disposition proceeds</span><input name="dispositionProceeds" type="number" min="0" step="0.01" value="${lifecycle.dispositionProceedsCents == null ? "" : escapeHtml((lifecycle.dispositionProceedsCents / 100).toFixed(2))}" placeholder="Required for SOLD"></label><label><span>Disposition date</span><input name="disposedAt" type="date" value="${escapeHtml(dateOnly(lifecycle.disposedAt))}"></label></div><input type="hidden" name="expectedVersion" value="${safeNumber(lifecycle.version)}"><div class="customer-lifecycle-submit"><button class="button button-primary" type="submit" ${state.saving ? "disabled" : ""}>${state.saving ? "Saving…" : "Save lifecycle"}</button><small>OWNED requires acquisition facts. SOLD requires acquisition and disposition facts. Alerts require a review time.</small></div></form></div></section><section class="panel"><header class="panel-header"><div><h2>Lifecycle history</h2><p>Append-only customer workflow events; newest first.</p></div></header><div class="panel-body">${historyMarkup()}</div></section></div>` : ""}</div>`;
  }

  function portfolioView() {
    const data = state.feature?.data || {};
    const items = safeArray(data.items);
    return `<div class="page customer-lifecycle-page">${pageHeading("Customer cost basis", "Portfolio", "Review current holdings created from explicit customer acquisition facts.", `<a class="button button-secondary" href="#/tracking">Manage tracking</a><button class="button button-secondary" type="button" data-lifecycle-refresh>Refresh</button>`)}${boundary("Portfolio shows recorded acquisition cost only. It does not invent current value, performance, profit, liquidation value, fees, taxes, or a sell recommendation.")}<section class="customer-management-metrics"><article><span>Current holdings</span><strong>${safeNumber(data.count)}</strong></article><article><span>Total cost basis</span><strong>${moneyFromCents(data.totalCostBasisCents)}</strong></article><article><span>Current value</span><strong>${data.currentValueConfigured ? "Connected" : "Not calculated"}</strong></article><article><span>Transactions</span><strong>${data.transactionAuthority ? "Enabled" : "Disabled"}</strong></article></section><section class="panel"><header class="panel-header"><div><h2>Tenant-owned holdings</h2><p>Only lifecycle records in OWNED state are included.</p></div>${badge(data.configured ? "SQLite connected" : "Unavailable", data.configured ? "ok" : "warn")}</header><div class="panel-body">${items.length ? `<div class="table-wrap"><table><thead><tr><th>Card</th><th>Cost basis</th><th>Acquired</th><th>Status</th><th></th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(titleFor(item.opportunityId))}</strong><small>${escapeHtml(item.opportunityId)}</small></td><td>${moneyFromCents(item.acquisitionCostCents)}</td><td>${escapeHtml(dateOnly(item.acquiredAt) || "Not recorded")}</td><td>${badge(item.trackingStatus || "OWNED", "buy")}</td><td><a class="button button-secondary" href="#/tracking/${encodeURIComponent(item.opportunityId)}">Manage</a></td></tr>`).join("")}</tbody></table></div>` : `<div class="staging-empty"><strong>No current holdings.</strong><p>Mark a tenant-owned saved opportunity as OWNED with acquisition facts to add it here.</p><a class="button button-primary" href="#/tracking">Open tracking</a></div>`}</div></section><section class="panel"><div class="panel-body staging-empty"><strong>No supported-value total or performance chart was created.</strong><p>Those require a separate governed current-value snapshot contract; cost basis alone cannot establish gain or loss.</p></div></section></div>`;
  }

  function alertsView() {
    const data = state.feature?.data || {};
    const items = safeArray(data.items);
    return `<div class="page customer-lifecycle-page">${pageHeading("In-app review queue", "Alerts", "Review persisted customer reminder rules without pretending notification delivery exists.", `<a class="button button-secondary" href="#/tracking">Manage rules</a><button class="button button-secondary" type="button" data-lifecycle-refresh>Refresh</button>`)}${boundary("Alerts observe saved review timing only. They do not calculate or change recommendations, evidence, grades, values, or transactions.")}<section class="customer-management-metrics"><article><span>Enabled rules</span><strong>${safeNumber(data.count)}</strong></article><article><span>Reviews due</span><strong>${safeNumber(data.dueCount)}</strong></article><article><span>In-app queue</span><strong>${data.configured ? "Connected" : "Unavailable"}</strong></article><article><span>Email / push</span><strong>${data.notificationDeliveryConfigured ? "Connected" : "Not connected"}</strong></article></section><div class="customer-lifecycle-grid"><section class="panel"><header class="panel-header"><div><h2>Review reminders</h2><p>Rules are stored in authoritative tenant-scoped SQLite.</p></div>${badge(data.status || "STATUS_UNAVAILABLE", data.configured ? "ok" : "warn")}</header><div class="panel-body">${items.length ? `<div class="customer-lifecycle-alerts">${items.map(item => `<article data-due="${item.due === true}"><div><span class="eyebrow">${escapeHtml(item.kind || "REVIEW_DUE")}</span><h3>${escapeHtml(titleFor(item.opportunityId))}</h3><p>Review at ${escapeHtml(item.reviewAt || "Not scheduled")}</p></div><div>${badge(item.due ? "Due" : "Scheduled", item.due ? "warn" : "ok")}<a class="button button-secondary" href="#/tracking/${encodeURIComponent(item.opportunityId)}">Manage</a></div></article>`).join("")}</div>` : `<div class="staging-empty"><strong>No review reminder is enabled.</strong><p>Choose a tracked card, set a review time, and enable its in-app reminder.</p><a class="button button-primary" href="#/tracking">Create from tracking</a></div>`}</div></section><section class="panel"><header class="panel-header"><div><h2>Delivery boundary</h2><p>Saved rules are real; external notification delivery is not.</p></div></header><div class="panel-body customer-management-checklist"><div data-state="ready"><span>✓</span><span><strong>SQLite rule persistence</strong><small>Tenant owned and version protected.</small></span></div><div data-state="attention"><span>!</span><span><strong>Email, SMS, and push</strong><small>No delivery provider or customer contact channel is connected.</small></span></div><div data-state="ready"><span>✓</span><span><strong>Zero transaction authority</strong><small>Rules cannot buy, sell, list, bid, or pay.</small></span></div></div></section></div></div>`;
  }

  function pageMarkup() {
    if (state.loading) return `<div class="page customer-lifecycle-page">${pageHeading("Customer lifecycle", "Loading saved workflow", "Reading tenant-owned lifecycle facts through the approved same-origin gateway.")}<div class="staging-loading" role="status">Loading authoritative lifecycle state…</div></div>`;
    if (state.error) return `<div class="page customer-lifecycle-page">${pageHeading("Customer lifecycle", "Lifecycle unavailable", "The request failed closed without a browser-only fallback.")}${errorPanel(state.error)}</div>`;
    if (state.health?.data?.status !== "configured") {
      const title = state.route === "tracking" ? "Tracking" : state.route === "portfolio" ? "Portfolio" : "Alerts";
      return `<div class="page customer-lifecycle-page">${pageHeading("Customer lifecycle", title, "Prepared for a controlled tenant-scoped private-beta session.")}${offlinePanel()}</div>`;
    }
    if (state.route === "tracking") return trackingView();
    if (state.route === "portfolio") return portfolioView();
    return alertsView();
  }

  function resetData() {
    state.health = null;
    state.opportunities = null;
    state.lifecycle = null;
    state.detail = null;
    state.feature = null;
    state.error = null;
    state.selectedId = "";
  }

  function chooseId() {
    const ids = lifecycleItems().map(item => String(item.opportunityId));
    if (state.requestedId) {
      if (!SAFE_ID.test(state.requestedId) || !ids.includes(state.requestedId)) {
        throw Object.assign(new Error("The requested lifecycle record was not returned for this tenant."), {
          code: "RESOURCE_NOT_FOUND",
          status: 404
        });
      }
      return state.requestedId;
    }
    return ids[0] || "";
  }

  async function load() {
    state.loading = true;
    state.notice = "";
    resetData();
    renderCurrent();
    try {
      state.health = await request("/api/v1/health");
      if (state.health?.data?.status !== "configured") return;
      if (state.route === "tracking") {
        [state.opportunities, state.lifecycle] = await Promise.all([
          request("/api/v1/opportunities"),
          request("/api/v1/lifecycle")
        ]);
        if (state.opportunities?.data?.kind !== "opportunities" || !Array.isArray(state.opportunities?.data?.items)) {
          throw Object.assign(new Error("The tracked opportunity list failed its contract."), { code: "TRACKING_OPPORTUNITIES_INVALID" });
        }
        if (state.lifecycle?.data?.kind !== "lifecycle" || !Array.isArray(state.lifecycle?.data?.items) || state.lifecycle?.data?.sourceOfTruth !== "SQLite") {
          throw Object.assign(new Error("The lifecycle list failed its SQLite contract."), { code: "LIFECYCLE_LIST_INVALID" });
        }
        state.selectedId = chooseId();
        if (state.selectedId) {
          state.detail = await request(`/api/v1/lifecycle/${encodeURIComponent(state.selectedId)}`);
          if (state.detail?.data?.kind !== "lifecycle-detail" || String(state.detail?.data?.opportunityId || "") !== state.selectedId || !Array.isArray(state.detail?.data?.history)) {
            throw Object.assign(new Error("The lifecycle detail failed its selected-record contract."), { code: "LIFECYCLE_DETAIL_INVALID" });
          }
        }
        return;
      }
      [state.feature, state.opportunities] = await Promise.all([
        request(`/api/v1/${state.route}`),
        request("/api/v1/opportunities")
      ]);
      if (state.feature?.data?.kind !== state.route || state.feature?.data?.configured !== true || !Array.isArray(state.feature?.data?.items)) {
        throw Object.assign(new Error("The lifecycle projection failed the customer contract."), { code: "LIFECYCLE_PROJECTION_INVALID" });
      }
      if (state.opportunities?.data?.kind !== "opportunities" || !Array.isArray(state.opportunities?.data?.items)) {
        throw Object.assign(new Error("The lifecycle label source failed the customer contract."), { code: "LIFECYCLE_LABELS_INVALID" });
      }
    } catch (error) {
      state.error = error;
    } finally {
      state.loading = false;
      renderCurrent();
    }
  }

  function toInstant(value, label) {
    const text = String(value || "").trim();
    if (!text) return null;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is invalid.`);
    return parsed.toISOString();
  }

  function dateInstant(value) {
    const text = String(value || "").trim();
    return text ? `${text}T12:00:00.000Z` : null;
  }

  function cents(value, label) {
    const text = String(value || "").trim();
    if (!text) return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative amount.`);
    return Math.round(parsed * 100);
  }

  async function save(form) {
    if (!state.selectedId || state.saving) return;
    state.saving = true;
    state.error = null;
    state.notice = "";
    renderCurrent();
    try {
      const formData = new FormData(form);
      const reviewAt = toInstant(formData.get("reviewAt"), "Review time");
      const alertEnabled = formData.get("alertEnabled") === "on";
      if (alertEnabled && !reviewAt) throw new Error("A review time is required when the in-app reminder is enabled.");
      const body = {
        trackingStatus: String(formData.get("trackingStatus") || ""),
        reviewAt,
        outcomeStatus: String(formData.get("outcomeStatus") || ""),
        acquisitionCostCents: cents(formData.get("acquisitionCost"), "Acquisition cost"),
        acquiredAt: dateInstant(formData.get("acquiredAt")),
        dispositionProceedsCents: cents(formData.get("dispositionProceeds"), "Disposition proceeds"),
        disposedAt: dateInstant(formData.get("disposedAt")),
        alertEnabled,
        expectedVersion: Number(formData.get("expectedVersion"))
      };
      await request(`/api/v1/lifecycle/${encodeURIComponent(state.selectedId)}`, { method: "PUT", body });
      await load();
      state.notice = "Tracking changes saved to your account.";
    } catch (error) {
      state.error = error;
    } finally {
      state.saving = false;
      renderCurrent();
    }
  }

  function bindActions() {
    if (!state.main || typeof state.main.querySelector !== "function") return;
    state.main.querySelector("[data-lifecycle-refresh]")?.addEventListener("click", load);
    const select = state.main.querySelector("[data-lifecycle-select]");
    select?.addEventListener("change", () => {
      const id = String(select.value || "");
      if (SAFE_ID.test(id)) window.location.hash = `#/tracking/${encodeURIComponent(id)}`;
    });
    state.main.querySelector("[data-lifecycle-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      save(event.currentTarget);
    });
  }

  function renderCurrent() {
    if (!state.main) return;
    state.main.innerHTML = pageMarkup();
    bindActions();
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

  window.FlipForgeCustomerLifecycle = Object.freeze({
    isEligible: eligibleHost,
    handles,
    render,
    refresh: load
  });
})();
