(() => {
  "use strict";

  if (window.FlipForgeDecisionCardEvidenceV1) return;
  window.FlipForgeDecisionCardEvidenceV1 = true;

  const routeParts = () => String(window.location.hash || "#/dashboard")
    .replace(/^#\/?/, "")
    .split(/[/?]/)
    .filter(Boolean)
    .map((value) => {
      try { return decodeURIComponent(value); } catch (_) { return value; }
    });
  const routeName = () => routeParts()[0] || "dashboard";
  const text = (node) => String(node?.textContent || "").replace(/\s+/g, " ").trim();
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function labeledValue(root, selector, wantedLabel) {
    const rows = [...root.querySelectorAll(selector)];
    const match = rows.find((row) => text(row.querySelector("span")) === wantedLabel);
    return match ? text(match.querySelector("strong")) : "Unavailable";
  }

  function metricValue(root, wantedLabel) {
    return labeledValue(root, ".customer-intelligence-metrics article", wantedLabel);
  }

  function summaryValue(root, wantedLabel) {
    const summary = root.querySelector(".customer-value-summary");
    if (!summary) return "Unavailable";
    const nodes = [...summary.children];
    for (let index = 0; index < nodes.length; index += 1) {
      if (text(nodes[index]) !== wantedLabel) continue;
      const next = nodes[index + 1];
      if (next?.tagName === "STRONG") return text(next);
    }
    return "Unavailable";
  }

  function numericFromPage(root, labels) {
    const candidates = [...root.querySelectorAll("article,section,div")];
    for (const candidate of candidates) {
      const span = text(candidate.querySelector(":scope > span"));
      if (!labels.includes(span)) continue;
      const strong = text(candidate.querySelector(":scope > strong"));
      if (/^\d+$/.test(strong)) return strong;
    }
    const pageText = text(root);
    for (const label of labels) {
      const match = pageText.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(\\d+)`, "i"));
      if (match) return match[1];
    }
    return "Unavailable";
  }

  function exactIdentityState(root) {
    const page = text(root);
    if (/CardSight catalog linked|mapping\s*(?:state\s*)?CONFIRMED|exact identity[^.]{0,30}(?:verified|confirmed)/i.test(page)) return "Verified";
    if (/catalog link pending|identity needs verification|mapping\s*(?:not confirmed|NOT_CONFIRMED)/i.test(page)) return "Needs review";
    return "Review exact identity";
  }

  function opportunityModel() {
    const parts = routeParts();
    if (parts[0] !== "opportunities" || parts.length < 2) return null;
    const root = document.querySelector("#main-content");
    const summary = root?.querySelector("[data-ff-decision-summary]");
    const hero = root?.querySelector(".customer-intelligence-hero");
    if (!root || !summary || !hero) return null;

    const decision = text(summary.querySelector(".ff-decision-summary-pill"))
      || text(hero.querySelector(".staging-status"))
      || "UNKNOWN";
    const identity = text(hero.querySelector(".customer-hero-title h2")) || "Saved card";
    const identityDetail = text(hero.querySelector(".customer-hero-copy > p"));
    const reasonParagraphs = [...summary.querySelectorAll(".ff-decision-summary-main > p")]
      .filter((node) => !node.classList.contains("ff-decision-next"));
    const why = text(reasonParagraphs[0]) || "FlipForge preserved the server-owned decision.";
    const change = text(summary.querySelector(".ff-decision-next")) || "Material new evidence or price/risk changes require a fresh evaluation.";
    const accepted = numericFromPage(root, ["Accepted exact sales", "Trusted sales"]);
    const excluded = numericFromPage(root, ["Visible but ineligible", "Excluded from authority"]);
    const ask = summaryValue(root, "Current ask");
    const supportedValue = summaryValue(root, "Supported value");
    const confidence = metricValue(root, "Confidence");
    const risk = metricValue(root, "Risk");
    const observed = text(hero.querySelector(".customer-tracked-state small")) || "Saved server observation";
    const id = encodeURIComponent(parts[1]);

    return {
      root,
      anchor: hero,
      decision,
      identity: identityDetail && identityDetail !== identity ? `${identity} · ${identityDetail}` : identity,
      why,
      change,
      accepted,
      excluded,
      ask,
      supportedValue,
      confidence,
      risk,
      exactIdentity: exactIdentityState(root),
      observed,
      evidenceHref: `#/evidence/${id}`,
      trackingHref: `#/tracking/${id}`,
      receiptMode: "reference"
    };
  }

  function decisionIntelligenceModel() {
    if (routeName() !== "decision-intelligence") return null;
    const root = document.querySelector('.ff-di-page[data-ff-decision-intelligence-source]');
    const command = root?.querySelector("[data-ff-di-v2-command]");
    const verdict = command?.querySelector(".ff-di-v2-verdict");
    if (!root || !command || !verdict) return null;

    return {
      root: command,
      anchor: verdict,
      decision: text(verdict.querySelector(".ff-di-v2-decision")) || "UNKNOWN",
      identity: text(verdict.querySelector(".ff-di-v2-verdict-main h2")) || "Saved opportunity",
      why: text(verdict.querySelector(".ff-di-v2-verdict-main p")) || "FlipForge preserved the server-owned decision.",
      change: text(command.querySelector(".ff-di-v2-change h3")) || "Material new evidence or price/risk changes require a fresh evaluation.",
      accepted: labeledValue(command, ".ff-di-v2-gate", "Trusted completed sales"),
      excluded: labeledValue(command, ".ff-di-v2-gate", "Excluded evidence"),
      ask: labeledValue(command, ".ff-di-v2-receipt-grid > div", "Evaluated ask"),
      supportedValue: labeledValue(verdict, ".ff-di-v2-verdict-metrics > div", "Supported value"),
      confidence: labeledValue(verdict, ".ff-di-v2-verdict-metrics > div", "Confidence"),
      risk: labeledValue(verdict, ".ff-di-v2-verdict-metrics > div", "Risk"),
      exactIdentity: labeledValue(command, ".ff-di-v2-gate", "Exact identity"),
      observed: labeledValue(command, ".ff-di-v2-receipt-grid > div", "Observed"),
      evidenceHref: command.querySelector(".ff-di-v2-evidence-link")?.getAttribute("href") || "#/evidence",
      trackingHref: "#/tracking",
      receiptMode: command.querySelector(".ff-di-v2-receipt") ? "attached" : "reference"
    };
  }

  function evidenceSummary(model) {
    const trusted = model.accepted === "Unavailable" ? "Qualified evidence" : model.accepted;
    const excluded = model.excluded === "Unavailable" ? "See trail" : `${model.excluded} excluded`;
    return { trusted, excluded };
  }

  function numeric(value) {
    const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function count(value) {
    const parsed = numeric(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
  }

  function unavailable(value) {
    return !String(value ?? "").trim() || /^(?:unavailable|unknown|withheld|—|n\/a)$/i.test(String(value).trim());
  }

  function decisionHeadline(decision) {
    const normalized = String(decision || "").toUpperCase();
    if (normalized === "BUY") return "The buy case is supported";
    if (normalized === "WATCH") return "Worth watching—not ready to buy";
    if (normalized === "VERIFY") return "Verify before acting";
    if (normalized === "PASS") return "Pass at this price";
    return "Review this decision";
  }

  function decisionMeaning(decision) {
    const normalized = String(decision || "").toUpperCase();
    if (normalized === "BUY") return "The saved evidence supports this purchase at the evaluated price, within the stated risks and limits.";
    if (normalized === "WATCH") return "There may be an opportunity here, but the price or evidence is not strong enough yet.";
    if (normalized === "VERIFY") return "There is not enough trustworthy evidence yet to support a stronger call.";
    if (normalized === "PASS") return "The current evidence does not justify this purchase at the evaluated price.";
    return "Open the reason trail to see what FlipForge could and could not support.";
  }

  function identityPlain(value) {
    const raw = String(value || "");
    if (/verified|confirmed/i.test(raw)) return "Exact card confirmed";
    if (/review|pending|not confirmed/i.test(raw)) return "Card needs review";
    return unavailable(raw) ? "Card identity unavailable" : raw;
  }

  function evidencePlain(model) {
    const accepted = count(model.accepted);
    const excluded = count(model.excluded);
    if (accepted !== null) {
      const noun = accepted === 1 ? "sale" : "sales";
      return {
        title: `${accepted} trustworthy ${noun} ${accepted === 1 ? "qualifies" : "qualify"}`,
        state: `${accepted} trusted ${noun}`,
        detail: excluded !== null
          ? `${excluded} comparison${excluded === 1 ? "" : "s"} stayed out because ${excluded === 1 ? "it did" : "they did"} not qualify.`
          : "Open the evidence trail to see what counted and what stayed out."
      };
    }
    return {
      title: "Review the trustworthy sales",
      state: "See evidence",
      detail: "Open the evidence trail to see which comparisons were allowed to influence the decision."
    };
  }

  function riskPlain(model) {
    const risk = numeric(model.risk);
    if (!Number.isFinite(risk)) return "Uncertainty unavailable";
    if (risk >= 70) return "High uncertainty";
    if (risk >= 35) return "More checking";
    return "Lower uncertainty";
  }

  function pricePlain(model) {
    if (unavailable(model.supportedValue)) {
      return {
        title: "Price support is unavailable",
        state: "No price support",
        detail: "FlipForge does not manufacture a value when the evidence does not support one."
      };
    }
    if (unavailable(model.ask)) {
      return {
        title: `Supported value: ${model.supportedValue}`,
        state: "Value supported",
        detail: "The listing price is unavailable in this saved view."
      };
    }
    return {
      title: `${model.ask} ask · ${model.supportedValue} supported`,
      state: "Price compared",
      detail: "FlipForge compares the saved asking price with the value supported by qualified evidence."
    };
  }

  function evidenceVisual(model) {
    const accepted = count(model.accepted);
    const excluded = count(model.excluded);
    if (accepted === null && excluded === null) {
      return '<span class="ff-dce-evidence-meter is-unavailable"><i></i></span>';
    }
    const safeAccepted = Math.min(10, Math.max(0, accepted || 0));
    const safeExcluded = Math.min(10 - safeAccepted, Math.max(0, excluded || 0));
    const dots = [
      ...Array.from({ length: safeAccepted }, () => '<i class="is-kept"></i>'),
      ...Array.from({ length: safeExcluded }, () => '<i class="is-out"></i>')
    ].join("");
    return `<span class="ff-dce-evidence-dots">${dots || '<i class="is-unknown"></i>'}</span>`;
  }

  function priceVisual(model) {
    const ask = numeric(model.ask);
    const supported = numeric(model.supportedValue);
    if (!Number.isFinite(ask) && !Number.isFinite(supported)) {
      return '<span class="ff-dce-price-bars is-unavailable"><i></i><i></i></span>';
    }
    const max = Math.max(1, Number.isFinite(ask) ? ask : 0, Number.isFinite(supported) ? supported : 0);
    const askPct = Number.isFinite(ask) ? Math.max(8, Math.min(100, (ask / max) * 100)) : 0;
    const supportedPct = Number.isFinite(supported) ? Math.max(8, Math.min(100, (supported / max) * 100)) : 0;
    return `<span class="ff-dce-price-bars" style="--ff-dce-ask:${askPct}%;--ff-dce-support:${supportedPct}%"><i class="is-ask"></i><i class="is-support"></i></span>`;
  }

  function uncertaintyVisual(model) {
    const confidence = numeric(model.confidence);
    const risk = numeric(model.risk);
    const confidenceValue = Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0;
    const riskValue = Number.isFinite(risk) ? Math.max(0, Math.min(100, risk)) : 0;
    return `<span class="ff-dce-uncertainty-visual" style="--ff-dce-confidence:${confidenceValue};--ff-dce-risk:${riskValue}">
      <span class="ff-dce-mini-ring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14"></circle><circle class="ff-dce-mini-ring-value" cx="18" cy="18" r="14"></circle></svg></span>
      <span class="ff-dce-risk-bar"><i></i></span>
    </span>`;
  }

  function signalData(model) {
    const evidence = evidencePlain(model);
    const price = pricePlain(model);
    return [
      {
        key: "identity",
        label: "EXACT CARD",
        title: identityPlain(model.exactIdentity),
        detail: model.identity,
        state: /verified|confirmed/i.test(String(model.exactIdentity || "")) ? "Exact match" : "Check card",
        visual: '<span class="ff-dce-check-stack"><i>✓</i><i>✓</i><i>✓</i></span>',
        caption: `First, FlipForge confirms the exact card. ${identityPlain(model.exactIdentity)}.`
      },
      {
        key: "evidence",
        label: "TRUSTWORTHY SALES",
        title: evidence.title,
        detail: evidence.detail,
        state: evidence.state,
        visual: evidenceVisual(model),
        caption: `Next, FlipForge checks which sales are trustworthy enough to count. ${evidence.detail}`
      },
      {
        key: "economics",
        label: "PRICE CHECK",
        title: price.title,
        detail: price.detail,
        state: price.state,
        visual: priceVisual(model),
        caption: unavailable(model.supportedValue)
          ? "Then FlipForge checks whether the qualified evidence is strong enough to support a price. It is not, so value stays unavailable."
          : `Then FlipForge compares the saved listing price with the supported value: ${model.ask} versus ${model.supportedValue}.`
      },
      {
        key: "risk",
        label: "HOW SURE IS THE CALL?",
        title: `Confidence ${model.confidence} · Risk ${model.risk}`,
        detail: "Uncertainty stays visible instead of being hidden behind a price or score.",
        state: riskPlain(model),
        visual: uncertaintyVisual(model),
        caption: `Finally, FlipForge keeps uncertainty visible. Confidence is ${model.confidence} and risk is ${model.risk}.`
      }
    ];
  }

  function render(model) {
    const evidence = evidenceSummary(model);
    const signals = signalData(model);
    const signature = JSON.stringify([
      model.decision, model.identity, model.why, model.change, model.accepted, model.excluded,
      model.ask, model.supportedValue, model.confidence, model.risk, model.exactIdentity,
      model.observed, model.evidenceHref, model.trackingHref, model.receiptMode
    ]);

    let panel = model.root.querySelector("[data-ff-decision-card-evidence]");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "ff-decision-card-evidence ff-dce-signal-experience";
      panel.dataset.ffDecisionCardEvidence = "v2";
      model.anchor.insertAdjacentElement("afterend", panel);
    }
    if (panel.dataset.ffDecisionCardSignature === signature) return;
    panel.dataset.ffDecisionCardSignature = signature;
    panel.dataset.ffDceDecision = String(model.decision || "UNKNOWN").toUpperCase();

    const receiptAction = model.receiptMode === "attached"
      ? '<button type="button" data-ff-open-decision-receipt>Open Decision Receipt</button>'
      : '<span class="ff-dce-boundary">Open the saved Decision Receipt from its native server-backed surface when available.</span>';

    panel.innerHTML = `
      <header class="ff-dce-head">
        <div>
          <span class="ff-dce-kicker">UNDERSTAND THIS DECISION</span>
          <h3>${escapeHtml(decisionHeadline(model.decision))}</h3>
          <p>${escapeHtml(decisionMeaning(model.decision))}</p>
        </div>
        <span class="ff-dce-decision-chip">${escapeHtml(model.decision)}</span>
      </header>

      <div class="ff-dce-start">
        <div class="ff-dce-start-copy">
          <strong>New to FlipForge? You do not need to know the terminology.</strong>
          <span>FlipForge checks the exact card, trustworthy sales, price, and uncertainty. Then it preserves the reason trail.</span>
        </div>
        <button type="button" data-ff-dce-start>
          <span>START HERE</span>
          <strong>Show me why FlipForge said ${escapeHtml(model.decision)}</strong>
          <small>Watch the 4 checks assemble</small>
        </button>
      </div>

      <div class="ff-dce-reasoning" data-ff-dce-reasoning hidden>
        <div class="ff-dce-stack-head">
          <div><span>WHY FLIPFORGE SAID THIS</span><strong>Four checks build the reason trail.</strong></div>
          <span data-ff-dce-status role="status" aria-live="polite">Ready</span>
        </div>
        <div class="ff-dce-tour-caption">
          <span data-ff-dce-step>STEP 1 OF 4</span>
          <strong data-ff-dce-caption>${escapeHtml(signals[0].caption)}</strong>
        </div>
        <div class="ff-dce-stack" aria-label="Decision reason trail">
          ${signals.map((signal, index) => `
            <button type="button" class="ff-dce-signal" data-ff-dce-signal="${escapeHtml(signal.key)}" data-ff-dce-caption-value="${escapeHtml(signal.caption)}" aria-pressed="false" style="--ff-dce-delay:${index * 340}ms">
              <span class="ff-dce-signal-index">0${index + 1}</span>
              <span class="ff-dce-signal-visual" aria-hidden="true">${signal.visual}</span>
              <span class="ff-dce-signal-copy"><small>${escapeHtml(signal.label)}</small><strong>${escapeHtml(signal.title)}</strong><span>${escapeHtml(signal.detail)}</span></span>
              <span class="ff-dce-signal-state">${escapeHtml(signal.state)}</span>
            </button>`).join("")}
        </div>
        <div class="ff-dce-next">
          <span>WHAT TO DO NEXT</span>
          <strong>${escapeHtml(model.change)}</strong>
        </div>
        <div class="ff-dce-replay-row"><button type="button" data-ff-dce-replay>Replay reasoning ↻</button></div>
      </div>

      <details class="ff-dce-layers">
        <summary><span><strong>See full decision evidence</strong><small>Open the deeper Card Decision Intelligence layers only when you want them.</small></span><span aria-hidden="true">＋</span></summary>
        <ol>
          <li data-cdi-layer="identity"><span class="ff-dce-number">01</span><div><strong>Identity Intelligence</strong><p>${escapeHtml(model.identity)}</p><small>Exact card: ${escapeHtml(model.exactIdentity)}</small></div></li>
          <li data-cdi-layer="evidence"><span class="ff-dce-number">02</span><div><strong>Evidence Intelligence</strong><p>${escapeHtml(evidence.trusted)} · ${escapeHtml(evidence.excluded)}</p><small>Only eligible exact completed-sale evidence can support value.</small><a href="${escapeHtml(model.evidenceHref)}">Open full evidence trail →</a></div></li>
          <li data-cdi-layer="economics"><span class="ff-dce-number">03</span><div><strong>Economic Intelligence</strong><p>${escapeHtml(model.ask)} ask · ${escapeHtml(model.supportedValue)} supported value</p><small>This surface displays returned economics; it does not infer profit or recompute value.</small></div></li>
          <li data-cdi-layer="risk"><span class="ff-dce-number">04</span><div><strong>Risk + Uncertainty Intelligence</strong><p>${escapeHtml(model.risk)} · confidence ${escapeHtml(model.confidence)}</p><small>Unresolved uncertainty remains visible instead of being converted into false certainty.</small></div></li>
          <li data-cdi-layer="decision"><span class="ff-dce-number">05</span><div><strong>Decision Intelligence</strong><p>${escapeHtml(model.decision)} — ${escapeHtml(model.why)}</p><small>${escapeHtml(model.change)}</small></div></li>
          <li data-cdi-layer="receipt"><span class="ff-dce-number">06</span><div><strong>Decision Traceback / Decision Receipt</strong><p>${escapeHtml(model.observed)}</p><small>The receipt preserves what the saved system returned at the time.</small>${receiptAction}</div></li>
          <li data-cdi-layer="outcome"><span class="ff-dce-number">07</span><div><strong>Outcome Intelligence</strong><p>Track what happened after the decision.</p><small>Use Tracking for later 7 / 14 / 30 outcome review without rewriting the original decision.</small><a href="${escapeHtml(model.trackingHref)}">Continue to Tracking →</a></div></li>
        </ol>
      </details>`;

    [...panel.querySelectorAll(".ff-dce-layers li")].forEach((item,index)=>item.style.setProperty("--ff-dce-i",String(index)));
  }

  function finishSignalBuild(panel) {
    const rows = [...panel.querySelectorAll("[data-ff-dce-signal]")];
    rows.forEach(row => {
      row.classList.add("is-in");
      row.classList.remove("is-active-step");
    });
    panel.dataset.ffDceBuilding = "false";
    panel.dataset.ffDceLocked = "true";
    const status = panel.querySelector("[data-ff-dce-status]");
    const step = panel.querySelector("[data-ff-dce-step]");
    const caption = panel.querySelector("[data-ff-dce-caption]");
    if (status) status.textContent = "4 checks complete";
    if (step) step.textContent = "REASON TRAIL COMPLETE";
    if (caption) caption.textContent = "Tap any check to revisit that part of the reasoning.";
  }

  function playSignalBuild(panel) {
    const reasoning = panel.querySelector("[data-ff-dce-reasoning]");
    const rows = [...panel.querySelectorAll("[data-ff-dce-signal]")];
    if (!reasoning || !rows.length) return;
    reasoning.hidden = false;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    panel._ffDceTimers?.forEach?.(timer => window.clearTimeout(timer));
    panel._ffDceTimers = [];

    if (reduceMotion) {
      panel.classList.remove("ff-dce-motion-ready");
      finishSignalBuild(panel);
      reasoning.scrollIntoView({ behavior: "auto", block: "start" });
      return;
    }

    panel.classList.add("ff-dce-motion-ready");
    panel.dataset.ffDceBuilding = "false";
    panel.dataset.ffDceLocked = "false";
    rows.forEach(row => row.classList.remove("is-in","is-active-step"));
    const status = panel.querySelector("[data-ff-dce-status]");
    if (status) status.textContent = "Building the reason trail…";

    void panel.offsetWidth;
    window.requestAnimationFrame(() => {
      panel.dataset.ffDceBuilding = "true";
      rows.forEach(row => row.classList.add("is-in"));

      rows.forEach((row,index) => {
        const timer = window.setTimeout(() => {
          rows.forEach(value => {
            value.classList.remove("is-active-step");
            value.setAttribute("aria-pressed","false");
          });
          row.classList.add("is-active-step");
          row.setAttribute("aria-pressed","true");
          const step = panel.querySelector("[data-ff-dce-step]");
          const caption = panel.querySelector("[data-ff-dce-caption]");
          if (step) step.textContent = `STEP ${index + 1} OF ${rows.length}`;
          if (caption) caption.textContent = row.dataset.ffDceCaptionValue || "";
          if (status) status.textContent = `Check ${index + 1} of ${rows.length}`;
        }, 120 + index * 340);
        panel._ffDceTimers.push(timer);
      });

      const complete = window.setTimeout(() => finishSignalBuild(panel), 120 + (rows.length - 1) * 340 + 620);
      panel._ffDceTimers.push(complete);
    });

    reasoning.scrollIntoView({ behavior: "smooth", block: "start" });
  }


  function enhance() {
    const model = opportunityModel() || decisionIntelligenceModel();
    if (model) render(model);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const start = target.closest("[data-ff-dce-start],[data-ff-dce-replay]");
    if (start) {
      const panel = start.closest("[data-ff-decision-card-evidence]");
      if (panel) playSignalBuild(panel);
      return;
    }

    const signal = target.closest("[data-ff-dce-signal]");
    if (signal) {
      const panel = signal.closest("[data-ff-decision-card-evidence]");
      if (!panel) return;
      panel._ffDceTimers?.forEach?.(timer => window.clearTimeout(timer));
      panel._ffDceTimers = [];
      panel.classList.remove("ff-dce-motion-ready");
      const rows = [...panel.querySelectorAll("[data-ff-dce-signal]")];
      rows.forEach(row => {
        row.classList.add("is-in");
        row.classList.remove("is-active-step");
        row.setAttribute("aria-pressed", String(row === signal));
      });
      const index = Math.max(0, rows.indexOf(signal));
      const step = panel.querySelector("[data-ff-dce-step]");
      const caption = panel.querySelector("[data-ff-dce-caption]");
      const status = panel.querySelector("[data-ff-dce-status]");
      if (step) step.textContent = `STEP ${index + 1} OF ${rows.length}`;
      if (caption) caption.textContent = signal.dataset.ffDceCaptionValue || "";
      if (status) status.textContent = "Step opened";
      return;
    }

    const receiptTrigger = target.closest("[data-ff-open-decision-receipt]");
    if (!receiptTrigger) return;
    const container = receiptTrigger.closest("[data-ff-di-v2-command]");
    const receipt = container?.querySelector(".ff-di-v2-receipt");
    if (!receipt) return;
    receipt.open = true;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    receipt.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  });

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      enhance();
    });
  };

  window.addEventListener("hashchange", schedule);
  document.addEventListener("DOMContentLoaded", schedule, { once: true });
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  schedule();
})();
