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
  let recoverySerial = 0;

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
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `card-intelligence-recovery-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function routeOpportunityId() {
    const parts = String(window.location.hash || "")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean);
    if (parts[0] !== "opportunities" || parts.length < 2) return "";
    try {
      const id = decodeURIComponent(parts[1]);
      return SAFE_ID.test(id) ? id : "";
    } catch (_) {
      return "";
    }
  }

  function stillLoading(main, id, serial) {
    return serial === recoverySerial
      && routeOpportunityId() === id
      && Boolean(main)
      && String(main.textContent || main.innerHTML || "").includes("Loading card intelligence");
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
      const valid = Boolean(meta)
        && meta.contractVersion === CONTRACT_VERSION
        && meta.authority === "Smart Opportunity"
        && meta.gradingAuthority === "Existing PSA intelligence"
        && meta.correlationId === requestCorrelationId
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
      <div class="boundary-note"><strong>Recovered customer view:</strong> The authoritative saved Smart Opportunity decision is shown now instead of blocking on optional downstream context. No browser-side recommendation was calculated.</div>
      <section class="panel customer-intelligence-hero"><div class="panel-body"><div class="customer-hero-copy"><span class="eyebrow">${escapeHtml(item.platform || "Saved marketplace record")}</span><div class="customer-hero-title"><span class="staging-status staging-status-${escapeHtml(recommendation.toLowerCase())}">${escapeHtml(recommendation)}</span><h2>${escapeHtml(title)}</h2></div>${identity && identity !== title ? `<p>${escapeHtml(identity)}</p>` : ""}<div class="customer-tracked-state"><span class="check-mark ok">✓</span><span><strong>Decision saved</strong><small>${escapeHtml(item.observedAt || "Saved observation")}</small></span></div></div><div class="customer-value-summary"><span>Current ask</span><strong>${money(item.ask)}</strong><span>Supported value</span><strong>${escapeHtml(supported)}</strong><small>${acceptedSales > 0 ? `${acceptedSales} accepted exact completed sale${acceptedSales === 1 ? "" : "s"}` : "No accepted exact completed-sale evidence supports a value yet."}</small></div></div></section>
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