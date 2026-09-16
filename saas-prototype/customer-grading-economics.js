(() => {
  "use strict";

  const VERSION = "v1.0.0";
  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const PANEL_SELECTOR = "[data-ff-grading-economics]";
  const MAIN_SELECTOR = "#main-content";

  let loading = false;
  let loadedId = "";
  let scheduled = 0;
  let observer = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatCurrency(cents) {
    const value = safeNumber(cents) / 100;
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      }).format(value);
    } catch (_) {
      return `$${Math.round(value).toLocaleString("en-US")}`;
    }
  }

  function signedCurrency(cents) {
    const value = safeNumber(cents);
    if (value === 0) return "$0";
    return `${value > 0 ? "+" : "−"}${formatCurrency(Math.abs(value))}`;
  }

  function titleCase(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function routeId() {
    const hash = String(window.location.hash || "").replace(/^#\/?/, "");
    const parts = hash.split(/[/?]/).filter(Boolean);
    if (parts[0] !== "psa-advisor") return "";
    let id = "";
    try { id = decodeURIComponent(parts[1] || ""); }
    catch (_) { return ""; }
    return SAFE_ID.test(id) ? id : "";
  }

  function correlationId() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `grading-economics-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("Response exceeded browser safety limit.");
    try { return text ? JSON.parse(text) : {}; }
    catch (_) { throw new Error("Invalid JSON response."); }
  }

  function validEnvelope(payload, expectedCorrelationId, expectedId) {
    const meta = payload?.meta;
    const data = payload?.data;
    if (!meta || !data) return false;
    if (meta.contractVersion !== CONTRACT_VERSION) return false;
    if (meta.correlationId !== expectedCorrelationId) return false;
    if (meta.authority !== "Smart Opportunity") return false;
    if (meta.gradingAuthority !== "Existing PSA intelligence") return false;
    if (data.kind !== "psa-advisor") return false;
    if (String(data.opportunityId || "") !== expectedId) return false;
    return true;
  }

  function governedEconomics(data) {
    const economics = data?.gradingIntelligence?.gradingEconomics;
    if (!economics || typeof economics !== "object") return null;
    const safe = economics.gradeProbabilitiesConsumed === false
      && economics.activeListingsUsedAsCompletedSaleEvidence === false
      && economics.gradePredictionPerformed === false
      && economics.gradingAuthorityChanged === false
      && economics.recommendationAuthorityChanged === false
      && economics.selfTrainingAuthorized === false
      && economics.transactionAuthority === false;
    return safe ? economics : null;
  }

  function badge(label, tone = "neutral") {
    return `<span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function laneCard(label, lane) {
    if (!lane || typeof lane !== "object") {
      return `<div><span>${escapeHtml(label)}</span><strong>Not enough exact sold evidence</strong><small>FlipForge will not infer this value lane.</small></div>`;
    }
    const exactSales = Math.max(0, Math.trunc(safeNumber(lane.acceptedExactCompletedSaleCount)));
    const support = lane.supportRating ? titleCase(lane.supportRating) : "Unavailable";
    const risk = lane.riskLevel ? titleCase(lane.riskLevel) : "Unavailable";
    return `<div><span>${escapeHtml(label)} supported value</span><strong>${formatCurrency(lane.supportedValueCents)}</strong><small>${exactSales} exact completed sale${exactSales === 1 ? "" : "s"} · ${escapeHtml(support)} support · ${escapeHtml(risk)} risk</small></div>`;
  }

  function scenarioCard(label, scenario) {
    if (!scenario || typeof scenario !== "object") return "";
    const net = safeNumber(scenario.netAfterCostsCents);
    const incremental = safeNumber(scenario.incrementalNetVsRawCents);
    const status = titleCase(scenario.economicStatus || "scenario");
    return `<div><span>${escapeHtml(label)} net after costs</span><strong>${formatCurrency(net)}</strong><small>${signedCurrency(incremental)} vs. selling RAW · ${escapeHtml(status)}</small></div>`;
  }

  function statusCopy(economics) {
    const status = String(economics?.status || "");
    if (economics?.economicsReady === true) {
      return {
        label: "Scenario economics ready",
        tone: "ok",
        detail: "Exact completed-sale value lanes and saved grading costs are available."
      };
    }
    if (status === "COST_ASSUMPTIONS_REQUIRED" && economics?.valueLanesReady === true) {
      return {
        label: "Add grading costs",
        tone: "warn",
        detail: "The evidence-backed value lanes are ready, but net economics stay hidden until a complete saved cost profile exists."
      };
    }
    return {
      label: "More evidence required",
      tone: "warn",
      detail: "One or more exact completed-sale value lanes are not ready, so FlipForge is not filling the gap with estimates."
    };
  }

  function costSummary(economics) {
    if (economics?.costAssumptionsAvailable !== true || !economics.costs) return "";
    const costs = economics.costs;
    const direct = safeNumber(costs.gradingFeeCents)
      + safeNumber(costs.inboundShippingCents)
      + safeNumber(costs.returnShippingCents)
      + safeNumber(costs.insuranceAndHandlingCents)
      + safeNumber(costs.fixedSellingCostCents);
    const friction = safeNumber(costs.sellingFrictionBps) / 100;
    return `<div><span>Saved direct grading costs</span><strong>${formatCurrency(direct)}</strong><small>${friction.toFixed(1)}% selling friction is also modeled.</small></div>`;
  }

  function panelMarkup(economics) {
    const status = statusCopy(economics);
    const analysis = economics?.economicsReady === true && economics.economics && typeof economics.economics === "object"
      ? economics.economics
      : null;
    const scenarioMarkup = analysis
      ? `<div class="staging-key-grid">${costSummary(economics)}<div><span>Break-even graded value</span><strong>${formatCurrency(analysis.breakEvenGradedValueCents)}</strong><small>Minimum supported graded value needed to cover modeled costs.</small></div>${scenarioCard("PSA 9", analysis.psa9)}${scenarioCard("PSA 10", analysis.psa10)}</div>`
      : "";
    const readyNote = economics?.valueLanesReady === true
      ? "These values come from governed exact completed-sale evidence. Active listings are excluded from value authority."
      : "FlipForge requires governed exact completed-sale evidence for RAW, PSA 9, and PSA 10 before treating the value lanes as ready.";

    return `<section class="panel" data-ff-grading-economics data-ff-version="${VERSION}"><header class="panel-header"><div><span class="eyebrow">Grading Economics</span><h2>What does grading have to overcome?</h2><p>Compare RAW, PSA 9, and PSA 10 economics using evidence-backed value lanes and saved costs.</p></div>${badge(status.label, status.tone)}</header><div class="panel-body"><p>${escapeHtml(status.detail)}</p><div class="staging-key-grid">${laneCard("RAW", economics?.raw)}${laneCard("PSA 9", economics?.psa9)}${laneCard("PSA 10", economics?.psa10)}</div>${scenarioMarkup}<div class="boundary-note"><strong>Evidence boundary:</strong> ${escapeHtml(readyNote)}</div><div class="boundary-note"><strong>Decision boundary:</strong> This is scenario analysis only. FlipForge does not predict the grade, assign grade probabilities, change the saved BUY/WATCH/VERIFY/PASS decision, or authorize a transaction.</div></div></section>`;
  }

  function unavailableMarkup() {
    return `<section class="panel" data-ff-grading-economics data-ff-version="${VERSION}"><header class="panel-header"><div><span class="eyebrow">Grading Economics</span><h2>Grading economics not available yet</h2><p>The governed A12A projection is not ready for this saved card.</p></div>${badge("Not ready", "warn")}</header><div class="panel-body"><div class="boundary-note"><strong>No substitute data:</strong> FlipForge did not create estimated values, grade probabilities, or a grading recommendation to fill the gap.</div></div></section>`;
  }

  function inject(markup) {
    if (routeId() === "") return;
    const main = document.querySelector(MAIN_SELECTOR);
    const page = main?.querySelector?.(".customer-intelligence-page");
    if (!page || page.querySelector(PANEL_SELECTOR)) return;
    const panels = page.querySelectorAll("section.panel");
    const anchor = panels.length ? panels[panels.length - 1] : null;
    if (anchor) anchor.insertAdjacentHTML("afterend", markup);
    else page.insertAdjacentHTML("beforeend", markup);
  }

  async function load() {
    const id = routeId();
    const main = document.querySelector(MAIN_SELECTOR);
    if (!id || !main) return;
    if (main.querySelector(PANEL_SELECTOR)) return;
    if (loading) return;
    if (loadedId === id && main.querySelector(PANEL_SELECTOR)) return;

    loading = true;
    const requestCorrelationId = correlationId();
    try {
      const response = await fetch(`/api/v1/psa-advisor/${encodeURIComponent(id)}`, {
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
      if (!response.ok || !validEnvelope(payload, requestCorrelationId, id)) {
        inject(unavailableMarkup());
        loadedId = id;
        return;
      }
      const economics = governedEconomics(payload.data);
      inject(economics ? panelMarkup(economics) : unavailableMarkup());
      loadedId = id;
    } catch (_) {
      inject(unavailableMarkup());
      loadedId = id;
    } finally {
      loading = false;
    }
  }

  function schedule() {
    if (scheduled) window.clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      scheduled = 0;
      load();
    }, 75);
  }

  function start() {
    const main = document.querySelector(MAIN_SELECTOR);
    if (!main) return;
    if (!observer) {
      observer = new MutationObserver(schedule);
      observer.observe(main, { childList: true, subtree: true });
    }
    window.addEventListener("hashchange", () => {
      loadedId = "";
      schedule();
    });
    schedule();
  }

  window.FlipForgeCustomerGradingEconomics = Object.freeze({
    version: VERSION,
    refresh: schedule
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
