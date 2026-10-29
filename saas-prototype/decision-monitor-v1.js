/*
 * FlipForge Decision Change Monitor™ v1 + Collection Intelligence™ v1 (Phase 2 slice, DEV)
 *
 * Decision Change Monitor — "Since you saved this decision": what FlipForge can and cannot tell has changed about one
 * saved decision, from governed data it already holds. Shown on the tracked-card page (#/tracking/{id}) above the
 * Decision Timeline, and on the saved-decision page (#/opportunities/{id}) under Deal Check.
 *
 * Collection Intelligence — on Portfolio (#/portfolio): links every owned card to its saved decision (verdict, Max Buy
 * at the time, what you paid against it), what needs review next, and the share of your cost basis that has no
 * evidence-supported value or rests on an old decision.
 *
 * Sources (all existing, read-only, already allow-listed by the gateway; no provider call, no evaluation, no write):
 *   GET /api/v1/opportunities/{id}  governed decision + saved evidence counts
 *   GET /api/v1/lifecycle/{id}      immutable Decision Timeline (re-evaluation changes[]) + the lifecycle record
 *   GET /api/v1/opportunities       governed decision for every saved card (Portfolio)
 *   GET /api/v1/portfolio           owned cards and customer-entered cost basis (Portfolio)
 *
 * What is monitored (functional):
 *   - changes recorded by a re-evaluation (timeline changes[]: ASK_CHANGED, DECISION_CHANGED, RISK_CHANGED, ...), shown
 *     exactly as the server recorded them, with the new all-in ask placed against the saved Max Buy;
 *   - the saved exact-sale count now vs. the count behind the decision;
 *   - time since the decision (T14 reasoning check, T30 re-check), and saved evidence older than 30 days;
 *   - card-match and identity-eligibility problems; VERIFY and legacy decisions that need renewed verification.
 * What is NOT monitored (awaiting licensed data; stated on screen): live asking prices, new completed sales, market
 *   movement. FlipForge does not re-check listings after a decision is saved; nothing here claims it does.
 *
 * Authority boundary: no verdict, Max Buy, value or profit is computed. Decisions and receipts are never rescored or
 * modified; the monitor only reads them. Signals are review prompts, never instructions to buy or sell. Cards keep the
 * server's order (no browser ranking). Governed fields are read through FlipForgeDealCheck.dealModel so both features
 * interpret the frozen snapshot identically.
 *
 * Activation: same rule as Deal Check (preview hosts and localhost; goflipforge.com only with ?dealcheck=1).
 * Kill switch: window.FlipForgeDecisionMonitorDisabled = true.
 */
