(() => {
  "use strict";

  const data = window.FlipForgePrototypeData;
  const main = document.querySelector("#main-content");
  if (!data || !main || !Array.isArray(data.opportunities)) return;

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
  const number = new Intl.NumberFormat("en-US");

  const state = {
    primaryId: data.psaAdvisor?.cardId || data.opportunities[0]?.id || "",
    compareId: data.opportunities.find(item => item.id !== (data.psaAdvisor?.cardId || data.opportunities[0]?.id))?.id || ""
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function route() {
    return (window.location.hash.replace(/^#\/?/, "").split("/")[0] || "dashboard").split("?")[0];
  }

  function money(value) {
    return currency.format(Number(value) || 0);
  }

  function rowById(id) {
    return data.opportunities.find(item => item.id === id) || data.opportunities[0];
  }

  function optionMarkup(selectedId) {
    return data.opportunities.map(item => `<option value="${escapeHtml(item.id)}"${item.id === selectedId ? " selected" : ""}>${escapeHtml(item.shortCard)} · ${escapeHtml(item.recommendation)}</option>`).join("");
  }

  function pct(value, max) {
    const safeMax = Math.max(1, Number(max) || 1);
    return Math.max(0, Math.min(100, (Number(value) || 0) / safeMax * 100));
  }

  function valueVisual(row) {
    const max = Math.max(1, Number(row.ask) || 0, Number(row.supported) || 0);
    const gap = Number(row.supported || 0) - Number(row.ask || 0);
    const gapPercent = Number(row.supported || 0) > 0 ? gap / Number(row.supported) * 100 : 0;
    return `
      <div class="ff-di-value-bars" aria-label="Ask and supported value visualization">
        <div class="ff-di-bar-row"><span>Current ask</span><div class="ff-di-track"><span style="--ff-width:${pct(row.ask, max)}%;--ff-color:var(--ff-ui-blue)"></span></div><strong>${money(row.ask)}</strong></div>
        <div class="ff-di-bar-row"><span>Supported value</span><div class="ff-di-track"><span style="--ff-width:${pct(row.supported, max)}%;--ff-color:var(--ff-ui-green)"></span></div><strong>${money(row.supported)}</strong></div>
      </div>
      <div class="ff-di-gap"><span>Saved value gap · before outside costs</span><strong>${gap >= 0 ? "+" : ""}${money(gap)} · ${gapPercent.toFixed(1)}%</strong></div>`;
  }

  function factorVisual(row) {
    const factors = [
      ["Confidence", row.confidence, "var(--ff-ui-green)"],
      ["Liquidity", row.liquidity, "var(--ff-ui-blue)"],
      ["Risk", row.risk, "var(--ff-ui-orange)"],
      ["Opportunity rank", row.rank, "var(--ff-ui-gold)"]
    ];
    return `<div class="ff-di-factor-list">${factors.map(([label, value, color]) => `
      <div class="ff-di-factor">
        <div class="ff-di-factor-head"><span>${escapeHtml(label)}</span><strong>${Number(value) || 0}/100</strong></div>
        <div class="ff-di-track"><span style="--ff-width:${Math.max(0, Math.min(100, Number(value) || 0))}%;--ff-color:${color}"></span></div>
      </div>`).join("")}</div>`;
  }

  function evidenceVisual(row) {
    const exact = String(row.identity || "").toLowerCase() === "confirmed";
    const accepted = Math.max(0, Number(row.evidence) || 0);
    const fresh = String(row.freshness || "").toLowerCase().includes("current");
    const populationAttached = data.psaAdvisor && row.id === data.psaAdvisor.cardId && Array.isArray(data.psaAdvisor.population);
    const items = [
      {
        label: "Exact identity",
        status: exact ? "Confirmed" : "Needs verification",
        detail: exact ? "Saved identity is aligned for this opportunity." : "The saved record does not yet carry a confirmed exact identity.",
        state: exact ? "good" : "warn"
      },
      {
        label: "Accepted completed sales",
        status: accepted ? `${accepted} accepted` : "None accepted",
        detail: accepted ? "Saved completed-sale evidence is attached to the governed record." : "No accepted completed-sale evidence is attached to this saved opportunity.",
        state: accepted ? "good" : "warn"
      },
      {
        label: "Evidence freshness",
        status: escapeHtml(row.freshness || "Unknown"),
        detail: fresh ? "Saved evidence is marked current." : "Freshness remains a reason to slow down or verify.",
        state: fresh ? "good" : "warn"
      },
      {
        label: "Population context",
        status: populationAttached ? "Saved snapshot available" : "Not attached",
        detail: populationAttached ? "Population is display-only context and never becomes sold evidence or a grade prediction." : "No saved population snapshot is attached to this selected opportunity.",
        state: "context"
      }
    ];
    return `<div class="ff-di-evidence-list">${items.map(item => `
      <div class="ff-di-evidence-item" data-state="${item.state}">
        <div class="ff-di-evidence-head"><span>${escapeHtml(item.label)}</span><strong>${item.status}</strong></div>
        <small>${escapeHtml(item.detail)}</small>
      </div>`).join("")}</div>`;
  }

  function populationVisual(row) {
    const advisor = data.psaAdvisor;
    if (!advisor || row.id !== advisor.cardId || !Array.isArray(advisor.population) || !advisor.population.length) {
      return `<div class="ff-di-empty">No saved PSA population snapshot is attached to this opportunity.<br>FlipForge leaves the visual empty instead of borrowing population from another card.</div>`;
    }
    const max = Math.max(...advisor.population.map(item => Number(item.count) || 0), 1);
    return `<div class="ff-di-pop-grid" aria-label="Saved PSA population distribution">${advisor.population.map(item => `
      <div class="ff-di-pop-column">
        <strong>${number.format(Number(item.count) || 0)}</strong>
        <span class="ff-di-pop-bar" style="--ff-height:${Math.max(12, pct(item.count, max))}%"></span>
        <span>${escapeHtml(item.grade)}</span>
      </div>`).join("")}</div>`;
  }

  function compareSide(row) {
    const gap = Number(row.supported || 0) - Number(row.ask || 0);
    return `<article class="ff-di-compare-side">
      <header><h3>${escapeHtml(row.shortCard)}</h3><span class="ff-di-decision">${escapeHtml(row.recommendation)}</span></header>
      <div class="ff-di-compare-metrics">
        <div><span>Ask</span><strong>${money(row.ask)}</strong></div>
        <div><span>Supported</span><strong>${money(row.supported)}</strong></div>
        <div><span>Value gap</span><strong>${gap >= 0 ? "+" : ""}${money(gap)}</strong></div>
        <div><span>Confidence</span><strong>${Number(row.confidence) || 0}/100</strong></div>
        <div><span>Liquidity</span><strong>${Number(row.liquidity) || 0}/100</strong></div>
        <div><span>Risk</span><strong>${Number(row.risk) || 0}/100</strong></div>
        <div><span>Evidence</span><strong>${Number(row.evidence) || 0}</strong></div>
        <div><span>Identity</span><strong>${escapeHtml(row.identity || "Unknown")}</strong></div>
      </div>
    </article>`;
  }

  function render() {
    if (route() !== "decision-intelligence") return;

    const primary = rowById(state.primaryId);
    if (!primary) return;
    state.primaryId = primary.id;

    let comparison = rowById(state.compareId);
    if (!comparison || comparison.id === primary.id) {
      comparison = data.opportunities.find(item => item.id !== primary.id) || primary;
      state.compareId = comparison.id;
    }

    const gap = Number(primary.supported || 0) - Number(primary.ask || 0);

    main.innerHTML = `<div class="page ff-di-page">
      <section class="ff-di-hero">
        <div class="ff-di-hero-copy">
          <span class="eyebrow">Decision Intelligence</span>
          <h1>See the evidence behind the decision.</h1>
          <p>FlipForge brings the strongest visual intelligence from the Java reference workstation into the customer experience—without moving recommendation, evidence, or grading authority into the browser.</p>
        </div>
        <aside class="ff-di-hero-state" aria-label="Selected saved opportunity summary">
          <div class="ff-di-state-top"><span>Selected saved opportunity</span><strong>${escapeHtml(primary.recommendation)}</strong></div>
          <div class="ff-di-state-value"><div><span>Ask</span><strong>${money(primary.ask)}</strong></div><span class="ff-di-state-arrow" aria-hidden="true">→</span><div><span>Supported</span><strong>${money(primary.supported)}</strong></div></div>
          <div class="ff-di-state-meta"><span>${escapeHtml(primary.identity)} identity</span><span>${Number(primary.evidence) || 0} accepted sales</span><span>${gap >= 0 ? "+" : ""}${money(gap)} gap</span></div>
        </aside>
      </section>

      <section class="ff-di-controls" aria-label="Decision Intelligence selectors">
        <div class="ff-di-control"><label for="ff-di-primary">Primary opportunity</label><select id="ff-di-primary">${optionMarkup(primary.id)}</select></div>
        <div class="ff-di-control"><label for="ff-di-compare">Compare with</label><select id="ff-di-compare">${optionMarkup(comparison.id)}</select></div>
      </section>

      <section class="ff-di-grid" aria-label="Saved decision visualizations">
        <article class="ff-di-card ff-di-card-value"><span class="ff-di-mini-label">01 · VALUE</span><h2>Ask vs Supported Value</h2><p>Visualizes the saved price relationship. It does not recalculate supported value.</p>${valueVisual(primary)}</article>
        <article class="ff-di-card ff-di-card-factors"><span class="ff-di-mini-label">02 · FACTORS</span><h2>Decision Factors</h2><p>Shows the existing confidence, liquidity, risk and rank scores behind the saved record.</p>${factorVisual(primary)}</article>
        <article class="ff-di-card ff-di-card-evidence"><span class="ff-di-mini-label">03 · EVIDENCE</span><h2>Evidence Readiness</h2><p>Shows what is confirmed, what is missing and what remains context-only.</p>${evidenceVisual(primary)}</article>
        <article class="ff-di-card ff-di-card-population"><span class="ff-di-mini-label">04 · POPULATION</span><h2>PSA Population Context</h2><p>Displays only a saved exact-card population snapshot when one is attached. Population never becomes sold evidence or a grade prediction.</p>${populationVisual(primary)}</article>
        <article class="ff-di-card ff-di-card-compare"><span class="ff-di-mini-label">05 · COMPARE</span><h2>Direct Comparison</h2><p>Places two saved opportunities side by side without creating a second ranking or recommendation engine.</p><div class="ff-di-compare-grid">${compareSide(primary)}${compareSide(comparison)}</div></article>
      </section>

      <div class="ff-di-authority"><strong>Authority preserved</strong><span>Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. Existing PSA intelligence remains the sole grading-guidance authority. This page visualizes saved, already-governed prototype records only; it performs no provider call, evidence acceptance, grade prediction, recommendation recalculation, transaction, bid, checkout or purchase action.</span></div>
    </div>`;

    document.querySelectorAll("[data-route]").forEach(link => {
      if (link.dataset.route === "decision-intelligence") link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    const primarySelector = document.querySelector("#ff-di-primary");
    const compareSelector = document.querySelector("#ff-di-compare");
    primarySelector?.addEventListener("change", () => {
      state.primaryId = primarySelector.value;
      if (state.compareId === state.primaryId) {
        state.compareId = data.opportunities.find(item => item.id !== state.primaryId)?.id || state.primaryId;
      }
      render();
    });
    compareSelector?.addEventListener("change", () => {
      state.compareId = compareSelector.value;
      if (state.compareId === state.primaryId) {
        state.compareId = data.opportunities.find(item => item.id !== state.primaryId)?.id || state.primaryId;
      }
      render();
    });

    main.focus({ preventScroll: true });
  }

  window.addEventListener("hashchange", () => window.requestAnimationFrame(render));
  window.addEventListener("pageshow", () => window.requestAnimationFrame(render));
  window.requestAnimationFrame(render);
})();
