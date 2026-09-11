import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";

const routeSpecs = [
  { route: "dashboard", mode: "primary" },
  { route: "discover", mode: "primary" },
  { route: "opportunities", mode: "primary" },
  { route: "tracking", mode: "primary" },
  { route: "account", mode: "account" }
];

const expectedHeading = {
  dashboard: /^What card are you considering\?|^Dashboard$/i,
  discover: /^Discover$|^Evaluate/i,
  opportunities: /^Saved Decisions$/i,
  tracking: /^Tracking$/i,
  account: /^Plan & Usage$|^Account$/i
};

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
    generatedAt: "2026-09-11T16:30:00Z",
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

async function auditOpenDrawerLayout(page) {
  await ensureMenuOpen(page);
  await page.waitForTimeout(220);

  const snapshot = await page.evaluate(() => {
    const sidebar = document.querySelector(".sidebar");
    const brandBlock = document.querySelector(".brand-block");
    const footer = document.querySelector(".sidebar-footer");
    const guide = document.querySelector(".ff-guide-launcher, .ff-guide-panel");
    const advanced = document.querySelector(".ff-advanced-nav");
    const visibleLinks = [...document.querySelectorAll(".primary-nav > a[data-route]")]
      .filter(link => !link.hidden && getComputedStyle(link).display !== "none");

    return {
      viewportWidth: window.innerWidth,
      sidebarWidth: sidebar?.getBoundingClientRect().width || 0,
      brandHeight: brandBlock?.getBoundingClientRect().height || 0,
      footerDisplay: footer ? getComputedStyle(footer).display : "missing",
      guideDisplay: guide ? getComputedStyle(guide).display : "missing",
      advancedDisplay: advanced ? getComputedStyle(advanced).display : "missing",
      routes: visibleLinks.map(link => link.getAttribute("data-route")),
      links: visibleLinks.map(link => {
        const style = getComputedStyle(link);
        const pseudo = getComputedStyle(link, "::after");
        return {
          route: link.getAttribute("data-route"),
          display: style.display,
          height: link.getBoundingClientRect().height,
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
  if (!snapshot.brandHeight || snapshot.brandHeight > 140) {
    failures.push(`brand block is too tall (${snapshot.brandHeight}px)`);
  }
  if (snapshot.footerDisplay !== "none") {
    failures.push(`mobile Plan & Usage footer still consumes drawer space (${snapshot.footerDisplay})`);
  }
  if (snapshot.guideDisplay !== "missing" && snapshot.guideDisplay !== "none") {
    failures.push(`Guided Mode floats above an open drawer (${snapshot.guideDisplay})`);
  }
  if (snapshot.advancedDisplay !== "none") {
    failures.push(`advanced tool navigation is exposed in beta (${snapshot.advancedDisplay})`);
  }

  const expectedRoutes = ["dashboard", "discover", "opportunities", "tracking", "account"];
  if (JSON.stringify(snapshot.routes) !== JSON.stringify(expectedRoutes)) {
    failures.push(`visible mobile routes were ${snapshot.routes.join(", ")}; expected ${expectedRoutes.join(", ")}`);
  }

  for (const link of snapshot.links) {
    if (link.display !== "grid") failures.push(`${link.route} is ${link.display}, expected grid`);
    if (link.height < 44 || link.height > 72) failures.push(`${link.route} row height is ${link.height}px`);
    if (link.pseudoDisplay !== "none" && link.pseudoContent !== "none") {
      failures.push(`${link.route} desktop description is still visible`);
    }
  }

  await page.locator("[data-nav-close]").click();
  await page.waitForFunction(() => document.querySelector(".app-shell")?.dataset.navOpen === "false");
  return { route: "drawer-layout", heading: "Simple beta drawer", failures };
}

async function clickRoute(page, spec) {
  const { route, mode } = spec;
  await ensureMenuOpen(page);

  const link = mode === "account"
    ? page.locator('.primary-nav > a[data-route="account"], .primary-nav > a[href="#/account"]').first()
    : page.locator(`.primary-nav > a[data-route="${route}"][data-ff-customer-core]`).first();

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