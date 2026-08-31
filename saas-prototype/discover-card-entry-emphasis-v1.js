(() => {
  "use strict";

  const MAIN = "#main-content";
  const INPUT = '[data-customer-discovery-form] input[name="exactCardQuery"]';
  const START_PANEL_ID = "ff-discover-start-choice";

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function loadIdentityAssistVerification() {
    if (!document.querySelector('link[data-ff-identity-assist-verification]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "identity-assist-verification-v1.css";
      link.dataset.ffIdentityAssistVerification = "";
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-ff-identity-assist-verification]')) {
      const script = document.createElement("script");
      script.src = "identity-assist-verification-v1.js";
      script.defer = true;
      script.dataset.ffIdentityAssistVerification = "";
      document.body.appendChild(script);
    }
  }

  function loadDiscoverControls() {
    if (document.querySelector('script[data-ff-discover-controls-v2]')) return;
    const script = document.createElement("script");
    script.src = "customer-discovery-controls-v2.js?v=20260830-1";
    script.defer = true;
    script.dataset.ffDiscoverControlsV2 = "";
    document.body.appendChild(script);
  }

  function ensureStartStyles() {
    if (document.getElementById("ff-discover-start-choice-styles")) return;
    const style = document.createElement("style");
    style.id = "ff-discover-start-choice-styles";
    style.textContent = `
      #${START_PANEL_ID}{margin:0 0 18px;padding:18px;border:1px solid rgba(226,181,65,.34);border-radius:14px;background:linear-gradient(180deg,rgba(226,181,65,.07),rgba(255,255,255,.018));box-shadow:0 12px 34px rgba(0,0,0,.18)}
      #${START_PANEL_ID} .ff-discover-start-heading{display:flex;flex-direction:column;gap:5px;margin-bottom:13px}
      #${START_PANEL_ID} .ff-discover-start-heading strong{font-size:17px;color:#f5f7fb}
      #${START_PANEL_ID} .ff-discover-start-heading span{font-size:12px;line-height:1.5;color:#aeb5c1}
      #${START_PANEL_ID} .ff-discover-start-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #${START_PANEL_ID} .ff-discover-start-option{display:flex;flex-direction:column;align-items:flex-start;gap:7px;min-height:118px;padding:15px;border:1px solid rgba(255,255,255,.11);border-radius:12px;background:rgba(5,8,12,.72);text-align:left;cursor:pointer;color:inherit}
      #${START_PANEL_ID} .ff-discover-start-option:hover,#${START_PANEL_ID} .ff-discover-start-option:focus-visible{border-color:rgba(226,181,65,.82);box-shadow:0 0 0 3px rgba(226,181,65,.12);outline:none}
      #${START_PANEL_ID} .ff-discover-start-option strong{font-size:15px;color:#f2cb67}
      #${START_PANEL_ID} .ff-discover-start-option span{font-size:12px;line-height:1.45;color:#c2c8d1}
      #${START_PANEL_ID} .ff-discover-start-option small{margin-top:auto;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#8f98a6}
      @media(max-width:720px){#${START_PANEL_ID} .ff-discover-start-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function focusInput(input) {
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
    }, 80);
  }

  function liveDiscoverControls() {
    const main = document.querySelector(MAIN);
    const form = main?.querySelector("[data-customer-discovery-form]");
    const input = form?.querySelector('input[name="exactCardQuery"]');
    const searchButton = form?.querySelector('button[type="submit"]');
    const identifyButton = form?.querySelector("[data-discovery-find-exact]");
    return { form, input, searchButton, identifyButton };
  }

  function runFindExactFromChooser() {
    const current = liveDiscoverControls();
    if (!current.input || !current.identifyButton || current.identifyButton.disabled) return;
    focusInput(current.input);
    if (!String(current.input.value || "").trim()) return;
    window.setTimeout(() => {
      const live = liveDiscoverControls();
      if (!live.input || !live.identifyButton || live.identifyButton.disabled) return;
      if (!String(live.input.value || "").trim()) return;
      live.identifyButton.click();
    }, 120);
  }

  function runActiveSearchFromChooser() {
    const current = liveDiscoverControls();
    if (!current.form || !current.input || !current.searchButton || current.searchButton.disabled) return;
    focusInput(current.input);
    if (!String(current.input.value || "").trim()) return;
    window.setTimeout(() => {
      const live = liveDiscoverControls();
      if (!live.form || !live.input || !live.searchButton || live.searchButton.disabled) return;
      if (!String(live.input.value || "").trim()) return;
      live.form.requestSubmit?.();
    }, 120);
  }

  function ensureStartChooser(form, input, searchButton, identifyButton) {
    if (!form || !input || !searchButton || !identifyButton) return;
    ensureStartStyles();
    let panel = document.getElementById(START_PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = START_PANEL_ID;
      panel.setAttribute("aria-label", "Choose how to start Discover");
      panel.innerHTML = `
        <div class="ff-discover-start-heading">
          <strong>How do you want to start?</strong>
          <span>Confirm the card first when identity is uncertain, or go directly to active listings when you already know the exact card.</span>
        </div>
        <div class="ff-discover-start-grid">
          <button type="button" class="ff-discover-start-option" data-ff-discover-start-find>
            <strong>Find exact card</strong>
            <span>Search the verified card catalog, choose the correct card, and let FlipForge confirm the identity before marketplace search.</span>
            <small>Best when card number or variant is uncertain</small>
          </button>
          <button type="button" class="ff-discover-start-option" data-ff-discover-start-search>
            <strong>Search active listings</strong>
            <span>Use the exact card identity you already know and search currently connected active-listing sources.</span>
            <small>Best when exact identity is known</small>
          </button>
        </div>`;
      form.closest(".customer-discovery-search")?.insertAdjacentElement("beforebegin", panel);
    }

    const findStart = panel.querySelector("[data-ff-discover-start-find]");
    if (findStart && findStart.dataset.ffBound !== "1") {
      findStart.dataset.ffBound = "1";
      findStart.addEventListener("click", runFindExactFromChooser);
    }
    const searchStart = panel.querySelector("[data-ff-discover-start-search]");
    if (searchStart && searchStart.dataset.ffBound !== "1") {
      searchStart.dataset.ffBound = "1";
      searchStart.addEventListener("click", runActiveSearchFromChooser);
    }
  }

  function decorate() {
    if (routeName() !== "discover") {
      document.getElementById(START_PANEL_ID)?.remove();
      return;
    }
    const main = document.querySelector(MAIN);
    const input = main?.querySelector(INPUT);
    if (!input) return;

    const label = input.closest("label");
    if (!label) return;

    const labelText = label.querySelector(":scope > span");
    if (labelText) labelText.textContent = "CARD IDENTITY — ENTER THE CARD YOU WANT TO EVALUATE";

    input.placeholder = "Example: 2018 Topps Chrome Shohei Ohtani #150 PSA 9";
    input.setAttribute("aria-label", "Card identity — start here");

    if (!label.querySelector(".ff-card-entry-helper")) {
      const helper = document.createElement("small");
      helper.className = "ff-card-entry-helper";
      helper.textContent = "Not sure of the exact card? Find and confirm it first. Already know it? Search active listings.";
      input.insertAdjacentElement("afterend", helper);
    }

    const form = main.querySelector("[data-customer-discovery-form]");
    const searchButton = form?.querySelector('button[type="submit"]');
    if (searchButton && !searchButton.disabled) searchButton.textContent = "Search active listings";
    if (searchButton) {
      searchButton.setAttribute("aria-label", "Search active listings for this card");
      searchButton.title = "Use this when you already know the exact card identity.";
    }

    const identifyButton = form?.querySelector("[data-discovery-find-exact]");
    if (identifyButton && !identifyButton.disabled) identifyButton.textContent = "Find exact card";
    if (identifyButton) {
      identifyButton.setAttribute("aria-label", "Find and confirm the exact card");
      identifyButton.title = "Use this when you are unsure which base, parallel, variation, or card number is correct.";
    }

    ensureStartChooser(form, input, searchButton, identifyButton);
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      decorate();
    });
  }

  loadIdentityAssistVerification();
  loadDiscoverControls();
  const main = document.querySelector(MAIN);
  if (main) new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
  window.addEventListener("hashchange", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("load", schedule);
  schedule();
})();
