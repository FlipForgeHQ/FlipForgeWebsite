(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const SAFE_ALERT_ID = /^[a-f0-9]{64}$/;
  const ALERTS_SEEN_PATH = "/api/v1/alerts/last-seen";
  // Tracking and Alerts only. Portfolio is owned by customer-portfolio.js (the router sends it there first).
  const ROUTES = new Set(["tracking", "alerts"]);
  const FIXED_PATHS = new Set([
    "/api/v1/health",
    "/api/v1/opportunities",
    "/api/v1/lifecycle",
    "/api/v1/alerts"
  ]);
  // A request that hangs must not leave the page frozen: reads stop after 10 s, writes after 15 s.
  const READ_TIMEOUT_MS = 10000;
  const WRITE_TIMEOUT_MS = 15000;
  // The full customer app is /app/customer (and the owner preview /owner/customer). Every other app path is the
  // private-beta surface (/app/beta), which does not offer Audit export or the Tracking summary counts.
  const FULL_CUSTOMER_PATH = /^\/(?:app|owner)\/customer(?:\/|$)/i;

  const state = {
    main: null,
    route: "",
    requestedId: "",
    selectedId: "",
    loading: false,
    saving: false,
    health: null,
    opportunities: null,
    lifecycle: null,
    detail: null,
    feature: null,
    error: null,
    notice: "",
    reviewing: "",
    reviewSequence: 0,
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

  function betaSurface() {
    return !FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""));
  }

  function handles(route) {
    return ROUTES.has(String(route || ""));
  }

  function currentRouteName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function activeGeneration(generation, route) {
    return generation === state.generation
      && String(route || "") === state.route
      && currentRouteName() === String(route || "");
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
  // Display only: a score the saved snapshot did not record is "Unavailable", never 0. A real 0 stays 0.
  function timelineScore(value) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "Unavailable";
    return `${Number(value)}%`;
  }

  function moneyFromCents(value) {
    if (value === null || value === undefined || value === "") return "Not recorded";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    }).format(safeNumber(value) / 100);
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `customer-lifecycle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function allowedPath(path) {
    const value = String(path || "");
    if (FIXED_PATHS.has(value) || value === ALERTS_SEEN_PATH) return value;
    const reviewed = value.match(/^\/api\/v1\/alerts\/reviewed\/([a-f0-9]{64})$/);
    if (reviewed) return value;
    const match = value.match(/^\/api\/v1\/lifecycle\/([^/?#]+)$/);
    if (!match) throw new Error("The requested lifecycle API path is not allowlisted.");
    let decoded;
    try {
      decoded = decodeURIComponent(match[1]);
    } catch (_) {
      throw new Error("The requested lifecycle identifier is invalid.");
    }
    if (!SAFE_ID.test(decoded)) throw new Error("The requested lifecycle identifier is invalid.");
    return value;
  }

  // Saved Decisions & Tracking M1: the only non-lifecycle writes are the customer's own alert review facts.
  function alertWritePath(path) {
    return path === ALERTS_SEEN_PATH || /^\/api\/v1\/alerts\/reviewed\/[a-f0-9]{64}$/.test(path);
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

  function validDecisionTimeline(value, opportunityId) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (typeof value.available !== "boolean" || value.historicalRescoring !== false) return false;
    if (!Array.isArray(value.entries)) return false;
    if (value.available !== true) return value.entries.length === 0;
    return value.kind === "decision-timeline"
      && String(value.opportunityId || "") === String(opportunityId || "")
      && value.historicalSnapshotsImmutable === true
      && value.transactionAuthority === false;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      throw Object.assign(new Error("The lifecycle response exceeded the browser safety limit."), {
        code: "LIFECYCLE_RESPONSE_TOO_LARGE"
      });
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw Object.assign(new Error("The lifecycle gateway returned invalid JSON."), {
        code: "LIFECYCLE_INVALID_JSON"
      });
    }
  }

  async function request(path, options = {}) {
    const safePath = allowedPath(path);
    const method = String(options.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "PUT") throw new Error("The lifecycle browser allows GET and PUT only.");
    if (method === "PUT" && !/^\/api\/v1\/lifecycle\//.test(safePath) && !alertWritePath(safePath)) {
      throw new Error("Lifecycle writes require one tenant-owned saved opportunity.");
    }
    const requestCorrelationId = correlationId();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), method === "PUT" ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS) : 0;
    let response;
    let payload;
    try {
      response = await fetch(safePath, {
        method,
        headers: {
          Accept: "application/json",
          "X-Correlation-Id": requestCorrelationId,
          ...(method === "PUT" ? { "Content-Type": "application/json" } : {})
        },
        body: method === "PUT" ? JSON.stringify(options.body || {}) : undefined,
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        ...(controller ? { signal: controller.signal } : {})
      });
      payload = await parseResponse(response);
    } catch (error) {
      if (error?.name !== "AbortError") throw error;
      throw Object.assign(new Error(method === "PUT"
        ? "Saving took too long. Nothing was confirmed saved. Try again."
        : "This page took too long to load. Try again."), { code: "LIFECYCLE_TIMEOUT", status: 504 });
    } finally {
      if (timer) window.clearTimeout(timer);
    }
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Lifecycle request failed with status ${response.status}.`), {
        code: upstream.code || "LIFECYCLE_REQUEST_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    const valid = safePath === "/api/v1/health"
      ? validHealth(payload, requestCorrelationId)
      : validEnvelope(payload, requestCorrelationId);
    if (!valid) {
      throw Object.assign(new Error("The lifecycle response failed the FlipForge authority contract."), {
        code: "LIFECYCLE_CONTRACT_INVALID"
      });
    }
    return payload;
  }

  function pageHeading(eyebrow, title, description, actions = "") {
    return `<header class="page-heading"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</header>`;
  }

  // Final customer copy for each screen's heading (one sentence per subtitle; no other file rewrites it).
  const HEADINGS = Object.freeze({
    tracking: ["Decision follow-up", "Tracking", "Choose what happens next with this saved card: keep watching, set a review date, record ownership, or close it out."],
    alerts: ["Saved Decisions & Tracking", "Alerts", "What changed on cards you track, what needs a look, and what to do next."]
  });

  // Private Beta three-step workflow strip, under the page heading (formerly inserted by beta-customer-flow-v2.js).
  // Completed steps come from guided mode's saved progress; nothing here changes a decision.
  function workflowStripMarkup(current) {
    if (!betaSurface()) return "";
    let completed = new Set();
    try { completed = new Set(window.FlipForgeGuidedMode?.getProgress?.()?.completed || []); } catch (_) { completed = new Set(); }
    const steps = [["discover", "Evaluate", "#/discover"], ["understand", "Decision", "#/opportunities"], ["track", "Track", "#/tracking"]];
    return `<nav class="ff-workflow-strip" data-ff-workflow-strip aria-label="Your FlipForge card workflow">${steps.map(([key, label, href], index) => {
      const done = completed.has(key);
      return `<a class="ff-workflow-step" href="${href}" data-done="${done}"${key === current ? ' aria-current="step"' : ""}><span class="ff-workflow-step-number">${done ? "\u2713" : index + 1}</span><span>${label}</span></a>`;
    }).join("")}</nav>`;
  }

  function routeHeading(actions = "", title = "") {
    const [eyebrow, defaultTitle, description] = HEADINGS[state.route] || HEADINGS.tracking;
    return pageHeading(eyebrow, title || defaultTitle, description, actions) + (state.route === "tracking" ? workflowStripMarkup("track") : "");
  }

  // Decision chips carry the plain-language meaning of the saved decision for hover and screen readers.
  const DECISION_COPY = Object.freeze({
    BUY: "The saved evidence supports this purchase at the evaluated price, within the stated risks and limits.",
    WATCH: "There may be an opportunity here, but the price or evidence is not strong enough yet.",
    VERIFY: "There is not enough matching evidence yet to make this purchase confidently.",
    PASS: "The current evidence does not justify this purchase at the evaluated price."
  });

  function badge(label, tone = "neutral", record = null) {
    const decision = String(label || "").trim().toUpperCase();
    const reason = decision === "PASS" && record && window.FlipForgeTrustDisplay?.passReasonText ? window.FlipForgeTrustDisplay.passReasonText(record) : null;
    const meaning = Object.prototype.hasOwnProperty.call(DECISION_COPY, decision) && String(label).trim() === decision ? (reason || DECISION_COPY[decision]) : "";
    const decisionAttributes = meaning ? ` data-ff-decision="${decision}" title="${escapeHtml(meaning)}" aria-label="${escapeHtml(`${decision}. ${meaning}`)}"` : "";
    return `<span class="staging-status staging-status-${escapeHtml(tone)}"${decisionAttributes}>${escapeHtml(label)}</span>`;
  }

  function decisionKey() {
    return `<details class="ff-decision-key" data-ff-decision-key><summary>What do BUY / WATCH / VERIFY / PASS mean?</summary><div class="ff-decision-key-grid">${Object.entries(DECISION_COPY).map(([decision, meaning]) => `<div><strong>${decision}</strong><span>${escapeHtml(meaning)}</span></div>`).join("")}</div></details>`;
  }

  // Shown on every Tracking view, both app surfaces: what Tracking can and cannot do.
  function trackingBoundary() {
    return `<div class="boundary-note" data-ff-disclosure="decision-boundary"><strong>Decision boundary:</strong> Tracking records what you decide to do with a saved card. It never changes the FlipForge BUY/WATCH/VERIFY/PASS decision or executes a transaction.</div>`;
  }

  // How a saved decision is followed over time (the T7 / T14 / T30 checkpoints are filled in the Outcome panel).
  function outcomeGuide() {
    return `<section class="ff-cdi-outcome-guide" data-ff-cdi-outcome-guide><div class="ff-cdi-outcome-flow" aria-label="Outcome Intelligence checkpoints"><article data-state="baseline"><b>T0</b><strong>Original decision</strong><small>Lock the call and its reason trail.</small></article><i aria-hidden="true">→</i><article><b>T7</b><strong>First review</strong><small>See what changed one week later.</small></article><i aria-hidden="true">→</i><article><b>T14</b><strong>Reasoning check</strong><small>Ask whether the original reasoning still holds.</small></article><i aria-hidden="true">→</i><article><b>T30</b><strong>Outcome context</strong><small>Record what the later evidence showed.</small></article></div></section>`;
  }

  // Customer wording for failures. Internal diagnostics and error codes never reach the page.
  const DIAGNOSTIC = /(invalid json|authority contract|browser safety limit|request failed with status|response exceeded|not allowlisted|allows GET and PUT|identifier is invalid|failed (?:its|the) .*contract)/i;
  function customerErrorMessage(error) {
    const code = String(error?.code || "");
    if (code === "LIFECYCLE_TIMEOUT") return "FlipForge stopped a request that was taking too long instead of leaving this page frozen. Your saved record was not replaced or changed.";
    if (error?.status === 401) return "Your session has ended. Sign in again to see your saved cards.";
    if (code === "RESOURCE_NOT_FOUND" || error?.status === 404) return "This saved card was not found in your account.";
    const message = String(error?.message || "");
    if (!message || DIAGNOSTIC.test(message)) return "This view is temporarily unavailable. Try again.";
    return message;
  }

  function errorPanel(error) {
    const signIn = error?.status === 401
      ? `<a class="button button-primary" href="${productionHost() ? `/production-auth.html?return=${encodeURIComponent(`/app/#/${state.route}`)}` : `/staging-auth.html?returnTo=${encodeURIComponent(`/saas-prototype/#/${state.route}`)}`}">Sign in securely</a>`
      : "";
    const retry = `<button class="button button-primary" type="button" data-lifecycle-retry>${state.route === "alerts" ? "Try alerts again" : "Try tracking again"}</button>`;
    return `<section class="panel staging-error consumer-state consumer-state-error" role="alert"><div class="panel-body"><strong>We couldn't complete that request.</strong><p>${escapeHtml(customerErrorMessage(error))}</p><small>Nothing was changed.</small>${signIn}${retry}</div></section>`;
  }

  function offlinePanel() {
    return `<section class="panel"><div class="panel-body staging-empty consumer-state consumer-state-empty"><strong>This page is offline right now.</strong><p>FlipForge could not reach your account, so nothing was loaded or changed.</p></div></section>`;
  }

  function opportunityItems() {
    return safeArray(state.opportunities?.data?.items).filter(item => SAFE_ID.test(String(item?.id || "")));
  }

  function lifecycleItems() {
    return safeArray(state.lifecycle?.data?.items).filter(item => SAFE_ID.test(String(item?.opportunityId || "")));
  }

  // Card names are shown with the card-number sign ("#150"); some saved titles carry "%150".
  // Display only: a manufacturer repeated in a legacy saved title is shown once (card-brand-display.js); the record is unchanged.
  function collapseRepeatedManufacturer(value) {
    const collapse = window.FlipForgeCardBrandDisplay?.collapseRepeatedManufacturer;
    return typeof collapse === "function" ? collapse(value) : value;
  }
  function cardDisplay(value) {
    return collapseRepeatedManufacturer(String(value ?? "")
      .replace(/(^|\s)%(\d{1,4})(?=\s|$)/g, "$1#$2")
      .replace(/\s+/g, " ")
      .trim());
  }

  function titleFor(id) {
    const opportunity = opportunityItems().find(item => String(item.id) === String(id));
    return cardDisplay(opportunity?.title || opportunity?.cardIdentity || String(id || "Saved opportunity"));
  }

  function chosenLifecycle() {
    return state.detail?.data?.lifecycle
      || lifecycleItems().find(item => String(item.opportunityId) === state.selectedId)
      || null;
  }

  // A card evaluated more than once has one saved decision per evaluation; the list numbers them so each stays distinct.
  function selector() {
    const items = lifecycleItems();
    if (!items.length) return "";
    const titles = items.map(item => titleFor(item.opportunityId));
    const totals = new Map();
    titles.forEach(title => totals.set(title.toLowerCase(), (totals.get(title.toLowerCase()) || 0) + 1));
    const seen = new Map();
    const labels = titles.map(title => {
      const key = title.toLowerCase();
      const total = totals.get(key);
      if (total < 2) return title;
      seen.set(key, (seen.get(key) || 0) + 1);
      return `${title} · saved ${seen.get(key)} of ${total}`;
    });
    const duplicates = [...totals.values()].some(total => total > 1);
    return `<label class="customer-management-selector"><span>Tracking this card</span><select data-lifecycle-select>${items.map((item, index) => `<option value="${escapeHtml(item.opportunityId)}" ${item.opportunityId === state.selectedId ? "selected" : ""}>${escapeHtml(labels[index])}</option>`).join("")}</select></label>${duplicates ? `<small class="ff-tracking-duplicate-note" data-ff-tracking-duplicate-note>Some cards were evaluated more than once. Each saved decision stays separate so you can track the exact evaluation you meant.</small>` : ""}`;
  }

  function localDateTime(value) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const pad = number => String(number).padStart(2, "0");
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  }

  function dateOnly(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  }

  function selected(value, expected) {
    return String(value || "") === expected ? "selected" : "";
  }

  function decisionTone(decision) {
    const value = String(decision || "").toUpperCase();
    if (value === "BUY") return "buy";
    if (value === "PASS") return "danger";
    if (value === "VERIFY" || value === "WATCH") return "warn";
    return "neutral";
  }

  // Plain-language history (2026-10-31): structured change codes become customer sentences, ISO times become dates.
  function changeLinesFor(entry) {
    const trust = window.FlipForgeTrustDisplay;
    return trust?.customerChangeLines ? trust.customerChangeLines(entry) : safeArray(entry?.whatChanged);
  }
  function whenText(value, fallback) {
    const trust = window.FlipForgeTrustDisplay;
    const text = trust?.readableDateTime ? trust.readableDateTime(value) : String(value || "");
    return text || fallback;
  }
  const HISTORY_EVENTS = Object.freeze({ CREATED: "Saved", UPDATED: "Updated", EXTERNAL_UPDATE: "Updated elsewhere", ARCHIVED: "Archived", RESTORED: "Restored" });
  const TRACKING_WORDS = Object.freeze({ WATCHING: "Watching", REVIEW: "Needs review", OWNED: "Owned", SOLD: "Sold", PASSED: "Passed", ARCHIVED: "Archived" });
  const OUTCOME_WORDS = Object.freeze({ NONE: "No outcome recorded", ACQUIRED: "Bought", SOLD: "Sold", PASSED: "Passed" });
  function plainCode(map, value, fallback) {
    const code = String(value || "").toUpperCase();
    if (!code) return fallback;
    return map[code] || code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ");
  }

  // A saved snapshot with no evidence-supported value records 0 (or nothing): that is "not established", never "$0.00",
  // which reads as "worth nothing" (review 2026-10-31; seen on a production VERIFY).
  function establishedValue(cents) {
    const number = cents === null || cents === undefined || cents === "" ? NaN : Number(cents);
    return Number.isFinite(number) && number > 0 ? moneyFromCents(number) : "Not established";
  }

  function timelineEntryMarkup(entry, index) {
    const changes = changeLinesFor(entry);
    const wouldChange = safeArray(entry?.whatWouldChange);
    const changeMarkup = changes.length
      ? `<div class="customer-decision-timeline-changes"><strong>What changed</strong><ul>${changes.map(change => `<li>${escapeHtml(change)}</li>`).join("")}</ul></div>`
      : `<p class="customer-decision-timeline-baseline">${index === 0 ? "Baseline governed snapshot." : "No governed decision inputs changed from the previous saved snapshot."}</p>`;
    const wouldChangeMarkup = wouldChange.length
      ? `<details class="customer-decision-timeline-conditions"><summary>What would change this decision?</summary><ul>${wouldChange.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>`
      : "";
    return `<article class="customer-decision-timeline-entry" data-changed="${entry?.changedFromPrevious === true}"><div class="customer-decision-timeline-entry-head"><div>${window.FlipForgeTrustDisplay ? window.FlipForgeTrustDisplay.legacyMarkup(entry, { compact: true }) : ""}<span>${escapeHtml(whenText(entry?.evaluatedAt, "Time unavailable"))}</span><strong>${index === 0 ? "T0 · Original saved decision" : `Saved decision ${index + 1}`}</strong></div>${badge(entry?.decision || "UNKNOWN", decisionTone(entry?.decision))}</div><div class="customer-decision-timeline-signals"><span><small>Ask</small><strong>${moneyFromCents(entry?.allInAskCents)}</strong></span><span><small>Supported Value</small><strong>${window.FlipForgeTrustDisplay?.isLegacy(entry) ? "Not currently supported" : establishedValue(entry?.supportedValueCents)}</strong>${window.FlipForgeTrustDisplay ? window.FlipForgeTrustDisplay.legacySavedValuesMarkup(entry) : ""}</span><span><small>Confidence</small><strong>${escapeHtml(timelineScore(entry?.confidence))}</strong></span><span><small>Risk</small><strong>${escapeHtml(timelineScore(entry?.risk))}</strong></span><span><small>Evidence</small><strong>${escapeHtml(plainCode({ REVIEW: "Needs review" }, entry?.evidenceQuality, "Unavailable"))}</strong></span></div>${changeMarkup}${wouldChangeMarkup}</article>`;
  }

  function decisionTimelineMarkup() {
    const timeline = state.detail?.data?.decisionTimeline;
    if (!validDecisionTimeline(timeline, state.selectedId)) {
      return `<section class="panel customer-decision-timeline-panel"><header class="panel-header"><div><h2>Decision Timeline</h2><p>The saved decision history could not be verified from the authoritative response.</p></div>${badge("Unavailable", "warn")}</header><div class="panel-body staging-empty"><strong>Decision history unavailable.</strong><p>Tracking remains available, but FlipForge will not reconstruct or guess missing historical decisions.</p></div></section>`;
    }
    if (timeline.available !== true || !timeline.entries.length) {
      return `<section class="panel customer-decision-timeline-panel"><header class="panel-header"><div><h2>Decision Timeline</h2><p>Immutable saved evaluations and What Changed.</p></div>${badge("No history yet", "neutral")}</header><div class="panel-body staging-empty"><strong>No immutable decision history yet.</strong><p>A future governed re-evaluation can add a new saved snapshot. Historical decisions are never backfilled or rescored.</p></div></section>`;
    }
    return `<section class="panel customer-decision-timeline-panel"><header class="panel-header"><div><span class="eyebrow">Card Decision Intelligence™</span><h2>Decision Timeline</h2><p>What FlipForge believed at each saved evaluation—and what changed between them.</p></div>${badge(`${safeNumber(timeline.snapshotCount)} saved`, "ok")}</header><div class="panel-body"><div class="customer-decision-timeline-boundary"><strong>Read-only governed history.</strong><span>Snapshots are immutable. Tracking does not rescore or rewrite an earlier BUY / WATCH / VERIFY / PASS decision.</span></div><div class="customer-decision-timeline">${timeline.entries.map(timelineEntryMarkup).join("")}</div></div></section>`;
  }

  // History headings read as titles ("Saved · Watching", "Needs Review").
  function titleCase(value) {
    return String(value || "").toLowerCase().replace(/(^|\s|·)([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
  }

  function historyMarkup() {
    const history = safeArray(state.detail?.data?.history);
    if (!history.length) return `<div class="staging-empty consumer-state consumer-state-empty"><strong>No tracking changes yet.</strong><p>Your first saved Tracking update will appear here.</p></div>`;
    return `<div class="customer-lifecycle-history">${history.map(event => `<article data-history-event="${escapeHtml(event.eventType || "UPDATED")}"><span>${escapeHtml(whenText(event.recordedAt, "Time unavailable"))}</span><strong>${escapeHtml(titleCase(`${plainCode(HISTORY_EVENTS, event.eventType, "Updated")} · ${plainCode(TRACKING_WORDS, event.trackingStatus, "Status not recorded")}`))}</strong><p>${escapeHtml(plainCode(OUTCOME_WORDS, event.outcomeStatus, "No outcome recorded"))} · Update ${safeNumber(event.recordVersion)}</p></article>`).join("")}</div>`;
  }

  // Outcome Intelligence: the T7 / T14 / T30 observations the lifecycle detail returns with the saved decision.
  function validDecisionChangeIntelligence(value, opportunityId) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (typeof value.available !== "boolean") return false;
    if (value.historicalRescoring !== false || value.historicalBackfill !== false || value.transactionAuthority !== false) return false;
    if (value.available !== true) return true;
    const reconciliation = value.outcomeReconciliation;
    return value.kind === "decision-change-intelligence"
      && String(value.opportunityId || "") === String(opportunityId || "")
      && value.customerAccuracyClaimAuthorized === false
      && value.selfTrainingAuthorized === false
      && reconciliation
      && typeof reconciliation === "object"
      && !Array.isArray(reconciliation)
      && reconciliation.historicalBackfill === false
      && reconciliation.customerAccuracyClaimAuthorized === false
      && Array.isArray(reconciliation.checkpoints);
  }

  function observedMoney(value) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "Unavailable";
    return moneyFromCents(value);
  }

  function readableDate(value) {
    const trust = window.FlipForgeTrustDisplay;
    return trust?.readableDateTime ? trust.readableDateTime(String(value || ""), { dateOnly: true }) : String(value || "");
  }

  function checkpointLabel(measurementState) {
    switch (String(measurementState || "")) {
      case "MEASURABLE": return "Observed";
      case "OBSERVATION_NOT_MEASURABLE": return "Observed · limited measurement";
      case "VALUE_NOT_MEASURABLE": return "Observed · value unavailable";
      case "MISSING_OBSERVATION": return "Waiting for observation";
      default: return "Unavailable";
    }
  }

  function checkpointMarkup(checkpoint) {
    const horizon = Number(checkpoint?.horizonDays);
    const measurementState = String(checkpoint?.measurementState || "MISSING_OBSERVATION");
    const available = checkpoint?.available === true;
    const observedAt = checkpoint?.observedAt ? escapeHtml(readableDate(checkpoint.observedAt)) : "Not observed yet";
    const observedValue = available ? observedMoney(checkpoint?.observedSupportedValueCents) : "Unavailable";
    const movement = measurementState === "MEASURABLE" && Number.isFinite(Number(checkpoint?.supportedValueChangePercent))
      ? `${escapeHtml(checkpoint.supportedValueChangePercent)}%`
      : "Unavailable";
    const evidenceDelta = available && Number.isFinite(Number(checkpoint?.acceptedEvidenceDelta))
      ? `${Number(checkpoint.acceptedEvidenceDelta) > 0 ? "+" : ""}${escapeHtml(checkpoint.acceptedEvidenceDelta)}`
      : "Unavailable";
    const missingCopy = measurementState === "MISSING_OBSERVATION"
      ? `<p class="customer-outcome-waiting">FlipForge has not captured a governed T${horizon} observation. Later values are not backfilled into this checkpoint.</p>`
      : "";
    return `<article class="customer-outcome-checkpoint" data-state="${escapeHtml(measurementState)}"><div class="customer-outcome-checkpoint-head"><span class="eyebrow">T${escapeHtml(horizon)}</span><strong>${escapeHtml(checkpointLabel(measurementState))}</strong></div><div class="customer-outcome-checkpoint-grid"><span><small>Observed at</small><strong>${observedAt}</strong></span><span><small>Observed Supported Value</small><strong>${observedValue}</strong></span><span><small>Value movement</small><strong>${movement}</strong></span><span><small>Accepted evidence change</small><strong>${evidenceDelta}</strong></span></div>${missingCopy}</article>`;
  }

  function outcomePanelMarkup() {
    const value = state.detail?.data?.decisionChangeIntelligence;
    if (!validDecisionChangeIntelligence(value, state.selectedId) || value?.available !== true) {
      return `<section class="panel customer-outcome-panel" data-ff-outcome-intelligence><header class="panel-header"><div><span class="eyebrow">Outcome Intelligence</span><h2>T7 · T14 · T30</h2><p>Governed observations after the saved decision.</p></div>${badge("Unavailable", "neutral")}</header><div class="panel-body staging-empty consumer-state consumer-state-empty"><strong>Outcome checkpoints are not available yet.</strong><p>FlipForge will not infer or backfill missing observations from later values. Tracking remains available independently.</p></div></section>`;
    }
    const reconciliation = value.outcomeReconciliation || {};
    const checkpoints = safeArray(reconciliation.checkpoints);
    const byHorizon = new Map(checkpoints.map(item => [Number(item?.horizonDays), item]));
    const required = [7, 14, 30].map(horizon => byHorizon.get(horizon) || { horizonDays: horizon, measurementState: "MISSING_OBSERVATION", available: false });
    const observed = Number(reconciliation.observedCheckpointCount || 0);
    return `<section class="panel customer-outcome-panel" data-ff-outcome-intelligence><header class="panel-header"><div><span class="eyebrow">Outcome Intelligence</span><h2>T7 · T14 · T30</h2><p>What the qualified evidence showed after the saved decision.</p></div>${badge(`${observed}/3 observed`, "ok")}</header><div class="panel-body"><div class="customer-outcome-boundary"><strong>Observation, not a new recommendation.</strong><span>These checkpoints compare stored observations with the immutable T0 baseline. They do not rescore history, declare a decision right or wrong, backfill missing values, or authorize a transaction.</span></div><div class="customer-outcome-baseline"><span><small>T0 decision</small><strong>${escapeHtml(reconciliation.t0Decision || "Unavailable")}</strong></span><span><small>T0 date</small><strong>${escapeHtml(reconciliation.t0EvaluatedAt ? readableDate(reconciliation.t0EvaluatedAt) : "Unavailable")}</strong></span><span><small>T0 Supported Value</small><strong>${observedMoney(reconciliation.t0SupportedValueCents)}</strong></span></div>${observed === 0 ? `<p class="customer-outcome-waiting customer-outcome-open" data-ff-outcome-open>Each checkpoint needs completed sales of this exact card recorded after the decision. None has been recorded yet, so the checkpoints stay open. They are never filled in later from estimates.</p>` : ""}<div class="customer-outcome-checkpoints">${required.map(checkpointMarkup).join("")}</div></div></section>`;
  }

  // The outcome follows the tracking status; the customer chooses the status only.
  function syncedOutcome(status, currentOutcome) {
    switch (String(status || "").toUpperCase()) {
      case "WATCHING":
      case "REVIEW":
        return "NONE";
      case "OWNED":
        return "ACQUIRED";
      case "SOLD":
        return "SOLD";
      case "PASSED":
        return "PASSED";
      default:
        return String(currentOutcome || "NONE").toUpperCase() || "NONE";
    }
  }

  const STATUS_OPTIONS = Object.freeze([["WATCHING", "Watching"], ["REVIEW", "Review"], ["OWNED", "Owned"], ["SOLD", "Sold"], ["PASSED", "Passed"], ["ARCHIVED", "Archived"]]);
  const OUTCOME_OPTIONS = Object.freeze([["NONE", "No outcome yet"], ["ACQUIRED", "Acquired"], ["SOLD", "Sold"], ["PASSED", "Passed"]]);

  // Purchase details apply once the card is owned (or sold); sale details only once it is sold.
  function purchaseFieldsVisible(status) {
    return status === "OWNED" || status === "SOLD";
  }

  function saleFieldsVisible(status) {
    return status === "SOLD";
  }

  function lifecycleForm(lifecycle) {
    const status = String(lifecycle.trackingStatus || "WATCHING").toUpperCase();
    const outcome = syncedOutcome(status, lifecycle.outcomeStatus);
    const purchase = purchaseFieldsVisible(status) ? "" : " hidden";
    const sale = saleFieldsVisible(status) ? "" : " hidden";
    const options = (list, current) => list.map(([value, label]) => `<option value="${value}" ${selected(current, value)}>${label}</option>`).join("");
    return `<section class="panel"><header class="panel-header"><div><h2>${escapeHtml(titleFor(lifecycle.opportunityId))}</h2><p>Update how you are following this card. Changes are saved to your account.</p></div>${badge(lifecycle.trackingStatus || "WATCHING", lifecycle.trackingStatus === "OWNED" ? "buy" : lifecycle.trackingStatus === "SOLD" ? "ok" : "warn")}</header><div class="panel-body"><form class="customer-lifecycle-form" data-lifecycle-form><div class="customer-lifecycle-fields"><label><span>Status</span><select name="trackingStatus" required>${options(STATUS_OPTIONS, status)}</select></label><label data-lifecycle-outcome hidden aria-hidden="true"><span>Outcome</span><select name="outcomeStatus" required tabindex="-1">${options(OUTCOME_OPTIONS, outcome)}</select></label><label><span>Review date</span><input name="reviewAt" type="datetime-local" value="${escapeHtml(localDateTime(lifecycle.reviewAt))}"></label><label class="customer-lifecycle-check"><input name="alertEnabled" type="checkbox" ${lifecycle.alertEnabled ? "checked" : ""}><span>Remind me in FlipForge</span></label><label data-lifecycle-purchase${purchase}><span>Purchase cost</span><input name="acquisitionCost" type="number" min="0" step="0.01" value="${lifecycle.acquisitionCostCents == null ? "" : escapeHtml((lifecycle.acquisitionCostCents / 100).toFixed(2))}" placeholder="Required when owned or sold"></label><label data-lifecycle-purchase${purchase}><span>Purchase date</span><input name="acquiredAt" type="date" value="${escapeHtml(dateOnly(lifecycle.acquiredAt))}"></label><label data-lifecycle-sale${sale}><span>Sale proceeds</span><input name="dispositionProceeds" type="number" min="0" step="0.01" value="${lifecycle.dispositionProceedsCents == null ? "" : escapeHtml((lifecycle.dispositionProceedsCents / 100).toFixed(2))}" placeholder="Required when sold"></label><label data-lifecycle-sale${sale}><span>Sale date</span><input name="disposedAt" type="date" value="${escapeHtml(dateOnly(lifecycle.disposedAt))}"></label></div><input type="hidden" name="expectedVersion" value="${safeNumber(lifecycle.version)}"><div class="customer-lifecycle-submit"><button class="button button-primary" type="submit" ${state.saving ? "disabled" : ""}>${state.saving ? "Saving…" : "Save tracking"}</button><small>Choose a status. FlipForge sets the matching result automatically. Add purchase details only when you own the card and sale details only after it is sold.</small></div></form></div></section>`;
  }

  // Status change: set the matching outcome and show only the fields that status needs. No re-render.
  function applyStatus(form) {
    const status = String(form.elements.namedItem("trackingStatus")?.value || "").toUpperCase();
    const outcome = form.elements.namedItem("outcomeStatus");
    if (outcome) outcome.value = syncedOutcome(status, outcome.value);
    form.querySelectorAll("[data-lifecycle-purchase]").forEach(label => { label.hidden = !purchaseFieldsVisible(status); });
    form.querySelectorAll("[data-lifecycle-sale]").forEach(label => { label.hidden = !saleFieldsVisible(status); });
  }

  function lifecycleHistoryPanel() {
    return `<section class="panel"><header class="panel-header"><div><h2>Tracking history</h2><p>Your saved changes for this card, newest first.</p></div></header><div class="panel-body">${historyMarkup()}</div></section>`;
  }

  function trackingView() {
    const lifecycle = chosenLifecycle();
    const items = lifecycleItems();
    const due = items.filter(item => item.alertEnabled && item.reviewAt && new Date(item.reviewAt).getTime() <= Date.now()).length;
    const owned = items.filter(item => item.trackingStatus === "OWNED").length;
    const beta = betaSurface();
    // Audit export is not offered on the private-beta surface.
    const actions = `<a class="button button-secondary" href="#/opportunities/${encodeURIComponent(state.selectedId || "")}">Card Intelligence</a>${state.selectedId ? `<a class="button button-secondary" href="#/evaluate/${encodeURIComponent(state.selectedId)}" data-lifecycle-reevaluate>Re-evaluate this listing</a>` : ""}${beta ? "" : `<a class="button button-secondary" href="#/export/${encodeURIComponent(state.selectedId || "")}">Audit export</a>`}<button class="button button-secondary" type="button" data-lifecycle-refresh>Refresh</button>`;
    const intro = `${routeHeading(actions)}${outcomeGuide()}${decisionKey()}${trackingBoundary()}`;
    if (!items.length) {
      return `<div class="page customer-lifecycle-page">${intro}<section class="panel"><div class="panel-body staging-empty consumer-state consumer-state-empty"><strong>No saved card to track yet.</strong><p>Evaluate a card first. Its saved decision appears here so you can track what happens next.</p><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div></section></div>`;
    }
    const selectedContent = lifecycle
      ? `${decisionTimelineMarkup()}${outcomePanelMarkup()}<div class="customer-lifecycle-grid">${lifecycleForm(lifecycle)}${lifecycleHistoryPanel()}</div>`
      : "";
    // The summary counts are shown in the full customer app only.
    const metrics = beta ? "" : `<section class="customer-management-metrics"><article><span>Saved records</span><strong>${items.length}</strong></article><article><span>Owned cards</span><strong>${owned}</strong></article><article><span>Reviews due</span><strong>${due}</strong></article><article><span>Updates saved</span><strong>${safeNumber(lifecycle?.version)}</strong></article></section>`;
    return `<div class="page customer-lifecycle-page">${intro}${state.notice ? `<div class="customer-lifecycle-notice" role="status">${escapeHtml(state.notice)}</div>` : ""}<section class="panel customer-management-select-panel"><div class="panel-body">${selector()}</div></section>${metrics}${selectedContent}</div>`;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Alerts (Saved Decisions & Tracking M1): one plain-language list of what needs a look, why, and what to do next.
  // Every word comes from the saved decision or the backend's alert text; the browser never re-scores or decides.
  const ALERT_TITLES = Object.freeze({
    REVIEW_DUE: "Your scheduled review is due",
    DECISION_CHANGED: "Decision changed at a re-evaluation",
    MAX_BUY_CROSSED: "Ask moved across your Max Buy",
    DECISION_RECHECK_DUE: "Decision needs a fresh look",
    VERIFICATION_PENDING: "Verification still needed",
    LEGACY_DECISION: "Based on evidence FlipForge no longer accepts"
  });
  const REEVALUATE_KINDS = new Set(["REVIEW_DUE", "DECISION_CHANGED", "MAX_BUY_CROSSED", "DECISION_RECHECK_DUE", "LEGACY_DECISION"]);

  function alertKind(item) {
    return String(item?.kind || "").toUpperCase();
  }

  function alertTitle(item) {
    const title = String(item?.title || "").trim();
    if (title) return title;
    const kind = alertKind(item);
    if (kind === "DECISION_CHANGED" && item?.previousDecision && item?.currentDecision) {
      return `Decision changed from ${item.previousDecision} to ${item.currentDecision}`;
    }
    return ALERT_TITLES[kind] || "Needs a look";
  }

  function alertDecision(item) {
    return String(item?.currentDecision || item?.decision || "").toUpperCase();
  }

  function alertNeedsAttention(item) {
    if (typeof item?.needsAttention === "boolean") return item.needsAttention;
    return alertKind(item) === "REVIEW_DUE" ? item?.due === true : true;
  }

  function alertsList(data) {
    const items = safeArray(data.items).concat(safeArray(data.decisionReviewSignals));
    return items.filter(item => item && typeof item === "object" && SAFE_ID.test(String(item.opportunityId || "")));
  }

  function observedTime(item) {
    const time = Date.parse(String(item?.observedAt || item?.changedAt || item?.evaluatedAt || item?.reviewAt || ""));
    return Number.isFinite(time) ? time : 0;
  }

  function alertFacts(item) {
    const facts = [];
    const kind = alertKind(item);
    if (kind === "MAX_BUY_CROSSED") {
      facts.push(`All-in ask ${moneyFromCents(item.previousAllInAskCents)} → ${moneyFromCents(item.allInAskCents)} · saved Max Buy ${moneyFromCents(item.maximumBuyPriceCents)}`);
    }
    if (kind === "DECISION_RECHECK_DUE" && Number.isFinite(Number(item.ageDays))) {
      facts.push(`Decided ${whenText(item.evaluatedAt, "earlier")} · ${Number(item.ageDays)} days ago`);
    }
    if (kind === "REVIEW_DUE" && item.reviewAt) facts.push(`Reminder set for ${whenText(item.reviewAt, "a date you chose")}`);
    return facts;
  }

  function alertCardMarkup(item, data, mode) {
    const kind = alertKind(item);
    const id = String(item.opportunityId);
    const alertId = String(item.alertId || "");
    const decision = alertDecision(item);
    const changes = kind === "DECISION_CHANGED" ? changeLinesFor(item) : [];
    const facts = alertFacts(item);
    const canReview = data.acknowledgementConfigured === true && SAFE_ALERT_ID.test(alertId) && mode === "attention";
    const reviewing = state.reviewing === alertId;
    const recorded = item.observedAt ? whenText(item.observedAt, "") : "";
    const reviewedLine = mode === "reviewed" && item.reviewedAt ? `<small>Reviewed ${escapeHtml(whenText(item.reviewedAt, ""))}</small>` : "";
    const badges = `${item.newSinceLastVisit === true ? badge("New", "buy") : ""}${decision ? badge(decision, decisionTone(decision), item) : ""}`;
    const rules = item.decidedUnderEarlierRules === true ? `<p class="ff-alert-rules">${escapeHtml(item.rulesNote || "Decided under earlier rules. The saved decision and its Max Buy are kept exactly as they were made.")}</p>` : "";
    const actions = [
      `<a class="button button-secondary" href="#/opportunities/${encodeURIComponent(id)}">Open decision</a>`,
      REEVALUATE_KINDS.has(kind) && mode !== "reviewed" ? `<a class="button button-secondary" href="#/evaluate/${encodeURIComponent(id)}" data-alert-reevaluate>Re-evaluate</a>` : "",
      `<a class="button button-secondary" href="#/tracking/${encodeURIComponent(id)}">History</a>`,
      canReview ? `<button class="button button-primary" type="button" data-alert-review="${escapeHtml(alertId)}" ${reviewing ? "disabled" : ""}>${reviewing ? "Saving…" : "Mark as reviewed"}</button>` : ""
    ].join("");
    return `<article class="ff-alert-card" data-alert-kind="${escapeHtml(kind)}" data-alert-mode="${escapeHtml(mode)}" data-new="${item.newSinceLastVisit === true}"><header><div><span class="eyebrow">${escapeHtml(titleFor(id))}</span><h3>${escapeHtml(alertTitle(item))}</h3></div><div class="ff-alert-badges">${badges}</div></header>${item.customerExplanation ? `<p>${escapeHtml(item.customerExplanation)}</p>` : ""}${facts.length ? `<ul class="ff-alert-facts">${facts.map(fact => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>` : ""}${changes.length ? `<div class="ff-alert-changes"><strong>What changed</strong><ul>${changes.map(change => `<li>${escapeHtml(change)}</li>`).join("")}</ul></div>` : ""}${rules}${item.nextStep && mode !== "reviewed" ? `<p class="ff-alert-next"><strong>Next step:</strong> ${escapeHtml(item.nextStep)}</p>` : ""}<footer><small>${recorded ? `Recorded ${escapeHtml(recorded)}` : ""}</small>${reviewedLine}<div class="ff-alert-actions">${actions}</div></footer></article>`;
  }

  function alertsView() {
    const data = state.feature?.data || {};
    const all = alertsList(data);
    const reviewState = data.acknowledgementConfigured === true;
    const attention = all.filter(item => item.reviewed !== true && alertNeedsAttention(item))
      .sort((a, b) => (b.newSinceLastVisit === true) - (a.newSinceLastVisit === true) || observedTime(b) - observedTime(a));
    const scheduled = all.filter(item => alertKind(item) === "REVIEW_DUE" && item.due !== true && item.reviewed !== true);
    const reviewed = all.filter(item => item.reviewed === true).sort((a, b) => Date.parse(b.reviewedAt || 0) - Date.parse(a.reviewedAt || 0));
    const since = data.sinceLastVisit || null;
    const newCount = attention.filter(item => item.newSinceLastVisit === true).length;
    const seenButton = reviewState && since ? `<button class="button button-secondary" type="button" data-alerts-seen ${state.reviewing === "seen" ? "disabled" : ""}>${state.reviewing === "seen" ? "Saving…" : "Mark all as seen"}</button>` : "";
    const actions = `${seenButton}<a class="button button-secondary" href="#/tracking">Manage tracking</a><button class="button button-secondary" type="button" data-lifecycle-refresh>Refresh</button>`;
    const delivery = `Alerts are shown here in the app; Email / push delivery is ${data.notificationDeliveryConfigured ? "connected" : "not connected"}.`;
    const sinceLine = since
      ? `<p class="ff-alerts-since" data-since-basis="${escapeHtml(since.basis || "")}">${escapeHtml(since.explanation || "")}${since.lastSeenAt ? ` Last marked seen ${escapeHtml(whenText(since.lastSeenAt, ""))}.` : ""} ${escapeHtml(delivery)}</p>`
      : `<p class="ff-alerts-since">${escapeHtml(delivery)}</p>`;
    const summary = `<section class="customer-management-metrics ff-alerts-summary"><article><span>New since your last visit</span><strong>${since ? newCount : "—"}</strong></article><article><span>Needs your review</span><strong>${attention.length}</strong></article><article><span>Scheduled reminders</span><strong>${scheduled.length}</strong></article><article><span>Reviewed</span><strong>${reviewState ? reviewed.length : "—"}</strong></article></section>`;
    const attentionPanel = `<section class="panel ff-alerts-panel" data-alerts-attention><header class="panel-header"><div><h2>Needs your review</h2><p>Newest first. Each item says what FlipForge recorded and what to do next.</p></div>${badge(attention.length ? `${attention.length} open` : "All clear", attention.length ? "warn" : "ok")}</header><div class="panel-body">${attention.length
      ? `<div class="ff-alert-list">${attention.map(item => alertCardMarkup(item, data, "attention")).join("")}</div>`
      : `<div class="staging-empty"><strong>Nothing needs your review.</strong><p>FlipForge does not re-check listings on its own. Alerts appear when you re-evaluate a card, when a saved decision passes 30 days, when verification is still pending, or when a reminder you set comes due.</p><a class="button button-primary" href="#/tracking">Open tracking</a></div>`}</div></section>`;
    const scheduledPanel = scheduled.length
      ? `<section class="panel"><header class="panel-header"><div><h2>Scheduled reminders</h2><p>Reminders you set that are not due yet.</p></div></header><div class="panel-body"><div class="ff-alert-list">${scheduled.map(item => alertCardMarkup(item, data, "scheduled")).join("")}</div></div></section>`
      : "";
    const reviewedPanel = reviewed.length
      ? `<details class="panel ff-alerts-reviewed"><summary>Reviewed (${reviewed.length})</summary><div class="panel-body"><div class="ff-alert-list">${reviewed.map(item => alertCardMarkup(item, data, "reviewed")).join("")}</div></div></details>`
      : "";
    const boundaryPanel = `<details class="boundary-note ff-trust-note"><summary>How alerts work</summary><p>Alerts come from your saved decisions, re-evaluations you ran, reminders you set and time. They never change a decision, its receipt or its Max Buy, and FlipForge does not watch live listings between re-evaluations.</p><p>Marking an alert reviewed or marking all as seen is saved to your account only. Email / push: ${data.notificationDeliveryConfigured ? "Connected" : "Not connected"}; alerts are shown in the app.</p></details>`;
    return `<div class="page customer-lifecycle-page ff-alerts-page">${pageHeading("Saved Decisions & Tracking", "Alerts", "What changed on cards you track, what needs a look, and what to do next.", actions)}${state.notice ? `<div class="customer-lifecycle-notice" role="status">${escapeHtml(state.notice)}</div>` : ""}${sinceLine}${summary}<div class="customer-lifecycle-grid ff-alerts-grid">${attentionPanel}${scheduledPanel}${reviewedPanel}</div>${boundaryPanel}</div>`;
  }

  function validAlertsPayload(payload) {
    return payload?.data?.kind === "alerts" && payload?.data?.configured === true && Array.isArray(payload?.data?.items);
  }

  async function markReviewed(alertId) {
    if (!SAFE_ALERT_ID.test(alertId) || state.reviewing) return;
    const generation = state.generation;
    const route = state.route;
    const reviewSequence = ++state.reviewSequence;
    state.reviewing = alertId;
    state.notice = "";
    renderCurrent(generation, route);
    try {
      const payload = await request(`/api/v1/alerts/reviewed/${alertId}`, { method: "PUT", body: {} });
      if (!activeGeneration(generation, route)) return;
      if (!validAlertsPayload(payload)) throw Object.assign(new Error("The alerts response failed the customer contract."), { code: "LIFECYCLE_PROJECTION_INVALID" });
      state.feature = payload;
      state.notice = "Marked as reviewed. It stays in Reviewed below.";
    } catch (error) {
      if (!activeGeneration(generation, route)) return;
      state.notice = `Could not save the review: ${customerErrorMessage(error)}`;
    } finally {
      // Release only the lock owned by this request. An old route's late response
      // must not clear a newer review write or leave Alerts permanently disabled.
      if (state.reviewSequence === reviewSequence) {
        state.reviewing = "";
        if (activeGeneration(generation, route)) renderCurrent(generation, route);
      }
    }
  }

  async function markAllSeen() {
    if (state.reviewing) return;
    const generation = state.generation;
    const route = state.route;
    const seenThrough = String(state.feature?.data?.generatedAt || new Date().toISOString());
    const reviewSequence = ++state.reviewSequence;
    state.reviewing = "seen";
    state.notice = "";
    renderCurrent(generation, route);
    try {
      const payload = await request(ALERTS_SEEN_PATH, { method: "PUT", body: { seenThrough } });
      if (!activeGeneration(generation, route)) return;
      if (!validAlertsPayload(payload)) throw Object.assign(new Error("The alerts response failed the customer contract."), { code: "LIFECYCLE_PROJECTION_INVALID" });
      state.feature = payload;
      state.notice = "Marked as seen. Items stay open until you mark them reviewed.";
    } catch (error) {
      if (!activeGeneration(generation, route)) return;
      state.notice = `Could not save: ${customerErrorMessage(error)}`;
    } finally {
      // Release only the lock owned by this request. An old route's late response
      // must not clear a newer review write or leave Alerts permanently disabled.
      if (state.reviewSequence === reviewSequence) {
        state.reviewing = "";
        if (activeGeneration(generation, route)) renderCurrent(generation, route);
      }
    }
  }

  function pageMarkup() {
    if (state.loading) return `<div class="page customer-lifecycle-page">${routeHeading()}<div class="staging-loading consumer-state consumer-state-loading" role="status">${state.route === "alerts" ? "Loading your alerts…" : "Loading your tracked cards…"}</div></div>`;
    if (state.error) return `<div class="page customer-lifecycle-page">${routeHeading("", state.route === "alerts" ? "Alerts unavailable" : "Tracking unavailable")}${errorPanel(state.error)}</div>`;
    if (state.health?.data?.status !== "configured") return `<div class="page customer-lifecycle-page">${routeHeading()}${offlinePanel()}</div>`;
    if (state.route === "tracking") return trackingView();
    return alertsView();
  }

  function resetData() {
    state.health = null;
    state.opportunities = null;
    state.lifecycle = null;
    state.detail = null;
    state.feature = null;
    state.error = null;
    state.selectedId = "";
  }

  function chooseId() {
    const ids = lifecycleItems().map(item => String(item.opportunityId));
    if (state.requestedId) {
      if (!SAFE_ID.test(state.requestedId) || !ids.includes(state.requestedId)) {
        throw Object.assign(new Error("The requested lifecycle record was not returned for this tenant."), {
          code: "RESOURCE_NOT_FOUND",
          status: 404
        });
      }
      return state.requestedId;
    }
    return ids[0] || "";
  }

  async function load(generation = state.generation, route = state.route) {
    if (!activeGeneration(generation, route)) return;
    state.loading = true;
    state.notice = "";
    resetData();
    renderCurrent(generation, route);
    // The service check and this screen's data are requested together, so the screen needs one round trip instead of
    // two. The data is used only if the service check says the service is configured; the server authorizes every
    // request on its own. A card's Tracking page (#/tracking/<id>) also asks for that card's history at the same time;
    // that record is used only if the tenant's own lifecycle list returns it (chooseId below).
    const settle = promise => promise.then(value => ({ value }), error => ({ error }));
    const healthRequest = settle(request("/api/v1/health"));
    const requested = route === "tracking" && SAFE_ID.test(state.requestedId) ? state.requestedId : "";
    const requestedDetail = requested ? settle(request(`/api/v1/lifecycle/${encodeURIComponent(requested)}`)) : null;
    if (requested) {
      // The card's Sales and Sell Watch panels start loading now, not after this page has rendered.
      try { window.FlipForgeReportedSales?.prefetch?.(requested); window.FlipForgeSellWatch?.prefetch?.(requested); } catch (_) {}
    }
    const listsRequest = route === "tracking"
      ? settle(Promise.all([request("/api/v1/opportunities"), request("/api/v1/lifecycle")]))
      : settle(Promise.all([request(`/api/v1/${route}`), request("/api/v1/opportunities")]));
    try {
      const health = await healthRequest;
      if (!activeGeneration(generation, route)) return;
      if (health.error) throw health.error;
      state.health = health.value;
      if (state.health?.data?.status !== "configured") return;
      const lists = await listsRequest;
      if (!activeGeneration(generation, route)) return;
      if (lists.error) throw lists.error;
      if (route === "tracking") {
        const [opportunities, lifecycle] = lists.value;
        state.opportunities = opportunities;
        state.lifecycle = lifecycle;
        if (state.opportunities?.data?.kind !== "opportunities" || !Array.isArray(state.opportunities?.data?.items)) {
          throw Object.assign(new Error("The tracked opportunity list failed its contract."), { code: "TRACKING_OPPORTUNITIES_INVALID" });
        }
        if (state.lifecycle?.data?.kind !== "lifecycle" || !Array.isArray(state.lifecycle?.data?.items) || state.lifecycle?.data?.sourceOfTruth !== "SQLite") {
          throw Object.assign(new Error("The lifecycle list failed its SQLite contract."), { code: "LIFECYCLE_LIST_INVALID" });
        }
        state.selectedId = chooseId();
        if (state.selectedId) {
          let detail;
          if (requestedDetail && state.selectedId === requested) {
            const settled = await requestedDetail;
            if (settled.error) throw settled.error;
            detail = settled.value;
          } else {
            detail = await request(`/api/v1/lifecycle/${encodeURIComponent(state.selectedId)}`);
          }
          if (!activeGeneration(generation, route)) return;
          state.detail = detail;
          if (state.detail?.data?.kind !== "lifecycle-detail" || String(state.detail?.data?.opportunityId || "") !== state.selectedId || !Array.isArray(state.detail?.data?.history)) {
            throw Object.assign(new Error("The lifecycle detail failed its selected-record contract."), { code: "LIFECYCLE_DETAIL_INVALID" });
          }
        }
        return;
      }
      const [feature, opportunities] = lists.value;
      state.feature = feature;
      state.opportunities = opportunities;
      if (state.feature?.data?.kind !== route || state.feature?.data?.configured !== true || !Array.isArray(state.feature?.data?.items)) {
        throw Object.assign(new Error("The lifecycle projection failed the customer contract."), { code: "LIFECYCLE_PROJECTION_INVALID" });
      }
      if (state.opportunities?.data?.kind !== "opportunities" || !Array.isArray(state.opportunities?.data?.items)) {
        throw Object.assign(new Error("The lifecycle label source failed the customer contract."), { code: "LIFECYCLE_LABELS_INVALID" });
      }
    } catch (error) {
      if (!activeGeneration(generation, route)) return;
      state.error = error;
    } finally {
      if (!activeGeneration(generation, route)) return;
      state.loading = false;
      renderCurrent(generation, route);
    }
  }

  function toInstant(value, label) {
    const text = String(value || "").trim();
    if (!text) return null;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is invalid.`);
    return parsed.toISOString();
  }

  function dateInstant(value) {
    const text = String(value || "").trim();
    return text ? `${text}T12:00:00.000Z` : null;
  }

  function cents(value, label) {
    const text = String(value || "").trim();
    if (!text) return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative amount.`);
    return Math.round(parsed * 100);
  }

  async function save(form) {
    if (!state.selectedId || state.saving) return;
    const generation = state.generation;
    const route = state.route;
    if (!activeGeneration(generation, route)) return;
    state.saving = true;
    state.error = null;
    state.notice = "";
    renderCurrent(generation, route);
    try {
      const formData = new FormData(form);
      const reviewAt = toInstant(formData.get("reviewAt"), "Review time");
      const alertEnabled = formData.get("alertEnabled") === "on";
      if (alertEnabled && !reviewAt) throw new Error("A review time is required when the in-app reminder is enabled.");
      const body = {
        trackingStatus: String(formData.get("trackingStatus") || ""),
        reviewAt,
        outcomeStatus: String(formData.get("outcomeStatus") || ""),
        acquisitionCostCents: cents(formData.get("acquisitionCost"), "Acquisition cost"),
        acquiredAt: dateInstant(formData.get("acquiredAt")),
        dispositionProceedsCents: cents(formData.get("dispositionProceeds"), "Disposition proceeds"),
        disposedAt: dateInstant(formData.get("disposedAt")),
        alertEnabled,
        expectedVersion: Number(formData.get("expectedVersion"))
      };
      await request(`/api/v1/lifecycle/${encodeURIComponent(state.selectedId)}`, { method: "PUT", body });
      if (!activeGeneration(generation, route)) return;
      await load(generation, route);
      if (!activeGeneration(generation, route)) return;
      state.notice = "Tracking changes saved to your account.";
    } catch (error) {
      if (!activeGeneration(generation, route)) return;
      state.error = error;
    } finally {
      if (!activeGeneration(generation, route)) return;
      state.saving = false;
      renderCurrent(generation, route);
    }
  }

  function bindActions(generation = state.generation, route = state.route) {
    if (!state.main || !activeGeneration(generation, route) || typeof state.main.querySelector !== "function") return;
    state.main.querySelector("[data-lifecycle-refresh]")?.addEventListener("click", () => load(generation, route));
    state.main.querySelector("[data-lifecycle-retry]")?.addEventListener("click", () => {
      if (activeGeneration(generation, route)) load(generation, route);
    });
    const select = state.main.querySelector("[data-lifecycle-select]");
    select?.addEventListener("change", () => {
      if (!activeGeneration(generation, route)) return;
      const id = String(select.value || "");
      if (!SAFE_ID.test(id)) return;
      // The native select already names the newly chosen card. Clear the previous card's saved decision in this same
      // task, before the browser can paint, so no frame shows the new card's name over the old card's details. The
      // generation bump also retires any response still in flight for the card being left. The hashchange render
      // then loads the chosen card.
      state.generation += 1;
      state.loading = true;
      state.notice = "";
      resetData();
      renderCurrent(state.generation, route);
      const nextHash = `#/tracking/${encodeURIComponent(id)}`;
      if (window.location.hash === nextHash) {
        // No hashchange will follow; load the chosen card directly.
        state.requestedId = id;
        load(state.generation, route);
      } else {
        window.location.hash = nextHash;
      }
    });
    if (typeof state.main.querySelectorAll === "function") {
      state.main.querySelectorAll("[data-alert-review]").forEach(button => {
        button.addEventListener("click", () => {
          if (activeGeneration(generation, route)) markReviewed(String(button.getAttribute("data-alert-review") || ""));
        });
      });
    }
    state.main.querySelector("[data-alerts-seen]")?.addEventListener("click", () => {
      if (activeGeneration(generation, route)) markAllSeen();
    });
    const form = state.main.querySelector("[data-lifecycle-form]");
    form?.querySelector('select[name="trackingStatus"]')?.addEventListener("change", () => {
      if (activeGeneration(generation, route)) applyStatus(form);
    });
    form?.addEventListener("submit", event => {
      event.preventDefault();
      if (activeGeneration(generation, route)) save(event.currentTarget);
    });
  }

  function renderCurrent(generation = state.generation, route = state.route) {
    if (!state.main || !activeGeneration(generation, route)) return;
    state.main.innerHTML = pageMarkup();
    bindActions(generation, route);
    if (route === "tracking") {
      // Tracking's sub-panels (Sales, then Sell Watch below it) are mounted by this owner after each render.
      try { window.FlipForgeReportedSales?.mount?.(); window.FlipForgeSellWatch?.mount?.(); } catch (_) {}
    }
  }

  function render(main, route, id = "") {
    if (!eligibleHost() || !handles(route)) return false;
    state.main = main;
    state.route = String(route);
    state.generation += 1;
    // Route transitions retire pending UI write locks, not the server request.
    // Old requests may finish, but their generation cannot mutate the new view.
    state.reviewSequence += 1;
    state.reviewing = "";
    try {
      state.requestedId = decodeURIComponent(String(id || ""));
    } catch (_) {
      state.requestedId = String(id || "");
    }
    load(state.generation, state.route);
    return true;
  }

  window.FlipForgeCustomerLifecycle = Object.freeze({
    isEligible: eligibleHost,
    handles,
    render,
    refresh: load
  });
})();
