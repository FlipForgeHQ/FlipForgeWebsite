(() => {
  "use strict";

  // Shared, display-only helpers for customer views. Nothing here calculates, changes or re-ranks a decision value:
  // every number shown is the number the API returned, and a missing number is shown as "Unavailable".
  //
  // - Risk and confidence read from the saved record (governedDecision first for risk), never from page text.
  // - Legacy results: records the server marks with evidenceProvenanceStatus other than "CURRENT" are labelled as
  //   saved before current evidence rules, with the server's legacyNotice. Records without the field show nothing.
  // - Source codes are mapped to customer wording: no provider names, no raw codes, no "verified" sales.
  // - Evidence rows render from what the API sends; when prices or dates are withheld, those columns are omitted
  //   rather than shown blank, "undefined" or "$0".
  if (window.FlipForgeTrustDisplay) return;

  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
  const LEGACY_BADGE = "Legacy result — saved before current evidence rules";
  const LEGACY_HISTORICAL = "Shown as the recommendation saved at the time. It is not presented as currently supported.";
  const PROVIDER_NAME = /card[\s_-]?sight/ig;
  const records = new Map();

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function finiteOrNull(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // "35/100" for a returned score, "Unavailable" when the API returned none. A real 0 stays 0.
  function scoreText(value) {
    const parsed = finiteOrNull(value);
    return parsed === null ? "Unavailable" : `${parsed}/100`;
  }

  function governed(record) {
    const value = record && typeof record === "object" ? record.governedDecision : null;
    return value && typeof value === "object" ? value : null;
  }

  // Decision risk as saved: the governed decision's risk when present, otherwise the record's risk.
  function riskValue(record) {
    const fromGoverned = finiteOrNull(governed(record)?.risk);
    return fromGoverned !== null ? fromGoverned : finiteOrNull(record?.risk);
  }

  // Display band for a saved risk score (same thresholds the card page has always used).
  function riskBand(value) {
    const parsed = finiteOrNull(value);
    if (parsed === null) return "Unavailable";
    const bounded = Math.max(0, Math.min(100, parsed));
    return bounded >= 70 ? "High" : bounded >= 35 ? "Moderate" : "Low";
  }

  function confidenceValue(record) {
    return finiteOrNull(record?.confidence);
  }

  function provenanceStatus(record) {
    const value = record && typeof record === "object" ? record.evidenceProvenanceStatus : null;
    return typeof value === "string" ? value.trim() : "";
  }

  // Only a record that carries the server's marker is a legacy result: evidenceProvenanceStatus with any value other
  // than a current one ("CURRENT" or "CURRENT_EVIDENCE_RULES"; LEGACY_PROVIDER_DERIVED and older spellings are legacy),
  // or the companion fields the server sets with it (currentlySupported: false, supportedValueStatus
  // LEGACY_NOT_CURRENTLY_SUPPORTED). Records without these fields show nothing extra.
  const LEGACY_SUPPORT_STATUS = "LEGACY_NOT_CURRENTLY_SUPPORTED";
  function isLegacy(record) {
    if (!record || typeof record !== "object") return false;
    const status = provenanceStatus(record);
    if (status && !/^CURRENT(?:_|$)/i.test(status)) return true;
    if (status && /^CURRENT/i.test(status)) return false;
    return record.currentlySupported === false
      || String(record.supportedValueStatus || "").toUpperCase() === LEGACY_SUPPORT_STATUS;
  }

  // Values exactly as saved at decision time for a legacy result (the server moves them to legacySavedValues and
  // nulls the live fields). Shown only as "Saved value at the time (legacy)", never as current support.
  function legacySavedValues(record) {
    if (!record || typeof record !== "object") return { supported: null, maxBuy: null };
    const sources = [record.legacySavedValues, record.governedDecision?.legacySavedValues, record.decisionTime?.legacySavedValues]
      .filter(value => value && typeof value === "object");
    let supported = null;
    let maxBuy = null;
    for (const saved of sources) {
      if (supported === null) {
        const dollars = finiteOrNull(saved.supportedValue);
        const cents = finiteOrNull(saved.supportedValueCents);
        supported = dollars !== null ? dollars : cents !== null ? cents / 100 : null;
      }
      if (maxBuy === null) {
        const cents = finiteOrNull(saved.maximumBuyPriceCents);
        maxBuy = cents !== null ? cents / 100 : null;
      }
    }
    return { supported, maxBuy };
  }

  function legacySavedValuesText(record) {
    const saved = legacySavedValues(record);
    return [
      saved.supported !== null ? `Saved value at the time (legacy): ${money(saved.supported)}` : "",
      saved.maxBuy !== null ? `Max Buy at the time (legacy): ${money(saved.maxBuy)}` : ""
    ].filter(Boolean).join(" · ");
  }

  function legacySavedValuesMarkup(record) {
    const textValue = isLegacy(record) ? legacySavedValuesText(record) : "";
    return textValue ? `<small class="ff-legacy-saved-values" data-ff-legacy-saved-values>${escapeHtml(textValue)}</small>` : "";
  }

  // Dollars as returned, or "Unavailable" for a missing value (never $0 for null).
  function moneyOrUnavailable(value) {
    return money(value) || "Unavailable";
  }

  function customerText(value) {
    return String(value ?? "").replace(PROVIDER_NAME, "our data provider");
  }

  function legacyNotice(record) {
    const notice = record && typeof record.legacyNotice === "string" ? record.legacyNotice.trim() : "";
    return customerText(notice);
  }

  function legacyMarkup(record, options = {}) {
    if (!isLegacy(record)) return "";
    const notice = legacyNotice(record);
    const compact = options.compact === true;
    const tag = compact ? "span" : "div"; // compact: inline in a table cell; both show the badge and the notice
    return `<${tag} class="ff-legacy-result${compact ? " ff-legacy-result-compact" : ""}" data-ff-legacy-result role="note">`
      + `<strong class="ff-legacy-badge">${escapeHtml(LEGACY_BADGE)}</strong>`
      + (notice ? `<span class="ff-legacy-notice">${escapeHtml(notice)}</span>` : "")
      + `</${tag}>`;
  }

  // Admission reasons and provider states in customer wording (codes are never shown raw).
  const REASON_LABELS = Object.freeze({
    PROVIDER_STORED_HISTORY_NOT_RETAINED: "Past sale records from our data provider are not kept",
    STORED_HISTORY_NOT_RETAINED: "Past sale records from our data provider are not kept",
    NOT_USED: "Not used",
    EXCLUDED: "Excluded",
    HELD: "Held for review"
  });
  function reasonLabel(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "Not counted";
    if (REASON_LABELS[raw.toUpperCase()]) return REASON_LABELS[raw.toUpperCase()];
    if (/^[A-Z0-9_]+$/.test(raw)) {
      const words = raw.toLowerCase().replace(/card_?sight/g, "data provider").split("_").filter(Boolean).join(" ");
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
    return customerText(raw);
  }

  // Derived-only summary of data-provider evidence (new API: providerEvidenceSummary). Counts and reasons only: the
  // API withholds individual prices, dates, links and titles, so no sale table is drawn for these rows.
  function providerSummary(evidence) {
    const summary = evidence && typeof evidence === "object" ? evidence.providerEvidenceSummary : null;
    if (!summary || typeof summary !== "object") return null;
    const linked = finiteOrNull(summary.storedRowsLinked) ?? 0;
    const admitted = finiteOrNull(summary.storedRowsAdmittedNow) ?? 0;
    const reasons = summary.storedRowReasons && typeof summary.storedRowReasons === "object"
      ? Object.entries(summary.storedRowReasons).map(([reason, count]) => [reasonLabel(reason), finiteOrNull(count) ?? 0]).filter(([, count]) => count > 0)
      : [];
    return {
      label: customerText(summary.label || "Reported completed sale (data provider)"),
      linked, admitted, notCounted: Math.max(0, linked - admitted), reasons,
      liveAvailable: summary.liveAvailable === true,
      liveQualifiedSales: finiteOrNull(summary.liveQualifiedSales) ?? 0,
      liveExpiresAt: typeof summary.liveExpiresAt === "string" ? summary.liveExpiresAt : ""
    };
  }

  function providerSummaryMarkup(evidence) {
    const summary = providerSummary(evidence);
    if (!summary || (!summary.linked && !summary.liveAvailable)) return "";
    const reasons = summary.reasons.length
      ? `<ul class="ff-provider-evidence-reasons">${summary.reasons.map(([reason, count]) => `<li><strong>${escapeHtml(count)}</strong> ${escapeHtml(reason)}</li>`).join("")}</ul>`
      : "";
    const live = summary.liveAvailable
      ? `<p>${escapeHtml(summary.liveQualifiedSales)} current reported sale${summary.liveQualifiedSales === 1 ? "" : "s"} from our data provider ${summary.liveQualifiedSales === 1 ? "was" : "were"} checked for this card${summary.liveExpiresAt ? ` (kept until ${escapeHtml(summary.liveExpiresAt.slice(0, 10))})` : ""}. Past sale records from our data provider are not kept.</p>`
      : "";
    return `<div class="ff-provider-evidence-summary" data-ff-provider-evidence-summary role="note">`
      + `<strong>${escapeHtml(summary.label)}: ${escapeHtml(summary.admitted)} counted now · ${escapeHtml(summary.notCounted)} not counted</strong>`
      + `<span>Individual sale prices, dates and links from our data provider are not shown. Counts and reasons are shown instead.</span>`
      + reasons + live + `</div>`;
  }

  const PROVIDER_UNAVAILABLE = "Provider evidence is currently unavailable.";

  // Generic customer wording for any source or evidence-type code.
  function sourceLabel(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const upper = raw.toUpperCase();
    if (upper.includes("EBAY")) return "eBay (reported sale)";
    if (upper.startsWith("SOLD_COMP")) return "Reported completed sale";
    if (/card[\s_-]?sight/i.test(raw) || /^(?:PROVIDER|DATA_PROVIDER)$/i.test(raw)) return "our data provider";
    if (/^[A-Z0-9_]+$/.test(raw)) {
      return raw.toLowerCase().split("_").filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    }
    return customerText(raw);
  }

  // Sentence case for a label that starts a cell ("Our data provider"); brand casing such as "eBay" is kept.
  function capitalized(value) {
    const text = String(value || "");
    return /^our /.test(text) ? `O${text.slice(1)}` : text;
  }

  function sourceCell(item) {
    const source = capitalized(sourceLabel(item?.sourceName || item?.sourceMarketplace || item?.source || item?.provider)) || "Saved source";
    const type = sourceLabel(item?.type);
    return { source, type: type && type !== source ? type : "" };
  }

  // Evidence availability, stated accurately (founder instruction 2026-10-31). Our data provider stays suspended and its
  // sale records are not kept; FlipForge's authorized independent completed-sale evidence is a separate source that is
  // kept, but it may hold no sales of a given card. No wording may imply a new evaluation always finds current sales.
  const EVIDENCE_WORDING = Object.freeze({
    providerNotKept: "Sale records from our restricted data provider aren't kept",
    newEvaluation: "A new evaluation uses only FlipForge's authorized independent completed-sale evidence, which may have no sales of this exact card."
  });
  // The server's LIVE_PRICING_ONLY label ("Current sales of this exact card are checked when you evaluate it; past sale
  // records are not kept.") reads as if every evaluation finds current sales. It is replaced with the accurate wording.
  const LIVE_PRICING_ONLY_LABEL = `No price shown. ${EVIDENCE_WORDING.providerNotKept}. ${EVIDENCE_WORDING.newEvaluation}`;
  function priceStatusLabel(...candidates) {
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const label = typeof candidate.priceStatusLabel === "string" ? candidate.priceStatusLabel.trim() : "";
      if (String(candidate.priceStatus || "").toUpperCase() === "LIVE_PRICING_ONLY" || /checked when you evaluate it/i.test(label)) return LIVE_PRICING_ONLY_LABEL;
      if (label) return customerText(label);
    }
    return "";
  }

  function money(value) {
    const parsed = finiteOrNull(value);
    if (parsed === null) return "";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(parsed);
  }

  function dateText(item) {
    const value = String(item?.soldAt || item?.recordedAt || item?.saleDate || "").trim();
    if (!value || value === "undefined" || value === "null") return "";
    return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
  }

  // Evidence rows from whatever the API returned. Price and date columns appear only when at least one row has them;
  // otherwise the table is built from source, category, identity and status alone.
  function evidenceTable(items, options = {}) {
    const rows = Array.isArray(items) ? items : [];
    const showAmount = rows.some(item => money(item?.amount ?? item?.salePrice) !== "");
    const showDate = rows.some(item => dateText(item) !== "");
    const identityCell = typeof options.identityCell === "function" ? options.identityCell : () => "";
    const statusCell = typeof options.statusCell === "function" ? options.statusCell : () => "";
    const tableAttributes = options.tableAttributes ? ` ${options.tableAttributes}` : "";
    const head = [
      "<th>Source</th>",
      showAmount ? "<th>Amount</th>" : "",
      showDate ? "<th>Sale date</th>" : "",
      `<th>${escapeHtml(options.identityHeading || "Identity")}</th>`,
      `<th>${escapeHtml(options.statusHeading || "Authority")}</th>`
    ].join("");
    const body = rows.map(item => {
      const cell = sourceCell(item);
      const detail = [cell.type, options.sourceSuffix || ""].filter(Boolean).join(" · ");
      return `<tr><td><strong>${escapeHtml(cell.source)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</td>`
        + (showAmount ? `<td>${escapeHtml(money(item?.amount ?? item?.salePrice) || "Not shown")}</td>` : "")
        + (showDate ? `<td>${escapeHtml(dateText(item) || "Not shown")}</td>` : "")
        + `<td>${identityCell(item)}</td><td>${statusCell(item)}</td></tr>`;
    }).join("");
    const note = !showAmount && rows.length
      ? `<p class="ff-evidence-withheld-note">Individual sale prices${showDate ? "" : " and dates"} are not shown for these rows. Counts and categories are shown instead.</p>`
      : "";
    return `${note}<div class="table-wrap"><table${tableAttributes}><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // The card the customer is working on, remembered for this browser session by tracking-context-v1.js. Returned only
  // when the given list (this tenant's saved cards) contains it. Read only; storage may be unavailable: never throws.
  const ACTIVE_CARD_KEY = "flipforge.trackingContext.v1";
  function activeCardId(ids) {
    let value = "";
    try { value = String(window.sessionStorage.getItem(ACTIVE_CARD_KEY) || ""); } catch (_) { value = ""; }
    return SAFE_ID.test(value) && Array.isArray(ids) && ids.map(String).includes(value) ? value : "";
  }

  // Saved records the page already loaded, so display helpers read API values instead of page text.
  function remember(record) {
    const id = String(record?.id || "");
    if (!SAFE_ID.test(id)) return;
    records.set(id, Object.freeze({ ...record }));
  }

  function recordFor(idOrNode) {
    const id = typeof idOrNode === "string"
      ? idOrNode
      : String(idOrNode?.closest?.("[data-ff-card-id]")?.getAttribute("data-ff-card-id")
        || idOrNode?.querySelector?.("[data-ff-card-id]")?.getAttribute("data-ff-card-id") || "");
    return records.get(id) || null;
  }

  // ---- Customer wording for saved-decision history (2026-10-31) ------------------------------------------------
  // The decision timeline sends structured changes {code, before, after, description}. Customers see plain language:
  // money in dollars (the API sends cents), verdicts and profit checks in words, and no internal workflow states.
  // Nothing here computes a value; it only re-words what the saved snapshots recorded.

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  /** "2026-10-31T13:55:33.866Z" -> "Oct 31, 2026, 1:55 PM UTC" (or the date only). Non-ISO text is returned as is. */
  function readableDateTime(value, { dateOnly = false } = {}) {
    const raw = typeof value === "string" ? value.trim() : "";
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::[\d.]+)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(raw);
    if (!m) return raw;
    const month = Number(m[2]);
    if (month < 1 || month > 12) return raw;
    const date = `${MONTHS[month - 1]} ${Number(m[3])}, ${m[1]}`;
    if (dateOnly || m[4] === undefined) return date;
    // Times are shown in UTC exactly as recorded, so the wording never depends on the viewer's clock.
    let utc = new Date(raw);
    if (Number.isNaN(utc.getTime())) return date;
    const h = utc.getUTCHours(), min = utc.getUTCMinutes();
    const utcDate = `${MONTHS[utc.getUTCMonth()]} ${utc.getUTCDate()}, ${utc.getUTCFullYear()}`;
    return `${utcDate}, ${((h + 11) % 12) + 1}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} UTC`;
  }

  /** A recorded count as text; a missing value reads "unavailable" and is never shown as 0. */
  function countText(value) {
    if (value === null || value === undefined || typeof value === "boolean") return "unavailable";
    if (typeof value === "string" && value.trim() === "") return "unavailable";
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : "unavailable";
  }
  function centsText(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return "";
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    const abs = Math.abs(Math.round(n)) / 100;
    return `${n < 0 ? "−" : ""}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const GATE_WORDS = Object.freeze({
    BUY_ELIGIBLE: "meets the buying standard",
    MARGIN_OF_SAFETY_NOT_MET: "below the safety margin",
    NEGATIVE_NET_ECONOMICS: "loses money at this price",
    EXPECTED_LOSS: "loses money at this price",
    CONSERVATIVE_LOSS: "could lose money at this price",
    INSUFFICIENT_EVIDENCE: "not enough evidence to judge",
    NOT_EVALUATED: "not checked",
    UNAVAILABLE: "not available"
  });
  const QUALITY_WORDS = Object.freeze({ STRONG: "strong", MODERATE: "moderate", LIMITED: "limited", WEAK: "weak", BLOCKED: "blocked", REVIEW: "needs review" });
  function words(code) {
    const value = String(code ?? "").trim();
    if (!value) return "not recorded";
    return /^[A-Z][A-Z0-9_]+$/.test(value) ? value.toLowerCase().replace(/_/g, " ") : value;
  }
  const MONEY_CHANGES = Object.freeze({
    ASK_CHANGED: "All-in ask",
    SUPPORTED_VALUE_CHANGED: "Supported value",
    MAXIMUM_BUY_PRICE_CHANGED: "Max Buy",
    EXPECTED_NET_PROFIT_CHANGED: "Expected profit at this price",
    CONSERVATIVE_NET_PROFIT_CHANGED: "Conservative profit at this price",
    STRESS_NET_PROFIT_CHANGED: "Stress-case profit at this price"
  });
  const COUNT_CHANGES = Object.freeze({
    ACCEPTED_EVIDENCE_CHANGED: "Accepted exact sales",
    REJECTED_EVIDENCE_CHANGED: "Sales not counted",
    REVIEW_EVIDENCE_CHANGED: "Sales held for review"
  });
  const SCORE_CHANGES = Object.freeze({ CONFIDENCE_CHANGED: "Confidence", RISK_CHANGED: "Risk", LIQUIDITY_CHANGED: "Liquidity" });
  // Internal states a customer never needs: the verdict line already says what changed for them.
  const HIDDEN_CHANGES = new Set(["WORKFLOW_STATUS_CHANGED", "RECOMMENDATION_AUTHORITY_CHANGED", "GRADING_AUTHORITY_CHANGED"]);

  // The server's own sentence, with internal codes put into words and a closing period.
  function describedLine(text) {
    const description = typeof text === "string" ? text.trim() : "";
    if (!description) return "";
    const cleaned = description.replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, token => words(token));
    return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
  }

  function changeLine(change) {
    if (!change || typeof change !== "object") return "";
    const code = String(change.code || "").toUpperCase();
    const { before, after } = change;
    if (HIDDEN_CHANGES.has(code)) return "";
    // A structured entry without its before/after values keeps the server's own sentence (review on #604): older saved
    // timelines record "All-in ask fell from $680.00 to $599.95" as a description only.
    const hasValues = Object.prototype.hasOwnProperty.call(change, "before") && Object.prototype.hasOwnProperty.call(change, "after");
    if (!hasValues && typeof change.description === "string" && change.description.trim()) return describedLine(change.description);
    if (code === "DECISION_CHANGED") return `Decision changed from ${words(before)} to ${words(after)}.`.replace(/from (\w+) to (\w+)/, (_, a, b) => `from ${a.toUpperCase()} to ${b.toUpperCase()}`);
    if (MONEY_CHANGES[code]) {
      const from = centsText(before), to = centsText(after);
      return from && to ? `${MONEY_CHANGES[code]} changed from ${from} to ${to}.` : `${MONEY_CHANGES[code]} changed.`;
    }
    if (COUNT_CHANGES[code]) return `${COUNT_CHANGES[code]} changed from ${countText(before)} to ${countText(after)}.`;
    if (SCORE_CHANGES[code]) return `${SCORE_CHANGES[code]} changed from ${countText(before)} to ${countText(after)}.`;
    if (code === "PROFITABILITY_GATE_CHANGED") {
      return `Profit check changed from "${GATE_WORDS[before] || words(before)}" to "${GATE_WORDS[after] || words(after)}".`;
    }
    if (code === "PROFITABILITY_POLICY_CHANGED") return "FlipForge's profit rules were updated between these evaluations.";
    if (code === "EVIDENCE_QUALITY_CHANGED") return `Evidence quality changed from ${QUALITY_WORDS[before] || words(before)} to ${QUALITY_WORDS[after] || words(after)}.`;
    if (code === "IDENTITY_ELIGIBILITY_CHANGED") return after === true || after === "true" ? "The exact card match was confirmed." : "The exact card match was no longer confirmed.";
    // Anything new: the server's own sentence, with internal codes put into words.
    return describedLine(change.description);
  }

  // Which recorded sentence a structured change already covers, so the same change is never listed twice.
  const CHANGE_TOPICS = Object.freeze({
    DECISION_CHANGED: /^decision changed/i, ASK_CHANGED: /\bask\b/i, SUPPORTED_VALUE_CHANGED: /supported value/i,
    MAXIMUM_BUY_PRICE_CHANGED: /max(imum)?[ -]?buy/i, EXPECTED_NET_PROFIT_CHANGED: /expected (net )?profit/i,
    CONSERVATIVE_NET_PROFIT_CHANGED: /conservative/i, STRESS_NET_PROFIT_CHANGED: /stress/i,
    ACCEPTED_EVIDENCE_CHANGED: /accepted (evidence|exact sales)/i, REJECTED_EVIDENCE_CHANGED: /rejected evidence|not counted/i,
    REVIEW_EVIDENCE_CHANGED: /review evidence|held for review/i, CONFIDENCE_CHANGED: /confidence/i, RISK_CHANGED: /\brisk\b/i,
    LIQUIDITY_CHANGED: /liquidity/i, PROFITABILITY_GATE_CHANGED: /profit(ability)? (check|gate)/i,
    PROFITABILITY_POLICY_CHANGED: /profit(ability)? (rules|policy)/i, EVIDENCE_QUALITY_CHANGED: /evidence quality/i,
    IDENTITY_ELIGIBILITY_CHANGED: /identity|card match/i, WORKFLOW_STATUS_CHANGED: /workflow status/i
  });
  const sameLine = (a, b) => a.replace(/[.\s]+$/, "").toLowerCase() === b.replace(/[.\s]+$/, "").toLowerCase();

  /**
   * Customer lines for one timeline entry. Structured changes are used where they carry their values; any recorded
   * sentence (whatChanged) they do not already cover is kept, so no saved history detail is lost.
   */
  function customerChangeLines(entry) {
    const structured = Array.isArray(entry?.changes) ? entry.changes.filter(change => change && typeof change === "object") : [];
    const lines = structured.map(changeLine).filter(Boolean);
    const covered = structured.map(change => CHANGE_TOPICS[String(change.code || "").toUpperCase()]).filter(Boolean);
    const sentences = Array.isArray(entry?.whatChanged) ? entry.whatChanged : [];
    for (const sentence of sentences) {
      const line = describedLine(String(sentence || ""));
      if (!line || /^workflow status changed/i.test(line)) continue;
      if (covered.some(topic => topic.test(line)) || lines.some(existing => sameLine(existing, line))) continue;
      lines.push(line);
    }
    return lines;
  }

  /**
   * Customer wording for a failed request. Internal codes (RESOURCE_NOT_FOUND, …) are never the headline; the code is
   * kept only as a small reference a customer can quote to support.
   */
  function customerErrorText(error, subject = "this") {
    const code = String(error?.code || "").toUpperCase();
    const status = Number(error?.status);
    if (code === "RESOURCE_NOT_FOUND" || status === 404) return { title: `Nothing saved for ${subject} yet.`, detail: "Nothing was filled in or estimated in its place.", reference: "" };
    if (status === 401) return { title: "Sign in again to see this.", detail: "Your session ended.", reference: code };
    if (status === 403) return { title: "Your account doesn't have access to this.", detail: "Ask your FlipForge workspace owner for access.", reference: code };
    const message = typeof error?.message === "string" && error.message.trim() && !/^[A-Z][A-Z0-9_]+$/.test(error.message.trim()) ? error.message.trim() : "";
    return { title: `Couldn't load ${subject} right now.`, detail: message || "Try again in a moment. Nothing was filled in or estimated in its place.", reference: code };
  }

  window.FlipForgeTrustDisplay = Object.freeze({
    LEGACY_BADGE,
    LEGACY_HISTORICAL,
    LEGACY_SUPPORT_STATUS,
    PROVIDER_UNAVAILABLE,
    legacySavedValues,
    legacySavedValuesText,
    legacySavedValuesMarkup,
    moneyOrUnavailable,
    reasonLabel,
    providerSummary,
    providerSummaryMarkup,
    escapeHtml,
    scoreText,
    riskValue,
    riskBand,
    confidenceValue,
    isLegacy,
    legacyNotice,
    legacyMarkup,
    customerText,
    sourceLabel,
    sourceCell,
    priceStatusLabel,
    evidenceTable,
    remember,
    recordFor,
    activeCardId,
    EVIDENCE_WORDING,
    readableDateTime,
    centsText,
    countText,
    customerChangeLines,
    customerErrorText
  });
})();
