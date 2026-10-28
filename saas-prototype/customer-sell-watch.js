(() => {
  "use strict";

  // Portfolio Sell Watch (hosted v1). Adds a Sell Watch panel to a tracked card the customer owns. The customer saves
  // their own selling costs per channel and sees what they would keep at a price they type in, compared with what
  // they paid. Reads and writes go through the same-origin gateway to /api/v1/sell-watch. When the service has the
  // feature switched off (404) the panel removes itself and nothing else changes. The browser computes nothing: every
  // figure comes from the service. Sell Watch gives no instruction and has no transaction authority.

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const PANEL = "data-sell-watch-panel";
  const CHANNELS = ["MARKETPLACE", "AUCTION_HOUSE", "CONSIGNMENT", "DEALER_DIRECT", "PRIVATE_SALE", "OTHER"];
  const CHANNEL_LABELS = {
    MARKETPLACE: "Marketplace", AUCTION_HOUSE: "Auction house", CONSIGNMENT: "Consignment", DEALER_DIRECT: "Dealer",
    PRIVATE_SALE: "Private sale", OTHER: "Other"
  };
  const KINDS = new Set(["sell-watch-opportunity", "sell-watch-costs", "sell-watch-estimate"]);
  const COST_FIELDS = [
    ["commissionBps", "Commission (%)", "percent"], ["paymentProcessingBps", "Payment processing (%)", "percent"],
    ["fixedFeeCents", "Fixed fee per sale ($)", "money"], ["shippingCents", "Shipping and supplies ($)", "money"],
    ["insuranceCents", "Insurance ($)", "money"], ["otherCostCents", "Other costs ($)", "money"]
  ];

  // featureOff: the service answered 404 for this route; stay unmounted for the rest of this page load.
  const state = { opportunityId: "", card: null, profiles: [], estimate: null, error: null, notice: "", busy: false,
    channel: "MARKETPLACE", editing: false, generation: 0, featureOff: false, requests: 0, cardEpoch: 0 };
  // A response for a card the customer has already left is ignored (its data, its error and its busy flag).
  const sameCard = (epoch, card) => epoch === state.cardEpoch && card === state.opportunityId;

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host)) && APP_PATH.test(String(window.location.pathname || ""));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function money(cents) {
    if (cents === null || cents === undefined || !Number.isSafeInteger(Number(cents))) return "Not entered";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(cents) / 100);
  }

  function percent(bps) {
    return `${(Number(bps) / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `sw-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function allowedPath(path) {
    const value = String(path || "");
    const costs = value.match(/^\/api\/v1\/sell-watch\/costs\/([A-Z_]+)$/);
    if (costs) {
      if (!CHANNELS.includes(costs[1])) throw new Error("The selling channel is invalid.");
      return value;
    }
    const card = value.match(/^\/api\/v1\/sell-watch\/([^/?#]+)(\/estimate)?$/);
    if (!card || !SAFE_ID.test(decodeURIComponent(card[1]))) throw new Error("The requested Sell Watch path is not allowlisted.");
    return value;
  }

  async function request(path, method = "GET", body = undefined) {
    const safePath = allowedPath(path);
    const verb = String(method).toUpperCase();
    if (!["GET", "POST", "PUT"].includes(verb)) throw new Error("Sell Watch allows GET, POST and PUT only.");
    const correlationId = uuid();
    state.requests += 1;
    const response = await fetch(safePath, {
      method: verb,
      headers: { Accept: "application/json", "X-Correlation-Id": correlationId,
        ...(verb === "GET" ? {} : { "Content-Type": "application/json" }) },
      body: verb === "GET" ? undefined : JSON.stringify(body || {}),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) throw Object.assign(new Error("The Sell Watch response was too large."), { code: "SELL_WATCH_RESPONSE_TOO_LARGE" });
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (_) {
      throw Object.assign(new Error("The Sell Watch gateway returned invalid JSON."), { code: "SELL_WATCH_INVALID_JSON" });
    }
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Sell Watch request failed with status ${response.status}.`), {
        code: upstream.code || "SELL_WATCH_REQUEST_FAILED", status: response.status
      });
    }
    const meta = payload?.meta;
    const data = payload?.data;
    // Sell Watch never has transaction authority, never changes a decision, and in v1 never shows a recent-sales
    // comparison. A response that claims otherwise is refused rather than displayed.
    const valid = meta && meta.contractVersion === CONTRACT_VERSION && meta.correlationId === correlationId
      && data && KINDS.has(data.kind) && data.transactionAuthority === false && data.acquisitionDecisionAffected === false
      && data.marketComparisonDisplayed === false && data.authority === "POSITION_REVIEW_PROMPT_ONLY";
    if (!valid) throw Object.assign(new Error("The Sell Watch response failed the FlipForge contract."), { code: "SELL_WATCH_CONTRACT_INVALID" });
    return payload;
  }

  function amountFrom(value, label) {
    const text = String(value ?? "").trim();
    if (!text) return 0;
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or more.`);
    return Math.round(parsed * 100);
  }

  function profileFor(channel) {
    return state.profiles.find(profile => profile.channel === channel) || null;
  }

  function costsSummary(profile) {
    const parts = [];
    if (profile.commissionBps) parts.push(`${percent(profile.commissionBps)} commission`);
    if (profile.paymentProcessingBps) parts.push(`${percent(profile.paymentProcessingBps)} payment processing`);
    if (profile.fixedFeeCents) parts.push(`${money(profile.fixedFeeCents)} fixed fee`);
    if (profile.shippingCents) parts.push(`${money(profile.shippingCents)} shipping`);
    if (profile.insuranceCents) parts.push(`${money(profile.insuranceCents)} insurance`);
    if (profile.otherCostCents) parts.push(`${money(profile.otherCostCents)} other`);
    return parts.length ? parts.join(", ") : "no costs";
  }

  function costsFormMarkup(profile) {
    const value = (key, kind) => {
      if (!profile) return "";
      const raw = Number(profile[key] || 0);
      return kind === "percent" ? String(raw / 100) : (raw / 100).toFixed(2);
    };
    return `<form class="customer-lifecycle-form ff-sell-watch-costs" data-sell-watch-costs-form><div class="customer-lifecycle-fields">`
      + COST_FIELDS.map(([key, label, kind]) => `<label><span>${escapeHtml(label)}</span><input name="${key}" type="number" min="0" `
        + `${kind === "percent" ? 'max="50" step="0.01"' : 'step="0.01"'} inputmode="decimal" value="${escapeHtml(value(key, kind))}" placeholder="0"></label>`).join("")
      + `</div><div class="customer-lifecycle-submit"><button class="button button-primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Saving…" : `Save ${escapeHtml(CHANNEL_LABELS[state.channel].toLowerCase())} costs`}</button>`
      + (profile ? `<button class="button button-secondary" type="button" data-sell-watch-cancel>Cancel</button>` : "")
      + `<small>Enter what selling through this channel costs you. Percentages are of the sale price; leave a field blank for none.</small></div></form>`;
  }

  function estimateMarkup() {
    const estimate = state.estimate;
    if (!estimate || estimate.channel !== state.channel) return "";
    const b = estimate.breakdown;
    const rows = b ? [
      ["Price you entered", money(b.grossCents)],
      ["Commission", `− ${money(b.commissionCents)}`],
      ["Payment processing", `− ${money(b.paymentProcessingCents)}`],
      ["Fixed fee", `− ${money(b.fixedFeeCents)}`],
      ["Shipping and supplies", `− ${money(b.shippingCents)}`],
      ["Insurance", `− ${money(b.insuranceCents)}`],
      ["Other costs", `− ${money(b.otherCostCents)}`],
      ["You would keep", money(b.netCents)],
      ["You paid", money(estimate.acquisitionCostCents)]
    ] : [];
    const comparison = estimate.comparison;
    const tone = comparison?.direction === "ABOVE_WHAT_YOU_PAID" ? "value-positive"
      : comparison?.direction === "BELOW_WHAT_YOU_PAID" ? "value-negative" : "";
    return `<div class="ff-sell-watch-result" data-sell-watch-result data-status="${escapeHtml(estimate.status)}" role="status">`
      + `<p class="${tone}">${escapeHtml(estimate.message)}</p>`
      + (rows.length ? `<dl class="ff-sell-watch-breakdown">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>` : "")
      + `</div>`;
  }

  function panelMarkup() {
    const header = `<header class="panel-header"><div><h2>Sell Watch</h2><p>See what you would keep at a price you choose, after your own selling costs.</p></div></header>`;
    const notice = state.notice ? `<div class="customer-lifecycle-notice" role="status">${escapeHtml(state.notice)}</div>` : "";
    const error = state.error
      ? `<div class="staging-error" role="alert"><strong>${escapeHtml(state.error.code || "SELL_WATCH_UNAVAILABLE")}</strong><p>${escapeHtml(state.error.message || "Sell Watch is unavailable.")}</p></div>`
      : "";
    if (!state.card) return `${header}<div class="panel-body">${error || `<div class="staging-loading" role="status">Loading Sell Watch…</div>`}</div>`;
    const profile = profileFor(state.channel);
    const channelOptions = CHANNELS.map(channel => `<option value="${channel}" ${channel === state.channel ? "selected" : ""}>`
      + `${escapeHtml(CHANNEL_LABELS[channel])}${profileFor(channel) ? " (costs saved)" : ""}</option>`).join("");
    // Break-even price from the server: the lowest price at which the customer keeps what they paid, after the saved
    // costs for this channel. Shown only when it matches the saved costs version on screen.
    const breakEven = profile ? (Array.isArray(state.card.breakEven) ? state.card.breakEven : [])
      .find(entry => entry && entry.channel === state.channel && Number(entry.costsVersion) === Number(profile.version)
        && Number.isSafeInteger(entry.priceCents)) : null;
    const costs = profile && !state.editing
      ? `<div class="ff-sell-watch-saved"><p><strong>Your ${escapeHtml(CHANNEL_LABELS[state.channel].toLowerCase())} costs:</strong> ${escapeHtml(costsSummary(profile))}.</p>`
        + `<button class="button button-secondary" type="button" data-sell-watch-edit>Edit costs</button></div>`
        + (breakEven ? `<p class="ff-sell-watch-break-even" data-sell-watch-break-even><strong>Break-even price: ${escapeHtml(money(breakEven.priceCents))}</strong> <span>the lowest price at which you would keep what you paid, after these costs.</span></p>` : "")
      : costsFormMarkup(profile);
    const priceForm = profile
      ? `<form class="customer-lifecycle-form ff-sell-watch-price" data-sell-watch-price-form><div class="customer-lifecycle-fields">`
        + `<label><span>Price to check (USD)</span><input name="price" type="number" min="0.01" step="0.01" inputmode="decimal" required></label></div>`
        + `<div class="customer-lifecycle-submit"><button class="button button-primary" type="submit" ${state.busy ? "disabled" : ""}>See what I would keep</button></div></form>`
      : "";
    return `${header}<div class="panel-body">${notice}${error}`
      + `<div class="staging-key-grid"><div><span>You paid</span><strong>${escapeHtml(money(state.card.acquisitionCostCents))}</strong></div></div>`
      + `<label class="customer-management-selector ff-sell-watch-channel"><span>Selling through</span><select data-sell-watch-channel>${channelOptions}</select></label>`
      + costs + priceForm + estimateMarkup()
      + `<small class="ff-sell-watch-note">Uses your price and your costs. Not a valuation, an offer or a market value. Taxes are not included. Sell Watch never changes a FlipForge decision.</small>`
      + `</div>`;
  }

  function panel() {
    return document.querySelector(`[${PANEL}]`);
  }

  // keepTyped: keep what the customer typed across a re-render (saving, an error). Switching channel or opening
  // and closing the cost form starts from the saved values instead.
  function paint(keepTyped = true) {
    const node = panel();
    if (!node) return;
    const typed = {};
    const keyOf = field => `${field.closest("form")?.className || ""}:${field.name}`;
    if (keepTyped) node.querySelectorAll("form [name]").forEach(field => { typed[keyOf(field)] = field.value; });
    node.innerHTML = panelMarkup();
    node.querySelectorAll("form [name]").forEach(field => {
      const key = keyOf(field);
      if (Object.prototype.hasOwnProperty.call(typed, key)) field.value = typed[key];
    });
    bind(node);
  }

  function apply(payload) {
    const data = payload.data;
    if (Array.isArray(data.costProfiles)) state.profiles = data.costProfiles;
    if (data.kind === "sell-watch-opportunity") {
      if (!data.owned) return false;
      // The card's facts (what was paid) or the saved costs may have changed since the last check: an estimate
      // computed from the old facts is dropped, never shown beside the new ones.
      state.card = data.card;
      state.estimate = null;
    }
    if (data.kind === "sell-watch-estimate") state.estimate = data.estimate;
    return true;
  }

  async function load(generation) {
    const card = state.opportunityId;
    try {
      const payload = await request(`/api/v1/sell-watch/${encodeURIComponent(card)}`);
      if (generation !== state.generation) return;
      if (!apply(payload)) {
        // Not an owned card: Sell Watch is for cards you own. Keep an empty, hidden placeholder so the page watcher
        // does not mount (and request) again; the lifecycle page re-renders it away when the card changes.
        const node = panel();
        if (node) {
          node.innerHTML = "";
          node.hidden = true;
          node.setAttribute("data-sell-watch-state", "not-owned");
        }
        return;
      }
      if (!profileFor(state.channel)) {
        const saved = CHANNELS.find(channel => profileFor(channel));
        if (saved) state.channel = saved;
      }
      state.error = null;
    } catch (error) {
      if (generation !== state.generation) return;
      if (error.status === 404 && error.code !== "RESOURCE_NOT_FOUND") {
        state.featureOff = true; // Feature off on this service: no panel at all, and no further requests.
        panel()?.remove();
        return;
      }
      state.error = error;
    }
    paint();
  }

  async function run(work) {
    if (state.busy) return;
    const card = state.opportunityId;
    const epoch = state.cardEpoch;
    state.busy = true;
    paint();
    try {
      const payload = await work(card, () => sameCard(epoch, card));
      if (!sameCard(epoch, card)) return;
      apply(payload);
      state.error = null;
    } catch (error) {
      if (!sameCard(epoch, card)) return;
      state.error = error;
      if (error.code === "SELL_WATCH_COSTS_VERSION_CONFLICT") {
        // The saved costs changed elsewhere (another tab): reload them so the next save uses the current version.
        state.editing = false;
        state.busy = false;
        state.generation += 1;
        await load(state.generation);
        state.error = Object.assign(new Error("Your saved costs changed in another window. They are shown below; edit them again if needed."), { code: error.code });
      }
    } finally {
      if (sameCard(epoch, card)) {
        state.busy = false;
        paint();
      }
    }
  }

  function saveCosts(form) {
    const formData = new FormData(form);
    let body;
    try {
      body = {};
      for (const [key, label] of COST_FIELDS) body[key] = amountFrom(formData.get(key), label);
      if (body.commissionBps + body.paymentProcessingBps > 5000) throw new Error("Commission and payment processing together are limited to 50%.");
      const profile = profileFor(state.channel);
      body.expectedVersion = profile ? Number(profile.version) : 0;
    } catch (error) {
      state.error = error;
      paint();
      return;
    }
    const channel = state.channel;
    state.notice = "";
    run(async (card, stillThisCard) => {
      const saved = await request(`/api/v1/sell-watch/costs/${channel}`, "PUT", body);
      // The customer may have opened another card while the save was in flight: never apply this card's
      // response to it (run() discards the final payload too).
      if (!stillThisCard()) return null;
      state.editing = false;
      state.estimate = null;
      state.notice = `Your ${CHANNEL_LABELS[channel].toLowerCase()} costs are saved.`;
      apply(saved);
      // Reload the card so its break-even price reflects the costs just saved.
      return request(`/api/v1/sell-watch/${encodeURIComponent(card)}`);
    });
  }

  function checkPrice(form) {
    const formData = new FormData(form);
    let priceCents;
    try {
      priceCents = amountFrom(formData.get("price"), "Price");
      if (!(priceCents > 0)) throw new Error("Enter a price above zero.");
    } catch (error) {
      state.error = error;
      paint();
      return;
    }
    const channel = state.channel;
    state.notice = "";
    run(card => request(`/api/v1/sell-watch/${encodeURIComponent(card)}/estimate`, "POST", { channel, priceCents }));
  }

  function bind(node) {
    node.querySelector("[data-sell-watch-channel]")?.addEventListener("change", event => {
      state.channel = CHANNELS.includes(event.target.value) ? event.target.value : "MARKETPLACE";
      state.editing = false;
      state.notice = "";
      state.error = null;
      paint(false);
    });
    node.querySelector("[data-sell-watch-edit]")?.addEventListener("click", () => {
      state.editing = true;
      state.notice = "";
      paint(false);
    });
    node.querySelector("[data-sell-watch-cancel]")?.addEventListener("click", () => {
      state.editing = false;
      state.error = null;
      paint(false);
    });
    node.querySelector("[data-sell-watch-costs-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      saveCosts(event.currentTarget);
    });
    node.querySelector("[data-sell-watch-price-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      checkPrice(event.currentTarget);
    });
  }

  function mount() {
    if (!eligibleHost() || state.featureOff) return;
    const form = document.querySelector("[data-lifecycle-form]");
    if (!form || panel()) return;
    const select = document.querySelector("[data-lifecycle-select]");
    const id = String(select?.value || "");
    if (!SAFE_ID.test(id)) return;
    const grid = form.closest(".customer-lifecycle-grid") || form.closest("section");
    if (!grid) return;
    if (id !== state.opportunityId) {
      state.card = null;
      state.estimate = null;
      state.editing = false;
      state.notice = "";
      state.busy = false;
      state.cardEpoch += 1;
    }
    state.opportunityId = id;
    state.error = null;
    state.generation += 1;
    // Below the Sales panel when it is there; the Sales panel always sits directly under the lifecycle form.
    const anchor = document.querySelector("[data-reported-sales-panel]") || grid;
    anchor.insertAdjacentHTML("afterend", `<section class="panel ff-sell-watch" ${PANEL} data-opportunity-id="${escapeHtml(id)}" hidden></section>`);
    const node = panel();
    load(state.generation).then(() => {
      if (panel() === node && node.getAttribute("data-sell-watch-state") !== "not-owned") node.hidden = false;
    });
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => { scheduled = false; mount(); });
  }

  if (typeof MutationObserver === "function" && document.body) {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener("hashchange", schedule);
  schedule();

  window.FlipForgeSellWatch = Object.freeze({ isEligible: eligibleHost, mount, requestCount: () => state.requests });
})();
