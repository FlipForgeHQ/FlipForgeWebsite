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

const expectedContent = {
  dashboard: /\bDashboard\b/i,
  "market-view": /\bMarket View\b/i,
  discover: /\bDiscover\b/i,
  "forge-heat": /\bForge Heat\b/i,
  evaluate: /\bEvaluate\b/i,
  opportunities: /\bOpportunities\b/i,
  tracking: /\bTracking\b/i,
  portfolio: /\bPortfolio\b/i,
  alerts: /\bAlerts\b/i,
  "beta-start": /Private Beta Guide|Getting Started/i,
  "decision-intelligence": /Decision Intelligence|No saved decisions yet/i,
  compare: /Direct comparison|\bCompare\b/i,
  "psa-advisor": /PSA Advisor/i,
  evidence: /Evidence readiness|\bEvidence\b/i,
  sell: /Exit Review|\bSell\b/i,
  export: /Audit Export|\bExport\b/i,
  account: /\bAccount\b/i
};

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
  await page.waitForTimeout(450);

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
      text,
      textLength: text.length
    };
  }, route);

  const failures = [];
  if (result.hash !== `#/${route}`) failures.push(`hash stayed at ${result.hash || "(empty)"}`);
  if (result.navOpen !== "false") failures.push(`mobile navigation stayed open (${result.navOpen})`);
  if (result.ariaCurrent !== "page") failures.push("active navigation item is not marked aria-current=page");
  if (!result.heading) failures.push("route rendered without a visible title or empty-state heading");
  if (result.textLength < 20) failures.push(`route rendered too little content (${result.textLength} chars)`);
  if (!expectedContent[route]?.test(result.text)) {
    failures.push(`route-specific content is missing; rendered heading: ${result.heading || "(none)"}`);
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
  await page.route("**/staging-route-hook.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "(() => {})();" }));

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
