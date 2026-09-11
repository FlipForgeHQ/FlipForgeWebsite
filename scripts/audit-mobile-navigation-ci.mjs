import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";

const routeSpecs = [
  { route: "dashboard", mode: "primary" },
  { route: "discover", mode: "primary" },
  { route: "decision-intelligence", mode: "primary" },
  { route: "opportunities", mode: "primary" },
  { route: "tracking", mode: "primary" },
  { route: "market-view", mode: "more" },
  { route: "forge-heat", mode: "more" },
  { route: "portfolio", mode: "more" },
  { route: "alerts", mode: "more" },
  { route: "compare", mode: "more" },
  { route: "psa-advisor", mode: "more" },
  { route: "evidence", mode: "more" },
  { route: "sell", mode: "more" },
  { route: "export", mode: "more" },
  { route: "account", mode: "account" }
];

const expectedHeading = {
  dashboard: /^Dashboard$/i,
  "market-view": /^Market View$/i,
  discover: /^Discover$/i,
  "forge-heat": /^Forge Heat/i,
  opportunities: /^Saved Decisions$/i,
  tracking: /^Tracking$/i,
  portfolio: /^Portfolio$/i,
  alerts: /^Alerts$/i,
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
    sourceOfTruth: "SQLite",
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

async function ensureMoreOpen(page) {
  const details = page.locator(".ff-advanced-nav");
  await details.waitFor({ state: "visible", timeout: 5000 });
  if (!(await details.evaluate(node => node.open))) {
    await details.locator("summary").click();
  }
  await page.waitForFunction(() => document.querySelector(".ff-advanced-nav")?.open === true);
}

async function auditOpenDrawerLayout(page) {
  await ensureMenuOpen(page);
  await page.waitForTimeout(180);

  const snapshot = await page.evaluate(() => {
    const sidebar = document.querySelector(".sidebar");
    const brandBlock = document.querySelector(".brand-block");
    const footer = document.querySelector(".sidebar-footer");
    const links = [...document.querySelectorAll(".primary-nav > a")].filter(link => !link.hidden && getComputedStyle(link).display !== "none").slice(0, 8);
    const guide = document.querySelector(".ff-guide-launcher, .ff-guide-panel");
    const brandName = document.querySelector(".brand-name");
    const more = document.querySelector(".ff-advanced-nav");
    const moreSummary = more?.querySelector("summary");
    const moreLinks = more ? [...more.querySelectorAll('a[href^="#/"]')].filter(link => !link.hidden) : [];

    return {
      viewportWidth: window.innerWidth,
      sidebarWidth: sidebar?.getBoundingClientRect().width || 0,
      brandHeight: brandBlock?.getBoundingClientRect().height || 0,
      footerDisplay: footer ? getComputedStyle(footer).display : "missing",
      guideDisplay: guide ? getComputedStyle(guide).display : "missing",
      brandText: String(brandName?.textContent || "").trim(),
      moreDisplay: more ? getComputedStyle(more).display : "missing",
      moreSummary: String(moreSummary?.textContent || "").trim(),
      moreLinkCount: moreLinks.length,
      links: links.map(link => {
        const style = getComputedStyle(link);
        const icon = link.querySelector(":scope > span:first-child");
        const iconStyle = icon ? getComputedStyle(icon) : null;
        const pseudo = getComputedStyle(link, "::after");
        return {
          route: link.getAttribute("data-route"),
          display: style.display,
          height: link.getBoundingClientRect().height,
          whiteSpace: style.whiteSpace,
          overflow: style.overflow,
          iconPosition: iconStyle?.position || "missing",
          pseudoDisplay: pseudo.display,
          pseudoContent: pseudo.content
        };
      })
    };
  });

  const failures = [];
  if (!snapshot.sidebarWidth || snapshot.sidebarWidth > Math.min(snapshot.viewportWidth * 0.9, 350)) {
    failures.push(`drawer width ${snapshot.sidebarWidth}px is too wide for ${snapshot.viewportWidth}px viewport`);
  }
  if (!snapshot.brandHeight || snapshot.brandHeight > 120) {
    failures.push(`brand block is too tall (${snapshot.brandHeight}px)`);
  }
  if (snapshot.footerDisplay !== "none") {
    failures.push(`mobile Plan & Usage footer still consumes drawer space (${snapshot.footerDisplay})`);
  }
  if (snapshot.guideDisplay !== "missing" && snapshot.guideDisplay !== "none") {
    failures.push(`Guided Mode floats above an open drawer (${snapshot.guideDisplay})`);
  }
  if (snapshot.brandText !== "FLIPFORGE") {
    failures.push(`brand text contains duplicate trademark content (${snapshot.brandText || "empty"})`);
  }
  if (snapshot.moreDisplay === "missing" || snapshot.moreDisplay === "none") {
    failures.push("More tools group is not visible in the customer mobile drawer");
  }
  if (!/^More tools(?:\s|$)/i.test(snapshot.moreSummary)) {
    failures.push(`More tools summary is mislabeled (${snapshot.moreSummary || "empty"})`);
  }
  if (snapshot.moreLinkCount < 9) {
    failures.push(`More tools exposes only ${snapshot.moreLinkCount} customer routes; expected at least 9 after Decision Intelligence promotion`);
  }

  for (const link of snapshot.links) {
    if (link.display !== "grid") failures.push(`${link.route} is ${link.display}, expected grid`);
    if (link.height < 44 || link.height > 54) failures.push(`${link.route} row height is ${link.height}px`);
    if (link.iconPosition !== "static") failures.push(`${link.route} icon is ${link.iconPosition}, expected static`);
    if (link.pseudoDisplay !== "none" && link.pseudoContent !== "none") failures.push(`${link.route} desktop description is still visible`);
    if (link.whiteSpace !== "nowrap") failures.push(`${link.route} can wrap (${link.whiteSpace})`);
  }

  await page.locator("[data-nav-close]").click();
  await page.waitForFunction(() => document.querySelector(".app-shell")?.dataset.navOpen === "false");
  return { route: "drawer-layout", heading: "Mobile drawer geometry + More tools", failures };
}

async function clickRoute(page, spec) {
  const { route, mode } = spec;
  await ensureMenuOpen(page);

  let link;
  if (mode === "more") {
    await ensureMoreOpen(page);
    link = page.locator(`.ff-advanced-nav a[href="#/${route}"]`).first();
  } else if (mode === "account") {
    link = page.locator(`.primary-nav > a[data-route="account"], .primary-nav > a[href="#/account"]`).first();
  } else {
    link = page.locator(`.primary-nav > a[data-route="${route}"][data-ff-customer-core]`).first();
  }

  await link.waitFor({ state: "visible", timeout: 5000 });
  await link.click();

  await page.waitForFunction(expected => window.location.hash === `#/${expected}`, route, { timeout: 7000 });
  await page.waitForSelector("#main-content", { state: "attached", timeout: 5000 });
  await page.waitForTimeout(650);

  const result = await page.evaluate(expected => {
    const shell = document.querySelector(".app-shell");
    const candidates = [...document.querySelectorAll(`.primary-nav a[href="#/${expected}"]`)];
    const active = candidates.find(link => link.getAttribute("aria-current") === "page") || candidates[0];
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
  await page.waitForTimeout(700);

  try {
    results.push(await auditOpenDrawerLayout(page));
  } catch (error) {
    results.push({ route: "drawer-layout", heading: "", failures: [String(error?.message || error)] });
  }

  for (const spec of routeSpecs) {
    console.log(`[mobile-nav-ci] ${spec.route} (${spec.mode})`);
    try {
      results.push(await clickRoute(page, spec));
    } catch (error) {
      results.push({ route: spec.route, heading: "", failures: [String(error?.message || error)] });
    }
  }
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter(result => result.failures.length);
console.log("\nFlipForge mobile customer navigation audit");
console.log(`Routes tested: ${results.length}`);
console.log(`Passed: ${results.length - failed.length}`);
console.log(`Failed: ${failed.length}`);

for (const result of results) {
  const status = result.failures.length ? "FAIL" : "PASS";
  console.log(`${status} | ${result.route}${result.heading ? ` | ${result.heading}` : ""}`);
  result.failures.forEach(failure => console.log(`  - ${failure}`));
}

if (failed.length) process.exit(1);