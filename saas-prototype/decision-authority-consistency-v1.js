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

  function trackingDetailRoute() {
    return /^#\/tracking\/[^/?#]+/.test(String(window.location.hash || ""));
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
      copy: "VERIFY means FlipForge does not yet have enough matching evidence for a stronger call.",
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
    // A legacy result (saved before current evidence rules) keeps its saved recommendation as historical and never
    // gets current-support copy. Marked by customer-trust-display-v1.js from the server's evidenceProvenanceStatus.
    if (document.querySelector("#main-content [data-ff-legacy-result]")) return {
      title: "Saved before current evidence rules.",
      reason: `Saved recommendation: ${decision}. It is not presented as currently supported.`,
      next: "Evaluate the card again for a result under current evidence rules."
    };
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
    let reason = "FlipForge does not yet have enough matching evidence for a stronger decision.";
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

  // Evidence tables omit the price and date columns when the API withholds them, so columns are found by heading.
  function columnIndex(table, names, fallback) {
    const headers = [...table.querySelectorAll("thead th")].map(th => String(th.textContent || "").trim());
    const found = headers.findIndex(label => names.includes(label));
    return found >= 0 ? found : (headers.length === 5 ? fallback : -1);
  }

  function setCellLabel(cell, from, to) {
    if (!cell) return;
    const text = String(cell.textContent || "").trim();
    if (text === from) cell.textContent = to;
  }

  function sectionByHeading(page, pattern) {
    return [...page.querySelectorAll("section.panel")].find(section =>
      pattern.test(String(section.querySelector("h2")?.textContent || ""))) || null;
  }

  function makeDisclosure(section, summaryLabel) {
    if (!section || section.dataset.ffEvidenceDisclosure === "true") return;
    const body = section.querySelector(".panel-body");
    if (!body) return;
    const details = document.createElement("details");
    details.className = "ff-evidence-disclosure";
    const summary = document.createElement("summary");
    summary.textContent = summaryLabel;
    const content = document.createElement("div");
    content.className = "ff-evidence-disclosure-content";
    while (body.firstChild) content.append(body.firstChild);
    details.append(summary, content);
    body.append(details);
    section.dataset.ffEvidenceDisclosure = "true";
  }

  function selectedCardLabel(page) {
    const select = page.querySelector("[data-customer-management-select]");
    const selected = select?.selectedOptions?.[0];
    return String(selected?.textContent || "").trim();
  }

  function addMetricContext(article, copy) {
    if (!article || article.querySelector(".ff-evidence-metric-copy")) return;
    const small = document.createElement("small");
    small.className = "ff-evidence-metric-copy";
    small.textContent = copy;
    article.append(small);
  }

  function syncEvidenceSemantics(main) {
    if (!main || !evidenceDetailRoute()) return;
    const page = main.querySelector(".customer-management-page");
    if (!page) return;

    const linkedSection = sectionByHeading(page, /Linked evidence|What FlipForge (?:trusted|counted)/i);
    const candidateSection = sectionByHeading(page, /Manual evidence candidates|Saved evidence candidate pool|What FlipForge reviewed/i);

    const linkedTable = linkedSection?.querySelector("table");
    if (linkedTable) {
      const headers = linkedTable.querySelectorAll("thead th");
      const identityAt = columnIndex(linkedTable, ["Identity", "Identity key"], 3);
      const authorityAt = columnIndex(linkedTable, ["Authority", "Current authority"], 4);
      if (headers[identityAt] && headers[identityAt].textContent !== "Identity key") headers[identityAt].textContent = "Identity key";
      if (headers[authorityAt] && headers[authorityAt].textContent !== "Current authority") headers[authorityAt].textContent = "Current authority";
      linkedTable.querySelectorAll("tbody tr").forEach(row => {
        const cells = row.querySelectorAll("td");
        setCellLabel(cells[identityAt], "Exact match", "Identity key match");
        setCellLabel(cells[identityAt], "Mismatch", "Identity key differs");
        setCellLabel(cells[authorityAt], "Eligible", "Current eligible");
        setCellLabel(cells[authorityAt], "Ineligible", "Not counted now");
      });
    }

    if (candidateSection) {
      const heading = candidateSection.querySelector("h2");
      const copy = candidateSection.querySelector(".panel-header p");
      if (heading && heading.textContent !== "What FlipForge reviewed but did not use") {
        heading.textContent = "What FlipForge reviewed but did not use";
      }
      const expectedCopy = "Candidate rows stay visible for transparency. Stored source confidence is not current exact-comparable authority, and candidate-only rows do not support value.";
      if (copy && copy.textContent !== expectedCopy) copy.textContent = expectedCopy;
      const table = candidateSection.querySelector("table");
      if (table) {
        const headers = table.querySelectorAll("thead th");
        const confidenceAt = columnIndex(table, ["Match confidence", "Stored source confidence"], 3);
        const stateAt = columnIndex(table, ["State", "Link state"], 4);
        if (headers[confidenceAt] && headers[confidenceAt].textContent !== "Stored source confidence") headers[confidenceAt].textContent = "Stored source confidence";
        if (headers[stateAt] && headers[stateAt].textContent !== "Link state") headers[stateAt].textContent = "Link state";
        table.querySelectorAll("tbody tr").forEach(row => {
          const cells = row.querySelectorAll("td");
          setCellLabel(cells[stateAt], "Linked", "Historically linked");
        });
      }
    }
  }

  function syncEvidenceExperience(main) {
    if (!main || !evidenceDetailRoute()) return;
    const page = main.querySelector(".customer-management-page");
    if (!page || page.dataset.ffEvidenceExperience === "v2") return;

    const accepted = metricValue(main, "Accepted exact sales");
    const ineligible = metricValue(main, "Not counted now") ?? metricValue(main, "Visible but ineligible");
    const ledgerEvents = metricValue(main, "Ledger events");
    const candidates = metricValue(main, "Manual candidates");
    if (accepted === null || ineligible === null) return;

    const possibleLinked = accepted + ineligible;
    const cardLabel = selectedCardLabel(page);
    const heading = page.querySelector(".page-heading");
    const eyebrow = heading?.querySelector(".eyebrow");
    const h1 = heading?.querySelector("h1");
    const intro = heading?.querySelector("p");
    if (eyebrow) eyebrow.textContent = "Evidence behind this decision";
    // A legacy result is not presented as currently supported (customer-trust-display-v1.js marks it).
    const legacy = Boolean(page.querySelector("[data-ff-legacy-result]"));
    // "Trusts" only when counted sales actually back the decision; with none, say so plainly.
    if (h1) h1.textContent = legacy ? "Evidence behind this saved decision" : accepted > 0 ? "Why FlipForge trusts this decision" : "No sales support this decision yet";
    if (intro) {
      intro.textContent = cardLabel
        ? `See what FlipForge counts now, what it did not count and why, and what remains audit-only for ${cardLabel}.`
        : "See what FlipForge counts now, what it did not count and why, and what remains audit-only for this saved decision.";
    }

    const boundary = page.querySelector(".boundary-note");
    if (boundary) {
      boundary.classList.add("ff-evidence-readonly-note");
      boundary.innerHTML = "<strong>Evidence is read-only.</strong> This page explains the evidence behind the saved decision. It cannot change the decision, promote an active listing into a completed sale, or give browser-side evidence authority.";
    }

    const selectorPanel = page.querySelector(".customer-management-select-panel");
    selectorPanel?.classList.add("ff-evidence-selector-panel");

    const metrics = page.querySelector(".customer-management-metrics");
    const metricArticles = metrics ? [...metrics.querySelectorAll("article")] : [];
    if (metricArticles[0]) {
      metricArticles[0].querySelector("span").textContent = "Matched sales";
      metricArticles[0].dataset.tone = "trusted";
      addMetricContext(metricArticles[0], "Exact completed sales currently allowed to support value.");
    }
    if (metricArticles[1]) {
      metricArticles[1].querySelector("span").textContent = "Not counted now";
      metricArticles[1].dataset.tone = "excluded";
      addMetricContext(metricArticles[1], "Visible for transparency. Includes excluded, held-for-review and not-used rows; see the breakdown below.");
    }
    if (metricArticles[2]) {
      metricArticles[2].querySelector("span").textContent = "Audit events";
      addMetricContext(metricArticles[2], "Immutable history of evidence activity.");
    }
    if (metricArticles[3]) {
      metricArticles[3].querySelector("span").textContent = "Candidate pool";
      addMetricContext(metricArticles[3], "Rows reviewed or retained without current evidence authority.");
    }

    const proof = document.createElement("section");
    proof.className = "ff-evidence-proof-hero";
    proof.dataset.ffEvidenceProof = "";
    proof.innerHTML = `
      <div class="ff-evidence-proof-copy">
        <span class="ff-evidence-kicker">THE PROOF</span>
        <h2>${legacy ? "Saved before current evidence rules. This result is not presented as currently supported." : accepted > 0 ? `${accepted} exact completed sale${accepted === 1 ? "" : "s"} currently support${accepted === 1 ? "s" : ""} this card.` : "No exact completed sales support this card yet."}</h2>
        <p>${ineligible > 0 ? `FlipForge did not treat every historical row as a comp. It kept <strong>${ineligible}</strong> linked row${ineligible === 1 ? "" : "s"} visible for auditability that ${ineligible === 1 ? "is" : "are"} not counted now. Only rows marked Excluded were checked and failed a rule.` : accepted > 0 ? "Every linked sale for this card is counted; none was set aside." : "No sales are linked to this card yet, so there is nothing to count or set aside. FlipForge will not fill the gap with asking prices or loosely matched sales."}</p>
        <div class="ff-evidence-principle"><strong>More data is not automatically better evidence.</strong><span>FlipForge is designed to show its work—and to show what it refused to use.</span></div>
      </div>
      <div class="ff-evidence-funnel" aria-label="Evidence qualification summary">
        <article>
          <span>Possible linked history</span>
          <strong>${possibleLinked}</strong>
          <small>Visible historical rows</small>
        </article>
        <span class="ff-evidence-funnel-arrow" aria-hidden="true">→</span>
        <article data-tone="trusted">
          <span>Counted now</span>
          <strong>${accepted}</strong>
          <small>Current exact completed sales</small>
        </article>
        <span class="ff-evidence-funnel-arrow" aria-hidden="true">+</span>
        <article data-tone="excluded">
          <span>Not counted now</span>
          <strong>${ineligible}</strong>
          <small>Excluded, held or not used</small>
        </article>
      </div>`;
    if (selectorPanel) selectorPanel.insertAdjacentElement("afterend", proof);
    else if (heading) heading.insertAdjacentElement("afterend", proof);

    const linkedSection = sectionByHeading(page, /Linked evidence|What FlipForge (?:trusted|counted)/i);
    const candidateSection = sectionByHeading(page, /What FlipForge reviewed but did not use|Saved evidence candidate pool|Manual evidence candidates/i);
    const historySection = sectionByHeading(page, /Evidence history|Full audit trail/i);

    if (linkedSection) {
      const linkedHeading = linkedSection.querySelector("h2");
      const linkedCopy = linkedSection.querySelector(".panel-header p");
      if (linkedHeading) linkedHeading.textContent = "What FlipForge counted";
      if (linkedCopy) linkedCopy.textContent = legacy
        ? `${accepted} linked completed sale${accepted === 1 ? " is" : "s are"} listed for this saved decision. It was saved before current evidence rules and is not presented as currently supported.`
        : `${accepted} linked completed sale${accepted === 1 ? "" : "s"} currently satisfy the exact-comparable rules required to support this saved decision.`;
      linkedSection.classList.add("ff-evidence-trusted-section");
    }

    if (historySection) {
      const historyHeading = historySection.querySelector("h2");
      const historyCopy = historySection.querySelector(".panel-header p");
      if (historyHeading) historyHeading.textContent = "Full audit trail";
      if (historyCopy) historyCopy.textContent = "Immutable evidence events remain available when you want the forensic history.";
    }

    const grid = page.querySelector(".customer-management-grid");
    const stack = grid?.querySelector(".stack");
    if (grid) grid.classList.add("ff-evidence-content-grid");
    if (stack && historySection && historySection.parentElement !== stack) stack.append(historySection);

    makeDisclosure(candidateSection, `Review candidate pool${candidates !== null ? ` (${candidates})` : ""}`);
    makeDisclosure(historySection, `View full audit trail${ledgerEvents !== null ? ` (${ledgerEvents} events)` : ""}`);

    const continuePanel = document.createElement("section");
    continuePanel.className = "ff-evidence-next-step";
    continuePanel.innerHTML = `
      <div>
        <span class="ff-evidence-kicker">NEXT</span>
        <h2>You know why. Now decide what to do with it.</h2>
        <p>Continue to the exact saved card's Tracking record to set review timing or record what happens next. Tracking cannot change this evidence or the saved Smart Opportunity decision.</p>
      </div>
      <a class="button button-primary" data-ff-evidence-understood href="#/tracking/${encodeURIComponent(routeId("evidence"))}">Continue to Tracking →</a>`;
    const partialError = page.querySelector(".staging-error");
    if (partialError) partialError.insertAdjacentElement("beforebegin", continuePanel);
    else page.append(continuePanel);

    page.dataset.ffEvidenceExperience = "v2";
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
    if (title && title.textContent !== "See what FlipForge counted—and what it refused to use.") {
      title.textContent = "See what FlipForge counted—and what it refused to use.";
    }
    const copy = "Start with the counted-vs-not-counted summary. Open the candidate pool or full audit trail only if you want deeper forensic detail.";
    if (copyNode && copyNode.textContent !== copy) copyNode.textContent = copy;
    if (whyNode) {
      const expected = "Why this matters: A decision is more trustworthy when you can inspect both the evidence and the exclusions.";
      if (String(whyNode.textContent || "").trim() !== expected) {
        whyNode.innerHTML = "<strong>Why this matters:</strong> A decision is more trustworthy when you can inspect both the evidence and the exclusions.";
      }
    }
    if (actions) {
      actions.innerHTML = `<a class="ff-guide-action" data-ff-evidence-understood href="#/tracking/${encodeURIComponent(id)}">Continue to Tracking →</a><a class="ff-guide-action secondary" href="#/opportunities/${encodeURIComponent(id)}">Back to Card Intelligence</a>`;
    }
  }

  function ensureTrackingOwnership(main) {
    if (!main || !trackingDetailRoute()) return;
    const id = routeId("tracking");
    if (!id || main.querySelector(".customer-lifecycle-page")) return;
    const adapter = window.FlipForgeCustomerLifecycle;
    if (!adapter
        || typeof adapter.isEligible !== "function"
        || !adapter.isEligible()
        || typeof adapter.render !== "function") return;
    adapter.render(main, "tracking", id);
  }

  function normalizeLockedTagline(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (String(node.nodeValue || "").trim() === "Before you buy. Know why.") {
        node.nodeValue = node.nodeValue.replace("Know why.", "Know Why.");
      }
    });
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

    normalizeLockedTagline(main);

    if (opportunityDetailRoute()) {
      syncOpportunity(main);
      return;
    }
    if (evidenceDetailRoute()) {
      syncEvidenceSemantics(main);
      syncEvidenceExperience(main);
      syncGuidedEvidence();
      return;
    }
    if (trackingDetailRoute()) {
      ensureTrackingOwnership(main);
    }
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(sync);
  }

  document.addEventListener("click", event => {
    const link = event.target.closest?.("[data-ff-evidence-understood]");
    if (!link) return;
    window.setTimeout(() => {
      const main = document.querySelector(MAIN);
      ensureTrackingOwnership(main);
    }, 75);
  }, true);

  window.addEventListener("hashchange", () => window.setTimeout(queue, 40));
  window.addEventListener("pageshow", queue);
  window.addEventListener("load", queue);
  if (document.body) new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true });
  queue();
})();
