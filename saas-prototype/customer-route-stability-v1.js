(() => {
  "use strict";

  const main = document.querySelector("#main-content");
  if (!main || document.body?.dataset?.ffSurface !== "customer") return;

  const IDLE_MS = 170;
  const MAX_HOLD_MS = 1400;
  const STABLE_FRAMES = 3;
  const GEOMETRY_TOLERANCE = 1.5;
  let idleTimer = 0;
  let maxTimer = 0;
  let generation = 0;
  let frameToken = 0;

  function internalRouteLink(target) {
    return target?.closest?.('a[href^="#/"]') || null;
  }

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean)
      .map(value => {
        try { return decodeURIComponent(value); } catch (_) { return value; }
      });
  }

  function routeReady() {
    const [route = "dashboard", id = ""] = routeParts();

    if (route === "dashboard") {
      return Boolean(
        main.querySelector("[data-commercial-dashboard-v2]")
        && !main.querySelector(".ff-commercial-loading,[data-production-dashboard-guard]")
      );
    }

    if (route === "opportunities" && id) {
      return Boolean(
        main.querySelector(".customer-intelligence-hero")
        && main.querySelector("[data-ff-saved-decision-bar] a[href^=\"#/tracking/\"]")
      );
    }

    if (route === "tracking") {
      const page = main.querySelector(".customer-lifecycle-page");
      if (!page) return false;
      if (page.querySelector(".staging-error")) {
        return Boolean(page.querySelector("[data-ff-tracking-retry]"))
          && page.dataset.ffTrackingCustomerUx === "v3";
      }
      return page.dataset.ffTrackingCustomerUx === "v3";
    }

    if (route === "decision-intelligence") {
      return Boolean(
        main.querySelector('.ff-di-page[data-decision-intelligence-source="server"]')
        && main.querySelector("section[data-ff-decision-card-evidence]")
      );
    }

    if (route === "beta-start") {
      return Boolean(main.querySelector(".private-beta-record-system,.private-beta-shell,.private-beta-page"));
    }

    // Other customer routes can reveal once their final page shell exists and
    // no explicit route loader owns the workspace.
    return Boolean(main.firstElementChild)
      && !main.querySelector(".staging-loading,.ff-commercial-loading,[data-production-dashboard-guard]");
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
    clearTimeout(idleTimer);
    clearTimeout(maxTimer);

    const measured = Math.max(240, Math.round(main.getBoundingClientRect?.().height || main.offsetHeight || 320));
    main.style.setProperty("--ff-route-lock-height", measured + "px");
    main.dataset.ffRouteTransitioning = "true";
    main.setAttribute("aria-busy", "true");

    // Never make customer controls inaccessible for a long-running request.
    // The veil is bounded; route-specific readiness below handles normal cases.
    maxTimer = window.setTimeout(() => {
      if (current === generation) reveal(current);
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

      if (!routeReady()) {
        stable = 0;
        previous = null;
        window.setTimeout(() => {
          if (current === generation && token === frameToken) window.requestAnimationFrame(sample);
        }, 70);
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
