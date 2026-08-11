import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173";
const outputDir = path.resolve(process.cwd(), "qa-artifacts", "saas-layout");

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 900, height: 1100 },
  { name: "mobile", width: 390, height: 844 }
];

const prototypeRoutes = [
  "dashboard",
  "beta-start",
  "discover",
  "evaluate",
  "opportunities",
  "opportunities/visual-qa-card",
  "tracking",
  "compare",
  "psa-advisor",
  "evidence",
  "portfolio",
  "sell",
  "alerts",
  "export",
  "account"
];

const stressId = "EBAY-ext-visual-qa";
const stressTitle = "2018 Topps Chrome Shohei Ohtani #150 PSA 10 Refractor Extremely Long Visual QA Card Identity Variant";
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

function sanitize(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function meta(correlationId) {
  return {
    contractVersion: "1.0",
    engineVersion: "visual-qa-fixture",
    authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence",
    correlationId,
    evidenceFreshness: "MIXED_DISPLAY_ONLY_PROVIDER_CONFIRMATION_PENDING_WITH_LONG_STATE",
    limitations: [
      "Visual QA fixture: no accepted exact completed-sale evidence is available.",
      "This fixture intentionally uses long status strings to detect layout regressions."
    ]
  };
}

function fixturePayload(request) {
  const pathname = new URL(request.url()).pathname;
  const correlationId = request.headers()["x-correlation-id"] || "visual-qa-correlation";

  if (pathname === "/api/v1/health") {
    return { meta: { contractVersion: "1.0", correlationId }, data: { status: "configured" } };
  }
  if (pathname === "/api/v1/dashboard") {
    return {
      meta: meta(correlationId),
      data: { metrics: { trackedOpportunities: 1, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 1 } }
    };
  }
  if (pathname === "/api/v1/opportunities") {
    return { meta: meta(correlationId), data: { kind: "opportunities", items: [stressItem] } };
  }
  if (pathname === `/api/v1/opportunities/${stressId}`) {
    return { meta: meta(correlationId), data: { kind: "opportunity", opportunity: stressItem } };
  }
  if (pathname === `/api/v1/evidence/${stressId}`) {
    return {
      meta: meta(correlationId),
      data: {
        kind: "evidence",
        opportunityId: stressId,
        acceptedExactCompletedSales: 0,
        visibleButAuthorityIneligible: 0,
        linkedEvidence: []
      }
    };
  }
  if (pathname === `/api/v1/psa-advisor/${stressId}`) {
    return {
      meta: meta(correlationId),
      data: {
        kind: "psa-advisor",
        opportunityId: stressId,
        guidanceStatus: "INSUFFICIENT_SAVED_CONTEXT_PROVIDER_CONFIRMATION_REQUIRED",
        savedPsaSnapshot: {
          readinessStatus: "UNAVAILABLE_PENDING_MANUAL_PROVIDER_IDENTITY_CONFIRMATION",
          manualVerificationRequired: true
        },
        populationContext: { psa10Population: 0, psa9Population: 0 },
        recalculated: false
      }
    };
  }
  return { meta: meta(correlationId), data: { kind: "visual-qa-unhandled", path: pathname } };
}

async function installCommonRoutes(page, { disableCustomerRouteHook = false, apiFixtures = false } = {}) {
  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: "window.FlipForgeIdentity = Object.freeze({ getUser: () => null });"
  }));

  if (disableCustomerRouteHook) {
    await page.route("**/staging-route-hook.js", route => route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: "(() => { 'use strict'; })();"
    }));
  }

  if (apiFixtures) {
    await page.route("**/api/v1/**", route => route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(fixturePayload(route.request()))
    }));
  }
}

async function waitForRenderedMain(page) {
  await page.waitForSelector("#main-content", { state: "attached", timeout: 10_000 });
  await page.waitForFunction(() => {
    const main = document.querySelector("#main-content");
    return Boolean(main && main.textContent && main.textContent.trim().length > 20);
  }, { timeout: 10_000 });
  await page.waitForTimeout(180);
}