(() => {
  "use strict";
  if (typeof window !== "undefined" && window.FlipForgeDecisionMonitor) return;

  const VERSION = "decision-monitor-v1.0.0";
  const CONTRACT_VERSION = "1.0";
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const DAY_MS = 86_400_000;
  // Aligned with the existing T7 / T14 / T30 follow-up checkpoints on the Tracking page.
  const REASONING_CHECK_DAYS = 14;
  const RECHECK_DAYS = 30;
  const EVIDENCE_STALE_DAYS = 30;
  const PANEL_ATTR = "data-ff-decision-monitor";
  const COLLECTION_ATTR = "data-ff-collection-intelligence";
  const NOT_MONITORED = Object.freeze([
    "Live asking prices — FlipForge does not re-check listings after a decision is saved.",
    "New completed sales — waiting for a licensed sales source.",
    "Market movement — not shown until licensed data supports it."
  ]);

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function text(value) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""; }
  function int(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  function money(cents, fallback = "Not established") {
    if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return fallback;
    const value = Number(cents) / 100;
    const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
    return value < 0 ? `−${formatted}` : formatted;
  }
  function dateOnly(value) {
    const parsed = new Date(text(value));
    if (Number.isNaN(parsed.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
  }
  function daysSince(value, nowMs) {
    const parsed = Date.parse(text(value));
    if (!Number.isFinite(parsed) || !Number.isFinite(nowMs)) return null;
    return Math.max(0, Math.floor((nowMs - parsed) / DAY_MS));
  }
  function plural(n, word) { return `${n} ${word}${n === 1 ? "" : "s"}`; }
  function dealModelOf(opportunity, timeline) {
    const deal = typeof window !== "undefined" && window.FlipForgeDealCheck;
    if (!deal || typeof deal.dealModel !== "function" || !opportunity) return null;
    return deal.dealModel({ governedDecisionReadModelVersion: "governed-decision-read", opportunity }, timeline || null);
  }
  function timelineOf(lifecycleData) {
    const source = lifecycleData && typeof lifecycleData === "object" ? lifecycleData : null;
    const timeline = source && (source.kind === "decision-timeline" ? source : source.decisionTimeline);
    return timeline && timeline.available !== false && Array.isArray(timeline.entries) ? timeline : null;
  }

  /**
   * Signals for one saved decision. Pure: reads the governed model, the immutable timeline and the lifecycle record.
   * Each signal: { key, level: "review" | "info" | "ok", title, detail, source }.
   */
  function monitor(model, timeline, lifecycle, nowMs = Date.now()) {
    const signals = [];
    const add = (key, level, title, detail, source) => signals.push({ key, level, title, detail, source });
    if (!model) return { available: false, signals, scope: NOT_MONITORED, ageDays: null, verdict: "" };

    const entries = timeline && Array.isArray(timeline.entries) ? timeline.entries.filter(e => e && typeof e === "object") : [];
    const latest = entries.length ? entries[entries.length - 1] : null;
    const changes = latest && Array.isArray(latest.changes) ? latest.changes.filter(c => c && typeof c === "object") : [];
    const change = code => changes.find(c => text(c.code).toUpperCase() === code) || null;
    const evaluatedAt = model.evaluatedAt || (latest ? text(latest.evaluatedAt) : "");
    const ageDays = daysSince(evaluatedAt, nowMs);

    // 1. Decision changed at a re-evaluation (server-recorded transition).
    const decisionChange = change("DECISION_CHANGED");
    if (decisionChange && entries.length > 1) {
      const before = text(String(decisionChange.before ?? "")).toUpperCase() || text(entries[entries.length - 2]?.decision);
      add("decision", "review", `Decision changed: ${before || "earlier"} → ${model.verdict || text(latest.decision)}`,
        `Recorded when this card was re-evaluated on ${dateOnly(latest.evaluatedAt) || "a later date"}. The earlier receipt is kept unchanged.`, "Re-evaluation");
    }

    // 2. Asking price vs saved Max Buy (only a re-evaluation can observe a new price).
    const askChange = change("ASK_CHANGED");
    if (askChange && entries.length > 1) {
      const before = int(askChange.before) ?? int(entries[entries.length - 2]?.allInAskCents);
      const after = int(askChange.after) ?? int(latest.allInAskCents);
      const maxBuy = model.maxBuyCents;
      let detail = `All-in ask ${money(before, "—")} → ${money(after, "—")} at the re-evaluation on ${dateOnly(latest.evaluatedAt) || "a later date"}.`;
      let level = "info";
      if (maxBuy !== null && after !== null) {
        const crossedDown = before !== null && before > maxBuy && after <= maxBuy;
        const crossedUp = before !== null && before <= maxBuy && after > maxBuy;
        detail += after <= maxBuy ? ` Now ${money(maxBuy - after)} inside the Max Buy of ${money(maxBuy)}.` : ` Now ${money(after - maxBuy)} above the Max Buy of ${money(maxBuy)}.`;
        if (crossedDown || crossedUp) level = "review";
      }
      add("price", level, "Asking price changed", detail, "Re-evaluation");
    } else {
      add("price-unmonitored", "info", "Asking price not re-checked",
        `The last price FlipForge saw was ${money(model.askCents, "not recorded")}${evaluatedAt ? ` on ${dateOnly(evaluatedAt)}` : ""}. FlipForge does not watch live listings, so re-evaluate to check the current price.`, "Saved decision");
    }

    // 3. Evidence count behind the decision vs saved now.
    if (model.exactSales !== null && model.currentSavedSales !== null && model.currentSavedSales !== model.exactSales) {
      const more = model.currentSavedSales > model.exactSales;
      add("evidence-count", more ? "review" : "info",
        more ? `${plural(model.currentSavedSales - model.exactSales, "more exact sale")} saved since this decision` : "Fewer saved sales count now than at the decision",
        more
          ? `The decision used ${plural(model.exactSales, "exact sale")}; ${model.currentSavedSales} are saved now. A re-evaluation would use them; this decision is not rescored.`
          : `The decision used ${plural(model.exactSales, "exact sale")}; ${model.currentSavedSales} count under current evidence rules. The decision itself is unchanged.`,
        "Saved evidence");
    }
    const evidenceChange = change("ACCEPTED_EVIDENCE_CHANGED");
    if (evidenceChange && entries.length > 1) {
      add("evidence-reeval", "info", "Accepted evidence changed at re-evaluation",
        text(evidenceChange.description) || `Accepted exact sales ${text(String(evidenceChange.before ?? "—"))} → ${text(String(evidenceChange.after ?? "—"))}.`, "Re-evaluation");
    }

    // 4. Freshness: time since the decision, and the age of the newest saved sale when the server provides it.
    if (ageDays !== null) {
      if (ageDays >= RECHECK_DAYS) add("age", "review", `Decision is ${ageDays} days old`, `Saved ${dateOnly(evaluatedAt)}. Re-check the price and evidence before relying on it.`, "Time since decision");
      else if (ageDays >= REASONING_CHECK_DAYS) add("age", "info", `Decision is ${ageDays} days old`, "The 14-day reasoning check is due: does the original reason still hold?", "Time since decision");
    }
    const latestSaleAge = daysSince(model.latestSaleDate, nowMs);
    if (latestSaleAge !== null && latestSaleAge > EVIDENCE_STALE_DAYS) {
      add("evidence-age", "review", "Newest saved sale is over 30 days old", `Newest exact sale: ${dateOnly(model.latestSaleDate)} (${latestSaleAge} days). Prices may have moved since.`, "Saved evidence");
    } else if (/STALE/.test(model.freshness || "")) {
      add("evidence-age", "review", "Saved evidence is stale", "The server marks this card's saved evidence as stale.", "Saved evidence");
    }

    // 5. Identity.
    const identityChange = change("IDENTITY_ELIGIBILITY_CHANGED");
    if (identityChange && entries.length > 1 && String(identityChange.after) === "false") {
      add("identity", "review", "Exact-card identity no longer confirmed", "At the latest re-evaluation the card did not pass the exact-identity check.", "Re-evaluation");
    } else if (!model.legacy && model.mappingState && model.mappingState !== "CONFIRMED") {
      add("identity", "review", "Card match not confirmed", "Confirm the exact set, number, parallel and grade before relying on this decision.", "Saved decision");
    }
    if (model.excludedReasons.some(reason => /identity|wrong card|conflict/i.test(reason))) {
      add("identity-conflict", "info", "Some sales were excluded for identity reasons", `Not counted because: ${model.excludedReasons.join(", ")}.`, "Saved evidence");
    }

    // 6. Uncertainty movement at re-evaluation.
    const risk = change("RISK_CHANGED");
    const confidence = change("CONFIDENCE_CHANGED");
    if (risk && entries.length > 1 && int(risk.after) !== null && int(risk.before) !== null && int(risk.after) > int(risk.before)) {
      add("risk", "review", `Risk rose ${int(risk.before)} → ${int(risk.after)}`, "Recorded at the latest re-evaluation.", "Re-evaluation");
    }
    if (confidence && entries.length > 1 && int(confidence.after) !== null && int(confidence.before) !== null && int(confidence.after) < int(confidence.before)) {
      add("confidence", "review", `Confidence fell ${int(confidence.before)} → ${int(confidence.after)}`, "Recorded at the latest re-evaluation.", "Re-evaluation");
    }
    const quality = change("EVIDENCE_QUALITY_CHANGED");
    if (quality && entries.length > 1) add("quality", "info", "Evidence quality changed", text(quality.description) || `${text(String(quality.before ?? ""))} → ${text(String(quality.after ?? ""))}`, "Re-evaluation");

    // 7. Renewed verification.
    if (model.legacy) add("legacy", "review", "Saved before current evidence rules", "Re-evaluate under current rules before relying on this decision.", "Saved decision");
    else if (model.verdict === "VERIFY") add("verify", "review", "Still needs verification", model.missingRequirement && !/^none\b/i.test(model.missingRequirement) ? `FlipForge needs ${model.missingRequirement}.` : "Verification is still required before this decision can commit.", "Saved decision");

    // 8. What you paid vs the Max Buy at decision (owned cards).
    const cost = lifecycle ? int(lifecycle.acquisitionCostCents) : null;
    if (cost !== null && model.maxBuyCents !== null) {
      const over = cost - model.maxBuyCents;
      add("paid", over > 0 ? "info" : "ok", over > 0 ? `You paid ${money(over)} above the Max Buy at decision` : `You paid ${money(-over)} under the Max Buy at decision`,
        `Paid ${money(cost)} (entered by you) · Max Buy ${money(model.maxBuyCents)} on ${dateOnly(evaluatedAt) || "the decision date"}.`, "Your record");
    }

    const reviewCount = signals.filter(s => s.level === "review").length;
    return { available: true, signals, reviewCount, scope: NOT_MONITORED, ageDays, verdict: model.verdict, evaluatedAt, reEvaluations: Math.max(0, entries.length - 1) };
  }

  /** Collection Intelligence for Portfolio. Pure; keeps the server's card order. */
  function collection(portfolioData, opportunityItems, nowMs = Date.now()) {
    const items = Array.isArray(portfolioData?.items) ? portfolioData.items.filter(i => i && typeof i === "object") : [];
    const byId = new Map((Array.isArray(opportunityItems) ? opportunityItems : []).filter(i => i && SAFE_ID.test(String(i.id || ""))).map(i => [String(i.id), i]));
    const rows = items.map(item => {
      const id = text(item.opportunityId);
      const opportunity = byId.get(id) || null;
      const model = opportunity ? dealModelOf(opportunity, null) : null;
      const result = monitor(model, null, item, nowMs);
      const cost = int(item.acquisitionCostCents);
      const review = result.signals.filter(s => s.level === "review" && s.key !== "price-unmonitored");
      if (!model) review.push({ key: "unlinked", level: "review", title: "No saved decision linked to this card", detail: "Evaluate the card so its holding sits next to a decision receipt.", source: "Your record" });
      return {
        id,
        title: text(opportunity?.title) || text(opportunity?.cardIdentity) || id,
        linked: Boolean(model && model.governedAvailable),
        verdict: model ? model.verdict : "",
        maxBuyCents: model ? model.maxBuyCents : null,
        supportedEstablished: Boolean(model && model.supportedCents !== null),
        costCents: cost,
        paidVsMaxBuyCents: cost !== null && model && model.maxBuyCents !== null ? cost - model.maxBuyCents : null,
        ageDays: result.ageDays,
        acquiredAt: text(item.acquiredAt),
        review,
        nextStep: review.length ? review[0].title : model ? "No review needed from saved data" : "Open the card to link its saved decision"
      };
    });
    const sum = list => list.reduce((total, row) => total + (row.costCents || 0), 0);
    const costed = rows.filter(r => r.costCents !== null);
    return {
      available: items.length > 0,
      count: rows.length,
      totalCostBasisCents: int(portfolioData?.totalCostBasisCents) ?? sum(costed),
      unsupportedCostCents: sum(costed.filter(r => !r.supportedEstablished)),
      unsupportedCount: costed.filter(r => !r.supportedEstablished).length,
      agedCostCents: sum(costed.filter(r => r.ageDays !== null && r.ageDays >= RECHECK_DAYS)),
      agedCount: costed.filter(r => r.ageDays !== null && r.ageDays >= RECHECK_DAYS).length,
      overMaxBuyCount: rows.filter(r => r.paidVsMaxBuyCents !== null && r.paidVsMaxBuyCents > 0).length,
      unlinkedCount: rows.filter(r => !r.linked).length,
      attention: rows.filter(r => r.review.length > 0),
      rows
    };
  }

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */

  function chip(verdict) {
    const v = text(verdict).toUpperCase();
    return `<span class="ffdm-chip" data-verdict="${escapeHtml((v || "none").toLowerCase())}">${escapeHtml(v || "—")}</span>`;
  }

  function monitorMarkup(id, result, { compact = false, trackingHref = "" } = {}) {
    if (!result.available) {
      return `<section class="ffdm" ${PANEL_ATTR}="${escapeHtml(id)}" data-state="unavailable"><header class="ffdm-head"><div><span class="ffdm-kicker">Decision Change Monitor™</span><h2>Monitoring unavailable</h2></div></header><p class="ffdm-muted">The saved decision for this card could not be read, so nothing is shown rather than guessed.</p></section>`;
    }
    const review = result.signals.filter(s => s.level === "review");
    const others = result.signals.filter(s => s.level !== "review");
    const headline = review.length
      ? `${plural(review.length, "thing")} to review since this decision`
      : "No change found in FlipForge's saved data";
    const sinceText = result.evaluatedAt ? `Saved ${dateOnly(result.evaluatedAt)}${result.ageDays !== null ? ` · ${plural(result.ageDays, "day")} ago` : ""}${result.reEvaluations ? ` · ${plural(result.reEvaluations, "re-evaluation")}` : ""}` : "";
    const list = signals => `<ul class="ffdm-signals">${signals.map(s => `<li data-level="${s.level}" data-ffdm-signal="${escapeHtml(s.key)}"><span class="ffdm-dot" aria-hidden="true"></span><div><strong>${escapeHtml(s.title)}</strong><p>${escapeHtml(s.detail)}</p><small>${escapeHtml(s.source)}</small></div></li>`).join("")}</ul>`;
    return `<section class="ffdm" ${PANEL_ATTR}="${escapeHtml(id)}" data-ffdm-version="${VERSION}" data-review="${review.length}" aria-labelledby="ffdm-title-${escapeHtml(id)}">
      <header class="ffdm-head">
        <div><span class="ffdm-kicker">Decision Change Monitor™</span><h2 id="ffdm-title-${escapeHtml(id)}">${escapeHtml(headline)}</h2>${sinceText ? `<p class="ffdm-muted">${escapeHtml(sinceText)}</p>` : ""}</div>
        <div class="ffdm-state">${chip(result.verdict)}<small>Saved decision · unchanged</small></div>
      </header>
      ${review.length ? list(review) : ""}
      ${others.length ? (compact && review.length ? `<details class="ffdm-more"><summary>${plural(others.length, "other note")}</summary>${list(others)}</details>` : list(others)) : ""}
      <details class="ffdm-scope" data-ffdm-scope><summary>What FlipForge is not monitoring yet</summary><ul>${result.scope.map(entry => `<li>${escapeHtml(entry)}</li>`).join("")}</ul><p>Signals come only from saved decisions, saved evidence counts, re-evaluations and time. Decisions and receipts are never rescored.</p></details>
      <footer class="ffdm-foot">
        <a class="ffdm-link" href="#/discover">Re-evaluate this card →</a>
        ${trackingHref ? `<a class="ffdm-link" href="${trackingHref}">Track and set a review date →</a>` : ""}
        <small>Review prompts only. Not financial advice; FlipForge does not buy or sell for you.</small>
      </footer>
    </section>`;
  }

  function collectionMarkup(view) {
    if (!view.available) return "";
    const attention = view.attention;
    const row = r => `<li data-ffci-card="${escapeHtml(r.id)}">
        <div class="ffci-card"><strong>${escapeHtml(r.title)}</strong>
          <span>${r.linked ? `${chip(r.verdict)} Max Buy ${escapeHtml(money(r.maxBuyCents, "not set"))}` : "No saved decision linked"} · Paid ${escapeHtml(money(r.costCents, "not entered"))}${r.paidVsMaxBuyCents !== null ? ` <em data-over="${r.paidVsMaxBuyCents > 0}">${escapeHtml(r.paidVsMaxBuyCents > 0 ? `${money(r.paidVsMaxBuyCents)} over Max Buy` : `${money(-r.paidVsMaxBuyCents)} under Max Buy`)}</em>` : ""}</span>
          ${r.review.length ? `<ul>${r.review.slice(0, 3).map(s => `<li>${escapeHtml(s.title)}</li>`).join("")}</ul>` : `<small>${escapeHtml(r.nextStep)}</small>`}
        </div>
        <div class="ffci-links">${SAFE_ID.test(r.id) ? `<a href="#/opportunities/${encodeURIComponent(r.id)}">Decision receipt</a><a href="#/tracking/${encodeURIComponent(r.id)}">Monitor</a>` : ""}</div>
      </li>`;
    return `<section class="ffci" ${COLLECTION_ATTR} data-ffci-version="${VERSION}" aria-labelledby="ffci-title">
      <header class="ffdm-head"><div><span class="ffdm-kicker">Collection Intelligence™</span><h2 id="ffci-title">${attention.length ? `${plural(attention.length, "card")} to review next` : "Nothing to review from saved data"}</h2>
        <p class="ffdm-muted">Each owned card next to the decision you saved for it. Cards keep their usual order.${view.unlinkedCount ? ` ${plural(view.unlinkedCount, "owned card")} ${view.unlinkedCount === 1 ? "has" : "have"} no linked saved decision.` : ""}</p></div></header>
      <div class="ffci-exposure" data-ffci-exposure>
        <div><span>Cost basis</span><strong>${escapeHtml(money(view.totalCostBasisCents))}</strong><small>${plural(view.count, "owned card")} · what you entered</small></div>
        <div data-tone="${view.unsupportedCostCents > 0 ? "warn" : ""}"><span>Without supported value</span><strong>${escapeHtml(money(view.unsupportedCostCents))}</strong><small>${plural(view.unsupportedCount, "card")} with no evidence-supported value</small></div>
        <div data-tone="${view.agedCostCents > 0 ? "warn" : ""}"><span>On decisions 30+ days old</span><strong>${escapeHtml(money(view.agedCostCents))}</strong><small>${plural(view.agedCount, "card")} to re-check</small></div>
        <div><span>Paid above Max Buy</span><strong>${escapeHtml(String(view.overMaxBuyCount))}</strong><small>Compared with the Max Buy at decision</small></div>
      </div>
      ${attention.length ? `<ol class="ffci-list" data-ffci-attention>${attention.map(row).join("")}</ol>` : ""}
      <details class="ffdm-more" data-ffci-all><summary>All owned cards and their saved decisions</summary><ol class="ffci-list">${view.rows.map(row).join("")}</ol></details>
      <p class="ffdm-muted">No current market value is shown: values appear only with enough recent exact completed sales. Cost basis is what you entered. Live prices and new sales are not monitored yet.</p>
    </section>`;
  }

  /* ------------------------------------------------------------------ *
   * Runtime
   * ------------------------------------------------------------------ */

  const state = { key: "", loading: "", result: null, collection: null, serial: 0, scheduled: false };

  function enabled() {
    if (typeof window === "undefined" || window.FlipForgeDecisionMonitorDisabled === true) return false;
    const deal = window.FlipForgeDealCheck;
    return Boolean(deal && typeof deal.enabledFor === "function" && deal.enabledFor(window.location, window.FlipForgeDealCheckDisabled));
  }
  function route() {
    const hash = String(window.location.hash || "");
    const match = hash.match(/^#\/?(opportunities|tracking)\/([^/?#]+)/);
    if (match) {
      let id = match[2];
      try { id = decodeURIComponent(id); } catch (_) { /* raw */ }
      return SAFE_ID.test(id) ? { name: match[1], id } : { name: "", id: "" };
    }
    if (/^#\/?portfolio(?:[/?]|$)/.test(hash)) return { name: "portfolio", id: "" };
    return { name: "", id: "" };
  }
  function correlationId() {
    return window.crypto && typeof window.crypto.randomUUID === "function" ? window.crypto.randomUUID() : `decision-monitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  async function getJson(path) {
    const id = correlationId();
    const response = await fetch(path, { method: "GET", headers: { Accept: "application/json", "X-Correlation-Id": id }, credentials: "same-origin", cache: "no-store", redirect: "error" });
    const body = await response.text();
    if (body.length > MAX_RESPONSE_CHARACTERS) throw new Error("Response too large.");
    const payload = body ? JSON.parse(body) : {};
    if (!response.ok) throw Object.assign(new Error("Request failed."), { status: response.status });
    if (!payload?.meta || payload.meta.contractVersion !== CONTRACT_VERSION || payload.meta.correlationId !== id || !payload.data) throw new Error("Response failed the FlipForge contract.");
    return payload.data;
  }

  async function loadCard(key, id) {
    const serial = ++state.serial;
    state.loading = key;
    const encoded = encodeURIComponent(id);
    const [detail, lifecycle] = await Promise.allSettled([getJson(`/api/v1/opportunities/${encoded}`), getJson(`/api/v1/lifecycle/${encoded}`)]);
    if (serial !== state.serial) return;
    state.loading = "";
    state.key = key;
    const opportunity = detail.status === "fulfilled" && String(detail.value?.opportunity?.id || "") === id ? detail.value.opportunity : null;
    const lifeData = lifecycle.status === "fulfilled" ? lifecycle.value : null;
    const timeline = timelineOf(lifeData);
    const record = lifeData && lifeData.lifecycle && typeof lifeData.lifecycle === "object" ? lifeData.lifecycle : null;
    state.result = { id, data: monitor(opportunity ? dealModelOf(opportunity, timeline) : null, timeline, record) };
  }

  async function loadCollection(key) {
    const serial = ++state.serial;
    state.loading = key;
    const [portfolio, opportunities] = await Promise.allSettled([getJson("/api/v1/portfolio"), getJson("/api/v1/opportunities")]);
    if (serial !== state.serial) return;
    state.loading = "";
    state.key = key;
    state.collection = portfolio.status === "fulfilled" && portfolio.value?.kind === "portfolio"
      ? collection(portfolio.value, opportunities.status === "fulfilled" ? opportunities.value?.items : [])
      : null;
  }

  function insertAfter(anchor, html) {
    const holder = document.createElement("div");
    holder.innerHTML = html;
    const node = holder.firstElementChild;
    if (node) anchor.insertAdjacentElement("afterend", node);
  }
  function insertBefore(anchor, html) {
    const holder = document.createElement("div");
    holder.innerHTML = html;
    const node = holder.firstElementChild;
    if (node) anchor.insertAdjacentElement("beforebegin", node);
  }

  function apply() {
    state.scheduled = false;
    const main = document.querySelector("#main-content");
    const { name, id } = route();
    const key = name ? `${name}:${id}` : "";
    const stale = main ? [...main.querySelectorAll(`[${PANEL_ATTR}], [${COLLECTION_ATTR}]`)] : [];
    if (!enabled() || !main || !name) { stale.forEach(node => node.remove()); return; }
    stale.filter(node => (node.hasAttribute(PANEL_ATTR) ? `${name}:${node.getAttribute(PANEL_ATTR)}` : "portfolio:") !== key).forEach(node => node.remove());
    if (state.key !== key && state.loading !== key) {
      (name === "portfolio" ? loadCollection(key) : loadCard(key, id)).then(schedule, schedule);
      return;
    }
    if (state.loading === key) return;

    if (name === "portfolio") {
      if (!state.collection || main.querySelector(`[${COLLECTION_ATTR}]`)) return;
      const metrics = main.querySelector(".customer-portfolio-page .customer-portfolio-metrics");
      if (metrics) insertAfter(metrics, collectionMarkup(state.collection));
      return;
    }
    if (!state.result || state.result.id !== id || main.querySelector(`[${PANEL_ATTR}]`)) return;
    if (name === "tracking") {
      const timeline = main.querySelector(".customer-lifecycle-page .customer-decision-timeline-panel");
      if (timeline) insertBefore(timeline, monitorMarkup(id, state.result.data));
    } else {
      const deal = main.querySelector(`[data-ff-deal-check]`);
      if (deal) insertAfter(deal, monitorMarkup(id, state.result.data, { compact: true, trackingHref: `#/tracking/${encodeURIComponent(id)}` }));
    }
  }

  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    (window.requestAnimationFrame || setTimeout)(apply);
  }

  function start() {
    window.addEventListener("hashchange", schedule);
    const observer = new MutationObserver(mutations => {
      if (mutations.every(m => m.target instanceof Element && m.target.closest(`[${PANEL_ATTR}], [${COLLECTION_ATTR}]`))) return;
      schedule();
    });
    observer.observe(document.querySelector("#main-content") || document.body, { childList: true, subtree: true });
    schedule();
  }

  const api = Object.freeze({ version: VERSION, monitor, collection, monitorMarkup, collectionMarkup, timelineOf, dealModelOf, notMonitored: NOT_MONITORED });
  if (typeof window !== "undefined") {
    window.FlipForgeDecisionMonitor = api;
    if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
      else start();
    }
  }
})();
