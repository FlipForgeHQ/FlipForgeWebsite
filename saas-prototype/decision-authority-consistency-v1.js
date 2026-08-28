(() => {
  "use strict";

  const MAIN = "#main-content";
  const DECISIONS = new Set(["BUY", "WATCH", "VERIFY", "PASS"]);
  let queued = false;

  function opportunityDetailRoute() {
    return /^#\/opportunities\/[^/?#]+/.test(String(window.location.hash || ""));
  }

  function evidenceHref() {
    const match = String(window.location.hash || "").match(/^#\/opportunities\/([^/?#]+)/);
    if (!match) return "";
    let id = match[1];
    try { id = decodeURIComponent(id); } catch (_) { /* keep safe route token */ }
    return `#/evidence/${encodeURIComponent(id)}`;
  }

  function replaceWithEvidenceLink(node, href) {
    if (!node || !href) return;
    if (node.tagName === "A") {
      if (node.getAttribute("href") !== href) node.setAttribute("href", href);
      node.dataset.ffNativeEvidenceLink = "";
      return;
    }
    const link = document.createElement("a");
    link.className = node.className;
    link.href = href;
    link.textContent = node.textContent;
    link.dataset.ffNativeEvidenceLink = "";
    const ariaLabel = node.getAttribute("aria-label");
    const title = node.getAttribute("title");
    if (ariaLabel) link.setAttribute("aria-label", ariaLabel);
    if (title) link.setAttribute("title", title);
    node.replaceWith(link);
  }

  function syncEvidenceLinks(main) {
    const href = evidenceHref();
    if (!href || !main) return;

    main.querySelectorAll("[data-ff-show-why]").forEach(node => replaceWithEvidenceLink(node, href));

    const guide = document.getElementById("ff-guided-mode-root");
    guide?.querySelectorAll("[data-guide-action]").forEach(node => {
      const label = String(node.textContent || "").trim();
      if (/^(?:Show me why|Show me what is missing|I understand this decision)/i.test(label)) {
        replaceWithEvidenceLink(node, href);
      }
    });
  }

  function authoritativeDecision(main) {
    const hero = main?.querySelector(".customer-intelligence-hero");
    if (!hero) return "";
    const candidates = hero.querySelectorAll(".staging-status,[data-recommendation]");
    for (const node of candidates) {
      const value = String(node.textContent || "").trim().toUpperCase();
      if (DECISIONS.has(value)) return value;
    }
    return "";
  }

  function guideCopy(decision) {
    if (decision === "BUY") return {
      copy: "BUY is decision support only. Read the evidence and risk before acting outside FlipForge.",
      why: "Understand the reason before moving on."
    };
    if (decision === "WATCH") return {
      copy: "WATCH means the card may be worth monitoring, but the current price or evidence does not support moving further yet.",
      why: "Understand the reason before moving on."
    };
    if (decision === "PASS") return {
      copy: "PASS means the current evidence and context do not support the opportunity.",
      why: "Understand the reason before moving on."
    };
    return {
      copy: "VERIFY means FlipForge does not yet have enough trustworthy support for a stronger call.",
      why: "Find what is missing before doing anything else."
    };
  }

  function syncGuidedDecision(decision) {
    if (!decision) return;
    const guide = document.getElementById("ff-guided-mode-root");
    const panel = guide?.querySelector(".ff-guide-panel");
    if (!panel) return;
    const title = panel.querySelector(".ff-guide-body h2");
    const copyNode = panel.querySelector(".ff-guide-body > p");
    const whyNode = panel.querySelector(".ff-guide-why");
    const model = guideCopy(decision);

    panel.dataset.ffAuthoritativeDecision = decision;
    if (title && title.textContent !== `Start here: ${decision}.`) title.textContent = `Start here: ${decision}.`;
    if (copyNode && copyNode.textContent !== model.copy) copyNode.textContent = model.copy;
    if (whyNode) {
      const expected = `Why this matters: ${model.why}`;
      if (String(whyNode.textContent || "").trim() !== expected) {
        whyNode.innerHTML = "";
        const strong = document.createElement("strong");
        strong.textContent = "Why this matters:";
        whyNode.append(strong, document.createTextNode(` ${model.why}`));
      }
    }
  }

  function copyFor(decision, pageText) {
    if (decision === "BUY") return {
      title: "The evaluated price clears the current decision checks.",
      reason: "FlipForge found enough support for a BUY decision at the evaluated price.",
      next: "Review the exact evidence and risk before taking any action outside FlipForge."
    };
    if (decision === "WATCH") return {
      title: "This card is worth watching—not chasing.",
      reason: "The current price or evidence does not support moving further yet.",
      next: "Add it to Tracking and watch for a better price or stronger evidence."
    };
    if (decision === "PASS") return {
      title: "The current setup does not support this opportunity.",
      reason: "Price, evidence, risk, or a combination of those factors keeps this card below FlipForge's decision threshold.",
      next: "Read why, then move on or start another card."
    };
    const identity = /identity needs verification|mapping\s*(?:not confirmed|NOT_CONFIRMED)|provider UUID mapping remains unconfirmed/i.test(pageText);
    const evidence = /no accepted exact completed sales|0 accepted|no exact sales|evidence-supported value is unavailable/i.test(pageText);
    let reason = "FlipForge does not yet have enough trustworthy support for a stronger decision.";
    if (identity && evidence) reason = "The exact card identity still needs confirmation, and there is not enough exact completed-sale evidence yet.";
    else if (identity) reason = "The exact card identity still needs confirmation before FlipForge can support a stronger decision.";
    else if (evidence) reason = "There is not enough exact completed-sale evidence yet to support a value or stronger decision.";
    return {
      title: "This card needs verification before you act.",
      reason,
      next: "Review what is missing, then decide whether to verify the identity or wait for stronger sold evidence."
    };
  }

  function sync() {
    queued = false;
    if (!opportunityDetailRoute()) return;
    const main = document.querySelector(MAIN);
    if (!main) return;

    syncEvidenceLinks(main);

    const decision = authoritativeDecision(main);
    if (!decision) return;

    syncGuidedDecision(decision);

    const summary = main.querySelector("[data-ff-decision-summary]");
    if (!summary) return;

    const pill = summary.querySelector(".ff-decision-summary-pill");
    const title = summary.querySelector(".ff-decision-summary-main h2");
    const reason = summary.querySelector(".ff-decision-summary-main > p:not(.ff-decision-next)");
    const next = summary.querySelector(".ff-decision-next");
    const copy = copyFor(decision, String(main.textContent || ""));

    if (pill && pill.textContent !== decision) pill.textContent = decision;
    if (title && title.textContent !== copy.title) title.textContent = copy.title;
    if (reason && reason.textContent !== copy.reason) reason.textContent = copy.reason;
    if (next) {
      const expected = `What you should do next: ${copy.next}`;
      if (String(next.textContent || "").trim() !== expected) {
        next.innerHTML = "";
        const strong = document.createElement("strong");
        strong.textContent = "What you should do next:";
        next.append(strong, document.createTextNode(` ${copy.next}`));
      }
    }
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(sync);
  }

  window.addEventListener("hashchange", () => window.setTimeout(queue, 40));
  window.addEventListener("pageshow", queue);
  window.addEventListener("load", queue);
  if (document.body) new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true });
  queue();
})();
