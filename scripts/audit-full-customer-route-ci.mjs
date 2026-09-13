import { chromium } from "playwright";

const proofId = "customer-cdi-route-proof";
const proofItem = {
  id: proofId,
  platform: "EBAY",
  recommendation: "VERIFY",
  title: "2018 Topps Chrome Shohei Ohtani PSA 10 Refractor",
  cardIdentity: "2018 Topps Chrome Shohei Ohtani PSA 10 Refractor",
  ask: 525,
  supportedValue: 500,
  confidence: 72,
  liquidity: 81,
  risk: 38,
  rank: 84,
  mappingState: "CONFIRMED",
  changeSummary: "New exact completed-sale evidence or a material price change requires a fresh evaluation.",
  workflowStatus: "EVIDENCE_REVIEW_REQUIRED",
  authorityBoundary: "Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority.",
  observedAt: "2026-09-13T13:30:00Z",
  evidence: { acceptedSales: 3, averagePrice: 500, latestSaleDate: "2026-09-12" }
};

function authorityMeta(correlationId) {
  return {
    contractVersion: "1.0",
    engineVersion: "full-customer-route-proof",
    authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence",
    correlationId,
    generatedAt: "2026-09-13T13:30:00Z",
    evidenceFreshness: "CURRENT",
    limitations: ["Synthetic browser route fixture only."]
  };
}

function apiFixture(request) {
  const pathname = new URL(request.url()).pathname;
  const correlationId = request.headers()["x-correlation-id"] || "full-customer-route-proof";
  const meta = authorityMeta(correlationId);

  if (pathname === "/api/v1/health") {
    return {
      meta: { contractVersion: "1.0", correlationId },
      data: {
        status: "configured",
        bridgeEnabled: true,
        upstreamConfigured: true,
        authenticationRequired: true,
        tenantMembershipRequired: true
      }
    };
  }
  if (pathname === "/api/v1/dashboard") {
    return { meta, data: { metrics: { trackedOpportunities: 1, evidenceReady: 1, populationContextAvailable: 1, needsVerification: 0 } } };
  }
  if (pathname === "/api/v1/opportunities") {
    return { meta, data: { kind: "opportunities", items: [proofItem] } };
  }
  if (pathname === `/api/v1/opportunities/${proofId}`) {
    return { meta, data: { kind: "opportunity", opportunity: proofItem } };
  }
  if (pathname === `/api/v1/evidence/${proofId}`) {
    return {
      meta,
      data: {
        kind: "evidence",
        opportunityId: proofId,
        cardIdentity: proofItem.cardIdentity,
        acceptedExactCompletedSales: 3,
        visibleButAuthorityIneligible: 2,
        linkedEvidence: [
          { authorityEligible: true, salePrice: 500 },
          { authorityEligible: true, salePrice: 510 },
          { authorityEligible: true, salePrice: 490 },
          { authorityEligible: false, rejectionReason: "Wrong parallel / variation" },
          { authorityEligible: false, rejectionReason: "Not a completed sale" }
        ]
      }
    };
  }
  if (pathname === `/api/v1/psa-advisor/${proofId}`) {
    return {
      meta,
      data: {
        kind: "psa-advisor",
        opportunityId: proofId,
        guidanceStatus: "CONTEXT_AVAILABLE",
        populationContext: { available: true, psa10Population: 1250, psa9Population: 840, totalPopulation: 2090 },
        recalculated: false
      }
    };
  }
  return { meta, data: { kind: "qa-fixture", path: pathname } };
}

const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"]
});
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(String(error?.message || error)));

const fail = message => { throw new Error(message); };

