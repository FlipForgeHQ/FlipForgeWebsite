(() => {
  "use strict";

  if (window.FlipForgeCustomerProductArchitectureV1) return;
  window.FlipForgeCustomerProductArchitectureV1 = true;

  const FULL_CUSTOMER_PATH = /^\/app\/customer(?:\/|$)/i;
  const params = new URLSearchParams(window.location.search);
  if (!FULL_CUSTOMER_PATH.test(String(window.location.pathname || "")) || params.get("ffArchitecture") !== "1") return;

  document.documentElement.classList.add("ff-product-architecture-v1");
  document.body?.classList.add("ff-product-architecture-v1");

  const MAIN_ROUTES = new Map([
    ["dashboard", "Home"],
    ["discover", "Discover"],
    ["opportunities", "Decisions"],
    ["tracking", "Monitor"],
    ["portfolio", "Portfolio"]
  ]);

  const WORKSPACE_ROUTES = new Set(["opportunities", "evidence", "psa-advisor", "tracking", "sell", "export"]);
  let queued = false;
  let lastReceiptFocus = "";

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean);
  }

  function routeName() {
    return routeParts()[0] || "dashboard";
  }

  function routeId() {
    const [route, id] = routeParts();
    if (!WORKSPACE_ROUTES.has(route) || !id || id.includes("=")) return "";
    try { return decodeURIComponent(id); } catch (_) { return id; }
  }

  function focusMode() {
    const hash = String(window.location.hash || "");
    const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    return new URLSearchParams(query).get("focus") || "";
  }

  function replaceLinkText(link, label) {
    if (!link) return;
    const textNode = [...link.childNodes].find(node =>
      node.nodeType === Node.TEXT_NODE && String(node.nodeValue || "").trim()
    );
    if (textNode) {
      const leading = /^\s*/.exec(textNode.nodeValue || "")?.[0] || "";
      textNode.nodeValue = `${leading}${label}`;
    } else {
      link.append(document.createTextNode(label));
    }
  }

  function simplifyNavigation() {
    const nav = document.querySelector(".primary-nav");
    if (!nav) return;

    nav.dataset.ffProductArchitecture = "v1";
    nav.querySelectorAll(":scope > a[data-route]").forEach(link => {
      const route = String(link.dataset.route || "");
      if (MAIN_ROUTES.has(route)) {
        link.dataset.ffArchitecturePrimary = "";
        replaceLinkText(link, MAIN_ROUTES.get(route));
      } else {
        delete link.dataset.ffArchitecturePrimary;
      }
    });

    const active = routeName();
    const primaryActive = active === "evidence" || active === "psa-advisor" || active === "sell" || active === "export"
      ? "opportunities"
      : active === "alerts"
        ? "tracking"
        : active;

    nav.querySelectorAll(":scope > a[data-route]").forEach(link => {
      const current = String(link.dataset.route || "") === primaryActive;
      if (current) link.setAttribute("data-ff-architecture-current", "");
      else link.removeAttribute("data-ff-architecture-current");
    });

    const advanced = nav.querySelector(":scope > .ff-advanced-nav");
    if (advanced) advanced.dataset.ffArchitectureSecondary = "";
  }

  function simplifyTopbar() {
    const evaluate = document.querySelector("[data-ff-global-new-card]");
    if (evaluate) {
      evaluate.setAttribute("href", "#/discover");
      evaluate.setAttribute("aria-label", "Discover or evaluate a card");
      evaluate.innerHTML = '<span aria-hidden="true">＋</span> Discover a card';
    }
    const saved = document.querySelector('.topbar-actions a[href="#/opportunities"]');
    if (saved) saved.innerHTML = '<span aria-hidden="true">▤</span> Decisions';
  }

  function workflowStrip() {
    const main = document.querySelector("#main-content");
    const page = main?.querySelector(".page");
    if (!page || page.querySelector("[data-ff-architecture-flow]")) return;

    const route = routeName();
    if (!["dashboard", "discover", "opportunities", "tracking", "portfolio"].includes(route)) return;

    const strip = document.createElement("section");
    strip.className = "ff-architecture-flow";
    strip.dataset.ffArchitectureFlow = "";
    strip.setAttribute("aria-label", "FlipForge decision intelligence workflow");
    strip.innerHTML = `
      <span>THE FLIPFORGE SYSTEM</span>
      <div>
        <b data-active="${route === "discover"}">SCAN</b>
        <i>→</i>
        <b data-active="${route === "opportunities"}">DECIDE</b>
        <i>→</i>
        <b data-active="${route === "opportunities"}">PROVE</b>
        <i>→</i>
        <b data-active="${route === "tracking"}">MONITOR</b>
        <i>→</i>
        <b data-active="${route === "portfolio"}">LEARN</b>
      </div>
    `;
    const heading = page.querySelector(":scope > .page-heading");
    if (heading) heading.insertAdjacentElement("afterend", strip);
    else page.prepend(strip);
  }

  function workspaceTab(href, label, active, description) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.className = "ff-decision-workspace-tab";
    if (active) anchor.setAttribute("aria-current", "page");
    anchor.innerHTML = `<strong>${label}</strong><small>${description}</small>`;
    return anchor;
  }

  function workspace() {
    const id = routeId();
    const route = routeName();
    if (!id || !WORKSPACE_ROUTES.has(route)) return;

    const main = document.querySelector("#main-content");
    const page = main?.querySelector(".page");
    if (!page) return;

    const existing = page.querySelector("[data-ff-decision-workspace]");
    const key = `${route}:${id}:${focusMode()}`;
    if (existing?.dataset.ffDecisionWorkspace === key) return;
    existing?.remove();

    const encoded = encodeURIComponent(id);
    const focus = focusMode();
    const rail = document.createElement("section");
    rail.className = "ff-decision-workspace";
    rail.dataset.ffDecisionWorkspace = key;
    rail.innerHTML = `
      <div class="ff-decision-workspace-head">
        <div><span class="eyebrow">Decision Workspace</span><strong>One saved decision. Every governed view.</strong></div>
        <a href="#/opportunities">All decisions</a>
      </div>
      <nav class="ff-decision-workspace-tabs" aria-label="Decision workspace views"></nav>
    `;
    const tabs = rail.querySelector("nav");
    tabs.append(
      workspaceTab(`#/opportunities/${encoded}`, "Decision", route === "opportunities" && focus !== "receipt", "Verdict & economics"),
      workspaceTab(`#/evidence/${encoded}?focus=why`, "Why", route === "evidence" && focus === "why", "Reason trail"),
      workspaceTab(`#/evidence/${encoded}`, "Evidence", route === "evidence" && focus !== "why", "Trusted & excluded"),
      workspaceTab(`#/psa-advisor/${encoded}`, "Grade", route === "psa-advisor", "PSA context"),
      workspaceTab(`#/tracking/${encoded}`, "Monitor", route === "tracking", "Changes & outcomes"),
      workspaceTab(`#/sell/${encoded}`, "Exit", route === "sell", "Exit review"),
      workspaceTab(`#/opportunities/${encoded}?focus=receipt`, "Receipt", route === "opportunities" && focus === "receipt", "Governed record")
    );

    const heading = page.querySelector(":scope > .page-heading");
    if (heading) heading.insertAdjacentElement("afterend", rail);
    else page.prepend(rail);

    if (route === "evidence" && focus === "why" && !page.querySelector("[data-ff-workspace-why-intro]")) {
      const intro = document.createElement("div");
      intro.className = "ff-workspace-focus-note";
      intro.dataset.ffWorkspaceWhyIntro = "";
      intro.innerHTML = "<strong>Why this decision</strong><span>This view uses the governed evidence record to show what FlipForge trusted, what it excluded, and why the saved decision was supported or withheld.</span>";
      rail.insertAdjacentElement("afterend", intro);
    }
  }

  function focusReceipt() {
    const id = routeId();
    if (routeName() !== "opportunities" || focusMode() !== "receipt" || !id) return;
    const key = `${id}:receipt`;
    if (lastReceiptFocus === key) return;
    const main = document.querySelector("#main-content");
    const receipt = main?.querySelector("[data-ff-decision-receipt], .ff-di-v2-receipt");
    if (!receipt) return;
    lastReceiptFocus = key;
    if ("open" in receipt) receipt.open = true;
    receipt.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function relabelPages() {
    const main = document.querySelector("#main-content");
    if (!main) return;
    const route = routeName();
    const heading = main.querySelector(".page-heading h1");
    const paragraph = main.querySelector(".page-heading p");

    if (route === "opportunities" && routeParts().length === 1) {
      if (heading) heading.textContent = "Decisions";
      if (paragraph) paragraph.textContent = "Your saved FlipForge decisions—open one to review the verdict, evidence, monitoring, and complete decision record.";
    }
    if (route === "tracking" && routeParts().length === 1) {
      if (heading) heading.textContent = "Monitor";
      if (paragraph) paragraph.textContent = "Watch saved decisions over time, review what changed, and record real outcomes without rewriting the original decision.";
    }
  }

  function sync() {
    queued = false;
    simplifyNavigation();
    simplifyTopbar();
    relabelPages();
    workflowStrip();
    workspace();
    focusReceipt();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(sync);
  }

  window.addEventListener("hashchange", () => {
    lastReceiptFocus = "";
    schedule();
  });
  window.addEventListener("pageshow", schedule);
  window.addEventListener("load", schedule);
  if (document.body) {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  schedule();
})();