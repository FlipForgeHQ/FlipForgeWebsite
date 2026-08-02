(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const EVALUATION_PATH = "/api/v1/evaluations";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,100}$/;
  const SAFE_EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;
  const SAFE_OPPORTUNITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
  const ALLOWED_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const DECISIONS = new Set(["BUY", "WATCH", "VERIFY", "PASS"]);
  const MARKETPLACES = Object.freeze([
    "EBAY",
    "COMC",
    "MYSLABS",
    "GOLDIN",
    "HERITAGE",
    "FANATICS_COLLECT",
    "DEALER",
    "CARD_SHOW",
    "FACEBOOK_GROUP",
    "OTHER"
  ]);

  const state = {
    submitting: false,
    result: null,
    error: null,
    idempotencyKey: "",
    payloadFingerprint: "",
    draft: defaultDraft()
  };

  let currentMain = null;
  let currentSurface = "staging";

  function customerSurface() {
    return currentSurface === "customer";
  }

  function savedListRoute() {
    return customerSurface() ? "#/opportunities" : "#/staging";
  }

  function savedDetailRoute(id) {
    const prefix = customerSurface() ? "#/opportunities/" : "#/staging/";
    return `${prefix}${encodeURIComponent(id)}`;
  }

  function defaultDraft() {
    return {
      externalListingId: "",
      marketplace: "EBAY",
      cardIdentity: "",
      listingUrl: "",
      seller: "",
      itemPrice: "",
      shipping: "",
      buyerPremium: "",
      tax: "",
      listingFormat: "",
      endsAt: "",
      acknowledgeBoundary: false
    };
  }

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

  function moneyFromCents(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    }).format(safeNumber(value) / 100);
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `staging-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function newIdempotencyKey() {
    const suffix = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const key = `eval-${suffix}`;
    if (!SAFE_REQUEST_ID.test(key)) throw validationError("IDEMPOTENCY_KEY_INVALID", "A safe staging idempotency key could not be generated.");
    return key;
  }

  function validationError(code, message) {
    const error = new Error(message);
    error.code = code;
    error.status = 400;
    return error;
  }

  function dollarsToCents(value, required, fieldLabel) {
    const text = String(value ?? "").trim();
    if (!text) {
      if (required) throw validationError("EVALUATION_FIELD_REQUIRED", `${fieldLabel} is required.`);
      return 0;
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
      throw validationError("EVALUATION_MONEY_INVALID", `${fieldLabel} must be a non-negative dollar amount with no more than two decimal places.`);
    }
    const [whole, fraction = ""] = text.split(".");
    const cents = (BigInt(whole) * 100n) + BigInt((fraction + "00").slice(0, 2));
    if (cents > 10_000_000_000n) {
      throw validationError("EVALUATION_MONEY_OUT_OF_RANGE", `${fieldLabel} is outside the allowed range.`);
    }
    return Number(cents);
  }

  function validHttpUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
    } catch (_) {
      return false;
    }
  }

  function cleanText(value, fieldLabel, maxLength, required = false) {
    const text = String(value ?? "").trim().replace(/\s+/g, " ");
    if (required && !text) throw validationError("EVALUATION_FIELD_REQUIRED", `${fieldLabel} is required.`);
    if (text.length > maxLength) throw validationError("EVALUATION_FIELD_TOO_LONG", `${fieldLabel} is too long.`);
    return text;
  }

  function payloadFromDraft(draft) {
    const externalListingId = cleanText(draft.externalListingId, "External listing ID", 180, true);
    const marketplace = cleanText(draft.marketplace, "Marketplace", 80, true).toUpperCase();
    if (!MARKETPLACES.includes(marketplace)) {
      throw validationError("EVALUATION_MARKETPLACE_INVALID", "Marketplace is not supported.");
    }
    if (!SAFE_EXTERNAL_ID.test(externalListingId)) {
      throw validationError("EVALUATION_LISTING_ID_INVALID", "External listing ID must use only letters, numbers, periods, underscores, colons, or hyphens.");
    }
    const opportunityId = `${marketplace}-${externalListingId}`;
    if (!SAFE_OPPORTUNITY_ID.test(opportunityId)) {
      throw validationError("EVALUATION_LISTING_ID_INVALID", "Marketplace and external listing ID do not produce a safe saved opportunity ID.");
    }

    const cardIdentity = cleanText(draft.cardIdentity, "Card identity", 500, true);
    const listingUrl = cleanText(draft.listingUrl, "Listing URL", 2048, true);
    if (!validHttpUrl(listingUrl)) {
      throw validationError("EVALUATION_URL_INVALID", "Listing URL must be a valid HTTP or HTTPS URL.");
    }
    if (draft.acknowledgeBoundary !== true) {
      throw validationError("EVALUATION_BOUNDARY_ACKNOWLEDGMENT_REQUIRED", "Confirm the staging authority boundary before submitting.");
    }

    return {
      externalListingId,
      marketplace,
      cardIdentity,
      listingUrl,
      seller: cleanText(draft.seller, "Seller", 300),
      itemPriceCents: dollarsToCents(draft.itemPrice, true, "Item price"),
      shippingCents: dollarsToCents(draft.shipping, false, "Shipping"),
      buyerPremiumCents: dollarsToCents(draft.buyerPremium, false, "Buyer premium"),
      taxCents: dollarsToCents(draft.tax, false, "Tax"),
      listingFormat: cleanText(draft.listingFormat, "Listing format", 100),
      endsAt: cleanText(draft.endsAt, "Ends at", 100)
    };
  }

  function validEnvelope(payload, expectedCorrelationId, expectedRequestId) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    const meta = payload.meta;
    const data = payload.data;
    const decision = data && data.decision;
    const isolation = data && data.tenantIsolation;
    return Boolean(meta && data && decision && isolation)
      && meta.contractVersion === CONTRACT_VERSION
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId
      && data.kind === "evaluation"
      && data.requestId === expectedRequestId
      && SAFE_OPPORTUNITY_ID.test(String(data.opportunityId || ""))
      && data.persistedToSqlite === true
      && data.tenantOwned === true
      && data.requestCanVerifyEvidence === false
      && data.requestCanVerifyIdentity === false
      && data.evidenceAcceptedByRequest === false
      && data.psaRecalculated === false
      && data.transactionAuthorized === false
      && data.providerCredentialsExposed === false
      && DECISIONS.has(String(decision.recommendation || "").toUpperCase())
      && isolation.enforced === true
      && isolation.idempotencyScope === "TENANT"
      && isolation.opportunityOwnership === "GRANTED_ON_COMPLETION"
      && isolation.defaultAccess === "DENY";
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

  async function submitEvaluation(payload, idempotencyKey) {
    if (!eligibleHost()) throw validationError("STAGING_HOST_NOT_ALLOWED", "Staging evaluation is restricted to deploy previews and local development.");
    if (!SAFE_REQUEST_ID.test(idempotencyKey)) throw validationError("IDEMPOTENCY_KEY_INVALID", "The staging idempotency key is invalid.");

    const requestCorrelationId = correlationId();
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "X-Correlation-Id": requestCorrelationId,
      "Idempotency-Key": idempotencyKey
    };

    const response = await fetch(EVALUATION_PATH, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const responsePayload = await parseResponse(response);
    if (!response.ok) {
      const upstream = responsePayload && responsePayload.error ? responsePayload.error : {};
      const error = new Error(upstream.message || `Staging evaluation failed with status ${response.status}.`);
      error.code = upstream.code || "STAGING_EVALUATION_FAILED";
      error.status = response.status;
      error.correlationId = upstream.correlationId || requestCorrelationId;
      throw error;
    }
    if (!validEnvelope(responsePayload, requestCorrelationId, idempotencyKey)) {
      const error = new Error("The staging evaluation response failed the FlipForge authority and tenant-ownership contract.");
      error.code = "STAGING_EVALUATION_CONTRACT_INVALID";
      throw error;
    }
    return responsePayload;
  }

  function readDraft(form) {
    const data = new FormData(form);
    return {
      externalListingId: data.get("externalListingId") || "",
      marketplace: data.get("marketplace") || "OTHER",
      cardIdentity: data.get("cardIdentity") || "",
      listingUrl: data.get("listingUrl") || "",
      seller: data.get("seller") || "",
      itemPrice: data.get("itemPrice") || "",
      shipping: data.get("shipping") || "",
      buyerPremium: data.get("buyerPremium") || "",
      tax: data.get("tax") || "",
      listingFormat: data.get("listingFormat") || "",
      endsAt: data.get("endsAt") || "",
      acknowledgeBoundary: data.get("acknowledgeBoundary") === "yes"
    };
  }

  async function handleSubmit(form) {
    state.draft = readDraft(form);
    state.error = null;
    state.result = null;
    let payload;
    try {
      payload = payloadFromDraft(state.draft);
    } catch (error) {
      state.error = error;
      renderCurrent();
      return;
    }

    const fingerprint = JSON.stringify(payload);
    if (!state.idempotencyKey || state.payloadFingerprint !== fingerprint) {
      state.idempotencyKey = newIdempotencyKey();
      state.payloadFingerprint = fingerprint;
    }

    state.submitting = true;
    renderCurrent();
    try {
      state.result = await submitEvaluation(payload, state.idempotencyKey);
    } catch (error) {
      state.error = error;
    } finally {
      state.submitting = false;
      renderCurrent();
    }
  }

  function errorPanel(error) {
    if (!error) return "";
    const guidance = error.status === 401
      ? "A configured authentication provider and signed-in preview user are required."
      : error.status === 403
        ? "The signed-in preview user does not have an active tenant membership."
        : error.code === "IDEMPOTENCY_CONFLICT"
          ? "Change the request fields or retry the unchanged request with its existing key."
          : "No mock result or browser-generated recommendation has been substituted.";
    return `<section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error.code || "STAGING_EVALUATION_UNAVAILABLE")}</strong><p>${escapeHtml(error.message)}</p><small>${escapeHtml(guidance)}</small></div></section>`;
  }

  function field(name, label, options = {}) {
    const value = state.draft[name] ?? "";
    const type = options.type || "text";
    const required = options.required ? " required" : "";
    const maxLength = options.maxLength ? ` maxlength="${options.maxLength}"` : "";
    const inputMode = options.inputMode ? ` inputmode="${options.inputMode}"` : "";
    const placeholder = options.placeholder ? ` placeholder="${escapeHtml(options.placeholder)}"` : "";
    const hint = options.hint ? `<small>${escapeHtml(options.hint)}</small>` : "";
    return `<label class="staging-field"><span>${escapeHtml(label)}${options.required ? " *" : ""}</span><input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}"${required}${maxLength}${inputMode}${placeholder} autocomplete="off">${hint}</label>`;
  }

  function evaluationForm() {
    const marketplaceOptions = MARKETPLACES.map(value => `<option value="${value}"${state.draft.marketplace === value ? " selected" : ""}>${value.replaceAll("_", " ")}</option>`).join("");
    const heading = customerSurface() ? "Evaluate and track a card" : "Submit a staging evaluation";
    const description = customerSurface()
      ? "Enter the listing, exact card identity, and complete acquisition cost. The existing Smart Opportunity service returns and saves the decision."
      : "Creates one tenant-owned saved evaluation through the existing Smart Opportunity service.";
    const submitLabel = customerSurface() ? "Evaluate and save" : "Submit staging evaluation";
    const listLabel = customerSurface() ? "View tracked cards" : "View saved staging data";
    const boundaryCopy = customerSurface()
      ? "I understand FlipForge provides decision support. This request does not verify evidence or identity, predict a grade, authorize a bid or purchase, or call a marketplace provider."
      : "I understand this is staging decision support. It does not verify evidence or identity, predict a grade, authorize a bid or purchase, or call a marketplace provider.";
    return `<section class="panel staging-evaluation-panel"><header class="panel-header"><div><h2>${heading}</h2><p>${description}</p></div><span class="staging-status staging-status-verify">Write boundary</span></header><form class="panel-body staging-evaluation-form" data-staging-evaluation-form novalidate><div class="customer-intake-step"><span>1</span><div><strong>Listing and exact card identity</strong><small>Describe the specific card and the listing you are considering.</small></div></div><div class="staging-form-grid">${field("externalListingId", "External listing ID", { required: true, maxLength: 180, placeholder: "e.g. 123456789012" })}<label class="staging-field"><span>Marketplace *</span><select name="marketplace" required>${marketplaceOptions}</select><small>Used to form the tenant-owned saved opportunity ID.</small></label><label class="staging-field staging-field-wide"><span>Exact card identity *</span><textarea name="cardIdentity" required maxlength="500" rows="3" placeholder="Year, set, player, card number, parallel, grade/condition">${escapeHtml(state.draft.cardIdentity)}</textarea><small>Identity remains NEEDS_VERIFICATION; this request cannot verify it.</small></label>${field("listingUrl", "Listing URL", { required: true, type: "url", maxLength: 2048, placeholder: "https://..." })}${field("seller", "Seller", { maxLength: 300, placeholder: "Optional" })}</div><div class="customer-intake-step"><span>2</span><div><strong>Complete acquisition cost</strong><small>Include every known cost so the authoritative service receives the real all-in ask.</small></div></div><div class="staging-form-grid">${field("itemPrice", "Item price", { required: true, inputMode: "decimal", placeholder: "0.00" })}${field("shipping", "Shipping", { inputMode: "decimal", placeholder: "0.00" })}${field("buyerPremium", "Buyer premium", { inputMode: "decimal", placeholder: "0.00" })}${field("tax", "Tax", { inputMode: "decimal", placeholder: "0.00" })}${field("listingFormat", "Listing format", { maxLength: 100, placeholder: "Fixed price, auction, offer..." })}${field("endsAt", "Ends at", { maxLength: 100, placeholder: "Optional ISO timestamp" })}</div><div class="customer-intake-step"><span>3</span><div><strong>Confirm the authority boundary</strong><small>The browser submits facts; it never chooses the recommendation.</small></div></div><label class="staging-boundary-check"><input type="checkbox" name="acknowledgeBoundary" value="yes"${state.draft.acknowledgeBoundary ? " checked" : ""}><span>${boundaryCopy}</span></label><div class="staging-form-actions"><a class="button button-secondary" href="${savedListRoute()}">${listLabel}</a><button class="button button-primary" type="submit"${state.submitting ? " disabled" : ""}>${state.submitting ? "Evaluating…" : submitLabel}</button></div><small class="staging-form-note">An idempotency key is generated and held only in memory. Retrying an unchanged form reuses that key; changing the payload generates a new key.</small></form></section>`;
  }

  function resultPanel() {
    const data = state.result && state.result.data;
    if (!data) return "";
    const decision = data.decision || {};
    const values = [
      ["Decision", decision.recommendation || "UNKNOWN"],
      ["Supported value", moneyFromCents(decision.supportedValueCents)],
      ["Trusted exact comps", safeNumber(decision.exactTrustedCompCount)],
      ["Confidence", `${safeNumber(decision.confidence)}/100`],
      ["Risk", `${safeNumber(decision.risk)}/100`],
      ["Workflow status", decision.workflowStatus || "UNKNOWN"],
      ["All-in acquisition", moneyFromCents(data.normalizedRequest?.allInAskCents)],
      ["Tenant owned", data.tenantOwned === true ? "Yes" : "No"],
      ["Idempotent replay", data.idempotentReplay === true ? "Yes" : "No"]
    ];
    const opportunityId = String(data.opportunityId || "");
    const canOpen = SAFE_OPPORTUNITY_ID.test(opportunityId);
    const resultTitle = customerSurface() ? "Authoritative decision saved" : "Authoritative staging result";
    const resultDescription = customerSurface()
      ? "The result is now a tenant-owned tracked record with its evidence and PSA context available in Card Intelligence."
      : "Saved exactly through the existing Smart Opportunity and tenant ownership boundary.";
    const openLabel = customerSurface() ? "Open Card Intelligence" : "Open saved record";
    const returnLabel = customerSurface() ? "Tracked cards" : "Return to staging list";
    return `<section class="panel staging-evaluation-result" aria-live="polite"><header class="panel-header"><div><h2>${resultTitle}</h2><p>${resultDescription}</p></div><span class="staging-status staging-status-${escapeHtml(String(decision.recommendation || "unknown").toLowerCase())}">${escapeHtml(decision.recommendation || "UNKNOWN")}</span></header><div class="panel-body"><div class="staging-key-grid">${values.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div><div class="staging-result-copy"><p><strong>Reason:</strong> ${escapeHtml(decision.reason || "No reason returned.")}</p><p><strong>Missing requirement:</strong> ${escapeHtml(decision.missingRequirement || "None returned.")}</p><p><strong>Next action:</strong> ${escapeHtml(decision.nextAction || "No next action returned.")}</p><p><strong>Saved opportunity ID:</strong> ${escapeHtml(opportunityId)}</p></div><div class="boundary-note"><strong>Authority result:</strong> This response persisted to SQLite and granted tenant ownership. It did not verify evidence or identity, recalculate PSA guidance, expose credentials, or authorize a transaction.</div>${canOpen ? `<div class="staging-form-actions"><a class="button button-secondary" href="${savedListRoute()}">${returnLabel}</a><a class="button button-primary" href="${savedDetailRoute(opportunityId)}">${openLabel}</a></div>` : ""}</div></section>`;
  }

  function renderCurrent() {
    if (!currentMain) return;
    const eyebrow = customerSurface() ? "Guided customer intake" : "Controlled deploy-preview write integration";
    const title = customerSurface() ? "Evaluate a Card" : "Staging Evaluation";
    const description = customerSurface()
      ? "Give FlipForge the listing facts and complete acquisition cost. The existing backend returns, saves, and tracks the governed decision."
      : "Submit one authenticated, tenant-scoped manual opportunity to the authoritative FlipForge evaluation endpoint.";
    const action = customerSurface() ? "Tracked opportunities" : "Staging data";
    currentMain.innerHTML = `<div class="page staging-page staging-evaluation-page customer-evaluation-page"><header class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div><div class="page-actions"><a class="button button-secondary" href="${savedListRoute()}">${action}</a></div></header><div class="boundary-note"><strong>Write boundary:</strong> Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. Existing PSA intelligence remains the grading-guidance authority. This screen cannot accept evidence, verify identity, predict a grade, or authorize any transaction.</div>${errorPanel(state.error)}${evaluationForm()}${resultPanel()}</div>`;
    bindActions();
  }

  function bindActions() {
    if (!currentMain) return;
    const form = currentMain.querySelector("[data-staging-evaluation-form]");
    if (!form) return;
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!state.submitting) handleSubmit(form);
    });
  }

  function render(main) {
    currentSurface = "staging";
    currentMain = main;
    if (!eligibleHost()) {
      main.innerHTML = `<div class="page"><header class="page-heading"><div><span class="eyebrow">Unavailable route</span><h1>Staging Evaluation</h1><p>This write route is restricted to deploy previews and local development.</p></div></header><div class="boundary-note">The production website cannot submit evaluations through this staging adapter.</div></div>`;
      return;
    }
    renderCurrent();
  }

  function renderCustomer(main) {
    currentSurface = "customer";
    currentMain = main;
    if (!eligibleHost()) return false;
    renderCurrent();
    return true;
  }

  function reset() {
    state.submitting = false;
    state.result = null;
    state.error = null;
    state.idempotencyKey = "";
    state.payloadFingerprint = "";
    state.draft = defaultDraft();
    renderCurrent();
  }

  const navLink = document.querySelector("[data-route='staging-evaluate']");
  if (navLink && eligibleHost()) navLink.hidden = false;

  window.FlipForgeStagingEvaluationAdapter = Object.freeze({
    isEligible: eligibleHost,
    render,
    renderCustomer,
    reset
  });
})();