try {
  await page.route("**/api/v1/**", route => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(apiFixture(route.request()))
  }));

  await page.goto("http://goflipforge.com:4173/app/customer/#/dashboard", {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => ({
    pathname: window.location.pathname,
    chip: document.querySelector(".prototype-chip")?.textContent?.trim() || "",
    bannerExists: Boolean(document.querySelector(".prototype-banner")),
    htmlFullCustomer: document.documentElement.classList.contains("ff-full-customer-app"),
    bodyFullCustomer: document.body.classList.contains("ff-full-customer-app"),
    title: document.title,
    nav: [...document.querySelectorAll(".primary-nav a")]
      .filter(link => !link.hidden && link.getAttribute("aria-hidden") !== "true")
      .map(link => String(link.textContent || "").replace(/\s+/g, " ").trim())
  }));

  if (state.pathname !== "/app/customer/") fail(`Expected customer pathname, got ${state.pathname}`);
  if (state.chip !== "CUSTOMER APP") fail(`Expected CUSTOMER APP, got ${state.chip || "<empty>"}`);
  if (state.bannerExists) fail("Customer route rendered a beta banner element");
  if (!state.htmlFullCustomer || !state.bodyFullCustomer) fail("Customer route is missing full-customer root state");
  if (!/Customer App/i.test(state.title)) fail(`Customer document title is wrong: ${state.title}`);
  if (!state.nav.some(value => /Decision Intelligence/i.test(value))) fail("Decision Intelligence is not visible");
  if (!state.nav.some(value => /Outcome Intelligence/i.test(value))) fail("Outcome Intelligence is not visible");

  // The previous assurance only proved that the menu item existed. Exercise the
  // real customer route and require the rendered seven-layer CDI projection.
  await page.locator('.primary-nav a[data-route="decision-intelligence"]').click();
  await page.waitForFunction(() => window.location.hash === "#/decision-intelligence", null, { timeout: 10000 });
  await page.waitForSelector('.ff-di-page[data-decision-intelligence-source="server"]', { timeout: 10000 });
  await page.waitForSelector("[data-ff-di-v2-command]", { timeout: 10000 });
  await page.waitForSelector("[data-ff-decision-card-evidence]", { timeout: 10000 });

  const decisionState = await page.evaluate(() => {
    const root = document.querySelector('.ff-di-page[data-decision-intelligence-source="server"]');
    const panel = document.querySelector("[data-ff-decision-card-evidence]");
    return {
      hash: window.location.hash,
      chip: document.querySelector(".prototype-chip")?.textContent?.trim() || "",
      sourceAlias: root?.getAttribute("data-ff-decision-intelligence-source") || "",
      layerCount: panel?.querySelectorAll("[data-cdi-layer]").length || 0,
      layers: [...(panel?.querySelectorAll("[data-cdi-layer] strong") || [])]
        .map(node => String(node.textContent || "").trim()),
      betaLearningLoaded: Boolean(
        document.querySelector('script[data-ff-beta-cdi-learning],link[data-ff-beta-cdi-learning]')
      )
    };
  });

  const expectedLayers = [
    "Identity Intelligence",
    "Evidence Intelligence",
    "Economic Intelligence",
    "Risk + Uncertainty Intelligence",
    "Decision Intelligence",
    "Decision Traceback / Decision Receipt",
    "Outcome Intelligence"
  ];

  if (decisionState.hash !== "#/decision-intelligence") fail(`Decision Intelligence route moved to ${decisionState.hash}`);
  if (decisionState.chip !== "CUSTOMER APP") fail(`Decision Intelligence lost customer identity: ${decisionState.chip}`);
  if (decisionState.sourceAlias !== "server") fail(`Seven-layer source marker was not bridged: ${decisionState.sourceAlias || "<missing>"}`);
  if (decisionState.layerCount !== 7) fail(`Expected 7 CDI layers, got ${decisionState.layerCount}`);
  for (const label of expectedLayers) {
    if (!decisionState.layers.includes(label)) fail(`Missing CDI layer: ${label}`);
  }
  if (decisionState.betaLearningLoaded) fail("Full customer route loaded beta-only CDI learning assets");

  // Simulate a late legacy renderer reclaiming #main-content. Route ownership must
  // repair the current Decision Intelligence route instead of leaving stale UI.
  await page.evaluate(() => {
    const main = document.querySelector("#main-content");
    if (main) main.innerHTML = '<div class="page"><h1>Legacy placeholder</h1></div>';
  });
  await page.waitForSelector('.ff-di-page[data-decision-intelligence-source="server"]', { timeout: 10000 });
  await page.waitForSelector("[data-ff-decision-card-evidence]", { timeout: 10000 });

  // Reproduce the auth-return bug after route navigation. Older feature modules may
  // still emit an /app return; the production redirect must preserve /app/customer/.
  await page.evaluate(() => {
    window.location.hash = "#/dashboard";
    const link = document.createElement("a");
    link.id = "ff-customer-auth-regression";
    link.href = "/production-auth.html?return=%2Fapp%2F%23%2Fdashboard";
    link.textContent = "Sign in securely";
    document.body.appendChild(link);
  });

  await Promise.all([
    page.waitForURL(url => url.pathname === "/production-auth.html", { timeout: 10000 }),
    page.click("#ff-customer-auth-regression")
  ]);

  const authReturn = await page.evaluate(() => new URLSearchParams(window.location.search).get("return"));
  if (authReturn !== "/app/customer/#/dashboard") {
    fail(`Customer sign-in fell back to beta: ${authReturn || "<missing>"}`);
  }

  const seriousErrors = pageErrors.filter(message => /SyntaxError|Unexpected token|Unexpected identifier/i.test(message));
  if (seriousErrors.length) fail(`Browser syntax errors: ${seriousErrors.join(" | ")}`);

  console.log("Full customer browser audit passed");
  console.log(JSON.stringify({ state, decisionState, authReturn }, null, 2));
} finally {
  await browser.close();
}
