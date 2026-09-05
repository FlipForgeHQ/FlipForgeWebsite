(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 760px)";

  function normalizeBrandTrademark() {
    const name = document.querySelector(".brand-name");
    if (!name) return;
    if (String(name.textContent || "").trim() !== "FLIPFORGE") {
      name.textContent = "FLIPFORGE";
    }
  }

  function syncMobileNavState() {
    const shell = document.querySelector(".app-shell");
    const mobile = window.matchMedia?.(MOBILE_QUERY).matches === true;
    const open = mobile && shell?.dataset.navOpen === "true";
    document.body.classList.toggle("ff-mobile-nav-open", Boolean(open));
  }

  function sync() {
    normalizeBrandTrademark();
    syncMobileNavState();
  }

  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-nav-open"]
  });

  window.addEventListener("resize", sync);
  window.addEventListener("pageshow", sync);
  window.addEventListener("hashchange", sync);
  document.addEventListener("click", () => window.setTimeout(sync, 0), true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync, { once: true });
  } else {
    sync();
  }
})();
