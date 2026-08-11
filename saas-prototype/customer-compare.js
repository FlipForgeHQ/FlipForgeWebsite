(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const HEALTH_PATH = "/api/v1/health";
  const OPPORTUNITIES_PATH = "/api/v1/opportunities";

  const state = {
    main: null,
    health: null,
    opportunities: [],
    comparison: null,
    leftId: "",
    rightId: "",
    loading: false,
    comparing: false,
    error: null
  };

  function productionHost() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
  }

  function compareRouteActive() {
    const route = String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0];
    return route === "compare";
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

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(safeNumber(value));
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `compare-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function comparePath(leftId, rightId) {
    if (!SAFE_ID.test(leftId) || !SAFE_ID.test(rightId) || leftId === rightId) {
      throw Object.assign(new Error("Choose two different saved opportunities."), {
        code: "INVALID_COMPARISON_SELECTION"
      });
    }
    return `/api/v1/compare?ids=${encodeURIComponent(`${leftId},${rightId}`)}`;
  }

  function requireAllowedPath(path) {
    const value = String(path || "");
    if (value === HEALTH_PATH || value === OPPORTUNITIES_PATH) return value;
    if (value.length > 512 || !value.startsWith("/api/v1/compare?")) {
      throw new Error("The requested comparison path is not allowlisted.");
    }
    const url = new URL(value, "https://comparison.invalid");
    if (url.pathname !== "/api/v1/compare" || url.searchParams.getAll("ids").length !== 1) {
      throw new Error("The requested comparison path is not allowlisted.");
    }
    const ids = String(url.searchParams.get("ids") || "").split(",");
    if (ids.length !== 2 || new Set(ids).size !== 2 || ids.some(id => !SAFE_ID.test(id))) {
      throw new Error("The requested comparison identifiers are invalid.");
    }
    return value;
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

  function validHealth(payload, expectedCorrelationId) {
    return Boolean(payload?.meta && payload?.data)
      && payload.meta.contractVersion === CONTRACT_VERSION
      && payload.meta.correlationId === expectedCorrelationId;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      throw Object.assign(new Error("The comparison response exceeded the browser safety limit."), {
        code: "COMPARE_RESPONSE_TOO_LARGE"
      });
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw Object.assign(new Error("The comparison gateway returned invalid JSON."), {
        code: "COMPARE_INVALID_JSON"
      });
    }
  }

  async function request(path) {
    const safePath = requireAllowedPath(path);
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
      throw Object.assign(new Error(upstream.message || `Comparison request failed with status ${response.status}.`), {
        code: upstream.code || "COMPARE_REQUEST_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    const valid = safePath === HEALTH_PATH
      ? validHealth(payload, requestCorrelationId)
      : validEnvelope(payload, requestCorrelationId);
    if (!valid) {
      throw Object.assign(new Error("The comparison response failed the FlipForge authority contract."), {
        code: "COMPARE_CONTRACT_INVALID"
      });
    }
    return payload;
  }

  function badge(label, tone) {
    return `<span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function errorPanel(error) {
    if (!error) return "";
    const guidance = error.status === 401
      ? "Sign in with an invited account before loading tenant-owned saved records."
      : error.status === 403
        ? "The signed-in account does not have an active tenant membership."
        : "No mock comparison or browser-generated recommendation was substituted.";
    const signIn = error.status === 401
      ? `<div class="customer-intelligence-actions"><a class="button button-primary" href="${productionHost() ? "/production-auth.html?return=%2Fapp%2F%23%2Fcompare" : "/staging-auth.html?returnTo=%2Fsaas-prototype%2F%23%2Fcompare"}">Sign in securely</a></div>`
      : "";
    return `<section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error.code || "COMPARE_UNAVAILABLE")}</strong><p>${escapeHtml(error.message)}</p><small>${escapeHtml(guidance)}</small>${signIn}</div></section>`;
  }

  function optionMarkup(selectedId) {
    return state.opportunities.map(item => {
      const id = String(item.id || "");
      const label = item.title || item.cardIdentity || id;
      return `<option value="${escapeHtml(id)}" ${id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
  }

  function identityCard() {
    const data = state.comparison?.data;
    if (!data) return "";
    const same = data.sameExactCardIdentity === true;
    return `<section class="panel customer-compare-identity ${same ? "same" : "different"}"><div class="panel-body"><span class="check-mark ${same ? "ok" : "warn"}">${same ? "✓" : "!"}</span><div><span class="eyebrow">Identity relationship</span><h2>${same ? "Same exact-card identity" : "Different exact-card identities"}</h2><p>${same ? "These saved records describe the same exact card identity. Compare their saved listing context and governed outputs without treating active asks as sold evidence." : "These records are not the same exact card. Use the side-by-side view for decision context only—not as interchangeable comp evidence."}</p></div></div></section>`;
  }

  function savedCard(item, label) {
    const id = String(item?.id || "");
    const title = item?.title || item?.cardIdentity || id;
    return `<article class="customer-compare-card"><header><span>${escapeHtml(label)}</span>${badge(item?.recommendation || "UNKNOWN", String(item?.recommendation || "unknown").toLowerCase())}</header><h2>${escapeHtml(title)}</h2><p>${escapeHtml(item?.cardIdentity || "Saved exact-card identity")}</p><div class="customer-compare-card-metrics"><div><span>Ask</span><strong>${money(item?.ask)}</strong></div><div><span>Supported</span><strong>${money(item?.supportedValue)}</strong></div></div>${SAFE_ID.test(id) ? `<a class="button button-secondary" href="#/opportunities/${encodeURIComponent(id)}">Open Card Intelligence</a>` : ""}</article>`;
  }

  function comparisonTable(items) {
    const [left, right] = items;
    const rows = [
      ["Saved decision", badge(left.recommendation || "UNKNOWN", String(left.recommendation || "unknown").toLowerCase()), badge(right.recommendation || "UNKNOWN", String(right.recommendation || "unknown").toLowerCase())],
      ["Current ask", money(left.ask), money(right.ask)],
      ["Supported value", money(left.supportedValue), money(right.supportedValue)],
      ["Saved discount", `${safeNumber(left.discountPercent).toFixed(1)}%`, `${safeNumber(right.discountPercent).toFixed(1)}%`],
      ["Confidence", `${safeNumber(left.confidence)}/100`, `${safeNumber(right.confidence)}/100`],
      ["Liquidity", `${safeNumber(left.liquidity)}/100`, `${safeNumber(right.liquidity)}/100`],
      ["Risk", `${safeNumber(left.risk)}/100`, `${safeNumber(right.risk)}/100`],
      ["Rank", `${safeNumber(left.rank)}/100`, `${safeNumber(right.rank)}/100`],
      ["Accepted completed sales", String(safeNumber(left.evidence?.acceptedSales)), String(safeNumber(right.evidence?.acceptedSales))],
      ["Mapping state", escapeHtml(left.mappingState || "UNKNOWN"), escapeHtml(right.mappingState || "UNKNOWN")],
      ["Workflow", escapeHtml(left.workflowStatus || "UNKNOWN"), escapeHtml(right.workflowStatus || "UNKNOWN")],
      ["PSA 10 population", left.population?.available === true ? String(safeNumber(left.population.psa10Population)) : "Unavailable", right.population?.available === true ? String(safeNumber(right.population.psa10Population)) : "Unavailable"]
    ];
    return `<div class="table-wrap"><table class="customer-compare-table"><thead><tr><th>Saved factor</th><th>Card A</th><th>Card B</th></tr></thead><tbody>${rows.map(([label, a, b]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${a}</td><td>${b}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function resultMarkup() {
    if (state.comparing) return `<div class="staging-loading" role="status">Loading authoritative comparison…</div>`;
    const data = state.comparison?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length !== 2) return "";
    const meta = state.comparison.meta || {};
    const limitations = Array.isArray(meta.limitations) ? meta.limitations : [];
    return `${identityCard()}<section class="customer-compare-cards" aria-label="Selected saved opportunities">${savedCard(items[0], "Card A")}${savedCard(items[1], "Card B")}</section><section class="panel"><header class="panel-header"><div><h2>Saved factor comparison</h2><p>Every value is returned by the tenant-scoped authority API. No browser-side score or winner is created.</p></div><span class="staging-status staging-status-ok">SQLite records</span></header><div class="panel-body">${comparisonTable(items)}</div></section><section class="panel customer-compare-boundary"><div class="panel-body"><span class="eyebrow">Comparison boundary</span><h2>No new recommendation</h2><p>${escapeHtml(data.comparisonBoundary || "Values and recommendations are displayed exactly as saved. This view does not rerank, rescore, or select a winner.")}</p><div class="customer-compare-contract"><div><span>Engine</span><strong>${escapeHtml(meta.engineVersion || "Authoritative service")}</strong></div><div><span>Evidence freshness</span><strong>${escapeHtml(meta.evidenceFreshness || "Unavailable")}</strong></div><div><span>Records compared</span><strong>${escapeHtml(data.count)}</strong></div><div><span>Transaction authority</span><strong>None</strong></div></div>${limitations.length ? `<details><summary>Known limitations</summary><ul>${limitations.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}</div></section>`;
  }

  function pageMarkup() {
    const configured = state.health?.data?.status === "configured";
    const hasChoices = state.opportunities.length >= 2;
    return `<div class="page staging-page customer-compare-page"><header class="page-heading"><div><span class="eyebrow">Tenant-owned saved intelligence</span><h1>Direct Comparison</h1><p>Compare governed records side by side while each saved Smart Opportunity decision remains independent and unchanged.</p></div><div class="page-actions"><button class="button button-secondary" type="button" data-compare-refresh>Refresh</button><a class="button button-primary" href="#/evaluate">Evaluate another card</a></div></header><div class="boundary-note"><strong>Customer boundary:</strong> Compare reads tenant-owned SQLite records through the same-origin gateway. It never uses mock records, accepts evidence, predicts a grade, reranks cards, or authorizes a transaction.</div>${state.loading ? `<div class="staging-loading" role="status">Loading your saved comparison records…</div>` : ""}${errorPanel(state.error)}${configured && !state.loading && hasChoices ? `<section class="panel"><header class="panel-header"><div><h2>Choose two tracked records</h2><p>The backend requires two distinct saved opportunity IDs owned by this tenant.</p></div></header><div class="panel-body"><div class="compare-selectors"><div class="field"><label for="compare-left">Card A</label><select id="compare-left">${optionMarkup(state.leftId)}</select></div><button class="swap-button" type="button" data-compare-swap aria-label="Swap comparison cards">⇄</button><div class="field"><label for="compare-right">Card B</label><select id="compare-right">${optionMarkup(state.rightId)}</select></div></div></div></section>${resultMarkup()}` : ""}${configured && !state.loading && !state.error && !hasChoices ? `<section class="panel"><div class="panel-body staging-empty"><strong>Two saved opportunities are required.</strong><p>Evaluate and track at least two cards before opening Direct Comparison.</p><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div></section>` : ""}${!configured && state.health && !state.loading ? `<section class="panel"><div class="panel-body staging-empty"><strong>Direct Comparison is safely offline.</strong><p>The customer gateway is disabled, so no tenant data request was attempted and no mock comparison was substituted.</p></div></section>` : ""}</div>`;
  }

  function renderCurrent() {
    if (!state.main || !compareRouteActive()) return;
    state.main.innerHTML = pageMarkup();
    bindActions();
  }

  function selectInitial(preferredLeftId) {
    const ids = state.opportunities.map(item => String(item.id));
    const preferred = SAFE_ID.test(preferredLeftId) && ids.includes(preferredLeftId) ? preferredLeftId : "";
    state.leftId = preferred || (ids.includes(state.leftId) ? state.leftId : ids[0] || "");
    state.rightId = ids.includes(state.rightId) && state.rightId !== state.leftId
      ? state.rightId
      : ids.find(id => id !== state.leftId) || "";
  }

  async function loadComparison() {
    state.error = null;
    state.comparing = true;
    state.comparison = null;
    renderCurrent();
    try {
      const payload = await request(comparePath(state.leftId, state.rightId));
      const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
      const returnedIds = items.map(item => String(item?.id || ""));
      if (payload?.data?.kind !== "compare"
          || payload?.data?.count !== 2
          || items.length !== 2
          || returnedIds[0] !== state.leftId
          || returnedIds[1] !== state.rightId
          || typeof payload?.data?.sameExactCardIdentity !== "boolean"
          || typeof payload?.data?.comparisonBoundary !== "string") {
        throw Object.assign(new Error("The comparison response did not match the requested saved records."), {
          code: "COMPARE_CONTRACT_INVALID"
        });
      }
      state.comparison = payload;
    } catch (error) {
      state.error = error;
    } finally {
      state.comparing = false;
      renderCurrent();
    }
  }

  async function load(preferredLeftId = "") {
    state.loading = true;
    state.comparing = false;
    state.health = null;
    state.opportunities = [];
    state.comparison = null;
    state.error = null;
    renderCurrent();
    try {
      state.health = await request(HEALTH_PATH);
      if (state.health?.data?.status !== "configured") return;
      const envelope = await request(OPPORTUNITIES_PATH);
      if (envelope?.data?.kind !== "opportunities" || !Array.isArray(envelope?.data?.items)) {
        throw Object.assign(new Error("The saved opportunity list failed the comparison contract."), {
          code: "COMPARE_LIST_INVALID"
        });
      }
      const seen = new Set();
      state.opportunities = envelope.data.items.filter(item => {
        const id = String(item?.id || "");
        if (!SAFE_ID.test(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      selectInitial(String(preferredLeftId || ""));
    } catch (error) {
      state.error = error;
    } finally {
      state.loading = false;
      renderCurrent();
    }
    if (!state.error && state.opportunities.length >= 2 && compareRouteActive()) {
      await loadComparison();
    }
  }

  function bindActions() {
    if (!state.main) return;
    state.main.querySelector("[data-compare-refresh]")?.addEventListener("click", () => load(state.leftId));
    state.main.querySelector("[data-compare-swap]")?.addEventListener("click", () => {
      const left = state.leftId;
      state.leftId = state.rightId;
      state.rightId = left;
      loadComparison();
    });
    const left = state.main.querySelector("#compare-left");
    const right = state.main.querySelector("#compare-right");
    left?.addEventListener("change", () => {
      state.leftId = String(left.value || "");
      if (state.leftId === state.rightId) {
        state.rightId = state.opportunities.map(item => String(item.id)).find(id => id !== state.leftId) || "";
      }
      loadComparison();
    });
    right?.addEventListener("change", () => {
      state.rightId = String(right.value || "");
      if (state.rightId === state.leftId) {
        state.leftId = state.opportunities.map(item => String(item.id)).find(id => id !== state.rightId) || "";
      }
      loadComparison();
    });
  }

  function render(main, preferredLeftId = "") {
    if (!eligibleHost()) return false;
    state.main = main;
    load(String(preferredLeftId || ""));
    return true;
  }

  window.FlipForgeCustomerCompare = Object.freeze({
    isEligible: eligibleHost,
    render
  });
})();
