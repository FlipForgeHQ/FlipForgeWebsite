import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";

const routes = [
  "dashboard",
  "market-view",
  "discover",
  "forge-heat",
  "evaluate",
  "opportunities",
  "tracking",
  "portfolio",
  "alerts",
  "beta-start",
  "decision-intelligence",
  "compare",
  "psa-advisor",
  "evidence",
  "sell",
  "export",
  "account"
];

const expectedHeading = {
  dashboard: /^Dashboard$/i,
  "market-view": /^Market View$/i,
  discover: /^Discover$/i,
  "forge-heat": /^Forge Heat/i,
  evaluate: /^Evaluate/i,
  opportunities: /^Opportunities$/i,
  tracking: /^Tracking$/i,
  portfolio: /^Portfolio$/i,
  alerts: /^Alerts$/i,
  "beta-start": /^Private Beta Guide$|^Getting Started$/i,
  "decision-intelligence": /^Decision Intelligence|^No saved decisions yet\.?$/i,
  compare: /^Direct Comparison$|^Compare$/i,
  "psa-advisor": /^PSA Advisor$/i,
  evidence: /^Evidence readiness$|^Evidence Center$|^Evidence$/i,
  sell: /^Exit Review$|^Sell$/i,
  export: /^Audit Export$|^Decision Dossier$|^Export$/i,
  account: /^Plan & Usage$|^Account$/i
};

function emptyMarketView() {
  const coverage = horizonDays => ({ horizonDays, observed: 0, eligible: 0, coveragePct: 0 });
  return {
    kind: "market-view",
    marketViewVersion: "MARKET_VIEW_V1",
    readOnly: true,
    scope: {
      code: "SAVED_EVALUATED_UNIVERSE",
      label: "Your Market",
      marketWide: false,
      continuousMarketScannerActive: false
    },
    authority: {
      recommendationAuthority: "Smart Opportunity",
      marketViewRecommendationAuthority: false,
      clientComputed: false,
      transactionAuthority: false
    },
    transactionAuthority: false,
    summary: {
      evaluatedCards: 0,
      actionableSavedDecisions: 0,
      actionableSharePct: 0,
      positiveSupportedValueGap: 0,
      positiveGapSharePct: 0,
      freshWithin30Days: 0,
      freshnessPct: 0
    },
    decisionMix: { BUY: 0, WATCH: 0, VERIFY: 0, PASS: 0, OTHER: 0 },
    evidenceHealth: {
      strongEvidenceCards: 0,
      strongEvidencePct: 0,
      averageExactTrustedSales: 0,
      averageConfidence: 0,
      averageRisk: 0
    },
    valueContext: { profitOrRoi: false, topPositiveGap: [], medianPositiveGapPct: 0 },
    outcomeCoverage: { "7": coverage(7), "14": coverage(14), "30": coverage(30) },
    broaderMarket: {
      available: false,
      marketWideVolume: false,
      marketWideMomentum: false,
      marketPriceIndex: false,
      reason: "Not active in the QA fixture."
    }
  };
}

function lifecycleProjection(kind) {
  return {
    kind,
    configured: true,
    status: "READY",
    count: 0,
    dueCount: 0,
    totalCostBasisCents: 0,
    currentValueConfigured: false,
    transactionAuthority: false,
    notificationDeliveryConfigured: false,
    items: []
  };
}

function apiFixture(request) {
  const pathname = new URL(request.url()).pathname;
  const correlationId = request.headers()["x-correlation-id"] || "mobile-nav-qa";
  const meta = {
    contractVersion: "1.0",
    engineVersion: "mobile-nav-qa",
    authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence",
    correlationId,
    generatedAt: "2026-08-29T20:00:00Z",
    evidenceFreshness: "QA_FIXTURE",
    limitations: ["Synthetic navigation fixture only."]
  };

  if (pathname === "/api/v1/health") {
    return { meta, data: { status: "configured", bridgeEnabled: true, upstreamConfigured: true, authenticationRequired: true, tenantMembershipRequired: true } };
  }
  if (pathname === "/api/v1/dashboard") {
    return { meta, data: { metrics: { trackedOpportunities: 0, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 0 } } };
  }
  if (pathname === "/api/v1/opportunities") {
    return { meta, data: { kind: "opportunities", items: [] } };
  }
  if (pathname === "/api/v1/lifecycle") {
    return { meta, data: lifecycleProjection("lifecycle") };
  }
  if (pathname === "/api/v1/portfolio") {
    return { meta, data: lifecycleProjection("portfolio") };
  }
  if (pathname === "/api/v1/alerts") {
    return { meta, data: lifecycleProjection("alerts") };
  }
  if (pathname === "/api/v1/market-view") {
    return { meta, data: emptyMarketView() };
  }
  return { meta, data: { kind: "qa-fixture", path: pathname } };
}

