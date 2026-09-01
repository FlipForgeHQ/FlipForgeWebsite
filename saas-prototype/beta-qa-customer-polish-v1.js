(() => {
  "use strict";

  const MAIN_SELECTOR = "#main-content";
  let scheduled = false;

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function setHtml(node, value) {
    if (node && node.innerHTML !== value) node.innerHTML = value;
  }

  function numberFromText(value) {
    const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function findSectionByHeading(root, heading) {
    return [...root.querySelectorAll("section, article")].find(section =>
      String(section.querySelector("h1,h2,h3")?.textContent || "").trim() === heading
    ) || null;
  }

  function replaceText(root, exact, replacement) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (String(node.nodeValue || "").includes(exact)) {
        node.nodeValue = String(node.nodeValue || "").replaceAll(exact, replacement);
      }
    }
  }

  function cleanDuplicateOptions(select) {
    if (!select || select.dataset.ffQaLabels === "true") return;
    const options = [...select.options];
    const totals = new Map();
    options.forEach(option => {
      const base = String(option.textContent || "").trim();
      totals.set(base, (totals.get(base) || 0) + 1);
    });
    const seen = new Map();
    options.forEach(option => {
      const base = String(option.textContent || "").trim();
      if ((totals.get(base) || 0) < 2) return;
      const ordinal = (seen.get(base) || 0) + 1;
      seen.set(base, ordinal);
      option.textContent = `${base} — saved record ${ordinal}`;
    });
    select.dataset.ffQaLabels = "true";
  }

  function friendlyTrackingState(value) {
    const normalized = String(value || "").trim().toUpperCase();
    const labels = {
      ACTIVE_WATCHLIST: "Watching",
      WATCHING: "Watching",
      PASSED: "Passed",
      PASS: "Passed",
      REVIEW: "Review scheduled",
      OWNED: "Owned",
      SOLD: "Sold",
      ARCHIVED: "Archived"
    };
    return labels[normalized] || String(value || "Unavailable").replaceAll("_", " ").toLowerCase().replace(/^./, char => char.toUpperCase());
  }

  function replaceKnownLimitations(details, items) {
    if (!details || details.dataset.ffQaClean === "true") return;
    details.innerHTML = `<summary>Important limits</summary><ul>${items.map(item => `<li>${item}</li>`).join("")}</ul>`;
    details.dataset.ffQaClean = "true";
  }

  function polishCompare(main) {
    if (routeName() !== "compare" || !main.querySelector("h1")) return;

    const boundary = main.querySelector(".boundary-note");
    if (boundary) {
      setHtml(boundary, "<strong>How this works:</strong> Compare reads saved records from your account through the same-origin gateway. It never uses mock records, accepts evidence, predicts a grade, reranks cards, or authorizes a transaction.");
    }

    cleanDuplicateOptions(main.querySelector("#compare-left"));
    cleanDuplicateOptions(main.querySelector("#compare-right"));

    const factorPanel = findSectionByHeading(main, "Saved factor comparison");
    if (factorPanel) {
      setText(factorPanel.querySelector(".panel-header p"), "Every value comes from your saved account records. No local score or winner is created.");
      setText(factorPanel.querySelector(".panel-header .staging-status"), "Saved records");
      const rows = [...factorPanel.querySelectorAll("tbody tr")];
      rows.forEach(row => {
        const cells = [...row.children];
        if (cells.length < 3) return;
        const label = String(cells[0].textContent || "").trim();
        if (label === "Saved decision") setText(cells[0], "Saved decision (at evaluation)");
        if (label === "Accepted completed sales") setText(cells[0], "Saved accepted sales (at evaluation)");
        if (label === "Mapping state") {
          setText(cells[0], "Catalog mapping");
          cells.slice(1).forEach(cell => {
            const value = String(cell.textContent || "").trim().toUpperCase();
            if (value === "NOT CONFIRMED" || value === "NOT_CONFIRMED" || value === "UNKNOWN") setText(cell, "Unavailable");
          });
        }
        if (label === "Workflow") {
          setText(cells[0], "Tracking state");
          cells.slice(1).forEach(cell => setText(cell, friendlyTrackingState(cell.textContent)));
        }
      });
    }

    const contract = main.querySelector(".customer-compare-contract");
    if (contract) {
      const first = contract.querySelector("div");
      if (first) {
        setText(first.querySelector("span"), "Decision source");
        setText(first.querySelector("strong"), "Saved Smart Opportunity record");
      }
    }

    const compareDetails = [...main.querySelectorAll("details")].find(details =>
      /known limitations/i.test(String(details.querySelector("summary")?.textContent || ""))
    );
    replaceKnownLimitations(compareDetails, [
      "Compare does not create a new BUY, WATCH, VERIFY, or PASS decision.",
      "Active listings are never treated as completed-sale evidence.",
      "Compare cannot buy, sell, bid, list, pay, or authorize a transaction."
    ]);
  }

  function polishPsa(main) {
    if (routeName() !== "psa-advisor") return;
    const details = [...main.querySelectorAll("details")].find(item =>
      /known limitations/i.test(String(item.querySelector("summary")?.textContent || ""))
    );
    if (details) details.remove();
  }

  function polishEvidence(main) {
    if (routeName() !== "evidence") return;

    const metrics = main.querySelector(".customer-management-metrics");
    if (metrics) {
      const acceptedMetric = [...metrics.querySelectorAll("article")].find(article =>
        /accepted exact sales/i.test(String(article.querySelector("span")?.textContent || ""))
      );
      if (acceptedMetric) setText(acceptedMetric.querySelector("span"), "Current eligible exact sales");
    }

    const linked = findSectionByHeading(main, "Linked evidence");
    if (linked) {
      setText(linked.querySelector(".panel-header p"), "Only rows that pass the current exact-card, completed-sale, and acceptance rules can support value. Older or mismatched rows remain visible for audit history.");
      [...linked.querySelectorAll("tbody tr")].forEach(row => {
        const cells = [...row.children];
        if (cells.length < 5) return;
        const eligible = /eligible/i.test(String(cells[4].textContent || "")) && !/ineligible/i.test(String(cells[4].textContent || ""));
        if (eligible) {
          setHtml(cells[3], '<span class="staging-status staging-status-buy">Current exact comp</span>');
        } else {
          setHtml(cells[3], '<span class="staging-status staging-status-pass">Not a current exact comp</span>');
          cells[3].title = "This row is retained for audit history but does not pass the current exact-comparable rules.";
          cells[4].title = "Visible for audit history; excluded from current value authority.";
        }
      });
    }

    const candidates = findSectionByHeading(main, "Manual evidence candidates");
    if (candidates) {
      setText(candidates.querySelector(".panel-header p"), "Candidates are review inputs only. Candidate match signals are not evidence authority and cannot support value until the current evidence rules accept them.");
      const headers = [...candidates.querySelectorAll("thead th")];
      if (headers[3]) setText(headers[3], "Authority review");
      [...candidates.querySelectorAll("tbody tr")].forEach(row => {
        const cells = [...row.children];
        if (cells.length < 5) return;
        const state = String(cells[4].textContent || "").trim();
        setText(cells[3], /candidate only/i.test(state) ? "Not authority-verified" : "See linked evidence above");
      });
    }

    if (metrics && !main.querySelector("[data-ff-evidence-history-note]")) {
      const note = document.createElement("div");
      note.className = "boundary-note";
      note.dataset.ffEvidenceHistoryNote = "true";
      note.innerHTML = "<strong>Saved vs current evidence:</strong> A saved decision preserves the evidence set that existed when it was created. This page applies today’s exact-comparable eligibility rules. If the counts differ, re-evaluate the card before treating the old saved decision as current.";
      metrics.insertAdjacentElement("afterend", note);
    }
  }

  function polishDecisionIntelligence(main) {
    if (routeName() !== "decision-intelligence") return;
    const meta = main.querySelector(".ff-di-state-meta");
    const metaSpans = meta ? [...meta.querySelectorAll("span")] : [];
    const savedEvidence = metaSpans[1] ? numberFromText(metaSpans[1].textContent) : null;
    if (metaSpans[1] && savedEvidence !== null) setText(metaSpans[1], `${savedEvidence} saved at evaluation`);

    main.querySelectorAll(".ff-di-compare-metrics > div").forEach(metric => {
      const label = metric.querySelector("span");
      if (String(label?.textContent || "").trim() === "Evidence") setText(label, "Saved evidence");
    });

    const evidenceCard = main.querySelector(".ff-di-card-evidence");
    if (!evidenceCard || savedEvidence === null) return;
    const evidenceItems = [...evidenceCard.querySelectorAll(".ff-di-evidence-item")];
    const currentItem = evidenceItems.find(item => /accepted exact completed sales/i.test(String(item.querySelector("span")?.textContent || "")));
    const currentEvidence = currentItem ? numberFromText(currentItem.querySelector("strong")?.textContent) : null;
    const priorWarning = evidenceCard.querySelector("[data-ff-evidence-drift]");
    if (currentEvidence === null || currentEvidence === savedEvidence) {
      priorWarning?.remove();
      return;
    }
    if (!priorWarning) {
      const warning = document.createElement("div");
      warning.className = "boundary-note";
      warning.dataset.ffEvidenceDrift = "true";
      evidenceCard.appendChild(warning);
    }
    const warning = evidenceCard.querySelector("[data-ff-evidence-drift]");
    const decision = String(main.querySelector(".ff-di-state-top strong")?.textContent || "saved decision").trim();
    setHtml(warning, `<strong>Evidence changed since this decision was saved:</strong> This ${decision} record preserved ${savedEvidence} accepted sales at evaluation; ${currentEvidence} currently pass the exact-comparable rules. The old decision is retained for audit history. Re-evaluate before relying on it as a current decision.`);
  }

  function polishExitReview(main) {
    if (routeName() !== "sell") return;
    replaceText(main, "NOT_CONFIRMED mapping state returned by the service.", "Provider catalog mapping is unavailable for this saved record. Evidence eligibility is governed separately by the exact-card rules.");
    const exactIdentity = [...main.querySelectorAll("strong")].find(node => String(node.textContent || "").trim() === "Exact identity");
    if (exactIdentity) setText(exactIdentity, "Catalog mapping");
  }

  function polishPortfolio(main) {
    if (routeName() !== "portfolio") return;
    replaceText(main, "REFERENCE_VALUE_UNAVAILABLE", "Reference unavailable");
  }

  function polishCardIntelligence(main) {
    if (routeName() !== "opportunities") return;
    replaceText(main, "CardSight catalog link pending", "Provider catalog reference unavailable");
  }

  function apply() {
    scheduled = false;
    const main = document.querySelector(MAIN_SELECTOR);
    if (!main) return;
    polishCompare(main);
    polishPsa(main);
    polishEvidence(main);
    polishDecisionIntelligence(main);
    polishExitReview(main);
    polishPortfolio(main);
    polishCardIntelligence(main);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(apply);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule, { once: true });
  else schedule();
  window.addEventListener("hashchange", schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
