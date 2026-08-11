import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173";
const outputDir = path.resolve(process.cwd(), "qa-artifacts", "saas-layout");
const stressId = "EBAY-ext-visual-qa";
const stressTitle = "2018 Topps Chrome Shohei Ohtani #150 PSA 10 Refractor Extremely Long Visual QA Card Identity Variant";

const viewports = [
  ["desktop", 1440, 1000],
  ["tablet", 900, 1100],
  ["mobile", 390, 844]
];

const routes = [
  "dashboard", "beta-start", "discover", "evaluate", "opportunities",
  "opportunities/visual-qa-card", "tracking", "compare", "psa-advisor",
  "evidence", "portfolio", "sell", "alerts", "export", "account"
];

const stressItem = {
  id: stressId,
  platform: "EBAY",
  recommendation: "VERIFY",
  title: stressTitle,
  cardIdentity: stressTitle,
  ask: 1961,
  supportedValue: 0,
  confidence: 20,
  liquidity: 35,
  risk: 90,
  rank: 14,
  mappingState: "NOT_CONFIRMED_PROVIDER_IDENTITY_REQUIRES_MANUAL_REVIEW",
  statusMessage: "No confirmed provider context is saved for this exact card identity and manual verification remains required before relying on provider-specific context.",
  changeSummary: "NEW_LISTING_WITH_EXCEPTIONALLY_LONG_MACHINE_READABLE_CONTEXT",
  workflowStatus: "NEEDS_VALUE_EVIDENCE_AND_PROVIDER_IDENTITY_CONFIRMATION",
  authorityBoundary: "Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority, and existing PSA intelligence remains the sole grading-guidance authority.",
  observedAt: "2026-08-11T18:51:22.141693474Z",
  evidence: { acceptedSales: 0, averagePrice: 0, latestSaleDate: null }
};

function authorityMeta(correlationId) {
  return {
    contractVersion: "1.0",
    engineVersion: "visual-qa-fixture",
    authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence",
    correlationId,
    evidenceFreshness: "MIXED_DISPLAY_ONLY_PROVIDER_CONFIRMATION_PENDING_WITH_LONG_STATE",
    limitations: ["Synthetic browser-layout fixture only."]
  };
}

function apiFixture(request) {
  const pathname = new URL(request.url()).pathname;
  const correlationId = request.headers()["x-correlation-id"] || "visual-qa";
  if (pathname === "/api/v1/health") return { meta: { contractVersion: "1.0", correlationId }, data: { status: "configured" } };
  if (pathname === "/api/v1/dashboard") return { meta: authorityMeta(correlationId), data: { metrics: { trackedOpportunities: 1, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 1 } } };
  if (pathname === "/api/v1/opportunities") return { meta: authorityMeta(correlationId), data: { kind: "opportunities", items: [stressItem] } };
  if (pathname === `/api/v1/opportunities/${stressId}`) return { meta: authorityMeta(correlationId), data: { kind: "opportunity", opportunity: stressItem } };
  if (pathname === `/api/v1/evidence/${stressId}`) return { meta: authorityMeta(correlationId), data: { kind: "evidence", opportunityId: stressId, acceptedExactCompletedSales: 0, visibleButAuthorityIneligible: 0, linkedEvidence: [] } };
  if (pathname === `/api/v1/psa-advisor/${stressId}`) return {
    meta: authorityMeta(correlationId),
    data: {
      kind: "psa-advisor",
      opportunityId: stressId,
      guidanceStatus: "INSUFFICIENT_SAVED_CONTEXT_PROVIDER_CONFIRMATION_REQUIRED",
      savedPsaSnapshot: { readinessStatus: "UNAVAILABLE_PENDING_MANUAL_PROVIDER_IDENTITY_CONFIRMATION", manualVerificationRequired: true },
      populationContext: { psa10Population: 0, psa9Population: 0 },
      recalculated: false
    }
  };
  return { meta: authorityMeta(correlationId), data: { kind: "qa-fixture", path: pathname } };
}

async function stubIdentity(page) {
  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: "window.FlipForgeIdentity = Object.freeze({ getUser: () => null });"
  }));
}

