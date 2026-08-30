(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const DISCOVER_PATH = "/api/v1/discover";
  const EVALUATION_PATH = "/api/v1/evaluations";
  const CARD_INTELLIGENCE_SEARCH_PATH = "/api/v1/card-intelligence/search";
  const CARD_INTELLIGENCE_RESOLVE_PATH = "/api/v1/card-intelligence/resolve";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const MAX_COST_CENTS = 10_000_000_000;
  const SAFE_EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:|\-]{0,199}$/;
  const SAFE_OPPORTUNITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
  const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,100}$/;
  const SAFE_SELECTION_TOKEN = /^[0-9a-f]{64}$/i;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const MARKETPLACES = new Set(["EBAY", "COMC", "MYSLABS", "GOLDIN", "HERITAGE", "FANATICS_COLLECT", "DEALER", "CARD_SHOW", "FACEBOOK_GROUP", "OTHER"]);
  const DECISIONS = new Set(["BUY", "WATCH", "VERIFY", "PASS"]);

  const state = {
    main: null,
    health: null,
    data: null,
    loading: false,
    evaluatingIndex: -1,
    error: null,
    notice: "",
    evaluationKeys: new Map(),
    draft: { exactCardQuery: "", targetMaxBuy: "", limit: "25" },
    identityAssist: {
      active: false,
      busy: false,
      query: "",
      results: [],
      message: ""
    }
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
    return `discover-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function newIdempotencyKey() {
    const suffix = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const value = `discover-eval-${suffix}`;
    if (!SAFE_REQUEST_ID.test(value)) throw makeError("IDEMPOTENCY_KEY_INVALID", "A safe evaluation request ID could not be generated.", 400);
    return value;
  }

  function makeError(code, message, status = 0) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
  }

  function moneyFromCents(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
      .format((Number(value) || 0) / 100);
  }

  function targetToCents(value) {
    const text = String(value ?? "").trim();
    if (!text) return 0;
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
      throw makeError("DISCOVER_TARGET_INVALID", "Target max buy must be a non-negative dollar amount with no more than two decimals.", 400);
    }
    const [whole, fraction = ""] = text.split(".");
    const cents = (BigInt(whole) * 100n) + BigInt((fraction + "00").slice(0, 2));
    if (cents > BigInt(MAX_COST_CENTS)) throw makeError("DISCOVER_TARGET_INVALID", "Target max buy is outside the allowed range.", 400);
    return Number(cents);
  }

  function validHttpUrl(value) {
    try {
      const parsed = new URL(String(value || ""));
      return (parsed.protocol === "https:" || parsed.protocol === "http:") && Boolean(parsed.hostname);
    } catch (_) {
      return false;
    }
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) throw makeError("DISCOVER_RESPONSE_TOO_LARGE", "The FlipForge response exceeded the browser safety limit.");
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw makeError("DISCOVER_INVALID_JSON", "The FlipForge gateway returned invalid JSON.");
    }
  }

  function validMeta(payload, expectedCorrelationId) {
    const meta = payload?.meta;
    return Boolean(meta)
      && meta.contractVersion === CONTRACT_VERSION
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId;
  }

  function validateDiscover(payload, expectedCorrelationId) {
    if (!validMeta(payload, expectedCorrelationId)) return false;
    const data = payload.data;
    const isolation = data?.tenantIsolation;
    if (!data || data.kind !== "discover" || data.readOnly !== true || !Array.isArray(data.items)) return false;
    if (data.discoveryPersisted !== false || data.evaluationRequiredToSave !== true) return false;
    if (data.activeListingsAreCompletedSaleEvidence !== false || data.transactionAuthority !== false) return false;
    if (data.tenantOwnedPersistenceCreated !== false || data.tenantOwnershipCreatedOnlyByEvaluation !== true) return false;
    if (!isolation || isolation.enforced !== true || isolation.defaultAccess !== "DENY") return false;
    const provider = data.provider;
    if (!provider || provider.providerCredentialsExposed !== false || provider.customerCanConfigureProvider !== false || Object.prototype.hasOwnProperty.call(provider, "action")) return false;
    return data.items.every(item => item
      && item.activeListingOnly === true
      && item.completedSaleEvidence === false
      && item.transactionAuthority === false
      && !Object.prototype.hasOwnProperty.call(item, "recommendation"));
  }

  function validateCardIntelligence(payload, expectedCorrelationId) {
    if (!validMeta(payload, expectedCorrelationId)) return false;
    const data = payload?.data;
    return Boolean(data)
      && data.transactionAuthority === false
      && data.providerIdentifierExposed === false
      && data.rawProviderPayloadExposed === false
      && data.providerPayloadPersisted === false
      && data.soldEvidenceAccepted === false
      && data.smartOpportunityRecalculated === false;
  }

  function validateEvaluation(payload, expectedCorrelationId, expectedRequestId) {
    if (!validMeta(payload, expectedCorrelationId)) return false;
    const data = payload.data;
    const decision = data?.decision;
    const isolation = data?.tenantIsolation;
    return Boolean(data && decision && isolation)
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

  async function request(path, { method = "GET", body = null, idempotencyKey = "" } = {}) {
    const requestCorrelationId = correlationId();
    const headers = { Accept: "application/json", "X-Correlation-Id": requestCorrelationId };
    if (body !== null) headers["Content-Type"] = "application/json; charset=utf-8";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const response = await fetch(path, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw makeError(upstream.code || "DISCOVER_REQUEST_FAILED", upstream.message || `FlipForge request failed with status ${response.status}.`, response.status);
    }
    return { payload, correlationId: requestCorrelationId };
  }

  async function cardIntelligenceRequest(path, body) {
    const result = await request(path, { method: "POST", body });
    if (!validateCardIntelligence(result.payload, result.correlationId)) {
      throw makeError("CARD_INTELLIGENCE_CONTRACT_INVALID", "The identity-assist response failed the FlipForge authority boundary.");
    }
    return result.payload.data;
  }

  function hasExplicitCardNumber(query) {
    const value = String(query || "");
    return /#\s*[A-Za-z0-9][A-Za-z0-9.-]*/.test(value)
      || /\bNO\.?\s*(?=[A-Za-z0-9.-]*\d)[A-Za-z0-9][A-Za-z0-9.-]*\b/i.test(value)
      || /\b(?:[A-Za-z]{1,6}[-.]?)?\d{1,5}[A-Za-z]?\s+(?:PSA|BGS|SGC|CGC|CSG|TAG|BCCG)\s*(?:10|9\.5|9|8\.5|8|7\.5|7|6\.5|6)?\b/i.test(value);
  }

  function declaredGradeContext(query) {
    const match = String(query || "").match(/\b(PSA|BGS|SGC|CGC|CSG|TAG|BCCG)\s*(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6)\b/i);
    return match ? { grader: match[1].toUpperCase(), grade: match[2] } : { grader: "", grade: "" };
  }

  function readSearch(form) {
    const values = new FormData(form);
    const exactCardQuery = String(values.get("exactCardQuery") || "").trim().replace(/\s+/g, " ");
    if (!exactCardQuery || exactCardQuery.length > 500) throw makeError("DISCOVER_QUERY_INVALID", "Enter a card identity of 500 characters or fewer.", 400);
    const limit = Number.parseInt(String(values.get("limit") || "25"), 10);
    if (![10, 25, 50].includes(limit)) throw makeError("DISCOVER_LIMIT_INVALID", "Result limit must be 10, 25, or 50.", 400);
    const targetMaxBuy = String(values.get("targetMaxBuy") || "").trim();
    return { exactCardQuery, targetMaxBuy, limit, targetMaxBuyCents: targetToCents(targetMaxBuy) };
  }

  function safeEvaluationRequest(item) {
    if (!item
      || item.evaluationEligible !== true
      || String(item.matchQuality || "") !== "EXACT_MATCH"
      || !item.evaluationRequest
      || typeof item.evaluationRequest !== "object") {
      throw makeError("DISCOVER_EVALUATION_NOT_ELIGIBLE", item?.evaluationBlockReason || "Exact listing identity and complete current cost are required before authoritative evaluation.", 400);
    }
    const source = item.evaluationRequest;
    const externalListingId = String(source.externalListingId || "").trim();
    const marketplace = String(source.marketplace || "").trim().toUpperCase();
    const cardIdentity = String(source.cardIdentity || "").trim().replace(/\s+/g, " ");
    const listingUrl = String(source.listingUrl || "").trim();
    const seller = String(source.seller || "").trim().slice(0, 300);
    const listingFormat = String(source.listingFormat || "").trim().slice(0, 100);
    if (!SAFE_EXTERNAL_ID.test(externalListingId)) throw makeError("DISCOVER_EVALUATION_INVALID", "The listing ID is not safe for evaluation.", 400);
    if (!MARKETPLACES.has(marketplace)) throw makeError("DISCOVER_EVALUATION_INVALID", "The marketplace is not supported for evaluation.", 400);
    if (!cardIdentity || cardIdentity.length > 500) throw makeError("DISCOVER_EVALUATION_INVALID", "The card identity is not valid for evaluation.", 400);
    if (!validHttpUrl(listingUrl) || listingUrl.length > 2048) throw makeError("DISCOVER_EVALUATION_INVALID", "The listing URL is not valid for evaluation.", 400);
    const cents = name => {
      const value = Number(source[name]);
      if (!Number.isSafeInteger(value) || value < 0 || value > MAX_COST_CENTS) throw makeError("DISCOVER_EVALUATION_INVALID", `${name} is invalid.`, 400);
      return value;
    };
    const itemPriceCents = cents("itemPriceCents");
    if (itemPriceCents <= 0) throw makeError("DISCOVER_EVALUATION_INVALID", "Item price must be greater than zero.", 400);
    return {
      externalListingId,
      marketplace,
      cardIdentity,
      listingUrl,
      seller,
      itemPriceCents,
      shippingCents: cents("shippingCents"),
      buyerPremiumCents: cents("buyerPremiumCents"),
      taxCents: cents("taxCents"),
      listingFormat
    };
  }

  function idempotencyKeyFor(payload) {
    const fingerprint = JSON.stringify(payload);
    let requestId = state.evaluationKeys.get(fingerprint);
    if (!requestId) {
      requestId = newIdempotencyKey();
      state.evaluationKeys.set(fingerprint, requestId);
    }
    return requestId;
  }

  async function loadHealth() {
    const result = await request("/api/v1/health");
    const meta = result.payload?.meta;
    const data = result.payload?.data;
    if (!meta || meta.contractVersion !== CONTRACT_VERSION || meta.correlationId !== result.correlationId || !data) {
      throw makeError("DISCOVER_HEALTH_INVALID", "The gateway health response failed its contract.");
    }
    state.health = data;
  }

  async function runDiscover(draft) {
    state.error = null;
    state.notice = "";
    state.data = null;
    state.loading = true;
    renderCurrent();
    try {
      const result = await request(DISCOVER_PATH, {
        method: "POST",
        body: { exactCardQuery: draft.exactCardQuery, limit: draft.limit, targetMaxBuyCents: draft.targetMaxBuyCents }
      });
      if (!validateDiscover(result.payload, result.correlationId)) throw makeError("DISCOVER_CONTRACT_INVALID", "The provider-backed Discover response failed the FlipForge authority, evidence, or tenant contract.");
      state.data = result.payload.data;
      const returnedItems = Array.isArray(state.data.items) ? state.data.items : [];
      const exactCandidateCount = Number.isInteger(state.data.exactCandidateCount)
        ? state.data.exactCandidateCount
        : returnedItems.filter(item => String(item?.matchQuality || "") === "EXACT_MATCH").length;
      const identityReviewCandidateCount = Number.isInteger(state.data.identityReviewCandidateCount)
        ? state.data.identityReviewCandidateCount
        : Math.max(0, returnedItems.length - exactCandidateCount);
      state.notice = exactCandidateCount
        ? `${exactCandidateCount} exact active candidate${exactCandidateCount === 1 ? "" : "s"} returned from currently connected sources.`
        : identityReviewCandidateCount
          ? `No exact active listing matched. ${identityReviewCandidateCount} provider result${identityReviewCandidateCount === 1 ? " was" : "s were"} withheld for identity review.`
          : state.data.provider?.available === false
            ? "The authorized active-listing provider is not connected for this runtime. No sample results were substituted."
            : "No active candidates matched this exact-card search.";
      if (state.data.candidateCount > 0) {
        state.draft = { exactCardQuery: "", targetMaxBuy: "", limit: String(draft.limit) };
      }
    } catch (error) {
      state.error = error;
    } finally {
      state.loading = false;
      renderCurrent();
    }
  }

  async function suggestIdentity(draft) {
    state.error = null;
    state.notice = "";
    state.data = null;
    state.identityAssist.active = true;
    state.identityAssist.busy = true;
    state.identityAssist.query = draft.exactCardQuery;
    state.identityAssist.results = [];
    state.identityAssist.message = "Looking for exact catalog identities…";
    renderCurrent();
    try {
      const data = await cardIntelligenceRequest(CARD_INTELLIGENCE_SEARCH_PATH, {
        query: draft.exactCardQuery,
        limit: 12
      });
      state.identityAssist.results = Array.isArray(data.results) ? data.results : [];
      const selectableCount = state.identityAssist.results.filter(row => row
        && row.exactCardCandidate === true
        && SAFE_SELECTION_TOKEN.test(String(row.selectionToken || ""))).length;
      state.identityAssist.message = selectableCount > 0
        ? `${selectableCount} verified card option${selectableCount === 1 ? "" : "s"} can be selected. FlipForge will not choose one for you.`
        : "No selectable exact identity was returned. Add a year, set, player, card number, or parallel and try again.";
    } catch (error) {
      state.error = error;
      state.identityAssist.message = "";
    } finally {
      state.identityAssist.busy = false;
      renderCurrent();
    }
  }

  async function search(form) {
    state.error = null;
    state.notice = "";
    state.data = null;
    let draft;
    try {
      draft = readSearch(form);
    } catch (error) {
      state.error = error;
      renderCurrent();
      return;
    }
    state.draft = { exactCardQuery: draft.exactCardQuery, targetMaxBuy: draft.targetMaxBuy, limit: String(draft.limit) };
    state.identityAssist.active = false;
    state.identityAssist.results = [];
    state.identityAssist.message = "";

    if (!hasExplicitCardNumber(draft.exactCardQuery)) {
      await suggestIdentity(draft);
      return;
    }
    await runDiscover(draft);
  }

  async function findExactCard(form) {
    let draft;
    try {
      draft = readSearch(form);
    } catch (error) {
      state.error = error;
      renderCurrent();
      return;
    }
    state.draft = { exactCardQuery: draft.exactCardQuery, targetMaxBuy: draft.targetMaxBuy, limit: String(draft.limit) };
    await suggestIdentity(draft);
  }

  async function resolveIdentity(index) {
    const row = state.identityAssist.results[Number(index)];
    const token = String(row?.selectionToken || "");
    if (!row || row.exactCardCandidate !== true || !SAFE_SELECTION_TOKEN.test(token)) return;

    state.error = null;
    state.notice = "";
    state.identityAssist.busy = true;
    state.identityAssist.message = "Re-verifying the selected exact card…";
    renderCurrent();

    try {
      const data = await cardIntelligenceRequest(CARD_INTELLIGENCE_RESOLVE_PATH, { selectionToken: token });
      const cardIdentity = String(data.cardIdentity || "").trim().replace(/\s+/g, " ");
      if (data.readyForEvaluation !== true || !cardIdentity || cardIdentity.length > 500 || !hasExplicitCardNumber(cardIdentity)) {
        throw makeError("CARD_INTELLIGENCE_SELECTION_NOT_READY", data.message || "The selected card still needs exact identity verification.", 400);
      }

      const draft = {
        exactCardQuery: cardIdentity,
        targetMaxBuy: state.draft.targetMaxBuy,
        limit: Number.parseInt(state.draft.limit, 10),
        targetMaxBuyCents: targetToCents(state.draft.targetMaxBuy)
      };
      state.draft.exactCardQuery = cardIdentity;
      state.identityAssist.active = false;
      state.identityAssist.results = [];
      state.identityAssist.message = "";
      state.identityAssist.busy = false;
      state.notice = "Exact card confirmed. Searching connected sources with the canonical identity.";
      renderCurrent();
      await runDiscover(draft);
    } catch (error) {
      state.error = error;
      state.identityAssist.busy = false;
      renderCurrent();
    }
  }

  async function evaluate(index) {
    if (!state.data || !Array.isArray(state.data.items)) return;
    const item = state.data.items[index];
    state.error = null;
    state.notice = "";
    state.evaluatingIndex = index;
    renderCurrent();
    try {
      const payload = safeEvaluationRequest(item);
      const requestId = idempotencyKeyFor(payload);
      const result = await request(EVALUATION_PATH, { method: "POST", body: payload, idempotencyKey: requestId });
      if (!validateEvaluation(result.payload, result.correlationId, requestId)) throw makeError("DISCOVER_EVALUATION_CONTRACT_INVALID", "The authoritative evaluation response failed the tenant-owned Smart Opportunity contract.");
      state.evaluatingIndex = -1;
      window.location.hash = `#/opportunities/${encodeURIComponent(result.payload.data.opportunityId)}`;
    } catch (error) {
      state.error = error;
      state.evaluatingIndex = -1;
      renderCurrent();
    }
  }

  function errorPanel() {
    if (!state.error) return "";
    const guidance = state.error.status === 401
      ? "Sign in with an invited private-beta account."
      : state.error.status === 403
        ? "The signed-in account needs an active FlipForge tenant membership."
        : "No mock listing, browser recommendation, or partial evaluation was substituted.";
    return `<section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(state.error.code || "DISCOVER_UNAVAILABLE")}</strong><p>${escapeHtml(state.error.message)}</p><small>${escapeHtml(guidance)}</small></div></section>`;
  }

  function searchPanel() {
    const busy = state.loading || state.identityAssist.busy;
    return `<section class="panel customer-discovery-search"><header class="panel-header"><div><h2>Search connected active listings</h2><p>Enter the card identity you know. Exact identities search immediately; incomplete identities are resolved to selectable catalog options before any marketplace search runs.</p></div></header><div class="panel-body"><form data-customer-discovery-form class="customer-discovery-form"><label><span>Card identity</span><input name="exactCardQuery" type="search" maxlength="500" required value="${escapeHtml(state.draft.exactCardQuery)}" placeholder="2018 Topps Chrome Shohei Ohtani #150 PSA 9" autocomplete="off"></label><label><span>Target max buy</span><input name="targetMaxBuy" type="text" inputmode="decimal" value="${escapeHtml(state.draft.targetMaxBuy)}" placeholder="Optional, e.g. 525.00" autocomplete="off"></label><label><span>Results</span><select name="limit">${[10,25,50].map(value => `<option value="${value}"${String(value) === state.draft.limit ? " selected" : ""}>${value}</option>`).join("")}</select></label><div class="customer-discovery-search-actions"><button class="button button-primary" type="submit" ${busy ? "disabled" : ""}>${state.loading ? "Searching…" : state.identityAssist.busy ? "Resolving…" : "Search connected sources"}</button><button class="button button-secondary" type="button" data-discovery-find-exact ${busy ? "disabled" : ""}>Find exact card</button></div></form><small class="customer-discovery-search-help">Examples: <strong>#150</strong>, <strong>No. 150</strong>, and <strong>No 150</strong> are treated as the same card-number notation. FlipForge never silently chooses among multiple identities.</small></div></section>`;
  }

  function identityCandidate(row, index) {
    const declaredGrade = declaredGradeContext(state.identityAssist.query);
    const grader = row.grader || declaredGrade.grader;
    const grade = row.grade || declaredGrade.grade;
    const gradeLabel = grader && grade ? `${grader} ${grade}${row.grader || row.grade ? "" : " (entered)"}` : "";
    const detail = [
      row.year,
      row.manufacturer,
      row.releaseName,
      row.setName,
      row.cardNumber ? `#${row.cardNumber}` : "",
      row.parallelName,
      gradeLabel
    ].filter(Boolean).join(" · ");
    const selectable = row?.exactCardCandidate === true && SAFE_SELECTION_TOKEN.test(String(row.selectionToken || ""));
    return `<article class="customer-discovery-identity-option"><div><strong>${escapeHtml(row.name || "Card identity candidate")}</strong><small>${escapeHtml(detail || row.type || "Catalog candidate")}</small></div>${selectable ? `<button class="button button-primary" type="button" data-discovery-use-identity="${index}" ${state.identityAssist.busy ? "disabled" : ""}>Use this card</button>` : `<span class="staging-status staging-status-verify">Review only</span>`}</article>`;
  }

  function identityAssistPanel() {
    if (!state.identityAssist.active) return "";
    const rows = Array.isArray(state.identityAssist.results) ? state.identityAssist.results : [];
    return `<section class="panel customer-discovery-identity-assist" aria-label="Card identity options"><header class="panel-header"><div><span class="eyebrow">Card Intelligence identity assist</span><h2>Which card did you mean?</h2><p>Choose only if the card is correct. The selection token is re-verified server-side before the exact identity is allowed into Discover.</p></div></header><div class="panel-body">${state.identityAssist.message ? `<div class="customer-discovery-identity-message" role="status">${escapeHtml(state.identityAssist.message)}</div>` : ""}${rows.length ? `<div class="customer-discovery-identity-options">${rows.map(identityCandidate).join("")}</div>` : ""}<div class="boundary-note"><strong>Fail-closed identity boundary:</strong> FlipForge does not auto-select the first result, expose provider IDs, or run marketplace discovery until you explicitly choose a server-authorized exact candidate.</div></div></section>`;
  }

  function providerPanel() {
    if (!state.data) return "";
    const provider = state.data.provider || {};
    const tone = provider.available ? "ok" : "warn";
    const items = Array.isArray(state.data.items) ? state.data.items : [];
    const exactCandidateCount = Number.isInteger(state.data.exactCandidateCount)
      ? state.data.exactCandidateCount
      : items.filter(item => String(item?.matchQuality || "") === "EXACT_MATCH").length;
    const identityReviewCandidateCount = Number.isInteger(state.data.identityReviewCandidateCount)
      ? state.data.identityReviewCandidateCount
      : Math.max(0, items.length - exactCandidateCount);
    const reviewNote = identityReviewCandidateCount
      ? `<small>${identityReviewCandidateCount} additional provider result${identityReviewCandidateCount === 1 ? "" : "s"} withheld from exact ranking for identity review.</small>`
      : "";
    return `<section class="panel"><header class="panel-header"><div><h2>Connected source status</h2><p>${escapeHtml(provider.status || "Provider status unavailable.")}</p></div><span class="staging-status staging-status-${tone}">${provider.available ? "Connected" : "Unavailable"}</span></header><div class="panel-body customer-discovery-provider"><span><strong>${escapeHtml(provider.name || "Authorized source")}</strong><small>Automated active-listing connector · customer configuration disabled</small></span><span><strong>${escapeHtml(exactCandidateCount)}</strong><small>Exact candidates</small>${reviewNote}</span><span><strong>${escapeHtml(state.data.evidenceSupportedCount || 0)}</strong><small>With trusted exact sold context</small></span></div></section>`;
  }

  function candidateCard(item, index, identityReview = false) {
    const evidence = item.evidence || {};
    const exactIdentity = String(item.matchQuality || "") === "EXACT_MATCH";
    const label = identityReview
      ? "Identity not confirmed"
      : item.discoveryLabel === "BEST_CONNECTED_CANDIDATE"
        ? "Best connected candidate"
        : String(item.discoveryLabel || "Connected candidate").replaceAll("_", " ");
    const evaluateDisabled = identityReview
      || !exactIdentity
      || item.evaluationEligible !== true
      || state.evaluatingIndex >= 0;
    const sellerFeedback = Number(item.sellerFeedbackScore);
    const rankingContext = [
      Number.isFinite(sellerFeedback) && sellerFeedback >= 0
        ? `Seller feedback ${new Intl.NumberFormat("en-US").format(sellerFeedback)}`
        : "",
      item.condition ? `Condition ${item.condition}` : "",
      item.listingFormat ? `Format ${String(item.listingFormat).replaceAll("_", " ")}` : ""
    ].filter(Boolean).join(" · ");
    const factors = item.rankingFactors && typeof item.rankingFactors === "object"
      ? Object.entries(item.rankingFactors)
        .filter(([, value]) => Number.isFinite(Number(value)))
        .map(([name, value]) => `${name.replace(/([A-Z])/g, " $1").replace(/^./, character => character.toUpperCase())} ${Number(value)}/100`)
        .join(" · ")
      : "";
    const rankingDetails = item.rankingExplanation || factors
      ? `<details class="customer-discovery-ranking-details"><summary>Why this result is ranked here</summary>${item.rankingExplanation ? `<p>${escapeHtml(item.rankingExplanation)}</p>` : ""}${factors ? `<small>${escapeHtml(factors)}</small>` : ""}</details>`
      : "";
    const eyebrow = identityReview
      ? `Excluded provider result · ${escapeHtml(item.providerDisplayName || item.marketplace || "Authorized source")}`
      : `Rank ${escapeHtml(item.rank || index + 1)} · ${escapeHtml(item.providerDisplayName || item.marketplace || "Authorized source")}`;
    const blockReason = item.evaluationBlockReason || "Exact listing identity is required before evaluation.";
    const boundary = identityReview
      ? `<div class="boundary-note"><strong>Not an exact candidate:</strong> ${escapeHtml(blockReason)} It is separated from the ranked exact matches and cannot be sent to Smart Opportunity.</div>`
      : `<div class="boundary-note"><strong>Discovery only:</strong> This active listing is not a sold comp and this score is not BUY/WATCH/VERIFY/PASS. Evaluation is a separate explicit request.</div>`;
    return `<article class="panel customer-discovery-candidate${identityReview ? " customer-discovery-candidate-review" : ""}"><header class="panel-header"><div><span class="eyebrow">${eyebrow}</span><h2>${escapeHtml(item.title || item.cardIdentityQuery || "Active listing")}</h2><p>${escapeHtml(label)}</p></div><span class="customer-discovery-score"><strong>${escapeHtml(item.discoveryScore ?? 0)}</strong><small>Discovery score</small></span></header><div class="panel-body"><div class="customer-discovery-metrics"><div><span>All-in ask</span><strong>${moneyFromCents(item.allInAskCents)}</strong><small>${item.allInCostComplete ? "Complete returned cost" : "Cost review required"}</small></div><div><span>Trusted exact sold context</span><strong>${escapeHtml(evidence.trustedExactCompletedSaleCount ?? 0)} sales</strong><small>${evidence.supported ? moneyFromCents(evidence.trustedEvidenceValueCents) + " median context" : "Evidence required"}</small></div><div><span>Confidence context</span><strong>${escapeHtml(evidence.calibratedConfidence ?? 0)}/100</strong><small>Risk ${escapeHtml(evidence.risk ?? 0)}/100</small></div><div><span>Listing state</span><strong>${escapeHtml(String(item.listingAvailability || "UNKNOWN").replaceAll("_", " "))}</strong><small>${escapeHtml(String(item.listingFreshness || "UNKNOWN").replaceAll("_", " "))}</small></div></div><div class="customer-discovery-copy"><p><strong>Price position:</strong> ${escapeHtml(item.pricePosition || "Evidence required")}</p>${rankingContext ? `<p><strong>Ranking context:</strong> ${escapeHtml(rankingContext)}</p>` : ""}<p><strong>Next action:</strong> ${escapeHtml(item.nextAction || "Verify the listing before evaluation.")}</p></div>${rankingDetails}<div class="customer-discovery-actions"><a class="button button-secondary" href="${escapeHtml(validHttpUrl(item.listingUrl) ? item.listingUrl : "#")}" target="_blank" rel="noopener noreferrer">Open listing</a><button class="button button-primary" type="button" data-discovery-evaluate="${index}" ${evaluateDisabled ? "disabled" : ""}>${state.evaluatingIndex === index ? "Evaluating…" : "Evaluate with Smart Opportunity"}</button></div>${boundary}</div></article>`;
  }

  function resultsPanel() {
    if (!state.data) return "";
    const items = Array.isArray(state.data.items) ? state.data.items : [];
    if (!items.length) return `<section class="panel"><div class="panel-body staging-empty"><strong>No active candidate is available.</strong><p>${escapeHtml(state.data.coverageSummary || "No connected listing matched this search.")}</p></div></section>`;

    const indexed = items.map((item, index) => ({ item, index }));
    const exact = indexed.filter(({ item }) => String(item?.matchQuality || "") === "EXACT_MATCH");
    const identityReview = indexed.filter(({ item }) => String(item?.matchQuality || "") !== "EXACT_MATCH");
    const exactResults = exact.length
      ? exact.map(({ item, index }) => candidateCard(item, index, false)).join("")
      : `<section class="panel"><div class="panel-body staging-empty"><strong>No exact active listing matched.</strong><p>Provider results that do not confirm the searched grade, card number, or variation are withheld from the exact ranking.</p></div></section>`;
    const identityReviewResults = identityReview.length
      ? `<details class="customer-discovery-identity-review"><summary>${identityReview.length} excluded provider result${identityReview.length === 1 ? "" : "s"} — identity not confirmed</summary><p>These results are visible for transparency, but they are not ranked with exact matches and cannot be evaluated as the searched card.</p>${identityReview.map(({ item, index }) => candidateCard(item, index, true)).join("")}</details>`
      : "";
    const exactLabel = `${exact.length} exact active candidate${exact.length === 1 ? "" : "s"}`;
    return `<section class="customer-discovery-results" aria-label="Active discovery candidates"><div class="customer-discovery-summary"><strong>${escapeHtml(exactLabel)}</strong><span>Best candidate means best across currently connected sources—not the entire market. Lower complete all-in cost breaks otherwise equivalent evidence and listing-state context.</span></div>${exactResults}${identityReviewResults}</section>`;
  }

  function renderCurrent() {
    if (!state.main) return;
    if (state.health && state.health.status !== "configured") {
      state.main.innerHTML = `<div class="page customer-discovery-page"><header class="page-heading"><div><span class="eyebrow">Provider-backed market discovery</span><h1>Discover</h1><p>Find active listings across approved connected sources without treating asking prices as completed-sale evidence.</p></div></header><div class="boundary-note"><strong>Authority boundary:</strong> Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. Discover does not save or recommend a listing.</div><section class="panel"><div class="panel-body staging-empty"><strong>Discover is safely offline.</strong><p>The private-beta API bridge is disabled, so no provider search was attempted and no sample results were substituted.</p></div></section></div>`;
      return;
    }
    state.main.innerHTML = `<div class="page customer-discovery-page"><header class="page-heading"><div><span class="eyebrow">Provider-backed market discovery</span><h1>Discover</h1><p>Search approved active-listing sources, compare all-in asks against existing trusted evidence context, then explicitly evaluate the listing you want FlipForge to judge.</p></div><div class="page-actions"><a class="button button-secondary" href="#/opportunities">Saved opportunities</a><a class="button button-secondary" href="#/evaluate">Manual evaluate</a></div></header><div class="boundary-note"><strong>Authority boundary:</strong> Discover ranks active candidates only. It does not create BUY/WATCH/VERIFY/PASS, accept evidence, persist a search, or authorize a transaction.</div>${errorPanel()}${state.notice ? `<div class="customer-discovery-notice" role="status">${escapeHtml(state.notice)}</div>` : ""}${searchPanel()}${identityAssistPanel()}${providerPanel()}${resultsPanel()}</div>`;
    bindActions();
  }

  function bindActions() {
    const form = state.main?.querySelector?.("[data-customer-discovery-form]");
    form?.addEventListener("submit", event => {
      event.preventDefault();
      if (!state.loading && !state.identityAssist.busy && state.evaluatingIndex < 0) search(form);
    });
    const findExactButton = state.main?.querySelector?.("[data-discovery-find-exact]");
    findExactButton?.addEventListener("click", () => {
      if (form && !state.loading && !state.identityAssist.busy && state.evaluatingIndex < 0) findExactCard(form);
    });
    state.main?.querySelectorAll?.("[data-discovery-use-identity]").forEach(button => {
      button.addEventListener("click", () => {
        const index = Number.parseInt(button.dataset.discoveryUseIdentity || "-1", 10);
        if (Number.isInteger(index) && index >= 0 && !state.loading && !state.identityAssist.busy && state.evaluatingIndex < 0) resolveIdentity(index);
      });
    });
    state.main?.querySelectorAll?.("[data-discovery-evaluate]").forEach(button => {
      button.addEventListener("click", () => {
        const index = Number.parseInt(button.dataset.discoveryEvaluate || "-1", 10);
        if (Number.isInteger(index) && index >= 0 && state.evaluatingIndex < 0) evaluate(index);
      });
    });
  }

  async function render(main) {
    state.main = main;
    state.evaluatingIndex = -1;
    state.error = null;
    state.notice = "";
    if (!eligibleHost()) return false;
    if (!state.health) {
      state.loading = true;
      renderCurrent();
      try {
        await loadHealth();
      } catch (error) {
        state.error = error;
      } finally {
        state.loading = false;
      }
    }
    renderCurrent();
    return true;
  }

  window.FlipForgeCustomerDiscovery = Object.freeze({ isEligible: eligibleHost, render });
})();
