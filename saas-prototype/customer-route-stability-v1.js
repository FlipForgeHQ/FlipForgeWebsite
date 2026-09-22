(() => {
  "use strict";

  const main = document.querySelector("#main-content");
  if (!main || document.body?.dataset?.ffSurface !== "customer") return;

  const IDLE_MS = 170;
  const MAX_HOLD_MS = 3500;
  const HARD_FAILSAFE_MS = 11000;
  const STABLE_FRAMES = 3;
  const GEOMETRY_TOLERANCE = 1.5;
  let idleTimer = 0;
  let maxTimer = 0;
  let generation = 0;
  let frameToken = 0;
  let transitionStartedAt = 0;

  function internalRouteLink(target) {
    return target?.closest?.('a[href^="#/"]') || null;
  }

  function routeStillLoading() {
    return Boolean(
      main.querySelector(".staging-loading,.ff-commercial-loading,[data-production-dashboard-guard]")
      || /Loading (?:authoritative|saved|tenant-owned|customer|card intelligence|FlipForge)/i.test(String(main.textContent || ""))
    );
  }

  function geometry() {
    const page = main.firstElementChild;
    const heading = main.querySelector("h1");
    const panel = main.querySelector(".panel,[data-ff-di-v2-command],[data-commercial-dashboard-v2]");
    const mainRect = main.getBoundingClientRect?.();
    const pageRect = page?.getBoundingClientRect?.();
    const headingRect = heading?.getBoundingClientRect?.();
    const panelRect = panel?.getBoundingClientRect?.();
    const headingStyle = heading ? window.getComputedStyle(heading) : null;
    return [
      mainRect?.width || 0,
      main.scrollHeight || 0,
      pageRect?.top || 0,
      pageRect?.width || 0,
      pageRect?.height || 0,
      headingRect?.top || 0,
      headingRect?.width || 0,
      headingRect?.height || 0,
      Number.parseFloat(headingStyle?.fontSize || "0") || 0,
      panelRect?.top || 0,
      panelRect?.width || 0
    ];
  }

  function closeEnough(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((value, index) => Math.abs(value - b[index]) <= GEOMETRY_TOLERANCE);
  }

  function begin() {
    generation += 1;
    frameToken += 1;
    const current = generation;
    transitionStartedAt = Date.now();
    clearTimeout(idleTimer);
    clearTimeout(maxTimer);

    const measured = Math.max(240, Math.round(main.getBoundingClientRect?.().height || main.offsetHeight || 320));
    main.style.setProperty("--ff-route-lock-height", measured + "px");
    main.dataset.ffRouteTransitioning = "true";
    main.setAttribute("aria-busy", "true");

    maxTimer = window.setTimeout(() => {
      if (current !== generation) return;
      if (!routeStillLoading() || Date.now() - transitionStartedAt >= HARD_FAILSAFE_MS) {
        reveal(current);
        return;
      }
      scheduleReveal(current);
    }, MAX_HOLD_MS);
    scheduleReveal(current);
  }

  function scheduleReveal(current = generation) {
    if (current !== generation) return;
    frameToken += 1;
    const token = frameToken;
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (token !== frameToken || current !== generation) return;
      waitForStableGeometry(current, token);
    }, IDLE_MS);
  }

  function waitForStableGeometry(current, token) {
    let previous = null;
    let stable = 0;

    const sample = () => {
      if (current !== generation || token !== frameToken) return;
      if (document.fonts && document.fonts.status !== "loaded") {
        document.fonts.ready.then(() => {
          if (current === generation && token === frameToken) window.requestAnimationFrame(sample);
        }).catch(() => window.requestAnimationFrame(sample));
        return;
      }

      if (routeStillLoading()) {
        stable = 0;
        previous = null;
        window.setTimeout(() => {
          if (current === generation && token === frameToken) window.requestAnimationFrame(sample);
        }, 90);
        return;
      }

      const next = geometry();
      stable = closeEnough(previous, next) ? stable + 1 : 0;
      previous = next;

      if (stable >= STABLE_FRAMES) {
        reveal(current);
        return;
      }
      window.requestAnimationFrame(sample);
    };

    window.requestAnimationFrame(sample);
  }

  function reveal(current) {
    if (current !== generation) return;
    clearTimeout(idleTimer);
    clearTimeout(maxTimer);
    frameToken += 1;
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
    // changes, including auth redirects, stay immediate.
    if (main.dataset.ffRouteTransitioning === "true") scheduleReveal();
  });

  const observer = new MutationObserver(() => {
    if (main.dataset.ffRouteTransitioning === "true") scheduleReveal();
  });
  observer.observe(main, { childList: true, subtree: true, characterData: true, attributes: true });

  window.addEventListener("pageshow", () => {
    if (main.dataset.ffRouteTransitioning === "true") scheduleReveal();
  });
})();
