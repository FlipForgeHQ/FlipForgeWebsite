/* DEV draft: guided entry composes an explicit customer query, not an authoritative card. */
(() => {
  "use strict";
  const ROOT = "#main-content";
  const CARD_NUMBER = /^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/;
  const BRANDS = ["Topps","Panini","Upper Deck","Bowman","Donruss","Fleer","Leaf","O-Pee-Chee","Score"];
  const GRADERS = ["PSA","SGC","BGS","CGC","TAG"];
  const state = {
    year:"", brand:"", otherBrand:"", product:"", player:"",
    cardNumber:"", parallel:"", condition:"raw", grader:"", grade:""
  };
  let queued = false;
  let handedOff = false; // Never reinsert the entry form after a listing/identity request starts.
  function betaDiscover() {
    const path = String(window.location.pathname || "");
    const hash = String(window.location.hash || "#/dashboard");
    return /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i.test(path)
      && !/^\/(?:app|owner)\/customer(?:\/|$)/i.test(path)
      && /^#\/?discover(?:[/?]|$)/.test(hash);
  }
  function yearOptions() {
    const currentYear = new Date().getFullYear();
    let values = '<option value="">Choose year</option>';
    for (let year=currentYear;year>=1880;year--) values += '<option value="' + year + '">' + year + '</option>';
    return values;
  }
  function options(items, placeholder) {
    return '<option value="">' + placeholder + '</option>' +
      items.map(item => '<option value="' + item + '">' + item + '</option>').join("");
  }
  function field(label, key, control, hint) {
    return '<label class="ff-guided-field"><span>' + label + '</span>' + control +
      (hint ? '<small>' + hint + '</small>' : '') + '</label>';
  }
  function textInput(key, placeholder, length) {
    return '<input type="text" autocomplete="off" data-ff-guided-field="' + key +
      '" maxlength="' + length + '" placeholder="' + placeholder + '">';
  }
  function selectInput(key, html) {
    return '<select data-ff-guided-field="' + key + '">' + html + '</select>';
  }
  function render() {
    return [
      '<details class="ff-guided-entry-details" data-ff-guided-details><summary>Build a card with guided selections</summary>',
      '<div class="ff-guided-entry-header"><div><span class="ff-guided-entry-step">STEP 1 / IDENTIFY</span>',
      '<h3>Build your card search</h3>',
      '<p>Choose the details you know. FlipForge will then show candidate cards to verify — it will not guess which parallel or grade you own.</p>',
      '</div><span class="ff-guided-entry-step">Guided entry · Beta</span></div>',
      '<div class="ff-guided-entry-grid">',
      field("Year", "year", selectInput("year", yearOptions()), "Release year; not a verified checklist match."),
      field("Brand / manufacturer", "brand", selectInput("brand", options(BRANDS.concat("Other"), "Choose brand")), "Common brand hints; not an exhaustive catalog."),
      '<label class="ff-guided-field" data-ff-guided-other-brand hidden><span>Other brand</span>' +
        textInput("otherBrand", "Enter brand exactly", 65) + '</label>',
      field("Product / set", "product", textInput("product", "e.g. Chrome, Series 1", 100), "Do not guess an insert or subset."),
      field("Player / subject", "player", textInput("player", "Name on the card", 95), ""),
      field("Card number", "cardNumber", textInput("cardNumber", "e.g. 150, US1, PC-19", 20), "Use the printed number if known; leave blank to review candidates."),
      field("Parallel / variation", "parallel", textInput("parallel", "Base, Silver, Refractor, etc.", 70), "Leave blank rather than assuming base."),
      field("Condition", "condition", selectInput("condition",
        '<option value="raw">Raw / not graded</option><option value="graded">Professionally graded</option>'), ""),
      '<label class="ff-guided-field" data-ff-guided-grader hidden><span>Grading company</span>' +
        selectInput("grader", options(GRADERS.concat("Other"), "Choose grader")) + '</label>',
      '<label class="ff-guided-field" data-ff-guided-grade hidden><span>Grade</span>' +
        selectInput("grade", options(["6","7","8","9","9.5","10"], "Choose grade")) +
        '<small>Common grade filters. For other grades, use Quick Search below.</small></label>',
      '</div>',
      '<div class="ff-guided-entry-footer"><button class="button button-primary" type="button" data-ff-guided-confirm>',
      'Find &amp; verify matching cards →</button>',
      '<p>The choices create a search request only. Identity confirmation is required before listing search; no grading or sale evidence is inferred.</p></div>',
      '<p class="ff-guided-entry-status" role="status" aria-live="polite" data-ff-guided-status></p>',
      '</details>'
    ].join("");
  }
  function toggleGrading(panel) {
    const isGraded = state.condition === "graded";
    const other = panel.querySelector("[data-ff-guided-other-brand]");
    if (other) other.hidden = state.brand !== "Other";
    const grader = panel.querySelector("[data-ff-guided-grader]");
    const grade = panel.querySelector("[data-ff-guided-grade]");
    if (grader) grader.hidden = !isGraded;
    if (grade) grade.hidden = !isGraded;
    const gradeSelect = panel.querySelector('[data-ff-guided-field="grade"]');
    if (gradeSelect) {
      const half = gradeSelect.querySelector('option[value="9.5"]');
      if (half) half.disabled = state.grader === "PSA";
      if (state.grader === "PSA" && state.grade === "9.5") {
        state.grade = "";
        gradeSelect.value = "";
      }
    }
  }
  function status(panel, message, error = false) {
    const node = panel.querySelector("[data-ff-guided-status]");
    if (!node) return;
    node.textContent = message;
    node.setAttribute("role", error ? "alert" : "status");
  }
  function queryFromFields(draft = state) {
    const year = draft.year;
    const brand = draft.brand === "Other" ? draft.otherBrand.trim() : draft.brand;
    const product = draft.product.trim();
    const player = draft.player.trim();
    const number = draft.cardNumber.trim().replace(/^#/, "");
    const parallel = draft.parallel.trim();
    if (!year || !brand || !product || !player) {
      return { error:"Choose a year and brand, then enter the product/set and player before continuing." };
    }
    if (number && !CARD_NUMBER.test(number)) {
      return { error:"Check the card number. Use only letters, numbers, periods or hyphens (without spaces or #)." };
    }
    if (draft.condition === "graded" && (!draft.grader || !draft.grade)) {
      return { error:"Choose the grading company and grade, or select Raw / not graded." };
    }
    if (draft.condition === "graded" && draft.grader === "Other") {
      return { error:"For other grading companies, use Quick Search so your exact label is preserved." };
    }
    if (draft.condition === "graded" && draft.grader === "PSA" && draft.grade === "9.5") {
      return { error:"PSA 9.5 is not a supported grade choice. Check the grading label." };
    }
    if (draft.condition === "graded" && (!GRADERS.includes(draft.grader) || !["6","7","8","9","9.5","10"].includes(draft.grade))) {
      return { error:"The grading combination is not supported in Guided Entry. Use Quick Search." };
    }
    const bits = [year,brand,product,player,number ? "#" + number : "",parallel,
      draft.condition === "graded" ? draft.grader + " " + draft.grade : ""].filter(Boolean);
    const query = bits.join(" ").replace(/\s+/g," ").trim();
    return query.length <= 500 ? { query } : { error:"Card description exceeds the 500-character limit." };
  }
  function checkIdentity(panel) {
    const outcome = queryFromFields();
    if (outcome.error) return status(panel,outcome.error,true);
    const form = document.querySelector(ROOT + ' [data-customer-discovery-form]');
    const input = form?.querySelector('input[name="exactCardQuery"]');
    const verify = form?.querySelector("[data-discovery-find-exact]");
    if (!input || !verify || verify.disabled) {
      return status(panel,"The identity check is currently unavailable. The form below remains available.",true);
    }
    handedOff = true;
    input.value = outcome.query;
    // Existing discovery code must invalidate any earlier candidate before new confirmation.
    input.dispatchEvent(new Event("input", {bubbles:true}));
    status(panel,"Searching for identity candidates. Confirm the exact version in the next step.");
    verify.click();
  }
  function mount() {
    if (!betaDiscover() || handedOff) return;
    const main = document.querySelector(ROOT);
    if (main?.querySelector(".customer-discovery-results,.customer-discovery-identity-assist")) return;
    const form = document.querySelector(ROOT + " [data-customer-discovery-form]");
    const panelBody = form?.parentElement;
    if (!form || !panelBody || panelBody.querySelector("[data-ff-guided-entry]")) return;
    const panel = document.createElement("section");
    panel.className = "ff-guided-entry";
    panel.dataset.ffGuidedEntry = "";
    panel.setAttribute("aria-label","Guided card identification");
    panel.innerHTML = render();
    const details = panel.querySelector("[data-ff-guided-details]");
    if (details) details.open = window.matchMedia("(min-width: 1101px)").matches;
    form.insertAdjacentElement("beforebegin", panel);
    const manual = document.createElement("p");
    manual.className = "ff-guided-manual-label";
    manual.textContent = "Or use Quick Search: enter the exact card description below.";
    form.insertAdjacentElement("beforebegin", manual);
    for (const element of panel.querySelectorAll("[data-ff-guided-field]")) {
      const key = element.dataset.ffGuidedField;
      if (state[key]) element.value = state[key];
      element.addEventListener(element.tagName === "SELECT" ? "change" : "input", () => {
        state[key] = element.value;
        toggleGrading(panel);
        status(panel,"");
      });
    }
    toggleGrading(panel);
    panel.querySelector("[data-ff-guided-confirm]")?.addEventListener("click", () => checkIdentity(panel));
  }
  window.FlipForgeGuidedEntryV1 = Object.freeze({ compose: queryFromFields });
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; mount(); });
  }
  const main = document.querySelector(ROOT);
  if (main) new MutationObserver(schedule).observe(main,{childList:true,subtree:true});
  // A search should own the page immediately, not fight a late-inserted builder.
  if (typeof document.addEventListener === "function") {
  document.addEventListener("submit", event => {
    if (event.target?.matches?.(ROOT + " [data-customer-discovery-form]")) handedOff = true;
  }, true);
  document.addEventListener("click", event => {
    if (event.target?.closest?.(ROOT + " [data-customer-discovery-form] button[type='submit'], " +
      ROOT + " [data-customer-discovery-form] [data-discovery-find-exact]")) handedOff = true;
  }, true);
  }
  window.addEventListener("hashchange", () => {
    if (!betaDiscover()) handedOff = false;
    schedule();
  });
  window.addEventListener("pageshow",schedule);
  schedule();
})();
