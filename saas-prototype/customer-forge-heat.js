(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const HEAT_VERSION = "FORGE_HEAT_V1";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

  const state = {
    main: null,
    loading: false,
    payload: null,
    error: null,
    tab: "top5",
    generation: 0
  };

  function productionHost() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
  }

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function activeGeneration(generation) {
    return generation === state.generation && routeName() === "forge-heat";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `forge-heat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function moneyCents(value) {
    if (!Number.isSafeInteger(value)) return "Unavailable";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value / 100);
  }

  function signedMoneyCents(value) {
    if (!Number.isSafeInteger(value)) return "Unavailable";
    const formatted = moneyCents(Math.abs(value));
    return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
  }

  function signedPercent(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "Unavailable";
    return `${parsed > 0 ? "+" : ""}${parsed.toFixed(1)}%`;
  }

  function validEnvelope(payload, expectedCorrelationId) {
    const meta = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.meta : null;
    return Boolean(meta)
      && meta.contractVersion === CONTRACT_VERSION
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId
      && Object.prototype.hasOwnProperty.call(payload, "data");
  }

  function validOpportunity(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if (!SAFE_ID.test(String(item.requestId || "")) || !SAFE_ID.test(String(item.opportunityId || ""))) return false;
    if (typeof item.cardIdentity !== "string" || !item.cardIdentity.trim()) return false;
    if (!Number.isInteger(item.heat) || item.heat < 0 || item.heat > 100) return false;
    if (!Number.isInteger(item.confidence) || item.confidence < 0 || item.confidence > 100) return false;
    if (!Number.isInteger(item.risk) || item.risk < 0 || item.risk > 100) return false;
    if (!Number.isInteger(item.acceptedExactSales) || item.acceptedExactSales < 3) return false;
    if (!Number.isSafeInteger(item.allInAskCents) || item.allInAskCents <= 0) return false;
    if (!Number.isSafeInteger(item.supportedValueCents) || item.supportedValueCents <= item.allInAskCents) return false;
    if (!Number.isSafeInteger(item.supportedValueGapCents) || item.supportedValueGapCents <= 0) return false;
    if (!Number.isFinite(Number(item.supportedValueGapPct)) || Number(item.supportedValueGapPct) <= 0) return false;
    if (!Array.isArray(item.whyHot) || !Array.isArray(item.couldCool) || !Array.isArray(item.invalidates)) return false;
    if (item.transactionAuthority !== false) return false;
    return item.recommendation === "BUY" || item.recommendation === "WATCH";
  }

  function validData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    if (data.kind !== "forge-heat" || data.heatVersion !== HEAT_VERSION || data.proFeature !== true) return false;
    if (!data.access || typeof data.access.allowed !== "boolean" || data.access.requiredPlan !== "PRO") return false;
    if (!data.authority || data.authority.recommendationAuthority !== "Smart Opportunity") return false;
    if (data.authority.forgeHeatRecommendationAuthority !== false || data.authority.clientComputed !== false || data.authority.transactionAuthority !== false) return false;
    if (!data.scope || data.scope.code !== "SAVED_EVALUATED_UNIVERSE" || data.scope.marketWide !== false || data.scope.continuousMarketScannerActive !== false) return false;
    if (!Array.isArray(data.top5) || !Array.isArray(data.hiddenGems) || !Array.isArray(data.highestEdge)) return false;
    if (data.locked === true) return data.top5.length === 0 && data.hiddenGems.length === 0 && data.highestEdge.length === 0;
    return [...data.top5, ...data.hiddenGems, ...data.highestEdge].every(validOpportunity);
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      throw Object.assign(new Error("The Forge Heat response exceeded the browser safety limit."), { code: "FORGE_HEAT_RESPONSE_TOO_LARGE" });
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw Object.assign(new Error("The Forge Heat gateway returned invalid JSON."), { code: "FORGE_HEAT_INVALID_JSON" });
    }
  }

  async function load() {
    const requestCorrelationId = correlationId();
    const response = await fetch("/api/v1/forge-heat?limit=500", {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Forge Heat request failed with status ${response.status}.`), {
        code: upstream.code || "FORGE_HEAT_REQUEST_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    if (!validEnvelope(payload, requestCorrelationId) || !validData(payload.data)) {
      throw Object.assign(new Error("The Forge Heat response failed the FlipForge authority contract."), { code: "FORGE_HEAT_CONTRACT_INVALID" });
    }
    return payload;
  }

  function bandLabel(value) {
    return ({
      WHITE_HOT: "WHITE HOT",
      HOT: "HOT",
      HEATING_UP: "HEATING UP",
      WARM: "WARM"
    })[String(value || "")] || "HEAT";
  }

  function list(items) {
    const values = safeArray(items).filter(value => typeof value === "string" && value.trim());
    if (!values.length) return `<li>No additional factor was reported.</li>`;
    return values.map(value => `<li>${escapeHtml(value)}</li>`).join("");
  }

  // What the customer would keep at the supported value after their own saved selling costs (from Sell Watch). The
  // server computes every figure; rows that are not exactly as expected are not shown.
  const AFTER_COST_CHANNELS = ["MARKETPLACE", "AUCTION_HOUSE", "CONSIGNMENT", "DEALER", "PRIVATE_SALE", "OTHER"];
  function afterCostRows(item) {
    if (!Array.isArray(item?.afterYourCosts)) return [];
    return item.afterYourCosts.filter(row => row && typeof row === "object"
      && AFTER_COST_CHANNELS.includes(row.channel) && typeof row.channelName === "string" && row.channelName.trim()
      && row.atPriceCents === item.supportedValueCents
      && [row.keepCents, row.yourCostsCents, row.differenceFromAskCents].every(Number.isSafeInteger)
      && row.yourCostsCents >= 0 && row.keepCents + row.yourCostsCents === row.atPriceCents
      && row.differenceFromAskCents === row.keepCents - item.allInAskCents);
  }

  function afterCostsBlock(item) {
    const rows = afterCostRows(item);
    if (!rows.length) return "";
    return `<div class="forge-heat-after-costs" data-forge-heat-after-costs><span class="forge-heat-section-label">After your selling costs</span><ul>${rows.map(row =>
      `<li><strong>${escapeHtml(row.channelName)}:</strong> at the supported value of ${moneyCents(row.atPriceCents)}, you would keep ${moneyCents(row.keepCents)} after ${moneyCents(row.yourCostsCents)} of your costs, ${row.differenceFromAskCents >= 0 ? `${moneyCents(row.differenceFromAskCents)} more` : `${moneyCents(-row.differenceFromAskCents)} less`} than the all-in ask.</li>`
    ).join("")}</ul><small>From the costs you saved in Sell Watch. For reference only: Heat and the decision do not use it.</small></div>`;
  }

  // The ranked view ("control room"), rendered from the server's data. It replaces forge-heat-control-room-v2.js,
  // which rebuilt this view by reading the text of rendered cards back out of the page.
  function heatTone(heat) {
    const n = Number(heat);
    if (!Number.isFinite(n)) return "neutral";
    if (n >= 90) return "white";
    if (n >= 80) return "hot";
    if (n >= 70) return "heating";
    if (n >= 60) return "warm";
    return "cool";
  }

  function factors(items) {
    const values = safeArray(items).filter(value => typeof value === "string" && value.trim());
    return values.length ? values : ["No additional factor was reported."];
  }

  function confidenceText(item) {
    return item.confidence === null || item.confidence === undefined || item.confidence === "" || !Number.isFinite(Number(item.confidence))
      ? "Unavailable" : `${item.confidence}/100`;
  }

  function firstAfterCosts(item) {
    const row = afterCostRows(item)[0];
    if (!row) return "—";
    return `${row.differenceFromAskCents >= 0 ? "+" : "−"}${moneyCents(Math.abs(row.differenceFromAskCents))} vs ask <small>${escapeHtml(row.channelName)}</small>`;
  }

  function controlRoom(items) {
    const rows = safeArray(items);
    const lead = rows[0];
    const withCosts = rows.some(item => afterCostRows(item).length);
    const gap = item => `${signedMoneyCents(item.supportedValueGapCents)} ${signedPercent(item.supportedValueGapPct)}`;
    const id = item => SAFE_ID.test(String(item.opportunityId || "")) ? item.opportunityId : "";
    return `<section class="ff-heat-control-room" data-ff-heat-control-room-source="data" aria-label="Forge Heat ranked opportunity intelligence">
      <div class="ff-heat-console-head">
        <div><span class="eyebrow">LIVE RANKING · GOVERNED SAVED EVALUATIONS</span><h2>🔥 Forge Heat — ${escapeHtml(rows.length > 5 ? "Top Opportunities" : `Top ${rows.length}`)}</h2></div>
        <span class="ff-heat-live-dot">LIVE</span>
      </div>
      <div class="ff-heat-console-grid">
        <div class="ff-heat-table-wrap">
          <table class="ff-heat-table">
            <thead><tr><th>Rank</th><th>Card</th><th>Heat</th><th>Ask</th><th>Supported</th><th>Value Gap</th>${withCosts ? "<th>After your costs</th>" : ""}<th>Confidence</th><th>Evidence</th><th>Risk</th></tr></thead>
            <tbody>${rows.map(item => `<tr>
              <td class="ff-heat-rank-cell">#${escapeHtml(item.rank)}</td>
              <td><strong>${escapeHtml(item.cardIdentity)}</strong><small>${escapeHtml(item.recommendation)}</small></td>
              <td><span class="ff-heat-score-pill" data-tone="${heatTone(item.heat)}">🔥 ${escapeHtml(item.heat)}</span></td>
              <td>${moneyCents(item.allInAskCents)}</td><td>${moneyCents(item.supportedValueCents)}</td><td class="ff-heat-positive">${escapeHtml(gap(item))}</td>
              ${withCosts ? `<td>${firstAfterCosts(item)}</td>` : ""}
              <td>${escapeHtml(confidenceText(item))}</td><td>${escapeHtml(item.acceptedExactSales)} sales</td><td>${escapeHtml(item.risk)}/100</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
        <aside class="ff-heat-band-panel">
          <span class="eyebrow">HEAT SCORE</span><strong>Evidence-adjusted rank</strong><small>0–100 presentation of backend-returned Forge Heat.</small>
          <div class="ff-heat-bands">
            <div><b>90–100</b><span>WHITE HOT 🔥🔥🔥</span></div>
            <div><b>80–89</b><span>HOT 🔥🔥</span></div>
            <div><b>70–79</b><span>HEATING UP 🔥</span></div>
            <div><b>60–69</b><span>WARM</span></div>
            <div><b>&lt;60</b><span>LOWER HEAT</span></div>
          </div>
        </aside>
      </div>
      <div class="ff-heat-deep-grid">
        <article class="ff-heat-deep-dive">
          <span class="eyebrow">DEEP DIVE TRACEBACK · #${escapeHtml(lead.rank)}</span>
          <h3>${escapeHtml(lead.cardIdentity)}</h3>
          <div class="ff-heat-deep-metrics"><div><span>Value gap</span><strong>${escapeHtml(gap(lead))}</strong></div><div><span>Confidence</span><strong>${escapeHtml(confidenceText(lead))}</strong></div><div><span>Risk</span><strong>${escapeHtml(lead.risk)}/100</strong></div><div><span>Evidence</span><strong>${escapeHtml(lead.acceptedExactSales)} sales</strong></div></div>
          ${afterCostsBlock(lead)}
          ${id(lead) ? `<a class="button button-secondary" href="#/opportunities/${escapeHtml(id(lead))}">Open Smart Opportunity decision →</a>` : ""}
        </article>
        <article class="ff-heat-gates">
          <span class="eyebrow">QUALIFICATION TRACE</span><h3>Why it surfaced</h3><ul>${factors(lead.whyHot).map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
        </article>
        <article class="ff-heat-cool">
          <span class="eyebrow">RISK CHECK</span><h3>What could cool it</h3><ul>${factors(lead.couldCool).map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
        </article>
      </div>
      <div class="ff-heat-authority-strip"><strong>Smart Opportunity remains the decision authority.</strong><span>Forge Heat ranks qualified saved evaluations; it does not create a second BUY/WATCH/VERIFY/PASS authority or authorize transactions.${withCosts ? " Amounts after your selling costs are for reference only." : " It does not estimate profit."}</span></div>
    </section>`;
  }

  // Plain-language versions of the server's reasons a saved evaluation was not ranked. The server decides; the browser
  // only groups and counts the reasons it was given. Unknown reasons are shown under "Other".
  const REASON_GROUPS = [
    ["legacy", "Based on earlier sales FlipForge no longer uses", reason => /^LEGACY:/.test(reason)],
    ["sales", "Fewer than 3 exactly matched completed sales", reason => /exact (trusted )?completed sales are required/i.test(reason)],
    ["decision", "The decision is not BUY or WATCH", reason => /^Smart Opportunity is /i.test(reason)],
    ["value", "No evidence-supported value", reason => /Evidence-supported value is unavailable/i.test(reason)],
    ["gap", "Supported value is not above the asking price", reason => /does not exceed the all-in ask/i.test(reason)],
    ["ask", "No asking price was saved", reason => /positive all-in ask is required/i.test(reason)],
    ["confidence", "Confidence is below the minimum", reason => /Confidence is below/i.test(reason)],
    ["risk", "Risk is above the maximum", reason => /Risk exceeds/i.test(reason)],
    ["identity", "The exact card is not identified", reason => /identity is unavailable/i.test(reason)],
    ["age", "Evaluated more than 30 days ago", reason => /freshness window/i.test(reason)]
  ];

  function unscoredReasons(item) {
    if (!item || typeof item !== "object") return [];
    const reasons = Array.isArray(item.reasons) ? item.reasons.filter(reason => typeof reason === "string") : [];
    return item.evidenceProvenanceStatus === "LEGACY_PROVIDER_DERIVED" || item.legacyNotice ? ["LEGACY:", ...reasons] : reasons;
  }

  // The server's own counts over every evaluation that was not ranked (newer backends). Each code maps to the same
  // plain-language label as the preview grouping below; a code this page does not know is counted under "Other".
  const REASON_CODES = {
    LEGACY_DERIVED_EXCLUDED: "legacy",
    THIN_EXACT_EVIDENCE: "sales",
    DECISION_NOT_BUY_OR_WATCH: "decision",
    SUPPORTED_VALUE_UNAVAILABLE: "value",
    SUPPORTED_VALUE_NOT_ABOVE_ASK: "gap",
    ASK_MISSING: "ask",
    LOW_CONFIDENCE: "confidence",
    HIGH_RISK: "risk",
    CARD_IDENTITY_MISSING: "identity",
    OUTSIDE_FRESHNESS_WINDOW: "age"
  };

  function serverReasonRows(data) {
    const total = Number(data?.summary?.unscored);
    const counts = data?.summary?.unscoredReasonCounts;
    if (!Array.isArray(counts) || !counts.length || !Number.isInteger(total) || total <= 0) return null;
    const rows = new Map();
    for (const entry of counts) {
      const count = Number(entry?.count);
      // Malformed counts fall back to the preview grouping rather than showing numbers that cannot be right.
      if (!entry || typeof entry.code !== "string" || !Number.isInteger(count) || count <= 0 || count > total) return null;
      const group = REASON_GROUPS.find(([key]) => key === REASON_CODES[entry.code]);
      const label = group ? group[1] : "Other";
      rows.set(label, (rows.get(label) || 0) + count);
    }
    const order = [...REASON_GROUPS.map(([, label]) => label), "Other"];
    return { total, rows: [...rows.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0])) };
  }

  function reasonList(scope, rows) {
    return `<div class="forge-heat-why" data-forge-heat-why><span class="forge-heat-section-label">Why nothing qualifies yet</span><p>${escapeHtml(scope)}, by reason. A card can have more than one reason.</p><ul>${rows.map(([label, count]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(count)}</strong></li>`).join("")}</ul></div>`;
  }

  function reasonSummary(data) {
    const server = serverReasonRows(data);
    if (server) {
      const scope = `All ${server.total} of your evaluation${server.total === 1 ? "" : "s"} that ${server.total === 1 ? "was" : "were"} not ranked`;
      return reasonList(scope, server.rows).replace("data-forge-heat-why>", 'data-forge-heat-why data-forge-heat-why-source="server">');
    }
    const preview = safeArray(data?.unscoredPreview).filter(item => item && typeof item === "object");
    if (!preview.length) return "";
    const counts = new Map();
    for (const item of preview) {
      const groups = new Set();
      for (const reason of unscoredReasons(item)) {
        const group = REASON_GROUPS.find(([, , matches]) => matches(reason));
        groups.add(group ? group[1] : "Other");
      }
      if (!groups.size) groups.add("Other");
      // A legacy result is explained by that alone.
      const labels = groups.has(REASON_GROUPS[0][1]) ? [REASON_GROUPS[0][1]] : [...groups];
      for (const label of labels) counts.set(label, (counts.get(label) || 0) + 1);
    }
    const order = [...REASON_GROUPS.map(([, label]) => label), "Other"];
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]));
    const total = Number(data?.summary?.unscored);
    const scope = Number.isFinite(total) && total > preview.length
      ? `Your ${preview.length} most recent of ${total} evaluations that were not ranked`
      : `Your ${preview.length} evaluation${preview.length === 1 ? "" : "s"} that ${preview.length === 1 ? "was" : "were"} not ranked`;
    return reasonList(scope, rows);
  }

  function emptyState(tab, data) {
    const considered = Number(data?.summary?.latestEvaluationsConsidered);
    const copy = considered === 0
      ? "Forge Heat ranks the cards you evaluate. Evaluate a card to start."
      : tab === "hiddenGems"
      ? "No current saved evaluation satisfies the Hidden Gem evidence, confidence, risk, and Heat thresholds."
      : tab === "highestEdge"
        ? "No saved BUY/WATCH evaluation currently has enough evidence and positive supported-value gap to surface."
        : "No saved evaluation currently clears the Forge Heat V1 gates.";
    return `<section class="forge-heat-empty"${considered === 0 ? ' data-forge-heat-empty="none-evaluated"' : ""}><strong>No qualifying opportunities yet.</strong><p>${escapeHtml(copy)}</p>${considered === 0 ? "" : reasonSummary(data)}<a class="button button-primary" href="#/discover">Discover cards</a></section>`;
  }

  function historyBuilding(data) {
    const reason = data?.componentAvailability?.momentum?.reason || "Heat history is not yet sufficient.";
    return `<section class="forge-heat-history">
      <span class="forge-heat-history-icon" aria-hidden="true">↗</span>
      <div><span class="eyebrow">History building</span><h2>Heating Up is evidence-gated.</h2><p>${escapeHtml(reason)}</p><p>FlipForge will not manufacture momentum from a single snapshot. This view activates after governed Heat history exists.</p></div>
    </section>`;
  }

  function tabs() {
    const options = [
      ["top5", "🔥 Top 5"],
      ["hiddenGems", "💎 Hidden Gems"],
      ["highestEdge", "↗ Highest Edge"],
      ["heatingUp", "⚡ Heating Up"]
    ];
    return `<div class="forge-heat-tabs" role="tablist" aria-label="Forge Heat views">${options.map(([key, label]) =>
      `<button type="button" role="tab" data-heat-tab="${key}" aria-selected="${state.tab === key ? "true" : "false"}" class="${state.tab === key ? "is-active" : ""}">${label}</button>`
    ).join("")}</div>`;
  }

  function tabDescription(tab) {
    if (tab === "hiddenGems") return "High-confidence, lower-risk opportunities with deeper exact-sale support that simple discount sorting can overlook.";
    if (tab === "highestEdge") return "Largest positive gap between the saved all-in ask and evidence-supported value among Heat-eligible decisions. This is not net profit or ROI.";
    if (tab === "heatingUp") return "Opportunity acceleration requires governed Heat history and is intentionally unavailable until those snapshots exist.";
    return "The strongest evidence-adjusted opportunities in your saved evaluated universe.";
  }

  function lockedView(data) {
    return `<div class="forge-heat-shell">
      ${heading(data)}
      <section class="forge-heat-lock">
        <span class="forge-heat-lock-mark" aria-hidden="true">PRO</span>
        <div><span class="eyebrow">Premium intelligence</span><h2>Forge Heat is included with FlipForge Pro.</h2><p>${escapeHtml(data.upgradeMessage || "Upgrade to Pro to unlock evidence-adjusted opportunity ranking.")}</p><p>Your current plan: <strong>${escapeHtml(data.access?.currentPlan || "Unknown")}</strong></p><a class="button button-primary" href="#/account">View Plan &amp; Usage</a></div>
      </section>
    </div>`;
  }

  function heading(data) {
    const summary = data?.summary || {};
    return `<header class="forge-heat-hero">
      <div>
        <div class="forge-heat-title-row"><span class="eyebrow">PRO INTELLIGENCE · ${escapeHtml(data?.heatVersion || HEAT_VERSION)}</span><span class="forge-heat-pro-chip">PRO</span></div>
        <h1>Forge Heat™</h1>
        <p class="forge-heat-lead">Evidence-backed opportunity intelligence. FlipForge does not just find the gap—it tests whether the opportunity deserves to be trusted.</p>
      </div>
      <div class="forge-heat-boundary"><strong>Current scope</strong><span>Your saved, completed evaluation universe</span><small>Not market-wide yet · No browser-side scoring · No transaction authority</small></div>
      ${data && data.locked === false ? `<div class="forge-heat-summary">
        <div><span>Evaluations considered</span><strong>${escapeHtml(summary.latestEvaluationsConsidered ?? 0)}</strong></div>
        <div><span>Heat eligible</span><strong>${escapeHtml(summary.heatEligible ?? 0)}</strong></div>
        <div><span>Surfaced</span><strong>${escapeHtml(summary.surfaced ?? 0)}</strong></div>
        ${Number(summary.legacyDerivedExcluded) > 0 ? `<div data-ff-legacy-excluded><span>Legacy results not scored</span><strong>${escapeHtml(summary.legacyDerivedExcluded)}</strong></div>` : ""}
        <div><span>Engine</span><strong>V1</strong></div>
      </div>` : ""}
    </header>`;
  }

  function page(data) {
    if (data.locked) return lockedView(data);
    const selected = state.tab === "hiddenGems" ? data.hiddenGems
      : state.tab === "highestEdge" ? data.highestEdge
        : data.top5;
    const ranked = state.tab !== "heatingUp" && safeArray(selected).length > 0;
    const content = state.tab === "heatingUp"
      ? historyBuilding(data)
      : ranked ? "" : emptyState(state.tab, data);

    return `<div class="forge-heat-shell"${ranked ? ' data-ff-heat-control-room="true"' : ""}>
      ${heading(data)}
      ${ranked ? `${controlRoom(selected)}${tabs()}` : ""}
      <details class="forge-heat-intelligence-bar ff-trust-note">
        <summary>How a card becomes Heat-eligible</summary>
        <div><span>Identity</span><strong>Completed evaluation snapshot</strong></div>
        <div><span>Evidence gate</span><strong>≥ 3 matched exact sales</strong></div>
        <div><span>Authority</span><strong>Smart Opportunity</strong></div>
        <div><span>Heat calculation</span><strong>Server-owned</strong></div>
      </details>
      ${ranked ? "" : tabs()}
      <div class="forge-heat-tab-copy"><strong>${escapeHtml(state.tab === "top5" ? "Top 5" : state.tab === "hiddenGems" ? "Hidden Gems" : state.tab === "highestEdge" ? "Highest Edge" : "Heating Up")}</strong><span>${escapeHtml(tabDescription(state.tab))}</span></div>
      ${content}
      ${costsNote(data)}
      <section class="forge-heat-roadmap-boundary"><strong>What V1 does not fake</strong><p>Momentum, price stability, governed scarcity, ${data?.componentAvailability?.netEconomics?.available === true ? "" : "configurable selling-cost economics, "}market-wide scanning, and historical Heat performance remain unavailable until their server-side inputs are implemented and validated.</p></section>
    </div>`;
  }

  // Sell Watch is on but no selling costs are saved yet: say how to see amounts after costs (the server's own words).
  function costsNote(data) {
    const net = data?.componentAvailability?.netEconomics;
    if (!net || net.available !== false || net.affectsHeat !== false || typeof net.reason !== "string" || !net.reason.trim()) return "";
    return `<p class="forge-heat-costs-note" data-forge-heat-costs-note>${escapeHtml(net.reason)}</p>`;
  }

  function loading() {
    return `<div class="forge-heat-shell"><header class="forge-heat-hero"><div><span class="eyebrow">PRO INTELLIGENCE</span><h1>Forge Heat™</h1><p class="forge-heat-lead">Loading server-owned opportunity intelligence…</p></div></header><div class="staging-loading" role="status">Challenging saved decisions against Forge Heat gates…</div></div>`;
  }

  function errorView(error) {
    const signIn = error?.status === 401
      ? `<a class="button button-primary" href="${productionHost() ? "/production-auth.html?return=%2Fapp%2F%23%2Fforge-heat" : "/staging-auth.html?returnTo=%2Fsaas-prototype%2F%23%2Fforge-heat"}">Sign in securely</a>`
      : `<button class="button button-primary" type="button" data-forge-heat-retry>Retry</button>`;
    return `<div class="forge-heat-shell"><header class="forge-heat-hero"><div><span class="eyebrow">PRO INTELLIGENCE</span><h1>Forge Heat™</h1></div></header><section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error?.code || "FORGE_HEAT_UNAVAILABLE")}</strong><p>${escapeHtml(error?.message || "Forge Heat intelligence is unavailable.")}</p><small>No Heat score was calculated in the browser or substituted from mock data.</small><div class="page-actions">${signIn}</div></div></section></div>`;
  }

  function wire(generation = state.generation) {
    if (!state.main || !activeGeneration(generation)) return;
    state.main.querySelectorAll("[data-heat-tab]").forEach(button => {
      button.addEventListener("click", () => {
        if (!activeGeneration(generation)) return;
        state.tab = button.getAttribute("data-heat-tab") || "top5";
        renderState(generation);
      });
    });
    const retry = state.main.querySelector("[data-forge-heat-retry]");
    if (retry) retry.addEventListener("click", () => refresh(generation));
  }

  function renderState(generation = state.generation) {
    if (!state.main || !activeGeneration(generation)) return;
    if (state.loading) state.main.innerHTML = loading();
    else if (state.error) state.main.innerHTML = errorView(state.error);
    else if (state.payload) state.main.innerHTML = page(state.payload.data);
    else state.main.innerHTML = loading();
    wire(generation);
  }

  async function refresh(generation = state.generation) {
    if (!activeGeneration(generation)) return;
    state.loading = true;
    state.error = null;
    renderState(generation);
    try {
      const payload = await load();
      if (!activeGeneration(generation)) return;
      state.payload = payload;
    } catch (error) {
      if (!activeGeneration(generation)) return;
      state.payload = null;
      state.error = error;
    } finally {
      if (!activeGeneration(generation)) return;
      state.loading = false;
      renderState(generation);
    }
  }

  function render(main) {
    state.main = main;
    state.generation += 1;
    state.tab = "top5";
    state.payload = null;
    state.error = null;
    refresh(state.generation);
  }

  window.FlipForgeCustomerForgeHeat = Object.freeze({
    isEligible: eligibleHost,
    render,
    refresh
  });
})();
