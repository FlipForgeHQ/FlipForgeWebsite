(() => {
  "use strict";

  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
  const SAFE_DECISION = /^(BUY|WATCH|VERIFY|PASS)$/;
  const snapshots = new Map();
  const originalFetch = window.fetch.bind(window);
  let renderQueued = false;

  function safeInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }

  function cleanText(value, max = 180) {
    return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function money(cents) {
    if (!Number.isSafeInteger(cents) || cents < 0) return "Unavailable";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  function requestUrl(input) {
    try {
      const raw = typeof input === "string" || input instanceof URL ? input : input?.url;
      return new URL(String(raw || ""), window.location.origin);
    } catch (_) {
      return null;
    }
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || "GET").toUpperCase();
  }

  function normalizeTransition(value) {
    if (!value || typeof value !== "object") return null;
    const recommendation = String(value.recommendation || "").toUpperCase();
    const allInAskCents = safeInteger(value.allInAskCents);
    if (!SAFE_DECISION.test(recommendation) || allInAskCents === null) return null;
    if (value.derivedByReevaluation !== true) return null;
    return {
      recommendation,
      workflowStatus: cleanText(value.workflowStatus, 80),
      allInAskCents
    };
  }

  function normalizePriceIntelligence(opportunity, raw) {
    const opportunityId = cleanText(opportunity?.id, 200);
    if (!SAFE_ID.test(opportunityId) || !raw || typeof raw !== "object") return null;

    const currentRecommendation = String(raw.currentRecommendation || opportunity?.recommendation || "").toUpperCase();
    const currentAllInAskCents = safeInteger(raw.currentAllInAskCents);
    if (!SAFE_DECISION.test(currentRecommendation) || currentAllInAskCents === null) return null;
    if (raw.readOnly !== true || raw.savedContextOnly !== true || raw.priceDimensionOnly !== true) return null;
    if (raw.canonicalWritesPerformed !== false || raw.evaluationQuotaConsumed !== false) return null;
    if (raw.outcomeLedgerMutation !== false || raw.customerLifecycleMutation !== false) return null;
    if (raw.transactionAuthority !== false) return null;

    const transitions = Array.isArray(raw.transitions)
      ? raw.transitions.map(normalizeTransition).filter(Boolean)
      : [];

    const watchAtOrBelowCents = safeInteger(raw.watchAtOrBelowCents);
    const buyAtOrBelowCents = safeInteger(raw.buyAtOrBelowCents);

    return {
      opportunityId,
      currentRecommendation,
      currentAllInAskCents,
      currentWorkflowStatus: cleanText(raw.currentWorkflowStatus || opportunity?.workflowStatus, 80),
      watchAtOrBelowCents,
      buyAtOrBelowCents,
      transitions,
      thresholdCount: safeInteger(raw.thresholdCount) ?? transitions.length
    };
  }

  async function inspectResponse(input, init, response) {
    if (!response?.ok) return;
    const url = requestUrl(input);
    if (!url || url.origin !== window.location.origin || requestMethod(input, init) !== "GET") return;
    const match = url.pathname.match(/^\/api\/v1\/opportunities\/([^/?#]+)$/);
    if (!match) return;

    let requestedId = "";
    try { requestedId = decodeURIComponent(match[1]); } catch (_) { return; }
    if (!SAFE_ID.test(requestedId)) return;

    const payload = await response.clone().json();
    const data = payload?.data;
    const normalized = normalizePriceIntelligence(data?.opportunity, data?.priceIntelligence);
    if (!normalized) return;
    snapshots.set(requestedId, normalized);
    snapshots.set(normalized.opportunityId, normalized);
    queueRender();
  }

  window.fetch = function flipForgePriceIntelligenceFetch(input, init) {
    return originalFetch(input, init).then(response => {
      inspectResponse(input, init, response).catch(() => {});
      return response;
    });
  };

  function routeOpportunityId() {
    const match = String(window.location.hash || "").match(/^#\/opportunities\/([^/?#]+)/);
    if (!match) return "";
    try {
      const value = decodeURIComponent(match[1]);
      return SAFE_ID.test(value) ? value : "";
    } catch (_) {
      return "";
    }
  }

  function statusCopy(snapshot) {
    if (snapshot.currentRecommendation === "VERIFY" && snapshot.transitions.length === 0) {
      return "Price alone cannot repair the missing identity or governed evidence required for this decision.";
    }
    if (snapshot.buyAtOrBelowCents !== null) {
      return `The existing Smart Opportunity authority reaches BUY at or below ${money(snapshot.buyAtOrBelowCents)} using the same saved non-price context.`;
    }
    if (snapshot.watchAtOrBelowCents !== null) {
      return `The existing Smart Opportunity authority first improves to WATCH at or below ${money(snapshot.watchAtOrBelowCents)}. No BUY threshold was found in the governed search range.`;
    }
    return "No lower-price recommendation change was found in the governed search range. FlipForge does not invent a threshold.";
  }

  function metric(label, value, decision = "") {
    const decisionAttribute = SAFE_DECISION.test(decision) ? ` data-decision="${decision}"` : "";
    return `<div class="price-intelligence-metric"${decisionAttribute}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function buildPanel(snapshot) {
    const ladder = snapshot.transitions.map(step =>
      `<span class="price-intelligence-step"><strong>${escapeHtml(step.recommendation)}</strong> at or below ${escapeHtml(money(step.allInAskCents))}</span>`
    ).join("");

    const metrics = [
      metric("Current ask", money(snapshot.currentAllInAskCents)),
      metric("WATCH at or below", snapshot.watchAtOrBelowCents === null ? "Not reached" : money(snapshot.watchAtOrBelowCents), "WATCH"),
      metric("BUY at or below", snapshot.buyAtOrBelowCents === null ? "Not reached" : money(snapshot.buyAtOrBelowCents), "BUY")
    ].join("");

    const signature = [
      snapshot.currentRecommendation,
      snapshot.currentAllInAskCents,
      snapshot.watchAtOrBelowCents ?? "x",
      snapshot.buyAtOrBelowCents ?? "x",
      snapshot.transitions.map(step => `${step.recommendation}:${step.allInAskCents}`).join(",")
    ].join("|");

    return {
      signature,
      markup: `<section class="panel price-intelligence-panel" data-price-intelligence-panel data-price-intelligence-signature="${escapeHtml(signature)}" aria-label="Counterfactual price intelligence">
        <header class="panel-header">
          <div>
            <span class="eyebrow">What changes the decision?</span>
            <h2>Price Intelligence</h2>
            <p>${escapeHtml(statusCopy(snapshot))}</p>
          </div>
          <span class="staging-status staging-status-neutral price-intelligence-status">CURRENT: ${escapeHtml(snapshot.currentRecommendation)}</span>
        </header>
        <div class="panel-body">
          <div class="price-intelligence-grid">${metrics}</div>
          ${ladder ? `<div class="price-intelligence-ladder" aria-label="Lower-price decision ladder">${ladder}</div>` : `<p class="price-intelligence-unavailable">No lower-price decision transition is available from the existing authority.</p>`}
          <p class="price-intelligence-boundary"><strong>Authority boundary:</strong> These thresholds come from rerunning Smart Opportunity at hypothetical prices while keeping the saved identity, evidence, confidence, liquidity, and risk context unchanged. They are decision support only and do not authorize a purchase, bid, offer, or payment.</p>
        </div>
      </section>`
    };
  }

  function render() {
    renderQueued = false;
    const id = routeOpportunityId();
    const existing = document.querySelector("[data-price-intelligence-panel]");
    if (!id) {
      existing?.remove();
      return;
    }
    const snapshot = snapshots.get(id);
    if (!snapshot) return;

    const hero = document.querySelector("#main-content .customer-intelligence-hero");
    if (!hero) return;
    const built = buildPanel(snapshot);
    if (existing?.dataset.priceIntelligenceSignature === built.signature) return;

    const holder = document.createElement("div");
    holder.innerHTML = built.markup;
    const panel = holder.firstElementChild;
    if (!panel) return;

    const cardSightPanel = document.querySelector("[data-cardsight-evidence-panel]");
    if (existing) existing.replaceWith(panel);
    else if (cardSightPanel) cardSightPanel.insertAdjacentElement("beforebegin", panel);
    else hero.insertAdjacentElement("afterend", panel);
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    window.setTimeout(render, 0);
  }

  window.addEventListener("hashchange", queueRender);
  window.addEventListener("DOMContentLoaded", queueRender, { once: true });
  const main = document.getElementById("main-content");
  if (main) new MutationObserver(queueRender).observe(main, { childList: true, subtree: true });
})();
