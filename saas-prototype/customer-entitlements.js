(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const MAX_RESPONSE_CHARACTERS = 1_000_000;

  const state = {
    main: null,
    loading: false,
    health: null,
    entitlements: null,
    error: null
  };

  function isEligible() {
    return PREVIEW_HOST.test(String(window.location.hostname || ""));
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
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `customer-entitlements-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      throw Object.assign(new Error("The plan response exceeded the browser safety limit."), {
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

  function validEnvelope(payload, expectedCorrelationId) {
    const meta = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.meta : null;
    return Boolean(meta)
      && meta.contractVersion === CONTRACT_VERSION
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId
      && payload.data
      && payload.data.kind === "entitlements"
      && payload.data.readOnly === true
      && payload.data.transactionAuthority === false;
  }

  function validHealth(payload, expectedCorrelationId) {
    return Boolean(payload?.meta && payload?.data)
      && payload.meta.contractVersion === CONTRACT_VERSION
      && payload.meta.correlationId === expectedCorrelationId;
  }

  async function request(path) {
    if (path !== "/api/v1/health" && path !== "/api/v1/entitlements") {
      throw new Error("The plan workspace requested a non-allowlisted API path.");
    }
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
      throw Object.assign(new Error(upstream.message || `Plan request failed with status ${response.status}.`), {
        code: upstream.code || "CUSTOMER_PLAN_REQUEST_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    const valid = path === "/api/v1/health"
      ? validHealth(payload, requestCorrelationId)
      : validEnvelope(payload, requestCorrelationId);
    if (!valid) {
      throw Object.assign(new Error("The plan response failed the FlipForge authority contract."), {
        code: "CUSTOMER_PLAN_CONTRACT_INVALID"
      });
    }
    return payload;
  }

  function badge(label, tone = "neutral") {
    return `<span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function loadingView() {
    return `<div class="page customer-entitlements-page"><header class="page-heading"><div><span class="eyebrow">Account</span><h1>Plan & Usage</h1><p>Loading your tenant-scoped access and evaluation usage…</p></div></header><div class="staging-loading" role="status">Loading plan state…</div></div>`;
  }

  function offlineView() {
    return `<div class="page customer-entitlements-page"><header class="page-heading"><div><span class="eyebrow">Account</span><h1>Plan & Usage</h1><p>Subscription and usage data stays server-owned.</p></div></header><section class="panel"><div class="panel-body staging-empty"><strong>This private-beta workspace is safely offline.</strong><p>The preview bridge is disabled, so no tenant plan request was attempted and no sample subscription was substituted.</p></div></section></div>`;
  }

  function errorView(error) {
    const signIn = error?.status === 401
      ? `<a class="button button-primary" href="/staging-auth.html?returnTo=%2Fsaas-prototype%2F%23%2Faccount">Sign in securely</a>`
      : "";
    return `<div class="page customer-entitlements-page"><header class="page-heading"><div><span class="eyebrow">Account</span><h1>Plan & Usage</h1><p>Subscription and usage state could not be loaded.</p></div></header><section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error?.code || "PLAN_UNAVAILABLE")}</strong><p>${escapeHtml(error?.message || "The plan workspace is unavailable.")}</p><small>No sample subscription or browser-invented allowance was shown.</small>${signIn}</div></section></div>`;
  }

  function numberOrUnlimited(value, fallback = "Unavailable") {
    if (value === null || value === undefined) return "Unlimited during beta";
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString("en-US") : fallback;
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
    if (!safePlans.length) return `<div class="staging-empty">No planned commercial plan catalog was returned.</div>`;
    return `<div class="customer-entitlement-plans">${safePlans.map(plan => `<article class="panel customer-entitlement-plan"><div class="panel-body"><div class="customer-entitlement-plan-head"><div><span class="eyebrow">Planned launch plan</span><h3>${escapeHtml(plan.name || plan.code || "Plan")}</h3></div>${badge("Not billing active", "neutral")}</div><ul>${planFeature("Monthly evaluations", plan.monthlyEvaluationLimit)}${planFeature("Tracked cards", plan.trackedCardLimitLabel || plan.trackedCardLimit)}${planFeature("Full evidence", plan.fullEvidenceReview)}${planFeature("Decision traceback", plan.decisionTraceback)}${planFeature("PSA intelligence", plan.psaIntelligence)}${planFeature("CSV exports", plan.csvExports)}${planFeature("Batch evaluation", plan.batchEvaluation)}</ul></div></article>`).join("")}</div>`;
  }

  function syncSidebar(data) {
    const card = document.querySelector(".plan-card");
    if (!card || !data) return;
    const current = data.current || {};
    const usage = data.usage || {};
    const strong = card.querySelector("strong");
    const row = card.querySelectorAll(".usage-row span");
    const track = card.querySelector(".usage-track span");
    const small = card.querySelector("small");
    if (strong) strong.textContent = current.name || "Private Beta";
    if (row[0]) row[0].textContent = "Evaluations this month";
    if (row[1]) row[1].textContent = usage.monthlyEvaluationLimit == null
      ? String(usage.completedEvaluations ?? 0)
      : `${usage.completedEvaluations ?? 0} / ${usage.monthlyEvaluationLimit}`;
    if (track) track.style.width = `${percent(usage.completedEvaluations, usage.monthlyEvaluationLimit)}%`;
    if (small) small.textContent = data.billingProviderConnected === true
      ? "Plan state is verified server-side."
      : "Billing is not connected. Private-beta access is not a paid subscription.";
  }

  function mainView(payload) {
    const data = payload?.data || {};
    const current = data.current || {};
    const usage = data.usage || {};
    const activeLabel = current.paidPlanActive === true
      ? badge("Paid plan active", "ok")
      : current.code === "PRIVATE_BETA"
        ? badge("Private beta", "ok")
        : badge(current.accessState || "Not active", "warn");
    const limit = usage.monthlyEvaluationLimit;
    const progress = percent(usage.completedEvaluations, limit);
    const billingCopy = data.billingProviderConnected === true
      ? "Billing provider connection is active on the server."
      : "Billing is not connected yet. FlipForge cannot charge, upgrade, downgrade, cancel, or claim a paid plan from this screen.";

    return `<div class="page customer-entitlements-page"><header class="page-heading"><div><span class="eyebrow">Account</span><h1>Plan & Usage</h1><p>Review the server-owned access state and monthly evaluation usage for this private-beta tenant.</p></div><div class="page-actions"><button class="button button-secondary" type="button" data-customer-entitlements-refresh>Refresh</button></div></header><div class="boundary-note"><strong>Billing boundary:</strong> ${escapeHtml(billingCopy)}</div><section class="customer-entitlement-summary"><article class="panel customer-entitlement-current"><div class="panel-body"><div class="customer-entitlement-current-head"><div><span class="eyebrow">Current access</span><h2>${escapeHtml(current.name || current.code || "Unavailable")}</h2></div>${activeLabel}</div><dl><div><dt>Access state</dt><dd>${escapeHtml(current.accessState || "Unavailable")}</dd></div><div><dt>Source</dt><dd>${escapeHtml(current.entitlementSource || "Unavailable")}</dd></div><div><dt>Paid plan</dt><dd>${current.paidPlanActive === true ? "Verified active" : "No"}</dd></div><div><dt>Checkout</dt><dd>${data.checkoutAvailable === true ? "Available" : "Not connected"}</dd></div></dl></div></article><article class="panel customer-entitlement-usage"><div class="panel-body"><span class="eyebrow">Evaluation usage</span><div class="customer-entitlement-usage-number"><strong>${escapeHtml(usage.completedEvaluations ?? 0)}</strong><span>completed this month</span></div><div class="customer-entitlement-meter"><div><span>Allowance</span><strong>${escapeHtml(numberOrUnlimited(limit))}</strong></div><div class="usage-track" aria-label="Monthly evaluation usage"><span style="width:${progress}%"></span></div><div><span>Remaining</span><strong>${escapeHtml(numberOrUnlimited(usage.remainingEvaluations))}</strong></div></div><small>Idempotent replays and failed evaluations do not consume additional usage.</small></div></article></section><section class="panel"><header class="panel-header"><div><h2>Planned commercial plans</h2><p>These are governed launch-plan contracts, not active checkout offers.</p></div>${badge("Pricing subject to launch validation", "neutral")}</header><div class="panel-body">${planCards(data.plannedCommercialPlans)}</div></section><section class="panel"><div class="panel-body customer-entitlement-safety"><strong>No payment controls are enabled.</strong><p>This workspace is read-only. It cannot process payment, change a plan, create an entitlement, accept evidence, recalculate PSA guidance, or authorize a transaction.</p></div></section></div>`;
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
    const refresh = state.main.querySelector("[data-customer-entitlements-refresh]");
    if (refresh) refresh.addEventListener("click", load);
  }

  async function load() {
    if (!state.main || state.loading) return;
    state.loading = true;
    state.error = null;
    renderState();
    try {
      state.health = await request("/api/v1/health");
      if (state.health?.data?.status === "configured") {
        state.entitlements = await request("/api/v1/entitlements");
      } else {
        state.entitlements = null;
      }
    } catch (error) {
      state.error = error;
    } finally {
      state.loading = false;
      renderState();
    }
  }

  function render(main) {
    state.main = main;
    state.health = null;
    state.entitlements = null;
    state.error = null;
    state.loading = false;
    load();
  }

  window.FlipForgeCustomerEntitlements = {
    isEligible,
    render
  };
})();
