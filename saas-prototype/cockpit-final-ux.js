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

  function activeRoute() {
    return (window.location.hash.replace(/^#\/?/, "").split("/")[0] || "dashboard").split("?")[0];
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function panelByHeading(root, heading) {
    return [...root.querySelectorAll(".cockpit-panel")].find(panel =>
      panel.querySelector("h3")?.textContent.trim() === heading
    );
  }

  function replaceLeafText(root, from, to) {
    root.querySelectorAll("span, small, p, strong").forEach(node => {
      if (node.children.length === 0 && node.textContent.trim() === from) node.textContent = to;
    });
  }

  function cleanPreviewCopy(page, cockpit) {
    const replacements = [
      ["Staging owner review", "Owner preview"],
      ["Expanded owner review", "Owner preview"],
      ["5 displayed in staging", "5 currently displayed"],
      ["Demand / liquidity prototype index", "Demand / liquidity index"],
      ["Prototype collection allocation.", "Collection allocation."],
      ["Prototype demand and liquidity movement.", "Demand and liquidity movement."],
      ["Recent prototype intelligence events.", "Recent intelligence events."],
      ["Saved staging alert events.", "Recent saved alert events."],
      ["Staging visualization · Mock contract data", "Preview data"],
      ["Prototype grading cost $55.", "Estimated grading cost $55."]
    ];

    replacements.forEach(([from, to]) => replaceLeafText(page, from, to));

    const prototypeChip = document.querySelector(".prototype-chip");
    if (prototypeChip) prototypeChip.textContent = "SAAS PREVIEW";

    const planEyebrow = document.querySelector(".plan-card .eyebrow");
    if (planEyebrow) planEyebrow.textContent = "Preview plan";

    const accountName = document.querySelector(".account-link strong");
    if (accountName) accountName.textContent = "Owner account";

    const profileMode = document.querySelector(".profile-copy small");
    if (profileMode) profileMode.textContent = "Preview";

    const gradingPanel = panelByHeading(cockpit, "Grading value predictor");
    if (gradingPanel) {
      const title = gradingPanel.querySelector("h3");
      const description = gradingPanel.querySelector("header p");
      if (title) title.textContent = "Grading value scenarios";
      if (description) description.textContent = "Net value by saved PSA outcome lane.";
    }

    const opportunityPanel = panelByHeading(cockpit, "Opportunity map");
    if (opportunityPanel) {
      const title = opportunityPanel.querySelector("h3");
      if (title) title.textContent = "Opportunity confidence map";
    }
  }

  function resetNavigationTop() {
    const targets = [
      document.querySelector(".sidebar"),
      document.querySelector(".primary-nav")
    ].filter(Boolean);

    let attempts = 0;
    const reset = () => {
      targets.forEach(target => {
        target.style.scrollBehavior = "auto";
        target.scrollTop = 0;
        target.scrollLeft = 0;
        if (typeof target.scrollTo === "function") target.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
      attempts += 1;
    };

    reset();
    requestAnimationFrame(reset);
    const interval = window.setInterval(() => {
      reset();
      if (attempts >= 20) window.clearInterval(interval);
    }, 60);
  }

  function collapseSelectedAnalysis(page) {
    const heading = page.querySelector(":scope > .cockpit-deep-analysis-heading");
    const visualLayer = page.querySelector(":scope > .visual-intelligence-layer");
    if (!heading || !visualLayer || visualLayer.closest(".cockpit-analysis-details")) return;

    const opportunity = core.opportunities[0];
    const details = document.createElement("details");
    details.className = "cockpit-analysis-details";
    details.innerHTML = `
      <summary>
        <span class="cockpit-analysis-summary-copy">
          <small>Selected opportunity analysis</small>
          <strong>${escapeHtml(opportunity.shortCard)}</strong>
          <em>${escapeHtml(opportunity.recommendation)} · ${currency.format(opportunity.ask)} ask · ${currency.format(opportunity.supported)} supported · +${currency.format(opportunity.gap)} gap</em>
        </span>
        <span class="cockpit-analysis-summary-action">Open analysis <span aria-hidden="true">⌄</span></span>
      </summary>`;

    heading.replaceWith(details);
    details.append(visualLayer);
  }

  function enhanceMarketChart(cockpit) {
    const panel = panelByHeading(cockpit, "Market intelligence");
    const svg = panel?.querySelector(".cockpit-market-chart");
    if (!panel || !svg || panel.dataset.finalChartEnhanced === "true") return;

    const points = features.discover.marketTrend;
    const width = 520;
    const height = 150;
    const padding = 12;
    const values = points.flatMap(item => [Number(item.demand), Number(item.liquidity)]);
    const min = Math.min(...values) - 4;
    const max = Math.max(...values) + 4;
    const x = index => padding + index * ((width - padding * 2) / Math.max(1, points.length - 1));
    const y = value => padding + (max - value) * ((height - padding * 2) / Math.max(1, max - min));
    const namespace = "http://www.w3.org/2000/svg";

    [
      { key: "demand", className: "demand-dot" },
      { key: "liquidity", className: "liquidity-dot" }
    ].forEach(series => {
      points.forEach((point, index) => {
        const circle = document.createElementNS(namespace, "circle");
        circle.setAttribute("class", series.className);
        circle.setAttribute("cx", x(index).toFixed(1));
        circle.setAttribute("cy", y(Number(point[series.key])).toFixed(1));
        circle.setAttribute("r", "3");
        svg.append(circle);
      });
    });

    const labels = document.createElement("div");
    labels.className = "cockpit-market-axis-labels";
    const middle = points[Math.floor((points.length - 1) / 2)];
    labels.innerHTML = `<span>${escapeHtml(points[0].date)}</span><span>${escapeHtml(middle.date)}</span><span>${escapeHtml(points.at(-1).date)}</span>`;
    svg.after(labels);

    const legend = panel.querySelector(".cockpit-market-legend");
    if (legend) legend.setAttribute("aria-label", "Demand and liquidity legend");
    panel.dataset.finalChartEnhanced = "true";
  }

  function enhanceOpportunityMap(cockpit) {
    const panel = panelByHeading(cockpit, "Opportunity confidence map") || panelByHeading(cockpit, "Opportunity map");
    const map = panel?.querySelector(".cockpit-map");
    if (!panel || !map || panel.querySelector(".cockpit-map-legend")) return;

    const legend = document.createElement("div");
    legend.className = "cockpit-map-legend";
    legend.setAttribute("aria-label", "Opportunity recommendation legend");
    legend.innerHTML = `
      <span><i class="status-buy" aria-hidden="true"></i>BUY</span>
      <span><i class="status-watch" aria-hidden="true"></i>WATCH</span>
      <span><i class="status-verify" aria-hidden="true"></i>VERIFY</span>
      <span><i class="status-pass" aria-hidden="true"></i>PASS</span>
      <em>Higher confidence ↑ · Higher risk →</em>`;
    map.after(legend);
  }

  function enhanceGradingContext(cockpit) {
    const panel = panelByHeading(cockpit, "Grading value scenarios") || panelByHeading(cockpit, "Grading value predictor");
    if (!panel || panel.dataset.finalGradingEnhanced === "true") return;

    const rawNet = Number(core.psaAdvisor.scenarios.find(item => item.grade === "Raw")?.net || core.psaAdvisor.rawValue || 0);
    panel.querySelectorAll(".cockpit-grade-lane").forEach((lane, index) => {
      const scenario = core.psaAdvisor.scenarios[index];
      if (!scenario) return;
      const delta = Number(scenario.net) - rawNet;
      const deltaNode = document.createElement("em");
      deltaNode.className = "cockpit-grade-delta";
      deltaNode.textContent = delta === 0 ? "Raw baseline" : `${delta > 0 ? "+" : "−"}${currency.format(Math.abs(delta))} vs raw`;
      lane.append(deltaNode);
    });

    const note = document.createElement("p");
    note.className = "cockpit-grading-method-note";
    note.textContent = "Probability labels and net-value lanes are shown separately. No full expected value is claimed because lower-grade outcomes are not modeled in this preview.";
    panel.append(note);
    panel.dataset.finalGradingEnhanced = "true";
  }

  function applyFinalUx() {
    if (activeRoute() !== "dashboard") return;

    const page = main.querySelector(".page.dashboard-cockpit-primary.cockpit-polished");
    const cockpit = page?.querySelector(":scope > .cockpit-expansion");
    if (!page || !cockpit) return;

    page.classList.add("cockpit-final-ux");
    cleanPreviewCopy(page, cockpit);
    collapseSelectedAnalysis(page);
    enhanceMarketChart(cockpit);
    enhanceOpportunityMap(cockpit);
    enhanceGradingContext(cockpit);

    if (page.dataset.finalNavigationReset !== "true") {
      page.dataset.finalNavigationReset = "true";
      resetNavigationTop();
    }
  }

  const observer = new MutationObserver(() => requestAnimationFrame(applyFinalUx));
  observer.observe(main, { childList: true, subtree: true });

  window.addEventListener("hashchange", () => {
    const page = main.querySelector(".page");
    if (page) delete page.dataset.finalNavigationReset;
    requestAnimationFrame(applyFinalUx);
  });
  window.addEventListener("pageshow", () => requestAnimationFrame(applyFinalUx));
  window.addEventListener("load", () => requestAnimationFrame(applyFinalUx));
  requestAnimationFrame(applyFinalUx);
})();
