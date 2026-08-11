(() => {
  "use strict";

  const adapter = window.FlipForgeStagingReadAdapter;
  const evaluationAdapter = window.FlipForgeStagingEvaluationAdapter;
  const opportunitiesAdapter = window.FlipForgeCustomerOpportunities;
  const compareAdapter = window.FlipForgeCustomerCompare;
  const lifecycleAdapter = window.FlipForgeCustomerLifecycle;
  const managementAdapter = window.FlipForgeCustomerManagement;
  const portfolioAdapter = window.FlipForgeCustomerPortfolio;
  const exportAdapter = window.FlipForgeCustomerExport;
  const discoveryAdapter = window.FlipForgeCustomerDiscovery;
  const entitlementsAdapter = window.FlipForgeCustomerEntitlements;
  const main = document.querySelector("#main-content");
  const banner = document.querySelector(".prototype-banner");
  const bannerTitle = banner ? banner.querySelector("strong") : null;
  const bannerCopy = banner ? banner.querySelector("span") : null;
  const originalTitle = bannerTitle ? bannerTitle.textContent : "";
  const originalCopy = bannerCopy ? bannerCopy.textContent : "";

  function routeParts() {
    const raw = window.location.hash.replace(/^#\/?/, "") || "dashboard";
    return raw.split(/[/?]/).filter(Boolean);
  }

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
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function diagnosticEligible(candidate) {
    if (!candidate) return false;
    if (typeof candidate.isDiagnosticEligible === "function") return candidate.isDiagnosticEligible();
    return typeof candidate.isEligible === "function" && candidate.isEligible();
  }

  function renderDiagnosticUnavailable(title, copy) {
    main.innerHTML = `<div class="page"><header class="page-heading"><div><span class="eyebrow">Unavailable route</span><h1>${title}</h1><p>${copy}</p></div></header><div class="boundary-note"><strong>Diagnostic boundary:</strong> Production customer routes remain available, but staging diagnostics stay restricted to deploy previews and local development.</div></div>`;
    focusMain();
  }

  function applyRoute() {
    const [route, id = ""] = routeParts();
    if (route !== "staging" && route !== "staging-evaluate") {
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
        focusMain();
        return;
      }
      if (route === "opportunities"
          && opportunitiesAdapter
          && typeof opportunitiesAdapter.render === "function"
          && opportunitiesAdapter.isEligible()) {
        showCustomerIntelligenceBanner();
        opportunitiesAdapter.render(main, id);
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

    if (route === "staging") {
      if (!adapter || typeof adapter.render !== "function") {
        renderDiagnosticUnavailable("Staging Data", "The deploy-preview read adapter did not load.");
        return;
      }
      if (!diagnosticEligible(adapter)) {
        renderDiagnosticUnavailable("Staging Data", "This read diagnostic is restricted to deploy previews and local development.");
        return;
      }
      showStagingBanner();
      adapter.render(main, id);
      focusMain();
      return;
    }

    if (!evaluationAdapter || typeof evaluationAdapter.render !== "function") {
      renderDiagnosticUnavailable("Staging Evaluation", "The deploy-preview evaluation adapter did not load.");
      return;
    }
    if (!diagnosticEligible(evaluationAdapter)) {
      renderDiagnosticUnavailable("Staging Evaluation", "This write diagnostic is restricted to deploy previews and local development.");
      return;
    }
    showEvaluationBanner();
    evaluationAdapter.render(main);
    focusMain();
  }

  window.addEventListener("hashchange", applyRoute);
  queueMicrotask(applyRoute);
})();