async function collectLayoutIssues(page) {
  return page.evaluate(() => {
    const issues = [];
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = window.innerWidth;
    const documentWidth = Math.max(root.scrollWidth, body?.scrollWidth || 0);

    if (documentWidth > viewportWidth + 4) {
      issues.push({ severity: "error", type: "document-horizontal-overflow", detail: `document width ${documentWidth}px exceeds viewport ${viewportWidth}px` });
    }

    const ignored = [
      ".table-wrap", ".chart-shell", ".line-chart", ".signal-track", ".usage-track",
      ".readiness-ring", ".toast-region", ".sr-only", ".mobile-scrim"
    ];

    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement)) continue;
      if (ignored.some(item => element.matches(item) || element.closest(item))) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (!element.getClientRects().length || element.clientWidth <= 0 || element.clientHeight <= 0) continue;

      if ((style.overflowX === "hidden" || style.overflowX === "clip") && element.scrollWidth > element.clientWidth + 4) {
        issues.push({
          severity: "error",
          type: "clipped-horizontal-content",
          selector: element.id ? `#${element.id}` : String(element.className || element.tagName).slice(0, 160),
          detail: `${element.scrollWidth}px content inside ${element.clientWidth}px box`
        });
      }
      if ((style.overflowY === "hidden" || style.overflowY === "clip") && element.scrollHeight > element.clientHeight + 4) {
        issues.push({
          severity: "error",
          type: "clipped-vertical-content",
          selector: element.id ? `#${element.id}` : String(element.className || element.tagName).slice(0, 160),
          detail: `${element.scrollHeight}px content inside ${element.clientHeight}px box`
        });
      }

      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.right > viewportWidth + 8 && !element.closest(".sidebar") && !element.closest(".table-wrap")) {
        issues.push({
          severity: "warning",
          type: "element-outside-viewport",
          selector: element.id ? `#${element.id}` : String(element.className || element.tagName).slice(0, 160),
          detail: `right edge ${Math.round(rect.right)}px exceeds viewport ${viewportWidth}px`
        });
      }
    }

    for (const control of document.querySelectorAll("button, a, input, select, textarea")) {
      if (!(control instanceof HTMLElement)) continue;
      const style = getComputedStyle(control);
      if (style.display === "none" || style.visibility === "hidden" || !control.getClientRects().length) continue;
      const rect = control.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        issues.push({
          severity: "error",
          type: "collapsed-control",
          selector: control.id ? `#${control.id}` : String(control.className || control.tagName).slice(0, 160),
          detail: `${Math.round(rect.width)}x${Math.round(rect.height)} control`
        });
      }
    }

    return issues.slice(0, 120);
  });
}

async function takeBestEffortScreenshot(context, page, screenshotName) {
  let session;
  try {
    session = await context.newCDPSession(page);
    const metrics = await session.send("Page.getLayoutMetrics");
    const width = Math.max(1, Math.ceil(metrics.contentSize?.width || page.viewportSize()?.width || 1440));
    const height = Math.max(1, Math.min(30_000, Math.ceil(metrics.contentSize?.height || page.viewportSize()?.height || 1000)));
    const capture = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 }
    });
    await writeFile(path.join(outputDir, screenshotName), Buffer.from(capture.data, "base64"));
    return "";
  } catch (error) {
    return String(error?.message || error);
  } finally {
    if (session) await session.detach().catch(() => {});
  }
}

async function auditRoute(browser, { route, viewport, mode }) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") pageErrors.push(`console: ${message.text()}`); });

  try {
    await installCommonRoutes(page, {
      disableCustomerRouteHook: mode === "prototype",
      apiFixtures: mode === "customer-stress"
    });

    const target = mode === "customer-stress"
      ? `${baseUrl}/#/opportunities/${stressId}`
      : `${baseUrl}/#/${route}`;

    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitForRenderedMain(page);

    const issues = await collectLayoutIssues(page);
    const title = await page.locator("#main-content h1, #main-content h2").first().textContent().catch(() => "");
    const screenshotName = `${mode}-${sanitize(route)}-${viewport.name}.png`;
    const screenshotError = await takeBestEffortScreenshot(context, page, screenshotName);

    return {
      mode,
      route,
      viewport: viewport.name,
      size: `${viewport.width}x${viewport.height}`,
      heading: String(title || "").trim(),
      screenshot: screenshotError ? "" : screenshotName,
      screenshotError,
      issues,
      pageErrors: pageErrors.slice(0, 20)
    };
  } finally {
    await context.close();
  }
}

