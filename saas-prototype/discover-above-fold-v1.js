(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  let scheduled = false;

  function eligible() {
    return APP_PATH.test(String(window.location.pathname || ""));
  }

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function arrange() {
    scheduled = false;
    if (!eligible() || routeName() !== "discover") return;

    const page = document.querySelector("#main-content .customer-discovery-page");
    const heading = page?.querySelector(":scope > .page-heading");
    const search = page?.querySelector(":scope > .customer-discovery-search");
    if (!page || !heading || !search) return;

    page.classList.add("ff-discover-above-fold");

    // The card-entry panel is the primary Discover action. Keep it directly
    // below the page heading so workflow education never pushes it below fold.
    if (heading.nextElementSibling !== search) {
      heading.insertAdjacentElement("afterend", search);
    }

    const coach = page.querySelector(":scope > [data-ff-discover-coach]");
    const workflow = page.querySelector(":scope > [data-ff-workflow-strip]");
    const decisionKey = page.querySelector(":scope > [data-ff-decision-key]");
    const boundary = [...page.querySelectorAll(":scope > .boundary-note")]
      .find(node => /decision framework|authority boundary/i.test(String(node.textContent || "")));

    let anchor = search;
    for (const node of [coach, workflow, decisionKey, boundary]) {
      if (!node || node === anchor) continue;
      if (anchor.nextElementSibling !== node) anchor.insertAdjacentElement("afterend", node);
      anchor = node;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(arrange);
  }

  window.addEventListener("hashchange", schedule);
  window.addEventListener("load", schedule);
  document.addEventListener("DOMContentLoaded", schedule);

  const main = document.querySelector("#main-content");
  if (main) {
    new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
  }

  schedule();
})();
