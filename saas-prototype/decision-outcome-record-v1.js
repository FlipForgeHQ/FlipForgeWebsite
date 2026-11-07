(() => {
  "use strict";

  // "Record what you did" on a saved decision (customer-reported outcomes v1). A small panel below the saved-decision
  // detail; it never sits inside or changes the CDI Signal Stack, never changes the saved decision, and shows every
  // record as the customer's own, unverified report. Reads and writes go through the same-origin gateway to
  // /api/v1/decision-outcomes/{opportunityId}. When the service has the feature off (404) the panel stays away.

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 200_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const ROUTE = /^#\/opportunities\/([^/?#]+)$/;
  const PANEL = "data-decision-outcome-panel";
  const ACTION_LABELS = Object.freeze({ BOUGHT: "I bought it", PASSED: "I passed", SOLD: "I sold it" });
  const PLATFORMS = Object.freeze({ "": "Not specified", EBAY: "eBay", GOLDIN: "Goldin", FANATICS_COLLECT: "Fanatics Collect",
    HERITAGE: "Heritage", PWCC: "PWCC", MYSLABS: "MySlabs", ALT: "Alt", WHATNOT: "Whatnot", COMC: "COMC", MERCARI: "Mercari",
    FACEBOOK_MARKETPLACE: "Facebook Marketplace", CARD_SHOW: "Card show", LOCAL_SHOP: "Local shop", PRIVATE_SALE: "Private sale",
    OTHER: "Other" });
  const state = { opportunityId: "", records: null, error: "", notice: "", busy: false, featureOff: false, attempts: 0 };

  const escapeHtml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const money = cents => Number.isFinite(Number(cents)) && cents !== null
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents) / 100) : "";
  const uuid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `outcome-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const eligibleHost = () => (PRODUCTION_HOST.test(location.hostname) || PREVIEW_HOST.test(location.hostname)) && APP_PATH.test(location.pathname);

  async function request(opportunityId, method = "GET", body = undefined) {
    if (!SAFE_ID.test(opportunityId)) throw new Error("The card identifier is invalid.");
    if (!["GET", "POST"].includes(method)) throw new Error("Only GET and POST are allowed.");
    const correlationId = uuid();
    const response = await fetch(`/api/v1/decision-outcomes/${encodeURIComponent(opportunityId)}`, {
      method, credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json", "X-Correlation-Id": correlationId, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
      body: method === "POST" ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("The response was too large.");
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (_) { throw new Error("The response was not valid JSON."); }
    if (!response.ok) throw Object.assign(new Error(payload?.error?.message || "The request failed."), { status: response.status });
    const data = payload?.data;
    const valid = payload?.meta?.contractVersion === CONTRACT_VERSION && payload.meta.correlationId === correlationId
      && data?.kind === "customer-decision-outcomes" && data.verificationStatus === "UNVERIFIED"
      && data.learningEligible === false && data.savedDecisionChanged === false;
    if (!valid) throw new Error("The response failed the FlipForge contract.");
    return data;
  }

  function recordLine(r) {
    const what = ACTION_LABELS[r.action] || r.action;
    const price = r.priceCents === null || r.priceCents === undefined ? "" : ` · ${money(r.priceCents)}`;
    const date = r.actionDate ? ` · ${escapeHtml(r.actionDate)}` : "";
    const where = r.platform ? ` · ${escapeHtml(PLATFORMS[r.platform] || r.platform)}` : "";
    const corrected = r.supersedesOutcomeId ? " · corrects an earlier entry" : "";
    return `<li data-decision-outcome-id="${escapeHtml(r.outcomeId)}">${escapeHtml(what)}${price}${date}${where}${corrected}</li>`;
  }

  function paint() {
    const panel = document.querySelector(`[${PANEL}]`);
    if (!panel) return;
    const records = Array.isArray(state.records) ? state.records : [];
    const latest = records.length ? records[records.length - 1] : null;
    panel.innerHTML = `<header class="panel-header"><div><h2>Record what you did</h2>
      <p>Optional. Your own report of what happened after this decision. It is not verified, it never changes the saved decision, and it is not used for learning.</p></div></header>
      ${records.length ? `<ul class="ff-decision-outcome-list">${records.map(recordLine).join("")}</ul>` : "<p>Nothing recorded yet.</p>"}
      <form class="ff-decision-outcome-form" data-decision-outcome-form>
        <label>What did you do?<select name="outcomeAction" required>${Object.entries(ACTION_LABELS).map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join("")}</select></label>
        <label data-outcome-priced>Price (USD)<input name="price" type="number" inputmode="decimal" min="0.01" max="1000000" step="0.01"></label>
        <label data-outcome-priced>Date<input name="date" type="date"></label>
        <label data-outcome-sold>Platform<select name="platform">${Object.entries(PLATFORMS).map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join("")}</select></label>
        ${latest ? `<label><input type="checkbox" name="correct"> This corrects my last entry</label>` : ""}
        <button class="button button-secondary" type="submit"${state.busy ? " disabled" : ""}>Save my report</button>
        <p role="status" aria-live="polite">${escapeHtml(state.error || state.notice)}</p>
      </form>`;
    const form = panel.querySelector("[data-decision-outcome-form]");
    const sync = () => {
      const action = form.outcomeAction.value;
      panel.querySelectorAll("[data-outcome-priced]").forEach(el => { el.hidden = action === "PASSED"; });
      panel.querySelectorAll("[data-outcome-sold]").forEach(el => { el.hidden = action !== "SOLD"; });
    };
    form.outcomeAction.addEventListener("change", sync);
    sync();
    form.addEventListener("submit", event => { event.preventDefault(); save(form, latest); });
  }

  async function save(form, latest) {
    const card = state.opportunityId;
    const action = form.outcomeAction.value;
    const body = { clientReportId: uuid(), action };
    if (action !== "PASSED") {
      const dollars = Number(form.price.value);
      if (!(dollars > 0) || dollars > 1_000_000) { state.error = "Enter a price between $0.01 and $1,000,000."; paint(); return; }
      if (!form.date.value) { state.error = "Enter the date."; paint(); return; }
      body.priceCents = Math.round(dollars * 100);
      body.actionDate = form.date.value;
      if (action === "SOLD" && form.platform.value) body.platform = form.platform.value;
    }
    if (latest && form.correct?.checked) body.supersedesOutcomeId = latest.outcomeId;
    state.busy = true; state.error = ""; state.notice = ""; paint();
    try {
      await request(card, "POST", body);
      if (card !== state.opportunityId) return;
      state.records = (await request(card)).records || [];
      state.notice = "Saved as your own report.";
    } catch (error) {
      if (card === state.opportunityId) state.error = error.status === 400
        ? "That entry was not accepted. Check the price and that the date is not before the decision or in the future."
        : "Couldn't save right now. Nothing was changed.";
    } finally {
      if (card === state.opportunityId) { state.busy = false; paint(); }
    }
  }

  async function mount() {
    if (!eligibleHost() || state.featureOff) return false;
    const match = String(location.hash || "").match(ROUTE);
    if (!match) return true;
    const id = decodeURIComponent(match[1]);
    if (!SAFE_ID.test(id) || document.querySelector(`[${PANEL}]`)) return true;
    const anchor = document.querySelector("[data-card-reevaluate]")?.closest("section, article");
    // Placed after the saved-decision view, never inside the CDI Signal Stack.
    if (!anchor || anchor.closest("[data-ff-cdi-signal]")) return false;
    if (id !== state.opportunityId) { state.records = null; state.error = ""; state.notice = ""; state.busy = false; }
    state.opportunityId = id;
    anchor.insertAdjacentHTML("afterend", `<section class="panel ff-decision-outcome" ${PANEL}></section>`);
    paint();
    try {
      const data = await request(id);
      if (id === state.opportunityId) { state.records = data.records || []; paint(); }
    } catch (error) {
      if (error.status === 404) { state.featureOff = true; document.querySelector(`[${PANEL}]`)?.remove(); }
      else if (id === state.opportunityId) { state.error = "Couldn't load your reports right now."; paint(); }
    }
    return true;
  }

  // Bounded retries after a route change (the saved-decision view renders asynchronously); no page-wide observer.
  function schedule() {
    state.attempts = 0;
    const tick = async () => {
      if (await mount() || ++state.attempts >= 20) return;
      window.setTimeout(tick, 250);
    };
    tick();
  }
  window.addEventListener("hashchange", schedule);
  schedule();

  window.FlipForgeDecisionOutcomes = Object.freeze({ mount, isEligible: eligibleHost, ACTION_LABELS });
})();
