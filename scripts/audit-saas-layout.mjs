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
  evidence: {
    acceptedSales: 0,
    averagePrice: 0,
    latestSaleDate: null
  }
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
  const url = new URL(request.url());
  const correlationId = request.headers()["x-correlation-id"] || "visual-qa-correlation";
  const pathname = url.pathname;

  if (pathname === "/api/v1/health") {
    return {
      meta: { contractVersion: "1.0", correlationId },
      data: { status: "configured" }
    };
  }

  if (pathname === "/api/v1/dashboard") {
    return {
      meta: meta(correlationId),
      data: {
        metrics: {
          trackedOpportunities: 1,
          evidenceReady: 0,
          populationContextAvailable: 0,
          needsVerification: 1
        }
      }
    };
  }

  if (pathname === "/api/v1/opportunities") {
    return {
      meta: meta(correlationId),
      data: { kind: "opportunities", items: [stressItem] }
    };
  }

  if (pathname === `/api/v1/opportunities/${stressId}`) {
    return {
      meta: meta(correlationId),
      data: { kind: "opportunity", opportunity: stressItem }
    };
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
        populationContext: {
          psa10Population: 0,
          psa9Population: 0
        },
        recalculated: false
      }
    };
  }

  return {
    meta: meta(correlationId),
    data: { kind: "visual-qa-unhandled", path: pathname }
  };
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
  await page.waitForTimeout(250);
}

async function collectLayoutIssues(page) {
  return page.evaluate(() => {
    const issues = [];
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = window.innerWidth;

    const documentWidth = Math.max(root.scrollWidth, body?.scrollWidth || 0);
    if (documentWidth > viewportWidth + 4) {
      issues.push({
        severity: "error",
        type: "document-horizontal-overflow",
        detail: `document width ${documentWidth}px exceeds viewport ${viewportWidth}px`
      });
    }

    const ignored = [
      ".table-wrap",
      ".chart-shell",
      ".line-chart",
      ".signal-track",
      ".usage-track",
      ".readiness-ring",
      ".toast-region",
      ".sr-only"
    ];

    const selector = "body *";
    for (const element of document.querySelectorAll(selector)) {
      if (!(element instanceof HTMLElement)) continue;
      if (ignored.some(item => element.matches(item) || element.closest(item))) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (!element.getClientRects().length) continue;
      if (element.clientWidth <= 0 || element.clientHeight <= 0) continue;

      const overflowX = style.overflowX;
      const overflowY = style.overflowY;
      if ((overflowX === "hidden" || overflowX === "clip") && element.scrollWidth > element.clientWidth + 4) {
        issues.push({
          severity: "error",
          type: "clipped-horizontal-content",
          selector: element.id ? `#${element.id}` : String(element.className || element.tagName).slice(0, 160),
          detail: `${element.scrollWidth}px content inside ${element.clientWidth}px box`
        });
      }
      if ((overflowY === "hidden" || overflowY === "clip") && element.scrollHeight > element.clientHeight + 4) {
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

    const importantControls = [...document.querySelectorAll("button, a, input, select, textarea")]
      .filter(element => element instanceof HTMLElement)
      .filter(element => getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden")
      .filter(element => element.getClientRects().length > 0);

    for (const control of importantControls) {
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

    return issues.slice(0, 100);
  });
}

async function auditRoute(browser, { route, viewport, mode }) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") pageErrors.push(`console: ${message.text()}`);
  });

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
  await page.screenshot({ path: path.join(outputDir, screenshotName), fullPage: true });

  await context.close();
  return {
    mode,
    route,
    viewport: viewport.name,
    size: `${viewport.width}x${viewport.height}`,
    heading: String(title || "").trim(),
    screenshot: screenshotName,
    issues,
    pageErrors: pageErrors.slice(0, 20)
  };
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    for (const route of prototypeRoutes) {
      results.push(await auditRoute(browser, { route, viewport, mode: "prototype" }));
    }
    results.push(await auditRoute(browser, { route: `opportunities/${stressId}`, viewport, mode: "customer-stress" }));
  }
} finally {
  await browser.close();
}

const hardFailures = results.flatMap(result => result.issues
  .filter(issue => issue.severity === "error")
  .map(issue => ({ route: result.route, viewport: result.viewport, mode: result.mode, ...issue })));

const warnings = results.flatMap(result => result.issues
  .filter(issue => issue.severity !== "error")
  .map(issue => ({ route: result.route, viewport: result.viewport, mode: result.mode, ...issue })));

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  pagesAudited: results.length,
  hardFailureCount: hardFailures.length,
  warningCount: warnings.length,
  results,
  hardFailures,
  warnings
};

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const markdown = [
  "# FlipForge SaaS Full-Site Layout Audit",
  "",
  `Generated: ${summary.generatedAt}`,
  `Pages/viewports audited: **${summary.pagesAudited}**`,
  `Hard layout failures: **${hardFailures.length}**`,
  `Warnings: **${warnings.length}**`,
  "",
  "## Hard failures",
  "",
  ...(hardFailures.length
    ? hardFailures.map(item => `- **${item.mode} · ${item.route} · ${item.viewport}** — ${item.type}: ${item.detail}${item.selector ? ` (${item.selector})` : ""}`)
    : ["- None."]),
  "",
  "## Warnings",
  "",
  ...(warnings.length
    ? warnings.slice(0, 100).map(item => `- **${item.mode} · ${item.route} · ${item.viewport}** — ${item.type}: ${item.detail}${item.selector ? ` (${item.selector})` : ""}`)
    : ["- None."]),
  "",
  "## Coverage",
  "",
  "- Prototype customer route map at desktop, tablet, and mobile widths.",
  "- Full-page screenshots for every audited route and viewport.",
  "- Customer Card Intelligence stress fixture with long card identity, mapping, evidence freshness, workflow, and PSA states.",
  "- Document horizontal overflow, clipped hidden content, off-viewport controls, and collapsed controls.",
  "",
  "The stress fixture is synthetic and is used only for browser layout QA. It does not alter FlipForge authority, scoring, tenant ownership, evidence, or persisted customer data.",
  ""
].join("\n");

await writeFile(path.join(outputDir, "report.md"), markdown, "utf8");

console.log(markdown);
if (hardFailures.length) process.exitCode = 1;