function aggregate(results) {
  const hardFailures = [];
  const warnings = [];

  for (const result of results) {
    if (result.auditError) {
      hardFailures.push({ route: result.route, viewport: result.viewport, mode: result.mode, type: "audit-route-error", detail: result.auditError });
    }
    for (const issue of result.issues || []) {
      const item = { route: result.route, viewport: result.viewport, mode: result.mode, ...issue };
      if (issue.severity === "error") hardFailures.push(item);
      else warnings.push(item);
    }
    if (result.screenshotError) {
      warnings.push({ route: result.route, viewport: result.viewport, mode: result.mode, type: "screenshot-unavailable", detail: result.screenshotError });
    }
  }

  return { hardFailures, warnings };
}

async function writeProgress(results) {
  const { hardFailures, warnings } = aggregate(results);
  const progress = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    pagesAudited: results.length,
    hardFailureCount: hardFailures.length,
    warningCount: warnings.length,
    results,
    hardFailures,
    warnings
  };
  await writeFile(path.join(outputDir, "progress.json"), `${JSON.stringify(progress, null, 2)}\n`, "utf8");
  return progress;
}

function buildMarkdown(summary) {
  return [
    "# FlipForge SaaS Full-Site Layout Audit",
    "",
    `Generated: ${summary.generatedAt}`,
    `Pages/viewports audited: **${summary.pagesAudited}**`,
    `Hard layout failures: **${summary.hardFailureCount}**`,
    `Warnings: **${summary.warningCount}**`,
    "",
    "## Hard failures",
    "",
    ...(summary.hardFailures.length
      ? summary.hardFailures.map(item => `- **${item.mode} · ${item.route} · ${item.viewport}** — ${item.type}: ${item.detail}${item.selector ? ` (${item.selector})` : ""}`)
      : ["- None."]),
    "",
    "## Warnings",
    "",
    ...(summary.warnings.length
      ? summary.warnings.slice(0, 120).map(item => `- **${item.mode} · ${item.route} · ${item.viewport}** — ${item.type}: ${item.detail}${item.selector ? ` (${item.selector})` : ""}`)
      : ["- None."]),
    "",
    "## Coverage",
    "",
    "- Prototype customer route map at desktop, tablet, and mobile widths.",
    "- Best-effort full-page Chromium screenshots for every audited route and viewport.",
    "- Customer Card Intelligence stress fixture with long card identity, mapping, evidence freshness, workflow, and PSA states.",
    "- Document horizontal overflow, clipped hidden content, off-viewport controls, and collapsed controls.",
    "",
    "The stress fixture is synthetic and is used only for browser layout QA. It does not alter FlipForge authority, scoring, tenant ownership, evidence, or persisted customer data.",
    ""
  ].join("\n");
}

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "progress.json"), "{\"status\":\"starting\"}\n", "utf8");

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    for (const route of prototypeRoutes) {
      console.log(`[layout-audit] ${viewport.name} prototype ${route}`);
      try {
        results.push(await auditRoute(browser, { route, viewport, mode: "prototype" }));
      } catch (error) {
        results.push({ mode: "prototype", route, viewport: viewport.name, size: `${viewport.width}x${viewport.height}`, issues: [], pageErrors: [], auditError: String(error?.message || error) });
      }
      await writeProgress(results);
    }

    console.log(`[layout-audit] ${viewport.name} customer-stress opportunities/${stressId}`);
    try {
      results.push(await auditRoute(browser, { route: `opportunities/${stressId}`, viewport, mode: "customer-stress" }));
    } catch (error) {
      results.push({ mode: "customer-stress", route: `opportunities/${stressId}`, viewport: viewport.name, size: `${viewport.width}x${viewport.height}`, issues: [], pageErrors: [], auditError: String(error?.message || error) });
    }
    await writeProgress(results);
  }
} finally {
  await browser.close();
}

const summary = await writeProgress(results);
await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
const markdown = buildMarkdown(summary);
await writeFile(path.join(outputDir, "report.md"), markdown, "utf8");

console.log(markdown);
if (summary.hardFailureCount) process.exitCode = 1;
