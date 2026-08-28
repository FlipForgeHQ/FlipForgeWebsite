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

  function trustedTable(items) {
    if (!items.length) {
      return '<div class="staging-empty"><strong>No current authority-eligible exact completed sales were returned.</strong><p>FlipForge will not substitute candidate or historically linked rows.</p></div>';
    }
    return `<div class="table-wrap"><table data-ff-trusted-evidence-table><thead><tr><th>Source</th><th>Amount</th><th>Sale date</th><th>Identity key</th><th>Current authority</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(item.sourceName || "Saved source")}</strong><small>${escapeHtml(item.type || "Unknown type")}</small></td><td>${money(item.amount)}</td><td>${escapeHtml(item.soldAt || item.recordedAt || "Unavailable")}</td><td>${item.identityMatch === true ? badge("Identity key match", "ok") : badge("Identity key differs", "warn")}</td><td>${badge("Current eligible", "buy")}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function excludedTable(items) {
    if (!items.length) {
      return '<div class="staging-empty"><strong>No linked rows are currently excluded.</strong></div>';
    }
    return `<div class="table-wrap"><table data-ff-excluded-evidence-table><thead><tr><th>Source</th><th>Amount</th><th>Sale date</th><th>Identity key</th><th>Why excluded</th></tr></thead><tbody>${items.map(item => {
      const reason = String(item.rejectionReason || "").trim()
        || "This linked row does not satisfy the current exact-comparable authority rules.";
      return `<tr><td><strong>${escapeHtml(item.sourceName || "Saved source")}</strong><small>${escapeHtml(item.type || "Unknown type")}</small></td><td>${money(item.amount)}</td><td>${escapeHtml(item.soldAt || item.recordedAt || "Unavailable")}</td><td>${item.identityMatch === true ? badge("Identity key match", "neutral") : badge("Identity key differs", "warn")}</td><td><strong>Excluded from value authority</strong><small>${escapeHtml(reason)}</small></td></tr>`;
    }).join("")}</tbody></table></div>`;
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

    if (!Number.isFinite(trustedCount)
        || !Number.isFinite(excludedCount)
        || trusted.length !== trustedCount
        || excluded.length !== excludedCount) {
      page.dataset.ffEvidenceAuthoritySplit = "invalid";
      return;
    }

    const trustedSection = sectionByHeading(page, /^What FlipForge trusted$/i);
    if (!trustedSection) return;
    const trustedCopy = trustedSection.querySelector(".panel-header p");
    const trustedBody = trustedSection.querySelector(".panel-body");
    if (trustedCopy) {
      trustedCopy.textContent = `${trustedCount} current authority-eligible exact completed sale${trustedCount === 1 ? "" : "s"} support this saved decision.`;
    }
    if (trustedBody) trustedBody.innerHTML = trustedTable(trusted);
    trustedSection.dataset.ffTrustedOnly = "true";

    let excludedSection = page.querySelector("[data-ff-excluded-evidence-section]");
    if (!excludedSection) {
      excludedSection = document.createElement("section");
      excludedSection.className = "panel ff-evidence-excluded-section";
      excludedSection.dataset.ffExcludedEvidenceSection = "";
      trustedSection.insertAdjacentElement("afterend", excludedSection);
    }
    excludedSection.innerHTML = `<header class="panel-header"><div><h2>What FlipForge excluded — and why</h2><p>${excludedCount} linked historical row${excludedCount === 1 ? "" : "s"} remain visible for transparency but have no current value authority.</p></div></header><div class="panel-body">${excludedTable(excluded)}</div>`;

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
