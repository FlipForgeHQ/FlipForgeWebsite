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
  if (pathname === "/api/v1/entitlements") {
    return {
      meta,
      data: {
        kind: "entitlements",
        readOnly: true,
        transactionAuthority: false,
        current: {
          code: "PRIVATE_BETA",
          name: "Private Beta",
          accessState: "Private Beta Evaluation Allowance Reached",
          entitlementSource: "Beta Invitation",
          paidPlanActive: false
        },
        usage: {
          completedEvaluations: 23,
          inProgressReservations: 0,
          admissionUsage: 23,
          monthlyEvaluationLimit: 5,
          remainingEvaluations: 0
        },
        plannedCommercialPlans: [],
        checkoutAvailable: false,
        customerCheckoutAllowed: false,
        billingProviderConnected: false
      }
    };
  }
  if (pathname === "/api/v1/lifecycle") {
    return { meta, data: { kind: "lifecycle", items: [] } };
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
  // The full customer account must be correct at render source. Disable the late
  // customer text normalizer here so the regression test cannot pass by masking
  // beta-era account copy after it has already rendered.
  await page.route("**/customer-surface-normalization-v1.js", route => route.fulfill({
    status: 200,
    contentType: "application/javascript; charset=utf-8",
    body: "window.__ffCustomerSurfaceNormalizationV1 = false;"
  }));

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
    portalArchitecture: document.documentElement.dataset.ffPortalArchitecture || "",
    nav: [...document.querySelectorAll(".primary-nav > a[data-route]")]
      .filter(link => !link.hidden && link.getAttribute("aria-hidden") !== "true" && getComputedStyle(link).display !== "none")
      .map(link => ({
        route: String(link.dataset.route || ""),
        label: String(link.textContent || "").replace(/\s+/g, " ").trim()
      }))
  }));

  if (state.pathname !== "/app/customer/") fail(`Expected customer pathname, got ${state.pathname}`);
  if (state.chip !== "CUSTOMER APP") fail(`Expected CUSTOMER APP, got ${state.chip || "<empty>"}`);
  if (state.bannerExists) fail("Customer route rendered a beta banner element");
  if (!state.htmlFullCustomer || !state.bodyFullCustomer) fail("Customer route is missing full-customer root state");
  if (!/Customer App/i.test(state.title)) fail(`Customer document title is wrong: ${state.title}`);
  if (state.portalArchitecture !== "v1") fail(`Customer Portal architecture did not activate: ${state.portalArchitecture || "<missing>"}`);
  const expectedPrimary = [
    ["dashboard", "Home"],
    ["discover", "Discover"],
    ["opportunities", "Decisions"],
    ["tracking", "Monitor"],
    ["portfolio", "Portfolio"]
  ];
  if (JSON.stringify(state.nav) !== JSON.stringify(expectedPrimary.map(([route, label]) => ({ route, label })))) {
    fail(`Customer Portal primary navigation is not the five-destination architecture: ${JSON.stringify(state.nav)}`);
  }

  // Decision Intelligence remains a required governed route, but it is no longer
  // a permanent sidebar destination in the compressed Customer Portal.
  await page.evaluate(() => { window.location.hash = "#/decision-intelligence"; });
  await page.waitForFunction(() => window.location.hash === "#/decision-intelligence", null, { timeout: 10000 });
  await page.waitForSelector('.ff-di-page[data-decision-intelligence-source="server"]', { timeout: 10000 });
  await page.waitForSelector("[data-ff-di-v2-command]", { timeout: 10000 });
  await page.waitForSelector("section[data-ff-decision-card-evidence]", { timeout: 10000 });

  const decisionState = await page.evaluate(() => {
    const root = document.querySelector('.ff-di-page[data-decision-intelligence-source="server"]');
    const panel = document.querySelector("section[data-ff-decision-card-evidence]");
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

  // A saved decision is the central portal object. Verify the exact record ID is
  // carried through every contextual Decision Workspace view.
  await page.evaluate(id => { window.location.hash = `#/opportunities/${id}`; }, proofId);
  await page.waitForSelector("#main-content .ff-decision-workspace-nav", { timeout: 10000 });
  const workspaceState = await page.evaluate(id => {
    const nav = document.querySelector("#main-content .ff-decision-workspace-nav");
    return {
      labels: [...(nav?.querySelectorAll("a") || [])].map(link => String(link.textContent || "").trim()),
      hrefs: [...(nav?.querySelectorAll("a") || [])].map(link => link.getAttribute("href") || ""),
      primaryActive: [...document.querySelectorAll('.primary-nav > a[aria-current="page"]')].map(link => String(link.dataset.route || ""))
    };
  }, proofId);
  const expectedWorkspaceLabels = ["Decision", "Evidence", "Grade", "Monitor", "Exit", "Receipt"];
  const encodedProofId = encodeURIComponent(proofId);
  const expectedWorkspaceHrefs = [
    `#/opportunities/${encodedProofId}`,
    `#/evidence/${encodedProofId}`,
    `#/psa-advisor/${encodedProofId}`,
    `#/tracking/${encodedProofId}`,
    `#/sell/${encodedProofId}`,
    `#/export/${encodedProofId}`
  ];
  if (JSON.stringify(workspaceState.labels) !== JSON.stringify(expectedWorkspaceLabels)) {
    fail(`Decision Workspace labels are incomplete: ${JSON.stringify(workspaceState.labels)}`);
  }
  if (JSON.stringify(workspaceState.hrefs) !== JSON.stringify(expectedWorkspaceHrefs)) {
    fail(`Decision Workspace did not preserve exact saved-decision identity: ${JSON.stringify(workspaceState.hrefs)}`);
  }
  if (JSON.stringify(workspaceState.primaryActive) !== JSON.stringify(["opportunities"])) {
    fail(`Saved decision did not map to Decisions primary navigation: ${JSON.stringify(workspaceState.primaryActive)}`);
  }

  // Outcome Intelligence must be a real customer route, not merely a navigation label.
  await page.locator('.primary-nav > a[data-route="tracking"]').click();
  await page.waitForFunction(() => window.location.hash === "#/tracking", null, { timeout: 10000 });
  await page.waitForSelector("#main-content .customer-lifecycle-page", { timeout: 10000 });
  const outcomeState = await page.evaluate(() => ({
    hash: window.location.hash,
    chip: document.querySelector(".prototype-chip")?.textContent?.trim() || "",
    pageVisible: Boolean(document.querySelector("#main-content .customer-lifecycle-page"))
  }));
  if (!outcomeState.pageVisible) fail("Outcome Intelligence did not render its customer lifecycle page");
  if (outcomeState.chip !== "CUSTOMER APP") fail(`Outcome Intelligence lost customer identity: ${outcomeState.chip}`);

  // Reproduce the exact internal beta-language leak seen on the production account page.
  // The normalizer is intentionally disabled above: this section proves the account
  // renderer itself emits customer-safe language while preserving server authority data.
  await page.locator(".profile-button").click();
  await page.waitForFunction(() => window.location.hash === "#/account", null, { timeout: 10000 });
  await page.waitForSelector("#main-content .customer-entitlements-page", { timeout: 10000 });
  await page.waitForTimeout(400);
  const accountState = await page.evaluate(() => ({
    text: String(document.querySelector("#main-content")?.innerText || "").replace(/\s+/g, " ").trim(),
    sidebar: String(document.querySelector(".plan-card")?.innerText || "").replace(/\s+/g, " ").trim(),
    chip: document.querySelector(".prototype-chip")?.textContent?.trim() || "",
    normalizerLoaded: window.__ffCustomerSurfaceNormalizationV1 === true
  }));
  if (accountState.normalizerLoaded) fail("Full customer account regression unexpectedly depended on the surface normalizer");
  if (accountState.chip !== "CUSTOMER APP") fail(`Account route lost customer identity: ${accountState.chip}`);
  if (/private[ -]beta/i.test(`${accountState.text} ${accountState.sidebar}`)) fail(`Private-beta language leaked into customer account: ${accountState.text}`);
  if (/Beta Invitation/i.test(accountState.text)) fail(`Beta Invitation leaked into customer account: ${accountState.text}`);
  if (/Beta Complete/i.test(accountState.text)) fail(`Internal Beta Complete language leaked into customer account: ${accountState.text}`);
  if (!/Early Access/i.test(`${accountState.text} ${accountState.sidebar}`)) fail(`Customer-safe access label is missing: ${accountState.text}`);
  if (!/Evaluation allowance reached/i.test(accountState.text)) fail(`Customer-safe allowance state is missing: ${accountState.text}`);
  if (!/Invitation/i.test(accountState.text)) fail(`Customer-safe entitlement source is missing: ${accountState.text}`);
  if (!/23\s*\/\s*5/.test(accountState.sidebar)) fail(`Server-owned usage was not preserved in the sidebar: ${accountState.sidebar}`);
  if (!/Paid plan\s+No/i.test(accountState.text)) fail(`Server-owned paid-plan state was not preserved: ${accountState.text}`);
  if (!/Production checkout\s+Not available yet/i.test(accountState.text)) fail(`Customer checkout boundary is not explicit: ${accountState.text}`);

  await page.locator('.primary-nav a[data-route="dashboard"]').click();
  await page.waitForFunction(() => window.location.hash === "#/dashboard", null, { timeout: 10000 });
  await page.waitForTimeout(600);

  await page.evaluate(() => {
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
  console.log(JSON.stringify({ state, decisionState, workspaceState, outcomeState, accountState, authReturn }, null, 2));
} finally {
  await browser.close();
}