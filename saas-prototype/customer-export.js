(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const EXPORT_SCHEMA_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const FIXED_PATHS = new Set(["/api/v1/health", "/api/v1/opportunities"]);

  const state = {
    main: null,
    requestedId: "",
    selectedId: "",
    health: null,
    opportunities: null,
    sources: null,
    prepared: null,
    loading: false,
    preparing: false,
    error: null,
    notice: ""
  };

  function eligibleHost() {
    return PREVIEW_HOST.test(String(window.location.hostname || ""));
  }

  function handles(route) {
    return route === "export";
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
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `customer-export-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function requirePath(path) {
    const value = String(path || "");
    if (FIXED_PATHS.has(value)) return value;
    const match = value.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor|lifecycle)\/([^/?#]+)$/);
    if (!match) throw new Error("The requested export source is not allowlisted.");
    let decoded = "";
    try {
      decoded = decodeURIComponent(match[2]);
    } catch (_) {
      throw new Error("The requested export identifier is invalid.");
    }
    if (!SAFE_ID.test(decoded)) throw new Error("The requested export identifier is invalid.");
    return value;
  }

  function validEnvelope(payload, expectedCorrelationId) {
    const meta = payload && payload.meta;
    return Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && meta)
      && meta.contractVersion === CONTRACT_VERSION
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId
      && Object.prototype.hasOwnProperty.call(payload, "data");
  }

  function validHealth(payload, expectedCorrelationId) {
    return Boolean(payload?.meta && payload?.data)
      && payload.meta.contractVersion === CONTRACT_VERSION
      && payload.meta.correlationId === expectedCorrelationId;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      throw Object.assign(new Error("The export source exceeded the browser safety limit."), { code: "EXPORT_RESPONSE_TOO_LARGE" });
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw Object.assign(new Error("The export source returned invalid JSON."), { code: "EXPORT_INVALID_JSON" });
    }
  }

  async function request(path) {
    const safePath = requirePath(path);
    const requestCorrelationId = correlationId();
    const response = await fetch(safePath, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId }
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Export source failed with status ${response.status}.`), {
        code: upstream.code || "EXPORT_SOURCE_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    const valid = safePath === "/api/v1/health"
      ? validHealth(payload, requestCorrelationId)
      : validEnvelope(payload, requestCorrelationId);
    if (!valid) {
      throw Object.assign(new Error("The export source failed the FlipForge authority contract."), { code: "EXPORT_CONTRACT_INVALID" });
    }
    return payload;
  }

  function opportunityItems() {
    return safeArray(state.opportunities?.data?.items).filter(item => SAFE_ID.test(String(item?.id || "")));
  }

  function titleFor(id) {
    const item = opportunityItems().find(candidate => String(candidate.id) === String(id));
    return item?.title || item?.cardIdentity || id || "Saved decision";
  }

  function chooseId() {
    const ids = opportunityItems().map(item => String(item.id));
    if (state.requestedId) {
      if (!SAFE_ID.test(state.requestedId) || !ids.includes(state.requestedId)) {
        throw Object.assign(new Error("The requested saved record was not returned for this tenant."), { code: "RESOURCE_NOT_FOUND", status: 404 });
      }
      return state.requestedId;
    }
    return ids[0] || "";
  }

  function validateSources(opportunityId, sources) {
    const opportunity = sources.opportunity?.data;
    const evidence = sources.evidence?.data;
    const psa = sources.psa?.data;
    const lifecycle = sources.lifecycle?.data;
    if (opportunity?.kind !== "opportunity-detail" || String(opportunity?.opportunity?.id || "") !== opportunityId) {
      throw Object.assign(new Error("The saved opportunity did not match the selected export record."), { code: "EXPORT_OPPORTUNITY_INVALID" });
    }
    if (evidence?.kind !== "evidence" || String(evidence?.opportunityId || "") !== opportunityId) {
      throw Object.assign(new Error("The evidence ledger did not match the selected export record."), { code: "EXPORT_EVIDENCE_INVALID" });
    }
    if (psa?.kind !== "psa-advisor" || String(psa?.opportunityId || "") !== opportunityId || psa?.recalculated !== false) {
      throw Object.assign(new Error("The saved PSA snapshot did not match the selected export record."), { code: "EXPORT_PSA_INVALID" });
    }
    if (lifecycle?.kind !== "lifecycle-detail" || String(lifecycle?.opportunityId || "") !== opportunityId || !Array.isArray(lifecycle?.history)) {
      throw Object.assign(new Error("The lifecycle history did not match the selected export record."), { code: "EXPORT_LIFECYCLE_INVALID" });
    }
  }

  async function loadSources() {
    if (!state.selectedId) return;
    const encoded = encodeURIComponent(state.selectedId);
    const [opportunity, evidence, psa, lifecycle] = await Promise.all([
      request(`/api/v1/opportunities/${encoded}`),
      request(`/api/v1/evidence/${encoded}`),
      request(`/api/v1/psa-advisor/${encoded}`),
      request(`/api/v1/lifecycle/${encoded}`)
    ]);
    const sources = { opportunity, evidence, psa, lifecycle };
    validateSources(state.selectedId, sources);
    state.sources = sources;
    state.prepared = null;
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }

  async function sha256(text) {
    if (!window.crypto?.subtle || typeof window.crypto.subtle.digest !== "function") {
      throw Object.assign(new Error("This browser cannot create the required SHA-256 integrity digest."), { code: "EXPORT_DIGEST_UNAVAILABLE" });
    }
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function prepareExport() {
    if (!state.sources || !state.selectedId) return;
    state.preparing = true;
    state.error = null;
    state.notice = "Creating a deterministic integrity manifest…";
    renderCurrent();
    try {
      const generatedAt = new Date().toISOString();
      const payload = canonicalize({
        schemaVersion: EXPORT_SCHEMA_VERSION,
        opportunityId: state.selectedId,
        generatedAt,
        authority: {
          recommendation: "Smart Opportunity",
          gradingGuidance: "Existing PSA intelligence",
          sourceOfTruth: "SQLite",
          transactionAuthority: false
        },
        limitations: [
          "Decision support only; this export is not a guarantee of value, profit, grade, liquidity, authenticity, or sale proceeds.",
          "Active listings are discovery context and are not completed-sale evidence.",
          "Current portfolio value and performance are not calculated.",
          "No bid, purchase, listing, offer, checkout, payment, or transfer authority is included."
        ],
        savedOpportunity: state.sources.opportunity.data,
        governedEvidence: state.sources.evidence.data,
        savedPsaGuidance: state.sources.psa.data,
        customerLifecycle: state.sources.lifecycle.data
      });
      const canonicalJson = JSON.stringify(payload);
      const digest = await sha256(canonicalJson);
      state.prepared = {
        manifest: {
          exportSchemaVersion: EXPORT_SCHEMA_VERSION,
          digestAlgorithm: "SHA-256",
          payloadSha256: digest,
          generatedAt,
          opportunityId: state.selectedId,
          complete: true,
          partialExport: false
        },
        payload
      };
      state.notice = "Export package prepared in memory. Nothing was uploaded or saved to browser storage.";
    } catch (error) {
      state.error = error;
      state.notice = "";
    } finally {
      state.preparing = false;
      renderCurrent();
    }
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function csvRows() {
    const dossier = state.prepared;
    const item = dossier?.payload?.savedOpportunity?.opportunity || {};
    const evidence = dossier?.payload?.governedEvidence || {};
    const psa = dossier?.payload?.savedPsaGuidance || {};
    const lifecycle = dossier?.payload?.customerLifecycle?.lifecycle || {};
    const rows = [
      ["section", "field", "value"],
      ["manifest", "payload_sha256", dossier?.manifest?.payloadSha256 || ""],
      ["manifest", "generated_at", dossier?.manifest?.generatedAt || ""],
      ["authority", "recommendation", "Smart Opportunity"],
      ["authority", "grading_guidance", "Existing PSA intelligence"],
      ["authority", "transaction_authority", "false"],
      ["opportunity", "id", item.id || state.selectedId],
      ["opportunity", "card_identity", item.cardIdentity || ""],
      ["opportunity", "recommendation", item.recommendation || ""],
      ["opportunity", "ask", item.ask ?? ""],
      ["opportunity", "supported_value", item.supportedValue ?? ""],
      ["opportunity", "confidence", item.confidence ?? ""],
      ["opportunity", "liquidity", item.liquidity ?? ""],
      ["opportunity", "risk", item.risk ?? ""],
      ["evidence", "accepted_exact_completed_sales", evidence.acceptedExactCompletedSales ?? ""],
      ["evidence", "visible_but_authority_ineligible", evidence.visibleButAuthorityIneligible ?? ""],
      ["psa", "guidance_status", psa.guidanceStatus || ""],
      ["psa", "recalculated", psa.recalculated === true ? "true" : "false"],
      ["lifecycle", "tracking_status", lifecycle.trackingStatus || ""],
      ["lifecycle", "outcome_status", lifecycle.outcomeStatus || ""],
      ["lifecycle", "review_at", lifecycle.reviewAt || ""],
      ["lifecycle", "record_version", lifecycle.version ?? ""],
      ["boundary", "current_value_calculated", "false"],
      ["boundary", "performance_calculated", "false"]
    ];
    safeArray(dossier?.payload?.customerLifecycle?.history).forEach((event, index) => {
      rows.push([`lifecycle_history_${index + 1}`, "event", `${event.recordedAt || ""} | ${event.eventType || "UPDATED"} | ${event.trackingStatus || ""} | ${event.outcomeStatus || ""} | version ${event.recordVersion ?? ""}`]);
    });
    return rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  }

  function safeFilename(extension) {
    const id = String(state.selectedId || "decision").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
    return `flipforge-decision-dossier-${id}.${extension}`;
  }

  function download(content, type, extension) {
    if (!state.prepared) return;
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeFilename(extension);
    anchor.rel = "noopener";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function badge(label, tone = "neutral") {
    return `<span class="staging-status staging-status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function errorPanel() {
    if (!state.error) return "";
    const signIn = state.error.status === 401
      ? `<a class="button button-primary" href="/staging-auth.html?returnTo=%2Fsaas-prototype%2F%23%2Fexport">Sign in securely</a>`
      : "";
    return `<section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(state.error.code || "EXPORT_UNAVAILABLE")}</strong><p>${escapeHtml(state.error.message || "The decision dossier could not be prepared.")}</p><small>No partial export or browser-stored fallback was created.</small>${signIn}</div></section>`;
  }

  function selector() {
    const items = opportunityItems();
    if (!items.length) return `<div class="staging-empty"><strong>No saved decision is available.</strong><p>Evaluate one exact card before creating an audit export.</p><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div>`;
    return `<label class="customer-export-selector"><span>Saved decision</span><select data-customer-export-select>${items.map(item => `<option value="${escapeHtml(item.id)}" ${String(item.id) === state.selectedId ? "selected" : ""}>${escapeHtml(item.title || item.cardIdentity || item.id)}</option>`).join("")}</select></label>`;
  }

  function sourceChecklist() {
    const sources = state.sources;
    const rows = [
      ["Saved Smart Opportunity record", Boolean(sources?.opportunity)],
      ["Governed evidence ledger", Boolean(sources?.evidence)],
      ["Saved PSA guidance", Boolean(sources?.psa)],
      ["Lifecycle snapshot and append-only history", Boolean(sources?.lifecycle)]
    ];
    return `<div class="customer-export-checklist">${rows.map(([label, ready]) => `<div data-state="${ready ? "ready" : "pending"}"><span>${ready ? "✓" : "·"}</span><span><strong>${escapeHtml(label)}</strong><small>${ready ? "Contract matched the selected tenant-owned record." : "Waiting for a complete source set."}</small></span></div>`).join("")}</div>`;
  }

  function pageMarkup() {
    if (state.loading) {
      return `<div class="page customer-export-page"><header class="page-heading"><div><span class="eyebrow">Audit-safe customer export</span><h1>Decision Dossier</h1><p>Loading the complete tenant-owned source set without a mock fallback.</p></div></header><div class="staging-loading" role="status">Loading authoritative export sources…</div></div>`;
    }
    if (state.health?.data?.status !== "configured" && !state.error) {
      return `<div class="page customer-export-page"><header class="page-heading"><div><span class="eyebrow">Audit-safe customer export</span><h1>Decision Dossier</h1><p>Prepared for a controlled tenant-scoped private-beta session.</p></div></header><section class="panel"><div class="panel-body staging-empty"><strong>Decision export is safely offline.</strong><p>The preview bridge is disabled, so no tenant data was read and no sample dossier was created.</p></div></section></div>`;
    }
    if (state.error) {
      return `<div class="page customer-export-page"><header class="page-heading"><div><span class="eyebrow">Audit-safe customer export</span><h1>Decision Dossier unavailable</h1><p>The complete source contract failed, so no export controls are available.</p></div></header>${errorPanel()}</div>`;
    }
    const prepared = state.prepared;
    const digest = prepared?.manifest?.payloadSha256 || "";
    return `<div class="page customer-export-page">
      <header class="page-heading"><div><span class="eyebrow">Audit-safe customer export</span><h1>Decision Dossier</h1><p>Export one complete saved decision with its evidence, PSA context, and lifecycle history.</p></div><div class="page-actions"><a class="button button-secondary" href="#/opportunities/${encodeURIComponent(state.selectedId || "")}">Card Intelligence</a><button class="button button-secondary" type="button" data-customer-export-refresh>Refresh</button></div></header>
      <div class="boundary-note"><strong>Export boundary:</strong> This workspace packages existing tenant-owned reads. It does not rescore, rerank, accept evidence, predict a grade, calculate current value or performance, or authorize any transaction.</div>
      ${errorPanel()}
      ${state.notice ? `<div class="customer-export-notice" role="status">${escapeHtml(state.notice)}</div>` : ""}
      <section class="panel"><div class="panel-body">${selector()}</div></section>
      ${state.selectedId ? `<div class="customer-export-grid"><section class="panel"><header class="panel-header"><div><h2>Complete source set</h2><p>${escapeHtml(titleFor(state.selectedId))}</p></div>${badge(state.sources ? "Complete" : "Unavailable", state.sources ? "ok" : "warn")}</header><div class="panel-body">${sourceChecklist()}</div></section><section class="panel"><header class="panel-header"><div><h2>Integrity manifest</h2><p>SHA-256 covers the deterministic JSON payload. It detects changes; it is not a digital signature.</p></div>${badge(prepared ? "Prepared" : "Not prepared", prepared ? "ok" : "neutral")}</header><div class="panel-body customer-export-manifest"><div><span>Schema</span><strong>${EXPORT_SCHEMA_VERSION}</strong></div><div><span>Partial export</span><strong>No</strong></div><div><span>Browser storage</span><strong>None</strong></div><div><span>Transaction authority</span><strong>None</strong></div>${digest ? `<div class="customer-export-digest"><span>Payload SHA-256</span><code>${escapeHtml(digest)}</code></div>` : ""}</div></section></div><section class="panel customer-export-actions"><header class="panel-header"><div><h2>Prepare and download</h2><p>Preparation happens in memory. Downloads remain on this device unless the tester shares them.</p></div></header><div class="panel-body"><button class="button button-primary" type="button" data-customer-export-prepare ${state.preparing || !state.sources ? "disabled" : ""}>${state.preparing ? "Preparing…" : "Prepare complete dossier"}</button><button class="button button-secondary" type="button" data-customer-export-json ${prepared ? "" : "disabled"}>Download JSON dossier</button><button class="button button-secondary" type="button" data-customer-export-csv ${prepared ? "" : "disabled"}>Download CSV manifest</button><small>JSON contains the complete governed source set. CSV is a human-readable summary plus lifecycle-event rows and the same integrity digest.</small></div></section>` : ""}
    </div>`;
  }

  function bindActions() {
    if (!state.main || typeof state.main.querySelector !== "function") return;
    state.main.querySelector("[data-customer-export-refresh]")?.addEventListener("click", load);
    const select = state.main.querySelector("[data-customer-export-select]");
    select?.addEventListener("change", () => {
      const id = String(select.value || "");
      if (SAFE_ID.test(id)) window.location.hash = `#/export/${encodeURIComponent(id)}`;
    });
    state.main.querySelector("[data-customer-export-prepare]")?.addEventListener("click", prepareExport);
    state.main.querySelector("[data-customer-export-json]")?.addEventListener("click", () => download(`${JSON.stringify(state.prepared, null, 2)}\n`, "application/json;charset=utf-8", "json"));
    state.main.querySelector("[data-customer-export-csv]")?.addEventListener("click", () => download(`${csvRows()}\r\n`, "text/csv;charset=utf-8", "csv"));
  }

  function renderCurrent() {
    if (!state.main) return;
    state.main.innerHTML = pageMarkup();
    bindActions();
  }

  function reset() {
    state.health = null;
    state.opportunities = null;
    state.sources = null;
    state.prepared = null;
    state.selectedId = "";
    state.error = null;
    state.notice = "";
  }

  async function load() {
    state.loading = true;
    reset();
    renderCurrent();
    try {
      state.health = await request("/api/v1/health");
      if (state.health?.data?.status !== "configured") return;
      state.opportunities = await request("/api/v1/opportunities");
      if (state.opportunities?.data?.kind !== "opportunities" || !Array.isArray(state.opportunities?.data?.items)) {
        throw Object.assign(new Error("The saved-decision list failed the export contract."), { code: "EXPORT_LIST_INVALID" });
      }
      state.selectedId = chooseId();
      if (state.selectedId) await loadSources();
    } catch (error) {
      state.error = error;
    } finally {
      state.loading = false;
      renderCurrent();
    }
  }

  function render(main, id = "") {
    if (!eligibleHost()) return false;
    state.main = main;
    try {
      state.requestedId = decodeURIComponent(String(id || ""));
    } catch (_) {
      state.requestedId = String(id || "");
    }
    load();
    return true;
  }

  window.FlipForgeCustomerExport = Object.freeze({
    isEligible: eligibleHost,
    handles,
    render,
    refresh: load
  });
})();