async function stubIdentity(page) {
  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({
      getUser: () => null,
      getSnapshot: () => ({ authenticated: false, email: "", fullName: "", membershipActive: false, membershipConfigured: false })
    });`
  }));
  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: "(() => {})();"
  }));
}

async function ensureMenuOpen(page) {
  const shell = page.locator(".app-shell");
  if (await shell.getAttribute("data-nav-open") === "true") return;
  await page.locator("[data-nav-toggle]").click();
  await page.waitForFunction(() => document.querySelector(".app-shell")?.dataset.navOpen === "true");
}

async function openAdvancedIfNeeded(page, route) {
  const advanced = ["decision-intelligence", "compare", "psa-advisor", "evidence", "sell", "export"];
  if (!advanced.includes(route)) return;
  const details = page.locator(".ff-advanced-nav");
  if (!(await details.evaluate(node => node.open))) {
    await details.locator("summary").click();
  }
}

async function clickRoute(page, route) {
  await ensureMenuOpen(page);
  await openAdvancedIfNeeded(page, route);

  const link = page.locator(`[data-route="${route}"]`).first();
  await link.waitFor({ state: "visible", timeout: 5000 });
  await link.click();

  await page.waitForFunction(expected => window.location.hash === `#/${expected}`, route, { timeout: 7000 });
  await page.waitForSelector("#main-content", { state: "attached", timeout: 5000 });
  await page.waitForTimeout(650);

  const result = await page.evaluate(expected => {
    const shell = document.querySelector(".app-shell");
    const active = document.querySelector(`[data-route="${expected}"]`);
    const main = document.querySelector("#main-content");
    const heading = String(main?.querySelector("h1, h2, .ff-di-empty strong")?.textContent || "").trim();
    const text = String(main?.textContent || "").trim();
    return {
      hash: window.location.hash,
      navOpen: shell?.dataset.navOpen,
      ariaCurrent: active?.getAttribute("aria-current"),
      heading,
      textLength: text.length
    };
  }, route);

  const failures = [];
  if (result.hash !== `#/${route}`) failures.push(`hash stayed at ${result.hash || "(empty)"}`);
  if (result.navOpen !== "false") failures.push(`mobile navigation stayed open (${result.navOpen})`);
  if (result.ariaCurrent !== "page") failures.push("active navigation item is not marked aria-current=page");
  if (!result.heading) failures.push("route rendered without a visible title or empty-state heading");
  if (result.textLength < 20) failures.push(`route rendered too little content (${result.textLength} chars)`);
  if (!expectedHeading[route]?.test(result.heading)) {
    failures.push(`wrong route content rendered; heading was ${result.heading || "(none)"}`);
  }

  return { route, heading: result.heading, failures };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const results = [];

try {
  await stubIdentity(page);
  await page.route("**/api/v1/**", route => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(apiFixture(route.request()))
  }));

  await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded", timeout: 10_000 });
  await page.waitForSelector("#main-content", { state: "attached", timeout: 5000 });
  await page.waitForTimeout(500);

  for (const route of routes) {
    console.log(`[mobile-nav-ci] ${route}`);
    try {
      results.push(await clickRoute(page, route));
    } catch (error) {
      results.push({ route, heading: "", failures: [String(error?.message || error)] });
    }
  }
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter(result => result.failures.length);
console.log("\nFlipForge mobile navigation click audit");
console.log(`Routes tested: ${results.length}`);
console.log(`Passed: ${results.length - failed.length}`);
console.log(`Failed: ${failed.length}`);

for (const result of results) {
  const status = result.failures.length ? "FAIL" : "PASS";
  console.log(`${status} | ${result.route}${result.heading ? ` | ${result.heading}` : ""}`);
  result.failures.forEach(failure => console.log(`  - ${failure}`));
}

if (failed.length) process.exit(1);