async function measure(page) {
  return page.evaluate(() => {
    const failures = [];
    const warnings = [];
    const viewportWidth = window.innerWidth;
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    const ignored = [".table-wrap", ".chart-shell", ".line-chart", ".signal-track", ".usage-track", ".readiness-ring", ".toast-region", ".sr-only", ".mobile-scrim"];
    const label = element => element.id ? `#${element.id}` : String(element.className || element.tagName).slice(0, 140);

    if (documentWidth > viewportWidth + 4) failures.push({ type: "document-horizontal-overflow", detail: `${documentWidth}px document in ${viewportWidth}px viewport` });

    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement)) continue;
      if (ignored.some(selector => element.matches(selector) || element.closest(selector))) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || !element.getClientRects().length) continue;
      if (element.clientWidth < 1 || element.clientHeight < 1) continue;

      if (["hidden", "clip"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 4) {
        failures.push({ type: "clipped-horizontal-content", selector: label(element), detail: `${element.scrollWidth}px content in ${element.clientWidth}px box` });
      }
      if (["hidden", "clip"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 4) {
        failures.push({ type: "clipped-vertical-content", selector: label(element), detail: `${element.scrollHeight}px content in ${element.clientHeight}px box` });
      }

      const rect = element.getBoundingClientRect();
      if (rect.right > viewportWidth + 8 && !element.closest(".sidebar") && !element.closest(".table-wrap")) {
        warnings.push({ type: "element-outside-viewport", selector: label(element), detail: `right edge ${Math.round(rect.right)}px in ${viewportWidth}px viewport` });
      }
    }

    for (const control of document.querySelectorAll("button, a, input, select, textarea")) {
      if (!(control instanceof HTMLElement)) continue;
      const style = getComputedStyle(control);
      if (style.display === "none" || style.visibility === "hidden" || !control.getClientRects().length) continue;
      const rect = control.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) failures.push({ type: "collapsed-control", selector: label(control), detail: `${Math.round(rect.width)}x${Math.round(rect.height)}` });
    }

    return { failures: failures.slice(0, 100), warnings: warnings.slice(0, 100) };
  });
}

async function waitForPage(page) {
  await page.waitForSelector("#main-content", { timeout: 5000 });
  await page.waitForFunction(() => (document.querySelector("#main-content")?.textContent || "").trim().length > 20, { timeout: 5000 });
  await page.waitForTimeout(120);
}

async function auditPrototype(browser, viewportName, width, height, route) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  try {
    await stubIdentity(page);
    await page.route("**/staging-route-hook.js", request => request.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "(() => {})();" }));
    await page.goto(`${baseUrl}/#/${route}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
    await waitForPage(page);
    const heading = (await page.locator("#main-content h1, #main-content h2").first().textContent().catch(() => ""))?.trim() || "";
    const measured = await measure(page);
    return { mode: "prototype", route, viewport: viewportName, size: `${width}x${height}`, heading, ...measured };
  } finally {
    await context.close();
  }
}

async function auditCustomerStress(browser, viewportName, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  try {
    await stubIdentity(page);
    await page.route("**/api/v1/**", route => route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(apiFixture(route.request())) }));
    await page.goto(`${baseUrl}/#/opportunities/${stressId}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
    await waitForPage(page);
    const heading = (await page.locator("#main-content h1, #main-content h2").first().textContent().catch(() => ""))?.trim() || "";
    const measured = await measure(page);
    return { mode: "customer-stress", route: `opportunities/${stressId}`, viewport: viewportName, size: `${width}x${height}`, heading, ...measured };
  } finally {
    await context.close();
  }
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const [viewportName, width, height] of viewports) {
    for (const route of routes) {
      console.log(`[layout-ci] ${viewportName} ${route}`);
      try {
        results.push(await auditPrototype(browser, viewportName, width, height, route));
      } catch (error) {
        results.push({ mode: "prototype", route, viewport: viewportName, size: `${width}x${height}`, heading: "", failures: [{ type: "audit-route-error", detail: String(error?.message || error) }], warnings: [] });
      }
    }
    console.log(`[layout-ci] ${viewportName} customer stress`);
    try {
      results.push(await auditCustomerStress(browser, viewportName, width, height));
    } catch (error) {
      results.push({ mode: "customer-stress", route: `opportunities/${stressId}`, viewport: viewportName, size: `${width}x${height}`, heading: "", failures: [{ type: "audit-route-error", detail: String(error?.message || error) }], warnings: [] });
    }
  }
} finally {
  await browser.close();
}

const hardFailures = results.flatMap(result => result.failures.map(issue => ({ mode: result.mode, route: result.route, viewport: result.viewport, ...issue })));
const warnings = results.flatMap(result => result.warnings.map(issue => ({ mode: result.mode, route: result.route, viewport: result.viewport, ...issue })));
const report = { generatedAt: new Date().toISOString(), pagesAudited: results.length, hardFailureCount: hardFailures.length, warningCount: warnings.length, results, hardFailures, warnings };

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
const markdown = [
  "# FlipForge SaaS Full-Site Layout Audit",
  "",
  `Pages/viewports audited: **${report.pagesAudited}**`,
  `Hard layout failures: **${report.hardFailureCount}**`,
  `Warnings: **${report.warningCount}**`,
  "",
  "## Hard failures",
  ...(hardFailures.length ? hardFailures.map(item => `- **${item.mode} · ${item.route} · ${item.viewport}** — ${item.type}: ${item.detail}${item.selector ? ` (${item.selector})` : ""}`) : ["- None."]),
  "",
  "## Warnings",
  ...(warnings.length ? warnings.slice(0, 150).map(item => `- **${item.mode} · ${item.route} · ${item.viewport}** — ${item.type}: ${item.detail}${item.selector ? ` (${item.selector})` : ""}`) : ["- None."]),
  "",
  "The customer stress fixture is synthetic browser-only data. It never writes SQLite or changes FlipForge authority.",
  ""
].join("\n");
await writeFile(path.join(outputDir, "report.md"), markdown, "utf8");
console.log(markdown);
if (hardFailures.length) process.exitCode = 1;
