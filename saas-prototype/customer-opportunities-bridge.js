(() => {
  "use strict";

  const stagingAdapter = window.FlipForgeStagingReadAdapter || null;
  const customerAdapter = window.FlipForgeCustomerOpportunities;
  if (!customerAdapter) return;

  const CONTRACT_VERSION = "1.0";
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const WATCHDOG_MS = 2200;
  const DETAIL_TIMEOUT_MS = 7000;
  const LIST_TIMEOUT_MS = 7000;
  const LIST_RECOVERY_GUARD_MS = 12000;
  const TRANSIENT_RETRY_DELAY_MS = 300;
  let recoverySerial = 0;

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

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(safeNumber(value));
  }

  function correlationId() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `card-intelligence-recovery-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function routeParts() {
    return String(window.location.hash || "")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean);
  }

  function routeOpportunityId() {
    const parts = routeParts();
    if (parts[0] !== "opportunities" || parts.length < 2) return "";
    try {
      const id = decodeURIComponent(parts[1]);
      return SAFE_ID.test(id) ? id : "";
    } catch (_) {
      return "";
    }
  }

  function opportunitiesListRoute() {
    const parts = routeParts();
    return parts[0] === "opportunities" && parts.length === 1;
  }

  function stillLoading(main, id, serial) {
    return serial === recoverySerial
      && routeOpportunityId() === id
      && Boolean(main)
      && String(main.textContent || main.innerHTML || "").includes("Loading card intelligence");
  }

  function listNeedsRecovery(main, serial) {
    return serial === recoverySerial
      && opportunitiesListRoute()
      && Boolean(main)
      && !main.querySelector?.(".customer-intelligence-list")
      && !main.querySelector?.("[data-saved-intelligence-recovery]");
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      throw Object.assign(new Error("The saved decision response exceeded the browser safety limit."), {
        code: "CARD_INTELLIGENCE_RESPONSE_TOO_LARGE"
      });
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw Object.assign(new Error("The saved decision gateway returned invalid JSON."), {
        code: "CARD_INTELLIGENCE_INVALID_JSON"
      });
    }
  }

  function validAuthorityMeta(meta, requestCorrelationId) {
    return Boolean(meta)
      && meta.contractVersion === CONTRACT_VERSION
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === requestCorrelationId;
  }

  async function requestDetail(id) {
    const requestCorrelationId = correlationId();
    const encoded = encodeURIComponent(id);
    const request = fetch(`/api/v1/opportunities/${encoded}`, {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    }).then(async response => {
      const payload = await parseResponse(response);
      if (!response.ok) {
        const upstream = payload?.error || {};
        throw Object.assign(new Error(upstream.message || `Saved decision request failed with status ${response.status}.`), {
          code: upstream.code || "CARD_INTELLIGENCE_REQUEST_FAILED",
          status: response.status
        });
      }
      const meta = payload?.meta;
      const item = payload?.data?.opportunity;
      const valid = validAuthorityMeta(meta, requestCorrelationId)
        && item
        && String(item.id || "") === id;
      if (!valid) {
        throw Object.assign(new Error("The saved decision failed the FlipForge authority contract."), {
          code: "CARD_INTELLIGENCE_CONTRACT_INVALID"
        });
      }
      return item;
    });

    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(Object.assign(new Error("The saved decision took too long to load."), {
        code: "CARD_INTELLIGENCE_TIMEOUT"
      })), DETAIL_TIMEOUT_MS);
    });

    return Promise.race([request, timeout]);
  }

  async function requestSavedListAttempt() {
    const requestCorrelationId = correlationId();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), LIST_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch("/api/v1/opportunities", {
        method: "GET",
        headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId },
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        ...(controller ? { signal: controller.signal } : {})
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        const upstream = payload?.error || {};
        throw Object.assign(new Error(upstream.message || `Saved intelligence request failed with status ${response.status}.`), {
          code: upstream.code || "SAVED_INTELLIGENCE_REQUEST_FAILED",
          status: response.status
        });
      }
      const valid = validAuthorityMeta(payload?.meta, requestCorrelationId)
        && payload?.data?.kind === "opportunities"
        && Array.isArray(payload?.data?.items);
      if (!valid) {
        throw Object.assign(new Error("The saved intelligence list failed the FlipForge authority contract."), {
          code: "SAVED_INTELLIGENCE_CONTRACT_INVALID"
        });
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw Object.assign(new Error("The saved intelligence list took too long to load."), {
          code: "SAVED_INTELLIGENCE_TIMEOUT",
          status: 504
        });
      }
      throw error;
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
  }

  function transientListError(error) {
    const code = String(error?.code || "");
    const status = Number(error?.status || 0);
    return status >= 500
      || [
        "IDENTITY_SERVICE_TIMEOUT",
        "IDENTITY_SERVICE_UNAVAILABLE",
        "UPSTREAM_TIMEOUT",
        "UPSTREAM_UNAVAILABLE",
        "SAVED_INTELLIGENCE_TIMEOUT"
      ].includes(code);
  }

  async function requestSavedList() {
    try {
      return await requestSavedListAttempt();
    } catch (error) {
      if (!transientListError(error)) throw error;
      await new Promise(resolve => window.setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
      return requestSavedListAttempt();
    }
  }

  function decisionTone(value) {
    const tone = String(value || "").trim().toLowerCase();
    return ["buy", "watch", "verify", "pass"].includes(tone) ? tone : "neutral";
  }

  function savedListTable(payload) {
    const items = safeArray(payload?.data?.items)
      .filter(item => SAFE_ID.test(String(item?.id || "")));
    if (!items.length) {
      return `<div class="staging-empty"><strong>No saved decisions yet.</strong><p>Evaluate one exact card to create the first tenant-owned saved decision.</p><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div>`;
    }

    return `<div class="table-wrap"><table><thead><tr><th>Saved card</th><th>Decision</th><th>Ask</th><th>Supported</th><th>Confidence</th><th>Evidence</th></tr></thead><tbody>${items.map(item => {
      const id = String(item.id || "");
      const title = String(item.title || item.cardIdentity || id || "Saved card");
      const identity = String(item.cardIdentity || "");
      const acceptedSales = Math.max(0, safeNumber(item.evidence?.acceptedSales));
      const supported = acceptedSales > 0 && safeNumber(item.supportedValue) > 0
        ? money(item.supportedValue)
        : "Unavailable";
      const recommendation = String(item.recommendation || "UNKNOWN");
      return `<tr><td><a href="#/opportunities/${encodeURIComponent(id)}"><strong>${escapeHtml(title)}</strong></a>${identity && identity !== title ? `<small>${escapeHtml(identity)}</small>` : ""}</td><td><span class="staging-status staging-status-${decisionTone(recommendation)}">${escapeHtml(recommendation)}</span></td><td>${money(item.ask)}</td><td>${escapeHtml(supported)}</td><td>${safeNumber(item.confidence)}/100</td><td>${acceptedSales}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function recoveredListMarkup(payload) {
    const meta = payload?.meta || {};
    return `<div class="page customer-intelligence-page" data-saved-intelligence-recovery>
      <header class="page-heading">
        <div><span class="eyebrow">Saved intelligence</span><h1>Saved Decisions</h1><p>Your tenant-owned saved decisions are available. Dashboard summary context can finish loading separately.</p></div>
        <div class="page-actions"><button class="button button-secondary" type="button" data-saved-intelligence-retry>Refresh full intelligence</button><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div>
      </header>
      <details class="boundary-note ff-trust-note"><summary>Recovery details</summary><p>FlipForge loaded the authoritative saved-decision list directly instead of blocking on optional dashboard preflight data. No mock record or browser-generated recommendation was substituted.</p></details>
      <section class="panel customer-intelligence-list"><header class="panel-header"><div><h2>Your tracked decision records</h2><p>Open any saved card to load its decision, evidence, and PSA context.</p></div><span class="staging-status staging-status-ok">Saved</span></header><div class="panel-body">${savedListTable(payload)}</div></section>
      <section class="panel customer-contract-panel"><div class="panel-body"><div><span>Engine</span><strong>${escapeHtml(meta.engineVersion || "Authoritative service")}</strong></div><div><span>Evidence freshness</span><strong>${escapeHtml(meta.evidenceFreshness || "Unavailable")}</strong></div><div><span>Customer controls</span><strong>Read, evaluate, understand, track</strong></div><div><span>Execution authority</span><strong>None</strong></div></div></section>
    </div>`;
  }

  function applyRecoveredList(main, payload) {
    main.innerHTML = recoveredListMarkup(payload);
    main.querySelector?.("[data-saved-intelligence-retry]")?.addEventListener("click", () => {
      renderCustomer(main, "");
    });
  }

  function protectRecoveredList(main, payload, serial) {
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(() => {
      if (serial !== recoverySerial || !opportunitiesListRoute()) {
        observer.disconnect();
        return;
      }
      if (main.querySelector?.("[data-saved-intelligence-recovery]")) return;
      if (main.querySelector?.(".customer-intelligence-list")) {
        observer.disconnect();
        return;
      }
      applyRecoveredList(main, payload);
    });
    observer.observe(main, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), LIST_RECOVERY_GUARD_MS);
  }

  function renderListRecoveryError(main, error, serial) {
    if (serial !== recoverySerial || !opportunitiesListRoute()) return;
    if (main.querySelector?.(".customer-intelligence-list")) return;
    main.innerHTML = `<div class="page customer-intelligence-page" data-saved-intelligence-recovery-error>
      <header class="page-heading"><div><span class="eyebrow">Saved intelligence</span><h1>Saved Decisions</h1><p>The saved-decision list did not finish loading in the expected time.</p></div><div class="page-actions"><button class="button button-primary" type="button" data-saved-intelligence-retry>Retry now</button></div></header>
      <section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error?.code || "SAVED_INTELLIGENCE_UNAVAILABLE")}</strong><p>${escapeHtml(error?.message || "Your saved decisions are temporarily unavailable.")}</p><small>No mock decision or browser-generated recommendation was substituted.</small></div></section>
    </div>`;
    main.querySelector?.("[data-saved-intelligence-retry]")?.addEventListener("click", () => renderCustomer(main, ""));
  }

  async function recoverListIfNeeded(main, serial) {
    if (!listNeedsRecovery(main, serial)) return;
    try {
      const payload = await requestSavedList();
      if (serial !== recoverySerial || !opportunitiesListRoute()) return;
      if (main.querySelector?.(".customer-intelligence-list")) return;
      applyRecoveredList(main, payload);
      protectRecoveredList(main, payload, serial);
    } catch (error) {
      renderListRecoveryError(main, error, serial);
    }
  }

  function renderRecoveredDetail(main, item) {
    const recommendation = String(item.recommendation || "UNKNOWN");
    const title = String(item.title || item.cardIdentity || item.id || "Saved card");
    const identity = String(item.cardIdentity || "");
    const acceptedSales = safeNumber(item.evidence?.acceptedSales);
    const supported = acceptedSales > 0 && safeNumber(item.supportedValue) > 0
      ? money(item.supportedValue)
      : "Unavailable";
    const mapping = String(item.mappingState || "").toUpperCase() === "CONFIRMED"
      ? "CardSight catalog linked"
      : "CardSight catalog link pending";

    main.innerHTML = `<div class="page customer-intelligence-page" data-card-intelligence-recovery>
      <header class="page-heading">
        <div><span class="eyebrow">Saved intelligence</span><h1>Card Intelligence</h1><p>Your saved decision is available. Deeper Evidence and PSA context can finish loading separately.</p></div>
        <div class="page-actions"><a class="button button-secondary" href="#/opportunities">Saved decisions</a><a class="button button-secondary" href="#/tracking/${encodeURIComponent(item.id)}">Track</a><button class="button button-secondary" type="button" data-card-intelligence-retry>Refresh full intelligence</button></div>
      </header>
      <details class="boundary-note ff-trust-note"><summary>Recovery details</summary><p>The authoritative saved Smart Opportunity decision is shown now instead of blocking on optional downstream context. No browser-side recommendation was calculated.</p></details>
      <section class="panel customer-intelligence-hero"><div class="panel-body"><div class="customer-hero-copy"><span class="eyebrow">${escapeHtml(item.platform || "Saved marketplace record")}</span><div class="customer-hero-title"><span class="staging-status staging-status-${decisionTone(recommendation)}">${escapeHtml(recommendation)}</span><h2>${escapeHtml(title)}</h2></div>${identity && identity !== title ? `<p>${escapeHtml(identity)}</p>` : ""}<div class="customer-tracked-state"><span class="check-mark ok">✓</span><span><strong>Decision saved</strong><small>${escapeHtml(item.observedAt || "Saved observation")}</small></span></div></div><div class="customer-value-summary"><span>Current ask</span><strong>${money(item.ask)}</strong><span>Supported value</span><strong>${escapeHtml(supported)}</strong><small>${acceptedSales > 0 ? `${acceptedSales} accepted exact completed sale${acceptedSales === 1 ? "" : "s"}` : "No accepted exact completed-sale evidence supports a value yet."}</small></div></div></section>
      <div class="customer-intelligence-metrics"><article><span>Confidence</span><strong>${safeNumber(item.confidence)}/100</strong></article><article><span>Liquidity</span><strong>${safeNumber(item.liquidity)}/100</strong></article><article><span>Risk</span><strong>${safeNumber(item.risk)}/100</strong></article><article><span>Rank</span><strong>${safeNumber(item.rank)}/100</strong></article></div>
      <section class="panel"><header class="panel-header"><div><h2>Decision available</h2><p>The core saved decision loaded successfully. Full Evidence/PSA detail is still being requested by the normal Card Intelligence renderer.</p></div></header><div class="panel-body staging-key-grid"><div><span>Decision</span><strong>${escapeHtml(recommendation)}</strong></div><div><span>Accepted exact sales</span><strong>${acceptedSales}</strong></div><div><span>Provider catalog link</span><strong>${escapeHtml(mapping)}</strong></div><div><span>Execution authority</span><strong>None</strong></div></div></section>
    </div>`;

    main.querySelector?.("[data-card-intelligence-retry]")?.addEventListener("click", () => {
      renderCustomer(main, item.id);
    });
  }

  function renderRecoveryError(main, id, error, serial) {
    if (!stillLoading(main, id, serial)) return;
    main.innerHTML = `<div class="page customer-intelligence-page" data-card-intelligence-recovery-error>
      <header class="page-heading"><div><span class="eyebrow">Saved intelligence</span><h1>Card Intelligence</h1><p>The saved decision did not finish loading in the expected time.</p></div><div class="page-actions"><a class="button button-secondary" href="#/opportunities">Saved decisions</a><button class="button button-primary" type="button" data-card-intelligence-retry>Retry now</button></div></header>
      <section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error?.code || "CARD_INTELLIGENCE_TIMEOUT")}</strong><p>${escapeHtml(error?.message || "The saved decision is temporarily unavailable.")}</p><small>No mock decision or browser-generated recommendation was substituted.</small></div></section>
    </div>`;
    main.querySelector?.("[data-card-intelligence-retry]")?.addEventListener("click", () => renderCustomer(main, id));
  }

  async function recoverIfNeeded(main, id, serial) {
    if (!stillLoading(main, id, serial)) return;
    try {
      const item = await requestDetail(id);
      if (!stillLoading(main, id, serial)) return;
      renderRecoveredDetail(main, item);
    } catch (error) {
      renderRecoveryError(main, id, error, serial);
    }
  }

  function renderCustomer(main, id = "") {
    const started = customerAdapter.render(main, id);
    const normalizedId = String(id || "");
    const serial = ++recoverySerial;
    if (started && SAFE_ID.test(normalizedId)) {
      setTimeout(() => recoverIfNeeded(main, normalizedId, serial), WATCHDOG_MS);
    } else if (started && !normalizedId) {
      setTimeout(() => recoverListIfNeeded(main, serial), WATCHDOG_MS);
    }
    return started;
  }

  const customerBridge = Object.freeze({
    isEligible() {
      return typeof customerAdapter.isEligible === "function" && customerAdapter.isEligible();
    },
    renderCustomer,
    render(main, id = "") {
      return renderCustomer(main, id);
    },
    refresh: typeof customerAdapter.refresh === "function"
      ? () => customerAdapter.refresh()
      : undefined
  });

  // Production owns Opportunities/Card Intelligence through this dedicated
  // bridge even when preview-only staging-browser.js has been stripped.
  window.FlipForgeCustomerOpportunitiesBridge = customerBridge;

  // Deploy previews keep the staging diagnostic surface, but customer routing
  // no longer depends on this object existing in production.
  if (stagingAdapter) {
    window.FlipForgeStagingReadAdapter = Object.freeze({
      isEligible() {
        return customerBridge.isEligible()
          || (typeof stagingAdapter.isEligible === "function" && stagingAdapter.isEligible());
      },
      renderCustomer,
      render(main, id = "") {
        return typeof stagingAdapter.render === "function" ? stagingAdapter.render(main, id) : false;
      },
      reset: typeof stagingAdapter.reset === "function"
        ? () => stagingAdapter.reset()
        : undefined
    });
  }
})();
