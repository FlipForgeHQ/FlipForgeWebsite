(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const ROUTE = "dossier";
  const FIXED_PATHS = new Set(["/api/v1/health", "/api/v1/opportunities"]);
  const PRIVATE_KEYS = new Set([
    "correlationid",
    "tenantid",
    "userid",
    "useremail",
    "email",
    "authorization",
    "cookie",
    "token",
    "servicetoken",
    "accesstoken",
    "idtoken",
    "refreshtoken",
    "clientcontext",
    "app_metadata",
    "user_metadata",
    "membership"
  ]);

  const state = {
    main: null,
    requestedId: "",
    selectedId: "",
    loading: false,
    health: null,
    opportunities: null,
    detail: null,
    evidence: null,
    psa: null,
    lifecycle: null,
    artifact: null,
    digest: "",
    error: null,
    notice: ""
  };

  function eligibleHost() {
    return PREVIEW_HOST.test(String(window.location.hostname || ""));
  }

  function handles(route) {
    return String(route || "") === ROUTE;
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
    return `customer-dossier-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function allowedPath(path) {
    const value = String(path || "");
    if (FIXED_PATHS.has(value)) return value;
    const match = value.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor|lifecycle)\/([^/?#]+)$/);
    if (!match) throw new Error("The requested dossier API path is not allowlisted.");
    let decoded;
    try {
      decoded = decodeURIComponent(match[2]);
    } catch (_) {
      throw new Error("The requested dossier identifier is invalid.");
    }
    if (!SAFE_ID.test(decoded)) throw new Error("The requested dossier identifier is invalid.");
    return value;
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

  function validHealth(payload, expectedCorrelationId) {
    return Boolean(payload?.meta && payload?.data)
      && payload.meta.contractVersion === CONTRACT_VERSION
      && payload.meta.correlationId === expectedCorrelationId;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      throw Object.assign(new Error("The dossier response exceeded the browser safety limit."), {
        code: "DOSSIER_RESPONSE_TOO_LARGE"
      });
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw Object.assign(new Error("The dossier gateway returned invalid JSON."), {
        code: "DOSSIER_INVALID_JSON"
      });
    }
  }

  async function request(path) {
    const safePath = allowedPath(path);
    const requestCorrelationId = correlationId();
    const response = await fetch(safePath, {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload?.error || {};
      throw Object.assign(new Error(upstream.message || `Dossier request failed with status ${response.status}.`), {
        code: upstream.code || "DOSSIER_REQUEST_FAILED",
        status: response.status,
        correlationId: upstream.correlationId || requestCorrelationId
      });
    }
    const valid = safePath === "/api/v1/health"
      ? validHealth(payload, requestCorrelationId)
      : validEnvelope(payload, requestCorrelationId);
    if (!valid) {
      throw Object.assign(new Error("The dossier response failed the FlipForge authority contract."), {
        code: "DOSSIER_CONTRACT_INVALID"
      });
    }
    return payload;
  }

  function opportunityItems() {
    return safeArray(state.opportunities?.data?.items).filter(item => SAFE_ID.test(String(item?.id || "")));
  }

  function selectedOpportunity() {
    return opportunityItems().find(item => String(item.id) === state.selectedId) || null;
  }

  function normalizePrivateKey(key) {
    return String(key || "").replace(/[-_\s]/g, "").toLowerCase();
  }

  function sanitizeForExport(value) {
    if (Array.isArray(value)) return value.map(sanitizeForExport);
    if (!value || typeof value !== "object") return value;
    const result = {};
    Object.keys(value).sort().forEach(key => {
      if (PRIVATE_KEYS.has(normalizePrivateKey(key))) return;
      const next = sanitizeForExport(value[key]);
      if (next !== undefined) result[key] = next;
    });
    return result;
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (value && typeof value === "object") {
      const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
      return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  async function sha256(text) {
    if (!window.crypto?.subtle || typeof TextEncoder !== "function") {
      throw Object.assign(new Error("This browser cannot create the required SHA-256 integrity digest."), {
        code: "DOSSIER_DIGEST_UNAVAILABLE"
      });
    }
    const bytes = new TextEncoder().encode(text);
    const buffer = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function assertSourceMatch() {
    const id = state.selectedId;
    const detail = state.detail?.data;
    const evidence = state.evidence?.data;
    const psa = state.psa?.data;
    const lifecycle = state.lifecycle?.data;
    const opportunity = detail?.opportunity;

    if (detail?.kind !== "opportunity-detail" || String(opportunity?.id || "") !== id) {
      throw Object.assign(new Error("The saved Smart Opportunity record does not match the selected tenant-owned card."), { code: "DOSSIER_OPPORTUNITY_MISMATCH" });
    }
    if (evidence?.kind !== "evidence" || String(evidence?.opportunityId || "") !== id) {
      throw Object.assign(new Error("The saved evidence state does not match the selected tenant-owned card."), { code: "DOSSIER_EVIDENCE_MISMATCH" });
    }
    if (psa?.kind !== "psa-advisor" || String(psa?.opportunityId || "") !== id || psa.recalculated !== false) {
      throw Object.assign(new Error("The saved PSA snapshot does not match the selected tenant-owned card or was recalculated."), { code: "DOSSIER_PSA_MISMATCH" });
    }
    if (lifecycle?.kind !== "lifecycle-detail"
        || String(lifecycle?.opportunityId || "") !== id
        || String(lifecycle?.lifecycle?.opportunityId || "") !== id
        || !Array.isArray(lifecycle?.history)) {
      throw Object.assign(new Error("The lifecycle record or append-only history does not match the selected tenant-owned card."), { code: "DOSSIER_LIFECYCLE_MISMATCH" });
    }

    const identities = [opportunity?.cardIdentity, evidence?.cardIdentity, psa?.cardIdentity]
      .filter(value => typeof value === "string" && value.trim())
      .map(value => value.trim());
    if (new Set(identities).size > 1) {
      throw Object.assign(new Error("The saved card identity differs across dossier sources."), { code: "DOSSIER_IDENTITY_MISMATCH" });
    }

    const metas = [state.detail?.meta, state.evidence?.meta, state.psa?.meta, state.lifecycle?.meta];
    const engines = new Set(metas.map(meta => meta?.engineVersion));
    if (metas.some(meta => meta?.contractVersion !== CONTRACT_VERSION
        || meta?.authority !== "Smart Opportunity"
        || meta?.gradingAuthority !== "Existing PSA intelligence")
        || engines.size !== 1
        || engines.has(undefined)
        || engines.has("")) {
      throw Object.assign(new Error("The authority metadata is not consistent across all dossier sources."), { code: "DOSSIER_AUTHORITY_MISMATCH" });
    }
  }

  async function buildArtifact() {
    assertSourceMatch();
    const meta = state.detail.meta;
    const content = sanitizeForExport({
      schemaVersion: "1.0",
      dossierType: "FLIPFORGE_CUSTOMER_DECISION_DOSSIER",
      opportunityId: state.selectedId,
      authority: {
        contractVersion: meta.contractVersion,
        engineVersion: meta.engineVersion,
        recommendationAuthority: meta.authority,
        gradingAuthority: meta.gradingAuthority,
        evidenceFreshness: meta.evidenceFreshness || "Unavailable",
        limitations: safeArray(meta.limitations)
      },
      savedDecision: state.detail.data.opportunity,
      evidenceState: state.evidence.data,
      psaSnapshot: state.psa.data,
      lifecycle: {
        record: state.lifecycle.data.lifecycle,
        history: state.lifecycle.data.history
      }
    });
    const digest = await sha256(canonicalize(content));
    state.digest = digest;
    state.artifact = {
      ...content,
      integrity: {
        algorithm: "SHA-256",
        canonicalization: "UTF-8 JSON with lexicographically sorted object keys",
        digest,
        scope: "All dossier fields except integrity and exportMetadata"
      },
      exportMetadata: {
        generatedAt: new Date().toISOString(),
        sourceCount: 4,
        partialExportAllowed: false,
        containsIdentityCredentials: false,
        transactionAuthority: false,
        currentValueCalculated: false
      }
    };
  }

  function titleFor(id) {
    const item = opportunityItems().find(entry => String(entry.id) === String(id));
    return item?.title || item?.cardIdentity || String(id || "Saved decision");
  }

  function selector() {
    const items = opportunityItems();
    if (!items.length) return "";
    return `<label class="customer-dossier-selector"><span>Saved tracked card</span><select data-dossier-select>${items.map(item => `<option value="${escapeHtml(item.id)}" ${String(item.id) === state.selectedId ? "selected" : ""}>${escapeHtml(item.title || item.cardIdentity || item.id)}</option>`).join("")}</select></label>`;
  }

  function pageHeading(actions = "") {
    return `<header class="page-heading"><div><span class="eyebrow">Audit-safe customer export</span><h1>Decision Dossier</h1><p>Package one tenant-owned saved decision with its evidence state, saved PSA context, and append-only lifecycle history.</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</header>`;
  }

  function boundary() {
    return `<div class="boundary-note"><strong>Export boundary:</strong> This file preserves saved decision-support records only. It does not recalculate value, predict a grade, accept evidence, create a current-value claim, or authorize a purchase, sale, listing, payment, or transfer.</div>`;
  }

  function errorPanel(error) {
    const signIn = error?.status === 401
      ? `<a class="button button-primary" href="/staging-auth.html?returnTo=%2Fsaas-prototype%2F%23%2Fdossier">Sign in securely</a>`
      : "";
    return `<section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(error?.code || "DOSSIER_UNAVAILABLE")}</strong><p>${escapeHtml(error?.message || "The Decision Dossier is unavailable.")}</p><small>No partial file was created.</small>${signIn}</div></section>`;
  }

  function offlinePanel() {
    return `<section class="panel"><div class="panel-body staging-empty"><strong>Decision Dossier is safely offline.</strong><p>The preview bridge is disabled, so no tenant data request or export was attempted.</p></div></section>`;
  }

  function sourceRow(label, source, detail) {
    return `<article><span class="customer-dossier-check" aria-hidden="true">✓</span><div><strong>${escapeHtml(label)}</strong><p>${escapeHtml(detail)}</p></div><span class="staging-status staging-status-ok">Matched</span></article>`;
  }

  function readyView() {
    const opportunity = selectedOpportunity();
    const historyCount = safeArray(state.lifecycle?.data?.history).length;
    const evidenceCount = Number(state.evidence?.data?.acceptedExactCompletedSales || 0);
    const psaStatus = state.psa?.data?.guidanceStatus || "Unavailable";
    const actions = `<a class="button button-secondary" href="#/opportunities/${encodeURIComponent(state.selectedId)}">Card Intelligence</a><a class="button button-secondary" href="#/tracking/${encodeURIComponent(state.selectedId)}">Tracking</a><button class="button button-secondary" type="button" data-dossier-refresh>Refresh</button>`;
    return `<div class="page customer-dossier-page">${pageHeading(actions)}${boundary()}${state.notice ? `<div class="customer-dossier-notice" role="status">${escapeHtml(state.notice)}</div>` : ""}<section class="panel customer-dossier-select-panel"><div class="panel-body">${selector()}</div></section><section class="customer-dossier-metrics"><article><span>Saved decision</span><strong>${escapeHtml(opportunity?.recommendation || "Saved")}</strong></article><article><span>Accepted exact sales</span><strong>${escapeHtml(evidenceCount)}</strong></article><article><span>PSA context</span><strong>${escapeHtml(psaStatus)}</strong></article><article><span>Lifecycle events</span><strong>${escapeHtml(historyCount)}</strong></article></section><div class="customer-dossier-grid"><section class="panel"><header class="panel-header"><div><h2>Four-source integrity gate</h2><p>Every source must match the same tenant-owned opportunity before export is enabled.</p></div><span class="staging-status staging-status-ok">Complete</span></header><div class="panel-body customer-dossier-sources">${sourceRow("Smart Opportunity", state.detail, "Saved opportunity detail and decision factors")}${sourceRow("Evidence state", state.evidence, "Completed-sale eligibility and evidence-ledger context")}${sourceRow("PSA snapshot", state.psa, "Saved, non-recalculated PSA guidance context")}${sourceRow("Lifecycle history", state.lifecycle, "Current workflow facts and append-only event history")}</div></section><section class="panel customer-dossier-export"><header class="panel-header"><div><h2>Integrity-protected JSON</h2><p>Credentials and tenant identity fields are excluded by an explicit export privacy filter.</p></div></header><div class="panel-body"><div class="customer-dossier-hash"><span>SHA-256</span><code>${escapeHtml(state.digest)}</code></div><ul><li>Deterministic canonical JSON is hashed before download.</li><li>Correlation IDs, tenant/user identity fields, tokens, cookies, and email fields are excluded.</li><li>No partial export is allowed when any source is missing or mismatched.</li><li>No current value, performance, fee, tax, liquidation, or transaction claim is generated.</li></ul><button class="button button-primary" type="button" data-dossier-download>Download decision dossier</button><small>${escapeHtml(titleFor(state.selectedId))} · Opportunity ${escapeHtml(state.selectedId)}</small></div></section></div></div>`;
  }

  function renderCurrent() {
    if (!state.main) return;
    if (state.loading) {
      state.main.innerHTML = `<div class="page customer-dossier-page">${pageHeading()}${boundary()}<div class="staging-loading" role="status">Verifying all four authoritative dossier sources…</div></div>`;
      return;
    }
    if (state.error) {
      state.main.innerHTML = `<div class="page customer-dossier-page">${pageHeading()}${boundary()}${errorPanel(state.error)}</div>`;
      return;
    }
    if (state.health?.data?.status !== "configured") {
      state.main.innerHTML = `<div class="page customer-dossier-page">${pageHeading()}${boundary()}${offlinePanel()}</div>`;
      return;
    }
    if (!opportunityItems().length) {
      state.main.innerHTML = `<div class="page customer-dossier-page">${pageHeading()}${boundary()}<section class="panel"><div class="panel-body staging-empty"><strong>No tracked card is available.</strong><p>Evaluate one exact card first; no empty dossier is generated.</p><a class="button button-primary" href="#/evaluate">Evaluate a card</a></div></section></div>`;
      return;
    }
    state.main.innerHTML = state.artifact ? readyView() : `<div class="page customer-dossier-page">${pageHeading()}${boundary()}${errorPanel({ code: "DOSSIER_NOT_READY", message: "The complete dossier could not be assembled." })}</div>`;
    bindActions();
  }

  function bindActions() {
    const select = state.main?.querySelector?.("[data-dossier-select]");
    if (select) select.addEventListener("change", event => { window.location.hash = `#/dossier/${encodeURIComponent(event.target.value)}`; });
    state.main?.querySelectorAll?.("[data-dossier-refresh]").forEach(button => button.addEventListener("click", () => load()));
    state.main?.querySelectorAll?.("[data-dossier-download]").forEach(button => button.addEventListener("click", download));
  }

  function safeFilename() {
    return `flipforge-decision-dossier-${state.selectedId.replace(/[^A-Za-z0-9._-]/g, "-")}.json`;
  }

  function download() {
    if (!state.artifact || !state.digest) return;
    const blob = new Blob([JSON.stringify(state.artifact, null, 2) + "\n"], { type: "application/json;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = safeFilename();
    anchor.rel = "noopener";
    anchor.click();
    URL.revokeObjectURL(href);
    state.notice = "Decision Dossier downloaded. Re-open the file later to retain its saved evidence and lifecycle audit context.";
    renderCurrent();
  }

  async function load() {
    state.loading = true;
    state.error = null;
    state.notice = "";
    state.artifact = null;
    state.digest = "";
    state.detail = null;
    state.evidence = null;
    state.psa = null;
    state.lifecycle = null;
    renderCurrent();
    try {
      state.health = await request("/api/v1/health");
      if (state.health?.data?.status !== "configured") return;
      state.opportunities = await request("/api/v1/opportunities");
      const items = opportunityItems();
      if (!items.length) return;
      const requested = state.requestedId;
      if (requested) {
        if (!SAFE_ID.test(requested) || !items.some(item => String(item.id) === requested)) {
          throw Object.assign(new Error("The requested tracked card was not returned for this tenant."), { code: "DOSSIER_RESOURCE_NOT_FOUND", status: 404 });
        }
        state.selectedId = requested;
      } else {
        state.selectedId = String(items[0].id);
      }
      const encoded = encodeURIComponent(state.selectedId);
      [state.detail, state.evidence, state.psa, state.lifecycle] = await Promise.all([
        request(`/api/v1/opportunities/${encoded}`),
        request(`/api/v1/evidence/${encoded}`),
        request(`/api/v1/psa-advisor/${encoded}`),
        request(`/api/v1/lifecycle/${encoded}`)
      ]);
      await buildArtifact();
    } catch (error) {
      state.error = error;
      state.artifact = null;
      state.digest = "";
    } finally {
      state.loading = false;
      renderCurrent();
    }
  }

  function render(main, id = "") {
    state.main = main;
    try {
      state.requestedId = decodeURIComponent(String(id || ""));
    } catch (_) {
      state.requestedId = String(id || "");
    }
    if (!eligibleHost()) return false;
    load();
    return true;
  }

  window.FlipForgeCustomerDossier = Object.freeze({
    isEligible: eligibleHost,
    handles,
    render,
    refresh: load
  });
})();
