(() => {
  "use strict";

  const EVALUATION_PATH = "/api/v1/evaluations";
  const MAX_ROWS = 25;
  const MAX_FILE_BYTES = 256_000;
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,100}$/;
  const SAFE_EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;
  const SAFE_OPPORTUNITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const DECISIONS = new Set(["BUY", "WATCH", "VERIFY", "PASS"]);
  const MARKETPLACES = new Set([
    "EBAY", "COMC", "MYSLABS", "GOLDIN", "HERITAGE", "FANATICS_COLLECT",
    "DEALER", "CARD_SHOW", "FACEBOOK_GROUP", "OTHER"
  ]);
  const TEMPLATE_HEADERS = [
    "externalListingId", "marketplace", "cardIdentity", "listingUrl", "itemPrice",
    "shipping", "buyerPremium", "tax", "seller", "listingFormat", "endsAt"
  ];

  const state = {
    fileName: "",
    rows: [],
    running: false,
    error: "",
    acknowledged: false
  };

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    if (PRODUCTION_HOST.test(host)) return APP_PATH.test(String(window.location.pathname || ""));
    return PREVIEW_HOST.test(host);
  }

  function isEvaluateRoute() {
    return window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0] === "evaluate";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeHeader(value) {
    return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  }

  function headerKey(value) {
    const normalized = normalizeHeader(value);
    const aliases = {
      externallistingid: "externalListingId",
      listingid: "externalListingId",
      marketplace: "marketplace",
      cardidentity: "cardIdentity",
      card: "cardIdentity",
      listingurl: "listingUrl",
      url: "listingUrl",
      itemprice: "itemPrice",
      askprice: "itemPrice",
      price: "itemPrice",
      shipping: "shipping",
      buyerpremium: "buyerPremium",
      premium: "buyerPremium",
      tax: "tax",
      seller: "seller",
      listingformat: "listingFormat",
      format: "listingFormat",
      endsat: "endsAt",
      endtime: "endsAt"
    };
    return aliases[normalized] || "";
  }

  function parseCsv(text) {
    const records = [];
    let record = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (quoted) {
        if (char === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index++;
          } else {
            quoted = false;
          }
        } else {
          field += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        record.push(field);
        field = "";
      } else if (char === "\n") {
        record.push(field.replace(/\r$/, ""));
        records.push(record);
        record = [];
        field = "";
      } else {
        field += char;
      }
    }

    if (quoted) throw new Error("CSV contains an unclosed quoted field.");
    if (field.length || record.length) {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
    }

    return records.filter(row => row.some(value => String(value).trim() !== ""));
  }

  function rowsFromCsv(text) {
    const records = parseCsv(text);
    if (records.length < 2) throw new Error("CSV must contain a header row and at least one card.");
    const mappedHeaders = records[0].map(headerKey);
    const required = ["externalListingId", "cardIdentity", "listingUrl", "itemPrice"];
    const missing = required.filter(key => !mappedHeaders.includes(key));
    if (missing.length) throw new Error(`CSV is missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`);

    const bodyRows = records.slice(1);
    if (bodyRows.length > MAX_ROWS) throw new Error(`Bulk Evaluate accepts up to ${MAX_ROWS} cards per CSV.`);

    return bodyRows.map((values, index) => {
      const draft = { marketplace: "EBAY" };
      mappedHeaders.forEach((key, column) => {
        if (key) draft[key] = values[column] == null ? "" : String(values[column]).trim();
      });
      if (!draft.marketplace) draft.marketplace = "EBAY";
      return {
        rowNumber: index + 2,
        draft,
        status: "READY",
        recommendation: "",
        confidence: "",
        risk: "",
        opportunityId: "",
        message: ""
      };
    });
  }

  function cleanText(value, label, maxLength, required = false) {
    const text = String(value ?? "").trim().replace(/\s+/g, " ");
    if (required && !text) throw new Error(`${label} is required.`);
    if (text.length > maxLength) throw new Error(`${label} is too long.`);
    return text;
  }

  function dollarsToCents(value, required, label) {
    const text = String(value ?? "").trim();
    if (!text) {
      if (required) throw new Error(`${label} is required.`);
      return 0;
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`${label} must be a non-negative dollar amount with no more than two decimal places.`);
    const [whole, fraction = ""] = text.split(".");
    const cents = (BigInt(whole) * 100n) + BigInt((fraction + "00").slice(0, 2));
    if (cents > 10_000_000_000n) throw new Error(`${label} is outside the allowed range.`);
    return Number(cents);
  }

  function validHttpUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
    } catch (_) {
      return false;
    }
  }

  function payloadFromRow(row) {
    const draft = row.draft;
    const externalListingId = cleanText(draft.externalListingId, "External listing ID", 180, true);
    if (!SAFE_EXTERNAL_ID.test(externalListingId)) throw new Error("External listing ID contains unsupported characters.");
    const marketplace = cleanText(draft.marketplace || "EBAY", "Marketplace", 80, true).toUpperCase();
    if (!MARKETPLACES.has(marketplace)) throw new Error(`Marketplace ${marketplace} is not supported.`);
    const opportunityId = `${marketplace}-${externalListingId}`;
    if (!SAFE_OPPORTUNITY_ID.test(opportunityId)) throw new Error("Marketplace and listing ID do not produce a safe opportunity ID.");

    const cardIdentity = cleanText(draft.cardIdentity, "Card identity", 500, true);
    const listingUrl = cleanText(draft.listingUrl, "Listing URL", 2048, true);
    if (!validHttpUrl(listingUrl)) throw new Error("Listing URL must be a valid HTTP or HTTPS URL.");

    return {
      externalListingId,
      marketplace,
      cardIdentity,
      listingUrl,
      seller: cleanText(draft.seller, "Seller", 300),
      itemPriceCents: dollarsToCents(draft.itemPrice, true, "Item price"),
      shippingCents: dollarsToCents(draft.shipping, false, "Shipping"),
      buyerPremiumCents: dollarsToCents(draft.buyerPremium, false, "Buyer premium"),
      taxCents: dollarsToCents(draft.tax, false, "Tax"),
      listingFormat: cleanText(draft.listingFormat, "Listing format", 100),
      endsAt: cleanText(draft.endsAt, "Ends at", 100)
    };
  }

  function newIdempotencyKey(rowNumber) {
    const suffix = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const key = `bulk-${rowNumber}-${suffix}`;
    if (!SAFE_REQUEST_ID.test(key)) throw new Error("A safe idempotency key could not be generated.");
    return key;
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `bulk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("Evaluation response exceeded the browser safety limit.");
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw new Error("Evaluation gateway returned invalid JSON.");
    }
  }

  function validEnvelope(payload, correlation, requestId) {
    const meta = payload && payload.meta;
    const data = payload && payload.data;
    const decision = data && data.decision;
    const isolation = data && data.tenantIsolation;
    return Boolean(meta && data && decision && isolation)
      && meta.contractVersion === "1.0"
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === correlation
      && data.kind === "evaluation"
      && data.requestId === requestId
      && data.persistedToSqlite === true
      && data.tenantOwned === true
      && data.requestCanVerifyEvidence === false
      && data.requestCanVerifyIdentity === false
      && data.evidenceAcceptedByRequest === false
      && data.psaRecalculated === false
      && data.transactionAuthorized === false
      && data.providerCredentialsExposed === false
      && isolation.enforced === true
      && isolation.idempotencyScope === "TENANT"
      && isolation.opportunityOwnership === "GRANTED_ON_COMPLETION"
      && isolation.defaultAccess === "DENY"
      && DECISIONS.has(String(decision.recommendation || "").toUpperCase());
  }

  async function submitRow(row) {
    const payload = payloadFromRow(row);
    const requestId = newIdempotencyKey(row.rowNumber);
    const requestCorrelationId = correlationId();
    const response = await fetch(EVALUATION_PATH, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "X-Correlation-Id": requestCorrelationId,
        "Idempotency-Key": requestId
      },
      body: JSON.stringify(payload),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const body = await parseResponse(response);
    if (!response.ok) {
      const upstream = body && body.error ? body.error : {};
      const error = new Error(upstream.message || `Evaluation failed with status ${response.status}.`);
      error.code = upstream.code || "EVALUATION_FAILED";
      error.status = response.status;
      throw error;
    }
    if (!validEnvelope(body, requestCorrelationId, requestId)) throw new Error("Evaluation response failed the FlipForge authority and tenant-ownership contract.");
    return body;
  }

  function progressText() {
    if (!state.rows.length) return "No CSV loaded.";
    const done = state.rows.filter(row => row.status === "COMPLETE" || row.status === "ERROR").length;
    const successful = state.rows.filter(row => row.status === "COMPLETE").length;
    const failed = state.rows.filter(row => row.status === "ERROR").length;
    if (state.running) return `${done} of ${state.rows.length} processed · ${successful} saved · ${failed} failed`;
    return `${state.rows.length} card${state.rows.length === 1 ? "" : "s"} ready · ${successful} saved${failed ? ` · ${failed} failed` : ""}`;
  }

  function resultRows() {
    if (!state.rows.length) return "";
    return `<div class="bulk-table-wrap"><table class="bulk-table"><thead><tr><th>Row</th><th>Card</th><th>Decision</th><th>Confidence</th><th>Risk</th><th>Status</th></tr></thead><tbody>${state.rows.map(row => {
      const card = row.draft.cardIdentity || "—";
      const statusClass = row.status === "COMPLETE" ? "ok" : row.status === "ERROR" ? "error" : row.status === "RUNNING" ? "running" : "ready";
      const decision = row.recommendation || "—";
      const link = row.opportunityId ? `<a href="#/opportunities/${encodeURIComponent(row.opportunityId)}">${escapeHtml(decision)}</a>` : escapeHtml(decision);
      return `<tr><td>${row.rowNumber}</td><td><strong>${escapeHtml(card)}</strong>${row.message ? `<small>${escapeHtml(row.message)}</small>` : ""}</td><td>${link}</td><td>${escapeHtml(row.confidence || "—")}</td><td>${escapeHtml(row.risk || "—")}</td><td><span class="bulk-status bulk-status-${statusClass}">${escapeHtml(row.status)}</span></td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function renderPanel() {
    const panel = document.querySelector("[data-bulk-evaluation]");
    if (!panel) return;
    panel.innerHTML = `
      <header class="panel-header">
        <div><h2>Bulk Evaluate</h2><p>Upload up to ${MAX_ROWS} listings. Each row is sent through the same tenant-scoped Smart Opportunity evaluation used above.</p></div>
        <span class="bulk-count">${state.rows.length ? `${state.rows.length}/${MAX_ROWS}` : `0/${MAX_ROWS}`}</span>
      </header>
      <div class="panel-body bulk-body">
        ${state.error ? `<div class="bulk-error" role="alert"><strong>CSV problem</strong><span>${escapeHtml(state.error)}</span></div>` : ""}
        <div class="bulk-actions">
          <label class="button button-secondary bulk-upload-button">
            Upload CSV
            <input type="file" accept=".csv,text/csv" data-bulk-file hidden ${state.running ? "disabled" : ""}>
          </label>
          <button class="button button-secondary" type="button" data-bulk-template ${state.running ? "disabled" : ""}>Download template</button>
          <button class="button button-primary" type="button" data-bulk-run ${(!state.rows.length || state.running || !state.acknowledged) ? "disabled" : ""}>${state.running ? "Evaluating…" : `Evaluate ${state.rows.length || "CSV"}`}</button>
        </div>
        <p class="bulk-file">${state.fileName ? `<strong>${escapeHtml(state.fileName)}</strong> · ${escapeHtml(progressText())}` : "Required columns: externalListingId, cardIdentity, listingUrl, itemPrice. Marketplace defaults to EBAY."}</p>
        <label class="bulk-ack"><input type="checkbox" data-bulk-ack ${state.acknowledged ? "checked" : ""} ${state.running ? "disabled" : ""}> <span>I understand each CSV row is a separate governed evaluation, uses plan allowance, cannot verify evidence or identity, and does not authorize a purchase.</span></label>
        ${resultRows()}
      </div>`;
    bindPanel(panel);
  }

  function mount() {
    if (!eligibleHost() || !isEvaluateRoute()) return;
    const page = document.querySelector(".customer-evaluation-page");
    if (!page || page.querySelector("[data-bulk-evaluation]")) return;
    const panel = document.createElement("section");
    panel.className = "panel bulk-evaluation-panel";
    panel.setAttribute("data-bulk-evaluation", "");
    const boundary = page.querySelector(".boundary-note");
    if (boundary && boundary.nextSibling) boundary.parentNode.insertBefore(panel, boundary.nextSibling);
    else page.appendChild(panel);
    ensureStyles();
    renderPanel();
  }

  function ensureStyles() {
    if (document.querySelector("#flipforge-bulk-evaluation-styles")) return;
    const style = document.createElement("style");
    style.id = "flipforge-bulk-evaluation-styles";
    style.textContent = `
      .bulk-evaluation-panel{border-color:rgba(246,169,22,.38)}
      .bulk-body{display:grid;gap:16px}
      .bulk-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
      .bulk-count{font-weight:800;color:var(--gold)}
      .bulk-file{margin:0;color:var(--text-muted)}
      .bulk-ack{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.02);line-height:1.45}
      .bulk-ack input{margin-top:3px;accent-color:var(--gold)}
      .bulk-error{display:flex;gap:10px;flex-wrap:wrap;padding:12px 14px;border:1px solid rgba(255,100,100,.45);border-radius:12px;background:rgba(255,80,80,.08)}
      .bulk-error strong{color:#ff9b9b}
      .bulk-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:12px}
      .bulk-table{width:100%;border-collapse:collapse;min-width:760px}
      .bulk-table th,.bulk-table td{padding:11px 12px;text-align:left;border-bottom:1px solid var(--border);vertical-align:top}
      .bulk-table th{font-size:.76rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)}
      .bulk-table td small{display:block;margin-top:4px;color:var(--text-muted);max-width:520px}
      .bulk-status{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:.72rem;font-weight:800;letter-spacing:.04em}
      .bulk-status-ok{background:rgba(39,209,127,.14);color:var(--green)}
      .bulk-status-error{background:rgba(255,100,100,.12);color:#ff9b9b}
      .bulk-status-running{background:rgba(97,168,255,.14);color:var(--blue)}
      .bulk-status-ready{background:rgba(246,169,22,.12);color:var(--gold)}
      @media(max-width:720px){.bulk-actions .button,.bulk-upload-button{width:100%;justify-content:center}.bulk-ack{font-size:.9rem}}
    `;
    document.head.appendChild(style);
  }

  async function handleFile(file) {
    state.error = "";
    state.rows = [];
    state.fileName = "";
    if (!file) return renderPanel();
    if (file.size > MAX_FILE_BYTES) {
      state.error = "CSV is too large. Keep the batch to 25 rows.";
      return renderPanel();
    }
    try {
      const text = await file.text();
      state.rows = rowsFromCsv(text);
      state.fileName = file.name;
      state.rows.forEach(row => {
        try {
          payloadFromRow(row);
        } catch (error) {
          row.status = "ERROR";
          row.message = error.message;
        }
      });
      const invalid = state.rows.filter(row => row.status === "ERROR").length;
      if (invalid) state.error = `${invalid} row${invalid === 1 ? "" : "s"} need correction before the batch can run.`;
    } catch (error) {
      state.error = error.message || "CSV could not be read.";
      state.rows = [];
      state.fileName = file.name;
    }
    renderPanel();
  }

  function downloadTemplate() {
    const sample = [
      TEMPLATE_HEADERS.join(","),
      "123456789012,EBAY,2018 Topps Chrome Shohei Ohtani #150 PSA 10,https://www.ebay.com/itm/123456789012,525.00,0,0,0,,,"
    ].join("\n");
    const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "flipforge-bulk-evaluate-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function runBatch() {
    if (state.running || !state.acknowledged || !state.rows.length) return;
    if (state.rows.some(row => row.status === "ERROR")) {
      state.error = "Correct CSV row errors and upload the file again before evaluating.";
      return renderPanel();
    }

    state.error = "";
    state.running = true;
    renderPanel();

    for (const row of state.rows) {
      row.status = "RUNNING";
      row.message = "Submitting authoritative evaluation…";
      renderPanel();
      try {
        const response = await submitRow(row);
        const data = response.data;
        const decision = data.decision || {};
        row.status = "COMPLETE";
        row.recommendation = String(decision.recommendation || "").toUpperCase();
        row.confidence = Number.isFinite(Number(decision.confidence)) ? `${Number(decision.confidence)}/100` : "—";
        row.risk = Number.isFinite(Number(decision.risk)) ? `${Number(decision.risk)}/100` : "—";
        row.opportunityId = String(data.opportunityId || "");
        row.message = `${decision.exactTrustedCompCount ?? 0} accepted exact comp${Number(decision.exactTrustedCompCount) === 1 ? "" : "s"} · saved to SQLite`;
      } catch (error) {
        row.status = "ERROR";
        row.message = `${error.code ? `${error.code}: ` : ""}${error.message || "Evaluation failed."}`;
        if (error.status === 401 || error.status === 403 || error.status === 429) {
          state.error = "Batch stopped because account access or evaluation allowance requires attention. Completed rows remain saved.";
          break;
        }
      }
      renderPanel();
    }

    state.running = false;
    renderPanel();
  }

  function bindPanel(panel) {
    const file = panel.querySelector("[data-bulk-file]");
    const template = panel.querySelector("[data-bulk-template]");
    const run = panel.querySelector("[data-bulk-run]");
    const ack = panel.querySelector("[data-bulk-ack]");
    if (file) file.addEventListener("change", event => handleFile(event.target.files && event.target.files[0]));
    if (template) template.addEventListener("click", downloadTemplate);
    if (run) run.addEventListener("click", runBatch);
    if (ack) ack.addEventListener("change", event => {
      state.acknowledged = event.target.checked === true;
      renderPanel();
    });
  }

  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => setTimeout(mount, 0));
  window.addEventListener("DOMContentLoaded", mount);
  setTimeout(mount, 0);
})();
