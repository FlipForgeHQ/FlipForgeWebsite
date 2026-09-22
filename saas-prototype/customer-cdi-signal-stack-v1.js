(() => {
  "use strict";

  if (window.FlipForgeCustomerCdiSignalStackV1) return;

  const STAGGER_MS = 340;
  const VERDICTS = Object.freeze({
    BUY: {
      title: "Buy looks supported",
      reason: "The saved evidence and price support the current BUY decision."
    },
    WATCH: {
      title: "Watch this one",
      reason: "The evidence is usable, but price or risk is not strong enough for a BUY decision yet."
    },
    VERIFY: {
      title: "Verify before acting",
      reason: "There are not enough trustworthy sales to support a stronger call yet."
    },
    PASS: {
      title: "Pass at this price",
      reason: "The current asking price is not supported strongly enough by the saved evidence."
    },
    UNKNOWN: {
      title: "Decision unavailable",
      reason: "Open the saved record after FlipForge returns a customer-facing decision."
    }
  });

  const state = {
    queued: false,
    running: new WeakSet()
  };

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean);
  }

  function text(node) {
    return String(node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function decisionValue(root, mode) {
    const raw = mode === "decision-intelligence"
      ? text(root.querySelector(".ff-di-v2-decision"))
      : text(root.querySelector(".customer-intelligence-hero .staging-status"));
    const decision = raw.toUpperCase();
    return Object.prototype.hasOwnProperty.call(VERDICTS, decision) ? decision : "UNKNOWN";
  }

  function labeledStrong(scope, selector, label) {
    const target = String(label || "").toLowerCase();
    const row = [...scope.querySelectorAll(selector)]
      .find(node => text(node.querySelector("span")).toLowerCase() === target);
    return row ? text(row.querySelector("strong")) : "";
  }

  function traceValue(root, prefix) {
    const row = [...root.querySelectorAll(".customer-trace-step")]
      .find(node => text(node.querySelector("span")).toLowerCase().startsWith(prefix.toLowerCase()));
    return row ? text(row.querySelector("strong")) : "";
  }

  function savedPrice(root) {
    const values = [...root.querySelectorAll(".customer-value-summary > strong")].map(text);
    const ask = values[0] || "Unavailable";
    const supported = values[1] || "Unavailable";
    return {
      value: supported,
      detail: "Ask " + ask + " · Supported " + supported
    };
  }

  function decisionIntelligenceSignals(root) {
    const command = root.querySelector("[data-ff-di-v2-command]");
    if (!command) return null;

    const exact = labeledStrong(command, ".ff-di-v2-gate", "Exact identity") || "Review needed";
    const sales = labeledStrong(command, ".ff-di-v2-gate", "Trusted completed sales") || "Unavailable";
    const support = labeledStrong(command, ".ff-di-v2-verdict-metrics > div", "Supported value") || "Unavailable";
    const confidence = labeledStrong(command, ".ff-di-v2-verdict-metrics > div", "Confidence") || "Unavailable";
    const risk = labeledStrong(command, ".ff-di-v2-verdict-metrics > div", "Risk") || "Unavailable";
    const reason = text(command.querySelector(".ff-di-v2-verdict-main p"));
    const identity = text(command.querySelector(".ff-di-v2-verdict-main h2")) || "Saved card";
    const evidenceHref = command.querySelector(".ff-di-v2-evidence-link")?.getAttribute("href") || "#/evidence";

    return {
      command,
      identity,
      reason,
      evidenceHref,
      signals: [
        { key: "exact", label: "Exact card", value: exact, caption: "Confirm the year, set, number, variant, and grade." },
        { key: "sales", label: "Trustworthy sales", value: sales, caption: "Use only completed sales that match the exact card." },
        { key: "price", label: "Price check", value: support, caption: "Compare the listing price with the value supported by accepted evidence." },
        { key: "uncertainty", label: "Uncertainty", value: confidence + " confidence · " + risk + " risk", caption: "Keep uncertainty visible instead of turning thin evidence into false precision." }
      ]
    };
  }

  function savedDecisionSignals(root) {
    const hero = root.querySelector(".customer-intelligence-hero");
    if (!hero) return null;

    const identity = text(hero.querySelector(".customer-hero-title h2")) || "Saved card";
    const exact = traceValue(root, "1 ·") || "Review saved identity";
    const sales = traceValue(root, "2 ·") || "Review saved sales";
    const price = savedPrice(root);
    const confidence = labeledStrong(root, ".customer-intelligence-metrics article", "Confidence") || "Unavailable";
    const risk = labeledStrong(root, ".customer-intelligence-metrics article", "Decision risk")
      || labeledStrong(root, ".customer-intelligence-metrics article", "Risk")
      || "Unavailable";

    return {
      command: root,
      identity,
      reason: text(root.querySelector(".ff-decision-meaning")),
      evidenceHref: "#/evidence/" + encodeURIComponent(routeParts()[1] || ""),
      signals: [
        { key: "exact", label: "Exact card", value: exact, caption: "Confirm the saved card identity before relying on any comparison." },
        { key: "sales", label: "Trustworthy sales", value: sales, caption: "See how many exact completed sales were allowed to support the decision." },
        { key: "price", label: "Price check", value: price.value, caption: price.detail },
        { key: "uncertainty", label: "Uncertainty", value: confidence + " confidence · " + risk + " risk", caption: "Use the saved confidence and risk together, not as a guarantee." }
      ]
    };
  }

  function signalVisual(key) {
    if (key === "exact") {
      return '<span class="ff-cdi-visual ff-cdi-visual-exact" aria-hidden="true"><i></i><i></i><i></i></span>';
    }
    if (key === "sales") {
      return '<span class="ff-cdi-visual ff-cdi-visual-sales" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';
    }
    if (key === "price") {
      return '<span class="ff-cdi-visual ff-cdi-visual-price" aria-hidden="true"><i></i><i></i><b></b></span>';
    }
    return '<span class="ff-cdi-visual ff-cdi-visual-uncertainty" aria-hidden="true"><i></i><b></b></span>';
  }

  function signalMarkup(signal, index) {
    return '<article class="ff-cdi-signal" data-ff-cdi-signal="' + escapeHtml(signal.key) + '" data-step="' + String(index + 1) + '">' +
      '<div class="ff-cdi-signal-index">0' + String(index + 1) + '</div>' +
      signalVisual(signal.key) +
      '<div class="ff-cdi-signal-copy"><span>' + escapeHtml(signal.label) + '</span><strong>' + escapeHtml(signal.value) + '</strong><small>' + escapeHtml(signal.caption) + '</small></div>' +
      '<span class="ff-cdi-signal-state" aria-hidden="true">✓</span>' +
      '</article>';
  }

  function stackMarkup(decision, model) {
    const verdict = VERDICTS[decision] || VERDICTS.UNKNOWN;
    const reason = model.reason || verdict.reason;
    return '<section class="ff-cdi-stack" data-ff-cdi-stack data-decision="' + escapeHtml(decision) + '">' +
      '<header class="ff-cdi-verdict">' +
        '<div class="ff-cdi-verdict-copy">' +
          '<span class="ff-cdi-kicker">CARD DECISION INTELLIGENCE</span>' +
          '<h2>' + escapeHtml(verdict.title) + '</h2>' +
          '<p>' + escapeHtml(reason) + '</p>' +
          '<div class="ff-cdi-meta"><span>' + escapeHtml(decision) + '</span><span>Decision engine · Smart Opportunity</span></div>' +
        '</div>' +
        '<div class="ff-cdi-card-id"><span>Exact card</span><strong>' + escapeHtml(model.identity) + '</strong></div>' +
      '</header>' +
      '<div class="ff-cdi-start">' +
        '<button class="ff-cdi-start-button" type="button" data-ff-cdi-start><span>START HERE</span><strong>Show me why FlipForge said ' + escapeHtml(decision) + '</strong></button>' +
        '<small>Watch the 4 checks assemble · about 3 seconds</small>' +
      '</div>' +
      '<div class="ff-cdi-caption" role="status" aria-live="polite">Start with the decision. Open the four checks when you want the reason trail.</div>' +
      '<div class="ff-cdi-signals" aria-label="Four checks behind this decision">' +
        model.signals.map(signalMarkup).join("") +
      '</div>' +
      '<div class="ff-cdi-after" data-ff-cdi-after hidden>' +
        '<a class="ff-cdi-secondary" href="' + escapeHtml(model.evidenceHref) + '">Open full evidence</a>' +
        '<button class="ff-cdi-secondary" type="button" data-ff-cdi-receipt>Open Decision Receipt</button>' +
        '<button class="ff-cdi-replay" type="button" data-ff-cdi-replay>Replay the 4 checks</button>' +
      '</div>' +
    '</section>';
  }

  function ensureDeepDisclosure(root, mode) {
    if (mode === "decision-intelligence") {
      const command = root.querySelector("[data-ff-di-v2-command]");
      const grid = command?.querySelector(":scope > .ff-di-v2-intelligence-grid");
      if (!command || !grid || grid.closest("[data-ff-cdi-deep]")) return;
      const details = document.createElement("details");
      details.className = "ff-cdi-deep";
      details.dataset.ffCdiDeep = "";
      details.innerHTML = '<summary><span><strong>Full evidence & Decision Receipt</strong><small>Open deeper detail only when you need it.</small></span><b aria-hidden="true">＋</b></summary>';
      grid.insertAdjacentElement("beforebegin", details);
      details.appendChild(grid);
      return;
    }

    const grid = root.querySelector(":scope > .customer-intelligence-grid");
    if (!grid || grid.closest("[data-ff-cdi-deep]")) return;
    const details = document.createElement("details");
    details.className = "ff-cdi-deep ff-cdi-deep-saved";
    details.dataset.ffCdiDeep = "";
    details.innerHTML = '<summary><span><strong>Full evidence & saved decision detail</strong><small>Traceback, evidence rows, PSA context, and deeper factors.</small></span><b aria-hidden="true">＋</b></summary>';
    grid.insertAdjacentElement("beforebegin", details);
    details.appendChild(grid);
  }

  function mountDecisionStack(root, mode) {
    const model = mode === "decision-intelligence"
      ? decisionIntelligenceSignals(root)
      : savedDecisionSignals(root);
    if (!model) return;

    const decision = decisionValue(root, mode);
    const signature = JSON.stringify([decision, model.identity, model.reason, model.evidenceHref, model.signals]);
    let stack = root.querySelector(":scope > [data-ff-cdi-stack-host]");
    if (!stack) {
      const anchor = mode === "decision-intelligence"
        ? root.querySelector(".ff-di-controls")
        : root.querySelector(".customer-intelligence-hero");
      if (!anchor) return;
      stack = document.createElement("div");
      stack.dataset.ffCdiStackHost = "";
      anchor.insertAdjacentElement("afterend", stack);
    }
    if (stack.dataset.ffCdiSignature !== signature) {
      stack.dataset.ffCdiSignature = signature;
      stack.innerHTML = stackMarkup(decision, model);
    }
    root.dataset.ffCdiSignalStack = "v1";
    ensureDeepDisclosure(root, mode);
  }

  function revealStack(stack, instant) {
    if (!stack || state.running.has(stack)) return;
    state.running.add(stack);
    const rows = [...stack.querySelectorAll("[data-ff-cdi-signal]")];
    const caption = stack.querySelector(".ff-cdi-caption");
    const after = stack.querySelector("[data-ff-cdi-after]");
    rows.forEach(row => row.classList.remove("is-live", "is-complete"));
    if (after) after.hidden = true;

    const finish = () => {
      rows.forEach(row => row.classList.add("is-complete"));
      if (caption) caption.textContent = "Four checks complete. Open the evidence or Decision Receipt for the deeper trail.";
      if (after) after.hidden = false;
      state.running.delete(stack);
    };

    if (instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      rows.forEach(row => row.classList.add("is-live"));
      finish();
      return;
    }

    rows.forEach((row, index) => {
      window.setTimeout(() => {
        rows.forEach(other => other.classList.remove("is-live"));
        row.classList.add("is-live", "is-complete");
        const copy = row.querySelector(".ff-cdi-signal-copy small");
        if (caption) caption.textContent = text(copy);
        if (index === rows.length - 1) window.setTimeout(finish, STAGGER_MS);
      }, index * STAGGER_MS);
    });
  }

  function evidenceGuide() {
    const parts = routeParts();
    if (parts[0] !== "evidence") return;
    const root = document.querySelector("#main-content .page");
    const heading = root?.querySelector(".page-heading");
    if (!root || !heading) return;

    const p = heading.querySelector("p");
    if (p) p.textContent = "See what FlipForge could use, what it excluded, and why that matters to the saved decision.";

    if (root.querySelector("[data-ff-cdi-evidence-guide]")) return;
    const guide = document.createElement("section");
    guide.className = "ff-cdi-evidence-guide";
    guide.dataset.ffCdiEvidenceGuide = "";
    guide.innerHTML =
      '<article><span>01 · ACCEPTED</span><strong>Check trustworthy sales</strong><p>Exact completed sales that are eligible to support the saved decision.</p></article>' +
      '<article><span>02</span><strong>Excluded</strong><p>Visible rows that fail an identity, sale-state, freshness, or authority check.</p></article>' +
      '<article><span>03</span><strong>Why it matters</strong><p>Supported value should get stronger only when the evidence gets stronger.</p></article>';
    heading.insertAdjacentElement("afterend", guide);
  }

  function returningSavedGuide() {
    const parts = routeParts();
    if (parts[0] !== "opportunities" || parts[1]) return;
    const root = document.querySelector("#main-content .customer-intelligence-page");
    const heading = root?.querySelector(".page-heading");
    if (!root || !heading || root.querySelector("[data-ff-cdi-returning]")) return;
    const guide = document.createElement("div");
    guide.className = "ff-cdi-returning";
    guide.dataset.ffCdiReturning = "";
    guide.innerHTML = '<strong>Reopen a saved decision.</strong><span>Pick a card to see the plain-language verdict first, then replay the four checks behind it.</span>';
    heading.insertAdjacentElement("afterend", guide);
  }

  function apply() {
    const parts = routeParts();
    if (parts[0] === "decision-intelligence") {
      const root = document.querySelector("#main-content .ff-di-page");
      if (root) mountDecisionStack(root, "decision-intelligence");
    } else if (parts[0] === "opportunities" && parts[1]) {
      const root = document.querySelector("#main-content .customer-intelligence-page");
      if (root) mountDecisionStack(root, "saved-decision");
    }
    evidenceGuide();
    returningSavedGuide();
  }

  function queue() {
    if (state.queued) return;
    state.queued = true;
    window.requestAnimationFrame(() => {
      state.queued = false;
      apply();
    });
  }

  document.addEventListener("click", event => {
    const start = event.target.closest?.("[data-ff-cdi-start], [data-ff-cdi-replay]");
    if (start) {
      const stack = start.closest("[data-ff-cdi-stack]");
      revealStack(stack, false);
      return;
    }

    const receiptButton = event.target.closest?.("[data-ff-cdi-receipt]");
    if (!receiptButton) return;
    const root = receiptButton.closest(".ff-di-page, .customer-intelligence-page");
    const deep = root?.querySelector("[data-ff-cdi-deep]");
    if (deep) deep.open = true;
    const receipt = root?.querySelector("[data-ff-decision-receipt], .ff-di-v2-receipt");
    if (receipt) {
      receipt.open = true;
      receipt.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center"
      });
    } else if (root?.querySelector(".ff-decision-card-evidence")) {
      root.querySelector(".ff-decision-card-evidence").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  const main = document.getElementById("main-content");
  if (main) new MutationObserver(queue).observe(main, { childList: true, subtree: true });
  window.addEventListener("hashchange", queue);
  window.addEventListener("load", queue, { once: true });

  window.FlipForgeCustomerCdiSignalStackV1 = Object.freeze({ apply: queue });
  queue();
})();