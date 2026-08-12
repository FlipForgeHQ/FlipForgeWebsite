(() => {
  "use strict";

  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
  const SAFE_STATUS = /^[A-Z][A-Z0-9_]{1,39}$/;
  const MAX_MESSAGE = 600;
  const summaries = new Map();
  const evidenceSnapshots = new Map();
  const originalFetch = window.fetch.bind(window);
  let renderQueued = false;

  function safeInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function cleanText(value, max = MAX_MESSAGE) {
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

  function normalizeEnrichment(data) {
    const summary = data?.evidenceEnrichment;
    const opportunityId = cleanText(data?.opportunityId, 200);
    if (!summary || !SAFE_ID.test(opportunityId)) return null;
    if (String(summary.provider || "").toUpperCase() !== "CARDSIGHT") return null;

    const status = String(summary.status || "").toUpperCase();
    if (!SAFE_STATUS.test(status)) return null;
    if (typeof summary.attempted !== "boolean") return null;
    if (summary.fixedPriceRowsCanSupportValue !== false
        || summary.activeListingsCanSupportValue !== false
        || summary.automaticOutlierAcceptance !== false
        || summary.transactionAuthority !== false) return null;

    return {
      opportunityId,
      status,
      attempted: summary.attempted,
      returnedRows: safeInteger(summary.returnedRows),
      exactCandidateRows: safeInteger(summary.exactCandidateRows),
      qualifiedRows: safeInteger(summary.qualifiedRows),
      newlyPersistedRows: safeInteger(summary.newlyPersistedRows),
      reviewRows: safeInteger(summary.reviewRows),
      rejectedRows: safeInteger(summary.rejectedRows),
      message: cleanText(summary.message)
    };
  }

  function isCardSightEvidence(row) {
    const combined = [row?.sourceName, row?.sourceMarketplace, row?.source, row?.provider]
      .map(value => String(value || "").toUpperCase())
      .join(" ");
    return combined.includes("CARDSIGHT");
  }

  function normalizeEvidenceSnapshot(opportunityId, data) {
    if (!SAFE_ID.test(opportunityId) || !data || typeof data !== "object") return null;
    const rows = Array.isArray(data.linkedEvidence) ? data.linkedEvidence : [];
    const cardSightRows = rows.filter(isCardSightEvidence);
    return {
      opportunityId,
      acceptedExactCompletedSales: safeInteger(data.acceptedExactCompletedSales),
      cardSightRows: cardSightRows.length,
      acceptedCardSightRows: cardSightRows.filter(row => row?.authorityEligible === true).length
    };
  }

  async function inspectResponse(input, init, response) {
    if (!response?.ok) return;
    const url = requestUrl(input);
    if (!url || url.origin !== window.location.origin) return;
    const method = requestMethod(input, init);

    if (url.pathname === "/api/v1/evaluations" && method === "POST") {
      const payload = await response.clone().json();
      const summary = normalizeEnrichment(payload?.data);
      if (summary) {
        summaries.set(summary.opportunityId, summary);
        queueRender();
      }
      return;
    }

    const match = url.pathname.match(/^\/api\/v1\/evidence\/([^/?#]+)$/);
    if (match && method === "GET") {
      let opportunityId = "";
      try { opportunityId = decodeURIComponent(match[1]); } catch (_) { return; }
      const payload = await response.clone().json();
      const snapshot = normalizeEvidenceSnapshot(opportunityId, payload?.data);
      if (snapshot) {
        evidenceSnapshots.set(opportunityId, snapshot);
        queueRender();
      }
    }
  }

  window.fetch = function flipForgeCardSightVisibleFetch(input, init) {
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

  function statusTone(status) {
    if (status === "ENRICHED") return "ok";
    if (status === "REVIEW_REQUIRED" || status === "PROVIDER_UNAVAILABLE") return "warn";
    if (status === "NO_EXACT_SALES" || status === "PROVIDER_NOT_CONFIGURED") return "neutral";
    return "neutral";
  }

  function statusExplanation(summary) {
    if (!summary) return "Current evidence is shown below. A fresh evaluation will also show whether CardSight historical pricing was attempted and how many rows qualified.";
    if (summary.status === "ENRICHED") return "CardSight historical auction records were checked before Smart Opportunity ran. Only rows that passed FlipForge exact-evidence rules were allowed to support value.";
    if (summary.status === "REVIEW_REQUIRED") return "CardSight returned historical records, but one or more trust gates prevented automatic acceptance. Those rows did not silently become value-supporting evidence.";
    if (summary.status === "NO_EXACT_SALES") return "CardSight was checked, but no recent historical auction sale met FlipForge's exact-evidence standard for this card.";
    if (summary.status === "PROVIDER_NOT_CONFIGURED") return "CardSight was not configured for this runtime when the evaluation ran. No substitute sold comps were invented.";
    if (summary.status === "PROVIDER_UNAVAILABLE") return "CardSight could not be reached for this evaluation. FlipForge continued only with previously governed evidence and invented nothing.";
    return summary.attempted
      ? "CardSight historical pricing was checked under FlipForge's governed sold-evidence rules."
      : "CardSight historical pricing was not attempted for this evaluation.";
  }

  function metric(label, value) {
    return `<div class="cardsight-evidence-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function panelSignature(summary, evidence) {
    return [
      summary?.status || "CURRENT_EVIDENCE",
      summary?.attempted === true ? 1 : 0,
      summary?.returnedRows ?? "x",
      summary?.exactCandidateRows ?? "x",
      summary?.qualifiedRows ?? "x",
      summary?.newlyPersistedRows ?? "x",
      summary?.reviewRows ?? "x",
      summary?.rejectedRows ?? "x",
      evidence?.cardSightRows ?? "x",
      evidence?.acceptedCardSightRows ?? "x",
      evidence?.acceptedExactCompletedSales ?? "x"
    ].join("|");
  }

  function buildPanel(opportunityId) {
    const summary = summaries.get(opportunityId) || null;
    const evidence = evidenceSnapshots.get(opportunityId) || null;
    if (!summary && !evidence) return null;

    const status = summary?.status || "CURRENT_EVIDENCE";
    const tone = statusTone(status);
    const currentAccepted = evidence ? evidence.acceptedCardSightRows : "—";
    const totalAccepted = evidence ? evidence.acceptedExactCompletedSales : "—";
    const metrics = summary
      ? [
          metric("Returned", summary.returnedRows),
          metric("Exact candidates", summary.exactCandidateRows),
          metric("Qualified", summary.qualifiedRows),
          metric("Newly persisted", summary.newlyPersistedRows),
          metric("Review required", summary.reviewRows),
          metric("Rejected", summary.rejectedRows),
          metric("CardSight accepted now", currentAccepted),
          metric("All exact accepted sales", totalAccepted)
        ].join("")
      : [
          metric("CardSight accepted now", currentAccepted),
          metric("All exact accepted sales", totalAccepted)
        ].join("");

    const signature = panelSignature(summary, evidence);
    const providerMessage = summary?.message ? `<p class="cardsight-evidence-provider-message">${escapeHtml(summary.message)}</p>` : "";
    const markup = `<section class="panel cardsight-evidence-panel" data-cardsight-evidence-panel data-cardsight-evidence-signature="${escapeHtml(signature)}" aria-label="CardSight sold evidence status">
      <header class="panel-header">
        <div>
          <span class="eyebrow">Historical sold evidence</span>
          <h2>CardSight sold evidence</h2>
          <p>${escapeHtml(statusExplanation(summary))}</p>
        </div>
        <span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(status.replaceAll("_", " "))}</span>
      </header>
      <div class="panel-body">
        <div class="cardsight-evidence-grid">${metrics}</div>
        ${providerMessage}
        <p class="cardsight-evidence-boundary"><strong>Evidence boundary:</strong> Fixed-price asks and active listings cannot support value. CardSight never supplies the BUY/WATCH/VERIFY/PASS recommendation; Smart Opportunity remains the sole decision authority.</p>
      </div>
    </section>`;
    return { signature, markup };
  }

  function render() {
    renderQueued = false;
    const opportunityId = routeOpportunityId();
    const existing = document.querySelector("[data-cardsight-evidence-panel]");
    if (!opportunityId) {
      existing?.remove();
      return;
    }

    const hero = document.querySelector("#main-content .customer-intelligence-hero");
    if (!hero) return;
    const built = buildPanel(opportunityId);
    if (!built) {
      existing?.remove();
      return;
    }
    if (existing?.dataset.cardsightEvidenceSignature === built.signature) return;

    const holder = document.createElement("div");
    holder.innerHTML = built.markup;
    const panel = holder.firstElementChild;
    if (!panel) return;
    if (existing) existing.replaceWith(panel);
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
