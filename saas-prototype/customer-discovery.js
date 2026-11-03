(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const DISCOVER_PATH = "/api/v1/discover";
  const EVALUATION_PATH = "/api/v1/evaluations";
  const CARD_INTELLIGENCE_SEARCH_PATH = "/api/v1/card-intelligence/search";
  const CARD_INTELLIGENCE_RESOLVE_PATH = "/api/v1/card-intelligence/resolve";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const MAX_COST_CENTS = 10_000_000_000;
  const SAFE_EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:|\-]{0,199}$/;
  const SAFE_OPPORTUNITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
  const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,100}$/;
  const SAFE_SELECTION_TOKEN = /^[0-9a-f]{64}$/i;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const MARKETPLACES = new Set(["EBAY", "COMC", "MYSLABS", "GOLDIN", "HERITAGE", "FANATICS_COLLECT", "DEALER", "CARD_SHOW", "FACEBOOK_GROUP", "OTHER"]);
  const DECISIONS = new Set(["BUY", "WATCH", "VERIFY", "PASS"]);

  const state = {
    main: null,
    health: null,
    healthPromise: null,
    renderSerial: 0,
    data: null,
    loading: false,
    evaluatingIndex: -1,
    // The failed evaluation, shown inline beside the button that started it (see evaluationErrorMarkup).
    evaluationError: null,
    evaluationLimitReached: false,
    // Bumped by every allowance re-check and every new limit response; a re-check applies only if it is still the latest.
    limitCheckSerial: 0,
    error: null,
    notice: "",
    evaluationKeys: new Map(),
    draft: { exactCardQuery: "", targetMaxBuy: "", limit: "25" },
    renderedDraft: null,
    identityAssist: {
      active: false,
      busy: false,
      query: "",
      typedQuery: "",
      requestSerial: 0,
      results: [],
      message: ""
    },
    // The last search that returned results: "Refresh results" runs it again.
    lastSearch: null,
    // Bumped by every search start and by "New card": a search answer applies only if it is still the latest.
    discoverSerial: 0,
    // Private Beta guided card builder and serial-number details (see the card-entry helpers below).
    guided: { values: { year: "", maker: "", other: "", set: "", player: "", number: "", parallel: "", grader: "", grade: "" }, open: null, message: "" },
    serial: { numbered: "unknown", denominator: "", serial: "", handedOff: false, error: "" },
    // Route entry: the card box gets a focus cue when the customer arrives on Discover (unless they already typed).
    arrivalPending: true,
    pendingFocus: false,
    engagement: 0
  };

  // The Private Beta page (index.html) and the customer app (customer.html) show the same Discover with different
  // wording and fewer controls on the beta. This renderer produces each surface's final copy directly; no other script
  // relabels or hides Discover controls.
  function betaSurface() {
    return window.FlipForgePrivateBetaEntry === true;
  }

  function searchLabels() {
    return betaSurface()
      ? {
        submit: "Search listings",
        submitAria: "Search active listings for the card entered",
        submitTitle: "Find listings currently for sale. You'll choose one before FlipForge evaluates it.",
        exact: "Check card identity",
        exactAria: "Check card identity before searching listings",
        exactTitle: "Use this if you are unsure of the parallel, variation, or card number. No listing search or evaluation starts yet."
      }
      : {
        submit: "Search active listings",
        submitAria: "Search active listings for this card",
        submitTitle: "Use this when you already know the exact card identity.",
        exact: "Find exact card",
        exactAria: "Find and confirm the exact card",
        exactTitle: "Use this when you are unsure which base, parallel, variation, or card number is correct."
      };
  }

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
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
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `discover-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function newIdempotencyKey() {
    const suffix = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const value = `discover-eval-${suffix}`;
    if (!SAFE_REQUEST_ID.test(value)) throw makeError("IDEMPOTENCY_KEY_INVALID", "A safe evaluation request ID could not be generated.", 400);
    return value;
  }

  function makeError(code, message, status = 0) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
  }

  // Customer words for listing codes returned by the server. Unknown codes fall back to sentence case, never raw codes.
  const AVAILABILITY_WORDS = Object.freeze({ AVAILABLE: "Available", ENDED: "Listing ended", SOLD: "Sold", UNAVAILABLE: "Not available", UNKNOWN: "Not confirmed" });
  const FRESHNESS_WORDS = Object.freeze({ CURRENT: "Recently checked", FRESH: "Recently checked", STALE: "May be out of date", UNKNOWN: "Not recently checked" });
  const FORMAT_WORDS = Object.freeze({ FIXED_PRICE: "Fixed price", AUCTION: "Auction", BEST_OFFER: "Best offer", AUCTION_WITH_BUY_NOW: "Auction with buy-now price" });
  function listingWords(map, value) {
    const raw = String(value || "UNKNOWN").trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (Object.prototype.hasOwnProperty.call(map, raw)) return map[raw];
    const words = raw.toLowerCase().split("_").filter(Boolean).join(" ");
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : map.UNKNOWN || "Not confirmed";
  }

  function moneyFromCents(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
      .format((Number(value) || 0) / 100);
  }

  function targetToCents(value) {
    const text = String(value ?? "").trim();
    if (!text) return 0;
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
      throw makeError("DISCOVER_TARGET_INVALID", "Target max buy must be a non-negative dollar amount with no more than two decimals.", 400);
    }
    const [whole, fraction = ""] = text.split(".");
    const cents = (BigInt(whole) * 100n) + BigInt((fraction + "00").slice(0, 2));
    if (cents > BigInt(MAX_COST_CENTS)) throw makeError("DISCOVER_TARGET_INVALID", "Target max buy is outside the allowed range.", 400);
    return Number(cents);
  }

  // The beta feedback form only exists on the invited Private Beta app. Customer and
  // owner surfaces keep the plain wording without a request control.
  function evidenceRequestAvailable() {
    try {
      return Boolean(window.FlipForgePrivateBeta?.isEligible?.() && window.FlipForgePrivateBeta?.requestFeedback);
    } catch (_) {
      return false;
    }
  }

  // A card evidence request carries only the card identity this exact-match search was run
  // with (and the year, card number and grade written in it). It never carries the listing
  // link, seller, price, sale records or provider data. The tester reviews and can correct
  // every field on the feedback form before anything is sent.
  function cardReferenceFor(item) {
    if (!item || String(item.matchQuality || "") !== "EXACT_MATCH") return null;
    const identity = normalizeIdentityQuery(item.cardIdentityQuery || state.data?.query || "").slice(0, 200);
    if (identity.length < 6) return null;
    const year = identity.match(/\b((?:18|19|20)\d{2})(?:\s*-\s*(\d{2}))?\b/);
    const number = identity.match(/#\s*([A-Za-z0-9][A-Za-z0-9.\-/]{0,23})/);
    const declared = declaredGradeContext(identity);
    const raw = !declared.grader && /\b(?:raw|ungraded)\b/i.test(identity);
    return {
      identity,
      year: year ? (year[2] ? `${year[1]}-${year[2]}` : year[1]) : "",
      player: "",
      set: "",
      cardNumber: number ? number[1].replace(/[.-]+$/, "") : "",
      parallel: "",
      grader: declared.grader || (raw ? "RAW" : ""),
      grade: declared.grade || ""
    };
  }

  function requestEvidence(index) {
    if (!evidenceRequestAvailable()) return;
    const items = Array.isArray(state.data?.items) ? state.data.items : [];
    const cardReference = cardReferenceFor(items[index]);
    window.FlipForgePrivateBeta.requestFeedback({
      category: "evidence",
      summary: cardReference
        ? "Please add sold-price evidence for the card below so FlipForge can show a value for it."
        : "I found a card in Discover that has no sold-price evidence yet, and I'd like FlipForge to add some so it can show a value.",
      expected: "A value for the card, backed by sold-price evidence.",
      cardReference
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Private Beta card-entry helpers. Query helpers only: they never correct an identity, call a provider, or save
  // evidence. The guided builder writes an exact-card description into the card box; serial numbering typed or chosen
  // here is checked (impossible or contradictory numbering is refused) and a numbered card always goes through the
  // server-owned identity check before any listing search.

  // Calendar years plus two-year seasons (basketball/hockey sets are printed as 2025-26), newest first.
  const GUIDED_YEARS = (() => { const top = new Date().getFullYear() + 1, out = []; for (let y = top; y >= 1880; y -= 1) { if (y < top && y >= 1950) out.push(y + "-" + String((y + 1) % 100).padStart(2, "0")); out.push(String(y)); } return out; })();
  const GUIDED_MAKERS = ["Topps", "Bowman", "Panini", "Upper Deck", "Donruss", "Fleer", "Score", "Leaf", "O-Pee-Chee", "Other"];
  const GUIDED_GRADERS = ["PSA", "BGS", "SGC", "CGC", "CSG", "TAG", "BCCG"];
  const GUIDED_GRADES = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1"];
  const SERIAL_NUMBER = /^\d{1,5}$/;

  function guidedNorm(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function composeGuided(d) {
    const year = guidedNorm(d.year), maker = guidedNorm(d.maker === "Other" ? d.other : d.maker), set = guidedNorm(d.set),
      player = guidedNorm(d.player), number = guidedNorm(d.number).replace(/^(?:#|No\.?\s*)/i, ""), parallel = guidedNorm(d.parallel),
      grader = guidedNorm(d.grader), grade = guidedNorm(d.grade);
    const season = year.match(/^(\d{4})-(\d{2})$/); const startYear = season ? +season[1] : +year;
    if (!/^\d{4}(?:-\d{2})?$/.test(year) || startYear < 1880 || startYear > new Date().getFullYear() + 1 || (season && (startYear + 1) % 100 !== +season[2])) return { error: "Choose a release year." };
    if (!maker || !set || !player) return { error: "Manufacturer, set/product and player are needed to distinguish cards." };
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]{0,35}$/.test(number)) return { error: "Enter the exact card number (for example, 150 or PC-19)." };
    if ((grader && !grade) || (!grader && grade)) return { error: "Choose both grading company and numeric grade, or leave both unspecified." };
    const query = [year, maker, set, player, "#" + number, parallel, grader ? grader + " " + grade : ""].filter(Boolean).join(" ");
    return query.length > 500 ? { error: "Shorten the card description." } : { query };
  }

  function parseNumbering(query) {
    const text = String(query || "");
    // 01/25, /25, numbered to 25. Do not mistake the grade in "PSA 9 /25" for serial #9.
    // Require the ordinal and slash to be adjacent; exclude 2018/19 season forms.
    const full = /(^|[\s(])(\d{1,5})\/\s*(\d{1,5})(?=$|[\s)\],.;])/g;
    let match;
    while ((match = full.exec(text)) !== null) {
      const serial = Number(match[2]), denominator = Number(match[3]);
      if (/^(?:19|20)\d{2}$/.test(match[2]) && match[3].length === 2) continue;
      if (serial > 0 && denominator > 0 && serial <= denominator) {
        const prefix = match[1];
        return { denominator: String(denominator), serial: String(serial), start: match.index + prefix.length, end: match.index + match[0].length, token: match[0].slice(prefix.length) };
      }
    }
    const suffix = /(^|[\s(])\/\s*(\d{1,5})(?=$|[\s)\],.;])/g;
    while ((match = suffix.exec(text)) !== null) {
      if (Number(match[2]) > 0) {
        const prefix = match[1];
        return { denominator: String(Number(match[2])), serial: "", start: match.index + prefix.length, end: match.index + match[0].length, token: match[0].slice(prefix.length) };
      }
    }
    const words = /\bnumbered\s+to\s+(\d{1,5})\b/i.exec(text);
    if (words && Number(words[1]) > 0) return { denominator: String(Number(words[1])), serial: "", start: words.index, end: words.index + words[0].length, token: words[0] };
    return null;
  }

  // Every slash-numbering expression in the text, valid or not, so an impossible serial such as 26/25 or 0/25 is
  // refused instead of slipping through as ordinary words.
  function scanNumbering(query) {
    const text = String(query || "");
    const valid = [], invalid = [];
    const full = /(^|[\s(])(\d{1,5})\/\s*(\d{1,5})(?=$|[\s)\],.;])/g;
    let match;
    while ((match = full.exec(text)) !== null) {
      if (/^(?:19|20)\d{2}$/.test(match[2]) && match[3].length === 2) continue; // season, e.g. 2018/19
      const serial = Number(match[2]), denominator = Number(match[3]);
      if (serial > 0 && denominator > 0 && serial <= denominator) valid.push({ serial, denominator });
      else invalid.push(match[0].trim());
    }
    const suffix = /(^|[\s(])\/\s*(\d{1,5})(?=$|[\s)\],.;])/g;
    while ((match = suffix.exec(text)) !== null) {
      const denominator = Number(match[2]);
      if (denominator > 0) valid.push({ serial: 0, denominator });
      else invalid.push(match[0].trim());
    }
    return { valid, invalid };
  }

  function composeSerial(query, selection = { numbered: "unknown", denominator: "", serial: "" }) {
    const source = String(query || "").trim().replace(/\s+/g, " ");
    if (!source) return { error: "Enter the card you want to find first." };
    if (source.length > 500) return { error: "The search is too long. Shorten it before searching." };
    const numbered = selection.numbered || "unknown";
    const denominatorText = String(selection.denominator || "").trim();
    const serialText = String(selection.serial || "").trim();
    const existing = parseNumbering(source);
    if (!["unknown", "yes", "no"].includes(numbered)) return { error: "Choose whether the card is numbered." };
    // Fail closed on impossible or contradictory numbering however it was entered and whatever the selector says.
    const scan = scanNumbering(source);
    if (scan.invalid.length) {
      return { error: "The serial number “" + scan.invalid[0] + "” is not possible: the individual number cannot be zero or exceed the print run. Check what is printed on the card." };
    }
    if (new Set(scan.valid.map(entry => entry.denominator)).size > 1) {
      return { error: "The search names more than one print run. Keep only the one printed on the card." };
    }
    const ordinals = new Set(scan.valid.filter(entry => entry.serial).map(entry => entry.serial));
    if (ordinals.size > 1) return { error: "The search names more than one individual serial number. Keep only the one printed on the card." };
    if (numbered === "no" && existing) {
      return { error: "Your search already contains serial numbering. Choose Numbered or correct your search." };
    }
    if (numbered !== "yes") return { query: source, needsVerification: Boolean(existing) };
    if (denominatorText && (!SERIAL_NUMBER.test(denominatorText) || Number(denominatorText) === 0)) {
      return { error: "Enter the print run as a positive whole number, such as 25 or 50." };
    }
    if (serialText && (!SERIAL_NUMBER.test(serialText) || Number(serialText) === 0)) {
      return { error: "The card's individual serial must be a positive whole number." };
    }
    const denominator = denominatorText ? Number(denominatorText) : Number(existing?.denominator || 0);
    const serial = serialText ? Number(serialText) : Number(existing?.serial || 0);
    if (!denominator) return { error: "Enter the print run shown after the slash, such as 25 in 01/25." };
    if (serial && serial > denominator) return { error: "The individual serial cannot exceed the print run." };
    if (existing && Number(existing.denominator) !== denominator) {
      return { error: "The print run you selected conflicts with the one in the search. Correct the mismatch before continuing." };
    }
    if (existing?.serial && serialText && Number(existing.serial) !== serial) {
      return { error: "The individual serial conflicts with the number in the search. Confirm what is printed on the card." };
    }
    let composed = source;
    if (!existing) composed += " " + (serialText ? serialText + "/" : "/") + denominator;
    else if (serialText && !existing.serial) {
      composed = source.slice(0, existing.start) + serialText + "/" + denominator + source.slice(existing.end);
    }
    if (composed.length > 500) return { error: "The complete card search exceeds 500 characters. Shorten the description." };
    return { query: composed, needsVerification: true, denominator: String(denominator), serial: serialText || existing?.serial || "" };
  }

  function guidedOptions(items, current) {
    return items.map(value => `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
  }

  // Beta: the guided card builder at the top of the search form. Open by default above 960px wide.
  function guidedBuilderMarkup() {
    if (!betaSurface()) return "";
    const values = state.guided.values;
    const open = state.guided.open === null
      ? !(typeof window.matchMedia === "function" && window.matchMedia("(max-width:960px)").matches)
      : state.guided.open;
    const field = (label, key, placeholder, max = 110) => `<label>${label}<input data-ffguided-field="${key}" value="${escapeHtml(values[key])}" maxlength="${max}" placeholder="${escapeHtml(placeholder)}" autocomplete="off"></label>`;
    const picker = (label, key, items, empty) => `<label>${label}<select data-ffguided-field="${key}"><option value="">${escapeHtml(empty)}</option>${guidedOptions(items, values[key])}</select></label>`;
    return `<details class="ffguided-entry" data-ffguided${open ? " open" : ""}><summary><span>GUIDED SEARCH</span><strong>Choose the card details</strong><small>Or type directly in the search below.</small></summary><fieldset class="ffguided-fields"><legend>Build an exact-card description</legend><p>These help you write the card description. They don’t confirm the exact card: after filling, search listings, or use <b>Check card identity</b> if you’re unsure of the version.</p><div class="ffguided-grid">${picker("Year or season", "year", GUIDED_YEARS, "Select year")}${picker("Manufacturer", "maker", GUIDED_MAKERS, "Select manufacturer")}<label class="ffguided-other"${values.maker === "Other" ? "" : " hidden"}>Other manufacturer<input data-ffguided-field="other" maxlength="70" value="${escapeHtml(values.other)}" placeholder="As printed on card"></label>${field("Set / product", "set", "e.g. Chrome, Prizm, Series 1")}${field("Player / subject", "player", "e.g. Shohei Ohtani")}${field("Card number", "number", "e.g. 150 or PC-19", 36)}${field("Parallel / variation (optional)", "parallel", "e.g. Silver")}${picker("Grading company", "grader", GUIDED_GRADERS, "Unspecified / raw")}${picker("Grade", "grade", GUIDED_GRADES, "Not specified")}</div><div class="ffguided-actions"><button type="button" class="button button-primary" data-ffguided-build>Fill card description ↓</button><small role="status" aria-live="polite" data-ffguided-message>${escapeHtml(state.guided.message || "Anything not listed here can still be typed in the search below.")}</small></div></fieldset></details>`;
  }

  // Beta: optional serial-number details beside the card box, offered until a search is handed to the results flow.
  function serialEntryAvailable() {
    return betaSurface() && !state.serial.handedOff && !state.data && !state.identityAssist.active;
  }

  function serialHint() {
    return state.serial.numbered === "yes"
      ? "Use 25 for /25, or 50 for /50. The individual serial (such as 01) is optional. This is a matching detail, not a price multiplier."
      : "Search first. FlipForge will ask you to confirm the exact parallel and print run when needed.";
  }

  function serialEntryMarkup() {
    if (!serialEntryAvailable()) {
      return state.serial.error ? `<p class="ff-serial-error" role="alert" aria-live="polite" data-ff-serial-error>${escapeHtml(state.serial.error)}</p>` : "";
    }
    const serial = state.serial;
    const option = (value, label) => `<option value="${value}"${serial.numbered === value ? " selected" : ""}>${label}</option>`;
    return `<section class="ff-serial-refinement" data-ff-serial-refinement aria-label="Optional serial-number details"><div class="ff-serial-head"><label class="ff-serial-choice" for="ff-serial-status">Serial-numbered card? <span class="ff-serial-optional">Optional</span></label><select id="ff-serial-status" data-ff-serial-status aria-label="Is this card serial numbered?">${option("unknown", "Not sure")}${option("no", "No")}${option("yes", "Yes — e.g. /25, /50, 1/1")}</select></div><div class="ff-serial-fields" data-ff-serial-fields${serial.numbered === "yes" ? "" : " hidden"}><label><span>Print run (out of)</span><input data-ff-serial-denominator inputmode="numeric" type="text" maxlength="5" placeholder="25" value="${escapeHtml(serial.denominator)}"></label><label><span>Serial # (optional)</span><input data-ff-serial-ordinal inputmode="numeric" type="text" maxlength="5" placeholder="01" value="${escapeHtml(serial.serial)}"></label></div><p class="ff-serial-hint" data-ff-serial-hint>${escapeHtml(serialHint())}</p><p class="ff-serial-error" role="alert" aria-live="polite" data-ff-serial-error${serial.error ? "" : " hidden"}>${escapeHtml(serial.error)}</p></section>`;
  }

  function resetSerialEntry() {
    state.serial = { numbered: "unknown", denominator: "", serial: "", handedOff: false, error: "" };
  }

  function showSerialError(message) {
    state.serial.error = message || "";
    const node = state.main?.querySelector?.("[data-ff-serial-error]");
    if (node && state.serial.error) {
      node.textContent = state.serial.error;
      node.hidden = false;
      return;
    }
    renderCurrent();
  }

  // Beta: check the numbering in the card box (and the optional serial details) before a search or identity check.
  // Returns false when the search must not start. A numbered card is routed through the identity check.
  function prepareBetaSearch(form, viaIdentityCheck) {
    if (!betaSurface()) return { proceed: true, identityCheck: viaIdentityCheck };
    const input = form?.querySelector?.('input[name="exactCardQuery"]');
    if (!input) return { proceed: false };
    const sectionShown = Boolean(form.querySelector("[data-ff-serial-refinement]"));
    const result = composeSerial(input.value, sectionShown ? state.serial : undefined);
    if (result.error) {
      showSerialError(result.error);
      return { proceed: false };
    }
    state.serial.error = "";
    if (sectionShown && input.value !== result.query) {
      input.value = result.query;
      // Invalidates any stale identity selection (the request guard and this owner both listen for input).
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (!sectionShown) return { proceed: true, identityCheck: viaIdentityCheck };
    state.serial.handedOff = true;
    return { proceed: true, identityCheck: viaIdentityCheck || result.needsVerification === true };
  }

  function bindBetaEntry(form) {
    const details = form?.querySelector?.("[data-ffguided]");
    if (details) {
      const remember = event => {
        const field = event.target.closest?.("[data-ffguided-field]");
        if (!field) return;
        state.guided.values[field.dataset.ffguidedField] = field.value;
        if (field.dataset.ffguidedField === "maker") {
          const other = details.querySelector(".ffguided-other");
          if (other) other.hidden = field.value !== "Other";
        }
      };
      details.addEventListener("input", remember);
      details.addEventListener("change", remember);
      details.addEventListener("toggle", () => { state.guided.open = details.open; });
      details.querySelector("[data-ffguided-build]")?.addEventListener("click", () => {
        const result = composeGuided(state.guided.values);
        const status = details.querySelector("[data-ffguided-message]");
        const query = form.querySelector('input[name="exactCardQuery"]');
        if (result.error) {
          state.guided.message = result.error;
          if (status) status.textContent = result.error;
          return;
        }
        if (!query) return;
        query.value = result.query;
        query.dispatchEvent(new Event("input", { bubbles: true }));
        state.guided.message = "Description filled below. Check it, then search listings.";
        if (status) status.textContent = state.guided.message;
        details.open = false;
        try { query.focus({ preventScroll: true }); } catch (_) { query.focus(); }
      });
    }
    const section = form?.querySelector?.("[data-ff-serial-refinement]");
    if (!section) return;
    const select = section.querySelector("[data-ff-serial-status]");
    const denominator = section.querySelector("[data-ff-serial-denominator]");
    const ordinal = section.querySelector("[data-ff-serial-ordinal]");
    const clearError = () => {
      state.serial.error = "";
      const node = section.querySelector("[data-ff-serial-error]");
      if (node) { node.textContent = ""; node.hidden = true; }
    };
    select?.addEventListener("change", () => {
      state.serial.numbered = select.value;
      if (state.serial.numbered !== "yes") { state.serial.denominator = ""; state.serial.serial = ""; }
      if (denominator) denominator.value = state.serial.denominator;
      if (ordinal) ordinal.value = state.serial.serial;
      const fields = section.querySelector("[data-ff-serial-fields]");
      if (fields) fields.hidden = state.serial.numbered !== "yes";
      const hint = section.querySelector("[data-ff-serial-hint]");
      if (hint) hint.textContent = serialHint();
      clearError();
    });
    denominator?.addEventListener("input", () => { state.serial.denominator = denominator.value; clearError(); });
    ordinal?.addEventListener("input", () => { state.serial.serial = ordinal.value; clearError(); });
  }

  function validHttpUrl(value) {
    try {
      const parsed = new URL(String(value || ""));
      return (parsed.protocol === "https:" || parsed.protocol === "http:") && Boolean(parsed.hostname);
    } catch (_) {
      return false;
    }
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) throw makeError("DISCOVER_RESPONSE_TOO_LARGE", "The FlipForge response exceeded the browser safety limit.");
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      throw makeError("DISCOVER_INVALID_JSON", "The FlipForge gateway returned invalid JSON.");
    }
  }

  function validMeta(payload, expectedCorrelationId) {
    const meta = payload?.meta;
    return Boolean(meta)
      && meta.contractVersion === CONTRACT_VERSION
      && typeof meta.engineVersion === "string"
      && meta.engineVersion.length > 0
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId;
  }

  function validateDiscover(payload, expectedCorrelationId) {
    if (!validMeta(payload, expectedCorrelationId)) return false;
    const data = payload.data;
    const isolation = data?.tenantIsolation;
    if (!data || data.kind !== "discover" || data.readOnly !== true || !Array.isArray(data.items)) return false;
    if (data.discoveryPersisted !== false || data.evaluationRequiredToSave !== true) return false;
    if (data.activeListingsAreCompletedSaleEvidence !== false || data.transactionAuthority !== false) return false;
    if (data.tenantOwnedPersistenceCreated !== false || data.tenantOwnershipCreatedOnlyByEvaluation !== true) return false;
    if (!isolation || isolation.enforced !== true || isolation.defaultAccess !== "DENY") return false;
    const provider = data.provider;
    if (!provider || provider.providerCredentialsExposed !== false || provider.customerCanConfigureProvider !== false || Object.prototype.hasOwnProperty.call(provider, "action")) return false;
    return data.items.every(item => item
      && item.activeListingOnly === true
      && item.completedSaleEvidence === false
      && item.transactionAuthority === false
      && !Object.prototype.hasOwnProperty.call(item, "recommendation"));
  }

  function validateCardIntelligence(payload, expectedCorrelationId) {
    if (!validMeta(payload, expectedCorrelationId)) return false;
    const data = payload?.data;
    return Boolean(data)
      && data.transactionAuthority === false
      && data.providerIdentifierExposed === false
      && data.rawProviderPayloadExposed === false
      && data.providerPayloadPersisted === false
      && data.soldEvidenceAccepted === false
      && data.smartOpportunityRecalculated === false;
  }

  function validateEvaluation(payload, expectedCorrelationId, expectedRequestId) {
    if (!validMeta(payload, expectedCorrelationId)) return false;
    const data = payload.data;
    const decision = data?.decision;
    const isolation = data?.tenantIsolation;
    return Boolean(data && decision && isolation)
      && data.kind === "evaluation"
      && data.requestId === expectedRequestId
      && SAFE_OPPORTUNITY_ID.test(String(data.opportunityId || ""))
      && data.persistedToSqlite === true
      && data.tenantOwned === true
      && data.requestCanVerifyEvidence === false
      && data.requestCanVerifyIdentity === false
      && data.evidenceAcceptedByRequest === false
      && data.psaRecalculated === false
      && data.transactionAuthorized === false
      && data.providerCredentialsExposed === false
      && DECISIONS.has(String(decision.recommendation || "").toUpperCase())
      && isolation.enforced === true
      && isolation.idempotencyScope === "TENANT"
      && isolation.opportunityOwnership === "GRANTED_ON_COMPLETION"
      && isolation.defaultAccess === "DENY";
  }

  async function request(path, { method = "GET", body = null, idempotencyKey = "" } = {}) {
    const requestCorrelationId = correlationId();
    const headers = { Accept: "application/json", "X-Correlation-Id": requestCorrelationId };
    if (body !== null) headers["Content-Type"] = "application/json; charset=utf-8";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const response = await fetch(path, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const upstream = payload?.error || {};
      const error = makeError(upstream.code || "DISCOVER_REQUEST_FAILED", upstream.message || `FlipForge request failed with status ${response.status}.`, response.status);
      error.correlationId = String(upstream.correlationId || requestCorrelationId);
      throw error;
    }
    return { payload, correlationId: requestCorrelationId };
  }

  async function cardIntelligenceRequest(path, body) {
    const result = await request(path, { method: "POST", body });
    if (!validateCardIntelligence(result.payload, result.correlationId)) {
      throw makeError("CARD_INTELLIGENCE_CONTRACT_INVALID", "The identity-assist response failed the FlipForge authority boundary.");
    }
    return result.payload.data;
  }

  function hasExplicitCardNumber(query) {
    const value = String(query || "");
    return /#\s*[A-Za-z0-9][A-Za-z0-9.-]*/.test(value)
      || /\bNO\.?\s*(?=[A-Za-z0-9.-]*\d)[A-Za-z0-9][A-Za-z0-9.-]*\b/i.test(value)
      || /\b(?:[A-Za-z]{1,6}[-.]?)?\d{1,5}[A-Za-z]?\s+(?:PSA|BGS|SGC|CGC|CSG|TAG|BCCG)\s*(?:10|9\.5|9|8\.5|8|7\.5|7|6\.5|6)?\b/i.test(value);
  }

  function declaredGradeContext(query) {
    const match = String(query || "").match(/\b(PSA|BGS|SGC|CGC|CSG|TAG|BCCG)\s*(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6)\b/i);
    return match ? { grader: match[1].toUpperCase(), grade: match[2] } : { grader: "", grade: "" };
  }

  function normalizeIdentityQuery(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function currentVisibleIdentityQuery() {
    return normalizeIdentityQuery(
      state.main?.querySelector?.('[data-customer-discovery-form] input[name="exactCardQuery"]')?.value || ""
    );
  }

  function readSearch(form) {
    const values = new FormData(form);
    const exactCardQuery = normalizeIdentityQuery(values.get("exactCardQuery") || "");
    if (!exactCardQuery || exactCardQuery.length > 500) throw makeError("DISCOVER_QUERY_INVALID", "Enter a card identity of 500 characters or fewer.", 400);
    const limit = Number.parseInt(String(values.get("limit") || "25"), 10);
    if (![10, 25, 50].includes(limit)) throw makeError("DISCOVER_LIMIT_INVALID", "Result limit must be 10, 25, or 50.", 400);
    const targetMaxBuy = String(values.get("targetMaxBuy") || "").trim();
    return { exactCardQuery, targetMaxBuy, limit, targetMaxBuyCents: targetToCents(targetMaxBuy) };
  }

  function safeEvaluationRequest(item) {
    if (!item
      || item.evaluationEligible !== true
      || String(item.matchQuality || "") !== "EXACT_MATCH"
      || !item.evaluationRequest
      || typeof item.evaluationRequest !== "object") {
      throw makeError("DISCOVER_EVALUATION_NOT_ELIGIBLE", item?.evaluationBlockReason || "Exact listing identity and complete current cost are required before authoritative evaluation.", 400);
    }
    const source = item.evaluationRequest;
    const externalListingId = String(source.externalListingId || "").trim();
    const marketplace = String(source.marketplace || "").trim().toUpperCase();
    const cardIdentity = String(source.cardIdentity || "").trim().replace(/\s+/g, " ");
    const listingUrl = String(source.listingUrl || "").trim();
    const seller = String(source.seller || "").trim().slice(0, 300);
    const listingFormat = String(source.listingFormat || "").trim().slice(0, 100);
    if (!SAFE_EXTERNAL_ID.test(externalListingId)) throw makeError("DISCOVER_EVALUATION_INVALID", "The listing ID is not safe for evaluation.", 400);
    if (!MARKETPLACES.has(marketplace)) throw makeError("DISCOVER_EVALUATION_INVALID", "The marketplace is not supported for evaluation.", 400);
    if (!cardIdentity || cardIdentity.length > 500) throw makeError("DISCOVER_EVALUATION_INVALID", "The card identity is not valid for evaluation.", 400);
    if (!validHttpUrl(listingUrl) || listingUrl.length > 2048) throw makeError("DISCOVER_EVALUATION_INVALID", "The listing URL is not valid for evaluation.", 400);
    const cents = name => {
      const value = Number(source[name]);
      if (!Number.isSafeInteger(value) || value < 0 || value > MAX_COST_CENTS) throw makeError("DISCOVER_EVALUATION_INVALID", `${name} is invalid.`, 400);
      return value;
    };
    const itemPriceCents = cents("itemPriceCents");
    if (itemPriceCents <= 0) throw makeError("DISCOVER_EVALUATION_INVALID", "Item price must be greater than zero.", 400);
    return {
      externalListingId,
      marketplace,
      cardIdentity,
      listingUrl,
      seller,
      itemPriceCents,
      shippingCents: cents("shippingCents"),
      buyerPremiumCents: cents("buyerPremiumCents"),
      taxCents: cents("taxCents"),
      listingFormat
    };
  }

  function idempotencyKeyFor(payload) {
    const fingerprint = JSON.stringify(payload);
    let requestId = state.evaluationKeys.get(fingerprint);
    if (!requestId) {
      requestId = newIdempotencyKey();
      state.evaluationKeys.set(fingerprint, requestId);
    }
    return requestId;
  }

  async function loadHealth() {
    const result = await request("/api/v1/health");
    const meta = result.payload?.meta;
    const data = result.payload?.data;
    if (!meta || meta.contractVersion !== CONTRACT_VERSION || meta.correlationId !== result.correlationId || !data) {
      throw makeError("DISCOVER_HEALTH_INVALID", "The gateway health response failed its contract.");
    }
    state.health = data;
  }

  async function ensureHealth() {
    if (state.health) return state.health;
    if (!state.healthPromise) {
      state.healthPromise = loadHealth()
        .then(() => state.health)
        .finally(() => {
          state.healthPromise = null;
        });
    }
    return state.healthPromise;
  }

  async function runDiscover(draft) {
    state.error = null;
    state.notice = "";
    state.data = null;
    state.loading = true;
    const searchSerial = state.discoverSerial + 1;
    state.discoverSerial = searchSerial;
    renderCurrent();
    try {
      const result = await request(DISCOVER_PATH, {
        method: "POST",
        body: { exactCardQuery: draft.exactCardQuery, limit: draft.limit, targetMaxBuyCents: draft.targetMaxBuyCents }
      });
      // "New card" was chosen while this search was running: its answer no longer belongs on the page.
      if (searchSerial !== state.discoverSerial) return;
      if (!validateDiscover(result.payload, result.correlationId)) throw makeError("DISCOVER_CONTRACT_INVALID", "The provider-backed Discover response failed the FlipForge authority, evidence, or tenant contract.");
      state.data = result.payload.data;
      state.lastSearch = { exactCardQuery: draft.exactCardQuery, targetMaxBuy: String(draft.targetMaxBuy || ""), limit: String(draft.limit) };
      const returnedItems = Array.isArray(state.data.items) ? state.data.items : [];
      const exactCandidateCount = Number.isInteger(state.data.exactCandidateCount)
        ? state.data.exactCandidateCount
        : returnedItems.filter(item => String(item?.matchQuality || "") === "EXACT_MATCH").length;
      const identityReviewCandidateCount = Number.isInteger(state.data.identityReviewCandidateCount)
        ? state.data.identityReviewCandidateCount
        : Math.max(0, returnedItems.length - exactCandidateCount);
      state.notice = exactCandidateCount
        ? `${exactCandidateCount} exact active candidate${exactCandidateCount === 1 ? "" : "s"} returned from currently connected sources.`
        : identityReviewCandidateCount
          ? `No exact active listing matched. ${identityReviewCandidateCount} provider result${identityReviewCandidateCount === 1 ? " was" : "s were"} withheld for identity review.`
          : state.data.provider?.available === false
            ? "The authorized active-listing provider is not connected for this runtime. No sample results were substituted."
            : "No active candidates matched this exact-card search.";
      if (state.data.candidateCount > 0) {
        state.draft = { exactCardQuery: "", targetMaxBuy: "", limit: String(draft.limit) };
      }
    } catch (error) {
      if (searchSerial === state.discoverSerial) state.error = error;
    } finally {
      if (searchSerial === state.discoverSerial) {
        state.loading = false;
        renderCurrent();
        focusDiscoverResults();
      }
    }
  }

  async function suggestIdentity(draft) {
    const requestedQuery = normalizeIdentityQuery(draft.exactCardQuery);
    state.identityAssist.typedQuery = requestedQuery;
    const requestSerial = state.identityAssist.requestSerial + 1;
    state.identityAssist.requestSerial = requestSerial;
    state.error = null;
    state.notice = "";
    state.data = null;
    state.identityAssist.active = true;
    state.identityAssist.busy = true;
    state.identityAssist.query = requestedQuery;
    state.identityAssist.results = [];
    state.identityAssist.message = "Looking for exact catalog identities…";
    renderCurrent();
    focusIdentityCheck();
    try {
      const data = await cardIntelligenceRequest(CARD_INTELLIGENCE_SEARCH_PATH, {
        query: requestedQuery,
        limit: 12
      });
      if (requestSerial !== state.identityAssist.requestSerial || requestedQuery !== state.identityAssist.query) return;
      state.identityAssist.results = Array.isArray(data.results) ? data.results : [];
      const selectableCount = state.identityAssist.results.filter(row => row
        && row.exactCardCandidate === true
        && SAFE_SELECTION_TOKEN.test(String(row.selectionToken || ""))).length;
      state.identityAssist.message = selectableCount > 0
        ? `${selectableCount} verified card option${selectableCount === 1 ? "" : "s"} can be selected. FlipForge will not choose one for you.`
        : "No selectable exact identity was returned. Add a year, set, player, card number, or parallel and try again.";
    } catch (error) {
      if (requestSerial !== state.identityAssist.requestSerial) return;
      // With the data provider suspended, identity assist reports unavailable: a neutral state, not an error.
      if (Number(error?.status) === 503 || /SUSPENDED|PROVIDER_UNAVAILABLE|PROVIDER_EVIDENCE_UNAVAILABLE|CARD_INTELLIGENCE_UNAVAILABLE/i.test(String(error?.code || ""))) {
        state.identityAssist.message = "Provider evidence is currently unavailable. You can still search with the exact card identity you typed.";
      } else {
        state.error = error;
        state.identityAssist.message = "";
      }
    } finally {
      if (requestSerial === state.identityAssist.requestSerial) {
        state.identityAssist.busy = false;
        renderCurrent();
        focusIdentityCheck();
      }
    }
  }

  async function search(form) {
    const entry = prepareBetaSearch(form, false);
    if (!entry.proceed) return;
    if (entry.identityCheck) {
      await findExactCard(form);
      return;
    }
    state.error = null;
    state.notice = "";
    state.evaluationError = null;
    state.data = null;
    revalidateLimit();
    let draft;
    try {
      draft = readSearch(form);
    } catch (error) {
      state.error = error;
      renderCurrent();
      return;
    }
    state.draft = { exactCardQuery: draft.exactCardQuery, targetMaxBuy: draft.targetMaxBuy, limit: String(draft.limit) };
    state.identityAssist.active = false;
    state.identityAssist.results = [];
    state.identityAssist.message = "";

    if (!hasExplicitCardNumber(draft.exactCardQuery)) {
      await suggestIdentity(draft);
      return;
    }
    await runDiscover(draft);
  }

  async function findExactCard(form) {
    let draft;
    try {
      draft = readSearch(form);
      const typedQuery = normalizeIdentityQuery(state.identityAssist.typedQuery);
      if (typedQuery) draft.exactCardQuery = typedQuery;
    } catch (error) {
      state.error = error;
      renderCurrent();
      return;
    }
    state.draft = { exactCardQuery: draft.exactCardQuery, targetMaxBuy: draft.targetMaxBuy, limit: String(draft.limit) };
    await suggestIdentity(draft);
  }

  async function resolveIdentity(index, expectedQuery) {
    const ownedQuery = normalizeIdentityQuery(expectedQuery);
    const currentQuery = normalizeIdentityQuery(state.identityAssist.query);
    const draftQuery = normalizeIdentityQuery(state.draft.exactCardQuery);
    const visibleQuery = currentVisibleIdentityQuery();
    const typedQuery = normalizeIdentityQuery(state.identityAssist.typedQuery);
    if (!ownedQuery
      || ownedQuery !== currentQuery
      || ownedQuery !== draftQuery
      || (typedQuery && ownedQuery !== typedQuery)
      || (visibleQuery && ownedQuery !== visibleQuery)) {
      state.identityAssist.message = "That identity choice is no longer current. Review the latest card options before continuing.";
      renderCurrent();
      focusIdentityCheck();
      return;
    }
    const row = state.identityAssist.results[Number(index)];
    const token = String(row?.selectionToken || "");
    if (!row || row.exactCardCandidate !== true || !SAFE_SELECTION_TOKEN.test(token)) return;

    state.error = null;
    state.notice = "";
    state.identityAssist.busy = true;
    state.identityAssist.message = "Re-verifying the selected exact card…";
    renderCurrent();

    try {
      const data = await cardIntelligenceRequest(CARD_INTELLIGENCE_RESOLVE_PATH, { selectionToken: token });
      const cardIdentity = String(data.cardIdentity || "").trim().replace(/\s+/g, " ");
      if (data.readyForEvaluation !== true || !cardIdentity || cardIdentity.length > 500 || !hasExplicitCardNumber(cardIdentity)) {
        throw makeError("CARD_INTELLIGENCE_SELECTION_NOT_READY", data.message || "The selected card still needs exact identity verification.", 400);
      }

      const draft = {
        exactCardQuery: cardIdentity,
        targetMaxBuy: state.draft.targetMaxBuy,
        limit: Number.parseInt(state.draft.limit, 10),
        targetMaxBuyCents: targetToCents(state.draft.targetMaxBuy)
      };
      state.draft.exactCardQuery = cardIdentity;
      state.identityAssist.active = false;
      state.identityAssist.results = [];
      state.identityAssist.message = "";
      state.identityAssist.busy = false;
      state.notice = "Exact card confirmed. Searching connected sources with the canonical identity.";
      renderCurrent();
      await runDiscover(draft);
    } catch (error) {
      state.error = error;
      state.identityAssist.busy = false;
      renderCurrent();
    }
  }

  async function evaluate(index) {
    if (!state.data || !Array.isArray(state.data.items)) return;
    const item = state.data.items[index];
    state.error = null;
    state.notice = "";
    state.evaluationError = null;
    state.evaluatingIndex = index;
    renderCurrent();
    // Whether the evaluation request left the browser. Before that, nothing can have been evaluated or saved.
    let dispatched = false;
    try {
      const payload = safeEvaluationRequest(item);
      const requestId = idempotencyKeyFor(payload);
      dispatched = true;
      const result = await request(EVALUATION_PATH, { method: "POST", body: payload, idempotencyKey: requestId });
      if (!validateEvaluation(result.payload, result.correlationId, requestId)) throw makeError("DISCOVER_EVALUATION_CONTRACT_INVALID", "The authoritative evaluation response failed the tenant-owned Smart Opportunity contract.");
      // Server semantic replay: this exact listing, card and ask already has a saved decision, so no
      // evaluation was used. semantic-replay-notice-v1.js tells the customer on the saved decision page.
      if (result.payload.data.semanticReplay === true) {
        window.dispatchEvent(new CustomEvent("flipforge:semantic-replay", { detail: { opportunityId: result.payload.data.opportunityId } }));
      }
      state.evaluatingIndex = -1;
      window.location.hash = `#/opportunities/${encodeURIComponent(result.payload.data.opportunityId)}`;
    } catch (error) {
      // Show the failure beside the button that started it. The page-level error panel sits above the results and is
      // moved below them by the Discover layout, so a customer scrolled to the listing saw nothing happen.
      if (error && typeof error === "object") error.dispatched = dispatched;
      // Only the server's EVALUATION_LIMIT_REACHED means the allowance is used up; any other 429 (e.g. a gateway rate
      // limit) is an ordinary refusal and must not disable Evaluate or claim the allowance is reached.
      const limitReached = error?.code === "EVALUATION_LIMIT_REACHED";
      if (limitReached) {
        state.evaluationLimitReached = true;
        // A re-check started before this answer must not lift the block it just reported.
        state.limitCheckSerial += 1;
      }
      const shown = { index, error };
      state.evaluationError = shown;
      state.evaluatingIndex = -1;
      if (!discoverOwnsSurface()) return;
      renderCurrent();
      revealEvaluationError();
      // Show the limit message at once; name the allowance (and usage) when the read-only lookup answers.
      if (limitReached) enrichLimitAlert(shown);
    }
  }

  async function enrichLimitAlert(shown) {
    const allowance = await allowanceSnapshot();
    if (!allowance || state.evaluationError !== shown) return;
    shown.error.allowance = allowance;
    if (!discoverOwnsSurface()) return;
    const node = state.main?.querySelector?.("[data-discovery-evaluate-error]");
    if (!node) return;
    // Update the alert in place so it keeps its position and focus.
    const template = document.createElement("template");
    template.innerHTML = evaluationErrorMarkup(shown.error);
    const fresh = template.content.firstElementChild;
    if (fresh) node.innerHTML = fresh.innerHTML;
  }

  // The allowance block is cached for the session; re-check it with the server (read-only) so it lifts as soon as
  // evaluations are available again (monthly reset, plan or allowance change). Keeps the block if the check fails.
  async function revalidateLimit() {
    if (!state.evaluationLimitReached) return;
    const serial = state.limitCheckSerial + 1;
    state.limitCheckSerial = serial;
    const allowance = await allowanceSnapshot();
    if (serial !== state.limitCheckSerial || !state.evaluationLimitReached) return;
    if (!allowance || allowance.allowedNow !== true) return;
    state.evaluationLimitReached = false;
    if (state.evaluationError && state.evaluationError.error?.code === "EVALUATION_LIMIT_REACHED") state.evaluationError = null;
    if (!state.loading && state.evaluatingIndex < 0) renderCurrent();
  }

  function revealEvaluationError() {
    const alert = () => state.main?.querySelector?.("[data-discovery-evaluate-error]");
    const reveal = ({ scroll }) => {
      const node = alert();
      if (!node) return;
      if (scroll) { try { node.scrollIntoView({ block: "center", behavior: "instant" }); } catch (_) { node.scrollIntoView(); } }
      try { node.focus({ preventScroll: true }); } catch (_) {}
    };
    reveal({ scroll: true });
    // The first layout pass runs right after this render; re-check once it has run.
    const afterFirstPass = () => window.setTimeout(() => {
      const node = alert();
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight || document.activeElement === document.body) reveal({ scroll: rect.top < 0 || rect.bottom > window.innerHeight });
    }, 0);
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(afterFirstPass); else afterFirstPass();
    // Discover layout enhancements react to the re-render and move sections within the page for a short while;
    // moving a node drops its focus and can shift it out of view. Once the page has stopped rearranging, bring the
    // alert back into view and give it focus again - but only if focus fell to nothing (never take it from a control
    // the customer has since chosen).
    if (typeof MutationObserver !== "function" || !state.main) return;
    let timer = 0;
    const started = Date.now();
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      // Ongoing unrelated updates must not postpone this forever: settle at the latest after 1.5 s.
      timer = window.setTimeout(settled, Date.now() - started > 1500 ? 0 : 150);
    });
    const settled = () => {
      observer.disconnect();
      const node = alert();
      const active = document.activeElement;
      if (!node || (active && active !== document.body && active !== node && !node.contains(active))) return;
      const rect = node.getBoundingClientRect();
      reveal({ scroll: rect.top < 0 || rect.bottom > window.innerHeight });
    };
    observer.observe(state.main, { childList: true, subtree: true });
    timer = window.setTimeout(settled, 150);
  }

  // Read-only: which allowance was reached (Private Beta lifetime allowance or a calendar-month plan limit) and the
  // server-reported usage. Never changes access; on any failure the message stays neutral.
  async function allowanceSnapshot() {
    try {
      const result = await request("/api/v1/entitlements");
      const data = result?.payload?.data || {};
      const usage = data.usage || {};
      const scope = String(usage.evaluationAllowanceScope || data.current?.evaluationAllowanceScope || "");
      const state = String(data.current?.accessState || "");
      const number = value => (Number.isInteger(value) && value >= 0 ? value : null);
      // The limit is enforced on admission usage (completed plus in-progress reservations), so report that, as Plan &
      // Usage does: the server's admissionUsage, else completed + reservations.
      const completed = number(usage.completedEvaluations);
      const inProgress = number(usage.inProgressReservations) ?? 0;
      const admission = number(usage.admissionUsage) ?? (completed === null ? null : completed + inProgress);
      return {
        privateBeta: scope === "PRIVATE_BETA_LIFETIME" || state === "PRIVATE_BETA_EVALUATION_ALLOWANCE_REACHED",
        monthly: scope === "UTC_CALENDAR_MONTH" || state === "MONTHLY_EVALUATION_LIMIT_REACHED",
        used: admission,
        inProgress,
        limit: number(usage.evaluationAllowanceLimit ?? usage.monthlyEvaluationLimit),
        allowedNow: typeof usage.evaluationAllowedNow === "boolean"
          ? usage.evaluationAllowedNow
          : Number.isInteger(usage.remainingEvaluations) ? usage.remainingEvaluations > 0 : null
      };
    } catch (_) {
      return null;
    }
  }

  // While the evaluation allowance is used up, every Evaluate button stays disabled; say why on each card.
  function allowanceNoteMarkup() {
    return `<p class="customer-discovery-allowance-note" data-discovery-allowance-note>Evaluate is unavailable: this account has no evaluations left. <a href="#/account">View Plan &amp; Usage</a></p>`;
  }

  function restoreSignInUrl() {
    const path = String(window.location.pathname || "/app/beta/");
    const returnPath = `${path}${window.location.search || ""}${window.location.hash || "#/discover"}`;
    return `/production-auth.html?${new URLSearchParams({ return: returnPath }).toString()}`;
  }

  // Gateway failures that happen before the evaluation is sent upstream: nothing can have been saved.
  const NOT_DISPATCHED_CODES = new Set(["BRIDGE_DISABLED", "UPSTREAM_NOT_CONFIGURED"]);

  // Only a definite rejection (the request never left the browser, the gateway refused it before sending it on, or
  // FlipForge answered with a 4xx) proves nothing was saved. A timeout, a lost connection, any 5xx (including the
  // gateway's UPSTREAM_TIMEOUT / UPSTREAM_UNAVAILABLE after it sent the request on), 408/409 or an unreadable success
  // leaves the outcome unknown.
  function outcomeUnknown(error) {
    if (error?.dispatched === false) return false;
    const code = String(error?.code || "");
    const status = Number(error?.status || 0);
    if (NOT_DISPATCHED_CODES.has(code)) return false;
    if (status >= 400 && status < 500 && status !== 408 && status !== 409) return false;
    return true;
  }

  // Plain-language failure with the next step. "Nothing was saved" is said only for a definite rejection
  // (see outcomeUnknown); retrying the same listing is safe (the request carries the same idempotency key).
  function evaluationErrorMarkup(error) {
    const code = String(error?.code || "");
    const status = Number(error?.status || 0);
    const link = (href, label) => `<a class="button button-secondary" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
    let title;
    let body;
    let actions = "";
    if (code === "EVALUATION_LIMIT_REACHED") {
      const allowance = error?.allowance || null;
      const inProgress = allowance && allowance.inProgress > 0
        ? `, including ${allowance.inProgress} still in progress` : "";
      const usage = allowance && allowance.used !== null && allowance.limit !== null
        ? ` You have used ${allowance.used} of ${allowance.limit}${inProgress}.` : "";
      title = allowance?.privateBeta
        ? "You\u2019ve reached your Private Beta evaluation allowance."
        : allowance?.monthly ? "You\u2019ve reached this month\u2019s evaluation limit." : "Evaluation limit reached";
      body = `No new evaluation was created for this listing and nothing was saved.${usage} Your existing saved decisions are unchanged.`;
      actions = link("#/account", "View Plan & Usage") + link("#/opportunities", "Open saved decisions");
    } else if (status === 401 || code === "AUTHENTICATION_REQUIRED") {
      title = "Sign in again to evaluate";
      body = "Your FlipForge sign-in has expired, so this listing was not evaluated. Sign in again and you will come back to this page.";
      actions = link(restoreSignInUrl(), "Restore sign in");
    } else if (status === 403) {
      title = "This account can't run evaluations";
      body = `${error?.message || "Your current FlipForge access does not permit a new evaluation."} This listing was not evaluated and nothing was saved.`;
      actions = link("#/account", "View Plan & Usage");
    } else if (outcomeUnknown(error)) {
      // The request may have reached FlipForge before the answer was lost, so the outcome is unknown: never claim
      // nothing was saved. Retrying reuses the same idempotency key and returns the saved decision if one exists.
      title = code === "CUSTOMER_API_TIMEOUT" || error?.name === "TimeoutError" || code === "UPSTREAM_TIMEOUT"
        ? "No answer from FlipForge yet"
        : error instanceof TypeError || /failed to fetch|network/i.test(String(error?.message || ""))
          ? "Connection lost"
          : "FlipForge couldn't confirm this evaluation";
      body = "We couldn't confirm whether this evaluation finished. If it did, it is in your saved decisions. Trying again is safe: it returns the same decision and will not create a duplicate or use another evaluation.";
      actions = link("#/opportunities", "Open saved decisions");
    } else {
      title = "The evaluation couldn't be completed";
      body = `${error?.message || "FlipForge could not complete this evaluation."} Nothing was saved. You can try again.`;
    }
    const reference = error?.correlationId ? `<small>Reference: ${escapeHtml(error.correlationId)}</small>` : "";
    return `<div class="staging-error customer-discovery-evaluate-error" role="alert" tabindex="-1" data-discovery-evaluate-error data-error-code="${escapeHtml(code || String(status || "ERROR"))}"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p>${actions ? `<div class="customer-intelligence-actions">${actions}</div>` : ""}${reference}</div>`;
  }

  function errorPanel() {
    if (!state.error) return "";
    const guidance = state.error.status === 401
      ? "Sign in with an invited private-beta account."
      : state.error.status === 403
        ? "The signed-in account needs an active FlipForge tenant membership."
        : "No mock listing, browser recommendation, or partial evaluation was substituted.";
    return `<section class="panel staging-error" role="alert"><div class="panel-body"><strong>${escapeHtml(state.error.code || "DISCOVER_UNAVAILABLE")}</strong><p>${escapeHtml(state.error.message)}</p><small>${escapeHtml(guidance)}</small></div></section>`;
  }

  // Mirror the busy state that searchPanel() renders onto the live form
  // controls without replacing the form element.
  function syncSearchControls(form) {
    const busy = state.loading || state.identityAssist.busy;
    const submit = form?.querySelector?.('button[type="submit"]');
    const findExact = form?.querySelector?.("[data-discovery-find-exact]");
    if (submit) {
      submit.disabled = busy;
      // Only replace a busy label; leave any idle label the page already shows.
      if (busy || /Searching…|Resolving…/.test(submit.textContent || "")) {
        submit.textContent = state.loading ? "Searching…" : state.identityAssist.busy ? "Resolving…" : searchLabels().submit;
      }
    }
    if (findExact) findExact.disabled = busy;
  }

  function searchPanel() {
    const busy = state.loading || state.identityAssist.busy;
    const beta = betaSurface();
    const labels = searchLabels();
    const heading = beta
      ? "<h2>Find listings for your card</h2><p>Use guided selections or the exact-card search field. Confirm the card version before you choose a listing.</p>"
      : "<h2>Search connected active listings</h2><p>Enter the card you want FlipForge to evaluate. If you are unsure of the exact identity, use Find exact card.</p>";
    // The beta searches the default 25 results and offers no result-count choice.
    const limitControl = beta
      ? `<input type="hidden" name="limit" value="${escapeHtml(state.draft.limit || "25")}">`
      : `<label><span>Results</span><select name="limit">${[10,25,50].map(value => `<option value="${value}"${String(value) === state.draft.limit ? " selected" : ""}>${value}</option>`).join("")}</select></label>`;
    const identityHint = beta
      ? '<p data-ff-beta-identity-hint class="ff-beta-identity-hint">Not sure which version of the card you have? Check card identity first. Otherwise, search listings.</p>'
      : "";
    const controls = resultControlsMarkup();
    return `<section class="panel customer-discovery-search"><header class="panel-header"><div>${heading}</div></header><div class="panel-body"><form data-customer-discovery-form class="customer-discovery-form">${guidedBuilderMarkup()}<label><span>Card</span><input name="exactCardQuery" type="search" maxlength="500" required value="${escapeHtml(state.draft.exactCardQuery)}" placeholder="Example: 2018 Topps Chrome Shohei Ohtani #150 PSA 9" aria-label="Card" autocomplete="off"><small class="ff-card-entry-helper">Year · Set · Player · Card # · Grade (when known).</small></label>${serialEntryMarkup()}<label><span>${beta ? "Max price (optional)" : "Target max buy"}</span><input name="targetMaxBuy" type="text" inputmode="decimal" value="${escapeHtml(state.draft.targetMaxBuy)}" placeholder="Optional, e.g. 525.00" autocomplete="off"></label>${limitControl}<div class="customer-discovery-search-actions"><button class="button button-primary" type="submit" aria-label="${escapeHtml(labels.submitAria)}" title="${escapeHtml(labels.submitTitle)}" ${busy ? "disabled" : ""}>${state.loading ? "Searching…" : state.identityAssist.busy ? "Resolving…" : labels.submit}</button><button class="button button-secondary" type="button" data-discovery-find-exact aria-label="${escapeHtml(labels.exactAria)}" title="${escapeHtml(labels.exactTitle)}" ${busy ? "disabled" : ""}>${labels.exact}</button>${controls}</div>${identityHint}</form><div class="customer-discovery-search-help" data-ff-entry-guide aria-label="What to type in the card box"><p class="ff-entry-guide-title">What to type</p><ul class="ff-entry-guide-list"><li><strong>Year · set · player · card #</strong>, then parallel, grader and grade when you know them.</li><li><strong>Two-year seasons:</strong> basketball and hockey sets often span two years, like 2025-26. Type the season as printed (2025-26). If results look off, try the first year (2025) and check the year on the card.</li><li><strong>Card numbers:</strong> #150, No. 150 and No 150 are all read as card number 150.</li></ul><small>FlipForge never silently picks between two possible cards.</small></div></div></section>`;
  }

  function identityCandidate(row, index) {
    const declaredGrade = declaredGradeContext(state.identityAssist.query);
    const grader = row.grader || declaredGrade.grader;
    const grade = row.grade || declaredGrade.grade;
    const gradeLabel = grader && grade ? `${grader} ${grade}${row.grader || row.grade ? "" : " (entered)"}` : "";
    const detail = [
      row.year,
      row.manufacturer,
      row.releaseName,
      row.setName,
      row.cardNumber ? `#${row.cardNumber}` : "",
      row.parallelName,
      gradeLabel
    ].filter(Boolean).join(" · ");
    const selectable = row?.exactCardCandidate === true && SAFE_SELECTION_TOKEN.test(String(row.selectionToken || ""));
    return `<article class="customer-discovery-identity-option"${row.cardNumber ? ` data-ff-card-number="${escapeHtml(row.cardNumber)}"` : ""}><div><strong>${escapeHtml(row.name || "Card identity candidate")}</strong><small>${escapeHtml(detail || row.type || "Catalog candidate")}</small></div>${selectable ? `<button class="button button-primary" type="button" data-discovery-use-identity="${index}" ${state.identityAssist.busy ? "disabled" : ""}>Use this card</button>` : `<span class="staging-status staging-status-verify">Review only</span>`}</article>`;
  }

  function identityAssistPanel() {
    if (!state.identityAssist.active) return "";
    const rows = Array.isArray(state.identityAssist.results) ? state.identityAssist.results : [];
    return `<section class="panel customer-discovery-identity-assist" id="ff-discovery-identity-check" aria-label="Confirm exact card identity" tabindex="-1"><header class="panel-header"><div><span class="eyebrow">IDENTITY CHECK · REQUIRED BEFORE CONTINUING</span><h2>Confirm your exact card.</h2><p>Select the exact card you mean before FlipForge searches listings or creates a decision. If none is correct, change the card entry instead of guessing.</p></div></header><div class="panel-body">${state.identityAssist.message ? `<div class="customer-discovery-identity-message" role="status">${escapeHtml(state.identityAssist.message)}</div>` : ""}<div class="customer-discovery-identity-query"><span>Card entered</span><strong>${escapeHtml(state.identityAssist.query || state.draft.exactCardQuery || "Current card")}</strong></div>${rows.length ? `<div class="customer-discovery-identity-options">${rows.map(identityCandidate).join("")}</div>` : ""}<div class="customer-discovery-identity-actions"><button class="button button-secondary" type="button" data-discovery-change-identity-entry>Change card entry</button></div><div class="boundary-note"><strong>How identity is confirmed:</strong> FlipForge never selects the first result for you, never shows internal catalog IDs, and does not search listings until you choose the exact card yourself.</div></div></section>`;
  }

  function providerPanel() {
    if (!state.data) return "";
    const provider = state.data.provider || {};
    const tone = provider.available ? "ok" : "warn";
    const items = Array.isArray(state.data.items) ? state.data.items : [];
    const exactCandidateCount = Number.isInteger(state.data.exactCandidateCount)
      ? state.data.exactCandidateCount
      : items.filter(item => String(item?.matchQuality || "") === "EXACT_MATCH").length;
    const identityReviewCandidateCount = Number.isInteger(state.data.identityReviewCandidateCount)
      ? state.data.identityReviewCandidateCount
      : Math.max(0, items.length - exactCandidateCount);
    const reviewNote = identityReviewCandidateCount
      ? `<small>${identityReviewCandidateCount} additional provider result${identityReviewCandidateCount === 1 ? "" : "s"} withheld from exact ranking for identity review.</small>`
      : "";
    return `<section class="panel"><header class="panel-header"><div><h2>Connected source status</h2><p>${escapeHtml(provider.status || "Provider status unavailable.")}</p></div><span class="staging-status staging-status-${tone}">${provider.available ? "Connected" : "Unavailable"}</span></header><div class="panel-body customer-discovery-provider"><span><strong>${escapeHtml(provider.name || "Authorized source")}</strong><small>Automated active-listing connector · customer configuration disabled</small></span><span><strong>${escapeHtml(exactCandidateCount)}</strong><small>Exact candidates</small>${reviewNote}</span><span><strong>${escapeHtml(state.data.evidenceSupportedCount || 0)}</strong><small>With matched exact sold context</small></span></div></section>`;
  }

  function candidateCard(item, index, identityReview = false) {
    const evidence = item.evidence || {};
    const exactIdentity = String(item.matchQuality || "") === "EXACT_MATCH";
    const label = identityReview
      ? "Identity not confirmed"
      : item.discoveryLabel === "BEST_CONNECTED_CANDIDATE"
        ? "Best connected candidate"
        : String(item.discoveryLabel || "Connected candidate").replaceAll("_", " ");
    const evaluateDisabled = identityReview
      || !exactIdentity
      || item.evaluationEligible !== true
      || state.evaluatingIndex >= 0
      || state.evaluationLimitReached;
    const sellerFeedback = Number(item.sellerFeedbackScore);
    const rankingContext = [
      Number.isFinite(sellerFeedback) && sellerFeedback >= 0
        ? `Seller feedback ${new Intl.NumberFormat("en-US").format(sellerFeedback)}`
        : "",
      item.condition ? `Condition ${item.condition}` : "",
      item.listingFormat ? `Format: ${listingWords(FORMAT_WORDS, item.listingFormat)}` : ""
    ].filter(Boolean).join(" · ");
    const factors = item.rankingFactors && typeof item.rankingFactors === "object"
      ? Object.entries(item.rankingFactors)
        .filter(([, value]) => Number.isFinite(Number(value)))
        .map(([name, value]) => `${name.replace(/([A-Z])/g, " $1").replace(/^./, character => character.toUpperCase())} ${Number(value)}/100`)
        .join(" · ")
      : "";
    const rankingDetails = item.rankingExplanation || factors
      ? `<details class="customer-discovery-ranking-details"><summary>Why this result is ranked here</summary>${item.rankingExplanation ? `<p>${escapeHtml(item.rankingExplanation)}</p>` : ""}${factors ? `<small>${escapeHtml(factors)}</small>` : ""}</details>`
      : "";
    const eyebrow = identityReview
      ? `Excluded provider result · ${escapeHtml(item.providerDisplayName || item.marketplace || "Authorized source")}`
      : `Rank ${escapeHtml(item.rank || index + 1)} · ${escapeHtml(item.providerDisplayName || item.marketplace || "Authorized source")}`;
    // Zero matched sales is the normal beta state, not an error. Say plainly why there is
    // no value instead of the bare "Evidence required", and offer the one action a tester
    // has: ask the FlipForge team for evidence through the existing beta feedback form.
    // Without enough sold evidence there is nothing to position the ask against. Two different
    // states, worded differently: no qualified sale at all, or some qualified sales that are
    // still below the minimum FlipForge needs before it shows a value.
    const soldSaleCount = Math.max(0, Number.parseInt(evidence.trustedExactCompletedSaleCount, 10) || 0);
    const saleWord = count => `${count} qualified ${count === 1 ? "sale" : "sales"}`;
    const rawPricePosition = String(item.pricePosition || "").trim();
    const pricePositionText = !evidence.supported && (!rawPricePosition || /^evidence required\.?$/i.test(rawPricePosition))
      ? (soldSaleCount > 0 ? "Not available until there are enough qualified sales" : "Not available until there is sold-price evidence")
      : rawPricePosition || "Evidence required";
    const requestControl = !identityReview && evidenceRequestAvailable()
      ? `<button class="customer-discovery-evidence-request" type="button" data-discovery-request-evidence="${index}">Request evidence for this card</button>`
      : "";
    const soldContextMetric = evidence.supported
      ? `<div><span>Matched exact sold context</span><strong>${escapeHtml(soldSaleCount)} ${soldSaleCount === 1 ? "sale" : "sales"}</strong><small>${moneyFromCents(evidence.trustedEvidenceValueCents)} median context</small></div>`
      : soldSaleCount > 0
        ? `<div class="customer-discovery-no-sold-data" data-sold-evidence-state="below-threshold"><span>Sold-price evidence</span><strong>${escapeHtml(saleWord(soldSaleCount))} · not enough yet</strong><small>${escapeHtml(saleWord(soldSaleCount))} of this exact card passed FlipForge's evidence checks. That's below the minimum it needs, so no value is shown.</small>${requestControl}</div>`
        : `<div class="customer-discovery-no-sold-data" data-sold-evidence-state="none"><span>Sold-price evidence</span><strong>No qualified sales yet</strong><small>No sale of this exact card has passed FlipForge's evidence checks. The beta isn't using outside sold-price data yet, so FlipForge won't guess a value from asking prices.</small>${requestControl}</div>`;
    const blockReason = item.evaluationBlockReason || "Exact listing identity is required before evaluation.";
    const boundary = identityReview
      ? `<div class="boundary-note"><strong>Not an exact candidate:</strong> ${escapeHtml(blockReason)} It is separated from the ranked exact matches and cannot be sent to Smart Opportunity.</div>`
      : `<div class="boundary-note"><strong>Discovery only:</strong> This active listing is not a sold comp and this score is not BUY/WATCH/VERIFY/PASS. Evaluation is a separate explicit request.</div>`;
    return `<article class="panel customer-discovery-candidate${identityReview ? " customer-discovery-candidate-review" : ""}"><header class="panel-header"><div><span class="eyebrow">${eyebrow}</span><h2>${escapeHtml(item.title || item.cardIdentityQuery || "Active listing")}</h2><p>${escapeHtml(label)}</p></div><span class="customer-discovery-score"><strong>${escapeHtml(item.discoveryScore ?? 0)}</strong><small>Factor score</small></span></header><div class="panel-body"><div class="customer-discovery-metrics"><div><span>All-in ask</span><strong>${moneyFromCents(item.allInAskCents)}</strong><small>${item.allInCostComplete ? "Complete returned cost" : "Cost review required"}</small></div>${soldContextMetric}<div><span>Confidence context</span><strong>${escapeHtml(evidence.calibratedConfidence ?? 0)}/100</strong><small>Risk ${escapeHtml(evidence.risk ?? 0)}/100</small></div><div><span>Listing state</span><strong>${escapeHtml(listingWords(AVAILABILITY_WORDS, item.listingAvailability))}</strong><small>${escapeHtml(listingWords(FRESHNESS_WORDS, item.listingFreshness))}</small></div></div><div class="customer-discovery-copy"><p><strong>Price position:</strong> ${escapeHtml(pricePositionText)}</p>${rankingContext ? `<p><strong>Ranking context:</strong> ${escapeHtml(rankingContext)}</p>` : ""}<p><strong>Next action:</strong> ${escapeHtml(item.nextAction || "Verify the listing before evaluation.")}</p></div>${rankingDetails}<div class="customer-discovery-actions"><a class="button button-secondary" href="${escapeHtml(validHttpUrl(item.listingUrl) ? item.listingUrl : "#")}" target="_blank" rel="noopener noreferrer">Open listing</a>${identityReview ? '<span class="staging-status staging-status-verify" data-ff-evaluation-unavailable>Not eligible for evaluation</span>' : `<button class="button button-primary" type="button" data-discovery-evaluate="${index}" ${evaluateDisabled ? "disabled" : ""}>${state.evaluatingIndex === index ? "Evaluating…" : "Evaluate with Smart Opportunity"}</button>`}</div>${state.evaluationError && state.evaluationError.index === index ? evaluationErrorMarkup(state.evaluationError.error) : state.evaluationLimitReached ? allowanceNoteMarkup() : ""}${boundary}</div></article>`;
  }

  function resultsPanel() {
    if (!state.data) return "";
    const items = Array.isArray(state.data.items) ? state.data.items : [];
    if (!items.length) return `<section class="panel"><div class="panel-body staging-empty"><strong>No active candidate is available.</strong><p>${escapeHtml(state.data.coverageSummary || "No connected listing matched this search.")}</p></div></section>`;

    const indexed = items.map((item, index) => ({ item, index }));
    const exact = indexed.filter(({ item }) => String(item?.matchQuality || "") === "EXACT_MATCH");
    const identityReview = indexed.filter(({ item }) => String(item?.matchQuality || "") !== "EXACT_MATCH");
    const exactResults = exact.length
      ? exact.map(({ item, index }) => candidateCard(item, index, false)).join("")
      : `<section class="panel"><div class="panel-body staging-empty"><strong>No exact active listing matched.</strong><p>Provider results that do not confirm the searched grade, card number, or variation are withheld from the exact ranking.</p></div></section>`;
    const identityReviewResults = identityReview.length
      ? `<details class="customer-discovery-identity-review"><summary>${identityReview.length} excluded provider result${identityReview.length === 1 ? "" : "s"} — identity not confirmed</summary><p>These results are visible for transparency, but they are not ranked with exact matches and cannot be evaluated as the searched card.</p>${identityReview.map(({ item, index }) => candidateCard(item, index, true)).join("")}</details>`
      : "";
    const exactLabel = `${exact.length} exact active candidate${exact.length === 1 ? "" : "s"}`;
    return `<section class="customer-discovery-results" id="ff-discovery-results" tabindex="-1" aria-label="Active discovery candidates"><div class="customer-discovery-summary"><strong>${escapeHtml(exactLabel)}</strong><span>Best candidate means best across currently connected sources—not the entire market. Open “Why this result is ranked here” to review the server-owned ranking factors when available.</span><small data-ff-ranking-order-note class="ff-ranking-order-note">Rank is not sorted by factor score alone. After eligibility, evidence support, confidence/risk, availability and freshness, FlipForge prefers the lower complete all-in ask before using factor score as a tie-breaker.</small></div>${exactResults}${identityReviewResults}</section>`;
  }

  // "Refresh results" / "New search" follow a search that returned results, until the customer types a different card.
  function resultControlsAvailable() {
    return Boolean(state.data && !state.error && !state.identityAssist.active && state.lastSearch);
  }

  function draftDiffersFromLastSearch() {
    const current = normalizeIdentityQuery(state.draft.exactCardQuery);
    return Boolean(current && state.lastSearch && current !== normalizeIdentityQuery(state.lastSearch.exactCardQuery));
  }

  function resultControlsMarkup() {
    if (!resultControlsAvailable() || draftDiffersFromLastSearch()) return "";
    const disabled = state.loading || state.identityAssist.busy ? " disabled" : "";
    return `<button class="button button-secondary ff-discover-result-control" type="button" data-discovery-refresh-v2${disabled}>Refresh results</button><button class="button button-secondary ff-discover-result-control" type="button" data-discovery-clear-v2${disabled}>New search</button>`;
  }

  // Typing a different card removes the two controls (they would act on the previous search); they return when the
  // box matches the last search again.
  function syncResultControls(form) {
    const actions = form?.querySelector?.(".customer-discovery-search-actions");
    if (!actions) return;
    const markup = resultControlsMarkup();
    const shown = Boolean(actions.querySelector("[data-discovery-refresh-v2]"));
    if (shown === Boolean(markup)) return;
    actions.querySelectorAll("[data-discovery-refresh-v2],[data-discovery-clear-v2]").forEach(button => button.remove());
    if (!markup) return;
    actions.insertAdjacentHTML("beforeend", markup);
    bindResultControls(actions);
  }

  function bindResultControls(root) {
    root?.querySelector?.("[data-discovery-refresh-v2]")?.addEventListener("click", refreshResults);
    root?.querySelector?.("[data-discovery-clear-v2]")?.addEventListener("click", startNewCard);
  }

  function refreshResults() {
    const form = state.main?.querySelector?.("[data-customer-discovery-form]");
    const previous = state.lastSearch;
    if (!form || !previous || state.loading || state.identityAssist.busy || state.evaluatingIndex >= 0) return;
    const set = (name, value) => { const control = form.elements?.namedItem?.(name); if (control) control.value = value; };
    set("exactCardQuery", previous.exactCardQuery);
    set("targetMaxBuy", previous.targetMaxBuy);
    set("limit", previous.limit);
    search(form);
  }

  function workflowStripMarkup() {
    if (!betaSurface()) return "";
    let completed = new Set();
    try { completed = new Set(window.FlipForgeGuidedMode?.getProgress?.()?.completed || []); } catch (_) { completed = new Set(); }
    const steps = [["discover", "Evaluate", "#/discover"], ["understand", "Decision", "#/opportunities"], ["track", "Track", "#/tracking"]];
    return `<nav class="ff-workflow-strip" data-ff-workflow-strip aria-label="Your FlipForge card workflow">${steps.map(([key, label, href], index) => {
      const done = completed.has(key);
      return `<a class="ff-workflow-step" href="${href}" data-done="${done}"${key === "discover" ? ' aria-current="step"' : ""}><span class="ff-workflow-step-number">${done ? "\u2713" : index + 1}</span><span>${label}</span></a>`;
    }).join("")}</nav>`;
  }

  // Private Beta: the next step after a search failure, an identity check with nothing to choose, or no listings.
  function recoveryMarkup(key, title, copy, actions) {
    if (!betaSurface()) return "";
    return `<section class="ff-recovery-coach" data-ff-recovery="${key}"><div><span>I'm still with you</span><h3>${title}</h3><p>${copy}</p></div><div class="ff-recovery-actions">${actions}</div></section>`;
  }

  function searchErrorRecovery() {
    if (!state.error) return "";
    return recoveryMarkup("discover-error", "The search didn't finish. Nothing was saved.", "Go back to the card box, confirm the exact identity, and try again. If the card number or parallel is uncertain, use Check card identity first.", '<button class="button button-primary" type="button" data-ff-focus-card>Show me the card box</button><button class="button button-secondary" type="button" data-ff-find-exact>Check card identity</button>');
  }

  function identityRecovery() {
    const assist = state.identityAssist;
    if (!assist.active || assist.busy || (Array.isArray(assist.results) && assist.results.length) || !/No selectable/i.test(assist.message || "")) return "";
    return recoveryMarkup("identity-missing", "FlipForge needs a little more card detail.", "Add the year, set, player, and card number first. Add the parallel, insert, grader, and grade when you know them. Then try Check card identity again.", '<button class="button button-primary" type="button" data-ff-focus-card>Take me back to the card box</button>');
  }

  function emptyResultsRecovery() {
    if (!state.data || (Array.isArray(state.data.items) && state.data.items.length)) return "";
    return recoveryMarkup("discover-empty", "No matching active listing came back yet.", "That does not mean the card is bad. Tighten the identity with the exact card number, parallel or grade, or use Check card identity before searching again.", '<button class="button button-primary" type="button" data-ff-focus-card>Refine this card</button><button class="button button-secondary" type="button" data-ff-find-exact>Check card identity</button>');
  }

  function persistenceNote() {
    return '<div class="ff-discover-persistence-note" data-ff-discover-persistence-note data-ff-discover-persistence-ready="true"><span aria-hidden="true">\u2713</span><div><strong>Searches are temporary; evaluated decisions are saved.</strong> Use <strong>Discover a card</strong> anytime to clear the current Discover workspace and start fresh. Cards you already evaluated stay saved.</div></div>';
  }

  function fullCustomerMode() {
    return window.FlipForgeFullCustomerEntry === true || /^\/(?:app|owner)\/customer\/?$/i.test(String(window.location.pathname || ""));
  }

  // Clear the Discover workspace for another card. Saved decisions are untouched.
  function resetWorkspace() {
    state.discoverSerial += 1;
    state.loading = false;
    state.identityAssist.requestSerial += 1;
    state.identityAssist.active = false;
    state.identityAssist.busy = false;
    state.identityAssist.query = "";
    state.identityAssist.typedQuery = "";
    state.identityAssist.results = [];
    state.identityAssist.message = "";
    state.data = null;
    state.error = null;
    state.notice = "";
    state.evaluationError = null;
    state.lastSearch = null;
    state.draft = { exactCardQuery: "", targetMaxBuy: "", limit: state.draft.limit || "25" };
    state.guided.message = "";
    resetSerialEntry();
  }

  // "+ Start a new card", "New card", "New search": an empty card box, ready for typing.
  function startNewCard() {
    resetWorkspace();
    if (!discoverOwnsSurface()) {
      state.pendingFocus = true;
      if (currentRouteName() !== "discover") window.location.hash = "#/discover";
      return;
    }
    renderCurrent();
    focusCardEntry();
  }

  // Bring the card box into view with a short highlight and focus it. A passive cue (on arrival) never takes focus once
  // the customer has typed or searched.
  function focusCardEntry({ scroll = true, passiveSerial = null } = {}) {
    if (!discoverOwnsSurface()) {
      state.pendingFocus = true;
      if (currentRouteName() !== "discover") window.location.hash = "#/discover";
      return;
    }
    const input = state.main?.querySelector?.('[data-customer-discovery-form] input[name="exactCardQuery"]');
    if (!input) return;
    input.classList?.add?.("ff-discover-direct-input");
    if (scroll) { try { input.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) { input.scrollIntoView(); } }
    later(() => {
      if (!input.isConnected || !discoverOwnsSurface()) return;
      if (passiveSerial !== null && passiveSerial !== state.engagement) return;
      try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
      input.select?.();
    }, 300);
    later(() => input.classList.remove("ff-discover-direct-input"), 12000);
  }

  function later(callback, delay) {
    if (typeof window.setTimeout === "function") window.setTimeout(callback, delay);
  }

  function arrivalCue() {
    if (state.data || state.identityAssist.active) return;
    const serial = state.engagement;
    later(() => {
      if (!discoverOwnsSurface() || state.engagement !== serial || state.data) return;
      focusCardEntry({ scroll: !fullCustomerMode(), passiveSerial: serial });
    }, 180);
  }

  function currentRouteName() {
    return String(window.location.hash || "").replace(/^#\/?/, "").split(/[/?]/)[0];
  }

  const DRAFT_FIELDS = ["exactCardQuery", "targetMaxBuy", "limit"];

  // Re-renders (health completion, route re-application, guided-mode cues) rebuild the
  // form from state.draft. Without this, text the customer typed but has not yet submitted
  // is silently discarded, and an immediate submit then sends an empty, invalid search.
  // Only fields the customer changed since the last render are adopted, so deliberate
  // programmatic resets (for example clearing the query after a successful search) win.
  function preserveTypedDraft() {
    const form = state.main?.querySelector?.("[data-customer-discovery-form]");
    if (!form || !state.renderedDraft) return null;
    const active = typeof document !== "undefined" ? document.activeElement : null;
    let focusedField = null;
    for (const field of DRAFT_FIELDS) {
      const control = form.elements?.namedItem?.(field);
      if (!control || typeof control.value !== "string") continue;
      if (control.value !== state.renderedDraft[field]) state.draft[field] = control.value;
      if (control === active) {
        focusedField = {
          name: field,
          start: typeof control.selectionStart === "number" ? control.selectionStart : null,
          end: typeof control.selectionEnd === "number" ? control.selectionEnd : null
        };
      }
    }
    return focusedField;
  }

  function restoreTypedFocus(focusedField) {
    if (!focusedField || state.loading) return;
    const control = state.main?.querySelector?.(`[data-customer-discovery-form] [name="${focusedField.name}"]`);
    if (!control) return;
    try { control.focus({ preventScroll: true }); } catch (_) { control.focus(); }
    if (focusedField.start !== null && typeof control.setSelectionRange === "function") {
      try { control.setSelectionRange(focusedField.start, focusedField.end ?? focusedField.start); } catch (_) {}
    }
  }

  // Discover owns #main-content only while the address names the Discover route. Requests that finish after the
  // customer has moved to another route (search, identity assist, evaluation failure, allowance checks) update state
  // only; they never draw Discover over the other page. The next Discover render shows the current state.
  function discoverOwnsSurface() {
    const route = String(window.location.hash || "").replace(/^#\/?/, "").split(/[/?]/)[0];
    return Boolean(state.main && state.main.isConnected !== false && route === "discover");
  }

  function renderCurrent() {
    if (!state.main || !discoverOwnsSurface()) return;
    const focusedField = preserveTypedDraft();
    try {
      renderCurrentMarkup();
    } finally {
      state.renderedDraft = {
        exactCardQuery: String(state.draft.exactCardQuery ?? ""),
        targetMaxBuy: String(state.draft.targetMaxBuy ?? ""),
        limit: String(state.draft.limit ?? "")
      };
    }
    restoreTypedFocus(focusedField);
  }

  function renderCurrentMarkup() {
    if (state.health && state.health.status !== "configured") {
      state.main.innerHTML = `<div class="page customer-discovery-page"><header class="page-heading"><div><span class="eyebrow">Provider-backed market discovery</span><h1>Discover</h1><p>Find active listings across approved connected sources without treating asking prices as completed-sale evidence.</p></div></header><div class="boundary-note"><strong>Decision framework:</strong> Smart Opportunity provides the BUY/WATCH/VERIFY/PASS decision. Discover does not save or recommend a listing.</div><section class="panel"><div class="panel-body staging-empty"><strong>Discover is safely offline.</strong><p>The private-beta API bridge is disabled, so no provider search was attempted and no sample results were substituted.</p></div></section></div>`;
      return;
    }
    const beta = betaSurface();
    const heading = beta
      ? '<header class="page-heading"><div><span class="eyebrow">Discover</span><h1>Discover a Card</h1><p>Find and confirm your exact card first. Then select a listing for FlipForge to evaluate.</p></div></header>'
      : '<header class="page-heading"><div><span class="eyebrow">Provider-backed market discovery</span><h1>Discover</h1><p>Search approved active-listing sources, compare all-in asks against existing matched evidence context, then explicitly evaluate the listing you want FlipForge to judge.</p></div><div class="page-actions"><a class="button button-secondary" href="#/opportunities">Saved opportunities</a><a class="button button-secondary" href="#/evaluate">Manual evaluate</a></div></header>';
    const provider = beta ? "" : providerPanel();
    // Reading order: the identity check (when one is needed) directly under the heading, then the card search, the
    // outcome of the search, the results, and the workflow and boundary notes below them.
    const identityRequired = state.identityAssist.active ? " ff-discover-identity-required" : "";
    const notice = state.notice ? `<div class="customer-discovery-notice" role="status">${escapeHtml(state.notice)}</div>` : "";
    state.main.innerHTML = `<div class="page customer-discovery-page ff-discover-above-fold${identityRequired}">${heading}${identityAssistPanel()}${identityRecovery()}${searchPanel()}${errorPanel()}${searchErrorRecovery()}${notice}${state.data ? `${resultsPanel()}${emptyResultsRecovery()}${provider}` : `${provider}${resultsPanel()}`}${workflowStripMarkup()}<div class="boundary-note"><strong>Decision framework:</strong> Discover ranks active candidates only. It does not create BUY/WATCH/VERIFY/PASS, accept evidence, persist a search, or authorize a transaction.</div>${persistenceNote()}</div>`;
    bindActions();
  }

  function focusDiscoverResults() {
    if (!state.data || state.error || state.identityAssist.active) return;
    const results = state.main?.querySelector?.("#ff-discovery-results");
    if (!results) return;

    // Do not animate this handoff. With large result sets, downstream decorators
    // may still be measuring or enhancing dozens of cards. A smooth scroll keeps
    // chasing a moving layout target and makes the page appear to scroll on its own.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!results.isConnected || !state.data || state.error || state.identityAssist.active) return;
        const rect = results.getBoundingClientRect();
        const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
        const topOffset = 96;
        const alreadyUseful = rect.top >= topOffset && rect.top <= Math.max(topOffset + 80, viewportHeight * 0.42);
        if (alreadyUseful) return;
        const root = document.documentElement;
        const previousScrollBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        try {
          results.scrollIntoView({ behavior: "auto", block: "start", inline: "nearest" });
        } finally {
          window.requestAnimationFrame(() => {
            root.style.scrollBehavior = previousScrollBehavior;
          });
        }
      });
    });
  }

  function focusIdentityCheck() {
    if (!state.identityAssist.active) return;
    const panel = state.main?.querySelector?.("#ff-discovery-identity-check");
    if (!panel) return;
    window.requestAnimationFrame(() => {
      try { panel.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (_) { panel.scrollIntoView(); }
      window.setTimeout(() => {
        const firstChoice = panel.querySelector('[data-discovery-use-identity]:not([disabled])');
        if (firstChoice) {
          try { firstChoice.focus({ preventScroll: true }); } catch (_) { firstChoice.focus(); }
        } else {
          try { panel.focus({ preventScroll: true }); } catch (_) { panel.focus(); }
        }
      }, 220);
    });
  }

  function bindActions() {
    const form = state.main?.querySelector?.("[data-customer-discovery-form]");
    form?.addEventListener("submit", event => {
      event.preventDefault();
      state.engagement += 1;
      if (!state.loading && !state.identityAssist.busy && state.evaluatingIndex < 0) search(form);
    });
    bindBetaEntry(form);
    const identityInput = form?.querySelector?.('input[name="exactCardQuery"]');
    identityInput?.addEventListener("input", event => {
      if (event.isTrusted) state.engagement += 1;
      const visibleQuery = normalizeIdentityQuery(identityInput.value);
      state.identityAssist.typedQuery = visibleQuery;
      state.draft.exactCardQuery = visibleQuery;
      if (state.serial.error && !form.querySelector("[data-ff-serial-refinement]")) {
        state.serial.error = "";
        form.querySelector("[data-ff-serial-error]")?.remove();
      }
      syncResultControls(form);
      if (state.identityAssist.active && visibleQuery !== normalizeIdentityQuery(state.identityAssist.query)) {
        state.identityAssist.requestSerial += 1;
        state.identityAssist.active = false;
        state.identityAssist.busy = false;
        state.identityAssist.query = "";
        state.identityAssist.results = [];
        state.identityAssist.message = "";
        // Remove stale selection controls immediately without re-rendering the
        // form the customer is actively typing in.
        state.main?.querySelector?.(".customer-discovery-identity-assist")?.remove();
        // The superseded lookup's completion is ignored (its serial is stale),
        // so it will never re-render the form. Re-arm the controls that the
        // in-flight lookup disabled, in place, so typing and focus are kept.
        syncSearchControls(form);
      }
    });
    const changeIdentityEntryButton = state.main?.querySelector?.("[data-discovery-change-identity-entry]");
    changeIdentityEntryButton?.addEventListener("click", () => {
      const input = form?.querySelector?.('input[name="exactCardQuery"]');
      if (!input) return;
      try { input.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) { input.scrollIntoView(); }
      window.setTimeout(() => {
        try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
        input.select?.();
      }, 180);
    });

    const checkIdentity = () => {
      if (!form || state.loading || state.identityAssist.busy || state.evaluatingIndex >= 0) return;
      const entry = prepareBetaSearch(form, true);
      if (entry.proceed) findExactCard(form);
    };
    state.main?.querySelector?.("[data-discovery-find-exact]")?.addEventListener("click", checkIdentity);
    // The recovery notes' "Check card identity" runs the same identity check as the button in the search form.
    state.main?.querySelectorAll?.("[data-ff-find-exact]").forEach(button => button.addEventListener("click", checkIdentity));
    bindResultControls(state.main);
    const selectionOwnerQuery = normalizeIdentityQuery(state.identityAssist.query);
    state.main?.querySelectorAll?.("[data-discovery-use-identity]").forEach(button => {
      button.addEventListener("click", () => {
        const index = Number.parseInt(button.dataset.discoveryUseIdentity || "-1", 10);
        if (Number.isInteger(index) && index >= 0 && !state.loading && !state.identityAssist.busy && state.evaluatingIndex < 0) {
          resolveIdentity(index, selectionOwnerQuery);
        }
      });
    });
    state.main?.querySelectorAll?.("[data-discovery-request-evidence]").forEach(button => {
      button.addEventListener("click", () => {
        const index = Number.parseInt(button.dataset.discoveryRequestEvidence || "-1", 10);
        if (Number.isInteger(index) && index >= 0) requestEvidence(index);
      });
    });
    state.main?.querySelectorAll?.("[data-discovery-evaluate]").forEach(button => {
      button.addEventListener("click", () => {
        const index = Number.parseInt(button.dataset.discoveryEvaluate || "-1", 10);
        if (Number.isInteger(index) && index >= 0 && state.evaluatingIndex < 0) evaluate(index);
      });
    });
  }

  async function render(main) {
    state.main = main;
    state.evaluatingIndex = -1;
    try { document.documentElement.classList.toggle("ff-guided-discover-active", betaSurface()); } catch (_) {}
    revalidateLimit();
    const renderSerial = state.renderSerial + 1;
    state.renderSerial = renderSerial;
    state.error = null;
    state.notice = "";
    if (!eligibleHost()) return false;

    if (!state.health) {
      state.loading = true;
      renderCurrent();
      let healthError = null;
      try {
        await ensureHealth();
      } catch (error) {
        healthError = error;
      }

      // applyRoute intentionally does not await adapters. If another route pass
      // entered render() while health was loading, only the newest pass may own
      // the final DOM. This prevents a late health completion from replacing a
      // form the customer has already started using.
      if (renderSerial !== state.renderSerial || state.main !== main) return false;
      state.error = healthError;
      state.loading = false;
    }

    if (renderSerial !== state.renderSerial || state.main !== main) return false;
    renderCurrent();
    if (state.pendingFocus) {
      state.pendingFocus = false;
      focusCardEntry();
    } else if (state.arrivalPending) {
      arrivalCue();
    }
    state.arrivalPending = false;
    return true;
  }

  // Leaving Discover starts the next visit fresh: serial details reset and the card box gets its arrival cue.
  if (typeof window.addEventListener === "function") window.addEventListener("hashchange", () => {
    if (currentRouteName() === "discover") return;
    state.arrivalPending = true;
    resetSerialEntry();
    try { document.documentElement.classList.remove("ff-guided-discover-active"); } catch (_) {}
  });

  // "+ Start a new card" / "New card" (saved decisions, Evaluate, the top bar, the guide) and "Focus card entry" are
  // Discover actions wherever they appear.
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !eligibleHost()) return;
    if (target.closest("[data-ff-global-new-card],[data-ff-new-card]")) {
      startNewCard();
      return;
    }
    if (target.closest("[data-ff-focus-card]")) focusCardEntry();
  });

  window.FlipForgeCustomerDiscovery = Object.freeze({
    isEligible: eligibleHost,
    render,
    startNewCard,
    focusCardEntry: () => focusCardEntry(),
    // Pure card-entry helpers (no DOM, no network), exposed for the validators.
    serialEntry: Object.freeze({ compose: composeSerial, parseNumbering, scanNumbering }),
    guidedEntry: Object.freeze({ compose: composeGuided })
  });
})();
