import { chromium } from "playwright";

const MAX_LOCAL_ROUTE_MS = 3000;
const MAX_DRAWER_CLOSE_MS = 1000;
const proofId = "customer-navigation-performance-proof";
const proofItem = {
  id: proofId,
  platform: "EBAY",
  recommendation: "VERIFY",
  title: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  ask: 525,
  supportedValue: 500,
  confidence: 72,
  liquidity: 81,
  risk: 38,
  rank: 84,
  mappingState: "CONFIRMED",
  observedAt: "2026-09-14T18:00:00Z",
  evidence: { acceptedSales: 3 }
};

function authorityMeta(correlationId) {
  return {
    contractVersion: "1.0",
    engineVersion: "customer-navigation-performance-proof",
    authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence",
    correlationId,
    generatedAt: "2026-09-14T18:00:00Z",
    evidenceFreshness: "CURRENT",
    limitations: ["Synthetic customer navigation performance fixture only."]
  };
}

function fixture(request) {
  const url = new URL(request.url());
  const path = url.pathname;
  const correlationId = request.headers()["x-correlation-id"] || "customer-navigation-performance-proof";
  const meta = authorityMeta(correlationId);

  if (path === "/api/v1/health") {
    return {
      meta: { contractVersion: "1.0", correlationId },
      data: { status: "configured", bridgeEnabled: true, upstreamConfigured: true, authenticationRequired: true, tenantMembershipRequired: true }
    };
  }
  if (path === "/api/v1/dashboard") {
    return { meta, data: { metrics: { trackedOpportunities: 1, evidenceReady: 1, populationContextAvailable: 1, needsVerification: 0 } } };
  }
  if (path === "/api/v1/opportunities") {
    return { meta, data: { kind: "opportunities", items: [proofItem], count: 1, sourceOfTruth: "SQLite", transactionAuthority: false } };
  }
  if (path === `/api/v1/opportunities/${proofId}`) {
    return { meta, data: { kind: "opportunity", opportunity: proofItem, sourceOfTruth: "SQLite", transactionAuthority: false } };
  }
  if (path === `/api/v1/evidence/${proofId}`) {
    return {
      meta,
      data: {
        kind: "evidence",
        opportunityId: proofId,
        cardIdentity: proofItem.cardIdentity,
        acceptedExactCompletedSales: 3,
        visibleButAuthorityIneligible: 0,
        linkedEvidence: [{ authorityEligible: true, salePrice: 500 }],
        transactionAuthority: false
      }
    };
  }
  if (path === `/api/v1/psa-advisor/${proofId}`) {
    return {
      meta,
      data: {
        kind: "psa-advisor",
        opportunityId: proofId,
        guidanceStatus: "CONTEXT_AVAILABLE",
        populationContext: { available: true, psa10Population: 1250, psa9Population: 840, totalPopulation: 2090 },
        recalculated: false,
        transactionAuthority: false
      }
    };
  }
  if (path === "/api/v1/lifecycle") {
    return { meta, data: { kind: "lifecycle", items: [], sourceOfTruth: "SQLite", transactionAuthority: false } };
  }
  if (path === "/api/v1/alerts") {
    return { meta, data: { kind: "alerts", items: [], sourceOfTruth: "SQLite", transactionAuthority: false } };
  }
  if (path === "/api/v1/entitlements") {
    return {
      meta,
      data: {
        kind: "entitlements",
        readOnly: true,
        transactionAuthority: false,
        current: {
          code: "PRIVATE_BETA",
          name: "Early Access",
          accessState: "ACTIVE",
          entitlementSource: "SERVER",
          paidPlanActive: false
        },
        usage: {
          completedEvaluations: 1,
          inProgressReservations: 0,
          admissionUsage: 1,
          monthlyEvaluationLimit: null,
          remainingEvaluations: null
        },
        plannedCommercialPlans: []
      }
    };
  }
  return { meta, data: { kind: "qa-fixture", path, transactionAuthority: false } };
}

function fail(message) {
  throw new Error(message);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"]
});
const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(String(error?.message || error)));

