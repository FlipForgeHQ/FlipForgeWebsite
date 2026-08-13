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

  function safeDecision(value) {
    const decision = String(value || "").trim().toUpperCase();
    return SAFE_DECISION.test(decision) ? decision : "";
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
    const recommendation = safeDecision(value.recommendation);
    const allInAskCents = safeInteger(value.allInAskCents);
    if (!recommendation || allInAskCents === null) return null;
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

    const currentRecommendation = safeDecision(raw.currentRecommendation || opportunity?.recommendation);
    const currentAllInAskCents = safeInteger(raw.currentAllInAskCents);
    if (!currentRecommendation || currentAllInAskCents === null) return null;
    if (raw.readOnly !== true || raw.savedContextOnly !== true || raw.priceDimensionOnly !== true) return null;
    if (raw.canonicalWritesPerformed !== false || raw.evaluationQuotaConsumed !== false) return null;
    if (raw.outcomeLedgerMutation !== false || raw.customerLifecycleMutation !== false) return null;
    if (raw.transactionAuthority !== false) return null;

    const transitions = Array.isArray(raw.transitions)
      ? raw.transitions.map(normalizeTransition).filter(Boolean)
      : [];

    const thresholds = raw.thresholds && typeof raw.thresholds === "object" ? raw.thresholds : {};
    const watchAtOrBelowCents = safeInteger(thresholds.watchAtOrBelowCents ?? raw.watchAtOrBelowCents);
    const buyAtOrBelowCents = safeInteger(thresholds.buyAtOrBelowCents ?? raw.buyAtOrBelowCents);
    const savedRecommendation = safeDecision(raw.savedRecommendation || opportunity?.recommendation);

    return {
      available: true,
      opportunityId,
      currentRecommendation,
      currentAllInAskCents,
      currentWorkflowStatus: cleanText(raw.currentWorkflowStatus || opportunity?.workflowStatus, 80),
      savedRecommendation,
      savedWorkflowStatus: cleanText(raw.savedWorkflowStatus || opportunity?.workflowStatus, 80),
      savedRecommendationReproduced: raw.savedRecommendationReproduced !== false,
      savedWorkflowReproduced: raw.savedWorkflowReproduced !== false,
      historicalSavedDecisionPreserved: raw.historicalSavedDecisionPreserved === true,
      currentEvidenceReconciled: raw.currentEvidenceReconciled === true,
      currentGovernedAcceptedSales: safeInteger(raw.currentGovernedAcceptedSales),
      watchAtOrBelowCents,
      buyAtOrBelowCents,
      transitions,
      thresholdCount: safeInteger(raw.thresholdCount) ?? transitions.length
    };
  }

  function unavailableSnapshot(opportunity, reason) {
    const opportunityId = cleanText(opportunity?.id, 200);
    if (!SAFE_ID.test(opportunityId)) return null;
    const recommendation = safeDecision(opportunity?.recommendation);
    return {
      available: false,
      opportunityId,
      currentRecommendation: recommendation,
      savedRecommendation: recommendation,
      reason
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
    const opportunity = data?.opportunity;
    const raw = data?.priceIntelligence;
    const normalized = normalizePriceIntelligence(opportunity, raw)
      || unavailableSnapshot(
        opportunity,
        raw && typeof raw === "object"
          ? "SAFETY_CONTRACT_NOT_SATISFIED"
          : "BACKEND_PRICE_INTELLIGENCE_NOT_RETURNED"
      );
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

  function historicalMismatch(snapshot) {
    return snapshot?.available === true
      && snapshot.historicalSavedDecisionPreserved === true
      && snapshot.savedRecommendationReproduced === false
      && Boolean(snapshot.savedRecommendation)
      && snapshot.savedRecommendation !== snapshot.currentRecommendation;
  }

  function statusCopy(snapshot) {
    if (historicalMismatch(snapshot)) {
      return `The saved ${snapshot.savedRecommendation} is historical and is not reproducible from the current governed evidence. Current reproducible decision: ${snapshot.currentRecommendation}.`;
    }
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

  function buildUnavailablePanel(snapshot) {
    const safetyRejected = snapshot.reason === "SAFETY_CONTRACT_NOT_SATISFIED";
    const explanation = safetyRejected
      ? "Price Intelligence was returned, but the response did not satisfy FlipForge's read-only safety contract. No threshold was displayed."
      : "The current backend response did not return governed Price Intelligence for this saved opportunity. No WATCH or BUY threshold was invented.";
    const signature = `UNAVAILABLE|${snapshot.reason}|${snapshot.currentRecommendation}`;
    const current = snapshot.currentRecommendation ? `CURRENT: ${snapshot.currentRecommendation}` : "UNAVAILABLE";
    return {
      signature,
      markup: `<section class="panel price-intelligence-panel" data-price-intelligence-panel data-price-intelligence-signature="${escapeHtml(signature)}" aria-label="Counterfactual price intelligence">
        <header class="panel-header">
          <div>
            <span class="eyebrow">What changes the decision?</span>
            <h2>Price Intelligence</h2>
            <p>${escapeHtml(explanation)}</p>
          </div>
          <span class="staging-status staging-status-neutral price-intelligence-status">${escapeHtml(current)}</span>
        </header>
        <div class="panel-body">
          <p class="price-intelligence-unavailable">Price thresholds remain unavailable until the authoritative backend returns a valid read-only counterfactual result.</p>
          <p class="price-intelligence-boundary"><strong>Authority boundary:</strong> The browser does not calculate, infer, or repair missing BUY/WATCH/VERIFY/PASS intelligence.</p>
        </div>
      </section>`
    };
  }

  function buildPanel(snapshot) {
    if (snapshot.available === false) return buildUnavailablePanel(snapshot);

    const mismatch = historicalMismatch(snapshot);
    const ladder = snapshot.transitions.map(step =>
      `<span class="price-intelligence-step"><strong>${escapeHtml(step.recommendation)}</strong> at or below ${escapeHtml(money(step.allInAskCents))}</span>`
    ).join("");

    const decisionMetrics = mismatch
      ? [
          metric("Saved historical decision", snapshot.savedRecommendation, snapshot.savedRecommendation),
          metric("Current reproducible decision", snapshot.currentRecommendation, snapshot.currentRecommendation)
        ]
      : [];
    const metrics = [
      ...decisionMetrics,
      metric("Current ask", money(snapshot.currentAllInAskCents)),
      metric("WATCH at or below", snapshot.watchAtOrBelowCents === null ? "Not reached" : money(snapshot.watchAtOrBelowCents), "WATCH"),
      metric("BUY at or below", snapshot.buyAtOrBelowCents === null ? "Not reached" : money(snapshot.buyAtOrBelowCents), "BUY")
    ].join("");

    const reconciliation = mismatch
      ? `<div class="boundary-note price-intelligence-reconciliation" data-history-reconciliation-note><strong>Decision reconciliation:</strong> The saved ${escapeHtml(snapshot.savedRecommendation)} remains in history, but current governed evidence reproduces ${escapeHtml(snapshot.currentRecommendation)}. FlipForge does not rewrite the saved record.</div>`
      : "";

    const signature = [
      snapshot.currentRecommendation,
      snapshot.savedRecommendation || "x",
      snapshot.savedRecommendationReproduced ? "saved-ok" : "saved-mismatch",
      snapshot.currentEvidenceReconciled ? "evidence-reconciled" : "evidence-unchanged",
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
          ${reconciliation}
          <div class="price-intelligence-grid">${metrics}</div>
          ${ladder ? `<div class="price-intelligence-ladder" aria-label="Lower-price decision ladder">${ladder}</div>` : `<p class="price-intelligence-unavailable">No lower-price decision transition is available from the existing authority.</p>`}
          <p class="price-intelligence-boundary"><strong>Authority boundary:</strong> These thresholds come from rerunning Smart Opportunity at hypothetical prices while keeping the governed non-price context unchanged. They are decision support only and do not authorize a purchase, bid, offer, or payment.</p>
        </div>
      </section>`
    };
  }

  function reconcileHistoricalDisplay(snapshot) {
    if (!historicalMismatch(snapshot)) return;

    const summary = `Saved historical decision ${snapshot.savedRecommendation}. Current reproducible decision ${snapshot.currentRecommendation}.`;
    const heroBadge = document.querySelector(".customer-intelligence-hero .customer-hero-title .staging-status");
    if (heroBadge) {
      heroBadge.textContent = `SAVED ${snapshot.savedRecommendation}`;
      heroBadge.setAttribute("aria-label", summary);
      heroBadge.setAttribute("title", summary);
    }

    const tracePanel = Array.from(document.querySelectorAll("#main-content section.panel")).find(section => {
      const heading = section.querySelector(".panel-header h2");
      return heading && /Decision Traceback$/.test(String(heading.textContent || "").trim());
    });
    if (tracePanel) {
      const heading = tracePanel.querySelector(".panel-header h2");
      if (heading) heading.textContent = "Saved Decision Traceback";
      const traceBadge = tracePanel.querySelector(".panel-header .staging-status");
      if (traceBadge) {
        traceBadge.textContent = `SAVED ${snapshot.savedRecommendation}`;
        traceBadge.setAttribute("aria-label", summary);
      }
      let note = tracePanel.querySelector("[data-history-reconciliation-note]");
      if (!note) {
        note = document.createElement("div");
        note.className = "boundary-note";
        note.dataset.historyReconciliationNote = "true";
        const body = tracePanel.querySelector(".panel-body");
        if (body) tracePanel.insertBefore(note, body);
      }
      if (note) {
        note.textContent = `Historical snapshot only: ${snapshot.savedRecommendation} was saved previously. Current governed evidence now reproduces ${snapshot.currentRecommendation}; the saved record is not rewritten.`;
      }
    }

    const boundary = document.querySelector(".customer-decision-boundary");
    if (boundary) {
      const heading = boundary.querySelector("h2");
      if (heading) heading.textContent = `Current reproducible decision: ${snapshot.currentRecommendation}`;
      const paragraph = boundary.querySelector("p");
      if (paragraph) paragraph.textContent = `The saved ${snapshot.savedRecommendation} remains historical context. Current governed evidence does not reproduce it, so ${snapshot.currentRecommendation} is the current decision-support state.`;
    }
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
    if (existing?.dataset.priceIntelligenceSignature === built.signature) {
      reconcileHistoricalDisplay(snapshot);
      return;
    }

    const holder = document.createElement("div");
    holder.innerHTML = built.markup;
    const panel = holder.firstElementChild;
    if (!panel) return;

    const cardSightPanel = document.querySelector("[data-cardsight-evidence-panel]");
    if (existing) existing.replaceWith(panel);
    else if (cardSightPanel) cardSightPanel.insertAdjacentElement("beforebegin", panel);
    else hero.insertAdjacentElement("afterend", panel);
    reconcileHistoricalDisplay(snapshot);
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
