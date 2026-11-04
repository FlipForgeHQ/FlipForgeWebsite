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
      reason: "There are not enough matched exact sales to support a stronger call yet."
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

  function decisionValue(root) {
    const raw = text(root.querySelector(".ff-di-v2-decision"));
    const decision = raw.toUpperCase().replace(/^SAVED\s+/, "").trim();
    return Object.prototype.hasOwnProperty.call(VERDICTS, decision) ? decision : "UNKNOWN";
  }

  // Read, never shown: pages rendered by an earlier build still carry the legacy gate heading.
  const ACCEPTED_GATE_LABELS = ["Matched exact sales", "Trusted completed sales"];

  function labeledStrong(scope, selector, label) {
    const targets = (Array.isArray(label) ? label : [label]).map(value => String(value || "").toLowerCase());
    const row = [...scope.querySelectorAll(selector)]
      .find(node => targets.includes(text(node.querySelector("span")).toLowerCase()));
    return row ? text(row.querySelector("strong")) : "";
  }

  function decisionIntelligenceSignals(root) {
    const command = root.querySelector("[data-ff-di-v2-command]");
    if (!command) return null;

    const exact = labeledStrong(command, ".ff-di-v2-gate", "Exact identity") || "Review needed";
    const sales = labeledStrong(command, ".ff-di-v2-gate", ACCEPTED_GATE_LABELS) || "Unavailable";
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
          label: "Matched sales",
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

  function exactVisual(signal) {
    const mark = signal.verified === null ? "–" : (signal.verified ? "✓" : "?");
    const tone = signal.verified === null ? "neutral" : (signal.verified ? "good" : "review");
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

  // What each check's marker says. Display only: it reads the values already shown on the row and never changes the
  // decision. A green tick appears only when the check actually succeeded; an unresolved or missing check never gets one.
  const OUTCOMES = Object.freeze({
    passed: { mark: "\u2713", label: "Check passed" },
    review: { mark: "!", label: "Needs review" },
    missing: { mark: "\u2013", label: "Not available yet" },
    context: { mark: "i", label: "Shown for context, not a pass or fail" }
  });

  function signalOutcome(signal) {
    if (signal.key === "exact") return signal.verified === null ? "missing" : (signal.verified ? "passed" : "review");
    if (signal.key === "sales") {
      if (!Number.isFinite(signal.accepted)) return "missing";
      return signal.accepted > 0 ? "passed" : "review";
    }
    if (signal.key === "price") {
      const supported = Number(signal.supported);
      return Number.isFinite(supported) && supported > 0 ? "passed" : "review";
    }
    return Number.isFinite(signal.confidence) && Number.isFinite(signal.risk) ? "context" : "missing";
  }

  function signalMarkup(signal, index) {
    const outcome = signalOutcome(signal);
    return '<article class="ff-cdi-signal" data-ff-cdi-signal="' + escapeHtml(signal.key) + '" data-outcome="' + outcome + '" data-step="' + String(index + 1) + '">' +
      '<div class="ff-cdi-signal-index">0' + String(index + 1) + '</div>' +
      signalVisual(signal) +
      '<div class="ff-cdi-signal-copy"><span>' + escapeHtml(signal.label) + '</span><strong>' + escapeHtml(signal.value) + '</strong><small>' + escapeHtml(signal.caption) + '</small></div>' +
      '<span class="ff-cdi-signal-state" data-outcome="' + outcome + '" title="' + OUTCOMES[outcome].label + '">' +
        '<span aria-hidden="true">' + OUTCOMES[outcome].mark + '</span><span class="ff-cdi-sr">' + OUTCOMES[outcome].label + '</span></span>' +
      '</article>';
  }

  function stackMarkup(decision, model) {
    // A legacy result (saved before current evidence rules) keeps its saved recommendation visible as historical and
    // never gets current-support copy such as "Buy looks supported".
    const verdict = model.legacy
      ? { title: "Saved " + decision + " (historical)", reason: window.FlipForgeTrustDisplay?.LEGACY_HISTORICAL || "It is not presented as currently supported." }
      : (VERDICTS[decision] || VERDICTS.UNKNOWN);
    const reason = model.legacy ? verdict.reason : (model.reason || verdict.reason);
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

  // Decision Intelligence page only. The saved decision page (customer-opportunities.js) renders its own
  // deeper-detail disclosure.
  function ensureDeepDisclosure(root) {
    const command = root.querySelector("[data-ff-di-v2-command]");
    const grid = command?.querySelector(":scope > .ff-di-v2-intelligence-grid");
    if (!command || !grid || grid.closest("[data-ff-cdi-deep]")) return;
    const details = document.createElement("details");
    details.className = "ff-cdi-deep";
    details.dataset.ffCdiDeep = "";
    details.innerHTML = '<summary><span><strong>Full evidence & Decision Receipt</strong><small>Open deeper detail only when you need it.</small></span><b aria-hidden="true">＋</b></summary>';
    grid.insertAdjacentElement("beforebegin", details);
    details.appendChild(grid);
  }

  // Decision Intelligence page. The saved decision page renders the same stack itself from its record (markup below).
  function mountDecisionStack(root) {
    const model = decisionIntelligenceSignals(root);
    if (!model) return;

    const decision = decisionValue(root);
    model.legacy = Boolean(model.command.querySelector("[data-ff-legacy-result]"));
    const signature = JSON.stringify([decision, model.legacy, model.identity, model.reason, model.evidenceHref, model.signals]);
    let stack = root.querySelector(":scope > [data-ff-cdi-stack-host]");
    if (!stack) {
      const anchor = root.querySelector(".ff-di-controls");
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
    ensureDeepDisclosure(root);
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
      if (caption) {
        const open = rows.filter(row => row.dataset.outcome === "review" || row.dataset.outcome === "missing").length;
        caption.textContent = open
          ? "Four checks complete. " + (open === 1 ? "1 needs" : open + " need") + " review before you rely on this decision. Open the evidence or Decision Receipt for the deeper trail."
          : "Four checks complete. Open the evidence or Decision Receipt for the deeper trail.";
      }
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
    const evidenceCopy = "See what FlipForge could use, what it excluded, and why that matters to the saved decision.";
    if (p && p.textContent !== evidenceCopy) p.textContent = evidenceCopy;

    if (root.querySelector("[data-ff-cdi-evidence-guide]")) return;
    const guide = document.createElement("details");
    guide.className = "ff-cdi-evidence-guide";
    guide.dataset.ffCdiEvidenceGuide = "";
    guide.innerHTML =
      '<summary><strong>How FlipForge filters evidence</strong><span>Exact completed sales can support the decision; mismatched, stale, duplicate, or otherwise ineligible rows stay visible but do not strengthen it.</span></summary>';
    heading.insertAdjacentElement("afterend", guide);
  }

  function apply() {
    const parts = routeParts();
    if (parts[0] === "decision-intelligence") {
      const root = document.querySelector("#main-content .ff-di-page");
      if (root) mountDecisionStack(root);
    }
    evidenceGuide();
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

  // markup(decision, model): the stack's HTML for a renderer that owns its page (customer-opportunities.js).
  window.FlipForgeCustomerCdiSignalStackV1 = Object.freeze({ apply: queue, markup: stackMarkup });
  queue();
})();