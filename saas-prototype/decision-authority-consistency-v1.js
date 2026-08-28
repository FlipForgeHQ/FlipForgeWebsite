(() => {
  "use strict";

  const MAIN = "#main-content";
  const DECISIONS = new Set(["BUY", "WATCH", "VERIFY", "PASS"]);
  let queued = false;

  function opportunityDetailRoute() {
    return /^#\/opportunities\/[^/?#]+/.test(String(window.location.hash || ""));
  }

  function evidenceDetailRoute() {
    return /^#\/evidence\/[^/?#]+/.test(String(window.location.hash || ""));
  }

  function routeId(route) {
    const match = String(window.location.hash || "").match(new RegExp(`^#/${route}/([^/?#]+)`));
    if (!match) return "";
    try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
  }

  function evidenceHref() {
    const id = routeId("opportunities");
    return id ? `#/evidence/${encodeURIComponent(id)}` : "";
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

  function metricValue(main, label) {
    for (const article of main?.querySelectorAll?.(".customer-management-metrics article") || []) {
      const span = article.querySelector("span");
      if (String(span?.textContent || "").trim() !== label) continue;
      const value = Number.parseInt(String(article.querySelector("strong")?.textContent || ""), 10);
      return Number.isFinite(value) ? value : null;
    }
    return null;
  }

  function setCellLabel(cell, from, to) {
    if (!cell) return;
    const text = String(cell.textContent || "").trim();
    if (text === from) cell.textContent = to;
  }

  function syncEvidenceSemantics(main) {
    if (!main || !evidenceDetailRoute()) return;
    const page = main.querySelector(".customer-management-page");
    if (!page) return;

    const accepted = metricValue(main, "Accepted exact sales");
    const ineligible = metricValue(main, "Visible but ineligible");
    if (accepted !== null && ineligible !== null && !page.querySelector("[data-ff-evidence-current-history]")) {
      const note = document.createElement("section");
      note.className = "panel";
      note.dataset.ffEvidenceCurrentHistory = "";
      note.innerHTML = `<div class="panel-body"><strong>Current eligibility vs. historical ledger</strong><p><strong>${accepted}</strong> linked completed sales currently satisfy FlipForge's exact-comparable authority rules. <strong>${ineligible}</strong> linked rows remain visible for audit history but are currently ineligible. Historical ledger events preserve what happened at the time; they do not restore authority to a row that fails today's rules.</p></div>`;
      const metrics = page.querySelector(".customer-management-metrics");
      metrics?.insertAdjacentElement("afterend", note);
    }

    const sections = [...page.querySelectorAll("section.panel")];
    const linkedSection = sections.find(section => /Linked evidence/i.test(String(section.querySelector("h2")?.textContent || "")));
    const candidateSection = sections.find(section => /Manual evidence candidates|Saved evidence candidate pool/i.test(String(section.querySelector("h2")?.textContent || "")));

    const linkedTable = linkedSection?.querySelector("table");
    if (linkedTable) {
      const headers = linkedTable.querySelectorAll("thead th");
      if (headers[3] && headers[3].textContent !== "Identity key") headers[3].textContent = "Identity key";
      if (headers[4] && headers[4].textContent !== "Current authority") headers[4].textContent = "Current authority";
      linkedTable.querySelectorAll("tbody tr").forEach(row => {
        const cells = row.querySelectorAll("td");
        setCellLabel(cells[3], "Exact match", "Identity key match");
        setCellLabel(cells[3], "Mismatch", "Identity key differs");
        setCellLabel(cells[4], "Eligible", "Current eligible");
        setCellLabel(cells[4], "Ineligible", "Currently ineligible");
      });
    }

    if (candidateSection) {
      const heading = candidateSection.querySelector("h2");
      const copy = candidateSection.querySelector(".panel-header p");
      if (heading && heading.textContent !== "Saved evidence candidate pool") heading.textContent = "Saved evidence candidate pool";
      const expectedCopy = "This pool includes historically linked rows and unlinked candidates. Stored source confidence is not current exact-comparable authority; only current authority-eligible exact completed sales support value.";
      if (copy && copy.textContent !== expectedCopy) copy.textContent = expectedCopy;
      const table = candidateSection.querySelector("table");
      if (table) {
        const headers = table.querySelectorAll("thead th");
        if (headers[3] && headers[3].textContent !== "Stored source confidence") headers[3].textContent = "Stored source confidence";
        if (headers[4] && headers[4].textContent !== "Link state") headers[4].textContent = "Link state";
        table.querySelectorAll("tbody tr").forEach(row => {
          const cells = row.querySelectorAll("td");
          setCellLabel(cells[4], "Linked", "Historically linked");
        });
      }
    }
  }

  function syncGuidedEvidence() {
    if (!evidenceDetailRoute()) return;
    const id = routeId("evidence");
    if (!id) return;
    const guide = document.getElementById("ff-guided-mode-root");
    const panel = guide?.querySelector(".ff-guide-panel");
    if (!panel) return;

    const location = panel.querySelector(".ff-guide-location");
    const title = panel.querySelector(".ff-guide-body h2");
    const copyNode = panel.querySelector(".ff-guide-body > p");
    const whyNode = panel.querySelector(".ff-guide-why");
    const actions = panel.querySelector(".ff-guide-actions");

    panel.dataset.ffGuideEvidenceStep = id;
    if (location && location.textContent !== "Evidence · Step 3") location.textContent = "Evidence · Step 3";
    if (title && title.textContent !== "This is why FlipForge reached the decision.") title.textContent = "This is why FlipForge reached the decision.";
    const copy = "Review the current authority-eligible sales and the rows FlipForge excludes. Historical evidence stays visible for auditability without changing the saved decision.";
    if (copyNode && copyNode.textContent !== copy) copyNode.textContent = copy;
    if (whyNode) {
      const expected = "Why this matters: Evidence explains the decision without changing it.";
      if (String(whyNode.textContent || "").trim() !== expected) {
        whyNode.innerHTML = "<strong>Why this matters:</strong> Evidence explains the decision without changing it.";
      }
    }
    if (actions && !actions.querySelector("[data-ff-evidence-understood]")) {
      actions.innerHTML = `<a class="ff-guide-action" data-ff-evidence-understood href="#/tracking/${encodeURIComponent(id)}">I understand the evidence →</a><a class="ff-guide-action secondary" href="#/opportunities/${encodeURIComponent(id)}">Back to Card Intelligence</a>`;
    }
  }

  function syncOpportunity(main) {
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

  function sync() {
    queued = false;
    const main = document.querySelector(MAIN);
    if (!main) return;

    if (opportunityDetailRoute()) {
      syncOpportunity(main);
      return;
    }
    if (evidenceDetailRoute()) {
      syncEvidenceSemantics(main);
      syncGuidedEvidence();
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
