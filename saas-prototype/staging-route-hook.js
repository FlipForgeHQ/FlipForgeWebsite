(() => {
  "use strict";

  const adapter = window.FlipForgeStagingReadAdapter;
  const main = document.querySelector("#main-content");
  const banner = document.querySelector(".prototype-banner");
  const bannerTitle = banner ? banner.querySelector("strong") : null;
  const bannerCopy = banner ? banner.querySelector("span") : null;
  const originalTitle = bannerTitle ? bannerTitle.textContent : "";
  const originalCopy = bannerCopy ? bannerCopy.textContent : "";

  function routeParts() {
    const raw = window.location.hash.replace(/^#\/?/, "") || "dashboard";
    return raw.split("/").filter(Boolean);
  }

  function restoreBanner() {
    if (bannerTitle) bannerTitle.textContent = originalTitle;
    if (bannerCopy) bannerCopy.textContent = originalCopy;
  }

  function showStagingBanner() {
    if (bannerTitle) bannerTitle.textContent = "STAGING READ PREVIEW";
    if (bannerCopy) bannerCopy.textContent = "Authenticated tenant-scoped saved data only · No mock fallback · No production activation";
  }

  function applyRoute() {
    const [route, id = ""] = routeParts();
    if (route !== "staging") {
      restoreBanner();
      return;
    }

    showStagingBanner();
    if (!adapter || typeof adapter.render !== "function") {
      main.innerHTML = `<div class="page"><header class="page-heading"><div><span class="eyebrow">Staging adapter unavailable</span><h1>Staging Data</h1><p>The deploy-preview read adapter did not load.</p></div></header></div>`;
      return;
    }
    adapter.render(main, id);
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  window.addEventListener("hashchange", applyRoute);
  queueMicrotask(applyRoute);
})();
