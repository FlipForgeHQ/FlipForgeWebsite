(() => {
  "use strict";

  if (window.__ffCustomerSurfaceNormalizationV1 === true) return;

  const FULL_CUSTOMER_PATH = /^\/app\/customer(?:\/|$)/i;
  const REPLACEMENTS = [
    ["Private Beta Evaluation Allowance Reached", "Evaluation allowance reached"],
    ["PRIVATE BETA", "EARLY ACCESS"],
    ["Private Beta", "Early Access"],
    ["Private beta", "Early access"],
    ["private beta", "early access"],
    ["Private-beta", "Early-access"],
    ["private-beta", "early-access"],
    ["Beta Invitation", "Invitation"],
    ["Unlimited during beta", "No monthly cap"],
    ["Unlimited beta", "No monthly cap"],
    ["Paid checkout, plan changes, and customer portal controls are intentionally deferred until Core Platform Beta Complete.", "Paid checkout, plan changes, and customer portal controls are not available yet."],
    ["Private-beta access remains unchanged.", "Current access remains unchanged."],
    ["Checkout deferred until Beta Complete", "Checkout not available yet"],
    ["Deferred by core-platform launch gate", "Not available yet"],
    ["Checkout unavailable in early access", "Checkout not available yet"],
    ["Not available in early access", "Not available yet"],
    ["Account information is view-only during early access.", "Account information is view-only."],
    ["Paid access is not active during early access.", "Paid access is not active yet."],
    ["Plan details are informational during early access.", "Plan details are informational."],
    ["Billing launch resumes only after the core customer product reaches Beta Complete.", "Billing will open after launch readiness review."],
    ["These tiers remain informational during the core-platform completion sprint.", "Plan details are informational until billing is enabled."],
    ["Sign in with an invited FlipForge early-access account.", "Sign in with your invited FlipForge account."],
    ["Beta Complete", "launch readiness"]
  ];

  let queued = false;

  function fullCustomerMode() {
    return window.FlipForgeFullCustomerEntry === true
      || FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""));
  }

  function normalizeText(value) {
    let next = String(value || "");
    for (const [from, to] of REPLACEMENTS) next = next.replaceAll(from, to);
    return next;
  }

  function normalizeVisibleText(root = document) {
    if (!fullCustomerMode()) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest("script, style, noscript, template")) continue;
      const current = node.nodeValue || "";
      const next = normalizeText(current);
      if (next !== current) node.nodeValue = next;
    }
  }

  function normalizeCustomerLinks(root = document) {
    if (!fullCustomerMode()) return;
    root.querySelectorAll?.('a[href^="/production-auth.html"]').forEach(link => {
      try {
        const url = new URL(link.getAttribute("href"), window.location.origin);
        const returnPath = url.searchParams.get("return");
        if (returnPath && /^\/app\/(?:#|$)/.test(returnPath)) {
          url.searchParams.set("return", returnPath.replace(/^\/app\//, "/app/customer/"));
          link.setAttribute("href", `${url.pathname}${url.search}${url.hash}`);
        }
      } catch (_) {
        // Leave malformed or non-local links untouched; the production auth interceptor
        // remains the final same-origin return-path authority.
      }
    });
  }

  function normalize() {
    queued = false;
    if (!fullCustomerMode()) return;
    normalizeVisibleText(document);
    normalizeCustomerLinks(document);
    const chip = document.querySelector(".prototype-chip");
    if (chip && chip.textContent?.trim() !== "CUSTOMER APP") chip.textContent = "CUSTOMER APP";
    document.querySelector(".prototype-banner")?.remove();
  }

  function schedule() {
    if (queued || !fullCustomerMode()) return;
    queued = true;
    window.requestAnimationFrame(normalize);
  }

  window.addEventListener("hashchange", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("load", schedule);

  if (typeof MutationObserver === "function") {
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  window.__ffCustomerSurfaceNormalizationV1 = true;
  schedule();
})();
