(() => {
  "use strict";

  const prototypeData = window.FlipForgePrototypeData;
  const main = document.querySelector("#main-content");
  if (!main) return;

  const CONTRACT_VERSION = "1.0";
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
  const number = new Intl.NumberFormat("en-US");

  const state = {
    source: "initializing",
    rows: [],
    primaryId: "",
    compareId: "",
    detail: null,
    evidence: null,
    psa: null,
    comparison: null,
    meta: null,
    loading: false,
    contextLoading: false,
    error: null,
    requestSerial: 0
  };

  function productionHost() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function serverEligible() {
    const host = String(window.location.hostname || "");
    const path = String(window.location.pathname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host)) && APP_PATH.test(path);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function route() {
    return (window.location.hash.replace(/^#\/?/, "").split("/")[0] || "dashboard").split("?")[0];
  }

  function correlationId() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `decision-intelligence-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function safeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return currency.format(safeNumber(value));
  }

  function moneyOrUnavailable(value, available = true) {
    return available ? money(value) : "Unavailable";
  }

  function pct(value, max) {
    const safeMax = Math.max(1, safeNumber(max));
    return Math.max(0, Math.min(100, safeNumber(value) / safeMax * 100));
  }

  function validEnvelope(payload, expectedCorrelationId) {
    const meta = payload?.meta;
    return Boolean(meta)
      && meta.contractVersion === CONTRACT_VERSION
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId
      && Object.prototype.hasOwnProperty.call(payload, "data");
  }

  function allowedPath(path) {
    const value = String(path || "");
    if (value === "/api/v1/opportunities") return value;
    if (value.length > 512) throw new Error("Decision Intelligence path exceeds the safety limit.");

    const direct = value.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor)\/([^/?#]+)$/);
    if (direct) {
      let id = "";
      try { id = decodeURIComponent(direct[2]); } catch (_) { throw new Error("Invalid saved opportunity identifier."); }
      if (!SAFE_ID.test(id)) throw new Error("Invalid saved opportunity identifier.");
      return value;
    }

    if (value.startsWith("/api/v1/compare?")) {
      const url = new URL(value, "https://decision-intelligence.invalid");
      if (url.pathname !== "/api/v1/compare" || url.searchParams.getAll("ids").length !== 1) {
        throw new Error("Decision Intelligence comparison path is not allowlisted.");
      }
      const ids = String(url.searchParams.get("ids") || "").split(",");
      if (ids.length !== 2 || new Set(ids).size !== 2 || ids.some(id => !SAFE_ID.test(id))) {
        throw new Error("Decision Intelligence comparison identifiers are invalid.");
      }
      return value;
    }

    throw new Error("Decision Intelligence path is not allowlisted.");
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      throw Object.assign(new Error("The Decision Intelligence response exceeded the browser safety limit."), {
        code: "DECISION_INTELLIGENCE_RESPONSE_TOO_LARGE"
      });
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw Object.assign(new Error("The Decision Intelligence gateway returned invalid JSON."), {
        code: "DECISION_INTELLIGENCE_INVALID_JSON"
      });
    }
  }

  async function request(path) {
    const safePath = allowedPath(path);
    const requestCorrelationId = correlationId();
    const response = await fetch(safePath, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "X-Correlation-Id": requestCorrelationId
      }
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Decision Intelligence request failed with status ${response.status}.`), {
        code: upstream.code || "DECISION_INTELLIGENCE_REQUEST_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    if (!validEnvelope(payload, requestCorrelationId)) {
      throw Object.assign(new Error("The Decision Intelligence response failed the FlipForge authority contract."), {
        code: "DECISION_INTELLIGENCE_CONTRACT_INVALID"
      });
    }
    return payload;
  }

  function normalizeServerRow(item, freshness = "UNKNOWN") {
    const acceptedSales = Math.max(0, safeNumber(item?.evidence?.acceptedSales));
    const supportedValue = safeNumber(item?.supportedValue);
    const supportedAvailable = acceptedSales > 0 && supportedValue > 0;
    return {
      id: String(item?.id || ""),
      shortCard: String(item?.title || item?.cardIdentity || item?.id || "Saved card"),
      cardIdentity: String(item?.cardIdentity || ""),
      recommendation: String(item?.recommendation || "UNKNOWN"),
      ask: safeNumber(item?.ask),
      supported: supportedValue,
      supportedAvailable,
      confidence: safeNumber(item?.confidence),
      liquidity: safeNumber(item?.liquidity),
      risk: safeNumber(item?.risk),
      rank: safeNumber(item?.rank),
      evidence: acceptedSales,
      identity: item?.cardIdentity ? "Saved exact identity" : "Unavailable",
      mappingState: String(item?.mappingState || "UNKNOWN"),
      freshness: String(freshness || "UNKNOWN"),
      population: item?.population && typeof item.population === "object" ? item.population : null,
      raw: item
    };
  }

  function normalizePrototypeRows() {
    const rows = Array.isArray(prototypeData?.opportunities) ? prototypeData.opportunities : [];
    return rows.map(item => ({
      ...item,
      supportedAvailable: safeNumber(item.supported) > 0,
      cardIdentity: String(item.card || item.shortCard || item.id || ""),
      mappingState: String(item.identity || "UNKNOWN"),
      population: null,
      raw: item
    }));
  }

  function rowById(id) {
    return state.rows.find(item => item.id === id) || state.rows[0] || null;
  }

  function optionMarkup(selectedId) {
    return state.rows.map(item => `<option value="${escapeHtml(item.id)}"${item.id === selectedId ? " selected" : ""}>${escapeHtml(item.shortCard)} · ${escapeHtml(item.recommendation)}</option>`).join("");
  }

  function comparePath(leftId, rightId) {
    if (!SAFE_ID.test(leftId) || !SAFE_ID.test(rightId) || leftId === rightId) {
      throw new Error("Choose two different saved opportunities.");
    }
    return `/api/v1/compare?ids=${encodeURIComponent(`${leftId},${rightId}`)}`;
  }

  function sourceBadge() {
    if (state.source === "server") return `<span class="ff-di-source ff-di-source-server">SERVER-OWNED · READ ONLY</span>`;
    if (state.source === "prototype") return `<span class="ff-di-source ff-di-source-prototype">PREVIEW · PROTOTYPE CONTRACT DATA</span>`;
    return `<span class="ff-di-source">LOADING</span>`;
  }

  function valueVisual(row) {
    const supportedForScale = row.supportedAvailable ? row.supported : 0;
    const max = Math.max(1, row.ask, supportedForScale);
    const gap = row.supportedAvailable ? row.supported - row.ask : 0;
    const gapPercent = row.supportedAvailable && row.supported > 0 ? gap / row.supported * 100 : 0;
    return `
      <div class="ff-di-value-bars" aria-label="Ask and supported value visualization">
        <div class="ff-di-bar-row"><span>Current ask</span><div class="ff-di-track"><span style="--ff-width:${pct(row.ask, max)}%;--ff-color:var(--ff-ui-blue)"></span></div><strong>${money(row.ask)}</strong></div>
        <div class="ff-di-bar-row"><span>Supported value</span><div class="ff-di-track"><span style="--ff-width:${row.supportedAvailable ? pct(row.supported, max) : 0}%;--ff-color:var(--ff-ui-green)"></span></div><strong>${moneyOrUnavailable(row.supported, row.supportedAvailable)}</strong></div>
      </div>
      <div class="ff-di-gap"><span>Saved value gap · before outside costs</span><strong>${row.supportedAvailable ? `${gap >= 0 ? "+" : ""}${money(gap)} · ${gapPercent.toFixed(1)}%` : "Withheld · exact evidence required"}</strong></div>`;
  }

  function factorVisual(row) {
    const factors = [
      ["Confidence", row.confidence, "var(--ff-ui-green)"],
      ["Liquidity", row.liquidity, "var(--ff-ui-blue)"],
      ["Risk", row.risk, "var(--ff-ui-orange)"],
      ["Opportunity rank", row.rank, "var(--ff-ui-gold)"]
    ];
    return `<div class="ff-di-factor-list">${factors.map(([label, value, color]) => `
      <div class="ff-di-factor">
        <div class="ff-di-factor-head"><span>${escapeHtml(label)}</span><strong>${safeNumber(value)}/100</strong></div>
        <div class="ff-di-track"><span style="--ff-width:${Math.max(0, Math.min(100, safeNumber(value)))}%;--ff-color:${color}"></span></div>
      </div>`).join("")}</div>`;
  }

  function evidenceVisual(row) {
    if (state.contextLoading && state.source === "server") {
      return `<div class="ff-di-empty">Loading server-owned evidence readiness…</div>`;
    }

    const serverEvidence = state.source === "server" ? state.evidence?.data : null;
    const accepted = state.source === "server"
      ? Math.max(0, safeNumber(serverEvidence?.acceptedExactCompletedSales))
      : Math.max(0, safeNumber(row.evidence));
    const ineligible = state.source === "server" ? Math.max(0, safeNumber(serverEvidence?.visibleButAuthorityIneligible)) : 0;
    const hasIdentity = Boolean(row.cardIdentity || serverEvidence?.cardIdentity);
    const fresh = String(row.freshness || "").toUpperCase();
    const population = state.source === "server" ? state.psa?.data?.populationContext : null;
    const populationAvailable = population?.available === true;

    const items = [
      {
        label: "Saved exact identity",
        status: hasIdentity ? "Present" : "Unavailable",
        detail: hasIdentity ? String(serverEvidence?.cardIdentity || row.cardIdentity) : "No saved exact-card identity was returned.",
        state: hasIdentity ? "good" : "warn"
      },
      {
        label: "Accepted exact completed sales",
        status: accepted ? `${accepted} accepted` : "None accepted",
        detail: accepted ? "Only currently authority-eligible exact completed sales are counted." : "No exact completed-sale evidence currently supports value authority.",
        state: accepted ? "good" : "warn"
      },
      {
        label: "Visible but ineligible",
        status: state.source === "server" ? `${ineligible} visible` : "Preview context",
        detail: state.source === "server" ? "Rejected, mismatched, active, or otherwise ineligible evidence stays visible without influencing supported value." : "Preview data demonstrates the evidence boundary only.",
        state: ineligible > 0 ? "warn" : "context"
      },
      {
        label: "Evidence freshness",
        status: row.freshness || "Unknown",
        detail: fresh.includes("CURRENT") ? "The authority envelope reports current evidence context." : "Freshness remains visible rather than being silently converted into confidence.",
        state: fresh.includes("CURRENT") ? "good" : "context"
      },
      {
        label: "Population context",
        status: populationAvailable ? "Saved snapshot available" : "Not attached",
        detail: populationAvailable ? "Population is display-only context and never becomes sold evidence or a grade prediction." : "No saved population snapshot is attached to this selected opportunity.",
        state: "context"
      }
    ];

    return `<div class="ff-di-evidence-list">${items.map(item => `
      <div class="ff-di-evidence-item" data-state="${item.state}">
        <div class="ff-di-evidence-head"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.status)}</strong></div>
        <small>${escapeHtml(item.detail)}</small>
      </div>`).join("")}</div>`;
  }

  function serverPopulationVisual() {
    if (state.contextLoading) return `<div class="ff-di-empty">Loading saved PSA population context…</div>`;
    const psa = state.psa?.data;
    const population = psa?.populationContext;
    if (!population || population.available !== true) {
      return `<div class="ff-di-empty">No saved exact-card PSA population snapshot is attached to this opportunity.<br>FlipForge leaves the visual empty instead of borrowing population from another card.</div>`;
    }

    const metrics = [
      ["PSA 10", safeNumber(population.psa10Population)],
      ["PSA 9", safeNumber(population.psa9Population)],
      ["Total", safeNumber(population.totalPopulation)]
    ].filter(([, value]) => value > 0);

    if (!metrics.length) {
      return `<div class="ff-di-pop-context"><strong>Saved population context available</strong><span>${escapeHtml(population.capturedAt || population.status || "Exact-card saved snapshot")}</span><small>Counts were not exposed in this customer-safe projection. No browser estimate was substituted.</small></div>`;
    }

    const max = Math.max(...metrics.map(([, value]) => value), 1);
    return `<div class="ff-di-pop-grid" aria-label="Saved PSA population context">${metrics.map(([label, value]) => `
      <div class="ff-di-pop-column"><strong>${number.format(value)}</strong><span class="ff-di-pop-bar" style="--ff-height:${Math.max(12, pct(value, max))}%"></span><span>${escapeHtml(label)}</span></div>`).join("")}</div>`;
  }

  function prototypePopulationVisual(row) {
    const advisor = prototypeData?.psaAdvisor;
    if (!advisor || row.id !== advisor.cardId || !Array.isArray(advisor.population) || !advisor.population.length) {
      return `<div class="ff-di-empty">No saved PSA population snapshot is attached to this preview opportunity.<br>FlipForge leaves the visual empty instead of borrowing population from another card.</div>`;
    }
    const max = Math.max(...advisor.population.map(item => safeNumber(item.count)), 1);
    return `<div class="ff-di-pop-grid" aria-label="Prototype PSA population distribution">${advisor.population.map(item => `
      <div class="ff-di-pop-column"><strong>${number.format(safeNumber(item.count))}</strong><span class="ff-di-pop-bar" style="--ff-height:${Math.max(12, pct(item.count, max))}%"></span><span>${escapeHtml(item.grade)}</span></div>`).join("")}</div>`;
  }

  function populationVisual(row) {
    return state.source === "server" ? serverPopulationVisual() : prototypePopulationVisual(row);
  }

  function compareSide(row) {
    const gap = row.supportedAvailable ? row.supported - row.ask : 0;
    return `<article class="ff-di-compare-side">
      <header><h3>${escapeHtml(row.shortCard)}</h3><span class="ff-di-decision">${escapeHtml(row.recommendation)}</span></header>
      <div class="ff-di-compare-metrics">
        <div><span>Ask</span><strong>${money(row.ask)}</strong></div>
        <div><span>Supported</span><strong>${moneyOrUnavailable(row.supported, row.supportedAvailable)}</strong></div>
        <div><span>Value gap</span><strong>${row.supportedAvailable ? `${gap >= 0 ? "+" : ""}${money(gap)}` : "Withheld"}</strong></div>
        <div><span>Confidence</span><strong>${safeNumber(row.confidence)}/100</strong></div>
        <div><span>Liquidity</span><strong>${safeNumber(row.liquidity)}/100</strong></div>
        <div><span>Risk</span><strong>${safeNumber(row.risk)}/100</strong></div>
        <div><span>Evidence</span><strong>${safeNumber(row.evidence)}</strong></div>
        <div><span>Identity</span><strong>${escapeHtml(row.cardIdentity ? "Saved" : "Unavailable")}</strong></div>
      </div>
    </article>`;
  }

  function comparisonRows(primary, fallbackComparison) {
    const items = state.source === "server" && Array.isArray(state.comparison?.data?.items)
      ? state.comparison.data.items
      : [];
    if (items.length === 2) {
      return items.map(item => normalizeServerRow(item, state.comparison?.meta?.evidenceFreshness || state.meta?.evidenceFreshness));
    }
    return [primary, fallbackComparison];
  }

  function loadingMarkup(message = "Loading server-owned Decision Intelligence…") {
    return `<div class="page ff-di-page"><section class="ff-di-loading" role="status"><span class="ff-di-source">SERVER-OWNED · READ ONLY</span><strong>${escapeHtml(message)}</strong><p>FlipForge is reading saved governed records. No browser recommendation or fallback decision is being generated.</p></section></div>`;
  }

  function errorMarkup(error) {
    const guidance = error?.status === 401
      ? "Sign in with an invited FlipForge private-beta account."
      : error?.status === 403
        ? "The signed-in account needs an active FlipForge tenant membership."
        : "The authoritative customer projection is temporarily unavailable.";
    const signIn = error?.status === 401
      ? `<a class="button button-primary" href="/production-auth.html?return=%2Fapp%2F%23%2Fdecision-intelligence">Sign in securely</a>`
      : "";
    return `<div class="page ff-di-page"><section class="ff-di-error" role="alert"><span class="ff-di-source">AUTHORITY FAIL-CLOSED</span><strong>${escapeHtml(error?.code || "DECISION_INTELLIGENCE_UNAVAILABLE")}</strong><h1>Decision Intelligence is unavailable.</h1><p>${escapeHtml(error?.message || guidance)}</p><small>${escapeHtml(guidance)} No mock record, browser-generated recommendation, population estimate, or substitute evidence was shown.</small>${signIn}</section></div>`;
  }

  function render() {
    if (route() !== "decision-intelligence") return;
    if (state.loading || state.source === "initializing") {
      main.innerHTML = loadingMarkup();
      return;
    }
    if (state.error && state.source === "error") {
      main.innerHTML = errorMarkup(state.error);
      return;
    }
    if (!state.rows.length) {
      main.innerHTML = `<div class="page ff-di-page"><section class="ff-di-empty"><strong>No saved decisions yet.</strong><span>Evaluate and save an exact card before opening Decision Intelligence.</span><a class="button button-primary" href="#/evaluate">Evaluate a card</a></section></div>`;
      return;
    }

    const primary = rowById(state.primaryId);
    if (!primary) return;
    state.primaryId = primary.id;

    let fallbackComparison = rowById(state.compareId);
    if (!fallbackComparison || fallbackComparison.id === primary.id) {
      fallbackComparison = state.rows.find(item => item.id !== primary.id) || primary;
      state.compareId = fallbackComparison.id;
    }

    const [comparePrimary, compareSecondary] = comparisonRows(primary, fallbackComparison);
    const gap = primary.supportedAvailable ? primary.supported - primary.ask : 0;
    const sourceCopy = state.source === "server"
      ? "Every visual below is derived from tenant-owned, server-returned saved intelligence. The browser presents the records; it does not become an authority."
      : "This deploy-preview fallback uses clearly labeled prototype contract data for visual QA only. Production never falls back to these records.";

    main.innerHTML = `<div class="page ff-di-page" data-decision-intelligence-source="${escapeHtml(state.source)}">
      <section class="ff-di-hero">
        <div class="ff-di-hero-copy">
          ${sourceBadge()}
          <span class="eyebrow">Decision Intelligence</span>
          <h1>See the evidence behind the decision.</h1>
          <p>${escapeHtml(sourceCopy)}</p>
        </div>
        <aside class="ff-di-hero-state" aria-label="Selected saved opportunity summary">
          <div class="ff-di-state-top"><span>Selected saved opportunity</span><strong>${escapeHtml(primary.recommendation)}</strong></div>
          <div class="ff-di-state-value"><div><span>Ask</span><strong>${money(primary.ask)}</strong></div><span class="ff-di-state-arrow" aria-hidden="true">→</span><div><span>Supported</span><strong>${moneyOrUnavailable(primary.supported, primary.supportedAvailable)}</strong></div></div>
          <div class="ff-di-state-meta"><span>${escapeHtml(primary.cardIdentity ? "Saved identity" : "Identity unavailable")}</span><span>${safeNumber(primary.evidence)} accepted sales</span><span>${primary.supportedAvailable ? `${gap >= 0 ? "+" : ""}${money(gap)} gap` : "Value withheld"}</span></div>
        </aside>
      </section>

      <section class="ff-di-controls" aria-label="Decision Intelligence selectors">
        <div class="ff-di-control"><label for="ff-di-primary">Primary opportunity</label><select id="ff-di-primary">${optionMarkup(primary.id)}</select></div>
        <div class="ff-di-control"><label for="ff-di-compare">Compare with</label><select id="ff-di-compare">${optionMarkup(fallbackComparison.id)}</select></div>
      </section>

      <section class="ff-di-grid" aria-label="Saved decision visualizations">
        <article class="ff-di-card ff-di-card-value"><span class="ff-di-mini-label">01 · VALUE</span><h2>Ask vs Supported Value</h2><p>Visualizes the saved price relationship. It does not recalculate supported value.</p>${valueVisual(primary)}</article>
        <article class="ff-di-card ff-di-card-factors"><span class="ff-di-mini-label">02 · FACTORS</span><h2>Decision Factors</h2><p>Shows existing saved confidence, liquidity, risk and rank values without creating a second score authority.</p>${factorVisual(primary)}</article>
        <article class="ff-di-card ff-di-card-evidence"><span class="ff-di-mini-label">03 · EVIDENCE</span><h2>Evidence Readiness</h2><p>Shows exact saved identity, currently eligible completed-sale evidence, visible exclusions and freshness.</p>${evidenceVisual(primary)}</article>
        <article class="ff-di-card ff-di-card-population"><span class="ff-di-mini-label">04 · POPULATION</span><h2>PSA Population Context</h2><p>Displays only saved exact-card population context returned by the existing PSA authority. Missing context stays missing.</p>${populationVisual(primary)}</article>
        <article class="ff-di-card ff-di-card-compare"><span class="ff-di-mini-label">05 · COMPARE</span><h2>Direct Comparison</h2><p>Uses saved independent records. The backend does not rerank, rescore, select a winner, or change either recommendation.</p><div class="ff-di-compare-grid">${compareSide(comparePrimary)}${compareSide(compareSecondary)}</div></article>
      </section>

      <div class="ff-di-authority"><strong>Authority preserved</strong><span>Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. Existing PSA intelligence remains the sole grading-guidance authority. Decision Intelligence performs read-only same-origin GET requests only; it cannot accept evidence, predict a grade, recalculate a recommendation, persist a hypothetical result, bid, checkout, buy, sell, or authorize any transaction.</span></div>
    </div>`;

    document.querySelectorAll("[data-route]").forEach(link => {
      if (link.dataset.route === "decision-intelligence") link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    const primarySelector = document.querySelector("#ff-di-primary");
    const compareSelector = document.querySelector("#ff-di-compare");
    primarySelector?.addEventListener("change", () => {
      state.primaryId = primarySelector.value;
      if (state.compareId === state.primaryId) state.compareId = state.rows.find(item => item.id !== state.primaryId)?.id || state.primaryId;
      void loadSelectedContext();
    });
    compareSelector?.addEventListener("change", () => {
      state.compareId = compareSelector.value;
      if (state.compareId === state.primaryId) state.compareId = state.rows.find(item => item.id !== state.primaryId)?.id || state.primaryId;
      void loadSelectedContext();
    });

    main.focus({ preventScroll: true });
  }

  async function loadSelectedContext() {
    if (state.source !== "server") {
      render();
      return;
    }
    const primary = rowById(state.primaryId);
    let comparison = rowById(state.compareId);
    if (!primary) return;
    if (!comparison || comparison.id === primary.id) {
      comparison = state.rows.find(item => item.id !== primary.id) || primary;
      state.compareId = comparison.id;
    }

    const serial = ++state.requestSerial;
    state.contextLoading = true;
    state.detail = null;
    state.evidence = null;
    state.psa = null;
    state.comparison = null;
    render();

    try {
      const encoded = encodeURIComponent(primary.id);
      const requests = [
        request(`/api/v1/opportunities/${encoded}`),
        request(`/api/v1/evidence/${encoded}`),
        request(`/api/v1/psa-advisor/${encoded}`)
      ];
      if (comparison && comparison.id !== primary.id) requests.push(request(comparePath(primary.id, comparison.id)));
      const [detail, evidence, psa, compare] = await Promise.all(requests);
      if (serial !== state.requestSerial || route() !== "decision-intelligence") return;
      state.detail = detail;
      state.evidence = evidence;
      state.psa = psa;
      state.comparison = compare || null;

      const returned = detail?.data?.opportunity;
      if (returned && String(returned.id || "") === primary.id) {
        const normalized = normalizeServerRow(returned, detail?.meta?.evidenceFreshness || state.meta?.evidenceFreshness);
        const index = state.rows.findIndex(item => item.id === primary.id);
        if (index >= 0) state.rows[index] = normalized;
      }
    } catch (error) {
      if (serial !== state.requestSerial) return;
      state.error = error;
      if (productionHost()) state.source = "error";
    } finally {
      if (serial === state.requestSerial) {
        state.contextLoading = false;
        render();
      }
    }
  }

  async function loadServerRows() {
    const serial = ++state.requestSerial;
    state.loading = true;
    state.error = null;
    state.source = "initializing";
    render();
    try {
      const payload = await request("/api/v1/opportunities");
      if (serial !== state.requestSerial || route() !== "decision-intelligence") return;
      const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
      state.meta = payload.meta;
      state.rows = items
        .filter(item => SAFE_ID.test(String(item?.id || "")))
        .map(item => normalizeServerRow(item, payload.meta?.evidenceFreshness));
      state.source = "server";
      state.primaryId = state.rows[0]?.id || "";
      state.compareId = state.rows.find(item => item.id !== state.primaryId)?.id || state.primaryId;
      state.loading = false;
      render();
      if (state.primaryId) await loadSelectedContext();
    } catch (error) {
      if (serial !== state.requestSerial) return;
      state.error = error;
      state.loading = false;
      if (productionHost()) {
        state.source = "error";
        state.rows = [];
      } else if (Array.isArray(prototypeData?.opportunities)) {
        state.source = "prototype";
        state.rows = normalizePrototypeRows();
        state.primaryId = prototypeData?.psaAdvisor?.cardId || state.rows[0]?.id || "";
        state.compareId = state.rows.find(item => item.id !== state.primaryId)?.id || state.primaryId;
      } else {
        state.source = "error";
        state.rows = [];
      }
      render();
    }
  }

  function activate() {
    if (route() !== "decision-intelligence") return;
    state.requestSerial++;
    state.detail = null;
    state.evidence = null;
    state.psa = null;
    state.comparison = null;
    state.error = null;

    if (serverEligible()) {
      void loadServerRows();
      return;
    }

    if (!productionHost() && Array.isArray(prototypeData?.opportunities)) {
      state.source = "prototype";
      state.rows = normalizePrototypeRows();
      state.primaryId = prototypeData?.psaAdvisor?.cardId || state.rows[0]?.id || "";
      state.compareId = state.rows.find(item => item.id !== state.primaryId)?.id || state.primaryId;
      state.loading = false;
      render();
      return;
    }

    state.source = "error";
    state.error = Object.assign(new Error("No authoritative Decision Intelligence datasource is available."), {
      code: "DECISION_INTELLIGENCE_SOURCE_UNAVAILABLE"
    });
    render();
  }

  window.addEventListener("hashchange", () => window.requestAnimationFrame(activate));
  window.addEventListener("pageshow", () => window.requestAnimationFrame(activate));
  window.requestAnimationFrame(activate);
})();