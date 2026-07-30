(() => {
  "use strict";

  const core = window.FlipForgePrototypeData;
  const features = window.FlipForgeSaaSFeatureData;
  const main = document.querySelector("#main-content");
  if (!core || !features || !main) return;

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

  function platformCards() {
    const cards = [
      ["Evaluator", "Structured card review", "Identity, ask, evidence, and limitations", "#/evaluate", "◇"],
      ["Smart Opportunity", "Saved decision authority", "BUY, WATCH, VERIFY, or PASS with reasons", "#/opportunities", "↗"],
      ["Trade Analyzer", "Value-balance preview", "Compare both sides without authorizing a trade", "#/compare", "⇄"],
      ["Grading Intelligence", "PSA economics", "Grade lanes, costs, population, and condition gates", "#/psa-advisor", "A+"],
      ["Deal Advisor", "Before-you-buy guidance", "Explain why a saved opportunity deserves attention", `#/opportunities/${encodeURIComponent(core.opportunities[0].id)}`, "◎"],
      ["Portfolio Intelligence", "Collection context", "Allocation, supported value, evidence, and exits", "#/portfolio", "◫"]
    ];

    return cards.map(([title, subtitle, detail, href, icon]) => `
      <a class="cockpit-module-card" href="${href}">
        <span class="cockpit-module-icon" aria-hidden="true">${icon}</span>
        <span><strong>${title}</strong><small>${subtitle}</small><em>${detail}</em></span>
        <span aria-hidden="true">→</span>
      </a>`).join("");
  }

  function allocationDonut() {
    const allocation = features.portfolio.allocation;
    let cursor = 0;
    const colors = ["#d4af37", "#8b928f", "#5d83aa", "#9f7ad0"];
    const stops = allocation.map((item, index) => {
      const start = cursor;
      cursor += item.share;
      return `${colors[index]} ${start}% ${cursor}%`;
    }).join(",");

    return `
      <div class="cockpit-donut-layout">
        <div class="cockpit-donut" style="--donut-stops:${stops}" role="img" aria-label="Portfolio allocation: ${allocation.map(item => `${item.label} ${item.share} percent`).join(", ")}">
          <span><strong>${currency.format(features.portfolio.totalValue)}</strong><small>Prototype value</small></span>
        </div>
        <div class="cockpit-legend">${allocation.map((item, index) => `
          <div><span style="--legend-color:${colors[index]}"></span><strong>${escapeHtml(item.label)}</strong><small>${item.share}% · ${currency.format(item.value)}</small></div>`).join("")}</div>
      </div>`;
  }

  function evidenceStateDistribution() {
    const holdings = features.portfolio.holdings;
    const groups = [
      { label: "Current evidence", match: "Current", color: "#27d17f" },
      { label: "Needs sales", match: "Needs sales", color: "#e2bd42" },
      { label: "Condition review", match: "Condition", color: "#f6a916" },
      { label: "Watch", match: "Watch", color: "#8b928f" }
    ];
    const total = holdings.reduce((sum, item) => sum + item.quantity, 0);

    return `
      <div class="cockpit-unconfigured-note"><strong>Condition distribution is not authoritative yet.</strong> This staging panel shows saved evidence states instead of inventing condition facts.</div>
      <div class="cockpit-distribution">${groups.map(group => {
        const count = holdings.filter(item => item.evidence === group.match).reduce((sum, item) => sum + item.quantity, 0);
        const share = total ? Math.round((count / total) * 100) : 0;
        return `<div class="cockpit-distribution-row"><span>${group.label}</span><span class="cockpit-distribution-track"><span style="--distribution-width:${share}%;--distribution-color:${group.color}"></span></span><strong>${count}</strong></div>`;
      }).join("")}</div>`;
  }

  function opportunityMap() {
    const points = core.opportunities.map(item => ({
      ...item,
      x: Math.max(5, Math.min(95, item.risk)),
      y: Math.max(5, Math.min(95, item.confidence))
    }));

    return `
      <div class="cockpit-map" role="img" aria-label="Opportunity map plotting risk from low to high and confidence from low to high">
        <span class="cockpit-axis cockpit-axis-y">Higher confidence</span>
        <span class="cockpit-axis cockpit-axis-x">Higher risk →</span>
        <span class="cockpit-quadrant q1">Strong support</span><span class="cockpit-quadrant q2">High-upside / high-risk</span><span class="cockpit-quadrant q3">Low priority</span><span class="cockpit-quadrant q4">Verify first</span>
        ${points.map(item => `<a class="cockpit-map-point ${recommendationClass(item.recommendation)}" href="#/opportunities/${encodeURIComponent(item.id)}" style="--map-x:${item.x}%;--map-y:${100 - item.y}%" aria-label="${escapeHtml(item.shortCard)}: ${escapeHtml(item.recommendation)}, confidence ${item.confidence}, risk ${item.risk}"><span>${escapeHtml(item.initials)}</span><small>${escapeHtml(item.recommendation)}</small></a>`).join("")}
      </div>
      <div class="cockpit-map-list">${points.map(item => `<span><strong>${escapeHtml(item.initials)}</strong> ${escapeHtml(item.shortCard)} · ${item.recommendation} · confidence ${item.confidence} · risk ${item.risk}</span>`).join("")}</div>`;
  }

  function tradeAnalyzer() {
    const sideA = core.opportunities.find(item => item.id === "opp-doncic-280") || core.opportunities[1];
    const sideBItems = [core.opportunities[0], core.opportunities[2]].filter(Boolean);
    const sideB = sideBItems.reduce((sum, item) => sum + item.supported, 0);
    const difference = sideA.supported - sideB;

    return `
      <div class="cockpit-trade-grid">
        <div class="cockpit-trade-side"><span>Side A</span><strong>${escapeHtml(sideA.shortCard)}</strong><small>Supported value ${currency.format(sideA.supported)} · confidence ${sideA.confidence}</small></div>
        <div class="cockpit-trade-balance"><span>Value balance</span><strong>${currency.format(Math.abs(difference))}</strong><small>${difference >= 0 ? "Side A higher" : "Side B higher"}</small></div>
        <div class="cockpit-trade-side"><span>Side B</span><strong>${sideBItems.map(item => escapeHtml(item.shortCard)).join(" + ")}</strong><small>Combined supported value ${currency.format(sideB)}</small></div>
      </div>
      <p class="cockpit-boundary-copy">Trade Analyzer is a preview of saved value and confidence context. It cannot accept, send, execute, or authorize a trade.</p>
      <a class="cockpit-inline-link" href="#/compare">Open full comparison →</a>`;
  }

  function gradingPredictor() {
    const scenarios = core.psaAdvisor.scenarios;
    const max = Math.max(...scenarios.map(item => item.net));
    const breakEven = core.psaAdvisor.rawValue + core.psaAdvisor.gradingCost;
    return `
      <div class="cockpit-grade-lanes">${scenarios.map(item => {
        const width = Math.max(12, Math.round((item.net / max) * 100));
        const probability = item.probability == null ? "Current raw lane" : `${item.probability}% model-estimated share`;
        return `<div class="cockpit-grade-lane"><span>${escapeHtml(item.grade)}</span><span class="cockpit-grade-track"><span style="--lane-width:${width}%"></span></span><strong>${currency.format(item.net)}</strong><small>${probability}</small></div>`;
      }).join("")}</div>
      <div class="cockpit-grade-summary"><span><strong>${currency.format(breakEven)}</strong> break-even value after prototype grading cost</span><span><strong>${escapeHtml(core.psaAdvisor.guidance)}</strong> existing PSA guidance</span></div>
      <p class="cockpit-boundary-copy">Population shares and lane values do not predict the grade of the specific raw card.</p>`;
  }

  function marketTrend() {
    const points = features.discover.marketTrend;
    const width = 520;
    const height = 150;
    const padding = 12;
    const values = points.flatMap(item => [item.demand, item.liquidity]);
    const min = Math.min(...values) - 4;
    const max = Math.max(...values) + 4;
    const demand = linePath(points, "demand", width, height, padding, min, max);
    const liquidity = linePath(points, "liquidity", width, height, padding, min, max);
    return `<svg class="cockpit-market-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Prototype market demand and liquidity trend from ${escapeHtml(points[0].date)} to ${escapeHtml(points.at(-1).date)}"><line x1="12" x2="508" y1="40" y2="40"></line><line x1="12" x2="508" y1="80" y2="80"></line><line x1="12" x2="508" y1="120" y2="120"></line><path class="demand" d="${demand}"></path><path class="liquidity" d="${liquidity}"></path></svg><div class="cockpit-market-legend"><span>Demand ${points.at(-1).demand}</span><span>Liquidity ${points.at(-1).liquidity}</span></div>`;
  }

  function topOpportunityCards() {
    return core.opportunities.slice(0, 3).map(item => `
      <a class="cockpit-opportunity-mini" href="#/opportunities/${encodeURIComponent(item.id)}">
        <span class="cockpit-mini-thumb">${escapeHtml(item.initials)}</span>
        <span><strong>${escapeHtml(item.shortCard)}</strong><small>${currency.format(item.ask)} ask · ${currency.format(item.supported)} supported</small></span>
        <span class="cockpit-mini-decision ${recommendationClass(item.recommendation)}">${escapeHtml(item.recommendation)}</span>
      </a>`).join("");
  }

  function cockpitMarkup() {
    const opportunities = core.opportunities;
    const averageLiquidity = Math.round(opportunities.reduce((sum, item) => sum + item.liquidity, 0) / opportunities.length);
    const acceptedEvidence = opportunities.reduce((sum, item) => sum + item.evidence, 0);
    const verifyCount = opportunities.filter(item => ["VERIFY", "WATCH"].includes(item.recommendation)).length;
    const top = opportunities[0];

    return `
      <section class="cockpit-expansion" aria-label="Complete SaaS intelligence cockpit">
        <header class="cockpit-section-heading"><div><span>Full platform cockpit</span><h2>Every major FlipForge intelligence module</h2><p>Staging visuals use existing mock contracts or an honest unconfigured state. No module adds recommendation or transaction authority.</p></div><span class="cockpit-stage-chip">Expanded owner review</span></header>

        <div class="cockpit-module-grid">${platformCards()}</div>

        <div class="cockpit-grid cockpit-grid-two">
          <article class="cockpit-panel"><header><div><h3>Portfolio by sport</h3><p>Prototype collection allocation.</p></div><a href="#/portfolio">Portfolio →</a></header>${allocationDonut()}</article>
          <article class="cockpit-panel"><header><div><h3>Collection evidence state</h3><p>Condition remains unconfigured until authoritative holding data exists.</p></div><span>Honest state</span></header>${evidenceStateDistribution()}</article>
        </div>

        <article class="cockpit-panel cockpit-map-panel"><header><div><h3>Opportunity map</h3><p>Saved opportunities plotted by confidence and risk.</p></div><a href="#/opportunities">All opportunities →</a></header>${opportunityMap()}</article>

        <div class="cockpit-grid cockpit-grid-two">
          <article class="cockpit-panel"><header><div><h3>Trade Analyzer</h3><p>Compare both sides before an outside trade.</p></div><span>Preview only</span></header>${tradeAnalyzer()}</article>
          <article class="cockpit-panel"><header><div><h3>Grading value predictor</h3><p>Existing PSA grade-lane economics.</p></div><a href="#/psa-advisor">PSA Advisor →</a></header>${gradingPredictor()}</article>
        </div>

        <div class="cockpit-action-grid">
          <a class="cockpit-action-card" href="#/evaluate"><span>Quick card evaluation</span><strong>Start with exact identity, ask, and evidence</strong><small>The browser opens the governed evaluation workflow; it does not calculate a recommendation locally.</small></a>
          <a class="cockpit-action-card is-gold" href="#/opportunities/${encodeURIComponent(top.id)}"><span>Deal Advisor</span><strong>${escapeHtml(top.recommendation)} · ${escapeHtml(top.shortCard)}</strong><small>${escapeHtml(top.reasons[0])}</small></a>
        </div>

        <div class="cockpit-grid cockpit-market-grid">
          <article class="cockpit-panel cockpit-market-panel"><header><div><h3>Market intelligence</h3><p>Prototype demand and liquidity movement.</p></div><a href="#/discover">Discover →</a></header><div class="cockpit-market-metrics"><span><strong>${features.discover.listings.length}</strong> active asks</span><span><strong>${averageLiquidity}</strong> average liquidity</span><span><strong>${acceptedEvidence}</strong> accepted evidence rows</span><span><strong>${verifyCount}</strong> review states</span></div>${marketTrend()}</article>
          <article class="cockpit-panel"><header><div><h3>Top opportunities</h3><p>Saved Smart Opportunity output.</p></div><a href="#/opportunities">View all →</a></header><div class="cockpit-opportunity-list">${topOpportunityCards()}</div></article>
        </div>

        <div class="cockpit-grid cockpit-grid-two">
          <article class="cockpit-panel"><header><div><h3>Market activity</h3><p>Recent prototype intelligence events.</p></div><span>Display only</span></header><div class="cockpit-feed">${core.dashboard.activities.map(item => `<div><span aria-hidden="true">${item.icon}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span><time>${escapeHtml(item.time)}</time></div>`).join("")}</div></article>
          <article class="cockpit-panel"><header><div><h3>Recent alerts</h3><p>Saved staging alert events.</p></div><a href="#/alerts">Alerts →</a></header><div class="cockpit-feed">${features.alerts.recent.map(item => `<div><span aria-hidden="true">!</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)} · ${escapeHtml(item.severity)}</small></span><time>${escapeHtml(item.time)}</time></div>`).join("")}</div></article>
        </div>
      </section>`;
  }

  function enhanceDashboard() {
    if (activeRoute() !== "dashboard") return;
    const page = main.querySelector(".page");
    if (!page || page.dataset.cockpitExpanded === "true") return;
    const visualLayer = page.querySelector(".visual-intelligence-layer");
    if (!visualLayer) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = cockpitMarkup();
    visualLayer.after(wrapper.firstElementChild);
    page.dataset.cockpitExpanded = "true";
  }

  const observer = new MutationObserver(() => requestAnimationFrame(enhanceDashboard));
  observer.observe(main, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => requestAnimationFrame(enhanceDashboard));
  window.addEventListener("pageshow", () => requestAnimationFrame(enhanceDashboard));
  requestAnimationFrame(enhanceDashboard);
})();
