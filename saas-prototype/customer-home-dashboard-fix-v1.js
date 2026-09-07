(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const MAIN = "#main-content";
  let scheduled = false;

  function eligible() {
    return APP_PATH.test(String(window.location.pathname || ""));
  }

  function isHome() {
    const route = String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean)[0] || "dashboard";
    return route === "dashboard";
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function ensureHome() {
    if (!eligible() || !isHome()) return;
    const main = document.querySelector(MAIN);
    if (!main) return;

    document.documentElement.classList.add("ff-customer-simple-home");

    const heading = main.querySelector(".page-heading, .ff-dashboard-head");
    if (!heading) return;

    setText(heading.querySelector("h1"), "Before you buy, know why.");
    setText(heading.querySelector("p"), "Evaluate an exact card, understand the decision, and track what happens next.");

    const eyebrow = heading.querySelector(".eyebrow");
    if (eyebrow) setText(eyebrow, "Private beta");

    const dashboardActions = heading.querySelector(".ff-dashboard-head-actions");
    if (dashboardActions) {
      const evaluate = dashboardActions.querySelector('a[href="#/evaluate"], a[href="#/discover"]');
      if (evaluate) {
        evaluate.setAttribute("href", "#/discover");
        setText(evaluate, "Evaluate a card");
      }
    }

    const pageActions = heading.querySelector(".page-actions");
    if (pageActions) {
      const wanted = '<a class="button button-primary" href="#/discover">Evaluate a card</a>';
      if (pageActions.innerHTML !== wanted) pageActions.innerHTML = wanted;
    }

    let quick = main.querySelector("[data-ff-customer-home-actions]");
    if (!quick) {
      quick = document.createElement("section");
      quick.className = "ff-customer-home-actions";
      quick.dataset.ffCustomerHomeActions = "";
      heading.insertAdjacentElement("afterend", quick);
    }

    const wantedQuick = [
      ["01", "Evaluate a card", "Enter the exact card or listing and let FlipForge guide you to a decision.", "#/discover"],
      ["02", "Review saved decisions", "Return to cards you already evaluated and see what the evidence supports.", "#/opportunities"],
      ["03", "Check tracking", "Follow saved cards and see what changed after the original decision.", "#/tracking"]
    ].map(([step, title, copy, href]) => `<a class="ff-customer-home-action" href="${href}"><span>${step}</span><strong>${title}</strong><small>${copy}</small></a>`).join("");
    if (quick.innerHTML !== wantedQuick) quick.innerHTML = wantedQuick;

    let note = main.querySelector("[data-ff-customer-only-note]");
    if (!note) {
      note = document.createElement("div");
      note.className = "ff-customer-only-note";
      note.dataset.ffCustomerOnlyNote = "";
      note.innerHTML = '<strong>Customer interface:</strong> FlipForge keeps internal operator controls, diagnostics, provider administration, cohort tools, and audit operations out of this workspace.';
      quick.insertAdjacentElement("afterend", note);
    }
  }

  function apply() {
    if (!isHome()) {
      document.documentElement.classList.remove("ff-customer-simple-home");
      return;
    }
    ensureHome();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  function init() {
    if (!eligible()) return;
    const main = document.querySelector(MAIN);
    if (main) new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
    window.addEventListener("hashchange", () => window.setTimeout(schedule, 40));
    window.addEventListener("pageshow", schedule);
    window.addEventListener("load", schedule);
    schedule();
  }

  init();
})();
