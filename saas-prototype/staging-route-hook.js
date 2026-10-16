(() => {
  "use strict";

  const adapter = window.FlipForgeStagingReadAdapter;
  const opportunityAdapter = window.FlipForgeCustomerOpportunitiesBridge || window.FlipForgeCustomerOpportunities;
  const evaluationAdapter = window.FlipForgeStagingEvaluationAdapter;
  const cardIntelligenceAdapter = window.FlipForgeCustomerCardIntelligence;
  const compareAdapter = window.FlipForgeCustomerCompare;
  const lifecycleAdapter = window.FlipForgeCustomerLifecycle;
  const managementAdapter = window.FlipForgeCustomerManagement;
  const portfolioAdapter = window.FlipForgeCustomerPortfolio;
  const exportAdapter = window.FlipForgeCustomerExport;
  const discoveryAdapter = window.FlipForgeCustomerDiscovery;
  const forgeHeatAdapter = window.FlipForgeCustomerForgeHeat;
  const marketViewAdapter = window.FlipForgeCustomerMarketView;
  const entitlementsAdapter = window.FlipForgeCustomerEntitlements;
  const main = document.querySelector("#main-content");
  const banner = document.querySelector(".prototype-banner");
  const bannerTitle = banner ? banner.querySelector("strong") : null;
  const bannerCopy = banner ? banner.querySelector("span") : null;
  const originalTitle = bannerTitle ? bannerTitle.textContent : "";
  const originalCopy = bannerCopy ? bannerCopy.textContent : "";
  let psaLoadFailed = false;
  let gradingEconomicsLoadFailed = false;

  function routeParts() {
    const raw = window.location.hash.replace(/^#\/?/, "") || "dashboard";
    return raw.split(/[/?]/).filter(Boolean);
  }

  // PRE-PAINT IDENTITY GUARD — a route change must never expose the saved
  // BUY/WATCH/PASS for the card the customer just left, even for one frame.
  // Network-response serial guards alone cannot protect the interval between
  // location.hash changing and the later hashchange event.
  function protectSavedCard(nextHash = String(window.location.hash || "")) {
    if (!main) return;
    // An in-document anchor (for example the keyboard "Skip to main content"
    // link) is not a customer-route change. Never erase the active card for it.
    const fragment = String(nextHash || "");
    if (/^#[^/]+$/.test(fragment) && document.getElementById(fragment.slice(1))) return;
    const shown = main.querySelector(".customer-intelligence-hero");
    if (!shown) return;
    const match = String(nextHash).match(/^#\/?opportunities\/([^/?#]+)/);
    let requestedId = "";
    if (match) {
      try { requestedId = decodeURIComponent(match[1]); }
      catch (_) { requestedId = match[1]; }
    }
    // The element is annotated by both the production customer renderer and
    // the local preview renderer. Missing annotation is never trusted.
    if (requestedId && shown.dataset.ffCardId === requestedId) return;
    main.innerHTML = '<div class="page customer-intelligence-page"><div class="staging-loading" role="status">Loading the saved decision</div></div>';
  }

  // IN-PAGE ANCHORS ARE NOT ROUTES. The keyboard "Skip to main content" link (href="#main-content") would otherwise put a
  // fragment in the address bar that every hashchange renderer reads as a route: the shell repainted the Dashboard over the
  // saved card, pending card loads were discarded as "route changed", and Refresh failed. Activating such a link moves focus
  // to its target (what the link is for) and leaves the address bar, the card and its in-flight load untouched.
  if (typeof document.addEventListener === "function") document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target && typeof event.target.closest === "function" ? event.target.closest('a[href^="#"]') : null;
    if (!link || (link.target && link.target !== "_self")) return;
    const fragment = String(link.getAttribute("href") || "");
    if (!/^#[^/?]+$/.test(fragment)) return;
    let id = fragment.slice(1);
    try { id = decodeURIComponent(id); } catch (_) { /* keep raw id */ }
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    if (typeof target.focus === "function") target.focus();
    if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "start" });
  }, true);

  // Navigation API's navigate event fires before a same-document fragment
  // navigation commits. The synchronous clear keeps old verdicts out of the
  // first frame whose address bar names another card.
  const hasNavigationEvents = Boolean(window.navigation
    && typeof window.navigation.addEventListener === "function");
  if (hasNavigationEvents) {
    window.navigation.addEventListener("navigate", event => {
      try {
        const destination = new URL(event.destination.url);
        if (destination.origin === window.location.origin
            && destination.pathname === window.location.pathname) {
          protectSavedCard(destination.hash);
        }
      } catch (_) { /* Older browser fallback: hashchange + pre-paint guard. */ }
    });
  }

  // Browsers without Navigation API: reconcile before each paint. This is
  // presentation-only and performs no provider calls or decision recomputation.
  let lastPaintHash = String(window.location.hash || "");
  function protectBeforePaint() {
    const hash = String(window.location.hash || "");
    if (hash !== lastPaintHash) {
      lastPaintHash = hash;
      protectSavedCard(hash);
    }
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(protectBeforePaint);
    }
  }
  // The Navigation API is already pre-paint; avoid a permanent per-frame
  // polling loop there. Keep the loop only for browsers missing that API.
  if (!hasNavigationEvents && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(protectBeforePaint);
  }
  window.addEventListener("hashchange", () => {
    lastPaintHash = String(window.location.hash || "");
    protectSavedCard(lastPaintHash);
  });

  function restoreBanner() {
    if (bannerTitle) bannerTitle.textContent = originalTitle;
    if (bannerCopy) bannerCopy.textContent = originalCopy;
  }

  function showStagingBanner() {
    if (bannerTitle) bannerTitle.textContent = "STAGING READ PREVIEW";
    if (bannerCopy) bannerCopy.textContent = "Authenticated tenant-scoped saved data only · No mock fallback · No production activation";
  }

  function showEvaluationBanner() {
    if (bannerTitle) bannerTitle.textContent = "STAGING EVALUATION";
    if (bannerCopy) bannerCopy.textContent = "Tenant-scoped Smart Opportunity submission only · No evidence verification · No transaction authority";
  }

  function showCustomerIntelligenceBanner() {
    if (bannerTitle) bannerTitle.textContent = "PRIVATE BETA INTELLIGENCE";
    if (bannerCopy) bannerCopy.textContent = "Authenticated tenant-scoped decisions · SQLite saved · No transaction authority";
  }

  function showDiscoveryBanner() {
    if (bannerTitle) bannerTitle.textContent = "PRIVATE BETA DISCOVERY";
    if (bannerCopy) bannerCopy.textContent = "Authorized active listings · Evidence-aware context · Explicit Smart Opportunity evaluation required";
  }

  function focusMain() {
    if (main && typeof main.focus === "function") main.focus({ preventScroll: true });
    if (typeof window.scrollTo === "function") window.scrollTo({ top: 0, behavior: "instant" });
  }

  function addBulkEvaluateAction() {
    const actions = main && typeof main.querySelector === "function" ? main.querySelector(".page-actions") : null;
    if (!actions || actions.querySelector("[data-bulk-evaluate-link]")) return;
    const link = document.createElement("a");
    link.className = "button button-primary";
    link.href = "/.netlify/functions/bulk-evaluate";
    link.setAttribute("data-bulk-evaluate-link", "");
    link.textContent = "Bulk Evaluate";
    actions.prepend(link);
  }

  function renderOpportunityRoute(id) {
    if (!opportunityAdapter || typeof opportunityAdapter.isEligible !== "function" || !opportunityAdapter.isEligible()) return false;
    const renderer = typeof opportunityAdapter.renderCustomer === "function"
      ? opportunityAdapter.renderCustomer
      : opportunityAdapter.render;
    if (typeof renderer !== "function") return false;
    renderer.call(opportunityAdapter, main, id);
    return true;
  }

  function loadGradingEconomicsAdapter() {
    if (window.FlipForgeCustomerGradingEconomics || gradingEconomicsLoadFailed) return;
    if (document.querySelector('script[data-ff-grading-economics]')) return;
    const script = document.createElement("script");
    script.src = "customer-grading-economics.js?v=20260916-2";
    script.async = false;
    script.setAttribute("data-ff-grading-economics", "");
    script.addEventListener("error", () => {
      gradingEconomicsLoadFailed = true;
    }, { once: true });
    document.head.appendChild(script);
  }

  function loadPsaAdapter() {
    if (window.FlipForgeCustomerPsaAdvisor || psaLoadFailed) return;
    if (document.querySelector('script[data-ff-psa-advisor]')) return;
    const script = document.createElement("script");
    script.src = "customer-psa-advisor.js?v=20260830-1";
    script.async = false;
    script.setAttribute("data-ff-psa-advisor", "");
    script.addEventListener("load", () => {
      loadGradingEconomicsAdapter();
      applyRoute();
    }, { once: true });
    script.addEventListener("error", () => {
      psaLoadFailed = true;
      if (routeParts()[0] !== "psa-advisor") return;
      showCustomerIntelligenceBanner();
      main.innerHTML = `<div class="page customer-intelligence-page"><header class="page-heading"><div><span class="eyebrow">Existing PSA intelligence</span><h1>PSA Advisor</h1><p>Saved PSA guidance could not be loaded safely.</p></div></header><section class="panel staging-error" role="alert"><div class="panel-body"><strong>PSA_ADVISOR_UNAVAILABLE</strong><p>The live tenant-scoped PSA Advisor adapter did not load. No mock PSA data or browser-generated guidance was substituted.</p></div></section></div>`;
      focusMain();
    }, { once: true });
    document.head.appendChild(script);
  }

  function renderPsaRoute(id) {
    loadGradingEconomicsAdapter();
    const psaAdapter = window.FlipForgeCustomerPsaAdvisor;
    if (psaAdapter
        && typeof psaAdapter.render === "function"
        && typeof psaAdapter.isEligible === "function"
        && psaAdapter.isEligible()) {
      showCustomerIntelligenceBanner();
      psaAdapter.render(main, id);
      focusMain();
      return true;
    }
    loadPsaAdapter();
    showCustomerIntelligenceBanner();
    main.innerHTML = `<div class="page customer-intelligence-page"><header class="page-heading"><div><span class="eyebrow">Existing PSA intelligence</span><h1>PSA Advisor</h1><p>Loading tenant-owned saved PSA guidance…</p></div></header></div>`;
    focusMain();
    return true;
  }

  function applyRoute() {
    const [route, id = ""] = routeParts();
    if (route !== "staging") {
      if (route !== "staging-evaluate") {
        if (route === "discover"
            && discoveryAdapter
            && typeof discoveryAdapter.render === "function"
            && discoveryAdapter.isEligible()) {
          showDiscoveryBanner();
          discoveryAdapter.render(main);
          focusMain();
          return;
        }
        if (route === "evaluate"
            && evaluationAdapter
            && typeof evaluationAdapter.renderCustomer === "function"
            && evaluationAdapter.isEligible()) {
          showCustomerIntelligenceBanner();
          evaluationAdapter.renderCustomer(main);
          if (cardIntelligenceAdapter
              && typeof cardIntelligenceAdapter.mount === "function"
              && cardIntelligenceAdapter.isEligible()) {
            cardIntelligenceAdapter.mount(main);
          }
          addBulkEvaluateAction();
          focusMain();
          return;
        }
        if (route === "dashboard"
            && adapter
            && typeof adapter.renderCustomerDashboard === "function"
            && adapter.isEligible()) {
          showCustomerIntelligenceBanner();
          adapter.renderCustomerDashboard(main);
          focusMain();
          return;
        }
        if (route === "market-view"
            && marketViewAdapter
            && typeof marketViewAdapter.render === "function"
            && marketViewAdapter.isEligible()) {
          showCustomerIntelligenceBanner();
          marketViewAdapter.render(main);
          focusMain();
          return;
        }
        if (route === "opportunities" && renderOpportunityRoute(id)) {
          showCustomerIntelligenceBanner();
          focusMain();
          return;
        }
        if (route === "forge-heat"
            && forgeHeatAdapter
            && typeof forgeHeatAdapter.render === "function"
            && forgeHeatAdapter.isEligible()) {
          showCustomerIntelligenceBanner();
          forgeHeatAdapter.render(main);
          focusMain();
          return;
        }
        if (route === "compare"
            && compareAdapter
            && typeof compareAdapter.render === "function"
            && compareAdapter.isEligible()) {
          const preferredLeftId = window.FlipForgeCompareRouteState
            && typeof window.FlipForgeCompareRouteState.consumePendingLeftId === "function"
            ? window.FlipForgeCompareRouteState.consumePendingLeftId()
            : "";
          showCustomerIntelligenceBanner();
          compareAdapter.render(main, preferredLeftId || "");
          focusMain();
          return;
        }
        if (route === "psa-advisor" && renderPsaRoute(id)) return;
        if (route === "portfolio"
            && portfolioAdapter
            && typeof portfolioAdapter.render === "function"
            && portfolioAdapter.isEligible()) {
          showCustomerIntelligenceBanner();
          portfolioAdapter.render(main);
          focusMain();
          return;
        }
        if (route === "account"
            && entitlementsAdapter
            && typeof entitlementsAdapter.render === "function"
            && entitlementsAdapter.isEligible()) {
          showCustomerIntelligenceBanner();
          entitlementsAdapter.render(main);
          focusMain();
          return;
        }
        if (lifecycleAdapter
            && typeof lifecycleAdapter.handles === "function"
            && lifecycleAdapter.handles(route)
            && typeof lifecycleAdapter.render === "function"
            && lifecycleAdapter.isEligible()) {
          showCustomerIntelligenceBanner();
          lifecycleAdapter.render(main, route, id);
          focusMain();
          return;
        }
        if (managementAdapter
            && typeof managementAdapter.handles === "function"
            && managementAdapter.handles(route)
            && typeof managementAdapter.render === "function"
            && managementAdapter.isEligible()) {
          showCustomerIntelligenceBanner();
          managementAdapter.render(main, route, id);
          focusMain();
          return;
        }
        if (exportAdapter
            && typeof exportAdapter.handles === "function"
            && exportAdapter.handles(route)
            && typeof exportAdapter.render === "function"
            && exportAdapter.isEligible()) {
          showCustomerIntelligenceBanner();
          exportAdapter.render(main, id);
          focusMain();
          return;
        }
        restoreBanner();
        return;
      }
    }

    if (route === "staging") {
      showStagingBanner();
      if (!adapter || typeof adapter.render !== "function") {
        main.innerHTML = `<div class="page"><header class="page-heading"><div><span class="eyebrow">Staging adapter unavailable</span><h1>Staging Data</h1><p>The deploy-preview read adapter did not load.</p></div></header></div>`;
        focusMain();
        return;
      }
      adapter.render(main, id);
      focusMain();
      return;
    }

    showEvaluationBanner();
    if (!evaluationAdapter || typeof evaluationAdapter.render !== "function") {
      main.innerHTML = `<div class="page"><header class="page-heading"><div><span class="eyebrow">Staging adapter unavailable</span><h1>Staging Evaluation</h1><p>The deploy-preview evaluation adapter did not load.</p></div></header></div>`;
      focusMain();
      return;
    }
    evaluationAdapter.render(main);
    focusMain();
  }

  // Presentation-only repair hook. Customer route ownership can re-run the
  // already-existing authoritative renderer without rebroadcasting a hashchange
  // to every legacy listener and recreating the same route race.
  window.FlipForgeCustomerRouteRenderer = Object.freeze({
    applyCurrentRoute: applyRoute,
    routeParts
  });

  window.addEventListener("hashchange", applyRoute);
  queueMicrotask(applyRoute);
})();