try {
  await page.route("**/api/v1/**", route => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(fixture(route.request()))
  }));

  await page.goto("http://goflipforge.com:4173/app/customer/#/dashboard", {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.waitForSelector("#main-content [data-commercial-dashboard-v2]", { timeout: 10000 });

  const baseline = await page.evaluate(() => {
    window.__ffCustomerPerformanceDocumentMarker = `document-${Date.now()}-${Math.random()}`;
    const assetEntries = performance.getEntriesByType("resource").filter(entry => /\.(?:js|css)(?:\?|$)/i.test(entry.name)).length;
    return {
      marker: window.__ffCustomerPerformanceDocumentMarker,
      timeOrigin: performance.timeOrigin,
      assetEntries
    };
  });

  async function assertSameDocument(label) {
    const state = await page.evaluate(() => ({
      marker: window.__ffCustomerPerformanceDocumentMarker || "",
      timeOrigin: performance.timeOrigin,
      assetEntries: performance.getEntriesByType("resource").filter(entry => /\.(?:js|css)(?:\?|$)/i.test(entry.name)).length
    }));
    if (state.marker !== baseline.marker) fail(`${label}: customer navigation replaced the document`);
    if (state.timeOrigin !== baseline.timeOrigin) fail(`${label}: customer navigation reset performance.timeOrigin`);
    if (state.assetEntries !== baseline.assetEntries) fail(`${label}: customer navigation reloaded JS/CSS assets (${baseline.assetEntries} -> ${state.assetEntries})`);
  }

  async function navigate(route, selector) {
    const started = Date.now();
    const routeLink = page.locator(`.sidebar a[data-route="${route}"]`).first();
    await routeLink.click();
    await page.waitForFunction(expected => window.location.hash === `#/${expected}`, route, { timeout: 10000 });
    await page.waitForSelector(selector, { timeout: 10000 });
    const elapsedMs = Date.now() - started;
    if (elapsedMs > MAX_LOCAL_ROUTE_MS) fail(`${route}: local route transition took ${elapsedMs}ms (budget ${MAX_LOCAL_ROUTE_MS}ms)`);
    await assertSameDocument(route);
    return elapsedMs;
  }

  const timings = {};
  timings.decisionIntelligenceMs = await navigate("decision-intelligence", '.ff-di-page[data-decision-intelligence-source="server"]');
  timings.savedDecisionsMs = await navigate("opportunities", "#main-content .customer-intelligence-page");
  timings.outcomeIntelligenceMs = await navigate("tracking", "#main-content .customer-lifecycle-page");
  timings.accountMs = await navigate("account", "#main-content .customer-entitlements-page");
  timings.dashboardMs = await navigate("dashboard", "#main-content [data-commercial-dashboard-v2]");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-nav-toggle]").click();
  await page.waitForFunction(() => document.querySelector(".app-shell")?.dataset.navOpen === "true", null, { timeout: 3000 });

  const sameRouteStarted = Date.now();
  await page.locator('.primary-nav a[data-route="dashboard"]').click();
  await page.waitForFunction(() => document.querySelector(".app-shell")?.dataset.navOpen === "false", null, { timeout: MAX_DRAWER_CLOSE_MS });
  timings.sameRouteDrawerCloseMs = Date.now() - sameRouteStarted;
  await assertSameDocument("mobile same-route Dashboard tap");

  const finalState = await page.evaluate(() => ({
    hash: window.location.hash,
    navOpen: document.querySelector(".app-shell")?.dataset.navOpen || "",
    marker: window.__ffCustomerPerformanceDocumentMarker || "",
    timeOrigin: performance.timeOrigin
  }));
  if (finalState.hash !== "#/dashboard") fail(`Expected final Dashboard route, got ${finalState.hash}`);
  if (finalState.navOpen !== "false") fail("Mobile drawer stayed open after tapping the active Dashboard route");

  const seriousErrors = errors.filter(message => /SyntaxError|Unexpected token|Unexpected identifier/i.test(message));
  if (seriousErrors.length) fail(`Browser syntax errors: ${seriousErrors.join(" | ")}`);

  console.log("Full customer connected-navigation performance audit passed");
  console.log(JSON.stringify({ baseline, timings, finalState }, null, 2));
} finally {
  await browser.close();
}
