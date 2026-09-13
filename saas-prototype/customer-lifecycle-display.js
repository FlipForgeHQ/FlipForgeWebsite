(() => {
  "use strict";

  const TRACKING_STATUS_LABELS = Object.freeze({
    WATCHING: "Watching",
    REVIEW: "Review",
    OWNED: "Owned",
    SOLD: "Sold",
    PASSED: "Passed",
    ARCHIVED: "Archived"
  });
  const outcomeByOpportunity = new Map();
  const nativeFetch = window.fetch.bind(window);
  let outcomeRenderQueued = false;

  function normalizeCardDisplay(value) {
    return String(value ?? "")
      .replace(/(^|\s)%(\d{1,4})(?=\s|$)/g, "$1#$2")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeNodeText(node) {
    if (!node || typeof node.textContent !== "string") return;
    const normalized = normalizeCardDisplay(node.textContent);
    if (normalized && normalized !== node.textContent) node.textContent = normalized;
  }

  function normalizeTrackingStatusLabels(page) {
    const select = page.querySelector('select[name="trackingStatus"]');
    if (!select) return;
    [...select.options].forEach(option => {
      const raw = String(option.value || option.textContent || "").trim().toUpperCase();
      const label = TRACKING_STATUS_LABELS[raw];
      if (!label) return;
      if (option.value !== raw) option.value = raw;
      if (option.textContent !== label) option.textContent = label;
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function moneyFromCents(value) {
    if (value === null || value === undefined || value === "") return "Unavailable";
    const number = Number(value);
    if (!Number.isFinite(number)) return "Unavailable";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    }).format(number / 100);
  }

  function lifecycleDetailRequest(input, init) {
    const method = String(init?.method || "GET").toUpperCase();
    if (method !== "GET") return null;
    let url;
    try {
      const raw = typeof input === "string" ? input : input?.url;
      url = new URL(String(raw || ""), window.location.origin);
    } catch (_) {
      return null;
    }
    if (url.origin !== window.location.origin) return null;
    const match = url.pathname.match(/^\/api\/v1\/lifecycle\/([A-Za-z0-9._:-]+)$/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  }

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

  function checkpointLabel(state) {
    switch (String(state || "")) {
      case "MEASURABLE": return "Observed";
      case "OBSERVATION_NOT_MEASURABLE": return "Observed · limited measurement";
      case "VALUE_NOT_MEASURABLE": return "Observed · value unavailable";
      case "MISSING_OBSERVATION": return "Waiting for observation";
      default: return "Unavailable";
    }
  }

  function checkpointMarkup(checkpoint) {
    const horizon = Number(checkpoint?.horizonDays);
    const state = String(checkpoint?.measurementState || "MISSING_OBSERVATION");
    const available = checkpoint?.available === true;
    const observedAt = checkpoint?.observedAt ? escapeHtml(checkpoint.observedAt) : "Not observed yet";
    const observedValue = available ? moneyFromCents(checkpoint?.observedSupportedValueCents) : "Unavailable";
    const movement = state === "MEASURABLE" && Number.isFinite(Number(checkpoint?.supportedValueChangePercent))
      ? `${escapeHtml(checkpoint.supportedValueChangePercent)}%`
      : "Unavailable";
    const evidenceDelta = available && Number.isFinite(Number(checkpoint?.acceptedEvidenceDelta))
      ? `${Number(checkpoint.acceptedEvidenceDelta) > 0 ? "+" : ""}${escapeHtml(checkpoint.acceptedEvidenceDelta)}`
      : "Unavailable";
    const missingCopy = state === "MISSING_OBSERVATION"
      ? `<p class="customer-outcome-waiting">FlipForge has not captured a governed T${horizon} observation. Later values are not backfilled into this checkpoint.</p>`
      : "";
    return `<article class="customer-outcome-checkpoint" data-state="${escapeHtml(state)}"><div class="customer-outcome-checkpoint-head"><span class="eyebrow">T${escapeHtml(horizon)}</span><strong>${escapeHtml(checkpointLabel(state))}</strong></div><div class="customer-outcome-checkpoint-grid"><span><small>Observed at</small><strong>${observedAt}</strong></span><span><small>Observed Supported Value</small><strong>${observedValue}</strong></span><span><small>Value movement</small><strong>${movement}</strong></span><span><small>Accepted evidence change</small><strong>${evidenceDelta}</strong></span></div>${missingCopy}</article>`;
  }

  function selectedOpportunityId(page) {
    const action = page.querySelector('.page-actions a[href^="#/opportunities/"]');
    const match = String(action?.getAttribute("href") || "").match(/^#\/opportunities\/([^/?#]+)/);
    if (match) {
      try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
    }
    return String(page.querySelector("select[data-lifecycle-select]")?.value || "");
  }

  function outcomeSignature(opportunityId) {
    const record = outcomeByOpportunity.get(opportunityId);
    if (!record || !record.valid || record.data?.available !== true) return "unavailable";
    const reconciliation = record.data.outcomeReconciliation || {};
    const checkpoints = Array.isArray(reconciliation.checkpoints) ? reconciliation.checkpoints : [];
    return [
      record.data.phaseVersion || "",
      reconciliation.requestId || "",
      reconciliation.observedCheckpointCount ?? "",
      reconciliation.measurableCheckpointCount ?? "",
      ...checkpoints.map(item => [item?.horizonDays, item?.measurementState, item?.observedAt, item?.observedSupportedValueCents, item?.acceptedEvidenceDelta].join(":"))
    ].join("|");
  }

  function outcomePanelMarkup(opportunityId) {
    const record = outcomeByOpportunity.get(opportunityId);
    if (!record || !record.valid || record.data?.available !== true) {
      return `<section class="panel customer-outcome-panel" data-ff-outcome-intelligence><header class="panel-header"><div><span class="eyebrow">Outcome Intelligence</span><h2>T7 · T14 · T30</h2><p>Governed observations after the saved decision.</p></div><span class="staging-status staging-status-neutral">Unavailable</span></header><div class="panel-body staging-empty"><strong>Outcome checkpoints are not available yet.</strong><p>FlipForge will not infer or backfill missing observations from later values. Tracking remains available independently.</p></div></section>`;
    }
    const reconciliation = record.data.outcomeReconciliation || {};
    const checkpoints = Array.isArray(reconciliation.checkpoints) ? reconciliation.checkpoints : [];
    const byHorizon = new Map(checkpoints.map(item => [Number(item?.horizonDays), item]));
    const required = [7, 14, 30].map(horizon => byHorizon.get(horizon) || { horizonDays: horizon, measurementState: "MISSING_OBSERVATION", available: false });
    const observed = Number(reconciliation.observedCheckpointCount || 0);
    return `<section class="panel customer-outcome-panel" data-ff-outcome-intelligence><header class="panel-header"><div><span class="eyebrow">Outcome Intelligence</span><h2>T7 · T14 · T30</h2><p>What the governed evidence showed after the saved decision.</p></div><span class="staging-status staging-status-ok">${escapeHtml(observed)}/3 observed</span></header><div class="panel-body"><div class="customer-outcome-boundary"><strong>Observation, not a new recommendation.</strong><span>These checkpoints compare stored observations with the immutable T0 baseline. They do not rescore history, declare a decision right or wrong, backfill missing values, or authorize a transaction.</span></div><div class="customer-outcome-baseline"><span><small>T0 decision</small><strong>${escapeHtml(reconciliation.t0Decision || "Unavailable")}</strong></span><span><small>T0 date</small><strong>${escapeHtml(reconciliation.t0EvaluatedAt || "Unavailable")}</strong></span><span><small>T0 Supported Value</small><strong>${moneyFromCents(reconciliation.t0SupportedValueCents)}</strong></span></div><div class="customer-outcome-checkpoints">${required.map(checkpointMarkup).join("")}</div></div></section>`;
  }

  function renderOutcomeIntelligence(root = document) {
    const page = root.querySelector?.(".customer-lifecycle-page") || document.querySelector?.(".customer-lifecycle-page");
    if (!page) return;
    const timeline = page.querySelector(".customer-decision-timeline-panel");
    if (!timeline) return;
    const opportunityId = selectedOpportunityId(page);
    if (!opportunityId) return;
    const signature = outcomeSignature(opportunityId);
    const existing = page.querySelector("[data-ff-outcome-intelligence]");
    if (existing && existing.dataset.ffOutcomeOpportunity === opportunityId && existing.dataset.ffOutcomeSignature === signature) return;
    const markup = outcomePanelMarkup(opportunityId);
    if (existing) existing.outerHTML = markup;
    else timeline.insertAdjacentHTML("afterend", markup);
    const rendered = page.querySelector("[data-ff-outcome-intelligence]");
    if (rendered) {
      rendered.dataset.ffOutcomeOpportunity = opportunityId;
      rendered.dataset.ffOutcomeSignature = signature;
    }
  }

  function queueOutcomeRender() {
    if (outcomeRenderQueued) return;
    outcomeRenderQueued = true;
    window.requestAnimationFrame(() => {
      outcomeRenderQueued = false;
      renderOutcomeIntelligence(document);
    });
  }

  if (window.__ffOutcomeTrackingFetchV1 !== true) {
    window.fetch = function flipForgeOutcomeTrackingFetch(input, init = {}) {
      const opportunityId = lifecycleDetailRequest(input, init);
      const responsePromise = nativeFetch(input, init);
      if (!opportunityId) return responsePromise;
      return responsePromise.then(response => {
        if (response.ok) {
          response.clone().json().then(payload => {
            const value = payload?.data?.decisionChangeIntelligence;
            outcomeByOpportunity.set(opportunityId, {
              valid: validDecisionChangeIntelligence(value, opportunityId),
              data: value || null
            });
            queueOutcomeRender();
          }).catch(() => {
            outcomeByOpportunity.set(opportunityId, { valid: false, data: null });
            queueOutcomeRender();
          });
        }
        return response;
      });
    };
    window.__ffOutcomeTrackingFetchV1 = true;
  }

  function normalizeLifecycleDisplay(root = document) {
    const page = root.querySelector?.(".customer-lifecycle-page")
      || document.querySelector?.(".customer-lifecycle-page");
    if (!page) return;

    page.querySelectorAll("select[data-lifecycle-select] option").forEach(normalizeNodeText);
    page.querySelectorAll(".customer-lifecycle-grid h2, .customer-lifecycle-grid h3, .customer-lifecycle-alerts h3, table tbody td:first-child strong")
      .forEach(normalizeNodeText);
    normalizeTrackingStatusLabels(page);
    renderOutcomeIntelligence(page);

    page.setAttribute("data-ff-lifecycle-display-normalized", "true");
  }

  const main = document.getElementById("main-content");
  if (main && typeof MutationObserver === "function") {
    new MutationObserver(() => normalizeLifecycleDisplay(main))
      .observe(main, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => normalizeLifecycleDisplay(document));
  normalizeLifecycleDisplay(document);

  window.FlipForgeLifecycleDisplay = {
    normalizeCardDisplay,
    normalizeLifecycleDisplay,
    renderOutcomeIntelligence
  };
})();
