(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width:760px)";
  const form = document.querySelector("#global-search-form");
  const input = document.querySelector("#global-search");
  const shell = document.querySelector(".app-shell");

  function mobile(){ return window.matchMedia?.(MOBILE_QUERY).matches === true; }

  function compactPlaceholder(){
    if (!input) return;
    input.placeholder = mobile() ? "Search cards…" : "Search cards, players, sets, or listings…";
  }

  function closeNavAfterSearch(){
    if (!mobile() || !shell) return;
    shell.dataset.navOpen = "false";
    document.querySelector("[data-nav-toggle]")?.setAttribute("aria-expanded", "false");
  }

  form?.addEventListener("submit", closeNavAfterSearch, true);
  window.addEventListener("resize", compactPlaceholder);
  window.addEventListener("pageshow", compactPlaceholder);
  compactPlaceholder();
})();
