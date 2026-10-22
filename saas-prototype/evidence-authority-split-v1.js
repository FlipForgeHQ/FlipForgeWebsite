(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const cache = new Map();
  const inflight = new Map();
  let queued = false;

  function evidenceId() {
    const match = String(window.location.hash || "").match(/^#\/evidence\/([^/?#]+)/);
    if (!match) return "";
    try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `evidence-authority-split-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function money(value) {
    if (value === null || value === undefined || value === "") return "Unavailable";
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "Unavailable";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(parsed);
  }

  function badge(label, tone) {
    return `<span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function sectionByHeading(page, pattern) {
    return [...page.querySelectorAll("section.panel")].find(section =>
      pattern.test(String(section.querySelector("h2")?.textContent || ""))) || null;
  }

  // Current admission status from the server (#866). Only EXCLUDED means "checked and failed a rule".
  const STATUS = {
    ADMITTED: { label: "Counted now", tone: "buy", meaning: "Counted towards the current price." },
    EXCLUDED: { label: "Excluded", tone: "pass", meaning: "Checked against its sale record and failed a current evidence rule." },
    HELD: { label: "Held for review", tone: "warn", meaning: "Not counted and not rejected: it could not be checked yet or needs review." },
    NOT_USED: { label: "Not used", tone: "neutral", meaning: "Outside the current price: rejected at its original review, recorded for a different card, or the same sale as another row." },
    NOT_REPORTED: { label: "Not counted", tone: "neutral", meaning: "Not counted towards the current price. This server did not report a detailed status." }
  };
  const NOT_COUNTED_ORDER = ["EXCLUDED", "HELD", "NOT_USED", "NOT_REPORTED"];

  function statusOf(item) {
    const reported = String(item?.currentAdmissionStatus || "").toUpperCase();
    if (STATUS[reported]) return reported;
    return item?.authorityEligible === true ? "ADMITTED" : "NOT_REPORTED";
  }

  function dateOnly(value) {
    const text = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : (text || "Unavailable");
  }

  function reasonText(item, status) {
    const reason = String(item?.rejectionReason || "").trim();
    if (reason) return reason;
    const codes = Array.isArray(item?.currentAdmissionReasons) ? item.currentAdmissionReasons.join(", ") : "";
    return codes ? `${STATUS[status].meaning} (${codes})` : STATUS[status].meaning;
  }

  // Shared table (customer-trust-display-v1.js): customer source wording, and no blank, "undefined" or "$0" cells when
  // the API withholds individual sale prices or dates.
  function sharedTable(items, options) {
    return window.FlipForgeTrustDisplay ? window.FlipForgeTrustDisplay.evidenceTable(items, options) : "";
  }

  function trustedTable(items) {
    if (!items.length) {
      return '<div class="staging-empty"><strong>No sales are counted towards the current price.</strong><p>FlipForge will not substitute candidate or historically linked rows.</p></div>';
    }
    const shared = sharedTable(items, {
      tableAttributes: "data-ff-trusted-evidence-table",
      sourceSuffix: "provider-reported",
      identityHeading: "Identity key",
      statusHeading: "Current status",
      identityCell: item => item.identityMatch === true ? badge("Identity key match", "ok") : badge("Identity key differs", "warn"),
      statusCell: () => badge(STATUS.ADMITTED.label, STATUS.ADMITTED.tone)
    });
    if (shared) return shared;
    return `<div class="table-wrap"><table data-ff-trusted-evidence-table><thead><tr><th>Source</th><th>Amount</th><th>Sale date</th><th>Identity key</th><th>Current status</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(item.sourceName || "Saved source")}</strong><small>${escapeHtml(item.type || "Unknown type")} · provider-reported</small></td><td>${money(item.amount)}</td><td>${escapeHtml(dateOnly(item.soldAt || item.recordedAt))}</td><td>${item.identityMatch === true ? badge("Identity key match", "ok") : badge("Identity key differs", "warn")}</td><td>${badge(STATUS.ADMITTED.label, STATUS.ADMITTED.tone)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function notCountedTable(items, status) {
    const info = STATUS[status];
    const shared = sharedTable(items, {
      tableAttributes: `data-ff-excluded-evidence-table data-ff-status-table="${escapeHtml(status)}"`,
      identityHeading: "Identity key",
      statusHeading: "Why",
      identityCell: item => item.identityMatch === true ? badge("Identity key match", "neutral") : badge("Identity key differs", "warn"),
      statusCell: item => `${badge(info.label, info.tone)}<small>${escapeHtml(reasonText(item, status))}</small>`
    });
    if (shared) {
      return `<div class="ff-evidence-status-group" data-ff-evidence-status="${escapeHtml(status)}"><h3>${escapeHtml(info.label)} <span>${items.length}</span></h3><p>${escapeHtml(info.meaning)}</p>${shared}</div>`;
    }
    return `<div class="ff-evidence-status-group" data-ff-evidence-status="${escapeHtml(status)}"><h3>${escapeHtml(info.label)} <span>${items.length}</span></h3><p>${escapeHtml(info.meaning)}</p><div class="table-wrap"><table data-ff-excluded-evidence-table data-ff-status-table="${escapeHtml(status)}"><thead><tr><th>Source</th><th>Amount</th><th>Sale date</th><th>Identity key</th><th>Why</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(item.sourceName || "Saved source")}</strong><small>${escapeHtml(item.type || "Unknown type")}</small></td><td>${money(item.amount)}</td><td>${escapeHtml(dateOnly(item.soldAt || item.recordedAt))}</td><td>${item.identityMatch === true ? badge("Identity key match", "neutral") : badge("Identity key differs", "warn")}</td><td>${badge(info.label, info.tone)}<small>${escapeHtml(reasonText(item, status))}</small></td></tr>`).join("")}</tbody></table></div></div>`;
  }

  function notCountedMarkup(groups, countedCount) {
    const present = NOT_COUNTED_ORDER.filter(status => groups[status].length);
    if (!present.length) {
      // With nothing linked at all, "every linked sale is counted" would contradict "no sales are counted".
      return countedCount > 0
        ? '<div class="staging-empty"><strong>Every linked sale is counted towards the current price.</strong></div>'
        : '<div class="staging-empty"><strong>Nothing was set aside.</strong><p>No sales are linked to this card yet, so there is nothing to exclude.</p></div>';
    }
    return present.map(status => notCountedTable(groups[status], status)).join("");
  }

  function decisionTimeMarkup(decision) {
    if (!decision || decision.available !== true) return "";
    // A legacy decision (saved before current evidence rules) has no current supported value; the value it was saved
    // with is shown only as "Saved value at the time (legacy)".
    const display = window.FlipForgeTrustDisplay;
    if (display?.isLegacy(decision)) {
      const saved = display.legacySavedValues(decision);
      return `<section class="panel ff-evidence-decision-time" data-ff-decision-time-section><header class="panel-header"><div><h2>The saved decision</h2><p>Recorded when this decision was saved. Later evidence-rule changes never rewrite it.</p>${display.legacyMarkup(decision)}</div></header><div class="panel-body"><div class="ff-evidence-decision-time-grid"><article><span>Recommendation (historical)</span><strong>${escapeHtml(String(decision.recommendation || "Unavailable"))}</strong></article><article><span>Ask at the time</span><strong>${money(decision.askPrice)}</strong></article><article><span>Saved value at the time (legacy)</span><strong>${saved.supported === null ? "Unavailable" : money(saved.supported)}</strong></article><article><span>Sales behind it</span><strong>${escapeHtml(String(decision.salesCountAtDecision ?? "Unavailable"))}</strong></article><article><span>Decision saved</span><strong>${escapeHtml(dateOnly(decision.evaluatedAt))}</strong></article></div></div></section>`;
    }
    return `<section class="panel ff-evidence-decision-time" data-ff-decision-time-section><header class="panel-header"><div><h2>The saved decision</h2><p>Recorded when this decision was saved. Later evidence-rule changes never rewrite it.</p></div></header><div class="panel-body"><div class="ff-evidence-decision-time-grid"><article><span>Recommendation</span><strong>${escapeHtml(String(decision.recommendation || "Unavailable"))}</strong></article><article><span>Ask at the time</span><strong>${money(decision.askPrice)}</strong></article><article><span>Supported value at the time</span><strong>${Number(decision.supportedValue) > 0 ? money(decision.supportedValue) : Number(decision.salesCountAtDecision) === 0 ? "None (no qualifying sales)" : "Not established"}</strong></article><article><span>Sales behind it</span><strong>${escapeHtml(String(decision.salesCountAtDecision ?? "Unavailable"))}</strong></article><article><span>Decision saved</span><strong>${escapeHtml(dateOnly(decision.evaluatedAt))}</strong></article></div></div></section>`;
  }

  // Counts that disagree with the rows must not be shown at all: hide every evidence element on the page and
  // show one plain notice instead. Idempotent, so re-renders by other scripts are hidden again.
  function failClosed(page) {
    page.dataset.ffEvidenceAuthoritySplit = "invalid";
    const keep = el => el.matches(".page-heading, .boundary-note, .customer-management-select-panel, [data-ff-evidence-invalid-notice]");
    for (const child of [...page.children]) {
      if (!keep(child)) child.hidden = true;
    }
    if (!page.querySelector("[data-ff-evidence-invalid-notice]")) {
      page.insertAdjacentHTML("beforeend", '<section class="panel staging-warning" data-ff-evidence-invalid-notice><div class="panel-body"><strong>Evidence temporarily unavailable</strong><p>The sale counts for this card did not check out, so FlipForge is not showing them. Nothing about the saved decision has changed. Please try again shortly.</p></div></section>');
    }
  }

  function renderSplit(data) {
    const id = evidenceId();
    if (!id || !data || String(data.opportunityId || "") !== id) return;
    const page = document.querySelector("#main-content .customer-management-page");
    if (!page || page.dataset.ffEvidenceExperience !== "v2") return;

    const linked = Array.isArray(data.linkedEvidence) ? data.linkedEvidence : [];
    const trusted = linked.filter(item => item?.authorityEligible === true);
    const excluded = linked.filter(item => item?.authorityEligible !== true);
    const trustedCount = Number(data.acceptedExactCompletedSales);
    const excludedCount = Number(data.visibleButAuthorityIneligible);

    const groups = { EXCLUDED: [], HELD: [], NOT_USED: [], NOT_REPORTED: [] };
    for (const item of excluded) {
      const status = statusOf(item);
      (groups[status] || groups.NOT_REPORTED).push(item);
    }
    const reported = data.currentAdmission && typeof data.currentAdmission === "object" ? data.currentAdmission : null;
    // New API: rows from our data provider are counted but never listed (no price, date or link leaves the server);
    // providerEvidenceSummary carries their counts and reasons. Listed rows are checked against the counts without them.
    const provider = window.FlipForgeTrustDisplay?.providerSummary(data) || null;
    const providerAdmitted = provider ? provider.admitted : 0;
    const providerNotCounted = provider ? provider.notCounted : 0;
    const listedTrustedCount = trustedCount - providerAdmitted;
    const listedExcludedCount = excludedCount - providerNotCounted;
    const reportedConsistent = !reported || (provider
      ? Number(reported.admitted) - providerAdmitted === trusted.length
        && Number(reported.excluded) >= groups.EXCLUDED.length
        && Number(reported.held) >= groups.HELD.length
        && Number(reported.notUsed) >= groups.NOT_USED.length
        && Number(reported.excluded) + Number(reported.held) + Number(reported.notUsed) - providerNotCounted
          === groups.EXCLUDED.length + groups.HELD.length + groups.NOT_USED.length + groups.NOT_REPORTED.length
      : Number(reported.admitted) === trusted.length
        && Number(reported.excluded) === groups.EXCLUDED.length
        && Number(reported.held) === groups.HELD.length
        && Number(reported.notUsed) === groups.NOT_USED.length);

    if (!Number.isFinite(trustedCount)
        || !Number.isFinite(excludedCount)
        || trusted.length !== listedTrustedCount
        || excluded.length !== listedExcludedCount
        || trusted.some(item => statusOf(item) !== "ADMITTED")
        || !reportedConsistent) {
      failClosed(page);
      return;
    }

    const trustedSection = sectionByHeading(page, /^What FlipForge (?:trusted|counted)$/i);
    if (!trustedSection) return;
    const trustedCopy = trustedSection.querySelector(".panel-header p");
    const trustedBody = trustedSection.querySelector(".panel-body");
    if (trustedCopy) {
      // The API's own price-status label describes price support when it is returned.
      const priceStatus = window.FlipForgeTrustDisplay ? window.FlipForgeTrustDisplay.priceStatusLabel(data) : "";
      const priceCopy = priceStatus ? `${priceStatus.replace(/\.$/, "")}.` : "Sale prices are reported by our data provider and have not been independently confirmed.";
      trustedCopy.textContent = `${trustedCount} exact completed sale${trustedCount === 1 ? " is" : "s are"} counted under today's evidence rules. ${priceCopy} FlipForge matches each sale to the exact card but does not confirm payment or settlement.`;
    }
    const providerMarkup = window.FlipForgeTrustDisplay ? window.FlipForgeTrustDisplay.providerSummaryMarkup(data) : "";
    // The provider summary sits with the counted rows when some of its rows count now, otherwise with the rows not counted.
    const providerWithCounted = Boolean(providerMarkup) && providerAdmitted > 0;
    if (trustedBody) trustedBody.innerHTML = `${providerWithCounted ? providerMarkup : ""}${trusted.length || !providerWithCounted ? trustedTable(trusted) : ""}`;
    trustedSection.dataset.ffTrustedOnly = "true";

    let decisionSection = page.querySelector("[data-ff-decision-time-section]");
    const decisionHtml = decisionTimeMarkup(data.decisionTime);
    if (decisionHtml) {
      if (!decisionSection) {
        trustedSection.insertAdjacentHTML("beforebegin", decisionHtml);
      } else {
        decisionSection.outerHTML = decisionHtml;
      }
    }

    let excludedSection = page.querySelector("[data-ff-excluded-evidence-section]");
    if (!excludedSection) {
      excludedSection = document.createElement("section");
      excludedSection.className = "panel ff-evidence-excluded-section";
      excludedSection.dataset.ffExcludedEvidenceSection = "";
      trustedSection.insertAdjacentElement("afterend", excludedSection);
    }
    const summary = NOT_COUNTED_ORDER.filter(status => groups[status].length)
      .map(status => `${groups[status].length} ${STATUS[status].label.toLowerCase()}`).join(" · ");
    // Rows from our data provider appear only as counts and reasons, never as an empty sale table.
    const listedNotCounted = NOT_COUNTED_ORDER.some(status => groups[status].length);
    excludedSection.innerHTML = `<header class="panel-header"><div><h2>What FlipForge did not count — and why</h2><p>${excludedCount > 0 ? `${excludedCount} linked row${excludedCount === 1 ? " is" : "s are"} visible for transparency but not counted now${summary ? ` (${escapeHtml(summary)})` : ""}. Only rows marked Excluded were checked and failed a rule.` : trustedCount > 0 ? "No linked row was set aside." : "No linked rows to review."}</p></div></header><div class="panel-body">${providerWithCounted ? "" : providerMarkup}${listedNotCounted || !providerMarkup || providerWithCounted ? notCountedMarkup(groups, trustedCount) : ""}</div>`;

    page.dataset.ffEvidenceAuthoritySplit = "true";
  }

  async function fetchEvidence(id) {
    if (!id) return null;
    if (cache.has(id)) return cache.get(id);
    if (inflight.has(id)) return inflight.get(id);

    const requestCorrelationId = correlationId();
    const promise = fetch(`/api/v1/evidence/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error("Evidence split request failed.");
      if (payload?.meta?.contractVersion !== CONTRACT_VERSION
          || payload?.meta?.authority !== "Smart Opportunity"
          || payload?.meta?.gradingAuthority !== "Existing PSA intelligence"
          || payload?.meta?.correlationId !== requestCorrelationId
          || payload?.data?.kind !== "evidence") {
        throw new Error("Evidence split response failed the authority contract.");
      }
      cache.set(id, payload.data);
      return payload.data;
    }).catch(() => null).finally(() => inflight.delete(id));

    inflight.set(id, promise);
    return promise;
  }

  function sync() {
    queued = false;
    const id = evidenceId();
    if (!id) return;
    if (cache.has(id)) {
      renderSplit(cache.get(id));
      return;
    }
    fetchEvidence(id).then(data => {
      if (data && evidenceId() === id) renderSplit(data);
    });
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(sync);
  }

  window.addEventListener("hashchange", () => window.setTimeout(queue, 50));
  window.addEventListener("pageshow", queue);
  window.addEventListener("load", queue);
  if (document.body) new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  queue();
})();
