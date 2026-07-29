(() => {
  "use strict";

  const data = window.FlipForgePrototypeData;
  const main = document.querySelector("#main-content");
  const shell = document.querySelector(".app-shell");
  const navToggle = document.querySelector("[data-nav-toggle]");
  const navCloseTargets = document.querySelectorAll("[data-nav-close]");
  const navLinks = [...document.querySelectorAll("[data-route]")];
  const searchForm = document.querySelector("#global-search-form");
  const searchInput = document.querySelector("#global-search");
  const toastRegion = document.querySelector(".toast-region");

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

  const number = new Intl.NumberFormat("en-US");

  const toneMap = {
    blue: { color: "var(--blue)", glow: "rgba(97,168,255,.2)" },
    green: { color: "var(--green)", glow: "rgba(39,209,127,.18)" },
    purple: { color: "var(--purple)", glow: "rgba(168,131,255,.18)" },
    orange: { color: "var(--orange)", glow: "rgba(246,169,22,.18)" }
  };

  function routeParts() {
    const raw = window.location.hash.replace(/^#\/?/, "") || "dashboard";
    return raw.split("/").filter(Boolean);
  }

  function activeRoute() {
    const [route] = routeParts();
    return route || "dashboard";
  }

  function opportunityById(id) {
    return data.opportunities.find(item => item.id === id) || data.opportunities[0];
  }

  function formatCurrency(value) {
    return currency.format(Number(value) || 0);
  }

  function formatPercent(value) {
    const safe = Number(value) || 0;
    return `${safe.toFixed(1)}%`;
  }

  function recommendationClass(value) {
    return `status-${String(value).toLowerCase()}`;
  }

  function recommendationPill(value) {
    return `<span class="status-pill ${recommendationClass(value)}">${value}</span>`;
  }

  function boundaryNote(extra = "") {
    return `<div class="boundary-note"><strong>Authority boundary:</strong> Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. Existing PSA intelligence remains the sole grading-guidance authority. ${extra}</div>`;
  }

  function pageHeading(eyebrow, title, description, actions = "") {
    return `
      <header class="page-heading">
        <div>
          <span class="eyebrow">${eyebrow}</span>
          <h1>${title}</h1>
          <p>${description}</p>
        </div>
        ${actions ? `<div class="page-actions">${actions}</div>` : ""}
      </header>`;
  }

  function panel(title, description, body, action = "") {
    return `
      <section class="panel">
        <header class="panel-header">
          <div><h2>${title}</h2>${description ? `<p>${description}</p>` : ""}</div>
          ${action}
        </header>
        <div class="panel-body">${body}</div>
      </section>`;
  }

  function signalRows(opportunity) {
    const signals = [
      ["Confidence", opportunity.confidence, "var(--green)"],
      ["Liquidity", opportunity.liquidity, "var(--blue)"],
      ["Risk", opportunity.risk, "var(--orange)"],
      ["Rank", opportunity.rank, "var(--gold)"]
    ];
    return `<div class="signal-list">${signals.map(([label, value, color]) => `
      <div class="signal-row">
        <span class="signal-label">${label}</span>
        <span class="signal-track"><span style="width:${value}%;background:${color}"></span></span>
        <span class="signal-value">${value}/100</span>
      </div>`).join("")}</div>`;
  }

  function renderMetrics() {
    return `<section class="metric-grid" aria-label="Dashboard metrics">${data.dashboard.metrics.map(metric => {
      const tone = toneMap[metric.tone] || toneMap.blue;
      return `
        <article class="metric-card" style="--metric-color:${tone.color};--metric-glow:${tone.glow}">
          <div class="metric-top"><span>${metric.label}</span><span class="metric-icon">${metric.icon}</span></div>
          <div class="metric-value">${metric.value}</div>
          <div class="metric-note ${metric.tone === "green" ? "positive" : metric.tone === "orange" ? "warning" : ""}">↗ ${metric.note}</div>
        </article>`;
    }).join("")}</section>`;
  }

  function renderValueChart() {
    const points = data.dashboard.valueHistory;
    const width = 760;
    const height = 220;
    const left = 42;
    const right = 18;
    const top = 16;
    const bottom = 28;
    const values = points.flatMap(point => [point.ask, point.supported]);
    const min = Math.floor((Math.min(...values) - 20) / 20) * 20;
    const max = Math.ceil((Math.max(...values) + 20) / 20) * 20;
    const x = index => left + index * ((width - left - right) / (points.length - 1));
    const y = value => top + (max - value) * ((height - top - bottom) / (max - min));
    const path = key => points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
    const gridValues = [min, min + (max - min) / 2, max];

    return `
      <div class="chart-shell" data-value-chart>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-swatch" style="background:var(--blue)"></span>Current ask</span>
          <span class="legend-item"><span class="legend-swatch" style="background:var(--green)"></span>Supported value</span>
          <span class="legend-item">Hover points for prototype values</span>
        </div>
        <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Ask versus supported value over eight prototype days">
          <defs>
            <linearGradient id="valueArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#27d17f" stop-opacity=".2"/>
              <stop offset="100%" stop-color="#27d17f" stop-opacity="0"/>
            </linearGradient>
          </defs>
          ${gridValues.map(value => `<line class="grid" x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}"></line><text class="chart-axis" x="2" y="${y(value)+3}">$${Math.round(value)}</text>`).join("")}
          <path class="area" d="${path("supported")} L${x(points.length - 1)},${height-bottom} L${x(0)},${height-bottom} Z"></path>
          <path class="ask-line" d="${path("ask")}"></path>
          <path class="value-line" d="${path("supported")}"></path>
          ${points.map((point, index) => `
            <g class="chart-point" tabindex="0" data-index="${index}" aria-label="${point.date}: ask ${formatCurrency(point.ask)}, supported value ${formatCurrency(point.supported)}">
              <circle class="dot" cx="${x(index)}" cy="${y(point.ask)}" r="5" fill="var(--blue)"></circle>
              <circle class="dot" cx="${x(index)}" cy="${y(point.supported)}" r="5" fill="var(--green)"></circle>
            </g>`).join("")}
          ${points.map((point, index) => `<text class="chart-axis" x="${x(index)}" y="${height-7}" text-anchor="middle">${point.date.replace("Jul ", "")}</text>`).join("")}
        </svg>
        <div class="chart-tooltip" role="tooltip"></div>
      </div>`;
  }

  function opportunityRows(limit = data.opportunities.length) {
    return data.opportunities.slice(0, limit).map(item => `
      <tr data-opportunity-id="${item.id}" tabindex="0" aria-label="Open ${item.shortCard}">
        <td><div class="card-cell"><span class="card-thumb">${item.initials}</span><span><strong>${item.shortCard}</strong><small>${item.category}</small></span></div></td>
        <td>${recommendationPill(item.recommendation)}</td>
        <td>${formatCurrency(item.ask)}</td>
        <td>${formatCurrency(item.supported)}</td>
        <td><span class="value-positive">+${formatCurrency(item.gap)}</span><br><small>${formatPercent(item.gapPercent)}</small></td>
        <td><span class="score">${item.confidence}</span>/100</td>
        <td>${item.evidence}</td>
        <td>${item.updated}</td>
      </tr>`).join("");
  }

  function readinessPanel() {
    const readiness = data.dashboard.evidenceReadiness;
    return `
      <div style="position:relative">
        <div class="readiness-ring" style="--progress:${readiness.score}%"></div>
        <div class="readiness-ring-copy" style="left:50%;top:42px;transform:translateX(-50%)"><strong>${readiness.score}%</strong><span>ready</span></div>
      </div>
      <div class="check-list">${readiness.checks.map(check => `
        <div class="check-item">
          <span class="check-mark ${check.ok ? "ok" : "warn"}">${check.ok ? "✓" : "!"}</span>
          <span><strong>${check.label}</strong><small>${check.detail}</small></span>
          <span>${check.status}</span>
        </div>`).join("")}</div>`;
  }

  function renderDashboard() {
    main.innerHTML = `<div class="page">
      ${pageHeading("Customer intelligence workspace", "Good evening, Todd", "See what deserves attention, why the evidence supports it, and what still needs verification before you act.", `<a class="button button-secondary" href="#/compare">Compare cards</a><a class="button button-primary" href="#/evaluate">Evaluate a card</a>`)}
      ${renderMetrics()}
      <div class="dashboard-grid">
        <div class="stack">
          ${panel("Ask vs supported value", "Interactive prototype history for the selected opportunity.", renderValueChart(), `<a class="panel-link" href="#/opportunities/${data.opportunities[0].id}">View opportunity →</a>`)}
          ${panel("Top opportunities", "Existing recommendations ranked with saved evidence context.", `<div class="table-wrap"><table><thead><tr><th>Card</th><th>Decision</th><th>Ask</th><th>Supported</th><th>Gap</th><th>Confidence</th><th>Evidence</th><th>Updated</th></tr></thead><tbody>${opportunityRows(4)}</tbody></table></div>`, `<a class="panel-link" href="#/opportunities">View all →</a>`)}
        </div>
        <div class="stack">
          ${panel("Evidence readiness", "How complete and current the saved decision support is.", readinessPanel(), `<a class="panel-link" href="#/evidence">Open evidence →</a>`)}
          ${panel("Decision factors", "Existing scores for the selected opportunity.", signalRows(data.opportunities[0]))}
          ${panel("Recent activity", "Prototype customer activity, not live telemetry.", `<div class="activity-list">${data.dashboard.activities.map(activity => `
            <div class="activity-item"><span class="activity-icon">${activity.icon}</span><span><strong>${activity.title}</strong><small>${activity.detail}</small></span><span class="activity-time">${activity.time}</span></div>`).join("")}</div>`)}
        </div>
      </div>
      ${boundaryNote("The dashboard visualizes saved, already-governed mock records and cannot change a decision.")}
    </div>`;
    bindValueChart();
    bindOpportunityRows();
  }

  function renderOpportunities() {
    main.innerHTML = `<div class="page">
      ${pageHeading("Saved opportunity authority", "Opportunities", "Review existing FlipForge decisions, value gaps, confidence and evidence status. Filters change the view, not the recommendation.", `<button class="button button-secondary" type="button" data-toast="Filters are a prototype view only.">Filters</button><a class="button button-primary" href="#/evaluate">Evaluate a card</a>`)}
      ${panel("Opportunity ranking", "Prototype list of saved Smart Opportunity output.", `<div class="table-wrap"><table><thead><tr><th>Card</th><th>Decision</th><th>Ask</th><th>Supported</th><th>Gap</th><th>Confidence</th><th>Evidence</th><th>Updated</th></tr></thead><tbody>${opportunityRows()}</tbody></table></div>`)}
      ${boundaryNote("Sorting, searching and filtering this table never recalculate the authoritative recommendation.")}
    </div>`;
    bindOpportunityRows();
  }

  function renderOpportunityDetail(id) {
    const item = opportunityById(id);
    main.innerHTML = `<div class="page">
      ${pageHeading("Opportunity detail", item.player, "Understand the existing decision, supporting factors and unresolved risk before taking an outside action.", `<a class="button button-secondary" href="#/compare?left=${item.id}">Compare</a><button class="button button-primary" type="button" data-toast="Saved to the prototype watchlist.">Track card</button>`)}
      <div class="detail-grid">
        <div class="stack">
          <section class="panel hero-card">
            <div class="hero-top">
              <div class="hero-identity"><div class="large-card-thumb">${item.initials}</div><div class="hero-title">${recommendationPill(item.recommendation)}<h1>${item.shortCard}</h1><p>${item.card}<br>${item.category}</p></div></div>
              <div class="hero-price"><span>Current ask</span><strong>${formatCurrency(item.ask)}</strong><span>Prototype saved record</span></div>
            </div>
            <div class="key-value-grid">
              <div class="key-value"><span>Supported value</span><strong class="value-positive">${formatCurrency(item.supported)}</strong></div>
              <div class="key-value"><span>Value gap</span><strong>+${formatCurrency(item.gap)} · ${formatPercent(item.gapPercent)}</strong></div>
              <div class="key-value"><span>Confidence</span><strong>${item.confidence}/100</strong></div>
              <div class="key-value"><span>Evidence</span><strong>${item.evidence} accepted</strong></div>
            </div>
          </section>
          ${panel("Why FlipForge says this", "Plain-language explanation of saved authority output.", `<div class="explanation-grid">
            <article class="explanation-card"><h3><span style="color:var(--green)">■</span> Evidence signals</h3><ul>${item.reasons.map(reason => `<li>${reason}</li>`).join("")}</ul></article>
            <article class="explanation-card"><h3><span style="color:var(--blue)">■</span> Demand and liquidity</h3><ul><li>Liquidity score: ${item.liquidity}/100.</li><li>Collector recognition supports resale visibility.</li><li>Upside matters less when the card is difficult to exit.</li></ul></article>
            <article class="explanation-card"><h3><span style="color:var(--orange)">■</span> Risk factors</h3><ul>${item.risks.map(risk => `<li>${risk}</li>`).join("")}</ul></article>
          </div>`)}
          ${panel("Ask vs supported value", "The chart explains the saved gap and does not calculate a new decision.", renderValueChart())}
        </div>
        <div class="stack">
          ${panel("Decision factors", "Existing scores from the authoritative record.", signalRows(item))}
          ${panel("Evidence status", "What is available and what remains unresolved.", `<div class="check-list">
            <div class="check-item"><span class="check-mark ${item.identity === "Confirmed" ? "ok" : "warn"}">${item.identity === "Confirmed" ? "✓" : "!"}</span><span><strong>Exact identity</strong><small>Year, set, number, parallel and grade</small></span><span>${item.identity}</span></div>
            <div class="check-item"><span class="check-mark ${item.evidence > 0 ? "ok" : "warn"}">${item.evidence > 0 ? "✓" : "!"}</span><span><strong>Completed sales</strong><small>Accepted exact evidence only</small></span><span>${item.evidence}</span></div>
            <div class="check-item"><span class="check-mark ${item.freshness === "Current" ? "ok" : "warn"}">${item.freshness === "Current" ? "✓" : "!"}</span><span><strong>Freshness</strong><small>Authority path requires current evidence</small></span><span>${item.freshness}</span></div>
          </div>`, `<a class="panel-link" href="#/evidence">Review evidence →</a>`)}
          ${panel("Next best action", "Customer guidance, not transaction authorization.", `<p style="color:var(--text-soft);font-size:11px;line-height:1.65">${item.recommendation === "BUY" ? "Confirm the exact listing, seller, fees and condition before acting outside FlipForge." : "Keep this in Watch or Verify until the missing evidence and identity checks are resolved."}</p><button class="button button-secondary" type="button" data-toast="A follow-up alert was added to the prototype.">Create follow-up alert</button>`)}
        </div>
      </div>
      ${boundaryNote("No bidding, checkout, purchase, evidence acceptance or recommendation recalculation is available in this prototype.")}
    </div>`;
    bindValueChart();
  }

  function parseQuery() {
    const hash = window.location.hash;
    const queryIndex = hash.indexOf("?");
    return new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : "");
  }

  function renderCompare() {
    const params = parseQuery();
    const initialLeft = params.get("left") || data.opportunities[0].id;
    const initialRight = params.get("right") || data.opportunities[1].id;
    main.innerHTML = `<div class="page">
      ${pageHeading("Decision support", "Direct comparison", "Compare saved opportunities side by side without creating a separate recommendation engine.", `<button class="button button-secondary" type="button" data-toast="Prototype comparison saved locally for this session.">Save comparison</button>`)}
      ${panel("Choose two saved opportunities", "The selectors read existing governed records.", `<div class="compare-selectors">
        <div class="field"><label for="compare-left">Card A</label><select id="compare-left">${opportunityOptions(initialLeft)}</select></div>
        <button class="swap-button" type="button" id="swap-comparison" aria-label="Swap comparison cards">⇄</button>
        <div class="field"><label for="compare-right">Card B</label><select id="compare-right">${opportunityOptions(initialRight)}</select></div>
      </div>`)}
      <div id="comparison-results" class="stack" style="margin-top:15px"></div>
      ${boundaryNote("Comparison highlights differences in existing records. It does not declare a new winner or override either saved decision.")}
    </div>`;
    const left = document.querySelector("#compare-left");
    const right = document.querySelector("#compare-right");
    const render = () => renderComparisonResults(left.value, right.value);
    left.addEventListener("change", render);
    right.addEventListener("change", render);
    document.querySelector("#swap-comparison").addEventListener("click", () => {
      const temp = left.value;
      left.value = right.value;
      right.value = temp;
      render();
    });
    render();
  }

  function opportunityOptions(selectedId) {
    return data.opportunities.map(item => `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${item.shortCard}</option>`).join("");
  }

  function renderComparisonResults(leftId, rightId) {
    const left = opportunityById(leftId);
    const right = opportunityById(rightId);
    const rows = [
      ["Decision", recommendationPill(left.recommendation), recommendationPill(right.recommendation)],
      ["Current ask", formatCurrency(left.ask), formatCurrency(right.ask)],
      ["Supported value", formatCurrency(left.supported), formatCurrency(right.supported)],
      ["Value gap", `+${formatCurrency(left.gap)} · ${formatPercent(left.gapPercent)}`, `+${formatCurrency(right.gap)} · ${formatPercent(right.gapPercent)}`],
      ["Confidence", `${left.confidence}/100`, `${right.confidence}/100`],
      ["Liquidity", `${left.liquidity}/100`, `${right.liquidity}/100`],
      ["Risk", `${left.risk}/100`, `${right.risk}/100`],
      ["Accepted evidence", String(left.evidence), String(right.evidence)],
      ["Identity", left.identity, right.identity]
    ];
    const maxAsk = Math.max(left.ask, right.ask, 1);
    const maxSupported = Math.max(left.supported, right.supported, 1);
    const results = document.querySelector("#comparison-results");
    results.innerHTML = `
      <div class="detail-grid">
        ${panel("Visual comparison", "Bars are normalized within this two-card view.", `<div class="signal-list">
          ${comparisonBars("Ask", left.ask/maxAsk*100, right.ask/maxAsk*100, formatCurrency(left.ask), formatCurrency(right.ask))}
          ${comparisonBars("Supported", left.supported/maxSupported*100, right.supported/maxSupported*100, formatCurrency(left.supported), formatCurrency(right.supported))}
          ${comparisonBars("Confidence", left.confidence, right.confidence, `${left.confidence}`, `${right.confidence}`)}
          ${comparisonBars("Liquidity", left.liquidity, right.liquidity, `${left.liquidity}`, `${right.liquidity}`)}
          ${comparisonBars("Risk", left.risk, right.risk, `${left.risk}`, `${right.risk}`)}
        </div>`)}
        ${panel("Comparison context", "Both decisions remain independent and authoritative.", `<div class="check-list">
          <div class="check-item"><span class="check-mark ok">A</span><span><strong>${left.shortCard}</strong><small>${left.category}</small></span><span>${left.recommendation}</span></div>
          <div class="check-item"><span class="check-mark warn">B</span><span><strong>${right.shortCard}</strong><small>${right.category}</small></span><span>${right.recommendation}</span></div>
        </div>`)}
      </div>
      ${panel("Side-by-side details", "Use the evidence and risk differences to decide what to investigate next.", `<div class="comparison-table">
        <div class="comparison-row"><span class="comparison-label">Metric</span><strong>${left.shortCard}</strong><strong>${right.shortCard}</strong></div>
        ${rows.map(([label, a, b]) => `<div class="comparison-row"><span class="comparison-label">${label}</span><strong>${a}</strong><strong>${b}</strong></div>`).join("")}
      </div>`)}
    `;
  }

  function comparisonBars(label, aWidth, bWidth, aText, bText) {
    return `<div class="signal-row" style="grid-template-columns:86px 1fr 110px">
      <span class="signal-label">${label}</span>
      <span style="display:grid;gap:5px"><span class="signal-track"><span style="width:${Math.max(3,aWidth)}%;background:var(--blue)"></span></span><span class="signal-track"><span style="width:${Math.max(3,bWidth)}%;background:var(--gold)"></span></span></span>
      <span class="signal-value" style="min-width:100px">A ${aText}<br>B ${bText}</span>
    </div>`;
  }

  function renderPsaAdvisor() {
    const psa = data.psaAdvisor;
    const maxPopulation = Math.max(...psa.population.map(item => item.count));
    main.innerHTML = `<div class="page">
      ${pageHeading("Existing grading guidance authority", "PSA Advisor", "Model the economics around a saved raw-card scenario while keeping condition inspection and final grading decisions outside the browser.", `<button class="button button-primary" type="button" data-toast="A manual-condition checklist was added to the prototype.">Start condition review</button>`)}
      <div class="detail-grid">
        <div class="stack">
          <section class="panel hero-card">
            <div class="hero-top"><div class="hero-identity"><div class="large-card-thumb">VW</div><div class="hero-title"><span class="status-pill status-verify">${psa.guidance}</span><h1>${psa.title}</h1><p>Guidance authority: ${psa.authority}<br>Prototype confidence: ${psa.confidence}/100</p></div></div><div class="hero-price"><span>Raw supported value</span><strong>${formatCurrency(psa.rawValue)}</strong><span>Prototype grading cost: ${formatCurrency(psa.gradingCost)}</span></div></div>
          </section>
          ${panel("Grade economics", "Outcome scenarios explain value spread; they do not predict a raw card's grade.", `<div class="grade-grid">${psa.scenarios.map(scenario => `
            <article class="grade-card ${scenario.grade === "PSA 9" ? "recommended" : ""}"><span>${scenario.grade}${scenario.probability !== null ? ` · ${scenario.probability}% prototype share` : ""}</span><strong>${formatCurrency(scenario.value)}</strong><small>Net after prototype grading cost: ${formatCurrency(scenario.net)}<br>${scenario.note}</small></article>`).join("")}</div>`)}
          ${panel("PSA population distribution", "Saved exact-card population context. Population does not predict condition or grade.", `<div class="population-bars">${psa.population.map(item => `
            <div class="population-row"><span>${item.grade}</span><span class="population-bar"><span style="width:${item.count/maxPopulation*100}%"></span></span><strong>${number.format(item.count)}</strong></div>`).join("")}</div>`)}
        </div>
        <div class="stack">
          ${panel("Condition gates", "Every physical-condition input requires manual review.", `<div class="check-list">${psa.checks.map(check => `
            <div class="check-item"><span class="check-mark ${check.ok ? "ok" : "warn"}">${check.ok ? "✓" : "!"}</span><span><strong>${check.label}</strong><small>${check.status}</small></span><span>${check.ok ? "Available" : "Required"}</span></div>`).join("")}</div>`)}
          ${panel("Expected-value boundary", "What this prototype can and cannot say.", `<p style="color:var(--text-soft);font-size:11px;line-height:1.65">A higher PSA 10 value does not mean the card should be graded. Review condition, service cost, turnaround, downside and likely outcome distribution together.</p><div class="boundary-note" style="margin-top:0"><strong>Never inferred:</strong> raw-card grade, guaranteed gem rate, or automatic grading submission.</div>`)}
        </div>
      </div>
      ${boundaryNote("Existing PSA intelligence remains the sole grading-guidance authority; this page only visualizes its saved scenario output.")}
    </div>`;
  }

  function renderEvidence() {
    const evidence = data.evidence;
    main.innerHTML = `<div class="page">
      ${pageHeading("Evidence provenance", "Evidence readiness", "See whether exact identity, completed sales, freshness and population context are strong enough to support the saved decision.", `<button class="button button-secondary" type="button" data-toast="Export is disabled in this non-production prototype.">Export evidence</button>`)}
      <div class="dashboard-grid">
        <div class="stack">
          ${panel("Accepted completed sales", "Only saved accepted completed-sale evidence is shown.", `<div class="table-wrap"><table><thead><tr><th>Marketplace</th><th>Price</th><th>Sale date</th><th>Identity match</th><th>State</th></tr></thead><tbody>${evidence.acceptedSales.map(sale => `<tr><td>${sale.marketplace}</td><td>${formatCurrency(sale.price)}</td><td>${sale.date}</td><td>${sale.match}</td><td><span class="status-pill status-buy">${sale.state}</span></td></tr>`).join("")}</tbody></table></div>`)}
          ${panel("Evidence chain", "Read-only provenance for the prototype decision package.", `<div class="evidence-timeline">${evidence.timeline.map(step => `
            <div class="evidence-step"><span class="step-dot ${step.ok ? "" : "warn"}">${step.ok ? "✓" : "!"}</span><span><strong>${step.title}</strong><small>${step.detail}</small></span><time>${step.time}</time></div>`).join("")}</div>`)}
        </div>
        <div class="stack">
          ${panel("Readiness score", "Completeness and freshness, not a probability of profit.", `<div style="position:relative"><div class="readiness-ring" style="--progress:${evidence.readiness}%"></div><div class="readiness-ring-copy" style="left:50%;top:42px;transform:translateX(-50%)"><strong>${evidence.readiness}%</strong><span>ready</span></div></div>${signalRows(data.opportunities[0])}`)}
          ${panel("Authority exclusions", "Controls intentionally absent from the customer browser.", `<div class="check-list">
            <div class="check-item"><span class="check-mark ok">✓</span><span><strong>No evidence acceptance</strong><small>ACCEPT, REJECT and HOLD remain outside the SaaS customer UI.</small></span></div>
            <div class="check-item"><span class="check-mark ok">✓</span><span><strong>No provider credentials</strong><small>Keys and provider administration remain server-side.</small></span></div>
            <div class="check-item"><span class="check-mark ok">✓</span><span><strong>No recommendation calculation</strong><small>The page reads existing authority output only.</small></span></div>
          </div>`)}
        </div>
      </div>
      ${boundaryNote("Active listings and fixed-price asks never become completed-sale evidence.")}
    </div>`;
  }

  function renderEvaluate() {
    main.innerHTML = `<div class="page">
      ${pageHeading("Guided intake", "Evaluate a card", "The production SaaS will submit a normalized card identity to the existing FlipForge backend. This prototype does not call an API.")}
      ${panel("Prototype evaluation intake", "Fields demonstrate the future customer flow without calculating a decision in JavaScript.", `<form id="evaluation-form" class="stack">
        <div class="key-value-grid">
          <div class="field"><label for="player">Player</label><select id="player"><option>Shohei Ohtani</option><option>Patrick Mahomes II</option><option>Victor Wembanyama</option></select></div>
          <div class="field"><label for="year-set">Year and set</label><select id="year-set"><option>2018 Topps Chrome</option><option>2017 Panini Prizm</option><option>2023 Panini Prizm</option></select></div>
          <div class="field"><label for="grade">Grade</label><select id="grade"><option>PSA 10</option><option>PSA 9</option><option>Raw / ungraded</option></select></div>
          <div class="field"><label for="ask-price">Asking price</label><select id="ask-price"><option>$525</option><option>$8,000</option><option>$410</option></select></div>
        </div>
        <div><button class="button button-primary" type="submit">Preview existing sample response</button></div>
      </form>`)}
      ${boundaryNote("The production browser will never calculate BUY/WATCH/VERIFY/PASS locally. It will request an evaluated response from the authoritative backend.")}
    </div>`;
    document.querySelector("#evaluation-form").addEventListener("submit", event => {
      event.preventDefault();
      showToast("Prototype only: opening an existing saved opportunity instead of calculating a new recommendation.");
      setTimeout(() => { window.location.hash = `#/opportunities/${data.opportunities[0].id}`; }, 450);
    });
  }

  function renderDiscover() {
    renderPlaceholder("Market discovery", "Discover", "Search and filter active listings for discovery while keeping them separate from completed-sale evidence.", "⌕", "Discovery results will connect to approved server APIs after the backend boundary is accepted.");
  }

  function renderPlaceholder(eyebrow, title, description, icon, body) {
    main.innerHTML = `<div class="page">
      ${pageHeading(eyebrow, title, description)}
      ${panel(`${title} foundation`, "The responsive route is established; production data wiring is intentionally deferred.", `<div class="empty-state"><div class="empty-state-icon">${icon}</div><h2>${title} is part of the SaaS route map</h2><p>${body}</p><a class="button button-primary" href="#/dashboard">Return to dashboard</a></div>`)}
      ${boundaryNote("This route is a non-production prototype and contains no customer account, provider credential or transaction authority.")}
    </div>`;
  }

  function bindValueChart() {
    document.querySelectorAll("[data-value-chart]").forEach(chart => {
      const tooltip = chart.querySelector(".chart-tooltip");
      const points = [...chart.querySelectorAll(".chart-point")];
      const show = point => {
        const index = Number(point.dataset.index);
        const item = data.dashboard.valueHistory[index];
        const circle = point.querySelector("circle");
        const svgRect = chart.querySelector("svg").getBoundingClientRect();
        const chartRect = chart.getBoundingClientRect();
        const x = circle.getBoundingClientRect().left - chartRect.left + 5;
        const y = circle.getBoundingClientRect().top - chartRect.top;
        tooltip.innerHTML = `<strong>${item.date}</strong>Ask ${formatCurrency(item.ask)}<br>Supported ${formatCurrency(item.supported)}`;
        tooltip.style.left = `${Math.min(Math.max(x, 70), chartRect.width - 70)}px`;
        tooltip.style.top = `${Math.max(y, 50)}px`;
        tooltip.classList.add("visible");
      };
      points.forEach(point => {
        point.addEventListener("mouseenter", () => show(point));
        point.addEventListener("focus", () => show(point));
        point.addEventListener("mouseleave", () => tooltip.classList.remove("visible"));
        point.addEventListener("blur", () => tooltip.classList.remove("visible"));
      });
    });
  }

  function bindOpportunityRows() {
    document.querySelectorAll("[data-opportunity-id]").forEach(row => {
      const open = () => { window.location.hash = `#/opportunities/${row.dataset.opportunityId}`; };
      row.addEventListener("click", open);
      row.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }

  function bindGenericActions() {
    document.querySelectorAll("[data-toast]").forEach(button => {
      button.addEventListener("click", () => showToast(button.dataset.toast));
    });
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3800);
  }

  function setActiveNavigation() {
    const route = activeRoute();
    navLinks.forEach(link => {
      if (link.dataset.route === route) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function closeNavigation() {
    shell.dataset.navOpen = "false";
    navToggle.setAttribute("aria-expanded", "false");
  }

  function renderRoute() {
    const [route, id] = routeParts();
    setActiveNavigation();
    closeNavigation();

    switch (route) {
      case "dashboard": renderDashboard(); break;
      case "discover": renderDiscover(); break;
      case "evaluate": renderEvaluate(); break;
      case "opportunities": id ? renderOpportunityDetail(id) : renderOpportunities(); break;
      case "compare": renderCompare(); break;
      case "psa-advisor": renderPsaAdvisor(); break;
      case "evidence": renderEvidence(); break;
      case "portfolio": renderPlaceholder("Collection intelligence", "Portfolio", "Track allocation, supported value and evidence quality across a customer collection.", "◫", "Portfolio allocation and performance visuals will use server-authoritative holdings and value records."); break;
      case "sell": renderPlaceholder("Exit planning", "Sell", "Review exit readiness, evidence and expected transaction costs without authorizing a listing or sale.", "$", "Selling workflows will remain advisory until a separate transaction boundary is explicitly approved."); break;
      case "alerts": renderPlaceholder("Attention queue", "Alerts", "Surface saved changes in price, evidence, population and opportunity status.", "!", "Production alerts will be generated server-side from approved conditions and customer preferences."); break;
      case "account": renderPlaceholder("Customer boundary", "Account", "Manage profile, plan, entitlements and security without exposing provider credentials.", "TH", "Authentication, billing and entitlement enforcement are intentionally not implemented in this prototype."); break;
      default: renderDashboard();
    }

    bindGenericActions();
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  navToggle.addEventListener("click", () => {
    const next = shell.dataset.navOpen !== "true";
    shell.dataset.navOpen = String(next);
    navToggle.setAttribute("aria-expanded", String(next));
  });

  navCloseTargets.forEach(target => target.addEventListener("click", closeNavigation));

  searchForm.addEventListener("submit", event => {
    event.preventDefault();
    const term = searchInput.value.trim().toLowerCase();
    if (!term) {
      showToast("Enter a player, card, set or listing to search the prototype.");
      return;
    }
    const match = data.opportunities.find(item => `${item.card} ${item.player} ${item.category}`.toLowerCase().includes(term));
    if (match) {
      window.location.hash = `#/opportunities/${match.id}`;
      searchInput.value = "";
    } else {
      showToast("No matching prototype record. Live discovery is not connected.");
    }
  });

  document.querySelector(".date-button").addEventListener("click", () => showToast("Date filtering is display-only in the prototype."));

  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
    }
    if (event.key === "Escape") closeNavigation();
  });

  window.addEventListener("hashchange", renderRoute);
  renderRoute();
})();
