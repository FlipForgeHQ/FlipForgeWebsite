(() => {
  "use strict";

  const SEARCH_PATH = "/api/v1/card-intelligence/search";
  const DETECT_PATH = "/api/v1/card-intelligence/detect";
  const IDENTIFY_PATH = "/api/v1/card-intelligence/identify";
  const RESOLVE_PATH = "/api/v1/card-intelligence/resolve";
  const MAX_IMAGE_BYTES = 4_000_000;
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

  const state = {
    main: null,
    panel: null,
    mode: "search",
    busy: false,
    error: "",
    message: "",
    searchResults: [],
    photoCandidates: []
  };

  function previewEligible() {
    return PREVIEW_HOST.test(String(window.location.hostname || ""));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function correlationId() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `card-intelligence-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function validEnvelope(payload, expectedCorrelationId) {
    const meta = payload && payload.meta;
    const data = payload && payload.data;
    return Boolean(meta && data)
      && meta.contractVersion === "1.0"
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId
      && data.transactionAuthority === false
      && data.providerIdentifierExposed === false
      && data.rawProviderPayloadExposed === false
      && data.providerPayloadPersisted === false
      && data.soldEvidenceAccepted === false
      && data.smartOpportunityRecalculated === false;
  }

  async function api(path, body) {
    const requestCorrelationId = correlationId();
    const response = await fetch(path, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "X-Correlation-Id": requestCorrelationId
      },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("Card intelligence response exceeded the browser safety limit.");
    let payload;
    try { payload = text ? JSON.parse(text) : {}; }
    catch (_) { throw new Error("Card intelligence returned invalid JSON."); }
    if (!response.ok) {
      const upstream = payload && payload.error ? payload.error : {};
      const error = new Error(upstream.message || `Card intelligence failed with status ${response.status}.`);
      error.code = upstream.code || "CARD_INTELLIGENCE_UNAVAILABLE";
      error.status = response.status;
      throw error;
    }
    if (!validEnvelope(payload, requestCorrelationId)) {
      throw new Error("Card intelligence response failed the FlipForge authority boundary.");
    }
    return payload.data;
  }

  function searchResultMarkup(row, index) {
    const detail = [row.year, row.manufacturer, row.releaseName, row.setName, row.cardNumber ? `#${row.cardNumber}` : "", row.parallelName]
      .filter(Boolean).join(" · ");
    const selectable = row.exactCardCandidate === true && typeof row.selectionToken === "string" && row.selectionToken.length > 0;
    return `<article class="card-intelligence-result">
      <div><strong>${escapeHtml(row.name || "Unknown card")}</strong><small>${escapeHtml(detail || row.type || "CardSight result")}</small></div>
      ${selectable ? `<button class="button button-secondary" type="button" data-card-intelligence-resolve="search" data-result-index="${index}">Use this card</button>` : `<span class="staging-status staging-status-verify">Review</span>`}
    </article>`;
  }

  function photoCandidateMarkup(row, index) {
    const detail = [row.year, row.manufacturer, row.releaseName, row.setName, row.cardNumber ? `#${row.cardNumber}` : "", row.parallelName, row.numberedTo ? `/${row.numberedTo}` : "", row.grader, row.grade]
      .filter(Boolean).join(" · ");
    const selectable = row.exactCardCandidate === true && typeof row.selectionToken === "string" && row.selectionToken.length > 0;
    const confidence = String(row.confidence || "UNKNOWN").toUpperCase();
    return `<article class="card-intelligence-result">
      <div><strong>${escapeHtml(row.name || "Detected card")}</strong><small>${escapeHtml(detail || "Identity candidate")}</small><small>CardSight identity confidence: ${escapeHtml(confidence)}</small></div>
      ${selectable ? `<button class="button button-secondary" type="button" data-card-intelligence-resolve="photo" data-result-index="${index}">Use this card</button>` : `<span class="staging-status staging-status-verify">Verify identity</span>`}
    </article>`;
  }

  function renderPanel() {
    if (!state.panel) return;
    const results = state.mode === "search" ? state.searchResults : state.photoCandidates;
    const resultMarkup = results.length
      ? `<div class="card-intelligence-results">${results.map((row, index) => state.mode === "search" ? searchResultMarkup(row, index) : photoCandidateMarkup(row, index)).join("")}</div>`
      : "";
    const error = state.error ? `<div class="card-intelligence-message card-intelligence-error" role="alert">${escapeHtml(state.error)}</div>` : "";
    const message = state.message ? `<div class="card-intelligence-message" role="status">${escapeHtml(state.message)}</div>` : "";

    state.panel.innerHTML = `<div class="card-intelligence-heading">
        <div><span class="eyebrow">CardSight identity assist · Preview</span><strong>Find the exact card faster</strong><small>Search by card details or upload a photo. This assists identity only; Smart Opportunity still makes the decision.</small></div>
      </div>
      <div class="card-intelligence-tabs" role="tablist" aria-label="Card identity method">
        <button type="button" class="button ${state.mode === "search" ? "button-primary" : "button-secondary"}" data-card-intelligence-mode="search">Search Card</button>
        <button type="button" class="button ${state.mode === "photo" ? "button-primary" : "button-secondary"}" data-card-intelligence-mode="photo">Upload Photo</button>
      </div>
      ${state.mode === "search" ? `<form data-card-intelligence-search class="card-intelligence-search">
        <label><span>Player, year, set, card number, or parallel</span><div class="card-intelligence-inline"><input type="search" name="query" maxlength="300" required placeholder="2018 Topps Update Shohei Ohtani US1"><button type="submit" class="button button-secondary"${state.busy ? " disabled" : ""}>${state.busy ? "Searching…" : "Find card"}</button></div></label>
      </form>` : `<form data-card-intelligence-photo class="card-intelligence-photo">
        <label><span>Card photo</span><input type="file" name="cardPhoto" accept="image/jpeg,image/png,image/webp" required><small>JPEG, PNG, or WebP · maximum 4 MB. The image is sent only to the authenticated server route for CardSight detection/identification.</small></label>
        <button type="submit" class="button button-secondary"${state.busy ? " disabled" : ""}>${state.busy ? "Identifying…" : "Identify card"}</button>
      </form>`}
      ${error}${message}${resultMarkup}
      <div class="boundary-note"><strong>Identity boundary:</strong> Provider IDs and raw CardSight responses stay server-side. Selecting a result only fills the exact-card identity field; it does not accept evidence, predict a grade, recalculate Smart Opportunity, or authorize a transaction.</div>`;
    bindPanel();
  }

  function setMode(mode) {
    if (!new Set(["search", "photo"]).has(mode) || state.busy) return;
    state.mode = mode;
    state.error = "";
    state.message = "";
    renderPanel();
  }

  async function search(query) {
    state.busy = true;
    state.error = "";
    state.message = "";
    state.searchResults = [];
    renderPanel();
    try {
      const data = await api(SEARCH_PATH, { query: String(query || "").trim(), limit: 12 });
      state.searchResults = Array.isArray(data.results) ? data.results : [];
      state.message = state.searchResults.length ? `${state.searchResults.length} CardSight result${state.searchResults.length === 1 ? "" : "s"} found.` : "No CardSight matches were returned.";
    } catch (error) {
      state.error = error.message || "Card search is unavailable.";
    } finally {
      state.busy = false;
      renderPanel();
    }
  }

  function fileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The selected photo could not be read."));
      reader.onload = () => {
        const value = String(reader.result || "");
        const comma = value.indexOf(",");
        if (comma < 0) reject(new Error("The selected photo could not be encoded."));
        else resolve(value.slice(comma + 1));
      };
      reader.readAsDataURL(file);
    });
  }

  async function identify(file) {
    if (!file) throw new Error("Choose a card photo first.");
    if (!ALLOWED_IMAGE_TYPES.has(String(file.type || "").toLowerCase())) throw new Error("Card photo must be JPEG, PNG, or WebP.");
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error("Card photo must be no larger than 4 MB.");

    state.busy = true;
    state.error = "";
    state.message = "";
    state.photoCandidates = [];
    renderPanel();
    try {
      const imageBase64 = await fileAsBase64(file);
      const common = { mimeType: file.type, imageBase64 };
      const detection = await api(DETECT_PATH, common);
      if (detection.detected !== true || Number(detection.count || 0) < 1) {
        state.message = "No card was detected in that photo. Try a clearer, tighter image.";
        return;
      }
      const data = await api(IDENTIFY_PATH, common);
      state.photoCandidates = Array.isArray(data.candidates) ? data.candidates : [];
      state.message = state.photoCandidates.length
        ? `${state.photoCandidates.length} identity candidate${state.photoCandidates.length === 1 ? "" : "s"} returned.`
        : "A card was detected, but CardSight did not return an exact identity candidate.";
    } catch (error) {
      state.error = error.message || "Photo identification is unavailable.";
    } finally {
      state.busy = false;
      renderPanel();
    }
  }

  async function resolve(source, index) {
    const list = source === "photo" ? state.photoCandidates : state.searchResults;
    const row = list[Number(index)];
    if (!row || typeof row.selectionToken !== "string" || !row.selectionToken) return;
    state.busy = true;
    state.error = "";
    state.message = "Verifying exact catalog identity…";
    renderPanel();
    try {
      const data = await api(RESOLVE_PATH, { selectionToken: row.selectionToken });
      if (data.readyForEvaluation !== true || typeof data.cardIdentity !== "string" || !data.cardIdentity.trim()) {
        throw new Error(data.message || "The selected card still needs identity verification.");
      }
      const identityField = state.main && state.main.querySelector('[name="cardIdentity"]');
      if (!identityField) throw new Error("The evaluation identity field is unavailable.");
      identityField.value = data.cardIdentity;
      identityField.dispatchEvent(new Event("input", { bubbles: true }));
      identityField.dispatchEvent(new Event("change", { bubbles: true }));
      state.message = data.highConfidence === true
        ? "Exact CardSight identity verified and copied into the evaluation form."
        : "Catalog identity resolved and copied into the form. Review it before evaluation.";
      identityField.focus({ preventScroll: false });
    } catch (error) {
      state.error = error.message || "The selected card could not be resolved.";
    } finally {
      state.busy = false;
      renderPanel();
    }
  }

  function bindPanel() {
    if (!state.panel) return;
    state.panel.querySelectorAll("[data-card-intelligence-mode]").forEach(button => {
      button.addEventListener("click", () => setMode(button.getAttribute("data-card-intelligence-mode")));
    });
    const searchForm = state.panel.querySelector("[data-card-intelligence-search]");
    if (searchForm) searchForm.addEventListener("submit", event => {
      event.preventDefault();
      if (!state.busy) search(new FormData(searchForm).get("query"));
    });
    const photoForm = state.panel.querySelector("[data-card-intelligence-photo]");
    if (photoForm) photoForm.addEventListener("submit", event => {
      event.preventDefault();
      if (!state.busy) {
        const input = photoForm.querySelector('input[name="cardPhoto"]');
        identify(input && input.files ? input.files[0] : null).catch(error => {
          state.error = error.message || "Photo identification is unavailable.";
          state.busy = false;
          renderPanel();
        });
      }
    });
    state.panel.querySelectorAll("[data-card-intelligence-resolve]").forEach(button => {
      button.addEventListener("click", () => {
        if (!state.busy) resolve(button.getAttribute("data-card-intelligence-resolve"), button.getAttribute("data-result-index"));
      });
    });
  }

  function mount(main) {
    if (!previewEligible() || !main) return false;
    const form = main.querySelector("[data-staging-evaluation-form]");
    const identity = form && form.querySelector('[name="cardIdentity"]');
    const identityField = identity && identity.closest(".staging-field");
    if (!form || !identityField) return false;
    const existing = form.querySelector("[data-card-intelligence-assist]");
    if (existing) {
      state.main = main;
      state.panel = existing;
      renderPanel();
      return true;
    }
    const panel = document.createElement("section");
    panel.className = "card-intelligence-assist staging-field-wide";
    panel.setAttribute("data-card-intelligence-assist", "");
    identityField.insertAdjacentElement("beforebegin", panel);
    state.main = main;
    state.panel = panel;
    state.error = "";
    state.message = "";
    renderPanel();
    return true;
  }

  window.FlipForgeCustomerCardIntelligence = Object.freeze({
    isEligible: previewEligible,
    mount
  });
})();
