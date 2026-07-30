(() => {
  "use strict";

  const main = document.querySelector("#main-content");
  if (!main) return;

  function activeRoute() {
    return (window.location.hash.replace(/^#\/?/, "").split("/")[0] || "dashboard").split("?")[0];
  }

  function resetDashboardNavigation() {
    const primaryNav = document.querySelector(".primary-nav");
    if (primaryNav) primaryNav.scrollTop = 0;
  }

  function applyCockpitLayout() {
    if (activeRoute() !== "dashboard") return;

    const page = main.querySelector(".page");
    const heading = page?.querySelector(":scope > .page-heading");
    const cockpit = page?.querySelector(":scope > .cockpit-expansion");
    const visualLayer = page?.querySelector(":scope > .visual-intelligence-layer");
    if (!page || !heading || !cockpit || !visualLayer) return;

    page.classList.add("dashboard-cockpit-primary");

    // Make the complete cockpit the dashboard rather than an appendix.
    if (heading.nextElementSibling !== cockpit) heading.after(cockpit);

    let deepAnalysisHeading = page.querySelector(":scope > .cockpit-deep-analysis-heading");
    if (!deepAnalysisHeading) {
      deepAnalysisHeading = document.createElement("header");
      deepAnalysisHeading.className = "cockpit-deep-analysis-heading";
      deepAnalysisHeading.innerHTML = `
        <div>
          <span>Selected opportunity analysis</span>
          <h2>Why this card deserves attention</h2>
          <p>Detailed value, confidence, evidence, and grading graphics for the current saved Smart Opportunity result.</p>
        </div>
        <a href="#/opportunities">View all opportunities →</a>`;
    }

    if (cockpit.nextElementSibling !== deepAnalysisHeading) cockpit.after(deepAnalysisHeading);
    if (deepAnalysisHeading.nextElementSibling !== visualLayer) deepAnalysisHeading.after(visualLayer);

    // Remove duplicate legacy dashboard sections only after the replacement cockpit exists.
    [...page.children].forEach(child => {
      if (
        child.classList.contains("metric-grid") ||
        child.classList.contains("dashboard-grid") ||
        child.classList.contains("boundary-note")
      ) {
        child.classList.add("cockpit-legacy-dashboard-block");
        child.setAttribute("aria-hidden", "true");
      }
    });

    resetDashboardNavigation();
  }

  const observer = new MutationObserver(() => requestAnimationFrame(applyCockpitLayout));
  observer.observe(main, { childList: true, subtree: true });

  window.addEventListener("hashchange", () => requestAnimationFrame(applyCockpitLayout));
  window.addEventListener("pageshow", () => requestAnimationFrame(applyCockpitLayout));
  requestAnimationFrame(applyCockpitLayout);
})();
