(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const PATHS = Object.freeze({
    health: "/api/v1/health",
    dashboard: "/api/v1/dashboard",
    opportunities: "/api/v1/opportunities"
  });
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

  const main = document.querySelector("#main-content");
  let generation = 0;
  let lastSnapshot = null;
  const emitted = new Set();
  // /api/conversion-event accepts allowlisted names only. Home events are sent with this fixed page name and a fixed
  // placement: never the raw path, URL, hash route, query string, card, id or any user data.
  const EVENT_PAGE = "beta-app";
  const RETURNING_PLACEMENTS = Object.freeze({ saved: "returning_saved", outcomes: "returning_outcomes", heat: "returning_heat", portfolio: "returning_portfolio" });

  // This file is the single owner of the Dashboard ("Home") route. Everything a customer sees on it is rendered
  // here in its final form: the Home heading and first-use / returning panels, the Private Beta "Start here" panel,
  // final labels and copy, the duplicate-identity rule and the Private Beta supported-value rule. No other script
  // rewrites, relabels, hides or inserts into this page.
  function betaSurface() {
    try {
      return !document.documentElement.classList.contains("ff-full-customer-app");
    } catch (_) {
      return false;
    }
  }

  // "%150" in a stored title is the card number "#150".
  function normalizeCardDisplay(value) {
    return String(value ?? "")
      .replace(/(^|\s)%(\d{1,4})(?=\s|$)/g, "$1#$2")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sameIdentity(left, right) {
    const a = normalizeCardDisplay(left).toLocaleLowerCase("en-US");
    const b = normalizeCardDisplay(right).toLocaleLowerCase("en-US");
    return Boolean(a && b && a === b);
  }

  // Server enum values (for example mappingState NOT_CONFIRMED) are shown in words.
  function prettyEnum(value) {
    const raw = String(value || "").trim();
    if (!/^[A-Z][A-Z0-9_]+$/.test(raw) || !raw.includes("_")) {
      return { CONFIRMED: "Confirmed", UNKNOWN: "Unknown" }[raw] || raw;
    }
    return raw.toLowerCase().split("_").filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  }

  // Customer wording for messages that come from the gateway or the request helper.
  function customerMessage(value) {
    return String(value ?? "")
      .replaceAll("authority contract", "service validation")
      .replaceAll("tenant-owned", "saved")
      .replaceAll("tenant-scoped", "account-specific");
  }

  const DIAGNOSTIC_MESSAGE = /(invalid json|authority contract|authority boundary|browser safety limit|request failed with status|response exceeded)/i;
  const TECHNICAL_CODE = /^[A-Z][A-Z0-9_:-]{4,}$/;

  function emit(event, placement) {
    const key = `${event}:${placement}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    const body = JSON.stringify({ event, page: EVENT_PAGE, placement });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/api/conversion-event", new Blob([body], { type: "application/json" }))) return;
      fetch("/api/conversion-event", { method: "POST", headers: { "Content-Type": "application/json" }, body, credentials: "same-origin", cache: "no-store", keepalive: true }).catch(() => {});
    } catch (_) {}
  }

  function appEligible() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
  }

  function productionHost() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function numberOrNull(value) {
    // Number(null) and Number("") are 0. A missing server value must stay missing:
    // rendering it as $0 (and computing a Value Gap against it) presents a value the
    // authoritative service never returned.
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    if (typeof value !== "number" && typeof value !== "string") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function supportedValueText(value) {
    return numberOrNull(value) === null ? "Not established" : money(value);
  }

  function safeNumber(value) {
    return numberOrNull(value) ?? 0;
  }

  function money(value) {
    const number = numberOrNull(value);
    if (number === null) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(number);
  }

  function integer(value) {
    const number = numberOrNull(value);
    return number === null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number);
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `ff-dashboard-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      const error = new Error("The dashboard response exceeded the browser safety limit.");
      error.code = "DASHBOARD_RESPONSE_TOO_LARGE";
      throw error;
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      const error = new Error("The customer gateway returned invalid JSON.");
      error.code = "DASHBOARD_INVALID_JSON";
      throw error;
    }
  }

  function validHealth(payload, requestCorrelationId) {
    return Boolean(payload && payload.meta && payload.data)
      && payload.meta.contractVersion === CONTRACT_VERSION
      && payload.meta.correlationId === requestCorrelationId;
  }

  function validAuthorityEnvelope(payload, requestCorrelationId) {
    const meta = payload && payload.meta;
    return Boolean(meta)
      && meta.contractVersion === CONTRACT_VERSION
      && meta.correlationId === requestCorrelationId
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && Object.prototype.hasOwnProperty.call(payload, "data");
  }

  async function request(path, health = false) {
    if (!Object.values(PATHS).includes(path)) throw new Error("Dashboard API path is not allowlisted.");
    const requestCorrelationId = correlationId();
    const response = await fetch(path, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Correlation-Id": requestCorrelationId
      },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload && payload.error ? payload.error : {};
      const error = new Error(upstream.message || `Customer request failed with status ${response.status}.`);
      error.code = upstream.code || "DASHBOARD_REQUEST_FAILED";
      error.status = response.status;
      error.correlationId = upstream.correlationId || requestCorrelationId;
      throw error;
    }
    const valid = health
      ? validHealth(payload, requestCorrelationId)
      : validAuthorityEnvelope(payload, requestCorrelationId);
    if (!valid) {
      const error = new Error("The customer response failed the FlipForge authority contract.");
      error.code = "DASHBOARD_CONTRACT_INVALID";
      throw error;
    }
    return payload;
  }

  function relativeTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Live tenant data";
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return "Updated just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `Updated ${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Updated ${hours} hr ago`;
    return `Updated ${date.toLocaleDateString()}`;
  }

  function recommendationPill(value) {
    const label = String(value || "UNKNOWN").toUpperCase();
    const state = label.toLowerCase().replace(/[^a-z]/g, "");
    return `<span class="ff-recommendation-pill" data-state="${escapeHtml(state)}">${escapeHtml(label)}</span>`;
  }

  function percentOf(part, total) {
    return total > 0 ? (part / total) * 100 : 0;
  }

  function confidenceBins(items) {
    const bins = [
      { label: "80 – 100", min: 80, max: 100, color: "#38b84f", count: 0 },
      { label: "60 – 79", min: 60, max: 79.999, color: "#e7b72f", count: 0 },
      { label: "40 – 59", min: 40, max: 59.999, color: "#e56b32", count: 0 },
      { label: "20 – 39", min: 20, max: 39.999, color: "#df403e", count: 0 },
      { label: "0 – 19", min: 0, max: 19.999, color: "#5d6670", count: 0 }
    ];
    items.forEach(item => {
      const confidence = numberOrNull(item && item.confidence);
      if (confidence === null) return;
      const bin = bins.find(entry => confidence >= entry.min && confidence <= entry.max);
      if (bin) bin.count += 1;
    });
    return bins;
  }

  function factorRow(label, value, kind = "normal") {
    const number = numberOrNull(value);
    const bounded = number === null ? 0 : Math.max(0, Math.min(100, number));
    const fill = kind === "risk"
      ? "linear-gradient(90deg,#8f332f,#e05a4e)"
      : "linear-gradient(90deg,#b98c1e,#e2bf58)";
    return `<div class="ff-factor-row"><span>${escapeHtml(label)}</span><span class="ff-factor-track"><span style="width:${bounded}%;background:${fill}"></span></span><strong>${number === null ? "—" : `${Math.round(number)}`}</strong></div>`;
  }

  function kpiCard(label, value, note, tone = "neutral") {
    return `<article class="ff-kpi-card" data-tone="${escapeHtml(tone)}"><span class="ff-kpi-label">${escapeHtml(label)}</span><strong class="ff-kpi-value">${escapeHtml(value)}</strong><small class="ff-kpi-note">${escapeHtml(note)}</small></article>`;
  }

  function errorMarkup(error) {
    const status = Number(error && error.status) || 0;
    const code = String(error && error.code || "DASHBOARD_UNAVAILABLE");
    const message = customerMessage(status === 401
      ? "Sign in with an invited FlipForge account to load saved intelligence."
      : status === 403
        ? "This signed-in account does not currently have one active FlipForge tenant membership."
        : String(error && error.message || "The dashboard could not load authoritative customer data."));
    // Internal diagnostics (invalid JSON, size limits, raw status lines) are never shown to a customer.
    if (DIAGNOSTIC_MESSAGE.test(message)) {
      return `<div class="ff-commercial-error" role="alert" data-ff-error-code="${escapeHtml(code)}">This intelligence view is temporarily unavailable. Try again.</div>`;
    }
    const signIn = status === 401
      ? `<a class="button button-primary" href="${productionHost() ? "/production-auth.html?return=%2Fapp%2F%23%2Fdashboard" : "/staging-auth.html?returnTo=%2Fsaas-prototype%2F%23%2Fdashboard"}">Sign in securely</a>`
      : "";
    const heading = TECHNICAL_CODE.test(code) ? "We couldn't complete that request." : code;
    // The service code stays on the element for support; the customer reads plain words.
    return `<div class="ff-commercial-error" role="alert" data-ff-error-code="${escapeHtml(code)}"><strong>${escapeHtml(heading)}</strong><p>${escapeHtml(message)}</p>${signIn}</div>`;
  }

  function emptySpotlight() {
    return `<section class="ff-v2-panel"><div class="ff-v2-panel-body ff-commercial-empty"><strong>No saved decisions yet.</strong><p>Evaluate one exact card to create the first saved Smart Opportunity record.</p><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div></section>`;
  }

  function decisionSpotlight(item) {
    if (!item) return emptySpotlight();
    const title = normalizeCardDisplay(item.title || item.cardIdentity || "Saved FlipForge decision");
    const identity = normalizeCardDisplay(item.cardIdentity || "Exact-card identity returned by the authoritative service");
    const confidence = numberOrNull(item.confidence);
    const ask = numberOrNull(item.ask);
    const sales = decisionSales(item);
    const exactSales = sales.count;
    const supported = supportedShown(item, sales) ? numberOrNull(item.supportedValue) : null;
    const gap = ask !== null && supported !== null ? supported - ask : null;
    const withheldValue = betaSurface() && supported === null;
    const id = String(item.id || "");
    const detailHref = SAFE_ID.test(id) ? `#/opportunities/${encodeURIComponent(id)}` : "#/opportunities";

    return `<section class="ff-v2-panel">
      <div class="ff-v2-panel-body">
        <div class="ff-decision-spotlight">
          <div class="ff-decision-identity">
            <span class="ff-decision-kicker">Decision spotlight · server order preserved</span>
            ${recommendationPill(item.recommendation)}
            <h2>${escapeHtml(title)}</h2>
            <p${sameIdentity(title, identity) ? ' hidden aria-hidden="true"' : ""}>${escapeHtml(identity)}</p>
            <div class="ff-decision-stats">
              <div><span>Ask</span><strong>${escapeHtml(money(ask))}</strong></div>
              <div><span>Supported value</span><strong>${withheldValue ? "Unavailable" : escapeHtml(supportedValueText(supported))}</strong></div>
              <div><span>Value gap</span><strong class="${gap !== null && gap > 0 ? "ff-positive" : ""}">${withheldValue ? "Unavailable" : gap === null ? "—" : escapeHtml(money(gap))}</strong></div>
              <div><span>${sales.atDecision ? "Exact sales at decision" : "Exact accepted sales"}</span><strong>${sales.withheld ? "Withheld" : exactSales === null ? "Unavailable" : escapeHtml(integer(exactSales))}</strong></div>
            </div>
            <div class="ff-dashboard-actions"><a class="button button-primary" href="${detailHref}">View full analysis</a><a class="button button-secondary" href="#/tracking">Open watchlist</a></div>
          </div>
          <div class="ff-confidence-block">
            <div class="ff-confidence-ring" style="--confidence:${confidence === null ? 0 : Math.max(0, Math.min(100, confidence))}"><div class="ff-confidence-ring-copy"><strong>${confidence === null ? "—" : Math.round(confidence)}</strong><span>Decision confidence</span></div></div>
            <div class="ff-factor-list">
              ${factorRow("Confidence", item.confidence)}
              ${factorRow("Liquidity", item.liquidity)}
              ${factorRow("Risk", item.risk, "risk")}
              ${factorRow("Rank", item.rank)}
            </div>
          </div>
        </div>
      </div>
    </section>`;
  }

  function distributionPanel(items) {
    const bins = confidenceBins(items);
    const total = bins.reduce((sum, bin) => sum + bin.count, 0);
    const percentages = bins.map(bin => percentOf(bin.count, total));
    const donutStyle = total
      ? `--a:${percentages[0]};--b:${percentages[1]};--c:${percentages[2]};--d:${percentages[3]};--e:${percentages[4]}`
      : "background:#303943";
    return `<section class="ff-v2-panel">
      <header class="ff-v2-panel-head"><div><h2>Saved confidence distribution</h2><p>Display-only aggregation of server-returned confidence scores. No browser rescoring or reranking.</p></div></header>
      <div class="ff-v2-panel-body ff-distribution">
        <div class="ff-donut" style="${donutStyle}"><div class="ff-donut-copy"><strong>${total}</strong><span>scored records</span></div></div>
        <div class="ff-distribution-list">${bins.map(bin => `<div class="ff-distribution-row"><i style="background:${bin.color}"></i><span>${bin.label}</span><strong>${bin.count}${total ? ` · ${percentOf(bin.count,total).toFixed(0)}%` : ""}</strong></div>`).join("")}</div>
      </div>
    </section>`;
  }

  function marketIndexPanel() {
    return `<section class="ff-v2-panel">
      <header class="ff-v2-panel-head"><div><h2>Market Index</h2><p>Market-wide trend intelligence</p></div><span class="ff-recommendation-pill" data-state="watch">NOT CONFIGURED</span></header>
      <div class="ff-v2-panel-body ff-market-placeholder"><strong>—</strong><p>FlipForge does not yet have an authoritative market-wide index engine. This panel intentionally stays blank rather than presenting a fabricated index or chart.</p><div class="ff-market-baseline" aria-hidden="true"></div></div>
    </section>`;
  }

  // Exact sales behind a saved decision (2026-10-31). Sale records are no longer kept, so today's accepted-sale
  // count is 0 even for a decision made on 8 exact sales; the saved receipt's own count is shown, labelled
  // "at decision". Legacy results and records without a governed receipt keep the current count.
  function decisionSales(item) {
    const governed = item && item.governedDecision;
    const trust = window.FlipForgeTrustDisplay;
    const legacy = trust && typeof trust.isLegacy === "function" && trust.isLegacy(item);
    // A legacy result's evidence is withheld: no count is shown, not even today's 0.
    if (legacy) return { count: null, atDecision: false, withheld: true };
    // A saved decision with no recorded count shows "Unavailable"; today's count is never used in its place.
    if (governed && governed.available === true) {
      const count = numberOrNull(governed.exactTrustedCompCount);
      return { count: count !== null && count >= 0 ? count : null, atDecision: true };
    }
    return { count: numberOrNull(item && item.evidence && item.evidence.acceptedSales), atDecision: false };
  }

  // Private Beta: a supported value is shown only when it rests on at least one exact sale (the saved receipt's count
  // for a governed decision, otherwise today's accepted count) and is above zero; otherwise it reads "Unavailable".
  // The spotlight and the table use this same rule.
  function supportedShown(item, sales) {
    if (!betaSurface()) return true;
    const supported = numberOrNull(item && item.supportedValue);
    return !sales.withheld && sales.count !== null && sales.count > 0 && supported !== null && supported > 0;
  }

  function recentDecisions(items) {
    if (!items.length) return `<div class="ff-v2-panel-body ff-commercial-empty"><strong>No recent decisions.</strong><p>Saved Smart Opportunity records will appear here after evaluation.</p></div>`;
    const rows = items.slice(0, 6).map(item => {
      const id = String(item.id || "");
      const href = SAFE_ID.test(id) ? `#/opportunities/${encodeURIComponent(id)}` : "#/opportunities";
      const title = normalizeCardDisplay(item.title || item.cardIdentity || id || "Saved decision");
      const identity = normalizeCardDisplay(item.cardIdentity || item.platform || "Saved record");
      const sales = decisionSales(item);
      const exactSales = sales.count;
      const supported = supportedShown(item, sales) ? supportedValueText(item.supportedValue) : "Unavailable";
      // data-ff-mobile-label carries the column name for the stacked phone layout.
      const cell = (label, html) => `<td data-ff-mobile-label="${label}">${html}</td>`;
      return `<tr>${cell("Card", `<a href="${href}">${escapeHtml(title)}</a><br><small${sameIdentity(title, identity) ? ' hidden aria-hidden="true"' : ""}>${escapeHtml(identity)}</small>`)}${cell("Decision", recommendationPill(item.recommendation))}${cell("Ask", escapeHtml(money(item.ask)))}${cell("Supported", escapeHtml(supported))}${cell("Confidence", numberOrNull(item.confidence) === null ? "—" : `${Math.round(Number(item.confidence))}`)}${cell("Exact sales", `${sales.withheld ? "Withheld" : exactSales === null ? "Unavailable" : escapeHtml(integer(exactSales))}${sales.atDecision ? "<small> at decision</small>" : ""}`)}${cell("Mapping", escapeHtml(prettyEnum(item.mappingState || "UNKNOWN")))}</tr>`;
    }).join("");
    return `<div class="ff-v2-table-wrap"><table class="ff-v2-table"><thead><tr><th>Card</th><th>Decision</th><th>Ask</th><th>Supported</th><th>Confidence</th><th>Exact sales</th><th>Mapping</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function attentionPanel(metrics, tracked) {
    const needsVerification = safeNumber(metrics.needsVerification);
    const evidenceReady = safeNumber(metrics.evidenceReady);
    const populationReady = safeNumber(metrics.populationContextAvailable);
    const evidenceDetail = tracked > 0 ? `${evidenceReady} of ${tracked} tracked decisions are provider-mapped with accepted sales.` : "No tracked decision count is available yet.";
    const populationDetail = tracked > 0 ? `${populationReady} of ${tracked} tracked decisions include saved PSA population context.` : "No tracked decision count is available yet.";
    return `<section class="ff-v2-panel"><header class="ff-v2-panel-head"><div><h2>Attention queue</h2><p>Server-reported states that deserve review. This is not an external notification service.</p></div><a class="panel-link" href="#/alerts">Open alerts →</a></header><div class="ff-v2-panel-body ff-attention-list">
      <div class="ff-attention-item"><span class="ff-attention-icon">${needsVerification > 0 ? "!" : "✓"}</span><span><strong>${needsVerification > 0 ? `${needsVerification} decision${needsVerification === 1 ? "" : "s"} need verification` : "No verification backlog reported"}</strong><small>${needsVerification > 0 ? "Open the saved decision and resolve the server-reported review state before relying on it." : "The dashboard endpoint currently reports zero decisions needing verification."}</small></span></div>
      <div class="ff-attention-item"><span class="ff-attention-icon">E</span><span><strong>Evidence coverage</strong><small>${escapeHtml(evidenceDetail)}</small></span></div>
      <div class="ff-attention-item"><span class="ff-attention-icon">P</span><span><strong>PSA context</strong><small>${escapeHtml(populationDetail)}</small></span></div>
    </div></section>`;
  }

  // Private Beta "Start here" panel. The rest of the dashboard stays collapsed behind "Show full dashboard".
  function guidedHomePanel() {
    return `<section class="ffguided-home" data-ffguided-home aria-label="Start a card decision"><div class="ffguided-home-copy"><span>START HERE</span><h2>What card are you considering?</h2><p>Find the exact card, check the evidence and understand your next move.</p><a href="#/discover" class="button button-primary ffguided-home-cta">◇ Evaluate a card →</a></div><div class="ffguided-home-steps"><div><b>01</b><span>Find the exact card</span></div><div><b>02</b><span>Check the evidence</span></div><div><b>03</b><span>Understand the decision</span></div></div><div class="ffguided-home-footer"><a href="#/opportunities">Saved Decisions →</a><button type="button" data-ffguided-more aria-expanded="false">Show full dashboard ↓</button></div></section>`;
  }

  function firstUsePanel() {
    return `<section class="ff-p3-activation ff-p3-home-zero ff-p3-enter" data-ff-p3-activation data-flipforge-phase3-owned="first-use">
      <div class="ff-p3-home-zero-grid">
        <div class="ff-p3-home-zero-copy">
          <span class="ff-p3-kicker">START HERE · YOUR FIRST DECISION</span>
          <h2>Evaluate your first card.</h2>
          <p>Start with one real card. FlipForge confirms the exact card, checks matched sales, compares the price, measures uncertainty, and then explains the decision.</p>
          <div class="ff-p3-actions">
            <a class="button button-primary" href="#/discover" data-ff-p3-first-evaluate>Find a card to evaluate</a>
            <a class="button button-secondary" href="#/evaluate">Enter a listing manually</a>
          </div>
          <a class="ff-p3-home-learn" href="#/decision-intelligence">New to FlipForge? See the four checks →</a>
        </div>
        <div class="ff-p3-home-path" aria-label="Your first FlipForge decision">
          <div class="ff-p3-first-step"><b>01</b><span><strong>Confirm the exact card</strong><small>Make sure the year, set, number, variant, and grade match.</small></span></div>
          <div class="ff-p3-first-step"><b>02</b><span><strong>Check matched sales</strong><small>Keep the comparisons that belong and leave the bad ones out.</small></span></div>
          <div class="ff-p3-first-step"><b>03</b><span><strong>Compare price + uncertainty</strong><small>See whether the ask is supported and how sure the evidence really is.</small></span></div>
          <div class="ff-p3-first-step"><b>04</b><span><strong>Read the decision + receipt</strong><small>BUY, WATCH, VERIFY, or PASS—with the reason trail preserved.</small></span></div>
        </div>
      </div>
      <div class="ff-p3-home-zero-footer">
        <span>Nothing else is required for your first session.</span>
        <small>Saved-decision analytics, Outcome Intelligence, Portfolio, and other tools become useful after you have real decisions to work with.</small>
      </div></section>`;
  }

  function returningPanel(tracked) {
    return `<section class="ff-p3-returning ff-p3-enter" data-ff-p3-returning data-flipforge-phase3-owned="returning-home">
      <div class="ff-p3-returning-head">
        <div><span class="ff-p3-kicker">CONTINUE YOUR INTELLIGENCE</span><h2>Your decisions are now the starting point.</h2></div>
        <p>${tracked} saved decision${tracked === 1 ? "" : "s"} in your account.</p>
      </div>
      <div class="ff-p3-returning-grid">
        <a class="ff-p3-returning-card" href="#/opportunities" data-ff-p3-return="saved"><span>01</span><strong>Saved Decisions</strong><small>Open a card to see the verdict and replay its four checks.</small></a>
        <a class="ff-p3-returning-card" href="#/tracking" data-ff-p3-return="outcomes"><span>02</span><strong>Outcome Intelligence</strong><small>See what changed after the original T0 decision.</small></a>
        <a class="ff-p3-returning-card" href="#/forge-heat" data-ff-p3-return="heat"><span>03</span><strong>Forge Heat</strong><small>Rank eligible saved opportunities after evidence qualifies them.</small></a>
        <a class="ff-p3-returning-card" href="#/portfolio" data-ff-p3-return="portfolio"><span>04</span><strong>Portfolio</strong><small>See owned cards and purchase context without invented market value.</small></a>
      </div></section>`;
  }

  function boundaryCopy() {
    const decision = betaSurface()
      ? "Smart Opportunity remains the BUY/WATCH/VERIFY/PASS decision engine. PSA Advisor provides grading guidance."
      : "Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. Existing PSA intelligence remains the sole grading-guidance authority.";
    return `<strong>Decision framework:</strong> ${decision} Confidence distribution is display-only aggregation of saved server scores. The Market Index remains unavailable until an authoritative market-index engine exists. No browser scoring, evidence acceptance, grade prediction, purchase, sale, or transaction authority is added by this dashboard.`;
  }

  function bindGuidedHome() {
    const root = main.querySelector("[data-commercial-dashboard-v2]");
    const more = root && root.querySelector("[data-ffguided-more]");
    if (!more) return;
    more.addEventListener("click", () => {
      const open = root.dataset.ffguidedFocus === "full";
      root.dataset.ffguidedFocus = open ? "simple" : "full";
      more.setAttribute("aria-expanded", String(!open));
      more.textContent = open ? "Show full dashboard ↓" : "Hide dashboard details ↑";
    });
  }

  function renderSnapshot(snapshot) {
    if (window.FlipForgeDashboardRenderer === "v3") return;
    if (!main || routeName() !== "dashboard") return;
    const dashboard = snapshot.dashboard || {};
    const opportunities = snapshot.opportunities || {};
    const metrics = dashboard.data && dashboard.data.metrics ? dashboard.data.metrics : {};
    const items = Array.isArray(opportunities.data && opportunities.data.items) ? opportunities.data.items : [];
    const tracked = safeNumber(metrics.trackedOpportunities);
    const evidenceReady = safeNumber(metrics.evidenceReady);
    const populationReady = safeNumber(metrics.populationContextAvailable);
    const reviewCount = safeNumber(metrics.needsVerification);
    const focus = items[0] || null;
    const focusConfidence = focus && numberOrNull(focus.confidence);
    const freshness = relativeTime(dashboard.meta && dashboard.meta.generatedAt || opportunities.meta && opportunities.meta.generatedAt);
    const firstUse = tracked <= 0;
    const beta = betaSurface();
    const intro = firstUse
      ? "Start with one real card. FlipForge will guide you from exact identity to evidence, decision, and Decision Receipt."
      : "Continue from your saved decisions, review what changed, and investigate the next card when you are ready.";
    const primary = firstUse
      ? `<a class="button button-primary" href="#/discover">Evaluate first card</a>`
      : `<a class="button button-primary" href="#/evaluate">+ Evaluate Card</a>`;

    main.innerHTML = `<div class="page ff-commercial-dashboard ${firstUse ? "ff-p3-zero-dashboard" : "ff-p3-returning-dashboard"}" data-commercial-dashboard-v2 data-flipforge-phase3-enhanced="${firstUse ? "dashboard:first-use" : "dashboard:returning"}"${beta ? ' data-ffguided-focus="simple"' : ""}>
      ${beta ? guidedHomePanel() : ""}
      <header class="ff-dashboard-head">
        <div><h1>Home</h1><p>${intro}</p></div>
        <div class="ff-dashboard-head-actions"><span class="ff-data-freshness">◷ ${escapeHtml(freshness)}</span><button class="button button-secondary" type="button" data-commercial-dashboard-refresh>↻ Refresh</button>${primary}</div>
      </header>
      ${firstUse ? firstUsePanel() : returningPanel(tracked)}

      <section class="ff-kpi-grid" aria-label="Authoritative dashboard metrics">
        ${kpiCard("Tracked Decisions", integer(tracked), "Saved decisions in your account")}
        ${kpiCard("Provider-mapped evidence", integer(evidenceReady), "Confirmed provider mapping + accepted sales", evidenceReady > 0 ? "good" : "neutral")}
        ${kpiCard("PSA Context", integer(populationReady), "Saved population context available")}
        ${kpiCard("Decision Confidence", focusConfidence === null ? "—" : `${Math.round(focusConfidence)}`, focus ? "Focused saved decision · not a synthetic ForgeScore" : "No saved decision available", focusConfidence !== null && focusConfidence >= 80 ? "good" : "neutral")}
        ${kpiCard("Needs Verification", integer(reviewCount), "Server-reported review state", reviewCount > 0 ? "attention" : "good")}
      </section>

      <div class="ff-dashboard-main-grid">
        <div class="ff-dashboard-stack">
          ${decisionSpotlight(focus)}
          <section class="ff-v2-panel"><header class="ff-v2-panel-head"><div><h2>Recent saved decisions</h2><p>Records stay in the order returned by the authoritative service.</p></div><a class="panel-link" href="#/opportunities">View all →</a></header>${recentDecisions(items)}</section>
        </div>
        <div class="ff-dashboard-stack">
          ${distributionPanel(items)}
          ${marketIndexPanel()}
          ${attentionPanel(metrics, tracked)}
        </div>
      </div>

      <div class="ff-dashboard-boundary">${boundaryCopy()}</div>
    </div>`;

    const refresh = main.querySelector("[data-commercial-dashboard-refresh]");
    if (refresh) refresh.addEventListener("click", () => loadDashboard(true));
    bindGuidedHome();
    if (firstUse) emit("phase3_first_use_shown", "dashboard_zero_saved");
    else emit("phase3_returning_home_shown", "dashboard_saved");
  }

  function renderLoading() {
    if (window.FlipForgeDashboardRenderer === "v3") return;
    if (!main || routeName() !== "dashboard") return;
    main.innerHTML = `<div class="page ff-commercial-dashboard" data-commercial-dashboard-v2><header class="ff-dashboard-head"><div><h1>Home</h1><p>Loading saved FlipForge intelligence.</p></div></header><div class="ff-commercial-loading" role="status">Loading authoritative dashboard data…</div></div>`;
  }

  function renderError(error) {
    if (window.FlipForgeDashboardRenderer === "v3") return;
    if (!main || routeName() !== "dashboard") return;
    main.innerHTML = `<div class="page ff-commercial-dashboard" data-commercial-dashboard-v2><header class="ff-dashboard-head"><div><h1>Home</h1><p>FlipForge fails closed when the authenticated customer intelligence path is unavailable.</p></div><div class="ff-dashboard-head-actions"><button class="button button-secondary" type="button" data-commercial-dashboard-refresh>↻ Retry</button></div></header>${errorMarkup(error)}</div>`;
    const refresh = main.querySelector("[data-commercial-dashboard-refresh]");
    if (refresh) refresh.addEventListener("click", () => loadDashboard(true));
  }

  async function loadDashboard(force = false) {
    if (window.FlipForgeDashboardRenderer === "v3") return;
    if (!appEligible() || routeName() !== "dashboard" || !main) return;
    const current = ++generation;
    if (!force && lastSnapshot) {
      renderSnapshot(lastSnapshot);
    } else {
      renderLoading();
    }
    try {
      const health = await request(PATHS.health, true);
      if (current !== generation || routeName() !== "dashboard") return;
      if (!health.data || health.data.status !== "configured" || health.data.bridgeEnabled !== true) {
        const error = new Error("The authenticated customer API bridge is not configured for this app host.");
        error.code = "CUSTOMER_API_NOT_CONFIGURED";
        throw error;
      }
      const [dashboard, opportunities] = await Promise.all([
        request(PATHS.dashboard),
        request(PATHS.opportunities)
      ]);
      if (current !== generation || routeName() !== "dashboard") return;
      lastSnapshot = { health, dashboard, opportunities };
      renderSnapshot(lastSnapshot);
    } catch (error) {
      if (current !== generation || routeName() !== "dashboard") return;
      renderError(error);
    }
  }

  function apply() {
    if (!appEligible()) return;
    // The shell (body.ff-commercial-shell, chip, plan card, banner, title) is final in each page's markup.
    if (routeName() !== "dashboard") {
      generation += 1;
      return;
    }
    loadDashboard(false);
  }

  // Dashboard V3 (Slice 2, behind the flag) hands the route back here when the
  // backend does not carry the G1 governed-decision contract.
  window.FlipForgeDashboardV2Reload = () => loadDashboard(true);

  if (main && typeof main.addEventListener === "function") {
    main.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || routeName() !== "dashboard") return;
      if (target.closest("[data-ff-p3-first-evaluate]")) emit("phase3_first_evaluate_clicked", "dashboard");
      const returning = target.closest("[data-ff-p3-return]");
      if (returning) emit("phase3_returning_action_clicked", RETURNING_PLACEMENTS[returning.getAttribute("data-ff-p3-return")] || "unknown");
    }, true);
  }

  window.addEventListener("hashchange", () => queueMicrotask(apply));
  window.addEventListener("flipforge:identity-change", () => {
    if (routeName() === "dashboard") loadDashboard(true);
  });
  queueMicrotask(apply);
})();
