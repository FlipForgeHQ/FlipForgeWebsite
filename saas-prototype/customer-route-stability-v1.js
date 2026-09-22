(() => {
  "use strict";

  const main = document.querySelector("#main-content");
  if (!main || document.body?.dataset?.ffSurface !== "customer") return;

  const IDLE_MS = 96;
  const MAX_HOLD_MS = 700;
  let idleTimer = 0;
  let maxTimer = 0;
  let generation = 0;

  function internalRouteLink(target) {
    return target?.closest?.('a[href^="#/"]') || null;
  }

  function begin() {
    generation += 1;
    const current = generation;
    clearTimeout(idleTimer);
    clearTimeout(maxTimer);

    const measured = Math.max(240, Math.round(main.getBoundingClientRect?.().height || main.offsetHeight || 320));
    main.style.setProperty("--ff-route-lock-height", measured + "px");
    main.dataset.ffRouteTransitioning = "true";
    main.setAttribute("aria-busy", "true");

    maxTimer = window.setTimeout(() => reveal(current), MAX_HOLD_MS);
    scheduleReveal(current);
  }

  function scheduleReveal(current = generation) {
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => reveal(current));
      });
    }, IDLE_MS);
  }

  function reveal(current) {
    if (current !== generation) return;
    clearTimeout(idleTimer);
    clearTimeout(maxTimer);
    delete main.dataset.ffRouteTransitioning;
    main.removeAttribute("aria-busy");
    main.style.removeProperty("--ff-route-lock-height");
    window.dispatchEvent(new CustomEvent("flipforge:route-stable", {
      detail: { route: String(window.location.hash || "#/dashboard") }
    }));
  }

  document.addEventListener("click", event => {
    const link = internalRouteLink(event.target);
    if (!link) return;
    const href = String(link.getAttribute("href") || "");
    if (!href || href === String(window.location.hash || "")) return;
    begin();
  }, true);

  window.addEventListener("hashchange", () => {
    // User clicks are captured before the hash changes. Programmatic route
    // changes (including auth redirects and guarded-route recovery) must not be
    // hidden behind the visual stabilizer.
    if (main.dataset.ffRouteTransitioning === "true") scheduleReveal();
  });

  const observer = new MutationObserver(() => {
    if (main.dataset.ffRouteTransitioning === "true") scheduleReveal();
  });
  observer.observe(main, { childList: true, subtree: true, characterData: true });

  window.addEventListener("pageshow", () => {
    if (main.dataset.ffRouteTransitioning === "true") scheduleReveal();
  });
})();
