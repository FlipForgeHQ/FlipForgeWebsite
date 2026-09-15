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
      html.ff-customer-why-decision-view #main-content .ff-di-v2-command {
        margin-top: 0 !important;
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

  function ensureActions(root) {
    let actions = root.querySelector("[data-ff-customer-why-actions]");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "ff-customer-why-actions";
      actions.dataset.ffCustomerWhyActions = "";
      const command = root.querySelector("[data-ff-di-v2-command]");
      (command || root.firstElementChild)?.insertAdjacentElement(command ? "beforebegin" : "afterend", actions);
    }
    if (!actions) return;
    const wanted = '<a class="button button-secondary" href="#/decision-intelligence">Open full Decision Intelligence</a><a class="button button-secondary" href="#/evidence">Open Evidence Review</a>';
    if (actions.innerHTML !== wanted) actions.innerHTML = wanted;
  }

  function applyWhyPresentation() {
    const active = whyView();
    document.documentElement.classList.toggle("ff-customer-why-decision-view", active);
    if (!active) return;

    ensureStyle();
    const root = document.querySelector("#main-content .ff-di-page");
    if (!root) return;
    root.dataset.ffCustomerWhyDecisionView = "v1";

    const eyebrow = root.querySelector(".ff-di-hero-copy .eyebrow");
    const title = root.querySelector(".ff-di-hero-copy h1");
    const copy = root.querySelector(".ff-di-hero-copy p");
    if (eyebrow && eyebrow.textContent !== "Why This Decision") eyebrow.textContent = "Why This Decision";
    if (title && title.textContent !== "Why FlipForge made this decision.") title.textContent = "Why FlipForge made this decision.";
    const explanation = "Review the saved reasons, evidence gates, exclusions, uncertainty, and the specific conditions that could change this decision.";
    if (copy && copy.textContent !== explanation) copy.textContent = explanation;

    ensureActions(root);
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
