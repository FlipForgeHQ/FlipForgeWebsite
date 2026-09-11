(() => {
  "use strict";

  if (window.FlipForgeDecisionIntelligenceUxV2) return;
  window.FlipForgeDecisionIntelligenceUxV2 = true;

  const CONTRACT_VERSION = "1.0";
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
  const routeName = () => String(window.location.hash || "#/dashboard")
    .replace(/^#\/?/, "")
    .split(/[/?]/)[0] || "dashboard";

  const state = {
    queued: false,
    loading: false,
    activeId: "",
    detail: null,
    evidence: null,
    meta: null,
    requestSerial: 0
  };

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

  function correlationId() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `decision-intelligence-v2-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(safeNumber(value));
  }

  function selectedOpportunityId() {
    const select = document.querySelector("#ff-di-primary");
    const value = String(select?.value || "").trim();
    return SAFE_ID.test(value) ? value : "";
  }

  function isServerSurface() {
    return document.querySelector(".ff-di-page")?.dataset.decisionIntelligenceSource === "server";
  }

  async function request(path) {
    const requestCorrelationId = correlationId();
    const response = await fetch(path, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "X-Correlation-Id": requestCorrelationId
      }
    });
    const payload = await response.json();
    const meta = payload?.meta;
    if (!response.ok
        || !meta
        || meta.contractVersion !== CONTRACT_VERSION
        || meta.authority !== "Smart Opportunity"
        || meta.gradingAuthority !== "Existing PSA intelligence"
        || meta.correlationId !== requestCorrelationId
        || !Object.prototype.hasOwnProperty.call(payload, "data")) {
      throw new Error("Decision Intelligence v2 authority contract failed.");
    }
    return payload;
  }

  function normalizeReason(reason) {
    const raw = String(reason || "").trim();
    const text = raw.toLowerCase();
    if (!raw) return "Other current evidence exclusion";
    if (/wrong parallel|parallel|variation|refractor|silver prizm|checker|autograph|auto/.test(text)) return "Wrong parallel / variation";
    if (/wrong grade|grade mismatch/.test(text)) return "Wrong grade";
    if (/wrong grader|grader mismatch/.test(text)) return "Wrong grader";
    if (/wrong card number|card number/.test(text)) return "Wrong card number";
    if (/wrong player|wrong subject|player|subject/.test(text)) return "Wrong player / subject";
    if (/wrong year/.test(text)) return "Wrong year";
    if (/wrong product|wrong set|product|set mismatch/.test(text)) return "Wrong product / set";
    if (/active listing|not completed sale|not sold/.test(text)) return "Not a completed sale";
    if (/low match confidence/.test(text)) return "Low match confidence";
    if (/partner ready|partner-ready/.test(text)) return "Evidence not partner-ready";
    if (/missing sale date/.test(text)) return "Missing sale date";
    if (/invalid source url|invalid source/.test(text)) return "Invalid source";
    if (/current exact-comparable authority rules|identity not exact/.test(text)) return "Fails current exact-comparable rules";
    return raw.length > 76 ? `${raw.slice(0, 73)}…` : raw;
  }

  function reasonBreakdown(evidence) {
    const linked = Array.isArray(evidence?.linkedEvidence) ? evidence.linkedEvidence : [];
    const counts = new Map();
    for (const item of linked) {
      if (item?.authorityEligible === true) continue;
      const label = normalizeReason(item?.rejectionReason);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function riskLabel(score) {
    const value = safeNumber(score);
    if (value >= 70) return "High";
    if (value >= 35) return "Moderate";
    return "Low";
  }

  function evidenceGateMarkup(detail, evidence) {
    const accepted = Math.max(0, safeNumber(evidence?.acceptedExactCompletedSales));
    const excluded = Math.max(0, safeNumber(evidence?.visibleButAuthorityIneligible));
    const mapping = String(detail?.mappingState || "UNKNOWN").toUpperCase();
    const supported = safeNumber(detail?.supportedValue);
    const gates = [
      ["Exact identity", mapping === "CONFIRMED" ? "Verified" : "Needs review", mapping === "CONFIRMED" ? "good" : "warn"],
      ["Trusted completed sales", accepted > 0 ? `${accepted} accepted` : "None accepted", accepted > 0 ? "good" : "warn"],
      ["Value authority", accepted > 0 && supported > 0 ? "Available" : "Withheld", accepted > 0 && supported > 0 ? "good" : "warn"],
      ["Excluded evidence", excluded > 0 ? `${excluded} visible` : "None", excluded > 0 ? "context" : "good"]
    ];
    return `<div class="ff-di-v2-gates">${gates.map(([label, value, tone]) => `
      <div class="ff-di-v2-gate" data-tone="${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;
  }

  function whyStoppedCopy(detail, evidence) {
    const decision = String(detail?.recommendation || "UNKNOWN").toUpperCase();
    const accepted = Math.max(0, safeNumber(evidence?.acceptedExactCompletedSales));
    const supported = safeNumber(detail?.supportedValue);
    const breakdown = reasonBreakdown(evidence);
    const topReason = breakdown[0];

    if (decision === "VERIFY" && accepted === 0) {
      if (topReason) return `No completed sale currently satisfies the exact-card evidence standard. The largest exclusion group is ${topReason[0].toLowerCase()} (${topReason[1]} row${topReason[1] === 1 ? "" : "s"}).`;
      return "No completed sale currently satisfies the exact-card evidence standard, so FlipForge withholds supported value instead of manufacturing certainty.";
    }
    if (supported <= 0 || accepted === 0) {
      return "FlipForge does not currently have enough authority-eligible exact completed-sale evidence to support a value.";
    }
    if (decision === "PASS") return "The exact evidence supports a value, but the evaluated price/risk relationship does not justify the purchase.";
    if (decision === "WATCH") return "The evidence is usable, but the current price or risk profile is not strong enough for BUY.";
    if (decision === "BUY") return "The saved exact evidence, supported value and risk profile cleared the current decision gates at the evaluated price.";
    return "FlipForge preserved the saved recommendation and exposes the evidence conditions that support it.";
  }

  function whatChangesCopy(detail, evidence) {
    const decision = String(detail?.recommendation || "UNKNOWN").toUpperCase();
    const accepted = Math.max(0, safeNumber(evidence?.acceptedExactCompletedSales));
    const changeSummary = String(detail?.changeSummary || "").trim();
    if (changeSummary) return changeSummary;
    if (decision === "VERIFY" && accepted === 0) {
      return "A completed sale for the exact card, grade and parallel that passes current FlipForge evidence checks.";
    }
    if (decision === "PASS") return "A materially lower all-in cost, stronger exact-sale support, or lower risk would justify reevaluation.";
    if (decision === "WATCH") return "A better price or stronger exact evidence could move this opportunity into a more actionable state.";
    if (decision === "BUY") return "A material change in price, evidence quality, seller/listing facts, liquidity or risk should trigger a fresh evaluation.";
    return "Any material change in price, exact evidence, identity or risk should trigger a fresh evaluation.";
  }

  function reasonListMarkup(evidence) {
    const breakdown = reasonBreakdown(evidence);
    if (!breakdown.length) {
      return `<div class="ff-di-v2-reason-empty"><strong>No current exclusions to explain.</strong><span>All linked rows shown here are currently authority-eligible or no excluded rows are linked.</span></div>`;
    }
    return `<div class="ff-di-v2-reasons">${breakdown.map(([label, count]) => `
      <div><span>${escapeHtml(label)}</span><strong>${count}</strong></div>`).join("")}</div>`;
  }

  function receiptMarkup(detail, evidence, meta) {
    const accepted = Math.max(0, safeNumber(evidence?.acceptedExactCompletedSales));
    const excluded = Math.max(0, safeNumber(evidence?.visibleButAuthorityIneligible));
    const supported = safeNumber(detail?.supportedValue);
    return `<details class="ff-di-v2-receipt">
      <summary><span><strong>Decision Receipt</strong><small>Server-owned record of what FlipForge knew and returned</small></span><span aria-hidden="true">＋</span></summary>
      <div class="ff-di-v2-receipt-grid">
        <div><span>Decision</span><strong>${escapeHtml(detail?.recommendation || "UNKNOWN")}</strong></div>
        <div><span>Exact card</span><strong>${escapeHtml(detail?.cardIdentity || "Unavailable")}</strong></div>
        <div><span>Evaluated ask</span><strong>${money(detail?.ask)}</strong></div>
        <div><span>Supported value</span><strong>${accepted > 0 && supported > 0 ? money(supported) : "Withheld"}</strong></div>
        <div><span>Confidence</span><strong>${safeNumber(detail?.confidence)}/100</strong></div>
        <div><span>Risk</span><strong>${safeNumber(detail?.risk)}/100 · ${riskLabel(detail?.risk)}</strong></div>
        <div><span>Trusted exact sales</span><strong>${accepted}</strong></div>
        <div><span>Excluded linked rows</span><strong>${excluded}</strong></div>
        <div><span>Observed</span><strong>${escapeHtml(detail?.observedAt || "Unavailable")}</strong></div>
        <div><span>Engine</span><strong>${escapeHtml(meta?.engineVersion || "Server-owned")}</strong></div>
      </div>
      <p>No browser-side recommendation, value calculation, grade prediction or evidence acceptance was performed.</p>
    </details>`;
  }

  function renderServerV2() {
    if (routeName() !== "decision-intelligence" || !isServerSurface()) return;
    const root = document.querySelector(".ff-di-page");
    const controls = root?.querySelector(".ff-di-controls");
    if (!root || !controls || !state.detail || !state.evidence) return;

    const detail = state.detail?.data?.opportunity;
    const evidence = state.evidence?.data;
    if (!detail || !evidence) return;

    root.dataset.ffDecisionIntelligenceUx = "v2";
    const heroTitle = root.querySelector(".ff-di-hero-copy h1");
    const heroCopy = root.querySelector(".ff-di-hero-copy p");
    if (heroTitle) heroTitle.textContent = "Know why before you buy.";
    if (heroCopy) heroCopy.textContent = "FlipForge shows what it trusted, what it rejected, why value was allowed or withheld, and what would need to change before the decision changes.";

    let command = root.querySelector("[data-ff-di-v2-command]");
    if (!command) {
      command = document.createElement("section");
      command.className = "ff-di-v2-command";
      command.dataset.ffDiV2Command = "";
      controls.insertAdjacentElement("afterend", command);
    }

    const accepted = Math.max(0, safeNumber(evidence.acceptedExactCompletedSales));
    const excluded = Math.max(0, safeNumber(evidence.visibleButAuthorityIneligible));
    const supported = safeNumber(detail.supportedValue);
    const supportedLabel = accepted > 0 && supported > 0 ? money(supported) : "WITHHELD";
    const decision = String(detail.recommendation || "UNKNOWN").toUpperCase();

    command.innerHTML = `
      <article class="ff-di-v2-verdict" data-decision="${escapeHtml(decision)}">
        <div class="ff-di-v2-verdict-main">
          <span class="ff-di-v2-kicker">CURRENT DECISION</span>
          <strong class="ff-di-v2-decision">${escapeHtml(decision)}</strong>
          <h2>${escapeHtml(detail.cardIdentity || "Saved opportunity")}</h2>
          <p>${escapeHtml(whyStoppedCopy(detail, evidence))}</p>
        </div>
        <div class="ff-di-v2-verdict-metrics">
          <div><span>Supported value</span><strong>${escapeHtml(supportedLabel)}</strong></div>
          <div><span>Confidence</span><strong>${safeNumber(detail.confidence)}/100</strong></div>
          <div><span>Risk</span><strong>${riskLabel(detail.risk)} · ${safeNumber(detail.risk)}/100</strong></div>
        </div>
      </article>

      <div class="ff-di-v2-intelligence-grid">
        <article class="ff-di-v2-integrity">
          <header><div><span class="ff-di-v2-kicker">EVIDENCE INTEGRITY</span><h3>What FlipForge trusted — and rejected</h3></div><strong>${accepted} trusted · ${excluded} excluded</strong></header>
          ${evidenceGateMarkup(detail, evidence)}
          ${reasonListMarkup(evidence)}
          <a class="ff-di-v2-evidence-link" href="#/evidence/${encodeURIComponent(state.activeId)}">Open full evidence trail →</a>
        </article>

        <article class="ff-di-v2-change">
          <span class="ff-di-v2-kicker">WHAT CHANGES THIS DECISION?</span>
          <h3>${escapeHtml(whatChangesCopy(detail, evidence))}</h3>
          <p>FlipForge will not loosen the evidence standard just to produce a value. New exact evidence or materially different price/risk inputs require a fresh evaluation.</p>
          ${receiptMarkup(detail, evidence, state.meta)}
        </article>
      </div>`;
  }

  function renderPrototypeV2() {
    if (routeName() !== "decision-intelligence" || isServerSurface()) return;
    const root = document.querySelector(".ff-di-page[data-decision-intelligence-source="prototype"]");
    const controls = root?.querySelector(".ff-di-controls");
    if (!root || !controls) return;
    root.dataset.ffDecisionIntelligenceUx = "v2";
    const heroTitle = root.querySelector(".ff-di-hero-copy h1");
    const heroCopy = root.querySelector(".ff-di-hero-copy p");
    if (heroTitle) heroTitle.textContent = "Know why before you buy.";
    if (heroCopy) heroCopy.textContent = "Preview mode demonstrates the Decision Intelligence layout only. Production uses server-owned evidence and recommendations.";
    if (root.querySelector("[data-ff-di-v2-command]")) return;
    const command = document.createElement("section");
    command.className = "ff-di-v2-command ff-di-v2-preview";
    command.dataset.ffDiV2Command = "";
    command.innerHTML = `<article class="ff-di-v2-verdict"><div class="ff-di-v2-verdict-main"><span class="ff-di-v2-kicker">DECISION INTELLIGENCE UX V2</span><strong class="ff-di-v2-decision">PREVIEW</strong><h2>Evidence integrity becomes the product story.</h2><p>Production will show what FlipForge trusted, what it excluded, why value was available or withheld, and what would need to change before the decision changes.</p></div></article>`;
    controls.insertAdjacentElement("afterend", command);
  }

  async function loadForSelection(id) {
    if (!id || state.loading || id === state.activeId) return;
    const serial = ++state.requestSerial;
    state.loading = true;
    state.activeId = id;
    try {
      const encoded = encodeURIComponent(id);
      const [detail, evidence] = await Promise.all([
        request(`/api/v1/opportunities/${encoded}`),
        request(`/api/v1/evidence/${encoded}`)
      ]);
      if (serial !== state.requestSerial || selectedOpportunityId() !== id) return;
      state.detail = detail;
      state.evidence = evidence;
      state.meta = detail.meta;
      renderServerV2();
    } catch (_) {
      if (serial === state.requestSerial) {
        state.detail = null;
        state.evidence = null;
      }
    } finally {
      if (serial === state.requestSerial) state.loading = false;
    }
  }

  function sync() {
    state.queued = false;
    if (routeName() !== "decision-intelligence") return;
    if (!isServerSurface()) {
      state.activeId = "";
      state.detail = null;
      state.evidence = null;
      renderPrototypeV2();
      return;
    }
    const id = selectedOpportunityId();
    if (!id) return;
    if (id === state.activeId && state.detail && state.evidence) {
      renderServerV2();
      return;
    }
    void loadForSelection(id);
  }

  function queue() {
    if (state.queued) return;
    state.queued = true;
    window.requestAnimationFrame(sync);
  }

  window.addEventListener("hashchange", () => {
    state.activeId = "";
    state.detail = null;
    state.evidence = null;
    window.setTimeout(queue, 30);
  });
  window.addEventListener("pageshow", queue);
  window.addEventListener("load", queue);
  document.addEventListener("change", event => {
    if (event.target?.id === "ff-di-primary") {
      state.activeId = "";
      state.detail = null;
      state.evidence = null;
      window.setTimeout(queue, 30);
    }
  });
  const main = document.getElementById("main-content");
  if (main) new MutationObserver(queue).observe(main, { childList: true, subtree: true });
  queue();
})();
