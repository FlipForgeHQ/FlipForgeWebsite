(() => {
  "use strict";

  const VERSION = "v1.0";
  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const MOUNT_SELECTOR = "[data-ff-collection-intelligence-alerts]";
  const MAX_RENDERED_SIGNALS = 20;

  let epoch = 0;
  let loading = false;
  let scheduled = 0;
  let observer = null;

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
  }

  function currentRoute() {
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

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `collection-alerts-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function pageTarget() {
    const main = document.querySelector("#main-content");
    const page = main?.querySelector?.(".customer-lifecycle-page");
    const heading = page?.querySelector?.("h1");
    if (!main || !page || String(heading?.textContent || "").trim() !== "Alerts") return null;
    return { main, page };
  }

  function validEnvelope(payload, expectedCorrelationId) {
    const meta = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.meta : null;
    const data = payload?.data;
    return Boolean(meta && data)
      && meta.contractVersion === CONTRACT_VERSION
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId
      && data.kind === "alerts"
      && data.configured === true
      && Array.isArray(data.items);
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("Collection Intelligence response exceeded the browser safety limit.");
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw new Error("Collection Intelligence gateway returned invalid JSON.");
    }
  }

  async function requestAlerts() {
    const requestCorrelationId = correlationId();
    const response = await fetch("/api/v1/alerts", {
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
    if (!response.ok) throw new Error(payload?.error?.message || `Collection Intelligence request failed with status ${response.status}.`);
    if (!validEnvelope(payload, requestCorrelationId)) throw new Error("Collection Intelligence response failed the FlipForge authority contract.");
    return payload;
  }

  function severityTone(value) {
    const severity = String(value || "INFO").toUpperCase();
    if (severity === "IMPORTANT") return "important";
    if (severity === "REVIEW") return "review";
    return "info";
  }

  function statusLabel(value) {
    const text = String(value || "").replace(/_/g, " ").trim();
    return text ? text.toLowerCase().replace(/(^|\s)\S/g, char => char.toUpperCase()) : "Review";
  }

  function signalMarkup(signal) {
    const changes = safeArray(signal?.whatChanged).filter(Boolean);
    const inspectNext = safeArray(signal?.inspectNext).filter(Boolean);
    const severity = severityTone(signal?.severity);
    const decision = signal?.governedDecision ? String(signal.governedDecision) : "No saved decision supplied";
    return `<article class="ff-collection-signal" data-severity="${escapeHtml(severity)}">
      <div class="ff-collection-signal-head">
        <div>
          <span class="ff-ci-severity ff-ci-severity-${escapeHtml(severity)}">${escapeHtml(String(signal?.severity || "INFO").toUpperCase())}</span>
          <h3>${escapeHtml(signal?.cardIdentity || "Tracked card")}</h3>
          <p>${escapeHtml(signal?.collectionName || "Collection Intelligence")} · Observed ${escapeHtml(signal?.observedAt || "time unavailable")}</p>
        </div>
        <div class="ff-ci-decision-state">
          <small>Governed decision</small>
          <strong>${escapeHtml(decision)}</strong>
          <span>${signal?.decisionChanged === true ? "Decision changed" : "Decision unchanged"}</span>
        </div>
      </div>
      <div class="ff-collection-signal-body">
        <section>
          <span class="eyebrow">What changed</span>
          ${changes.length ? `<ul>${changes.map(change => `<li>${escapeHtml(change)}</li>`).join("")}</ul>` : `<p>No customer-readable change explanation was supplied.</p>`}
        </section>
        <section>
          <span class="eyebrow">Why it matters</span>
          <p>${escapeHtml(signal?.whyItMatters || "A governed monitoring input crossed its material-change threshold and should be reviewed.")}</p>
        </section>
      </div>
      <div class="ff-collection-signal-foot">
        <div class="ff-ci-inspect-next"><span>Inspect next</span>${inspectNext.map(target => `<span class="ff-ci-chip">${escapeHtml(target)}</span>`).join("")}</div>
        <small>Review prompt only · No recommendation, grading, position, notification-delivery, or transaction authority.</small>
      </div>
    </article>`;
  }

  function renderMarkup(data) {
    const hasContract = Array.isArray(data?.collectionSignals)
      && data?.dailyIntelligence
      && typeof data.dailyIntelligence === "object";
    if (!hasContract) {
      return `<section class="panel ff-collection-intelligence" data-contract="legacy">
        <header class="panel-header"><div><span class="eyebrow">Collection Intelligence</span><h2>Daily Intelligence</h2><p>The current server revision has not exposed Collection Signals to this customer surface yet.</p></div></header>
        <div class="panel-body staging-empty"><strong>Your existing review reminders remain authoritative.</strong><p>This panel will activate only when the server supplies tenant-scoped governed Collection Signals. Nothing is reconstructed in the browser.</p></div>
      </section>`;
    }

    const signals = safeArray(data.collectionSignals).slice(0, MAX_RENDERED_SIGNALS);
    const daily = data.dailyIntelligence || {};
    const noMaterialChange = safeNumber(daily.materialChangeCount) === 0;
    return `<section class="ff-collection-intelligence" data-contract="v1">
      <section class="panel ff-daily-intelligence">
        <header class="panel-header"><div><span class="eyebrow">Collection Intelligence · Last 24 hours</span><h2>Daily Intelligence</h2><p>${escapeHtml(daily.headline || "Review material changes across your monitored cards.")}</p></div><span class="ff-ci-summary-state">${escapeHtml(statusLabel(daily.status))}</span></header>
        <div class="panel-body">
          <div class="ff-ci-metrics">
            <article><span>Material changes</span><strong>${safeNumber(daily.materialChangeCount)}</strong></article>
            <article><span>Important</span><strong>${safeNumber(daily.importantCount)}</strong></article>
            <article><span>Evidence attention</span><strong>${safeNumber(daily.evidenceAttentionCount)}</strong></article>
            <article><span>Decision changes</span><strong>${safeNumber(daily.decisionChangedCount)}</strong></article>
          </div>
          <div class="ff-ci-boundary"><strong>Signal ≠ recommendation.</strong><span>Ordinary movement is suppressed. A signal appears only after a governed monitoring threshold is crossed; Smart Opportunity remains the BUY / WATCH / VERIFY / PASS authority.</span></div>
        </div>
      </section>
      <section class="panel ff-collection-signals-panel">
        <header class="panel-header"><div><span class="eyebrow">Smarter alerts</span><h2>Collection Signals</h2><p>What changed, why it matters, whether the governed decision changed, and what to inspect next.</p></div><span class="ff-ci-summary-state">${safeNumber(data.collectionSignalCount ?? signals.length)} grouped</span></header>
        <div class="panel-body">
          ${signals.length ? `<div class="ff-collection-signals">${signals.map(signalMarkup).join("")}</div>` : `<div class="staging-empty ff-ci-empty"><strong>${noMaterialChange ? "No material changes in the last 24 hours." : "No Collection Signal cards are available."}</strong><p>FlipForge does not turn ordinary single-tick market movement into noise. When a governed threshold is crossed, the evidence-backed change will appear here.</p></div>`}
          <div class="ff-ci-delivery-note"><strong>In-app intelligence only.</strong><span>Email, SMS, push, marketplace actions, and transaction delivery remain disabled.</span></div>
        </div>
      </section>
    </section>`;
  }

  function mountMarkup(page, markup, state = "ready") {
    let mount = page.querySelector(MOUNT_SELECTOR);
    if (!mount) {
      mount = document.createElement("div");
      mount.setAttribute("data-ff-collection-intelligence-alerts", VERSION);
      const grid = page.querySelector(".customer-lifecycle-grid");
      if (grid?.parentNode) grid.parentNode.insertBefore(mount, grid);
      else page.appendChild(mount);
    }
    mount.setAttribute("data-state", state);
    mount.innerHTML = markup;
    return mount;
  }

  async function refresh(options = {}) {
    if (!eligibleHost() || currentRoute() !== "alerts") return false;
    const target = pageTarget();
    if (!target) return false;
    if (loading && options.force !== true) return false;
    const existing = target.page.querySelector(MOUNT_SELECTOR);
    if (existing?.getAttribute("data-state") === "ready" && options.force !== true) return true;

    const requestEpoch = ++epoch;
    loading = true;
    if (existing) existing.setAttribute("data-state", "loading");
    try {
      const payload = await requestAlerts();
      if (requestEpoch !== epoch || currentRoute() !== "alerts") return false;
      const current = pageTarget();
      if (!current) return false;
      mountMarkup(current.page, renderMarkup(payload.data), "ready");
      return true;
    } catch (error) {
      if (requestEpoch !== epoch || currentRoute() !== "alerts") return false;
      const current = pageTarget();
      if (!current) return false;
      mountMarkup(current.page, `<section class="panel ff-collection-intelligence" data-contract="failed-closed"><header class="panel-header"><div><span class="eyebrow">Collection Intelligence</span><h2>Daily Intelligence unavailable</h2></div></header><div class="panel-body staging-empty"><strong>Collection Signals could not be verified.</strong><p>${escapeHtml(error?.message || "The governed signal feed is unavailable.")}</p><small>The existing Alerts route remains available; no browser-only signal was created.</small></div></section>`, "error");
      return false;
    } finally {
      if (requestEpoch === epoch) loading = false;
    }
  }

  function schedule() {
    if (!eligibleHost() || currentRoute() !== "alerts") return;
    if (scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(() => {
      scheduled = 0;
      const target = pageTarget();
      if (!target) return;
      const mount = target.page.querySelector(MOUNT_SELECTOR);
      if (!mount) refresh();
    }, 0);
  }

  function start() {
    if (!eligibleHost()) return;
    window.addEventListener("hashchange", () => {
      epoch++;
      loading = false;
      schedule();
    });
    observer = new MutationObserver(schedule);
    const main = document.querySelector("#main-content");
    if (main) observer.observe(main, { childList: true, subtree: true });
    schedule();
  }

  window.FlipForgeCollectionIntelligenceAlerts = Object.freeze({
    version: VERSION,
    isEligible: eligibleHost,
    renderMarkup,
    refresh
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();