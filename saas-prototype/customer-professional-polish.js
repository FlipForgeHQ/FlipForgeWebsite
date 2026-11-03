(() => {
  "use strict";

  const COPY_REPLACEMENTS = [
    ["PRIVATE BETA INTELLIGENCE", "PRIVATE BETA"],
    ["BETA INTELLIGENCE", "PRIVATE BETA"],
    ["BETA PREVIEW", "PRIVATE BETA"],
    ["Authenticated tenant-scoped intelligence · Saved decisions · No transaction authority", "Card intelligence workspace · Evaluation only"],
    ["Controlled customer intelligence preview · No transaction authority", "Card intelligence preview · Evaluation only"],
    ["Controlled customer intelligence · No transaction authority", "Card intelligence workspace · Evaluation only"],
    ["Tenant access", "Private beta"],
    ["Plan state and evaluation usage are server-owned. Paid access is not active during private beta.", "Usage updates automatically. Paid access is not active during private beta."],
    ["Plan state, usage, and checkout availability are server-owned.", "Plan, usage, and checkout availability update automatically."],
    ["Plan state and usage are server-owned. Paid checkout is deferred until Core Platform Beta Complete.", "Plan and usage update automatically. Paid access is not active during private beta."],
    ["Plan state and usage are server-owned.", "Plan and usage update automatically."],
    ["Subscription and usage data stays server-owned.", "Subscription and usage update automatically."],
    ["Access and usage stay server-owned.", "Access and usage update automatically."],
    ["Review server-owned access, evaluation usage, and the planned commercial tiers for this tenant.", "Review your access, evaluation usage, and available plan details."],
    // No pair may introduce "verified", "confirmed" or "trusted": reported sales and saved evidence are never
    // described that way (a global "Server-owned" -> "Verified" rewrite was removed).
    ["tenant-scoped", "account-specific"],
    ["Tenant-owned saved intelligence", "Saved intelligence"],
    ["Tenant-owned saved record", "Saved record"],
    ["Tenant-owned", "Saved"],
    ["tenant-owned", "saved"],
    ["browser-side", "local"],
    ["browser-invented", "placeholder"],
    ["authority contract", "service validation"],
    ["Planned launch plan", "Plan"],
    ["Planned commercial plans", "Plans"],
    ["These tiers remain informational during the core-platform completion sprint.", "Plan details are informational during private beta."],
    ["Billing deferred", "Not active"],
    ["Checkout deferred until Beta Complete", "Checkout unavailable in private beta"],
    ["Deferred by core-platform launch gate", "Not available in private beta"],
    ["Production payment controls are intentionally absent.", "Payments are not available in private beta."],
    ["Billing launch resumes only after the core customer product reaches Beta Complete.", "Paid access will open only after launch review is complete."],
    ["This production account screen is read-only.", "Account information is view-only during private beta."],
    ["No sample subscription or browser-invented allowance was shown.", "No placeholder subscription or allowance is shown."],
    ["Interactive prototype history for the selected opportunity.", "Recent ask and supported-value history for the selected opportunity."],
    ["Prototype customer activity, not live telemetry.", "Recent intelligence activity."],
    ["Prototype list of saved Smart Opportunity output.", "Saved decisions ranked with supporting evidence."],
    ["Prototype saved record", "Saved evaluation"],
    ["Plain-language explanation of saved authority output.", "Why this decision was reached."],
    ["Existing recommendations ranked with saved evidence context.", "Your highest-priority opportunities, ranked with supporting evidence."],
    ["Saved opportunity authority", "Card intelligence"],
    ["Forge Heat V1", "Forge Heat"]
  ];

  const HEAT_TAB_LABELS = {
    top5: "Top 5",
    hiddenGems: "Hidden Gems",
    highestEdge: "Highest Edge",
    heatingUp: "Heating Up"
  };

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function customerCopy(root = document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest("script, style")) continue;
      const original = node.nodeValue || "";
      let value = original;
      for (const [from, to] of COPY_REPLACEMENTS) value = value.replaceAll(from, to);
      if (value !== original) node.nodeValue = value;
    }
  }

  function polishTrademark(root = document) {
    root.querySelectorAll("h1, h2, h3").forEach(node => {
      if (node.querySelector(".ff-trademark")) return;
      const text = node.textContent || "";
      if (!text.includes("Forge Heat™")) return;
      const parts = text.split("Forge Heat™");
      if (parts.length !== 2) return;
      node.textContent = "";
      if (parts[0]) node.append(document.createTextNode(parts[0]));
      node.append(document.createTextNode("Forge Heat"));
      const sup = document.createElement("sup");
      sup.className = "ff-trademark";
      sup.textContent = "™";
      node.append(sup);
      if (parts[1]) node.append(document.createTextNode(parts[1]));
    });
  }

  function polishDashboard() {
    if (routeName() !== "dashboard") return;
    const main = document.querySelector("#main-content");
    if (!main) return;

    const heading = main.querySelector(".page-heading");
    if (heading) {
      setText(heading.querySelector(".eyebrow"), "Card intelligence");
      setText(heading.querySelector("h1"), "Decision Dashboard");
      setText(heading.querySelector("p"), "See what deserves attention, why it qualifies, and what needs review before you act.");
    }

    main.querySelectorAll(".panel").forEach(panel => {
      const titleNode = panel.querySelector(".panel-header h2");
      const title = titleNode?.textContent?.trim();
      const description = panel.querySelector(".panel-header p");
      if (title === "Ask vs supported value") setText(description, "Recent price context for the selected opportunity.");
      if (title === "Top opportunities") setText(description, "Highest-priority saved opportunities with evidence context.");
      if (title === "Evidence readiness") setText(description, "How complete and current the supporting evidence is.");
      if (title === "Decision factors") setText(titleNode, "Decision signals");
      if (title === "Recent activity") setText(titleNode, "Recent intelligence");
    });
  }

  function polishForgeHeatInteractive(root = document) {
    const shell = root.querySelector(".forge-heat-shell");
    if (!shell) return;

    shell.classList.add("ff-forge-heat-interactive-beta");

    const eyebrow = shell.querySelector(".forge-heat-title-row .eyebrow");
    if (eyebrow) setText(eyebrow, "Beta intelligence · In development");

    shell.querySelector(".forge-heat-pro-chip")?.remove();

    const boundarySmall = shell.querySelector(".forge-heat-boundary small");
    if (boundarySmall) setText(boundarySmall, "Saved-evaluation beta · Decision support only");

    shell.querySelectorAll("[data-heat-tab]").forEach(button => {
      const key = button.getAttribute("data-heat-tab");
      if (key && HEAT_TAB_LABELS[key]) setText(button, HEAT_TAB_LABELS[key]);
    });

    shell.querySelectorAll(".forge-heat-summary > div").forEach(metric => {
      const label = metric.querySelector("span");
      const text = label?.textContent?.trim();
      if (text === "Heat eligible") setText(label, "Eligible for scoring");
      if (text === "Surfaced") setText(label, "60+ surfaced");
    });

    const lock = shell.querySelector(".forge-heat-lock");
    if (lock) {
      setText(lock.querySelector(".forge-heat-lock-mark"), "BETA");
      setText(lock.querySelector(".eyebrow"), "Beta access");
      const h2 = lock.querySelector("h2");
      if (h2 && /included with FlipForge Pro|upgrade/i.test(h2.textContent || "")) {
        setText(h2, "Forge Heat beta access is not enabled for this account.");
      }
      lock.querySelectorAll("p").forEach(p => {
        if (/upgrade to Pro/i.test(p.textContent || "")) {
          setText(p, "Forge Heat remains in beta while its ranking and history signals are validated.");
        }
      });
    }

    shell.querySelectorAll(".forge-heat-card-foot > span").forEach(node => {
      setText(node, "Forge Heat prioritizes the opportunity. Smart Opportunity remains the saved recommendation.");
    });

    polishTrademark(shell);
  }

  function improveEmptyStates(root = document) {
    const ctas = {
      opportunities: ["Discover a card", "#/discover"],
      evidence: ["Evaluate a card", "#/evaluate"],
      portfolio: ["Discover a card", "#/discover"]
    };

    const route = routeName();
    root.querySelectorAll(".staging-empty, .consumer-state-empty, .forge-heat-empty").forEach(state => {
      // A Forge Heat page with no evaluations at all keeps its own "evaluate a card" copy: the threshold wording
      // below only fits evaluations that were scored and did not qualify.
      if (/No qualifying opportunities yet/i.test(state.textContent || "") && state.getAttribute("data-forge-heat-empty") !== "none-evaluated") {
        setText(state.querySelector("strong"), "No opportunity reaches the Forge Heat surface threshold yet.");
        setText(state.querySelector("p"), "Forge Heat scores eligible decisions first, then surfaces only those with a score of 60 or higher.");
      }
      if (state.querySelector("a, button") || !ctas[route]) return;
      const [label, href] = ctas[route];
      const link = document.createElement("a");
      link.className = "button button-secondary ff-empty-cta";
      link.href = href;
      link.textContent = label;
      state.appendChild(link);
    });
  }

  function apply() {
    customerCopy(document.body);
    polishDashboard();
    improveEmptyStates(document);
    polishForgeHeatInteractive(document);
    polishTrademark(document);
    document.documentElement.classList.add("ff-product-polish-ready");
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener("hashchange", scheduleApply);
  window.addEventListener("pageshow", scheduleApply);
  window.addEventListener("load", scheduleApply);
  scheduleApply();
})();