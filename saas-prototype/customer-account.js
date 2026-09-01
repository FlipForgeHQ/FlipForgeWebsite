(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const READ_PATHS = new Set(["/api/v1/health", "/api/v1/entitlements"]);

  const state = {
    main: null,
    loading: false,
    health: null,
    entitlements: null,
    error: null
  };

  function isEligible() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""))
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
    return `production-account-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function validHealth(payload, expectedCorrelationId) {
    return Boolean(payload?.meta && payload?.data)
      && payload.meta.contractVersion === CONTRACT_VERSION
      && payload.meta.correlationId === expectedCorrelationId;
  }

  function validEntitlements(payload, expectedCorrelationId) {
    const meta = payload?.meta;
    const data = payload?.data;
    return Boolean(meta && data)
      && meta.contractVersion === CONTRACT_VERSION
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId
      && data.kind === "entitlements"
      && data.readOnly === true
      && data.transactionAuthority === false;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      throw Object.assign(new Error("The account response exceeded the browser safety limit."), {
        code: "ACCOUNT_RESPONSE_TOO_LARGE"
      });
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw Object.assign(new Error("The account gateway returned invalid JSON."), {
        code: "ACCOUNT_INVALID_JSON"
      });
    }
  }

  async function request(path) {
    if (!READ_PATHS.has(path)) throw new Error("The account workspace requested a non-allowlisted API path.");
    const requestCorrelationId = correlationId();
    const response = await fetch(path, {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Account request failed with status ${response.status}.`), {
        code: upstream.code || "ACCOUNT_REQUEST_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    const valid = path === "/api/v1/health"
      ? validHealth(payload, requestCorrelationId)
      : validEntitlements(payload, requestCorrelationId);
    if (!valid) {
      throw Object.assign(new Error("The account response failed the FlipForge authority contract."), {
        code: "ACCOUNT_CONTRACT_INVALID"
      });
    }
    return payload;
  }

  function badge(label, tone = "neutral") {
    return `<span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function numberOrUnlimited(value, fallback = "Unavailable") {
    if (value === null || value === undefined) return "Unlimited during beta";
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString("en-US") : fallback;
  }

  function usageAdmission(usage) {
    const completed = Number(usage?.completedEvaluations ?? 0);
    const reservations = Number(usage?.inProgressReservations ?? 0);
    const returned = Number(usage?.admissionUsage);
    return Number.isFinite(returned)
      ? returned
      : Math.max(0, Number.isFinite(completed) ? completed : 0) + Math.max(0, Number.isFinite(reservations) ? reservations : 0);
  }

  function percent(used, limit) {
    const parsedLimit = Number(limit);
    const parsedUsed = Number(used);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0 || !Number.isFinite(parsedUsed)) return 0;
    return Math.max(0, Math.min(100, Math.round((parsedUsed / parsedLimit) * 100)));
  }

  function planFeature(label, value) {
    let display = value;
    if (value === true) display = "Included";
    if (value === false) display = "Not included";
    if (value === null || value === undefined) display = "Reasonable-use limit";
    return `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(display)}</strong></li>`;
  }

  function planCards(plans) {
    const safePlans = Array.isArray(plans) ? plans : [];
    if (!safePlans.length) return `<div class="staging-empty"><strong>Commercial plan details are unavailable.</strong><p>Private-beta access remains unchanged.</p></div>`;
    return `<div class="customer-entitlement-plans">${safePlans.map(plan => `<article class="panel customer-entitlement-plan"><div class="panel-body"><div class="customer-entitlement-plan-head"><div><span class="eyebrow">Planned launch plan</span><h3>${escapeHtml(plan.name || plan.code || "Plan")}</h3></div>${badge("Planned", "neutral")}</div><ul>${planFeature("Monthly evaluations", plan.monthlyEvaluationLimit)}${planFeature("Tracked cards", plan.trackedCardLimitLabel || plan.trackedCardLimit)}${planFeature("Full evidence", plan.fullEvidenceReview)}${planFeature("Decision traceback", plan.decisionTraceback)}${planFeature("PSA intelligence", plan.psaIntelligence)}${planFeature("CSV exports", plan.csvExports)}${planFeature("Batch evaluation", plan.batchEvaluation)}</ul><div class="customer-checkout-action"><button class="button button-secondary" type="button" disabled>Checkout deferred until Beta Complete</button></div></div></article>`).join("")}</div>`;
  }

  function syncSidebar(data) {
    const card = document.querySelector(".plan-card");
    if (!card || !data) return;
    const current = data.current || {};
    const usage = data.usage || {};
    const admissionUsage = usageAdmission(usage);
    const strong = card.querySelector("strong");
    const row = card.querySelectorAll(".usage-row span");
    const track = card.querySelector(".usage-track span");
    const small = card.querySelector("small");
    if (strong) strong.textContent = current.name || "Private Beta";
    if (row[0]) row[0].textContent = "Evaluation usage";
    if (row[1]) row[1].textContent = usage.monthlyEvaluationLimit == null
      ? `${admissionUsage} used · Unlimited beta`
      : `${admissionUsage} / ${usage.monthlyEvaluationLimit}`;
    if (track) track.style.width = `${percent(admissionUsage, usage.monthlyEvaluationLimit)}%`;
    if (small) small.textContent = "Plan state and usage are server-owned. Paid checkout is deferred until Core Platform Beta Complete.";
  }

  function loadingView() {
    return `<div class="page customer-entitlements-page"><header class="page-heading"><div><span class="eyebrow">Account</span><h1>Plan &amp; Usage</h1><p>Loading your tenant-scoped access and evaluation usage…</p></div></header><div class="staging-loading" role="status">Loading account state…</div></div>`;
  }

  function offlineView() {
    return `<div class="page customer-entitlements-page"><header class="page-heading"><div><span class="eyebrow">Account</span><h1>Plan &amp; Usage</h1><p>Access and usage stay server-owned.</p></div></header><section class="panel"><div class="panel-body staging-empty"><strong>This account workspace is safely offline.</strong><p>The production customer gateway is not configured, so no tenant plan request was attempted and no sample subscription was substituted.</p></div></section></div>`;
  }

  function errorView(error) {
    const signIn = error?.status === 401
      ? `<a class="button button-primary" href="/production-auth.html?return=${encodeURIComponent("/app/#/account")}">Sign in securely</a>`
      : "";
    return `<div class="page customer-entitlements-page"><header class="page-heading"><div><span class="eyebrow">Account</span><h1>Plan &amp; Usage</h1><p>Account state could not be loaded.</p></div></header><section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error?.code || "ACCOUNT_UNAVAILABLE")}</strong><p>${escapeHtml(error?.message || "The account workspace is unavailable.")}</p><small>No sample subscription or browser-invented allowance was shown.</small>${signIn}</div></section></div>`;
  }

  function mainView(payload) {
    const data = payload?.data || {};
    const current = data.current || {};
    const usage = data.usage || {};
    const admissionUsage = usageAdmission(usage);
    const reservations = Math.max(0, Number(usage.inProgressReservations ?? 0) || 0);
    const limit = usage.monthlyEvaluationLimit;
    const progress = percent(admissionUsage, limit);
    const accessBadge = current.paidPlanActive === true
      ? badge("Verified paid access", "ok")
      : current.code === "PRIVATE_BETA"
        ? badge("Private beta", "ok")
        : badge(current.accessState || "Access state", "warn");

    return `<div class="page customer-entitlements-page"><header class="page-heading"><div><span class="eyebrow">Account</span><h1>Plan &amp; Usage</h1><p>Review server-owned access, evaluation usage, and the planned commercial tiers for this tenant.</p></div><div class="page-actions"><button class="button button-secondary" type="button" data-production-account-refresh>Refresh</button></div></header><div class="boundary-note"><strong>Launch boundary:</strong> Paid checkout, plan changes, and customer portal controls are intentionally deferred until Core Platform Beta Complete. This production account screen is read-only.</div><section class="customer-entitlement-summary"><article class="panel customer-entitlement-current"><div class="panel-body"><div class="customer-entitlement-current-head"><div><span class="eyebrow">Current access</span><h2>${escapeHtml(current.name || current.code || "Unavailable")}</h2></div>${accessBadge}</div><dl><div><dt>Access state</dt><dd>${escapeHtml(current.accessState || "Unavailable")}</dd></div><div><dt>Source</dt><dd>${escapeHtml(current.entitlementSource || "Unavailable")}</dd></div><div><dt>Paid plan</dt><dd>${current.paidPlanActive === true ? "Verified active" : "No"}</dd></div><div><dt>Production checkout</dt><dd>Deferred by core-platform launch gate</dd></div></dl></div></article><article class="panel customer-entitlement-usage"><div class="panel-body"><span class="eyebrow">Evaluation usage</span><div class="customer-entitlement-usage-number"><strong>${escapeHtml(usage.completedEvaluations ?? 0)}</strong><span>completed this month</span></div><div class="customer-entitlement-meter"><div><span>In progress reserved</span><strong>${escapeHtml(reservations)}</strong></div><div><span>Admission usage</span><strong>${escapeHtml(admissionUsage)}</strong></div><div><span>Allowance</span><strong>${escapeHtml(numberOrUnlimited(limit))}</strong></div><div class="usage-track" aria-label="Monthly evaluation admission usage"><span style="width:${progress}%"></span></div><div><span>Remaining</span><strong>${escapeHtml(numberOrUnlimited(usage.remainingEvaluations))}</strong></div></div><small>Usage is returned by the authoritative service. The browser cannot increase an allowance or create an entitlement.</small></div></article></section><section class="panel"><header class="panel-header"><div><h2>Planned commercial plans</h2><p>These tiers remain informational during the core-platform completion sprint.</p></div>${badge("Billing deferred", "neutral")}</header><div class="panel-body">${planCards(data.plannedCommercialPlans)}</div></section><section class="panel"><div class="panel-body customer-entitlement-safety"><strong>Production payment controls are intentionally absent.</strong><p>This screen cannot start checkout, collect payment credentials, change a subscription, accept evidence, recalculate PSA guidance, or authorize a transaction. Billing launch resumes only after the core customer product reaches Beta Complete.</p></div></section></div>`;
  }

  function attachActions() {
    const refresh = state.main?.querySelector?.("[data-production-account-refresh]");
    if (refresh) refresh.addEventListener("click", load);
  }

  function renderState() {
    if (!state.main) return;
    if (state.loading) {
      state.main.innerHTML = loadingView();
      return;
    }
    if (state.error) {
      state.main.innerHTML = errorView(state.error);
      return;
    }
    if (state.health?.data?.status !== "configured") {
      state.main.innerHTML = offlineView();
      return;
    }
    state.main.innerHTML = mainView(state.entitlements);
    syncSidebar(state.entitlements?.data);
    attachActions();
  }

  async function load() {
    if (!state.main || state.loading) return;
    state.loading = true;
    state.error = null;
    renderState();
    try {
      state.health = await request("/api/v1/health");
      state.entitlements = state.health?.data?.status === "configured"
        ? await request("/api/v1/entitlements")
        : null;
    } catch (error) {
      state.error = error;
    } finally {
      state.loading = false;
      renderState();
    }
  }

  function render(main) {
    if (!isEligible()) return false;
    state.main = main;
    state.loading = false;
    state.health = null;
    state.entitlements = null;
    state.error = null;
    load();
    return true;
  }

  window.FlipForgeProductionAccount = Object.freeze({
    isEligible,
    render,
    refresh: load
  });
})();
