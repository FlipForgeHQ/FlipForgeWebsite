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

  function sparkline(points) {
    const width = 118;
    const height = 30;
    const padding = 2;
    const values = points.map(point => Number(point.demand) || 0);
    const min = Math.min(...values) - 2;
    const max = Math.max(...values) + 2;
    const x = index => padding + index * ((width - padding * 2) / Math.max(1, points.length - 1));
    const y = value => padding + (max - value) * ((height - padding * 2) / Math.max(1, max - min));
    const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.demand).toFixed(1)}`).join(" ");
    return `<svg class="cockpit-kpi-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Prototype demand trend rising from ${points[0].demand} to ${points.at(-1).demand}"><path d="${path}"></path></svg>`;
  }

  function kpiStrip() {
    const dashboardMetrics = core.dashboard.metrics;
    const opportunities = core.opportunities;
    const acceptedEvidence = opportunities.reduce((sum, item) => sum + Number(item.evidence || 0), 0);
    const reviewStates = opportunities.filter(item => ["WATCH", "VERIFY"].includes(item.recommendation)).length;
    const latestMarket = features.discover.marketTrend.at(-1);

    const values = [
      {
        label: "Tracked opportunities",
        value: dashboardMetrics[0]?.value || String(opportunities.length),
        note: `${opportunities.length} displayed in staging`,
        icon: "↗"
      },
      {
        label: "Evidence readiness",
        value: `${core.dashboard.evidenceReadiness.score}%`,
        note: `${acceptedEvidence} accepted evidence rows`,
        icon: "◎"
      },
      {
        label: "Portfolio value",
        value: currency.format(features.portfolio.totalValue),
        note: `${features.portfolio.evidenceReady}% evidence-ready`,
        icon: "◫"
      },
      {
        label: "Needs review",
        value: String(reviewStates),
        note: "WATCH or VERIFY states",
        icon: "!"
      }
    ];

    return `
      <section class="cockpit-kpi-strip" aria-label="FlipForge cockpit metrics">
        ${values.map(item => `
          <article class="cockpit-kpi-card">
            <div><span>${item.label}</span><strong>${item.value}</strong><small>${item.note}</small></div>
            <span class="cockpit-kpi-icon" aria-hidden="true">${item.icon}</span>
          </article>`).join("")}
        <article class="cockpit-kpi-card cockpit-kpi-market">
          <div><span>Market pulse</span><strong>${latestMarket.demand} / ${latestMarket.liquidity}</strong><small>Demand / liquidity prototype index</small></div>
          ${sparkline(features.discover.marketTrend)}
        </article>
      </section>`;
  }

  function forceNavigationTop(page) {
    if (page.dataset.cockpitNavReset === "true") return;
    page.dataset.cockpitNavReset = "true";

    const reset = () => {
      const primaryNav = document.querySelector(".primary-nav");
      if (primaryNav) {
        primaryNav.scrollTop = 0;
        if (typeof primaryNav.scrollTo === "function") primaryNav.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    };

    reset();
    requestAnimationFrame(reset);
    setTimeout(reset, 60);
    setTimeout(reset, 220);
  }

  function applyPolish() {
    if (activeRoute() !== "dashboard") return;

    const page = main.querySelector(".page.dashboard-cockpit-primary");
    const cockpit = page?.querySelector(":scope > .cockpit-expansion");
    const heading = cockpit?.querySelector(":scope > .cockpit-section-heading");
    if (!page || !cockpit || !heading) return;

    page.classList.add("cockpit-polished");

    const title = heading.querySelector("h2");
    const description = heading.querySelector("p");
    const chip = heading.querySelector(".cockpit-stage-chip");
    if (title) title.textContent = "FlipForge Intelligence Cockpit";
    if (description) description.textContent = "Discover, evaluate, validate, compare, track, and act from one evidence-first workspace.";
    if (chip) chip.textContent = "Staging owner review";

    if (!cockpit.querySelector(":scope > .cockpit-kpi-strip")) {
      heading.insertAdjacentHTML("afterend", kpiStrip());
    }

    forceNavigationTop(page);
  }

  const observer = new MutationObserver(() => requestAnimationFrame(applyPolish));
  observer.observe(main, { childList: true, subtree: true });

  window.addEventListener("hashchange", () => {
    const page = main.querySelector(".page");
    if (page) delete page.dataset.cockpitNavReset;
    requestAnimationFrame(applyPolish);
  });
  window.addEventListener("pageshow", () => requestAnimationFrame(applyPolish));
  requestAnimationFrame(applyPolish);
})();
