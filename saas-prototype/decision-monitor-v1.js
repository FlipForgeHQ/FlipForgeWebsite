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
 *   GET /api/v1/alerts              backend Decision Review Signals (data.decisionReviewSignals, FlipForge2 v1)
 *
 * What is monitored (functional):
 *   - changes recorded by a re-evaluation (timeline changes[]: ASK_CHANGED, DECISION_CHANGED, RISK_CHANGED, ...), shown
 *     exactly as the server recorded them, with the new all-in ask placed against the saved Max Buy;
 *   - the saved exact-sale count now vs. the count behind the decision;
 *   - time since the decision (T14 reasoning check, T30 re-check), and saved evidence older than 30 days;
 *   - card-match and identity-eligibility problems; VERIFY and legacy decisions that need renewed verification.
 * What is NOT monitored (stated on screen): live asking prices, new completed sales, market movement. FlipForge does not
 *   re-check listings or fetch sales after a decision is saved; nothing here claims it does.
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

  const VERSION = "decision-monitor-v1.1.0";
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
    "New completed sales — FlipForge does not fetch sales after a decision is saved; a re-evaluation uses the latest it can find.",
    "Market movement — not tracked for saved decisions."
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
   * Each signal: { key, level: "review" | "info" | "ok", title, detail, source, category }.
   * category (what kind of statement it is; shown as separate groups so nothing reads as live monitoring):
   *   "changed"        something recorded as different since the decision (a re-evaluation, or saved evidence counts);
   *   "historical"     a fact about the decision as it was saved (date, rules, verification, what you paid);
   *   "not-rechecked"  what FlipForge has not looked at again since the decision.
   * "Needs attention" is not a category: it is every signal with level "review", whatever its category.
   */
  function monitor(model, timeline, lifecycle, nowMs = Date.now()) {
    const signals = [];
    const add = (key, level, title, detail, source, category) => signals.push({ key, level, title, detail, source, category });
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
        `Recorded when this card was re-evaluated on ${dateOnly(latest.evaluatedAt) || "a later date"}. The earlier receipt is kept unchanged.`, "Re-evaluation", "changed");
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
      add("price", level, "Asking price changed", detail, "Re-evaluation", "changed");
    } else {
      add("price-unmonitored", "info", "Asking price not re-checked",
        `The last price FlipForge saw was ${money(model.askCents, "not recorded")}${evaluatedAt ? ` on ${dateOnly(evaluatedAt)}` : ""}. FlipForge does not watch live listings, so re-evaluate to check the current price.`, "Saved decision", "not-rechecked");
    }

    // 3. Evidence count behind the decision vs saved now.
    if (model.exactSales !== null && model.currentSavedSales !== null && model.currentSavedSales !== model.exactSales) {
      const more = model.currentSavedSales > model.exactSales;
      add("evidence-count", more ? "review" : "info",
        more ? `${plural(model.currentSavedSales - model.exactSales, "more exact sale")} saved since this decision` : "Fewer saved sales count now than at the decision",
        more
          ? `The decision used ${plural(model.exactSales, "exact sale")}; ${model.currentSavedSales} are saved now. A re-evaluation would use them; this decision is not rescored.`
          : `The decision used ${plural(model.exactSales, "exact sale")}; ${model.currentSavedSales} count under current evidence rules. The decision itself is unchanged.`,
        "Saved evidence", "changed");
    }
    const evidenceChange = change("ACCEPTED_EVIDENCE_CHANGED");
    if (evidenceChange && entries.length > 1) {
      add("evidence-reeval", "info", "Accepted evidence changed at re-evaluation",
        text(evidenceChange.description) || `Accepted exact sales ${text(String(evidenceChange.before ?? "—"))} → ${text(String(evidenceChange.after ?? "—"))}.`, "Re-evaluation", "changed");
    }

    // 4. Freshness: time since the decision, and the age of the newest saved sale when the server provides it.
    if (ageDays !== null) {
      if (ageDays >= RECHECK_DAYS) add("age", "review", `Decision is ${ageDays} days old`, `Saved ${dateOnly(evaluatedAt)}. Re-check the price and evidence before relying on it.`, "Time since decision", "historical");
      else if (ageDays >= REASONING_CHECK_DAYS) add("age", "info", `Decision is ${ageDays} days old`, "The 14-day reasoning check is due: does the original reason still hold?", "Time since decision", "historical");
    }
    const latestSaleAge = daysSince(model.latestSaleDate, nowMs);
    if (latestSaleAge !== null && latestSaleAge > EVIDENCE_STALE_DAYS) {
      add("evidence-age", "review", "Newest saved sale is over 30 days old", `Newest exact sale: ${dateOnly(model.latestSaleDate)} (${latestSaleAge} days). Prices may have moved since.`, "Saved evidence", "historical");
    } else if (/STALE/.test(model.freshness || "")) {
      add("evidence-age", "review", "Saved evidence is stale", "The server marks this card's saved evidence as stale.", "Saved evidence", "historical");
    }

    // 5. Identity.
    const identityChange = change("IDENTITY_ELIGIBILITY_CHANGED");
    if (identityChange && entries.length > 1 && String(identityChange.after) === "false") {
      add("identity", "review", "Exact-card identity no longer confirmed", "At the latest re-evaluation the card did not pass the exact-identity check.", "Re-evaluation", "changed");
    } else if (!model.legacy && model.mappingState && model.mappingState !== "CONFIRMED") {
      add("identity", "review", "Card match not confirmed", "Confirm the exact set, number, parallel and grade before relying on this decision.", "Saved decision", "historical");
    }
    if (model.excludedReasons.some(reason => /identity|wrong card|conflict/i.test(reason))) {
      add("identity-conflict", "info", "Some sales were excluded for identity reasons", `Not counted because: ${model.excludedReasons.join(", ")}.`, "Saved evidence", "historical");
    }

    // 6. Uncertainty movement at re-evaluation.
    const risk = change("RISK_CHANGED");
    const confidence = change("CONFIDENCE_CHANGED");
    if (risk && entries.length > 1 && int(risk.after) !== null && int(risk.before) !== null && int(risk.after) > int(risk.before)) {
      add("risk", "review", `Risk rose ${int(risk.before)} → ${int(risk.after)}`, "Recorded at the latest re-evaluation.", "Re-evaluation", "changed");
    }
    if (confidence && entries.length > 1 && int(confidence.after) !== null && int(confidence.before) !== null && int(confidence.after) < int(confidence.before)) {
      add("confidence", "review", `Confidence fell ${int(confidence.before)} → ${int(confidence.after)}`, "Recorded at the latest re-evaluation.", "Re-evaluation", "changed");
    }
    const quality = change("EVIDENCE_QUALITY_CHANGED");
    if (quality && entries.length > 1) add("quality", "info", "Evidence quality changed", text(quality.description) || `${text(String(quality.before ?? ""))} → ${text(String(quality.after ?? ""))}`, "Re-evaluation", "changed");

    // 7. Renewed verification.
    if (model.legacy) add("legacy", "review", "Relied on sale evidence FlipForge no longer accepts", "Re-evaluate the card before relying on this decision.", "Saved decision", "historical");
    else if (model.verdict === "VERIFY") add("verify", "review", "Still needs verification", model.missingRequirement && !/^none\b/i.test(model.missingRequirement) ? `FlipForge needs ${model.missingRequirement}.` : "Verification is still required before this decision can commit.", "Saved decision", "historical");

    // 8. What you paid vs the Max Buy at decision (owned cards).
    const cost = lifecycle ? int(lifecycle.acquisitionCostCents) : null;
    if (cost !== null && model.maxBuyCents !== null) {
      const over = cost - model.maxBuyCents;
      add("paid", over > 0 ? "info" : "ok", over > 0 ? `You paid ${money(over)} above the Max Buy at decision` : `You paid ${money(-over)} under the Max Buy at decision`,
        `Paid ${money(cost)} (entered by you) · Max Buy ${money(model.maxBuyCents)} on ${dateOnly(evaluatedAt) || "the decision date"}.`, "Your record", "historical");
    }

    // 9. Rules the decision was made under (server-owned disclosure, #950). Context only: never re-scored.
    if (model.earlierRules) {
      add("earlier-rules", "info", "Decided under earlier rules",
        model.rulesDisclosure || "This saved decision, its Max Buy and its receipt are kept exactly as they were made. Today's rules can give a different result at the same price.",
        "Saved decision", "historical");
    }

    const reviewCount = signals.filter(s => s.level === "review").length;
    return { available: true, signals, reviewCount, scope: NOT_MONITORED, ageDays, verdict: model.verdict, evaluatedAt, reEvaluations: Math.max(0, entries.length - 1) };
  }

  /*
   * Backend Decision Review Signals (FlipForge2 SaaSDecisionReviewSignalService v1, on GET /api/v1/alerts as
   * data.decisionReviewSignals) are authoritative for four prompts. When the backend provides them, the website's own
   * versions of those prompts are dropped (no duplicates); when it does not, the prompts are withheld and the panel
   * says review signals are unavailable instead of inventing them. Website-only explanations supported by saved data
   * (ask changes as information, evidence-count drift, 14-day check, identity, risk/confidence, paid vs Max Buy) stay.
   */
  const SERVER_KINDS = Object.freeze({
    MAX_BUY_CROSSED: "Asking price crossed the saved Max Buy",
    DECISION_RECHECK_DUE: "Decision is due for a re-check",
    VERIFICATION_PENDING: "Still needs verification",
    LEGACY_DECISION: "Relied on sale evidence FlipForge no longer accepts"
  });
  const SERVER_CATEGORY = Object.freeze({
    MAX_BUY_CROSSED: "changed",
    DECISION_RECHECK_DUE: "historical",
    VERIFICATION_PENDING: "historical",
    LEGACY_DECISION: "historical"
  });
  const ACTIVE_TRACKING = Object.freeze(["WATCHING", "REVIEW", "OWNED"]);

  /** Normalise the /alerts response into { status, signals[] } for the review-signal contract. */
  function reviewSignalFeed(alertsData, failed = false) {
    if (failed || !alertsData || typeof alertsData !== "object") return { status: "unavailable", signals: [], considered: null };
    if (typeof alertsData.decisionReviewSignalVersion !== "string" || !Array.isArray(alertsData.decisionReviewSignals)) {
      return { status: "unsupported", signals: [], considered: null };
    }
    return {
      status: "available",
      version: alertsData.decisionReviewSignalVersion,
      considered: int(alertsData.decisionReviewSignalsConsidered),
      unavailableCount: int(alertsData.decisionReviewSignalsUnavailable) || 0,
      signals: alertsData.decisionReviewSignals.filter(sig => sig && typeof sig === "object")
    };
  }

  function isTracked(lifecycle) {
    return Boolean(lifecycle && int(lifecycle.version) > 0 && ACTIVE_TRACKING.includes(text(lifecycle.trackingStatus).toUpperCase()));
  }

  function serverSignalEntry(sig) {
    const kind = text(sig.kind).toUpperCase();
    let detail = text(sig.explanation) || SERVER_KINDS[kind];
    if (kind === "MAX_BUY_CROSSED") {
      const before = int(sig.previousAllInAskCents);
      const after = int(sig.allInAskCents);
      const maxBuy = int(sig.maximumBuyPriceCents);
      if (before !== null && after !== null && maxBuy !== null) {
        detail = `All-in ask ${money(before)} → ${money(after)} at the re-evaluation on ${dateOnly(sig.evaluatedAt) || "a later date"}; saved Max Buy ${money(maxBuy)}. ${after <= maxBuy ? "Now inside the buying limit." : "Now above the buying limit."}`;
      }
    }
    if (kind === "DECISION_RECHECK_DUE" && int(sig.ageDays) !== null) {
      return { key: `srv-${kind}`, level: "review", title: `Decision is ${int(sig.ageDays)} days old`, detail: `Saved ${dateOnly(sig.evaluatedAt) || "earlier"}. Re-check the price and evidence before relying on it.`, source: "FlipForge review signal", category: SERVER_CATEGORY[kind] };
    }
    return { key: `srv-${kind}`, level: "review", title: SERVER_KINDS[kind], detail, source: "FlipForge review signal", category: SERVER_CATEGORY[kind] };
  }

  /**
   * Merge backend review signals into one card's monitor result. Pure. Never changes the verdict; drops a server signal
   * that contradicts the saved decision (and says so) rather than showing two conflicting states.
   */
  function integrate(result, feed, { id = "", lifecycle = null, model = null } = {}) {
    if (!result || !result.available) return result;
    const tracked = isTracked(lifecycle);
    const local = result.signals
      .filter(sig => !["verify", "legacy"].includes(sig.key))
      .filter(sig => !(sig.key === "age" && sig.level === "review"))
      .map(sig => (sig.key === "price" && sig.level === "review" ? { ...sig, level: "info" } : sig));
    const merged = [];
    let status = feed ? feed.status : "unavailable";
    if (status === "available" && !tracked) status = "untracked";
    if (status === "available") {
      const seen = new Set();
      let contradicted = 0;
      for (const sig of feed.signals) {
        const kind = text(sig.kind).toUpperCase();
        if (text(sig.opportunityId) !== id || !SERVER_KINDS[kind] || seen.has(kind)) continue;
        if (sig.transactionAuthority !== false || sig.historicalRescoring !== false || sig.recommendationAuthorityChanged === true) { contradicted += 1; continue; }
        const signalDecision = text(sig.decision).toUpperCase();
        if (model && model.verdict && signalDecision && signalDecision !== model.verdict) { contradicted += 1; continue; }
        if (kind === "VERIFICATION_PENDING" && model && model.verdict && model.verdict !== "VERIFY") { contradicted += 1; continue; }
        seen.add(kind);
        merged.push(serverSignalEntry(sig));
      }
      const earlierFromServer = feed.signals.some(sig => text(sig.opportunityId) === id && sig.decidedUnderEarlierRules === true);
      if (earlierFromServer && !result.signals.some(sig => sig.key === "earlier-rules")) {
        merged.push({ key: "earlier-rules", level: "info", title: "Decided under earlier rules", detail: "This saved decision and its Max Buy are kept exactly as they were made. Today's rules can give a different result at the same price.", source: "FlipForge review signal", category: "historical" });
      }
      if (contradicted) merged.push({ key: "review-signals-mismatch", level: "info", title: "A review signal was not shown", detail: `${plural(contradicted, "review signal")} did not match this saved decision, so ${contradicted === 1 ? "it was" : "they were"} left out rather than showing conflicting states.`, source: "FlipForge review signal", category: "not-rechecked" });
    } else if (status === "untracked") {
      merged.push({ key: "review-signals-status", level: "info", title: "Not tracked yet", detail: "Track this card to get review signals: asking price vs. Max Buy at re-evaluation, 30-day re-check and pending verification.", source: "Review signals", category: "not-rechecked" });
    } else if (status === "unsupported") {
      merged.push({ key: "review-signals-status", level: "info", title: "Review signals not available yet", detail: "This FlipForge server does not provide review signals yet, so the price-vs-Max-Buy, 30-day re-check and verification prompts are not shown.", source: "Review signals", category: "not-rechecked" });
    } else {
      merged.push({ key: "review-signals-status", level: "info", title: "Review signals temporarily unavailable", detail: "FlipForge could not load its review signals just now, so those prompts are not shown. Your saved decision is unchanged.", source: "Review signals", category: "not-rechecked" });
    }
    // The backend's Max Buy crossing already states the ask change; do not repeat it as a separate note.
    const localShown = merged.some(sig => sig.key === "srv-MAX_BUY_CROSSED") ? local.filter(sig => sig.key !== "price") : local;
    const signals = [...merged.filter(sig => sig.level === "review"), ...localShown, ...merged.filter(sig => sig.level !== "review")];
    return { ...result, signals, reviewCount: signals.filter(sig => sig.level === "review").length, reviewSignalStatus: status };
  }

  /** Collection Intelligence for Portfolio. Pure; keeps the server's card order. */
  function collection(portfolioData, opportunityItems, nowMs = Date.now(), feed = null) {
    const items = Array.isArray(portfolioData?.items) ? portfolioData.items.filter(i => i && typeof i === "object") : [];
    const byId = new Map((Array.isArray(opportunityItems) ? opportunityItems : []).filter(i => i && SAFE_ID.test(String(i.id || ""))).map(i => [String(i.id), i]));
    const rows = items.map(item => {
      const id = text(item.opportunityId);
      const opportunity = byId.get(id) || null;
      const model = opportunity ? dealModelOf(opportunity, null) : null;
      const result = integrate(monitor(model, null, item, nowMs), feed, { id, lifecycle: { ...item, version: int(item.version) ?? 1 }, model });
      const deal = typeof window !== "undefined" ? window.FlipForgeDealCheck : null;
      const exit = model && deal && typeof deal.exitDifficulty === "function" ? deal.exitDifficulty(model) : null;
      const cost = int(item.acquisitionCostCents);
      const review = result.signals ? result.signals.filter(s => s.level === "review" && s.key !== "price-unmonitored") : [];
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
        exit,
        reverify: result.signals ? result.signals.some(s => ["srv-VERIFICATION_PENDING", "srv-LEGACY_DECISION", "srv-DECISION_RECHECK_DUE"].includes(s.key)) : false,
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
      reverifyCount: rows.filter(r => r.reverify).length,
      hardExitCount: rows.filter(r => r.exit && r.exit.established && (r.exit.level === "higher" || r.exit.level === "high")).length,
      reviewSignalStatus: feed ? feed.status : "unavailable",
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

  // The four questions the panel answers, in this order. "Needs attention" is every review-level signal; the other
  // groups hold the remaining signals by category, so a reader can always tell a recorded change from a saved fact and
  // from something FlipForge has simply not looked at again.
  const GROUPS = Object.freeze([
    { key: "attention", title: "Needs your attention", empty: "" },
    { key: "changed", title: "What changed since you saved it", empty: "" },
    { key: "historical", title: "As saved (historical)", empty: "" },
    { key: "not-rechecked", title: "Not re-checked since the decision", empty: "" }
  ]);
  function grouped(signals) {
    const out = { attention: [], changed: [], historical: [], "not-rechecked": [] };
    for (const signal of signals) {
      if (signal.level === "review") out.attention.push(signal);
      else out[out[signal.category] ? signal.category : "historical"].push(signal);
    }
    return out;
  }
  function categoryLabel(category) {
    return category === "changed" ? "Changed" : category === "not-rechecked" ? "Not re-checked" : "As saved";
  }

  function monitorMarkup(id, result, { compact = false, trackingHref = "" } = {}) {
    if (!result.available) {
      return `<section class="ffdm" ${PANEL_ATTR}="${escapeHtml(id)}" data-state="unavailable"><header class="ffdm-head"><div><span class="ffdm-kicker">Decision Change Monitor™</span><h2>Monitoring unavailable</h2></div></header><p class="ffdm-muted">The saved decision for this card could not be read, so nothing is shown rather than guessed.</p></section>`;
    }
    const groups = grouped(result.signals);
    const review = groups.attention;
    const recordedChanges = result.signals.filter(s => s.category === "changed").length;
    const headline = review.length
      ? `${plural(review.length, "thing")} to review since this decision`
      : "Nothing needs review from FlipForge's saved data";
    const sinceText = result.evaluatedAt ? `Saved ${dateOnly(result.evaluatedAt)}${result.ageDays !== null ? ` · ${plural(result.ageDays, "day")} ago` : ""} · ${result.reEvaluations ? plural(result.reEvaluations, "re-evaluation") : "not re-evaluated since"}` : "";
    const item = s => `<li data-level="${s.level}" data-ffdm-signal="${escapeHtml(s.key)}" data-ffdm-category="${escapeHtml(s.category || "historical")}"><span class="ffdm-dot" aria-hidden="true"></span><div><strong>${escapeHtml(s.title)}</strong><p>${escapeHtml(s.detail)}</p><small>${escapeHtml(s.level === "review" ? `${categoryLabel(s.category)} · ${s.source}` : s.source)}</small></div></li>`;
    const changedEmpty = result.reEvaluations
      ? "No change was recorded at the latest re-evaluation, and saved evidence counts are unchanged."
      : "Nothing recorded: this card has not been re-evaluated since the decision, and saved evidence counts are unchanged.";
    const section = (group, body) => `<section class="ffdm-group" data-ffdm-group="${group.key}"><h3>${escapeHtml(group.title)}</h3>${body}</section>`;
    const list = signals => `<ul class="ffdm-signals">${signals.map(item).join("")}</ul>`;
    const parts = [];
    if (review.length) parts.push(section(GROUPS[0], list(review)));
    parts.push(section(GROUPS[1], groups.changed.length ? list(groups.changed) : `<p class="ffdm-muted" data-ffdm-empty="changed">${escapeHtml(recordedChanges ? "Recorded changes are listed under Needs your attention." : changedEmpty)}</p>`));
    const historical = groups.historical.length ? list(groups.historical) : "";
    if (historical) parts.push(compact && review.length ? `<details class="ffdm-more" data-ffdm-group="historical"><summary>${escapeHtml(GROUPS[2].title)} · ${plural(groups.historical.length, "note")}</summary>${historical}</details>` : section(GROUPS[2], historical));
    parts.push(section(GROUPS[3], `${groups["not-rechecked"].length ? list(groups["not-rechecked"]) : ""}<ul class="ffdm-scope-list" data-ffdm-scope>${result.scope.map(entry => `<li>${escapeHtml(entry)}</li>`).join("")}</ul><p class="ffdm-muted">FlipForge does not watch prices between re-evaluations. Everything above comes from your saved decision, saved evidence counts, re-evaluations you ran, and time. Decisions and receipts are never rescored.</p>`));
    return `<section class="ffdm" ${PANEL_ATTR}="${escapeHtml(id)}" data-ffdm-version="${VERSION}" data-review="${review.length}" aria-labelledby="ffdm-title-${escapeHtml(id)}">
      <header class="ffdm-head">
        <div><span class="ffdm-kicker">Decision Change Monitor™</span><h2 id="ffdm-title-${escapeHtml(id)}">${escapeHtml(headline)}</h2>${sinceText ? `<p class="ffdm-muted">${escapeHtml(sinceText)}</p>` : ""}</div>
        <div class="ffdm-state">${chip(result.verdict)}<small>Saved decision · unchanged</small></div>
      </header>
      ${parts.join("\n      ")}
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
          <span>${r.linked ? `${chip(r.verdict)} Max Buy ${escapeHtml(money(r.maxBuyCents, "not set"))}` : "No saved decision linked"} · Paid ${escapeHtml(money(r.costCents, "not entered"))}${r.paidVsMaxBuyCents !== null ? ` <em data-over="${r.paidVsMaxBuyCents > 0}">${escapeHtml(r.paidVsMaxBuyCents > 0 ? `${money(r.paidVsMaxBuyCents)} over Max Buy` : `${money(-r.paidVsMaxBuyCents)} under Max Buy`)}</em>` : ""}${r.exit ? ` · Exit difficulty: ${escapeHtml(r.exit.label)}` : ""}</span>
          ${r.review.length ? `<ul>${r.review.slice(0, 3).map(s => `<li>${escapeHtml(s.title)}</li>`).join("")}</ul>` : `<small>${escapeHtml(r.nextStep)}</small>`}
        </div>
        <div class="ffci-links">${SAFE_ID.test(r.id) ? `${r.linked ? `<a href="#/opportunities/${encodeURIComponent(r.id)}">Decision receipt</a>` : ""}<a href="#/tracking/${encodeURIComponent(r.id)}">Monitor</a>` : ""}</div>
      </li>`;
    return `<section class="ffci" ${COLLECTION_ATTR} data-ffci-version="${VERSION}" aria-labelledby="ffci-title">
      <header class="ffdm-head"><div><span class="ffdm-kicker">Collection Intelligence™</span><h2 id="ffci-title">${attention.length ? `${plural(attention.length, "card")} to review next` : "Nothing to review from saved data"}</h2>
        <p class="ffdm-muted">Each owned card next to the decision you saved for it. Cards keep their usual order.${view.unlinkedCount ? ` ${plural(view.unlinkedCount, "owned card")} ${view.unlinkedCount === 1 ? "has" : "have"} no linked saved decision.` : ""}</p></div></header>
      <div class="ffci-exposure" data-ffci-exposure>
        <div><span>Cost basis</span><strong>${escapeHtml(money(view.totalCostBasisCents))}</strong><small>${plural(view.count, "owned card")} · what you entered</small></div>
        <div data-tone="${view.unsupportedCostCents > 0 ? "warn" : ""}"><span>Without supported value</span><strong>${escapeHtml(money(view.unsupportedCostCents))}</strong><small>${plural(view.unsupportedCount, "card")} with no evidence-supported value</small></div>
        <div data-tone="${view.agedCostCents > 0 ? "warn" : ""}"><span>On decisions 30+ days old</span><strong>${escapeHtml(money(view.agedCostCents))}</strong><small>${plural(view.agedCount, "card")} to re-check</small></div>
        <div><span>Paid above Max Buy</span><strong>${escapeHtml(String(view.overMaxBuyCount))}</strong><small>Compared with the Max Buy at decision</small></div>
        <div data-tone="${view.reverifyCount > 0 ? "warn" : ""}" data-ffci-reverify><span>Need another look</span><strong>${view.reviewSignalStatus === "available" ? escapeHtml(String(view.reverifyCount)) : "—"}</strong><small>${view.reviewSignalStatus === "available" ? "Re-check due, verification pending, or evidence FlipForge no longer accepts" : "Review signals unavailable right now"}</small></div>
        <div data-tone="${view.hardExitCount > 0 ? "warn" : ""}" data-ffci-exits><span>Harder exits</span><strong>${escapeHtml(String(view.hardExitCount))}</strong><small>Few exact sales behind the decision</small></div>
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
    const [detail, lifecycle, alerts] = await Promise.allSettled([getJson(`/api/v1/opportunities/${encoded}`), getJson(`/api/v1/lifecycle/${encoded}`), getJson("/api/v1/alerts")]);
    if (serial !== state.serial) return;
    state.loading = "";
    state.key = key;
    const opportunity = detail.status === "fulfilled" && String(detail.value?.opportunity?.id || "") === id ? detail.value.opportunity : null;
    const lifeData = lifecycle.status === "fulfilled" ? lifecycle.value : null;
    const timeline = timelineOf(lifeData);
    const record = lifeData && lifeData.lifecycle && typeof lifeData.lifecycle === "object" ? lifeData.lifecycle : null;
    const model = opportunity ? dealModelOf(opportunity, timeline) : null;
    const feed = reviewSignalFeed(alerts.status === "fulfilled" ? alerts.value : null, alerts.status !== "fulfilled");
    state.result = { id, data: integrate(monitor(model, timeline, record), feed, { id, lifecycle: record, model }) };
  }

  async function loadCollection(key) {
    const serial = ++state.serial;
    state.loading = key;
    const [portfolio, opportunities, alerts] = await Promise.allSettled([getJson("/api/v1/portfolio"), getJson("/api/v1/opportunities"), getJson("/api/v1/alerts")]);
    if (serial !== state.serial) return;
    state.loading = "";
    state.key = key;
    state.collection = portfolio.status === "fulfilled" && portfolio.value?.kind === "portfolio"
      ? collection(portfolio.value, opportunities.status === "fulfilled" ? opportunities.value?.items : [], Date.now(),
        reviewSignalFeed(alerts.status === "fulfilled" ? alerts.value : null, alerts.status !== "fulfilled"))
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

  const api = Object.freeze({ version: VERSION, monitor, integrate, reviewSignalFeed, collection, monitorMarkup, collectionMarkup, timelineOf, dealModelOf, notMonitored: NOT_MONITORED });
  if (typeof window !== "undefined") {
    window.FlipForgeDecisionMonitor = api;
    if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
      else start();
    }
  }
})();
