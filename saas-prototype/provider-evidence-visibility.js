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
    // The API now names the provider neutrally ("DATA_PROVIDER"); older responses used the internal code.
    // The gateway (netlify/functions/provider-disclosure-filter.js) rewrites the provider name to DATA_PROVIDER.
    if (String(summary.provider || "").toUpperCase() !== "DATA_PROVIDER") return null;

    const status = String(summary.status || "").toUpperCase();
    if (!SAFE_STATUS.test(status)) return null;
    if (typeof summary.attempted !== "boolean") return null;
    if (typeof summary.fixedPriceRowsCanSupportValue !== "boolean"
        || summary.activeListingsCanSupportValue !== false
        || summary.automaticOutlierAcceptance !== false
        || summary.transactionAuthority !== false) return null;
    if (summary.fixedPriceRowsCanSupportValue === true && summary.historicalCompletedSalesOnly !== true) return null;

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
      fixedPriceRowsCanSupportValue: summary.fixedPriceRowsCanSupportValue === true,
      historicalCompletedSalesOnly: summary.historicalCompletedSalesOnly === true,
      // Customer wording only: the provider is never named to customers.
      message: cleanText(summary.message).replace(/\bqualified for governed evidence\b/gi, "passed FlipForge's evidence checks").replace(/card[\s_-]?sight/gi, "our data provider")
    };
  }

  function isProviderEvidence(row) {
    const combined = [row?.sourceName, row?.sourceMarketplace, row?.source, row?.provider]
      .map(value => String(value || "").toUpperCase())
      .join(" ");
    return combined.includes("DATA_PROVIDER") || combined.includes("(DATA PROVIDER)");
  }

  function normalizeEvidenceSnapshot(opportunityId, data) {
    if (!SAFE_ID.test(opportunityId) || !data || typeof data !== "object") return null;
    // New API: provider rows are never listed; providerEvidenceSummary carries their counts.
    const providerSummary = data.providerEvidenceSummary && typeof data.providerEvidenceSummary === "object" ? data.providerEvidenceSummary : null;
    // Since the provider containment the API states whether provider sale records are kept, whether the provider is
    // used at all, and whether the saved decision relied on evidence FlipForge no longer accepts. Use those facts
    // instead of showing a bare 0 or promising a provider check that will not happen.
    // legacyNotice is set by the backend only when the saved decision used evidence that is now withheld.
    const legacy = Boolean(cleanText(data.legacyNotice || "", 400));
    if (providerSummary) {
      return {
        opportunityId,
        acceptedExactCompletedSales: safeInteger(data.acceptedExactCompletedSales),
        providerRows: safeInteger(providerSummary.storedRowsLinked),
        acceptedProviderRows: safeInteger(providerSummary.storedRowsAdmittedNow),
        providerRecordsKept: providerSummary.storedSaleRecordsKept !== false,
        providerOff: String(providerSummary.evidenceMode || "").toUpperCase() === "PROVIDER_SALES_OFF",
        legacy
      };
    }
    const rows = Array.isArray(data.linkedEvidence) ? data.linkedEvidence : [];
    const providerRows = rows.filter(isProviderEvidence);
    return {
      opportunityId,
      acceptedExactCompletedSales: safeInteger(data.acceptedExactCompletedSales),
      providerRows: providerRows.length,
      acceptedProviderRows: providerRows.filter(row => row?.authorityEligible === true).length,
      providerRecordsKept: true,
      providerOff: false,
      legacy
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

  window.fetch = function flipForgeProviderVisibleFetch(input, init) {
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

  function savedExplanation(evidence) {
    const parts = [];
    if (evidence?.legacy) {
      parts.push("This saved decision relied on sale evidence FlipForge no longer accepts. Those sales are not shown, and the saved decision is kept exactly as it was made.");
    }
    if (evidence?.providerOff) {
      parts.push("Sale records from our data provider are not kept, and new evaluations do not use that provider right now. A new evaluation uses only FlipForge's authorized independent completed-sale evidence, which may have no sales of this exact card.");
    } else if (!evidence?.legacy) {
      parts.push("Current evidence is shown below. A fresh evaluation will also show whether historical pricing from our data provider was checked and how many rows qualified.");
    }
    return parts.join(" ");
  }

  function statusExplanation(summary, evidence = null) {
    if (!summary) return savedExplanation(evidence);
    const completedScope = summary.fixedPriceRowsCanSupportValue
      ? "historical completed-sale records, including auction and fixed-price sales"
      : "historical auction records";
    if (summary.status === "ENRICHED") return `Reported ${completedScope} from our data provider were checked before Smart Opportunity ran. Only rows that passed FlipForge exact-evidence rules were allowed to support value.`;
    if (summary.status === "REVIEW_REQUIRED") return "Our data provider returned historical records, but one or more evidence checks prevented automatic acceptance. Those rows did not silently become value-supporting evidence.";
    if (summary.status === "NO_EXACT_SALES") return `Our data provider was checked, but no recent ${summary.fixedPriceRowsCanSupportValue ? "historical completed sale" : "historical auction sale"} met FlipForge's exact-evidence standard for this card.`;
    if (summary.status === "PROVIDER_NOT_CONFIGURED") return "Historical pricing from our data provider was not configured when the evaluation ran. No substitute sold comps were invented.";
    if (summary.status === "PROVIDER_UNAVAILABLE") return "Our data provider could not be reached for this evaluation. FlipForge continued only with previously governed evidence and invented nothing.";
    return summary.attempted
      ? "Historical pricing from our data provider was checked under FlipForge's sold-evidence rules."
      : "Historical pricing from our data provider was not checked for this evaluation.";
  }

  function metric(label, value) {
    return `<div class="provider-evidence-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
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
      summary?.fixedPriceRowsCanSupportValue === true ? 1 : 0,
      evidence?.providerRows ?? "x",
      evidence?.acceptedProviderRows ?? "x",
      evidence?.acceptedExactCompletedSales ?? "x",
      evidence?.providerRecordsKept === false ? 0 : 1,
      evidence?.providerOff === true ? 1 : 0,
      evidence?.legacy === true ? 1 : 0
    ].join("|");
  }

  function buildPanel(opportunityId) {
    const summary = summaries.get(opportunityId) || null;
    const evidence = evidenceSnapshots.get(opportunityId) || null;
    if (!summary && !evidence) return null;

    const status = summary?.status || "CURRENT_EVIDENCE";
    const tone = statusTone(status);
    const currentAccepted = !evidence ? "—" : evidence.providerRecordsKept === false ? "Not kept" : evidence.acceptedProviderRows;
    const totalAccepted = evidence ? evidence.acceptedExactCompletedSales : "—";
    // Sale records not kept (review 2026-10-31): the card page shows the saved receipt's count "at decision"
    // (customer-opportunities.js, [data-sales-at-decision]). Today's 0 is then not shown as "all saved" sales next to a
    // saved BUY; the count the decision was made on is shown instead ("Unavailable" when it was never recorded).
    const atDecisionAttr = evidence?.providerRecordsKept === false ? document.querySelector("#main-content [data-sales-at-decision]")?.getAttribute("data-sales-at-decision") : null;
    const totalMetric = atDecisionAttr === null || atDecisionAttr === undefined
      ? metric("All saved exact accepted sales", totalAccepted)
      : metric("Exact sales at decision", /^\d+$/.test(atDecisionAttr) ? atDecisionAttr : "Unavailable");
    const metrics = summary
      ? [
          metric("Returned", summary.returnedRows),
          metric("Exact candidates", summary.exactCandidateRows),
          metric("Qualified", summary.qualifiedRows),
          metric("Newly persisted", summary.newlyPersistedRows),
          metric("Review required", summary.reviewRows),
          metric("Rejected", summary.rejectedRows),
          metric("Saved accepted sales from our data provider", currentAccepted),
          totalMetric
        ].join("")
      : [
          metric("Saved accepted sales from our data provider", currentAccepted),
          totalMetric
        ].join("");

    const signature = `${panelSignature(summary, evidence)}|${atDecisionAttr ?? ""}`;
    const providerMessage = summary?.message ? `<p class="provider-evidence-provider-message">${escapeHtml(summary.message)}</p>` : "";
    const boundary = summary?.fixedPriceRowsCanSupportValue === true
      ? "Historical completed sales, including fixed-price completed sales, may support value only after FlipForge exact-evidence checks. Active listings and asking prices cannot support value."
      : "Fixed-price asks and active listings cannot support value.";
    const markup = `<section class="panel provider-evidence-panel" data-provider-evidence-panel data-provider-evidence-signature="${escapeHtml(signature)}" aria-label="Reported sale evidence status">
      <header class="panel-header">
        <div>
          <span class="eyebrow">Historical sold evidence</span>
          <h2>Reported sale evidence</h2>
          <p>${escapeHtml(statusExplanation(summary, evidence))}</p>
        </div>
        <span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(status.replaceAll("_", " "))}</span>
      </header>
      <div class="panel-body">
        <div class="provider-evidence-grid">${metrics}</div>
        ${providerMessage}
        <p class="provider-evidence-boundary"><strong>Evidence boundary:</strong> ${escapeHtml(boundary)} Our data provider never supplies the BUY/WATCH/VERIFY/PASS recommendation; Smart Opportunity remains the sole decision authority.</p>
      </div>
    </section>`;
    return { signature, markup };
  }

  function render() {
    renderQueued = false;
    const opportunityId = routeOpportunityId();
    const existing = document.querySelector("[data-provider-evidence-panel]");
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
    if (existing?.dataset.providerEvidenceSignature === built.signature) return;

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
