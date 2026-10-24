(() => {
  "use strict";

  // Customer-reported sales, Phase 1 ("Mark as Sold"). Adds a Sales panel under the tracked card's lifecycle form.
  // Reads and writes go through the same-origin gateway to /api/v1/reported-sales. When the service has the feature
  // switched off (404 ROUTE_NOT_FOUND) the panel removes itself and nothing else changes. Every sale is shown as
  // "User reported"; the browser cannot verify a sale, compute a decision, or collect buyer details.

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const SAFE_REPORT_ID = /^rs_[0-9a-f-]{36}$/;
  const PANEL = "data-reported-sales-panel";

  const VENUE_LABELS = {
    EBAY: "eBay", GOLDIN: "Goldin", FANATICS_COLLECT: "Fanatics Collect", HERITAGE: "Heritage", PWCC: "PWCC",
    MYSLABS: "MySlabs", ALT: "Alt", WHATNOT: "Whatnot", COMC: "COMC", MERCARI: "Mercari",
    FACEBOOK_MARKETPLACE: "Facebook Marketplace", CARD_SHOW: "Card show", LOCAL_SHOP: "Local shop",
    PRIVATE_SALE: "Private sale", OTHER: "Other"
  };
  const FORMAT_LABELS = { AUCTION: "Auction", FIXED_PRICE: "Fixed price", BEST_OFFER: "Best offer", PRIVATE: "Private", OTHER: "Other" };
  const EVIDENCE_LABELS = { NONE: "None", ORDER_NUMBER: "Order number", RECEIPT_NUMBER: "Receipt number", INVOICE_NUMBER: "Invoice number" };
  const STATUS_LABELS = {
    COMPLETED: "Completed", PENDING: "Pending", CANCELLED: "Cancelled", REFUNDED: "Refunded",
    PARTIALLY_REFUNDED: "Partly refunded", RETURNED: "Returned"
  };
  const REVIEW_LABELS = {
    PENDING_VERIFICATION: ["Awaiting verification", "warn"], NEEDS_REVIEW: ["Needs review", "warn"],
    REVERSED: ["Reversed", "neutral"], WITHDRAWN: ["Withdrawn", "neutral"]
  };
  const FLAG_LABELS = {
    DUPLICATE_TRANSACTION_REFERENCE: "This transaction number was already reported",
    DUPLICATE_SALE_REPORT: "This looks like a repeat of another report",
    ANOTHER_ACTIVE_SALE_FOR_THIS_CARD: "Another sale is already recorded for this card",
    QUESTIONABLE_PRICE_LOW: "Price is far below FlipForge's saved reference",
    QUESTIONABLE_PRICE_HIGH: "Price is far above FlipForge's saved reference",
    FEES_EXCEED_SALE_PRICE: "Fees are higher than the sale price",
    SALE_BEFORE_ACQUISITION: "Sale date is before the purchase date",
    CARD_IDENTITY_UNAVAILABLE: "No saved FlipForge decision links this card's exact identity"
  };
  const PL_LABELS = {
    REALIZED: "Realized", REALIZED_FEES_INCOMPLETE: "Realized (some fees not entered)",
    COST_BASIS_UNAVAILABLE: "Add your purchase cost to see profit", NOT_REALIZED_SALE_PENDING: "Sale pending",
    NOT_REALIZED_SALE_REVERSED: "Sale reversed"
  };

  // featureOff: the service answered 404 for this route; stay unmounted for the rest of this page load so the
  // panel never re-mounts and re-requests in a loop.
  const state = { opportunityId: "", data: null, error: null, notice: "", busy: false, formOpen: false, clientId: "",
    generation: 0, featureOff: false, requests: 0 };

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host)) && APP_PATH.test(String(window.location.pathname || ""));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function money(cents) {
    if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return "Not entered";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(cents) / 100);
  }

  function badge(label, tone = "neutral") {
    return `<span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `sale-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function allowedPath(path) {
    const value = String(path || "");
    const match = value.match(/^\/api\/v1\/reported-sales\/([^/?#]+)(?:\/([^/?#]+))?$/);
    if (!match) throw new Error("The requested sales API path is not allowlisted.");
    const opportunity = decodeURIComponent(match[1]);
    if (!SAFE_ID.test(opportunity)) throw new Error("The card identifier is invalid.");
    if (match[2] !== undefined && !SAFE_REPORT_ID.test(decodeURIComponent(match[2]))) {
      throw new Error("The sale identifier is invalid.");
    }
    return value;
  }

  async function request(path, method = "GET", body = undefined) {
    const safePath = allowedPath(path);
    const verb = String(method).toUpperCase();
    if (!["GET", "POST", "PUT"].includes(verb)) throw new Error("The sales panel allows GET, POST and PUT only.");
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
    if (text.length > MAX_RESPONSE_CHARACTERS) throw Object.assign(new Error("The sales response was too large."), { code: "SALES_RESPONSE_TOO_LARGE" });
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (_) {
      throw Object.assign(new Error("The sales gateway returned invalid JSON."), { code: "SALES_INVALID_JSON" });
    }
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Sales request failed with status ${response.status}.`), {
        code: upstream.code || "SALES_REQUEST_FAILED", status: response.status
      });
    }
    const meta = payload?.meta;
    const valid = meta && meta.contractVersion === CONTRACT_VERSION && meta.correlationId === correlationId
      && payload.data && payload.data.kind === "reported-sales-opportunity" && payload.data.label === "USER_REPORTED"
      && payload.data.dataUseEnabled === false && Array.isArray(payload.data.items);
    if (!valid) throw Object.assign(new Error("The sales response failed the FlipForge contract."), { code: "SALES_CONTRACT_INVALID" });
    return payload;
  }

  function centsFrom(value, label, required = false) {
    const text = String(value ?? "").trim();
    if (!text) {
      if (required) throw new Error(`${label} is required.`);
      return null;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a positive amount.`);
    return Math.round(parsed * 100);
  }

  function today() {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function options(map, chosen = "") {
    return Object.entries(map).map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === chosen ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  }

  function formMarkup() {
    const data = state.data?.data || {};
    const lifecycle = data.lifecycle || {};
    const needsCost = lifecycle.acquisitionCostCents === null || lifecycle.acquisitionCostCents === undefined;
    const consentText = data.form?.consentText || "Allow FlipForge to use this sale, without my name or account details, in anonymized, aggregated market research and comparisons.";
    return `<form class="customer-lifecycle-form" data-reported-sale-form><div class="customer-lifecycle-fields">`
      + `<label><span>Sale price (USD)</span><input name="salePrice" type="number" min="0.01" step="0.01" required></label>`
      + `<label><span>Sale date</span><input name="saleDate" type="date" max="${today()}" required></label>`
      + `<label><span>Where it sold</span><select name="venue" required>${options(VENUE_LABELS, "EBAY")}</select></label>`
      + `<label><span>Sale format</span><select name="saleFormat"><option value="">Not specified</option>${options(FORMAT_LABELS)}</select></label>`
      + `<label><span>Status</span><select name="saleStatus"><option value="COMPLETED">Completed</option><option value="PENDING">Pending (not yet paid or shipped)</option></select></label>`
      + `<label><span>Marketplace fee</span><input name="marketplaceFee" type="number" min="0" step="0.01" placeholder="Leave blank if unknown"></label>`
      + `<label><span>Payment fee</span><input name="paymentFee" type="number" min="0" step="0.01" placeholder="Leave blank if unknown"></label>`
      + `<label><span>Shipping and supplies you paid</span><input name="shippingCost" type="number" min="0" step="0.01" placeholder="Leave blank if unknown"></label>`
      + `<label><span>Other costs</span><input name="otherFee" type="number" min="0" step="0.01" placeholder="Leave blank if unknown"></label>`
      + `<label><span>Transaction proof (optional)</span><select name="evidenceType">${options(EVIDENCE_LABELS, "NONE")}</select></label>`
      + `<label><span>Order, receipt or invoice number</span><input name="evidenceReference" type="text" maxlength="64" autocomplete="off" placeholder="Numbers only. No buyer names or emails"></label>`
      + (needsCost ? `<label><span>What you paid for the card</span><input name="acquisitionCost" type="number" min="0" step="0.01" placeholder="Needed to show profit"></label>`
        + `<label><span>Purchase date</span><input name="acquiredAt" type="date" max="${today()}"></label>` : "")
      + `</div><label class="customer-lifecycle-check"><input name="consent" type="checkbox"><span>${escapeHtml(consentText)}</span></label>`
      + `<div class="customer-lifecycle-submit"><button class="button button-primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Saving…" : "Save sale"}</button>`
      + `<button class="button button-secondary" type="button" data-reported-sale-cancel>Cancel</button>`
      + `<small>Your sale is saved to your account as user reported. FlipForge does not collect buyer details and does not use reported sales in its pricing.</small></div></form>`;
  }

  function reportMarkup(item) {
    const sale = item.sale || {};
    const pl = item.profitLoss || {};
    const review = REVIEW_LABELS[item.reviewStatus] || [item.reviewStatus || "Unknown", "neutral"];
    const flags = Array.isArray(item.reviewFlags) ? item.reviewFlags : [];
    const active = item.reviewStatus !== "WITHDRAWN";
    const status = sale.saleStatus;
    const actions = [];
    if (active && status === "PENDING") actions.push(["complete", "Mark completed"]);
    if (active && ["COMPLETED", "PARTIALLY_REFUNDED"].includes(status)) actions.push(["refund", "Record refund"], ["returned", "Card was returned"]);
    if (active && ["PENDING", "COMPLETED"].includes(status)) actions.push(["cancel", "Sale cancelled"]);
    if (active) actions.push(["consent", item.consent?.aggregateResearch ? "Stop research use" : "Allow research use"], ["withdraw", "Withdraw report"]);
    const profit = pl.realizedProfitCents === null || pl.realizedProfitCents === undefined ? ""
      : `<div><span>Realized profit</span><strong class="${Number(pl.realizedProfitCents) >= 0 ? "value-positive" : "value-negative"}">${escapeHtml(money(pl.realizedProfitCents))}${pl.realizedReturnPercent === null || pl.realizedReturnPercent === undefined ? "" : ` (${escapeHtml(pl.realizedReturnPercent)}%)`}</strong></div>`;
    return `<article class="ff-reported-sale" data-reported-sale-id="${escapeHtml(item.reportId)}" data-reported-sale-version="${escapeHtml(item.version)}">`
      + `<header>${badge("User reported", "neutral")}${badge(review[0], review[1])}${badge(STATUS_LABELS[status] || status, status === "COMPLETED" ? "ok" : "neutral")}</header>`
      + `<div class="staging-key-grid">`
      + `<div><span>Sold for</span><strong>${escapeHtml(money(sale.salePriceCents))}</strong></div>`
      + `<div><span>Date</span><strong>${escapeHtml(sale.saleDate || "")}</strong></div>`
      + `<div><span>Where</span><strong>${escapeHtml(VENUE_LABELS[sale.venue] || sale.venue || "")}</strong></div>`
      + `<div><span>Fees entered</span><strong>${escapeHtml(money(pl.knownFeesCents))}${pl.feesComplete ? "" : " (some unknown)"}</strong></div>`
      + (Number(sale.refundCents) > 0 ? `<div><span>Refunded</span><strong>${escapeHtml(money(sale.refundCents))}</strong></div>` : "")
      + `<div><span>Net proceeds</span><strong>${escapeHtml(money(pl.netProceedsCents))}</strong></div>`
      + profit
      + `<div><span>Result</span><strong>${escapeHtml(PL_LABELS[pl.status] || pl.status || "")}</strong></div>`
      + (item.transactionReference?.provided ? `<div><span>Proof</span><strong>${escapeHtml(EVIDENCE_LABELS[item.transactionReference.type] || "")} ending ${escapeHtml(item.transactionReference.lastFour || "")}</strong></div>` : "")
      + `</div>`
      + (flags.length ? `<ul class="ff-reported-sale-flags">${flags.map(flag => `<li>${escapeHtml(FLAG_LABELS[flag] || flag)}</li>`).join("")}</ul>` : "")
      + `<small>Research use: ${item.consent?.aggregateResearch ? "allowed by you" : "not allowed"}. Reported sales are not used in FlipForge's pricing yet.${item.decisionLink?.originalDecision?.recommendation ? ` Original FlipForge decision: ${escapeHtml(item.decisionLink.originalDecision.recommendation)}.` : ""}</small>`
      + (actions.length ? `<div class="ff-reported-sale-actions">${actions.map(([action, label]) => `<button class="button button-secondary" type="button" data-reported-sale-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`).join("")}</div>` : "")
      + `</article>`;
  }

  function panelMarkup() {
    const items = Array.isArray(state.data?.data?.items) ? state.data.data.items : [];
    const header = `<header class="panel-header"><div><h2>Sales</h2><p>Record what you actually sold this card for. Saved to your account as user reported.</p></div>`
      + (state.formOpen ? "" : `<button class="button button-primary" type="button" data-reported-sale-open>Mark as Sold</button>`) + `</header>`;
    const body = state.error
      ? `<div class="staging-error" role="alert"><strong>${escapeHtml(state.error.code || "SALES_UNAVAILABLE")}</strong><p>${escapeHtml(state.error.message || "Sales are unavailable.")}</p></div>`
      : "";
    const notice = state.notice ? `<div class="customer-lifecycle-notice" role="status">${escapeHtml(state.notice)}</div>` : "";
    const list = items.length ? items.map(reportMarkup).join("") : (state.data ? `<p class="ff-reported-sales-empty">No sale recorded for this card yet.</p>` : `<div class="staging-loading" role="status">Loading sales…</div>`);
    return `${header}<div class="panel-body">${notice}${body}${state.formOpen ? formMarkup() : ""}${list}</div>`;
  }

  function panel() {
    return document.querySelector(`[${PANEL}]`);
  }

  function paint() {
    const node = panel();
    if (!node) return;
    // Keep what the customer typed when the panel re-renders (an error message, saving state).
    const typed = {};
    node.querySelectorAll("[data-reported-sale-form] [name]").forEach(field => {
      typed[field.name] = field.type === "checkbox" ? field.checked : field.value;
    });
    node.innerHTML = panelMarkup();
    node.querySelectorAll("[data-reported-sale-form] [name]").forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(typed, field.name)) return;
      if (field.type === "checkbox") field.checked = Boolean(typed[field.name]);
      else field.value = typed[field.name];
    });
    bind(node);
  }

  async function load(generation) {
    try {
      const payload = await request(`/api/v1/reported-sales/${encodeURIComponent(state.opportunityId)}`);
      if (generation !== state.generation) return;
      state.data = payload;
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

  async function submitSale(form) {
    if (state.busy) return;
    const formData = new FormData(form);
    try {
      const evidenceType = String(formData.get("evidenceType") || "NONE");
      const reference = String(formData.get("evidenceReference") || "").trim();
      if (reference.includes("@")) throw new Error("Enter a transaction number only, not an email address.");
      if (evidenceType === "NONE" && reference) throw new Error("Choose what kind of number you entered.");
      if (evidenceType !== "NONE" && !reference) throw new Error("Enter the number, or set proof to None.");
      const saleDate = String(formData.get("saleDate") || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate) || saleDate > today()) throw new Error("Enter the date the card sold.");
      const body = {
        clientReportId: state.clientId,
        salePriceCents: centsFrom(formData.get("salePrice"), "Sale price", true),
        saleDate,
        venue: String(formData.get("venue") || ""),
        saleStatus: String(formData.get("saleStatus") || "COMPLETED"),
        marketplaceFeeCents: centsFrom(formData.get("marketplaceFee"), "Marketplace fee"),
        paymentFeeCents: centsFrom(formData.get("paymentFee"), "Payment fee"),
        shippingCostCents: centsFrom(formData.get("shippingCost"), "Shipping"),
        otherFeeCents: centsFrom(formData.get("otherFee"), "Other costs"),
        aggregateResearchConsent: formData.get("consent") === "on"
      };
      if (!(body.salePriceCents > 0)) throw new Error("Sale price must be more than zero.");
      const format = String(formData.get("saleFormat") || "");
      if (format) body.saleFormat = format;
      if (evidenceType !== "NONE") { body.evidenceType = evidenceType; body.evidenceReference = reference; }
      const cost = formData.has("acquisitionCost") ? centsFrom(formData.get("acquisitionCost"), "Purchase cost") : null;
      const acquired = String(formData.get("acquiredAt") || "");
      if (cost !== null) body.acquisitionCostCents = cost;
      if (acquired) body.acquiredAt = acquired;
      state.busy = true;
      paint();
      state.data = await request(`/api/v1/reported-sales/${encodeURIComponent(state.opportunityId)}`, "POST", body);
      state.formOpen = false;
      state.error = null;
      state.notice = "Sale saved. It shows as user reported until it can be verified.";
      refreshLifecycle();
    } catch (error) {
      state.error = error;
    } finally {
      state.busy = false;
      paint();
    }
  }

  async function act(reportId, version, action) {
    if (state.busy || !SAFE_REPORT_ID.test(reportId)) return;
    const item = (state.data?.data?.items || []).find(entry => entry.reportId === reportId);
    let body;
    if (action === "complete") body = { action: "UPDATE_STATUS", saleStatus: "COMPLETED" };
    else if (action === "cancel") body = { action: "UPDATE_STATUS", saleStatus: "CANCELLED" };
    else if (action === "returned") body = { action: "UPDATE_STATUS", saleStatus: "RETURNED" };
    else if (action === "withdraw") body = { action: "WITHDRAW" };
    else if (action === "consent") body = { action: "SET_CONSENT", aggregateResearchConsent: !item?.consent?.aggregateResearch };
    else if (action === "refund") {
      // No browser dialogs: the refund amount comes from an inline field under the sale.
      const field = panel()?.querySelector(`[data-refund-for="${CSS.escape(reportId)}"]`);
      if (!field) {
        const article = panel()?.querySelector(`[data-reported-sale-id="${CSS.escape(reportId)}"] .ff-reported-sale-actions`);
        article?.insertAdjacentHTML("beforeend", `<label class="ff-reported-sale-refund"><span>Refund amount</span><input type="number" min="0.01" step="0.01" data-refund-for="${escapeHtml(reportId)}"><button class="button button-primary" type="button" data-reported-sale-action="refund">Save refund</button></label>`);
        article?.querySelector("button[data-reported-sale-action='refund']:last-child")?.addEventListener("click", () => act(reportId, version, "refund"));
        return;
      }
      try {
        const cents = centsFrom(field.value, "Refund amount", true);
        if (!(cents > 0)) throw new Error("Refund amount must be more than zero.");
        body = { action: "RECORD_REFUND", refundCents: cents };
      } catch (error) {
        state.error = error;
        paint();
        return;
      }
    } else return;
    body.expectedVersion = Number(version);
    state.busy = true;
    try {
      state.data = await request(`/api/v1/reported-sales/${encodeURIComponent(state.opportunityId)}/${encodeURIComponent(reportId)}`, "PUT", body);
      state.error = null;
      state.notice = "Sale updated.";
      refreshLifecycle();
    } catch (error) {
      state.error = error;
    } finally {
      state.busy = false;
      paint();
    }
  }

  function refreshLifecycle() {
    // The lifecycle (SOLD / OWNED, proceeds) may have changed; reload it. Its re-render re-creates this panel.
    const adapter = window.FlipForgeCustomerLifecycle;
    if (adapter && typeof adapter.refresh === "function") {
      try { adapter.refresh(); } catch (_) { /* The panel still shows the saved sale. */ }
    }
  }

  function bind(node) {
    node.querySelector("[data-reported-sale-open]")?.addEventListener("click", () => {
      state.formOpen = true;
      state.clientId = uuid();
      state.notice = "";
      state.error = null;
      paint();
    });
    node.querySelector("[data-reported-sale-cancel]")?.addEventListener("click", () => {
      state.formOpen = false;
      state.error = null;
      paint();
    });
    node.querySelector("[data-reported-sale-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      submitSale(event.currentTarget);
    });
    node.querySelectorAll("[data-reported-sale-action]").forEach(button => {
      button.addEventListener("click", () => {
        const article = button.closest("[data-reported-sale-id]");
        if (!article) return;
        act(article.getAttribute("data-reported-sale-id"), article.getAttribute("data-reported-sale-version"),
          button.getAttribute("data-reported-sale-action"));
      });
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
      state.data = null;
      state.formOpen = false;
      state.notice = "";
    }
    state.opportunityId = id;
    state.error = null;
    state.generation += 1;
    grid.insertAdjacentHTML("afterend", `<section class="panel ff-reported-sales" ${PANEL} data-opportunity-id="${escapeHtml(id)}"></section>`);
    paint();
    load(state.generation);
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

  window.FlipForgeReportedSales = Object.freeze({ isEligible: eligibleHost, mount, requestCount: () => state.requests });
})();
