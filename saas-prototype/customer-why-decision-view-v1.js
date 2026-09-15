(() => {
  "use strict";

  if (window.FlipForgeCustomerWhyDecisionViewV1) return;
  window.FlipForgeCustomerWhyDecisionViewV1 = true;

  const FULL_CUSTOMER_PATH = /^\/app\/customer(?:\/|$)/i;
  if (!FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""))) return;

  let scheduled = false;

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean);
  }

  function whyView() {
    const parts = routeParts();
    return parts[0] === "decision-intelligence" && parts[1] === "why";
  }

  function ensureStyle() {
    if (document.querySelector("#ff-customer-why-decision-style")) return;
    const style = document.createElement("style");
    style.id = "ff-customer-why-decision-style";
    style.textContent = `
      html.ff-customer-why-decision-view #main-content .ff-di-controls,
      html.ff-customer-why-decision-view #main-content .ff-di-grid {
        display: none !important;
      }
      html.ff-customer-why-decision-view #main-content .ff-di-hero {
        grid-template-columns: minmax(0, 1fr) !important;
      }
      html.ff-customer-why-decision-view #main-content .ff-di-hero-copy {
        display: none !important;
      }
      html.ff-customer-why-decision-view #main-content .ff-di-v2-command {
        margin-top: 0 !important;
      }
      .ff-customer-why-heading {
        display: grid;
        gap: 8px;
        margin: 0 0 16px;
      }
      .ff-customer-why-heading .eyebrow {
        margin: 0;
      }
      .ff-customer-why-heading h1 {
        margin: 0;
      }
      .ff-customer-why-heading p {
        max-width: 78ch;
        margin: 0;
      }
      .ff-customer-why-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 0 0 18px;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureHeading(root) {
    let heading = root.querySelector("[data-ff-customer-why-heading]");
    if (!heading) {
      heading = document.createElement("header");
      heading.className = "ff-customer-why-heading";
      heading.dataset.ffCustomerWhyHeading = "";
      heading.innerHTML = `
        <span class="eyebrow">Why This Decision</span>
        <h1 data-ff-customer-why-title>Why FlipForge made this decision.</h1>
        <p>Review the saved reasons, evidence gates, exclusions, uncertainty, and the specific conditions that could change this decision.</p>
      `;
      root.insertBefore(heading, root.firstElementChild || null);
    }
    return heading;
  }

  function ensureActions(root, heading) {
    let actions = root.querySelector("[data-ff-customer-why-actions]");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "ff-customer-why-actions";
      actions.dataset.ffCustomerWhyActions = "";
      heading.insertAdjacentElement("afterend", actions);
    }
    const wanted = '<a class="button button-secondary" href="#/decision-intelligence">Open full Decision Intelligence</a><a class="button button-secondary" href="#/evidence">Open Evidence Review</a>';
    if (actions.innerHTML !== wanted) actions.innerHTML = wanted;
  }

  function clearWhyPresentation() {
    document.querySelector("[data-ff-customer-why-heading]")?.remove();
    document.querySelector("[data-ff-customer-why-actions]")?.remove();
    const root = document.querySelector("#main-content .ff-di-page");
    if (root) delete root.dataset.ffCustomerWhyDecisionView;
  }

  function applyWhyPresentation() {
    const active = whyView();
    document.documentElement.classList.toggle("ff-customer-why-decision-view", active);
    if (!active) {
      clearWhyPresentation();
      return;
    }

    ensureStyle();
    const root = document.querySelector("#main-content .ff-di-page");
    if (!root) return;
    root.dataset.ffCustomerWhyDecisionView = "v1";
    const heading = ensureHeading(root);
    ensureActions(root, heading);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      applyWhyPresentation();
    });
  }

  function init() {
    const main = document.querySelector("#main-content");
    if (main) new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
    window.addEventListener("hashchange", schedule);
    window.addEventListener("pageshow", schedule);
    window.setTimeout(schedule, 80);
    window.setTimeout(schedule, 500);
    schedule();
  }

  init();
})();
