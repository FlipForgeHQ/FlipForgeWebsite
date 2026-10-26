(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const PATHS = new Set(["/api/v1/health", "/api/v1/portfolio", "/api/v1/opportunities", "/api/v1/sell-watch", "/api/v1/reported-sales"]);
  // Reference values from earlier reported-sale history are no longer used. When every holding reports this status,
  // card values are paused as a whole, not missing card by card.
  const PAUSED_STATUS = "PROVIDER_STORED_HISTORY_NOT_RETAINED";
  const REFERENCE_METHOD = "AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES";

  const state = {
    main: null,
    loading: false,
    health: null,
    portfolio: null,
    opportunities: null,
    sellWatch: null,
    sales: null,
    error: null,
    generation: 0
  };

  function productionHost() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

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

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function wholeNumber(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function signedWholeNumber(value) {
    return Number.isSafeInteger(value);
  }

  function moneyCents(value) {
    if (!Number.isSafeInteger(value)) return "Unavailable";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value / 100);
  }

  function signedMoneyCents(value) {
    if (!Number.isSafeInteger(value)) return "Unavailable";
    const absolute = moneyCents(Math.abs(value));
    if (value > 0) return `+${absolute}`;
    if (value < 0) return `-${absolute}`;
    return absolute;
  }

  function signedPercent(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "Unavailable";
    if (parsed > 0) return `+${parsed.toFixed(2)}%`;
    return `${parsed.toFixed(2)}%`;
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `customer-portfolio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
      throw Object.assign(new Error("The Portfolio response exceeded the browser safety limit."), {
        code: "PORTFOLIO_RESPONSE_TOO_LARGE"
      });
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw Object.assign(new Error("The Portfolio gateway returned invalid JSON."), {
        code: "PORTFOLIO_INVALID_JSON"
      });
    }
  }

  async function request(path) {
    if (!PATHS.has(path)) throw new Error("The requested Portfolio API path is not allowlisted.");
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
      throw Object.assign(new Error(upstream.message || `Portfolio request failed with status ${response.status}.`), {
        code: upstream.code || "PORTFOLIO_REQUEST_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    const valid = path === "/api/v1/health"
      ? validHealth(payload, requestCorrelationId)
      : validEnvelope(payload, requestCorrelationId);
    if (!valid) {
      throw Object.assign(new Error("The Portfolio response failed the FlipForge authority contract."), {
        code: "PORTFOLIO_CONTRACT_INVALID"
      });
    }
    return payload;
  }

  function validReference(reference) {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) return false;
    if (typeof reference.available !== "boolean" || typeof reference.status !== "string" || !reference.status) return false;
    if (reference.method !== REFERENCE_METHOD) return false;
    if (!wholeNumber(reference.acceptedExactCompletedSales) || reference.minimumAcceptedExactSales !== 3) return false;
    if (reference.maximumLatestSaleAgeDays !== 30) return false;
    if (!Array.isArray(reference.marketplaces)) return false;
    if (reference.exactIdentityRequired !== true) return false;
    if (reference.activeListingsUsed !== false || reference.providerCallPerformed !== false) return false;
    if (reference.persistedAsValuation !== false || reference.appraisal !== false || reference.transactionAuthority !== false) return false;
    if (reference.available) {
      if (!wholeNumber(reference.valueCents) || reference.valueCents <= 0) return false;
      if (reference.acceptedExactCompletedSales < 3) return false;
      if (!wholeNumber(reference.latestSaleAgeDays) || reference.latestSaleAgeDays > 30) return false;
      if (typeof reference.latestSaleDate !== "string" || !reference.latestSaleDate) return false;
    } else if (reference.valueCents !== null) {
      return false;
    }
    return true;
  }

  function validPerformance(performance, reference) {
    if (!performance || typeof performance !== "object" || Array.isArray(performance)) return false;
    if (typeof performance.available !== "boolean" || typeof performance.status !== "string" || !performance.status) return false;
    if (performance.method !== "EVIDENCE_REFERENCE_MINUS_CUSTOMER_COST_BASIS") return false;
    if (performance.realized !== false || performance.feesIncluded !== false || performance.taxesIncluded !== false) return false;
    if (performance.liquidationEstimate !== false || performance.appraisal !== false || performance.transactionAuthority !== false) return false;
    if (performance.available) {
      if (!reference.available) return false;
      if (!wholeNumber(performance.acquisitionCostCents) || performance.acquisitionCostCents <= 0) return false;
      if (performance.referenceValueCents !== reference.valueCents) return false;
      if (!signedWholeNumber(performance.referenceDeltaCents)) return false;
      if (!Number.isFinite(Number(performance.referenceDeltaPercent))) return false;
    } else if (performance.referenceDeltaCents !== null || performance.referenceDeltaPercent !== null) {
      return false;
    }
    return true;
  }

  function validPortfolio(payload) {
    const data = payload?.data;
    if (!data || data.kind !== "portfolio" || data.configured !== true || !Array.isArray(data.items)) return false;
    if (data.transactionAuthority !== false || data.currentValueConfigured !== true || data.performanceConfigured !== true) return false;
    if (data.currentValueType !== "EVIDENCE_SUPPORTED_REFERENCE_NOT_APPRAISAL") return false;
    if (data.currentValueMethod !== REFERENCE_METHOD || data.performanceType !== "UNREALIZED_REFERENCE_COMPARISON") return false;
    if (data.feesIncluded !== false || data.taxesIncluded !== false || data.liquidationEstimate !== false || data.appraisal !== false) return false;
    if (!wholeNumber(data.count) || data.count !== data.items.length || !wholeNumber(data.totalCostBasisCents)) return false;
    if (!wholeNumber(data.referenceValueAvailableCount) || !wholeNumber(data.performanceAvailableCount)) return false;
    if (typeof data.completeReferenceCoverage !== "boolean" || typeof data.completePerformanceCoverage !== "boolean") return false;
    if (!wholeNumber(data.coveredReferenceValueCents) || !wholeNumber(data.coveredCostBasisCents) || !signedWholeNumber(data.coveredReferenceDeltaCents)) return false;
    if (!data.completeReferenceCoverage && data.completePortfolioReferenceValueCents !== null) return false;
    if (!data.completePerformanceCoverage && data.completePortfolioReferenceDeltaCents !== null) return false;

    let referenceCount = 0;
    let performanceCount = 0;
    for (const item of data.items) {
      if (!item || !SAFE_ID.test(String(item.opportunityId || ""))) return false;
      if (!validReference(item.referenceValue)) return false;
      if (!validPerformance(item.referencePerformance, item.referenceValue)) return false;
      if (item.referenceValue.available) referenceCount += 1;
      if (item.referencePerformance.available) performanceCount += 1;
    }
    return referenceCount === data.referenceValueAvailableCount
      && performanceCount === data.performanceAvailableCount;
  }

  // Sell Watch (owned cards: your selling costs and what you would keep at your price). Optional: when the service has
  // it switched off, or the response is not a valid Sell Watch response, Portfolio simply shows no Sell Watch section.
  function validSellWatch(payload) {
    const data = payload?.data;
    return Boolean(data) && data.kind === "sell-watch" && data.transactionAuthority === false
      && data.acquisitionDecisionAffected === false && data.marketComparisonDisplayed === false
      && data.authority === "POSITION_REVIEW_PROMPT_ONLY" && Array.isArray(data.items) && Array.isArray(data.costProfiles);
  }

  // Sales the customer recorded with Mark as Sold. Optional like Sell Watch: shown only for a valid response that keeps
  // the "user reported" label and no data use; the server computes every figure.
  function validSales(payload) {
    const data = payload?.data;
    return Boolean(data) && data.kind === "reported-sales" && data.label === "USER_REPORTED" && data.dataUseEnabled === false
      && data.transactionAuthority === false && Array.isArray(data.items);
  }

  function salesData() {
    return validSales(state.sales) ? state.sales.data : null;
  }

  function sellWatchData() {
    return validSellWatch(state.sellWatch) ? state.sellWatch.data : null;
  }

  function valuesPaused(data) {
    return Number(data?.count) > 0 && data.referenceValueAvailableCount === 0
      && data.items.every(item => item?.referenceValue?.status === PAUSED_STATUS);
  }

  function dateOnly(value) {
    const text = String(value || "");
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
  }

  function validOpportunities(payload) {
    return payload?.data?.kind === "opportunities" && Array.isArray(payload?.data?.items);
  }

  function opportunityMap() {
    const map = new Map();
    for (const item of safeArray(state.opportunities?.data?.items)) {
      const id = String(item?.id || "");
      if (SAFE_ID.test(id)) map.set(id, item);
    }
    return map;
  }

  function badge(label, tone = "neutral") {
    return `<span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function boundary(text) {
    return `<details class="boundary-note ff-trust-note"><summary>What this value means</summary><p>${escapeHtml(text)}</p></details>`;
  }

  function pageHeading(actions = "") {
    return `<header class="page-heading"><div><span class="eyebrow">Your cards</span><h1>Portfolio</h1><p>The cards you own and what you paid. Where FlipForge has at least 3 recent, exactly matched completed sales, it also shows an evidence reference.</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</header>`;
  }

  function loadingPanel() {
    return `<div class="staging-loading customer-portfolio-loading" role="status">Loading tenant-owned Portfolio context…</div>`;
  }

  function errorPanel(error) {
    const signIn = error?.status === 401
      ? `<div class="customer-portfolio-actions"><a class="button button-primary" href="${productionHost() ? "/production-auth.html?return=%2Fapp%2F%23%2Fportfolio" : "/staging-auth.html?returnTo=%2Fsaas-prototype%2F%23%2Fportfolio"}">Sign in securely</a></div>`
      : "";
    return `<section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error?.code || "PORTFOLIO_UNAVAILABLE")}</strong><p>${escapeHtml(error?.message || "Portfolio context is unavailable.")}</p><small>No browser-invented value or performance was substituted.</small>${signIn}</div></section>`;
  }

  function offlinePanel() {
    return `<section class="panel"><div class="panel-body staging-empty"><strong>This private-beta Portfolio is safely offline.</strong><p>The customer gateway is disabled, so no tenant request was attempted and no sample holding or value was substituted.</p></div></section>`;
  }

  function referenceStatus(reference) {
    const status = String(reference?.status || "REFERENCE_UNAVAILABLE");
    const labels = {
      REFERENCE_AVAILABLE: "Fresh evidence reference available",
      EXACT_IDENTITY_NOT_CONFIRMED: "Exact identity not confirmed",
      INSUFFICIENT_ACCEPTED_EXACT_SALES: "Not enough accepted exact sales",
      ACCEPTED_SALES_STALE: "Accepted sales are stale",
      ACCEPTED_SALE_DATE_IN_FUTURE: "Invalid future sale date",
      ACCEPTED_SALE_DATE_INVALID: "Accepted sale date unavailable",
      ACCEPTED_SALE_VALUE_UNAVAILABLE: "Accepted sale value unavailable",
      SAVED_OPPORTUNITY_CONTEXT_NOT_FOUND: "Saved evidence context unavailable",
      PROVIDER_STORED_HISTORY_NOT_RETAINED: "Earlier reported-sale history is not used for current values"
    };
    return labels[status] || status.replaceAll("_", " ").toLowerCase();
  }

  function cardTitle(item, opportunities) {
    const saved = opportunities.get(String(item.opportunityId)) || {};
    return { title: saved.title || saved.cardIdentity || item.opportunityId, identity: saved.cardIdentity || item.opportunityId };
  }

  // Break-even prices come from the server (Sell Watch): the lowest price that keeps what was paid after the
  // customer's own saved costs for each channel.
  function breakEvenCell(item, watch) {
    const card = safeArray(watch?.items).find(entry => String(entry?.opportunityId) === String(item.opportunityId));
    // An older service sends no breakEven at all: show nothing rather than ask for costs the customer may have saved.
    if (!card || !Array.isArray(card.breakEven)) return `<span>—</span>`;
    const rows = card.breakEven.filter(entry => Number.isSafeInteger(entry?.priceCents) && entry.priceCents >= 0);
    if (!rows.length) return `<span>Save your selling costs to see it</span>`;
    return rows.map(entry => `<span class="customer-portfolio-break-even"><strong>${escapeHtml(moneyCents(entry.priceCents))}</strong><small>${escapeHtml(entry.channelName || entry.channel)}</small></span>`).join("");
  }

  const SALE_STATUS = {
    REALIZED: "Realized",
    REALIZED_FEES_INCOMPLETE: "Realized (some fees not entered)",
    COST_BASIS_UNAVAILABLE: "What you paid not entered",
    NOT_REALIZED_SALE_PENDING: "Sale pending",
    NOT_REALIZED_SALE_REVERSED: "Sale reversed"
  };

  function realizedPanel(sales) {
    const opportunities = opportunityMap();
    const items = safeArray(sales.items).filter(item => item && item.reviewStatus !== "WITHDRAWN");
    if (!items.length) return "";
    const total = Number.isSafeInteger(sales.realizedProfitWithCompleteFeesCents) ? sales.realizedProfitWithCompleteFeesCents : null;
    const counted = Number.isSafeInteger(sales.realizedWithCompleteFeesCount) ? sales.realizedWithCompleteFeesCount : 0;
    const rows = items.map(item => {
      const sale = item.sale || {};
      const pl = item.profitLoss || {};
      const saved = opportunities.get(String(item.opportunityId)) || {};
      const title = saved.title || item.cardIdentity || saved.cardIdentity || item.opportunityId;
      const profit = Number.isSafeInteger(pl.realizedProfitCents)
        ? `<strong class="${pl.realizedProfitCents >= 0 ? "value-positive" : "value-negative"}">${escapeHtml(signedMoneyCents(pl.realizedProfitCents))}</strong>${pl.realizedReturnPercent === null || pl.realizedReturnPercent === undefined ? "" : `<small>${escapeHtml(signedPercent(pl.realizedReturnPercent))}</small>`}`
        : `<strong>Not available</strong>`;
      return `<tr><td><strong>${escapeHtml(title)}</strong><small>User reported</small></td><td><strong>${escapeHtml(moneyCents(sale.salePriceCents))}</strong><small>${escapeHtml(sale.saleDate || "")}</small></td><td><strong>${escapeHtml(moneyCents(pl.netProceedsCents))}</strong><small>${pl.feesComplete ? "After the fees you entered" : "Some fees not entered"}</small></td><td>${profit}</td><td><span>${escapeHtml(SALE_STATUS[pl.status] || String(pl.status || "").replaceAll("_", " ").toLowerCase())}</span></td></tr>`;
    }).join("");
    return `<section class="panel customer-portfolio-realized" data-portfolio-realized><header class="panel-header"><div><h2>Sold cards</h2><p>Sales you recorded with Mark as Sold. Profit is what you kept after the fees you entered, minus what you paid.</p></div>${badge("User reported", "neutral")}</header><div class="panel-body"><div class="customer-portfolio-key-grid"><div><span>Realized profit</span><strong>${total === null ? "Unavailable" : escapeHtml(signedMoneyCents(total))}</strong><small>${escapeHtml(counted)} sale${counted === 1 ? "" : "s"} with all fees entered</small></div><div><span>Sales recorded</span><strong>${escapeHtml(items.length)}</strong></div></div></div><div class="table-wrap"><table class="customer-portfolio-table"><thead><tr><th>Card</th><th>Sold for</th><th>You kept</th><th>Profit or loss</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  function priceLink(item) {
    return `<a class="button button-secondary" href="#/tracking/${encodeURIComponent(String(item.opportunityId))}">Check a price</a>`;
  }

  // Card values paused: one plain explanation instead of "Unavailable" on every row and a partial-coverage warning.
  function pausedPanel(watch) {
    return `<section class="panel customer-portfolio-paused" data-portfolio-values-paused><header class="panel-header"><div><h2>Card values are paused</h2><p>Your cards and what you paid are not affected.</p></div>${badge("Paused", "neutral")}</header><div class="panel-body"><p>FlipForge shows a card value only when it has at least 3 recent, exactly matched completed sales from sources it is cleared to use. It is moving to licensed sales data, so card values are paused for now rather than shown from sales it no longer uses.</p>${watch ? `<p>You can still see what you would keep at a price you choose, after your own selling costs: open a card with <strong>Check a price</strong>.</p>` : ""}</div></section>`;
  }

  function pausedRows(data, watch) {
    const opportunities = opportunityMap();
    return `<section class="panel"><header class="panel-header"><div><h2>Owned cards</h2><p>What you entered when you marked each card as owned.</p></div></header><div class="table-wrap"><table class="customer-portfolio-table"><thead><tr><th>Card</th><th>What you paid</th><th>Bought</th>${watch ? "<th>Break-even price</th><th>Sell Watch</th>" : ""}</tr></thead><tbody>${data.items.map(item => {
      const { title, identity } = cardTitle(item, opportunities);
      return `<tr><td><strong>${escapeHtml(title)}</strong><small>${escapeHtml(identity)}</small></td><td><strong>${escapeHtml(moneyCents(item.acquisitionCostCents))}</strong><small>Entered by you</small></td><td><span>${escapeHtml(dateOnly(item.acquiredAt) || "Not entered")}</span></td>${watch ? `<td>${breakEvenCell(item, watch)}</td><td>${priceLink(item)}</td>` : ""}</tr>`;
    }).join("")}</tbody></table></div></section>`;
  }

  function sellWatchPanel(watch) {
    const saved = safeArray(watch.costProfiles).map(profile => String(profile.channelName || profile.channel || "")).filter(Boolean);
    const costs = saved.length
      ? `Selling costs saved for: <strong>${escapeHtml(saved.join(", "))}</strong>.`
      : "No selling costs saved yet. Add them the first time you check a price on a card.";
    return `<section class="panel customer-portfolio-sell-watch" data-portfolio-sell-watch><header class="panel-header"><div><h2>Sell Watch</h2><p>See what you would keep at a price you choose, after your own selling costs, compared with what you paid.</p></div></header><div class="panel-body"><p>${costs}</p>${saved.length ? "<p>The break-even price is the lowest price at which you would keep what you paid, after your saved costs for that channel.</p>" : ""}<small>Uses your price and your costs. Not a valuation, an offer or a market value. Taxes are not included.</small></div></section>`;
  }

  function portfolioRows(data) {
    const opportunities = opportunityMap();
    if (!data.items.length) {
      return `<section class="panel"><div class="panel-body staging-empty"><strong>No owned holdings yet.</strong><p>Mark a tenant-owned tracked opportunity as acquired before it appears in Portfolio.</p><a class="button button-primary" href="#/tracking">Open Tracking</a></div></section>`;
    }
    return `<section class="panel"><header class="panel-header"><div><h2>Owned holdings</h2><p>Reference values are shown only when exact completed-sale coverage and freshness gates pass.</p></div></header><div class="table-wrap"><table class="customer-portfolio-table"><thead><tr><th>Card</th><th>What you paid</th><th>Evidence reference</th><th>Reference vs. what you paid</th><th>Evidence gate</th>${sellWatchData() ? "<th>Sell Watch</th>" : ""}</tr></thead><tbody>${data.items.map(item => {
      const saved = opportunities.get(String(item.opportunityId)) || {};
      const reference = item.referenceValue || {};
      const performance = item.referencePerformance || {};
      const title = saved.title || saved.cardIdentity || item.opportunityId;
      const referenceCell = reference.available
        ? `<strong>${escapeHtml(moneyCents(reference.valueCents))}</strong><small>${escapeHtml(referenceStatus(reference))}</small>`
        : `<strong>Unavailable</strong><small>${escapeHtml(referenceStatus(reference))}</small>`;
      const performanceCell = performance.available
        ? `<strong>${escapeHtml(signedMoneyCents(performance.referenceDeltaCents))}</strong><small>${escapeHtml(signedPercent(performance.referenceDeltaPercent))} vs. cost basis</small>`
        : `<strong>Unavailable</strong><small>${escapeHtml(reference.available ? "What you paid is needed" : "Needs an evidence reference")}</small>`;
      const gate = reference.available
        ? `${reference.acceptedExactCompletedSales} accepted exact sales · newest ${reference.latestSaleAgeDays} day${reference.latestSaleAgeDays === 1 ? "" : "s"} old`
        : `${reference.acceptedExactCompletedSales || 0} accepted exact sales · ${referenceStatus(reference)}`;
      return `<tr><td><strong>${escapeHtml(title)}</strong><small>${escapeHtml(saved.cardIdentity || item.opportunityId)}</small></td><td><strong>${escapeHtml(moneyCents(item.acquisitionCostCents))}</strong><small>Entered by you</small></td><td>${referenceCell}</td><td>${performanceCell}</td><td><span>${escapeHtml(gate)}</span><small>Active asks excluded</small></td>${sellWatchData() ? `<td>${breakEvenCell(item, sellWatchData())}${priceLink(item)}</td>` : ""}</tr>`;
    }).join("")}</tbody></table></div></section>`;
  }

  function pausedSummary(data) {
    return `<section class="customer-portfolio-metrics"><article><span>Owned cards</span><strong>${escapeHtml(data.count)}</strong></article><article><span>Total paid</span><strong>${escapeHtml(moneyCents(data.totalCostBasisCents))}</strong></article><article><span>Card values</span><strong>Paused</strong></article></section>`;
  }

  function summary(data) {
    const coveredReference = `${data.referenceValueAvailableCount}/${data.count}`;
    const coveredPerformance = `${data.performanceAvailableCount}/${data.count}`;
    return `<section class="customer-portfolio-metrics"><article><span>Owned holdings</span><strong>${escapeHtml(data.count)}</strong></article><article><span>Total cost basis</span><strong>${escapeHtml(moneyCents(data.totalCostBasisCents))}</strong></article><article><span>Reference coverage</span><strong>${escapeHtml(coveredReference)}</strong></article><article><span>Performance coverage</span><strong>${escapeHtml(coveredPerformance)}</strong></article></section>`;
  }

  function coveragePanel(data) {
    const hasHoldings = Number(data.count) > 0;
    const completeReference = data.completeReferenceCoverage === true;
    const completePerformance = data.completePerformanceCoverage === true;
    const coverageLabel = !hasHoldings
      ? "No holdings yet"
      : completeReference
        ? "Complete coverage"
        : "Partial coverage";
    const coverageTone = !hasHoldings ? "neutral" : completeReference ? "ok" : "warn";
    const totalReference = !hasHoldings
      ? "No holdings to evaluate"
      : completeReference
      ? moneyCents(data.completePortfolioReferenceValueCents)
      : "Unavailable until every holding passes evidence gates";
    const totalDelta = !hasHoldings
      ? "No holdings to evaluate"
      : completePerformance
      ? signedMoneyCents(data.completePortfolioReferenceDeltaCents)
      : "Unavailable until every holding has reference + cost basis";
    return `<div class="customer-portfolio-grid"><section class="panel"><header class="panel-header"><div><h2>Coverage-aware totals</h2><p>FlipForge never extrapolates uncovered holdings.</p></div>${badge(coverageLabel, coverageTone)}</header><div class="panel-body customer-portfolio-key-grid"><div><span>Whole-portfolio reference</span><strong>${escapeHtml(totalReference)}</strong></div><div><span>Whole-portfolio reference delta</span><strong>${escapeHtml(totalDelta)}</strong></div><div><span>Covered reference subtotal</span><strong>${escapeHtml(moneyCents(data.coveredReferenceValueCents))}</strong></div><div><span>Covered cost basis</span><strong>${escapeHtml(moneyCents(data.coveredCostBasisCents))}</strong></div><div><span>Covered reference delta</span><strong>${escapeHtml(signedMoneyCents(data.coveredReferenceDeltaCents))}</strong></div><div><span>Method</span><strong>Accepted exact completed-sale average</strong></div></div></section><section class="panel"><header class="panel-header"><div><h2>What this number is not</h2><p>The evidence reference is intentionally narrower than a generic market-price claim.</p></div></header><div class="panel-body customer-portfolio-boundaries"><div><span>✓</span><p><strong>Completed sales only</strong><small>At least 3 accepted exact sales; newest sale must be 30 days old or less.</small></p></div><div><span>×</span><p><strong>No active asks</strong><small>Current listings and fixed-price asks do not become completed-sale evidence.</small></p></div><div><span>×</span><p><strong>Not an appraisal or what you would receive</strong><small>The reference is an average of completed sales. It does not subtract selling fees, taxes or shipping.${sellWatchData() ? " To see what you would keep after your own selling costs, use Check a price on a card." : ""}</small></p></div></div></section></div>`;
  }

  function pageMarkup() {
    const actions = `<a class="button button-secondary" href="#/tracking">Tracking</a><a class="button button-secondary" href="#/evidence">Evidence</a><button class="button button-secondary" type="button" data-customer-portfolio-refresh>Refresh</button>`;
    if (state.loading) return `<div class="page customer-portfolio-page">${pageHeading(actions)}${loadingPanel()}</div>`;
    if (state.error) return `<div class="page customer-portfolio-page">${pageHeading(actions)}${errorPanel(state.error)}</div>`;
    if (state.health?.data?.status !== "configured") return `<div class="page customer-portfolio-page">${pageHeading(actions)}${offlinePanel()}</div>`;
    const data = state.portfolio?.data;
    if (!data) return `<div class="page customer-portfolio-page">${pageHeading(actions)}${errorPanel({ code: "PORTFOLIO_CONTRACT_INVALID", message: "Portfolio data was not returned." })}</div>`;
    const watch = sellWatchData();
    const sales = salesData();
    const realized = sales ? realizedPanel(sales) : "";
    if (valuesPaused(data)) {
      return `<div class="page customer-portfolio-page" data-portfolio-state="paused">${pageHeading(actions)}${pausedSummary(data)}${pausedPanel(watch)}${watch ? sellWatchPanel(watch) : ""}${pausedRows(data, watch)}${realized}</div>`;
    }
    return `<div class="page customer-portfolio-page">${pageHeading(actions)}${boundary("Evidence-supported reference value is explanatory market context, not a new Smart Opportunity recommendation, appraisal, guaranteed sale value, or transaction instruction.")}${summary(data)}${coveragePanel(data)}${watch && data.count > 0 ? sellWatchPanel(watch) : ""}${portfolioRows(data)}${realized}</div>`;
  }

  function renderCurrent() {
    if (!state.main) return;
    state.main.innerHTML = pageMarkup();
    state.main.querySelector("[data-customer-portfolio-refresh]")?.addEventListener("click", load);
  }

  // Sell Watch is optional: Portfolio renders as soon as its own reads finish, and the Sell Watch section is added
  // when (and if) its response arrives. A response from an earlier load is ignored.
  async function loadSellWatch(generation) {
    try {
      const watch = await request("/api/v1/sell-watch");
      if (generation !== state.generation) return;
      state.sellWatch = validSellWatch(watch) ? watch : null;
    } catch (_) {
      // Sell Watch switched off (404) or unavailable: Portfolio shows no Sell Watch section; nothing else changes.
      if (generation !== state.generation) return;
      state.sellWatch = null;
    }
    if (state.sellWatch && !state.loading && !state.error) renderCurrent();
  }

  async function loadSales(generation) {
    try {
      const sales = await request("/api/v1/reported-sales");
      if (generation !== state.generation) return;
      state.sales = validSales(sales) ? sales : null;
    } catch (_) {
      // Mark as Sold switched off (404) or unavailable: no Sold cards section; nothing else changes.
      if (generation !== state.generation) return;
      state.sales = null;
    }
    if (state.sales && !state.loading && !state.error) renderCurrent();
  }

  async function load() {
    const generation = ++state.generation;
    state.loading = true;
    state.error = null;
    state.health = null;
    state.portfolio = null;
    state.opportunities = null;
    state.sellWatch = null;
    state.sales = null;
    renderCurrent();
    try {
      state.health = await request("/api/v1/health");
      if (state.health?.data?.status !== "configured") return;
      const [portfolio, opportunities] = await Promise.all([
        request("/api/v1/portfolio"),
        request("/api/v1/opportunities")
      ]);
      if (!validPortfolio(portfolio)) {
        throw Object.assign(new Error("The Portfolio response failed the evidence-reference contract."), { code: "PORTFOLIO_REFERENCE_CONTRACT_INVALID" });
      }
      if (!validOpportunities(opportunities)) {
        throw Object.assign(new Error("The tracked-card list failed the Portfolio display contract."), { code: "PORTFOLIO_OPPORTUNITIES_INVALID" });
      }
      if (generation !== state.generation) return;
      state.portfolio = portfolio;
      state.opportunities = opportunities;
      if (Number(portfolio.data.count) > 0) loadSellWatch(generation);
      loadSales(generation);
    } catch (error) {
      if (generation !== state.generation) return;
      state.error = error;
    } finally {
      if (generation === state.generation) {
        state.loading = false;
        renderCurrent();
      }
    }
  }

  function render(main) {
    if (!eligibleHost()) return false;
    state.main = main;
    load();
    return true;
  }

  window.FlipForgeCustomerPortfolio = Object.freeze({
    isEligible: eligibleHost,
    render,
    refresh: load
  });
})();
