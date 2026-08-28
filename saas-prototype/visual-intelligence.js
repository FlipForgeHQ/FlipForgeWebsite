(() => {
  "use strict";

  const data = window.FlipForgePrototypeData;
  const main = document.querySelector("#main-content");
  if (!data || !main) return;

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function activeRoute() {
    return (window.location.hash.replace(/^#\/?/, "").split("/")[0] || "dashboard").split("?")[0];
  }

  function recommendationClass(value) {
    return `status-${String(value || "verify").toLowerCase()}`;
  }

  function linePath(points, key, width, height, padding, min, max) {
    const x = index => padding + index * ((width - padding * 2) / Math.max(1, points.length - 1));
    const y = value => padding + (max - value) * ((height - padding * 2) / Math.max(1, max - min));
    return points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  }

  function valueChart(points) {
    const width = 420;
    const height = 132;
    const padding = 10;
    const values = points.flatMap(point => [Number(point.ask), Number(point.supported)]);
    const min = Math.min(...values) - 8;
    const max = Math.max(...values) + 8;
    const supportedPath = linePath(points, "supported", width, height, padding, min, max);
    const askPath = linePath(points, "ask", width, height, padding, min, max);
    const baseline = height - padding;
    const areaPath = `${supportedPath} L${width - padding},${baseline} L${padding},${baseline} Z`;
    const latest = points.at(-1);
    const first = points[0];

    return `
      <svg class="vi-mini-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Current ask and supported value history from ${escapeHtml(first.date)} through ${escapeHtml(latest.date)}">
        <defs>
          <linearGradient id="viGoldArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#e2bd42" stop-opacity=".28"></stop>
            <stop offset="100%" stop-color="#e2bd42" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <line class="vi-grid-line" x1="10" x2="410" y1="35" y2="35"></line>
        <line class="vi-grid-line" x1="10" x2="410" y1="70" y2="70"></line>
        <line class="vi-grid-line" x1="10" x2="410" y1="105" y2="105"></line>
        <path class="vi-area" d="${areaPath}"></path>
        <path class="vi-ask-line" d="${askPath}"></path>
        <path class="vi-value-line" d="${supportedPath}"></path>
      </svg>
      <div class="vi-chart-summary">
        <span><strong>${currency.format(first.supported)}</strong><br>${escapeHtml(first.date)} supported</span>
        <span><strong>${currency.format(latest.ask)}</strong><br>Current ask</span>
        <span><strong>${currency.format(latest.supported)}</strong><br>Supported value</span>
      </div>`;
  }

  function evidenceRows(opportunity) {
    const readiness = data.dashboard.evidenceReadiness;
    const population = readiness.checks.find(check => check.label === "PSA population");
    const rows = [
      { label: "Exact identity", width: "100%", color: "var(--green)", text: escapeHtml(opportunity.identity) },
      { label: "Completed sales", width: "100%", color: "var(--gold)", text: `${opportunity.evidence} accepted` },
      { label: "Freshness", width: "100%", color: "var(--blue)", text: escapeHtml(opportunity.freshness) },
      { label: "Population", width: "48%", color: "var(--orange)", text: escapeHtml(population?.status || "Display only") }
    ];

    return rows.map(row => `
      <div class="vi-evidence-row">
        <span>${row.label}</span>
        <span class="vi-evidence-track" aria-hidden="true"><span style="--evidence-value:${row.width};--evidence-color:${row.color}"></span></span>
        <strong>${row.text}</strong>
      </div>`).join("");
  }

  function gradingBars() {
    const scenarios = data.psaAdvisor.scenarios;
    const maxNet = Math.max(...scenarios.map(item => Number(item.net) || 0));
    const colors = ["#89928f", "#e2bd42", "#27d17f"];

    return scenarios.map((scenario, index) => {
      const height = Math.max(18, Math.round((Number(scenario.net) / maxNet) * 88));
      const probability = scenario.probability == null ? "Current raw lane" : `${scenario.probability}% model-estimated share`;
      return `
        <div class="vi-grade-column" aria-label="${escapeHtml(scenario.grade)} net value ${currency.format(scenario.net)}; ${escapeHtml(probability)}">
          <strong>${currency.format(scenario.net)}</strong>
          <span class="vi-grade-bar" aria-hidden="true" style="--grade-height:${height}px;--grade-color:${colors[index]}"></span>
          <span>${escapeHtml(scenario.grade)}</span>
        </div>`;
    }).join("");
  }

  function factor(label, value, color) {
    return `
      <div class="vi-factor">
        <div class="vi-factor-top"><span>${label}</span><strong>${value}/100</strong></div>
        <div class="vi-factor-track" aria-hidden="true"><span style="--factor-value:${value};--factor-color:${color}"></span></div>
      </div>`;
  }

  function dashboardVisuals() {
    const opportunity = data.opportunities[0];
    const readiness = data.dashboard.evidenceReadiness.score;
    const latestHistory = data.dashboard.valueHistory.at(-1);
    const decisionText = opportunity.recommendation === "BUY"
      ? "Saved evidence supports attention at the current ask."
      : opportunity.recommendation === "WATCH"
        ? "The saved record is worth monitoring, but the current state is not a buy-ready decision."
        : opportunity.recommendation === "PASS"
          ? "The saved authority does not support proceeding at the current terms."
          : "Important identity, evidence, or condition questions still require verification.";

    return `
      <section class="visual-intelligence-command" aria-label="Visual intelligence summary">
        <article class="vi-card vi-opportunity">
          <div class="vi-card-visual" aria-label="Stylized prototype card slab for ${escapeHtml(opportunity.shortCard)}">
            <div class="vi-slab" aria-hidden="true">
              <div class="vi-slab-label"><span>FlipForge identity view</span><strong>${escapeHtml(opportunity.identity)}</strong></div>
              <div class="vi-card-face"><span class="vi-card-initials">${escapeHtml(opportunity.initials)}</span></div>
            </div>
          </div>
          <div class="vi-opportunity-copy">
            <div class="vi-kicker-row">
              <span class="vi-kicker">Top saved opportunity</span>
              <span class="vi-staging-badge">Staging visualization · Mock contract data</span>
            </div>
            <h2>${escapeHtml(opportunity.card)}</h2>
            <p class="vi-card-meta">${escapeHtml(opportunity.category)} · Updated ${escapeHtml(opportunity.updated)}</p>
            <div class="vi-decision-row">
              <span class="vi-decision ${recommendationClass(opportunity.recommendation)}">${escapeHtml(opportunity.recommendation)}</span>
              <span class="vi-decision-copy"><strong>Smart Opportunity decision</strong><span>${escapeHtml(decisionText)}</span></span>
            </div>
            <div class="vi-value-row">
              <div class="vi-value-block"><span>Current ask</span><strong>${currency.format(opportunity.ask)}</strong><small>Saved listing context</small></div>
              <div class="vi-value-block"><span>Supported value</span><strong>${currency.format(opportunity.supported)}</strong><small>Accepted evidence context</small></div>
              <div class="vi-value-block is-positive"><span>Value gap</span><strong>+${currency.format(opportunity.gap)}</strong><small>+${opportunity.gapPercent.toFixed(1)}% before outside costs</small></div>
            </div>
            <div class="vi-source-row">
              <span><strong>Before you buy. Know Why.</strong> Graphics explain the stored decision; they do not recalculate it.</span>
              <span class="vi-card-actions"><a class="vi-action-link" href="#/opportunities/${encodeURIComponent(opportunity.id)}">View full analysis</a></span>
            </div>
          </div>
        </article>

        <article class="vi-card vi-scoreboard">
          <header class="vi-scoreboard-header">
            <div><h2>Decision confidence</h2><p>Existing factors behind the saved Smart Opportunity result.</p></div>
            <span class="vi-score-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
          </header>
          <div class="vi-primary-gauge">
            <div class="vi-gauge" style="--gauge-value:${opportunity.confidence};--gauge-color:var(--green)" role="img" aria-label="Decision confidence ${opportunity.confidence} out of 100">
              <div class="vi-gauge-copy"><strong>${opportunity.confidence}</strong><span>Confidence</span></div>
            </div>
            <div class="vi-gauge-explanation"><strong>High-confidence saved decision</strong><span>${opportunity.evidence} accepted completed sales, ${escapeHtml(opportunity.identity.toLowerCase())} identity, and ${escapeHtml(opportunity.freshness.toLowerCase())} evidence context.</span></div>
          </div>
          <div class="vi-factor-grid" aria-label="Decision factors">
            ${factor("Liquidity", opportunity.liquidity, "var(--blue)")}
            ${factor("Evidence readiness", readiness, "var(--gold)")}
            ${factor("Opportunity rank", opportunity.rank, "var(--green)")}
            ${factor("Risk", opportunity.risk, "var(--orange)")}
          </div>
        </article>
      </section>

      <section class="vi-insight-grid" aria-label="Market, evidence, and grading visuals">
        <article class="vi-card vi-insight-card">
          <header class="vi-insight-header"><div><h3>Value intelligence</h3><p>Ask versus supported-value movement.</p></div><span class="vi-insight-icon" aria-hidden="true">↗</span></header>
          ${valueChart(data.dashboard.valueHistory)}
        </article>

        <article class="vi-card vi-insight-card">
          <header class="vi-insight-header"><div><h3>Evidence readiness</h3><p>Saved support and unresolved limitations.</p></div><span class="vi-insight-icon" aria-hidden="true">◎</span></header>
          <div class="vi-evidence-bars">${evidenceRows(opportunity)}</div>
          <p class="vi-evidence-note">Readiness is ${readiness}%. Population context remains display-only and cannot become sold evidence or a raw-card grade prediction.</p>
        </article>

        <article class="vi-card vi-insight-card">
          <header class="vi-insight-header"><div><h3>Grading economics</h3><p>Existing PSA lane values for the saved raw-card scenario.</p></div><span class="vi-insight-icon" aria-hidden="true">A+</span></header>
          <div class="vi-grade-bars">${gradingBars()}</div>
          <p class="vi-evidence-note">Raw ${currency.format(data.psaAdvisor.rawValue)} · Prototype grading cost ${currency.format(data.psaAdvisor.gradingCost)}. Grade shares are model-estimated context, not a promise for the specific card.</p>
        </article>
      </section>

      <div class="vi-authority-strip">
        <strong>Authority preserved</strong>
        <span>Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. Existing PSA intelligence remains the sole grading-guidance authority. The browser only visualizes saved results.</span>
        <a href="#/evidence">Review evidence →</a>
      </div>`;
  }

  function enhanceDashboard() {
    if (activeRoute() !== "dashboard") return;
    const page = main.querySelector(".page");
    if (!page || page.dataset.visualIntelligenceEnhanced === "true") return;

    const metricGrid = page.querySelector(".metric-grid");
    const heading = page.querySelector(".page-heading");
    if (!metricGrid && !heading) return;

    const wrapper = document.createElement("div");
    wrapper.className = "visual-intelligence-layer";
    wrapper.innerHTML = dashboardVisuals();
    (metricGrid || heading.nextElementSibling || page.firstElementChild)?.before(wrapper);
    page.dataset.visualIntelligenceEnhanced = "true";
  }

  const observer = new MutationObserver(() => requestAnimationFrame(enhanceDashboard));
  observer.observe(main, { childList: true });
  window.addEventListener("hashchange", () => requestAnimationFrame(enhanceDashboard));
  window.addEventListener("pageshow", () => requestAnimationFrame(enhanceDashboard));
  requestAnimationFrame(enhanceDashboard);
})();