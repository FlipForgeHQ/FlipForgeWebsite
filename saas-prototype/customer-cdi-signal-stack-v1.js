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

  function numberFromText(value) {
    const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function moneyFromText(value) {
    const match = String(value || "").replace(/,/g, "").match(/\$?(-?\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
  }

  function clamp(value, min = 0, max = 100) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, n));
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
      ask,
      supported,
      value: supported,
      detail: "Ask " + ask + " · Supported " + supported
    };
  }

  function decisionIntelligenceSignals(root) {
    const command = root.querySelector("[data-ff-di-v2-command]");
    if (!command) return null;

    const exact = labeledStrong(command, ".ff-di-v2-gate", "Exact identity") || "Review needed";
    const sales = labeledStrong(command, ".ff-di-v2-gate", "Trusted completed sales") || "Unavailable";
    const excluded = labeledStrong(command, ".ff-di-v2-gate", "Excluded evidence") || "";
    const support = labeledStrong(command, ".ff-di-v2-verdict-metrics > div", "Supported value") || "Unavailable";
    const confidence = labeledStrong(command, ".ff-di-v2-verdict-metrics > div", "Confidence") || "Unavailable";
    const risk = labeledStrong(command, ".ff-di-v2-verdict-metrics > div", "Risk") || "Unavailable";
    const ask = labeledStrong(command, ".ff-di-v3-receipt-machine-values > div", "Evaluated ask")
      || labeledStrong(command, ".ff-di-v2-receipt-grid > div", "Evaluated ask")
      || "Unavailable";
    const reason = text(command.querySelector(".ff-di-v2-verdict-main p"));
    const identity = text(command.querySelector(".ff-di-v2-verdict-main h2")) || "Saved card";
    const evidenceHref = command.querySelector(".ff-di-v2-evidence-link")?.getAttribute("href") || "#/evidence";

    return {
      command,
      identity,
      reason,
      evidenceHref,
      signals: [
        {
          key: "exact",
          label: "Exact card",
          value: exact,
          caption: "Confirm the year, set, number, variant, and grade.",
          verified: /verified|confirmed|exact/i.test(exact)
        },
        {
          key: "sales",
          label: "Trustworthy sales",
          value: sales,
          caption: "Use only completed sales that match the exact card.",
          accepted: numberFromText(sales),
          excluded: numberFromText(excluded)
        },
        {
          key: "price",
          label: "Price check",
          value: support,
          caption: "Compare the listing price with the value supported by accepted evidence.",
          ask: moneyFromText(ask),
          supported: moneyFromText(support)
        },
        {
          key: "uncertainty",
          label: "Uncertainty",
          value: confidence + " confidence · " + risk + " risk",
          caption: "Keep uncertainty visible instead of turning thin evidence into false precision.",
          confidence: clamp(numberFromText(confidence)),
          risk: clamp(numberFromText(risk))
        }
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
        {
          key: "exact",
          label: "Exact card",
          value: exact,
          caption: "Confirm the saved card identity before relying on any comparison.",
          verified: !/review|unknown|unverified|conflict/i.test(exact)
        },
        {
          key: "sales",
          label: "Trustworthy sales",
          value: sales,
          caption: "See how many exact completed sales were allowed to support the decision.",
          accepted: numberFromText(sales),
          excluded: null
        },
        {
          key: "price",
          label: "Price check",
          value: price.value,
          caption: price.detail,
          ask: moneyFromText(price.ask),
          supported: moneyFromText(price.supported)
        },
        {
          key: "uncertainty",
          label: "Uncertainty",
          value: confidence + " confidence · " + risk + " risk",
          caption: "Use the saved confidence and risk together, not as a guarantee.",
          confidence: clamp(numberFromText(confidence)),
          risk: clamp(numberFromText(risk))
        }
      ]
    };
  }

  function exactVisual(signal) {
    const mark = signal.verified ? "✓" : "?";
    const tone = signal.verified ? "good" : "review";
    return '<span class="ff-cdi-visual ff-cdi-visual-exact" data-tone="' + tone + '" aria-hidden="true">' +
      '<i>' + mark + '</i><i>' + mark + '</i><i>' + mark + '</i></span>';
  }

  function salesVisual(signal) {
    const accepted = Number.isFinite(signal.accepted) ? Math.max(0, Math.round(signal.accepted)) : 0;
    const excluded = Number.isFinite(signal.excluded) ? Math.max(0, Math.round(signal.excluded)) : 0;
    const total = Math.max(accepted + excluded, accepted || 5);
    const shown = Math.min(Math.max(total, 5), 8);
    const dots = Array.from({ length: shown }, (_, index) => {
      const cls = index < accepted ? "is-kept" : (index < accepted + excluded ? "is-out" : "is-neutral");
      return '<i class="' + cls + '"></i>';
    }).join("");
    return '<span class="ff-cdi-visual ff-cdi-visual-sales" aria-hidden="true">' + dots + '</span>';
  }

  function priceVisual(signal) {
    const ask = Number(signal.ask);
    const supported = Number(signal.supported);
    const validAsk = Number.isFinite(ask) && ask > 0;
    const validSupported = Number.isFinite(supported) && supported > 0;
    if (!validAsk && !validSupported) {
      return '<span class="ff-cdi-visual ff-cdi-visual-price is-unavailable" aria-hidden="true"><i></i><i></i><b>—</b></span>';
    }
    const max = Math.max(validAsk ? ask : 0, validSupported ? supported : 0, 1);
    const askHeight = validAsk ? Math.max(18, Math.round((ask / max) * 100)) : 0;
    const supportedHeight = validSupported ? Math.max(18, Math.round((supported / max) * 100)) : 0;
    return '<span class="ff-cdi-visual ff-cdi-visual-price" aria-hidden="true" style="--ask:' + askHeight + '%;--supported:' + supportedHeight + '%">' +
      '<i data-kind="ask"></i><i data-kind="supported"></i><b></b></span>';
  }

  function uncertaintyVisual(signal) {
    const confidence = Number.isFinite(signal.confidence) ? signal.confidence : 0;
    const risk = Number.isFinite(signal.risk) ? signal.risk : 0;
    return '<span class="ff-cdi-visual ff-cdi-visual-uncertainty" aria-hidden="true" style="--confidence:' + confidence + ';--risk:' + risk + '">' +
      '<span class="ff-cdi-mini-ring"><i></i></span><span class="ff-cdi-mini-risk"><i></i></span></span>';
  }

  function signalVisual(signal) {
    if (signal.key === "exact") return exactVisual(signal);
    if (signal.key === "sales") return salesVisual(signal);
    if (signal.key === "price") return priceVisual(signal);
    return uncertaintyVisual(signal);
  }

  function signalMarkup(signal, index) {
    return '<article class="ff-cdi-signal" data-ff-cdi-signal="' + escapeHtml(signal.key) + '" data-step="' + String(index + 1) + '">' +
      '<div class="ff-cdi-signal-index">0' + String(index + 1) + '</div>' +
      signalVisual(signal) +
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
          '<span class="ff-cdi-kicker">FLIPFORGE SAYS</span>' +
          '<h2>' + escapeHtml(verdict.title) + '</h2>' +
          '<p>' + escapeHtml(reason) + '</p>' +
          '<div class="ff-cdi-meta"><span>' + escapeHtml(decision) + '</span><span>Decision engine · Smart Opportunity</span></div>' +
        '</div>' +
        '<div class="ff-cdi-card-id"><span>Card under review</span><strong>' + escapeHtml(model.identity) + '</strong></div>' +
      '</header>' +
      '<div class="ff-cdi-start">' +
        '<button class="ff-cdi-start-button" type="button" data-ff-cdi-start><strong>See why FlipForge said ' + escapeHtml(decision) + '</strong></button>' +
        '<small>Watch the 4 checks assemble · about 3 seconds</small>' +
      '</div>' +
      '<div class="ff-cdi-reasoning" data-ff-cdi-reasoning hidden>' +
        '<div class="ff-cdi-caption" role="status" aria-live="polite">Four checks behind this decision.</div>' +
        '<div class="ff-cdi-signals" aria-label="Four checks behind this decision">' +
          model.signals.map(signalMarkup).join("") +
        '</div>' +
        '<div class="ff-cdi-after" data-ff-cdi-after hidden>' +
          '<a class="ff-cdi-secondary" href="' + escapeHtml(model.evidenceHref) + '">Open full evidence</a>' +
          '<button class="ff-cdi-secondary" type="button" data-ff-cdi-receipt>Open Decision Receipt</button>' +
          '<button class="ff-cdi-replay" type="button" data-ff-cdi-replay>Replay the 4 checks</button>' +
        '</div>' +
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
    root.dataset.ffCdiSignalStack = "v2";
    ensureDeepDisclosure(root, mode);
  }

  function revealStack(stack, instant) {
    if (!stack || state.running.has(stack)) return;
    state.running.add(stack);
    const reasoning = stack.querySelector("[data-ff-cdi-reasoning]");
    const rows = [...stack.querySelectorAll("[data-ff-cdi-signal]")];
    const caption = stack.querySelector(".ff-cdi-caption");
    const after = stack.querySelector("[data-ff-cdi-after]");
    if (reasoning) reasoning.hidden = false;
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
    const guide = document.createElement("details");
    guide.className = "ff-cdi-evidence-guide";
    guide.dataset.ffCdiEvidenceGuide = "";
    guide.innerHTML =
      '<summary><strong>How FlipForge filters evidence</strong><span>Exact completed sales can support the decision; mismatched, stale, duplicate, or otherwise ineligible rows stay visible but do not strengthen it.</span></summary>';
    heading.insertAdjacentElement("afterend", guide);
  }

  function returningSavedGuide() {
    const root = document.querySelector("#main-content [data-ff-cdi-returning]");
    root?.remove();
  }

  function outcomeGuide() {
    const parts = routeParts();
    if (parts[0] !== "tracking") return;
    const root = document.querySelector("#main-content .page, #main-content .customer-lifecycle-page");
    const heading = root?.querySelector(".page-heading");
    if (!root || !heading) return;

    const p = heading.querySelector("p");
    if (p) p.textContent = "Start with the original decision, then see what changed at later checkpoints without rewriting the past.";

    if (root.querySelector("[data-ff-cdi-outcome-guide]")) return;
    const guide = document.createElement("section");
    guide.className = "ff-cdi-outcome-guide";
    guide.dataset.ffCdiOutcomeGuide = "";
    guide.innerHTML =
      '<div class="ff-cdi-outcome-flow" aria-label="Outcome Intelligence checkpoints">' +
        '<article data-state="baseline"><b>T0</b><strong>Original decision</strong><small>Lock the call and its reason trail.</small></article>' +
        '<i aria-hidden="true">→</i>' +
        '<article><b>T7</b><strong>First review</strong><small>See what changed one week later.</small></article>' +
        '<i aria-hidden="true">→</i>' +
        '<article><b>T14</b><strong>Reasoning check</strong><small>Ask whether the original reasoning still holds.</small></article>' +
        '<i aria-hidden="true">→</i>' +
        '<article><b>T30</b><strong>Outcome context</strong><small>Record what the later evidence showed.</small></article>' +
      '</div>';
    heading.insertAdjacentElement("afterend", guide);
  }

  function homeContinuity() {
    const parts = routeParts();
    if (parts[0] !== "dashboard") return;
    const root = document.querySelector("#main-content .ff-commercial-dashboard");
    const returning = root?.querySelector("[data-ff-p3-returning]");
    if (!root || !returning) return;

    const saved = returning.querySelector('[data-ff-p3-return="saved"] small');
    const outcomes = returning.querySelector('[data-ff-p3-return="outcomes"] small');
    const heat = returning.querySelector('[data-ff-p3-return="heat"] small');
    const portfolio = returning.querySelector('[data-ff-p3-return="portfolio"] small');

    if (saved) saved.textContent = "Open a card to see the verdict and replay its four checks.";
    if (outcomes) outcomes.textContent = "See what changed after the original T0 decision.";
    if (heat) heat.textContent = "Rank eligible saved opportunities after evidence qualifies them.";
    if (portfolio) portfolio.textContent = "See owned cards and purchase context without invented market value.";
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
    outcomeGuide();
    homeContinuity();
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
      receipt.classList.remove("ff-cdi-receipt-arrival");
      void receipt.offsetWidth;
      receipt.classList.add("ff-cdi-receipt-arrival");
      window.setTimeout(() => receipt.classList.remove("ff-cdi-receipt-arrival"), 1100);
      receipt.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center"
      });
    } else if (root?.querySelector(".ff-decision-card-evidence")) {
      root.querySelector(".ff-decision-card-evidence").scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center"
      });
    }
  });

  const main = document.getElementById("main-content");
  if (main) new MutationObserver(queue).observe(main, { childList: true, subtree: true });
  window.addEventListener("hashchange", queue);
  window.addEventListener("pageshow", queue);
  window.addEventListener("load", queue, { once: true });

  window.FlipForgeCustomerCdiSignalStackV1 = Object.freeze({ apply: queue });
  queue();
})();