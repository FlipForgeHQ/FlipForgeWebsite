(() => {
  "use strict";

  const RESULTS_SELECTOR = "#main-content .customer-discovery-results";
  const EXACT_CARD_SELECTOR = ".customer-discovery-candidate:not(.customer-discovery-candidate-review)";
  const DEFAULT_FILTERS = Object.freeze({
    maxAsk: "",
    evidence: "all",
    confidence: "0",
    source: "all",
    availability: "all",
    format: "all",
    sort: "rank"
  });

  const state = {
    filters: { ...DEFAULT_FILTERS },
    selectedIndex: null,
    queued: false
  };

  function onDiscover() {
    return /^#\/discover(?:$|[/?])/.test(String(window.location.hash || ""));
  }

  function clean(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function firstNumber(value, fallback = 0) {
    const match = clean(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : fallback;
  }

  function moneyNumber(value) {
    const normalized = clean(value).replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
  }

  function option(select, value, label) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    select.appendChild(node);
  }

  function textCell(label, primary, secondary = "", className = "") {
    const cell = document.createElement("div");
    cell.className = `ff-discover-scanner-cell ${className}`.trim();
    cell.dataset.label = label;

    const strong = document.createElement("strong");
    strong.textContent = primary;
    cell.appendChild(strong);

    if (secondary) {
      const small = document.createElement("small");
      small.textContent = secondary;
      cell.appendChild(small);
    }
    return cell;
  }

  function readRecord(card) {
    const evaluateButton = card.querySelector("[data-discovery-evaluate]");
    const index = Number.parseInt(String(evaluateButton?.dataset.discoveryEvaluate || "-1"), 10);
    if (!Number.isInteger(index) || index < 0) return null;

    const eyebrow = clean(card.querySelector(".panel-header .eyebrow")?.textContent);
    const rankMatch = eyebrow.match(/Rank\s+(\d+)\s*·\s*(.+)$/i);
    const source = clean(rankMatch?.[2] || "Authorized source");
    const rank = Number.parseInt(rankMatch?.[1] || String(index + 1), 10);

    const metrics = Array.from(card.querySelectorAll(".customer-discovery-metrics > div"));
    const askText = clean(metrics[0]?.querySelector("strong")?.textContent || "—");
    const salesText = clean(metrics[1]?.querySelector("strong")?.textContent || "0 sales");
    const evidenceContext = clean(metrics[1]?.querySelector("small")?.textContent || "");
    const confidenceText = clean(metrics[2]?.querySelector("strong")?.textContent || "0/100");
    const riskText = clean(metrics[2]?.querySelector("small")?.textContent || "Risk 0/100");
    const availability = clean(metrics[3]?.querySelector("strong")?.textContent || "UNKNOWN");
    const freshness = clean(metrics[3]?.querySelector("small")?.textContent || "UNKNOWN");

    const copy = clean(card.querySelector(".customer-discovery-copy")?.textContent || "");
    const formatMatch = copy.match(/Format\s+(.+?)(?=\s+Next action:|$)/i);
    const format = clean(formatMatch?.[1] || "Unknown");
    const scoreText = clean(card.querySelector(".customer-discovery-score strong")?.textContent || "0");

    return {
      card,
      index,
      rank: Number.isFinite(rank) ? rank : index + 1,
      title: clean(card.querySelector(".panel-header h2")?.textContent || "Active listing"),
      source,
      askText,
      ask: moneyNumber(askText),
      salesText,
      sales: firstNumber(salesText),
      evidenceContext,
      confidenceText,
      confidence: firstNumber(confidenceText),
      riskText,
      risk: firstNumber(riskText),
      availability,
      freshness,
      format,
      scoreText,
      score: firstNumber(scoreText),
      evaluateButton,
      listingLink: card.querySelector(".customer-discovery-actions a[href]")
    };
  }

  function selectRecord(records, record) {
    state.selectedIndex = record?.index ?? null;
    for (const candidate of records) {
      const selected = candidate.index === state.selectedIndex;
      candidate.card.classList.toggle("ff-discover-scanner-selected", selected);
      candidate.card.setAttribute("aria-selected", selected ? "true" : "false");
      const control = candidate.card.querySelector("[data-ff-discover-select]");
      if (control) {
        control.textContent = selected ? "Selected" : "Select";
        control.setAttribute("aria-pressed", selected ? "true" : "false");
      }
    }
  }

  function buildRow(record, records) {
    const row = document.createElement("div");
    row.className = "ff-discover-scanner-row-grid";
    row.setAttribute("aria-label", `Listing ${record.rank}: ${record.title}`);

    const selection = document.createElement("div");
    selection.className = "ff-discover-scanner-cell ff-discover-scanner-select-cell";
    selection.dataset.label = "Select";
    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "ff-discover-scanner-select";
    selectButton.dataset.ffDiscoverSelect = String(record.index);
    selectButton.setAttribute("aria-pressed", "false");
    selectButton.textContent = "Select";
    selectButton.addEventListener("click", () => selectRecord(records, record));
    selection.appendChild(selectButton);
    row.appendChild(selection);

    row.appendChild(textCell("Rank", `#${record.rank}`, "Server rank", "ff-discover-scanner-rank"));
    row.appendChild(textCell("Listing", record.title, record.source, "ff-discover-scanner-title"));
    row.appendChild(textCell("All-in ask", record.askText, record.format === "Unknown" ? "" : record.format));
    row.appendChild(textCell("Sold context", record.salesText, record.evidenceContext));
    row.appendChild(textCell("Confidence", record.confidenceText, record.riskText));
    row.appendChild(textCell("Listing state", record.availability.replaceAll("_", " "), record.freshness.replaceAll("_", " ")));
    row.appendChild(textCell("Discovery score", record.scoreText, "Server-owned"));

    return row;
  }

  function addDistinctOptions(select, records, key) {
    const values = Array.from(new Set(records.map(record => clean(record[key])).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    for (const value of values) option(select, value, value.replaceAll("_", " "));
  }

  function buildToolbar(results, records) {
    const toolbar = document.createElement("section");
    toolbar.className = "ff-discover-scanner-toolbar";
    toolbar.setAttribute("aria-label", "Discover result filters");
    toolbar.innerHTML = `
      <div class="ff-discover-scanner-toolbar-copy">
        <div>
          <span class="eyebrow">Listing scanner</span>
          <h2>Compare exact active listings</h2>
          <p>Refine the returned set, select one listing, then send that exact listing to governed evaluation.</p>
        </div>
        <div class="ff-discover-scanner-count" data-ff-scanner-count></div>
      </div>
      <div class="ff-discover-scanner-filters">
        <label><span>Max all-in ask</span><input data-ff-scanner-max-ask type="number" min="0" step="0.01" inputmode="decimal" placeholder="Any price"></label>
        <label><span>Evidence</span><select data-ff-scanner-evidence><option value="all">All</option><option value="supported">Trusted sold context</option><option value="needs">Needs evidence</option></select></label>
        <label><span>Min confidence</span><select data-ff-scanner-confidence><option value="0">Any</option><option value="50">50+</option><option value="70">70+</option><option value="85">85+</option></select></label>
        <label><span>Source</span><select data-ff-scanner-source><option value="all">All sources</option></select></label>
        <label><span>Listing state</span><select data-ff-scanner-availability><option value="all">All states</option></select></label>
        <label><span>Format</span><select data-ff-scanner-format><option value="all">All formats</option></select></label>
        <label class="ff-discover-scanner-sort"><span>Sort view by</span><select data-ff-scanner-sort><option value="rank">Server rank</option><option value="ask">Lowest ask</option><option value="confidence">Highest confidence</option><option value="evidence">Most trusted sales</option><option value="risk">Lowest risk</option><option value="score">Discovery score</option></select></label>
        <button class="button button-secondary ff-discover-scanner-reset" type="button" data-ff-scanner-reset>Reset view</button>
      </div>
      <div class="ff-discover-scanner-boundary"><strong>View controls only.</strong> Filters and sorting only reorganize listings already returned by FlipForge. They do not recalculate server rank, evidence, confidence, Discovery score, or the later Smart Opportunity decision.</div>
    `;

    const maxAsk = toolbar.querySelector("[data-ff-scanner-max-ask]");
    const evidence = toolbar.querySelector("[data-ff-scanner-evidence]");
    const confidence = toolbar.querySelector("[data-ff-scanner-confidence]");
    const source = toolbar.querySelector("[data-ff-scanner-source]");
    const availability = toolbar.querySelector("[data-ff-scanner-availability]");
    const format = toolbar.querySelector("[data-ff-scanner-format]");
    const sort = toolbar.querySelector("[data-ff-scanner-sort]");
    const reset = toolbar.querySelector("[data-ff-scanner-reset]");

    addDistinctOptions(source, records, "source");
    addDistinctOptions(availability, records, "availability");
    addDistinctOptions(format, records, "format");

    maxAsk.value = state.filters.maxAsk;
    evidence.value = state.filters.evidence;
    confidence.value = state.filters.confidence;
    source.value = Array.from(source.options).some(node => node.value === state.filters.source) ? state.filters.source : "all";
    availability.value = Array.from(availability.options).some(node => node.value === state.filters.availability) ? state.filters.availability : "all";
    format.value = Array.from(format.options).some(node => node.value === state.filters.format) ? state.filters.format : "all";
    sort.value = state.filters.sort;

    const syncFilters = () => {
      state.filters = {
        maxAsk: maxAsk.value,
        evidence: evidence.value,
        confidence: confidence.value,
        source: source.value,
        availability: availability.value,
        format: format.value,
        sort: sort.value
      };
      applyView(results, records);
    };

    for (const control of [maxAsk, evidence, confidence, source, availability, format, sort]) {
      control.addEventListener(control === maxAsk ? "input" : "change", syncFilters);
    }

    reset.addEventListener("click", () => {
      state.filters = { ...DEFAULT_FILTERS };
      maxAsk.value = "";
      evidence.value = "all";
      confidence.value = "0";
      source.value = "all";
      availability.value = "all";
      format.value = "all";
      sort.value = "rank";
      applyView(results, records);
    });

    return toolbar;
  }

  function buildHeader() {
    const header = document.createElement("div");
    header.className = "ff-discover-scanner-header";
    header.setAttribute("aria-hidden", "true");
    for (const label of ["Select", "Rank", "Listing", "All-in ask", "Sold context", "Confidence", "Listing state", "Score"]) {
      const cell = document.createElement("span");
      cell.textContent = label;
      header.appendChild(cell);
    }
    return header;
  }

  function matches(record) {
    const maxAsk = Number(state.filters.maxAsk);
    if (state.filters.maxAsk && Number.isFinite(maxAsk) && record.ask > maxAsk) return false;
    if (state.filters.evidence === "supported" && record.sales <= 0) return false;
    if (state.filters.evidence === "needs" && record.sales > 0) return false;
    if (record.confidence < Number(state.filters.confidence || 0)) return false;
    if (state.filters.source !== "all" && record.source !== state.filters.source) return false;
    if (state.filters.availability !== "all" && record.availability !== state.filters.availability) return false;
    if (state.filters.format !== "all" && record.format !== state.filters.format) return false;
    return true;
  }

  function compare(a, b) {
    switch (state.filters.sort) {
      case "ask": return a.ask - b.ask || a.rank - b.rank;
      case "confidence": return b.confidence - a.confidence || a.rank - b.rank;
      case "evidence": return b.sales - a.sales || a.rank - b.rank;
      case "risk": return a.risk - b.risk || a.rank - b.rank;
      case "score": return b.score - a.score || a.rank - b.rank;
      default: return a.rank - b.rank;
    }
  }

  function applyView(results, records) {
    const body = results.querySelector("[data-ff-scanner-body]");
    if (!body) return;

    const ordered = records.slice().sort(compare);
    for (const record of ordered) {
      const visible = matches(record);
      record.card.hidden = !visible;
      body.appendChild(record.card);
      if (!visible && record.index === state.selectedIndex) state.selectedIndex = null;
    }

    selectRecord(records, records.find(record => record.index === state.selectedIndex) || null);
    const shown = records.filter(matches).length;
    const count = results.querySelector("[data-ff-scanner-count]");
    if (count) count.textContent = `${shown} of ${records.length} exact listings shown`;

    const empty = results.querySelector("[data-ff-scanner-empty]");
    if (empty) empty.hidden = shown > 0;
  }

  function enhance(results) {
    if (!results || results.dataset.ffDiscoverScannerV1 === "true") return;
    results.dataset.ffDiscoverScannerV1 = "true";

    const cards = Array.from(results.querySelectorAll(EXACT_CARD_SELECTOR));
    const records = cards.map(readRecord).filter(Boolean);
    if (!records.length) return;

    const summary = results.querySelector(".customer-discovery-summary");
    const toolbar = buildToolbar(results, records);
    const header = buildHeader();
    const body = document.createElement("div");
    body.className = "ff-discover-scanner-body";
    body.dataset.ffScannerBody = "";

    const empty = document.createElement("div");
    empty.className = "ff-discover-scanner-empty";
    empty.dataset.ffScannerEmpty = "";
    empty.hidden = true;
    empty.innerHTML = "<strong>No returned listings match this view.</strong><span>Reset the view filters to show the full exact-listing set.</span>";

    if (summary) summary.insertAdjacentElement("afterend", toolbar);
    else results.prepend(toolbar);
    toolbar.insertAdjacentElement("afterend", header);
    header.insertAdjacentElement("afterend", body);
    body.insertAdjacentElement("afterend", empty);

    for (const record of records) {
      record.card.classList.add("ff-discover-scanner-row");
      record.card.setAttribute("aria-selected", "false");
      record.card.prepend(buildRow(record, records));
      body.appendChild(record.card);
    }

    if (state.selectedIndex !== null) {
      selectRecord(records, records.find(record => record.index === state.selectedIndex) || null);
    }
    applyView(results, records);
  }

  function sync() {
    state.queued = false;
    if (!onDiscover()) return;
    const results = document.querySelector(RESULTS_SELECTOR);
    if (results) enhance(results);
  }

  function queue() {
    if (state.queued) return;
    state.queued = true;
    window.requestAnimationFrame(sync);
  }

  document.addEventListener("submit", event => {
    if (!onDiscover() || !event.target?.matches?.("[data-customer-discovery-form]")) return;
    state.selectedIndex = null;
    state.filters = { ...DEFAULT_FILTERS };
  }, true);

  window.addEventListener("hashchange", () => {
    if (!onDiscover()) {
      state.selectedIndex = null;
      state.filters = { ...DEFAULT_FILTERS };
    }
    queue();
  });
  window.addEventListener("pageshow", queue);
  window.addEventListener("load", queue);

  if (document.body) {
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  }
  queue();
})();