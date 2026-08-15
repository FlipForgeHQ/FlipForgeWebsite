(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const CHECKOUT_PATH = "/api/v1/billing/paddle/checkout";
  const CUSTOMER_CHECKOUT_PLANS = new Set(["COLLECTOR", "PRO"]);

  const state = {
    main: null,
    loading: false,
    health: null,
    entitlements: null,
    error: null,
    checkoutPlan: null,
    checkoutError: null
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

  function checkoutIdempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `checkout.${window.crypto.randomUUID()}`;
    }
    return `checkout.${Date.now()}.${Math.random().toString(16).slice(2)}`.slice(0, 100);
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

  function validAuthorityMeta(payload, expectedCorrelationId) {
    const meta = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.meta : null;
    return Boolean(meta)
      && meta.contractVersion === CONTRACT_VERSION
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId
      && payload.data
      && typeof payload.data === "object";
  }

  function validEnvelope(payload, expectedCorrelationId) {
    return validAuthorityMeta(payload, expectedCorrelationId)
      && payload.data.kind === "entitlements"
      && payload.data.readOnly === true
      && payload.data.transactionAuthority === false;
  }

  function validHealth(payload, expectedCorrelationId) {
    return Boolean(payload?.meta && payload?.data)
      && payload.meta.contractVersion === CONTRACT_VERSION
      && payload.meta.correlationId === expectedCorrelationId;
  }

  function validatedCheckoutUrl(value) {
    try {
      const parsed = new URL(String(value || ""));
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) return null;
      return parsed.href;
    } catch (_) {
      return null;
    }
  }

  function validCheckoutEnvelope(payload, expectedCorrelationId, expectedPlan) {
    if (!validAuthorityMeta(payload, expectedCorrelationId)) return false;
    const data = payload.data || {};
    return data.kind === "paddle-checkout"
      && data.provider === "PADDLE"
      && data.planCode === expectedPlan
      && Boolean(validatedCheckoutUrl(data.checkoutUrl))
      && typeof data.idempotentReplay === "boolean"
      && data.customerPriceIdIncluded === false
      && data.opaqueBillingReferenceIncluded === false
      && data.paidAccessActivated === false
      && data.webhookRequiredForPaidActivation === true
      && data.paymentCredentialsHandledByFlipForge === false
      && data.transactionAuthority === false;
  }

  function gatewayError(payload, fallbackMessage, status, requestCorrelationId) {
    const upstream = payload?.error || {};
    return Object.assign(new Error(upstream.message || fallbackMessage), {
      code: upstream.code || "CUSTOMER_PLAN_REQUEST_FAILED",
      status,
      correlationId: upstream.correlationId || requestCorrelationId
    });
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
      throw gatewayError(payload, `Plan request failed with status ${response.status}.`, response.status, requestCorrelationId);
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

  async function checkoutRequest(planCode) {
    const plan = String(planCode || "").trim().toUpperCase();
    if (!CUSTOMER_CHECKOUT_PLANS.has(plan)) {
      throw Object.assign(new Error("Only Collector or Pro may be selected for customer checkout."), {
        code: "CUSTOMER_CHECKOUT_PLAN_INVALID"
      });
    }
    const currentData = state.entitlements?.data || {};
    if (currentData.checkoutAvailable !== true || currentData.customerCheckoutAllowed !== true) {
      throw Object.assign(new Error("Checkout is not currently enabled for this tenant."), {
        code: "CUSTOMER_CHECKOUT_NOT_AVAILABLE"
      });
    }

    const requestCorrelationId = correlationId();
    const response = await fetch(CHECKOUT_PATH, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Correlation-Id": requestCorrelationId,
        "Idempotency-Key": checkoutIdempotencyKey()
      },
      body: JSON.stringify({ planCode: plan }),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      throw gatewayError(payload, `Checkout request failed with status ${response.status}.`, response.status, requestCorrelationId);
    }
    if (!validCheckoutEnvelope(payload, requestCorrelationId, plan)) {
      throw Object.assign(new Error("The checkout handoff failed the FlipForge authority contract."), {
        code: "CUSTOMER_CHECKOUT_CONTRACT_INVALID"
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

  function checkoutButton(plan, data) {
    const code = String(plan?.code || "").toUpperCase();
    if (!CUSTOMER_CHECKOUT_PLANS.has(code)) return "";
    if (data?.checkoutAvailable !== true || data?.customerCheckoutAllowed !== true) {
      return `<button class="button button-secondary" type="button" disabled>Checkout not enabled</button>`;
    }
    const busy = state.checkoutPlan === code;
    const label = busy
      ? "Preparing secure checkout…"
      : data.sandboxCheckout === true
        ? `Start ${plan.name || code} sandbox checkout`
        : `Continue with ${plan.name || code}`;
    return `<button class="button button-primary" type="button" data-customer-checkout-plan="${escapeHtml(code)}" ${state.checkoutPlan ? "disabled" : ""}>${escapeHtml(label)}</button>`;
  }

  function planCards(plans, data) {
    const safePlans = Array.isArray(plans) ? plans : [];
    if (!safePlans.length) return `<div class="staging-empty">No planned commercial plan catalog was returned.</div>`;
    return `<div class="customer-entitlement-plans">${safePlans.map(plan => {
      const checkoutEligible = CUSTOMER_CHECKOUT_PLANS.has(String(plan?.code || "").toUpperCase());
      const status = data?.checkoutAvailable === true && checkoutEligible
        ? badge(data.sandboxCheckout === true ? "Sandbox checkout" : "Checkout available", data.sandboxCheckout === true ? "warn" : "ok")
        : badge("Not billing active", "neutral");
      return `<article class="panel customer-entitlement-plan"><div class="panel-body"><div class="customer-entitlement-plan-head"><div><span class="eyebrow">Planned launch plan</span><h3>${escapeHtml(plan.name || plan.code || "Plan")}</h3></div>${status}</div><ul>${planFeature("Monthly evaluations", plan.monthlyEvaluationLimit)}${planFeature("Tracked cards", plan.trackedCardLimitLabel || plan.trackedCardLimit)}${planFeature("Full evidence", plan.fullEvidenceReview)}${planFeature("Decision traceback", plan.decisionTraceback)}${planFeature("PSA intelligence", plan.psaIntelligence)}${planFeature("Forge Heat", plan.forgeHeat === true)}${planFeature("CSV exports", plan.csvExports)}${planFeature("Batch evaluation", plan.batchEvaluation)}</ul>${checkoutEligible ? `<div class="customer-checkout-action">${checkoutButton(plan, data)}</div>` : ""}</div></article>`;
    }).join("")}</div>`;
  }

  function usageAdmission(usage) {
    const completed = Number(usage?.completedEvaluations ?? 0);
    const reservations = Number(usage?.inProgressReservations ?? 0);
    const returned = Number(usage?.admissionUsage);
    return Number.isFinite(returned)
      ? returned
      : Math.max(0, Number.isFinite(completed) ? completed : 0) + Math.max(0, Number.isFinite(reservations) ? reservations : 0);
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
    if (row[0]) row[0].textContent = "Evaluation allowance";
    if (row[1]) row[1].textContent = usage.monthlyEvaluationLimit == null
      ? String(usage.completedEvaluations ?? 0)
      : `${admissionUsage} / ${usage.monthlyEvaluationLimit}`;
    if (track) track.style.width = `${percent(admissionUsage, usage.monthlyEvaluationLimit)}%`;
    if (small) small.textContent = data.checkoutAvailable === true
      ? "Plan state, usage, and checkout availability are server-owned."
      : data.billingProviderConnected === true
        ? "Billing verification is connected; new customer checkout is not enabled."
        : "Billing is not connected. Private-beta access is not a paid subscription.";
  }

  function checkoutBoundaryCopy(data) {
    if (data.checkoutAvailable === true && data.sandboxCheckout === true) {
      return "Paddle sandbox checkout is enabled for this preview. FlipForge sends only the selected plan and a one-time request key; payment details stay with Paddle, and paid access still requires the verified webhook.";
    }
    if (data.checkoutAvailable === true) {
      return "Server-authorized Paddle checkout is available. FlipForge never receives card or bank details, and checkout creation alone cannot activate paid access.";
    }
    if (data.billingProviderConnected === true) {
      return "Billing-event verification is connected, but new customer checkout is not enabled for this environment.";
    }
    return "Billing is not connected yet. FlipForge cannot charge, upgrade, downgrade, cancel, or claim a paid plan from this screen.";
  }

  function mainView(payload) {
    const data = payload?.data || {};
    const current = data.current || {};
    const usage = data.usage || {};
    const admissionUsage = usageAdmission(usage);
    const reservations = Math.max(0, Number(usage.inProgressReservations ?? 0) || 0);
    const activeLabel = current.paidPlanActive === true
      ? badge("Paid plan active", "ok")
      : current.code === "PRIVATE_BETA"
        ? badge("Private beta", "ok")
        : badge(current.accessState || "Not active", "warn");
    const limit = usage.monthlyEvaluationLimit;
    const progress = percent(admissionUsage, limit);
    const checkoutError = state.checkoutError
      ? `<div class="staging-error" role="alert"><strong>${escapeHtml(state.checkoutError.code || "CHECKOUT_UNAVAILABLE")}</strong><p>${escapeHtml(state.checkoutError.message || "Checkout could not be prepared.")}</p></div>`
      : "";
    const safety = data.checkoutAvailable === true
      ? `<strong>Payment details stay outside FlipForge.</strong><p>Choosing Collector or Pro asks the authenticated server to prepare a Paddle handoff. The browser never receives a Paddle API key, webhook secret, price ID, tenant ID, or opaque billing reference. Paid access changes only after the verified Paddle webhook.</p>`
      : `<strong>No payment controls are enabled.</strong><p>This workspace cannot process payment, change a plan, create an entitlement, accept evidence, recalculate PSA guidance, or authorize a transaction.</p>`;

    return `<div class="page customer-entitlements-page"><header class="page-heading"><div><span class="eyebrow">Account</span><h1>Plan & Usage</h1><p>Review the server-owned access state, monthly evaluation usage, and verified checkout availability for this tenant.</p></div><div class="page-actions"><button class="button button-secondary" type="button" data-customer-entitlements-refresh ${state.checkoutPlan ? "disabled" : ""}>Refresh</button></div></header><div class="boundary-note"><strong>Billing boundary:</strong> ${escapeHtml(checkoutBoundaryCopy(data))}</div>${checkoutError}<section class="customer-entitlement-summary"><article class="panel customer-entitlement-current"><div class="panel-body"><div class="customer-entitlement-current-head"><div><span class="eyebrow">Current access</span><h2>${escapeHtml(current.name || current.code || "Unavailable")}</h2></div>${activeLabel}</div><dl><div><dt>Access state</dt><dd>${escapeHtml(current.accessState || "Unavailable")}</dd></div><div><dt>Source</dt><dd>${escapeHtml(current.entitlementSource || "Unavailable")}</dd></div><div><dt>Paid plan</dt><dd>${current.paidPlanActive === true ? "Verified active" : "No"}</dd></div><div><dt>Checkout</dt><dd>${data.checkoutAvailable === true ? `${data.sandboxCheckout === true ? "Sandbox" : "Available"} · ${escapeHtml(data.checkoutProvider || "Provider")}` : "Not enabled"}</dd></div></dl></div></article><article class="panel customer-entitlement-usage"><div class="panel-body"><span class="eyebrow">Evaluation usage</span><div class="customer-entitlement-usage-number"><strong>${escapeHtml(usage.completedEvaluations ?? 0)}</strong><span>completed this month</span></div><div class="customer-entitlement-meter"><div><span>In progress reserved</span><strong>${escapeHtml(reservations)}</strong></div><div><span>Admission usage</span><strong>${escapeHtml(admissionUsage)}</strong></div><div><span>Allowance</span><strong>${escapeHtml(numberOrUnlimited(limit))}</strong></div><div class="usage-track" aria-label="Monthly evaluation admission usage"><span style="width:${progress}%"></span></div><div><span>Remaining</span><strong>${escapeHtml(numberOrUnlimited(usage.remainingEvaluations))}</strong></div></div><small>Completed usage plus in-progress reservations governs new-request admission. Failed evaluations release their reservation, and idempotent replays do not consume another slot.</small></div></article></section><section class="panel"><header class="panel-header"><div><h2>Commercial plans</h2><p>Collector and Pro can start checkout only when the authoritative server explicitly enables it.</p></div>${badge(data.checkoutAvailable === true ? (data.sandboxCheckout === true ? "Sandbox checkout enabled" : "Checkout enabled") : "Checkout disabled", data.checkoutAvailable === true ? "warn" : "neutral")}</header><div class="panel-body">${planCards(data.plannedCommercialPlans, data)}</div></section><section class="panel"><div class="panel-body customer-entitlement-safety">${safety}</div></section></div>`;
  }

  function attachActions() {
    if (!state.main) return;
    const refresh = state.main.querySelector("[data-customer-entitlements-refresh]");
    if (refresh) refresh.addEventListener("click", load);
    state.main.querySelectorAll("[data-customer-checkout-plan]").forEach(button => {
      button.addEventListener("click", () => startCheckout(button.getAttribute("data-customer-checkout-plan")));
    });
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

  async function startCheckout(planCode) {
    if (state.checkoutPlan) return;
    const plan = String(planCode || "").trim().toUpperCase();
    state.checkoutPlan = plan;
    state.checkoutError = null;
    renderState();
    try {
      const payload = await checkoutRequest(plan);
      const url = validatedCheckoutUrl(payload?.data?.checkoutUrl);
      if (!url) throw Object.assign(new Error("The checkout URL was not safe to open."), { code: "CUSTOMER_CHECKOUT_URL_INVALID" });
      window.location.assign(url);
    } catch (error) {
      state.checkoutError = error;
      state.checkoutPlan = null;
      renderState();
    }
  }

  async function load() {
    if (!state.main || state.loading || state.checkoutPlan) return;
    state.loading = true;
    state.error = null;
    state.checkoutError = null;
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
    state.checkoutPlan = null;
    state.checkoutError = null;
    state.loading = false;
    load();
  }

  window.FlipForgeCustomerEntitlements = {
    isEligible,
    render
  };
})();
