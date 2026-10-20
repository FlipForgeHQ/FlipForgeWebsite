/* Private Beta Discover: search first, serial-number detail only when relevant.
 * This is a query helper, not an identity/evidence/pricing authority. */
(() => {
  "use strict";
  const ROOT = "#main-content";
  const FORM = ROOT + " [data-customer-discovery-form]";
  const QUERY = 'input[name="exactCardQuery"]';
  const NUMBER = /^\d{1,5}$/;
  const MAX_QUERY = 500;
  let scheduled = false;
  let searchHandedOff = false;
  let routeActive = false;
  const draft = { numbered: "unknown", denominator: "", serial: "" };

  function betaDiscover() {
    const path = String(window.location.pathname || "");
    const hash = String(window.location.hash || "#/dashboard");
    return /^\/(?:app|saas-prototype)(?:\/|$)/i.test(path)
      && !/^\/app\/customer(?:\/|$)/i.test(path)
      && /^#\/?discover(?:[/?]|$)/i.test(hash);
  }

  function parseNumbering(query) {
    const text = String(query || "");
    // 01/25, /25, numbered to 25. Exclude year-season forms such as 2018/19.
    const full = /(^|[\s(])(\d{1,5})\s*\/\s*(\d{1,5})(?=$|[\s)\],.;])/g;
    let match;
    while ((match = full.exec(text)) !== null) {
      const serial = Number(match[2]), denominator = Number(match[3]);
      if (/^(?:19|20)\d{2}$/.test(match[2]) && match[3].length === 2) continue;
      if (serial > 0 && denominator > 0 && serial <= denominator) {
        const prefix = match[1];
        return { denominator: String(denominator), serial: String(serial), start: match.index + prefix.length,
          end: match.index + match[0].length, token: match[0].slice(prefix.length) };
      }
    }
    const suffix = /(^|[\s(])\/\s*(\d{1,5})(?=$|[\s)\],.;])/g;
    while ((match = suffix.exec(text)) !== null) {
      if (Number(match[2]) > 0) {
        const prefix = match[1];
        return { denominator: String(Number(match[2])), serial: "", start: match.index + prefix.length,
          end: match.index + match[0].length, token: match[0].slice(prefix.length) };
      }
    }
    const words = /\bnumbered\s+to\s+(\d{1,5})\b/i.exec(text);
    if (words && Number(words[1]) > 0) return { denominator:String(Number(words[1])), serial:"", start:words.index, end:words.index + words[0].length, token:words[0] };
    return null;
  }

  function compose(query, selection = draft) {
    const source = String(query || "").trim().replace(/\s+/g, " ");
    if (!source) return { error: "Enter the card you want to find first." };
    if (source.length > MAX_QUERY) return { error: "The search is too long. Shorten it before searching." };
    const numbered = selection.numbered || "unknown";
    const denominatorText = String(selection.denominator || "").trim();
    const serialText = String(selection.serial || "").trim();
    const existing = parseNumbering(source);
    if (!["unknown", "yes", "no"].includes(numbered)) return { error:"Choose whether the card is numbered." };
    if (numbered === "no" && existing) {
      return { error: "Your search already contains serial numbering. Choose Numbered or correct your search." };
    }
    if (numbered !== "yes") return { query: source, needsVerification: false };
    if (denominatorText && (!NUMBER.test(denominatorText) || Number(denominatorText) === 0)) {
      return { error: "Enter the print run as a positive whole number, such as 25 or 50." };
    }
    if (serialText && (!NUMBER.test(serialText) || Number(serialText) === 0)) {
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
    if (composed.length > MAX_QUERY) return { error: "The complete card search exceeds 500 characters. Shorten the description." };
    return { query: composed, needsVerification: true, denominator:String(denominator),
      serial: serialText || existing?.serial || "" };
  }

  function render() {
    return [
      '<div class="ff-serial-head">',
      '<label class="ff-serial-choice" for="ff-serial-status">Serial-numbered card? <span class="ff-serial-optional">Optional</span></label>',
      '<select id="ff-serial-status" data-ff-serial-status aria-label="Is this card serial numbered?">',
      '<option value="unknown">Not sure</option><option value="no">No</option><option value="yes">Yes — e.g. /25, /50, 1/1</option></select>',
      '</div>',
      '<div class="ff-serial-fields" data-ff-serial-fields hidden>',
      '<label><span>Print run (out of)</span><input data-ff-serial-denominator inputmode="numeric" type="text" maxlength="5" placeholder="25"></label>',
      '<label><span>Serial # (optional)</span><input data-ff-serial-ordinal inputmode="numeric" type="text" maxlength="5" placeholder="01"></label>',
      '</div>',
      '<p class="ff-serial-hint" data-ff-serial-hint>Search first. Choose Yes only if the card is numbered; FlipForge will confirm the exact version before using sales evidence.</p>',
      '<p class="ff-serial-error" role="alert" aria-live="polite" data-ff-serial-error hidden></p>'
    ].join("");
  }

  function showMessage(section, message) {
    const error = section?.querySelector("[data-ff-serial-error]");
    if (!error) return;
    error.textContent = message || "";
    error.hidden = !message;
  }
  function updateFields(section) {
    section.querySelector("[data-ff-serial-fields]").hidden = draft.numbered !== "yes";
    const hint = section.querySelector("[data-ff-serial-hint]");
    if (hint) hint.textContent = draft.numbered === "yes"
      ? "Use 25 for /25, or 50 for /50. The individual serial (such as 01) is optional. This is a matching detail, not a price multiplier."
      : "Search first. FlipForge will ask you to confirm the exact parallel and print run when needed.";
  }

  function prepare(form, section) {
    const input = form?.querySelector(QUERY);
    if (!input) return { error:"The card search is unavailable." };
    const result = compose(input.value);
    if (result.error) { showMessage(section,result.error); return result; }
    showMessage(section,"");
    if (input.value !== result.query) {
      input.value = result.query;
      // Invalidates any stale identity selection in the existing Discover service.
      input.dispatchEvent(new Event("input",{bubbles:true}));
    }
    return result;
  }

  function mount() {
    if (!betaDiscover() || searchHandedOff) return;
    const form = document.querySelector(FORM);
    const main = document.querySelector(ROOT);
    if (!form || !main || main.querySelector("#ff-discovery-results,.customer-discovery-identity-assist")) return;
    if (form.querySelector("[data-ff-serial-refinement]")) return;
    const input = form.querySelector(QUERY);
    if (!input) return;
    const section = document.createElement("section");
    section.className = "ff-serial-refinement";
    section.dataset.ffSerialRefinement = "";
    section.setAttribute("aria-label","Optional serial-number details");
    section.innerHTML = render();
    input.closest("label")?.insertAdjacentElement("afterend",section);
    const select = section.querySelector("[data-ff-serial-status]");
    const denominator = section.querySelector("[data-ff-serial-denominator]");
    const serial = section.querySelector("[data-ff-serial-ordinal]");
    select.value = draft.numbered;
    denominator.value = draft.denominator;
    serial.value = draft.serial;
    select.addEventListener("change", () => {
      draft.numbered = select.value;
      if (draft.numbered !== "yes") { draft.denominator = ""; draft.serial = ""; }
      denominator.value = draft.denominator;
      serial.value = draft.serial;
      updateFields(section);
      showMessage(section,"");
    });
    denominator.addEventListener("input", () => { draft.denominator = denominator.value; showMessage(section,""); });
    serial.addEventListener("input", () => { draft.serial = serial.value; showMessage(section,""); });
    updateFields(section);
  }

  function onSubmit(event) {
    if (!betaDiscover() || !event.target?.matches?.(FORM)) return;
    const form = event.target;
    const section = form.querySelector("[data-ff-serial-refinement]");
    if (!section) return;
    const result = prepare(form,section);
    if (result.error) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    searchHandedOff = true;
    section.remove();
    if (result.needsVerification) {
      // Numbered versions must go through the existing candidate-selection gate first.
      event.preventDefault();
      event.stopImmediatePropagation();
      const verify = form.querySelector("[data-discovery-find-exact]");
      if (verify && !verify.disabled) verify.click();
      else {
        searchHandedOff = false;
        schedule();
      }
    }
  }
  function onClick(event) {
    if (!betaDiscover()) return;
    const target = event.target?.closest?.(FORM + " [data-discovery-find-exact]");
    if (target) {
      const form = target.closest("[data-customer-discovery-form]");
      const section = form?.querySelector("[data-ff-serial-refinement]");
      if (!section) return;
      const result = prepare(form,section);
      if (result.error) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      searchHandedOff = true;
      section.remove();
    }
    if (event.target?.closest?.("[data-ff-new-card]")) {
      searchHandedOff = false;
      draft.numbered = "unknown"; draft.denominator = ""; draft.serial = "";
      schedule();
    }
  }
  function schedule() {
    const active = betaDiscover();
    document.documentElement?.classList?.toggle?.("ff-guided-discover-active",active);
    if (!active && routeActive) {
      searchHandedOff = false;
      draft.numbered = "unknown"; draft.denominator = ""; draft.serial = "";
    }
    routeActive = active;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(); });
  }
  window.FlipForgeGuidedEntryV1 = Object.freeze({ compose, parseNumbering });
  const main = document.querySelector(ROOT);
  if (main) new MutationObserver(schedule).observe(main,{childList:true,subtree:true});
  if (typeof document.addEventListener === "function") {
    document.addEventListener("submit",onSubmit,true);
    document.addEventListener("click",onClick,true);
  }
  window.addEventListener("hashchange",schedule);
  window.addEventListener("pageshow",schedule);
  schedule();
})();
