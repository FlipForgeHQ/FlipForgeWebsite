import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_TYPOGRAPHY_AUDIT_URL || "http://127.0.0.1:4173/app";
const outputDir = path.resolve(process.cwd(), "qa-artifacts", "customer-typography");
const minimumTextPx = 14;
const stressId = "EBAY-ext-visual-qa";
const stressTitle = "2018 Topps Chrome Shohei Ohtani #150 PSA 9 Typography Audit";

const viewports = [
  ["desktop", 1536, 1000],
  ["tablet", 900, 1100],
  ["mobile", 390, 844]
];

const routes = [
  "dashboard",
  "beta-start",
  "market-view",
  "discover",
  "forge-heat",
  "evaluate",
  "opportunities",
  `opportunities/${stressId}`,
  "tracking",
  `tracking/${stressId}`,
  "alerts",
  "portfolio",
  "decision-intelligence",
  "compare",
  "psa-advisor",
  `psa-advisor/${stressId}`,
  "evidence",
  `evidence/${stressId}`,
  "sell",
  `sell/${stressId}`,
  "export",
  `export/${stressId}`,
  "account"
];

const stressItem = {
  id: stressId,
  platform: "EBAY",
  marketplace: "EBAY",
  recommendation: "WATCH",
  title: stressTitle,
  cardIdentity: stressTitle,
  ask: 850,
  supportedValue: 925,
  allInAskCents: 85000,
  supportedValueCents: 92500,
  supportedValueGapCents: 7500,
  supportedValueGapPct: 8.8,
  confidence: 72,
  liquidity: 65,
  risk: 42,
  rank: 1,
  acceptedExactSales: 17,
  exactTrustedCompCount: 17,
  supportRating: "SUPPORTED",
  evaluatedAt: "2026-08-28T18:30:00Z",
  observedAt: "2026-08-28T18:30:00Z",
  mappingState: "CONFIRMED",
  statusMessage: "Typography audit fixture.",
  changeSummary: "QA_ONLY",
  workflowStatus: "TRACKING",
  authorityBoundary: "Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority.",
  evidence: { acceptedSales: 17, averagePrice: 925, latestSaleDate: "2026-08-28" }
};

function authorityMeta(correlationId) {
  return {
    contractVersion: "1.0",
    engineVersion: "typography-qa-fixture",
    authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence",
    correlationId,
    generatedAt: "2026-08-28T18:30:00Z",
    evidenceFreshness: "QA_FIXTURE",
    limitations: ["Synthetic browser typography fixture only."]
  };
}

function forgeHeatData() {
  return {
    kind: "forge-heat",
    heatVersion: "FORGE_HEAT_V1",
    serviceVersion: "qa",
    proFeature: true,
    access: {
      allowed: true,
      currentPlan: "PRIVATE_BETA",
      requiredPlan: "PRO",
      privateBetaPreview: true,
      accessState: "ACTIVE"
    },
    authority: {
      recommendationAuthority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      forgeHeatRecommendationAuthority: false,
      clientComputed: false,
      transactionAuthority: false
    },
    scope: {
      code: "SAVED_EVALUATED_UNIVERSE",
      marketWide: false,
      continuousMarketScannerActive: false,
      maxSnapshotAgeDays: 30
    },
    componentAvailability: {
      momentum: { available: false, reason: "History is still building." },
      stability: { available: false, reason: "Not active in V1." },
      scarcity: { available: false, reason: "Not active in V1." },
      netEconomics: { available: false, reason: "Not active in V1." }
    },
    locked: false,
    top5: [],
    hiddenGems: [],
    highestEdge: [],
    summary: {
      latestEvaluationsConsidered: 11,
      heatEligible: 1,
      surfaced: 0,
      unscored: 10
    },
    unscoredPreview: []
  };
}

function apiFixture(request) {
  const pathname = new URL(request.url()).pathname;
  const correlationId = request.headers()["x-correlation-id"] || "typography-qa";
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
    return { meta, data: { metrics: { trackedOpportunities: 1, evidenceReady: 1, populationContextAvailable: 0, needsVerification: 0 } } };
  }

  if (pathname === "/api/v1/opportunities") {
    return { meta, data: { kind: "opportunities", items: [stressItem] } };
  }

  if (pathname === `/api/v1/opportunities/${stressId}`) {
    return { meta, data: { kind: "opportunity", opportunity: stressItem } };
  }

  if (pathname === `/api/v1/evidence/${stressId}`) {
    return {
      meta,
      data: {
        kind: "evidence",
        opportunityId: stressId,
        acceptedExactCompletedSales: 0,
        visibleButAuthorityIneligible: 0,
        linkedEvidence: [],
        manualCandidates: [],
        timeline: []
      }
    };
  }

  if (pathname === `/api/v1/psa-advisor/${stressId}`) {
    return {
      meta,
      data: {
        kind: "psa-advisor",
        opportunityId: stressId,
        guidanceStatus: "AVAILABLE",
        savedPsaSnapshot: { readinessStatus: "AVAILABLE", manualVerificationRequired: false },
        populationContext: { psa10Population: 0, psa9Population: 0 },
        recalculated: false
      }
    };
  }

  if (pathname === "/api/v1/forge-heat") {
    return { meta, data: forgeHeatData() };
  }

  return { meta, data: { kind: "qa-fixture", path: pathname, items: [], records: [] } };
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

async function auditPage(page) {
  return page.evaluate(minimum => {
    document.querySelectorAll("details").forEach(detail => { detail.open = true; });

    const excluded = [
      "script",
      "style",
      "svg",
      "path",
      ".sr-only",
      ".brand-mark",
      ".brand-center",
      ".brand-corner",
      ".usage-track",
      ".signal-track",
      ".readiness-ring",
      ".ff-guide-track",
      ".mobile-scrim"
    ];

    const label = element => {
      if (element.id) return `#${element.id}`;
      const className = typeof element.className === "string" ? element.className.trim() : "";
      return className ? `${element.tagName.toLowerCase()}.${className.split(/\s+/).slice(0, 3).join(".")}` : element.tagName.toLowerCase();
    };

    const directText = element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && String(node.nodeValue || "").trim());
    const isTextControl = element => element.matches("input, select, textarea");
    const issues = [];

    const pushIfUndersized = (selector, tag, style, text) => {
      const size = Number.parseFloat(style.fontSize);
      if (!Number.isFinite(size) || size + 0.01 >= minimum) return;
      issues.push({
        selector,
        tag,
        fontSizePx: Number(size.toFixed(2)),
        text: String(text || "").slice(0, 120)
      });
    };

    const pseudoText = (element, pseudo) => {
      const style = getComputedStyle(element, pseudo);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return;
      const raw = String(style.content || "").trim();
      if (!raw || raw === "none" || raw === "normal" || raw === '""' || raw === "''") return;
      const text = raw.replace(/^['"]|['"]$/g, "").replace(/\\A/g, " ").trim();
      if (!/[A-Za-z0-9]/.test(text)) return;
      pushIfUndersized(`${label(element)}${pseudo}`, `pseudo${pseudo}`, style, text);
    };

    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement)) continue;
      if (excluded.some(selector => element.matches(selector) || element.closest(selector))) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || !element.getClientRects().length) continue;

      if (directText(element) || isTextControl(element)) {
        const text = isTextControl(element)
          ? String(element.value || element.getAttribute("placeholder") || element.getAttribute("aria-label") || "").trim()
          : String([...element.childNodes]
              .filter(node => node.nodeType === Node.TEXT_NODE)
              .map(node => node.nodeValue || "")
              .join(" "))
              .replace(/\s+/g, " ")
              .trim();
        if (text) pushIfUndersized(label(element), element.tagName.toLowerCase(), style, text);
      }

      pseudoText(element, "::before");
      pseudoText(element, "::after");
    }

    return issues.slice(0, 250);
  }, minimumTextPx);
}

async function runRoute(browser, viewportName, width, height, route) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  try {
    await stubIdentity(page);
    await page.route("**/api/v1/**", routeHandler => routeHandler.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(apiFixture(routeHandler.request()))
    }));
    await page.route("**/staging-route-hook.js", routeHandler => routeHandler.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: "(() => {})();"
    }));

    await page.goto(`${baseUrl}/#/${route}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.waitForSelector("#main-content", { state: "attached", timeout: 5_000 });
    await page.waitForTimeout(500);

    const heading = (await page.locator("#main-content h1, #main-content h2").first().textContent().catch(() => ""))?.trim() || "";
    const issues = await auditPage(page);
    return { route, viewport: viewportName, size: `${width}x${height}`, heading, issues };
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
      console.log(`[typography-ci] ${viewportName} ${route}`);
      try {
        results.push(await runRoute(browser, viewportName, width, height, route));
      } catch (error) {
        results.push({
          route,
          viewport: viewportName,
          size: `${width}x${height}`,
          heading: "",
          issues: [{ selector: "route", tag: "route", fontSizePx: 0, text: `Audit error: ${String(error?.message || error)}` }]
        });
      }
    }
  }
} finally {
  await browser.close();
}

const failures = results.flatMap(result => result.issues.map(issue => ({
  route: result.route,
  viewport: result.viewport,
  ...issue
})));

const report = {
  generatedAt: new Date().toISOString(),
  minimumTextPx,
  routes: routes.length,
  viewports: viewports.length,
  pagesAudited: results.length,
  failureCount: failures.length,
  results,
  failures
};

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const markdown = [
  "# FlipForge Customer Typography Audit",
  "",
  `Minimum visible text size: **${minimumTextPx}px**`,
  `Routes audited: **${routes.length}**`,
  `Viewports audited per route: **${viewports.length}**`,
  `Rendered route/viewports audited: **${report.pagesAudited}**`,
  `Undersized visible text findings: **${report.failureCount}**`,
  "",
  "## Findings",
  ...(failures.length
    ? failures.slice(0, 250).map(item => `- **${item.route} · ${item.viewport}** — ${item.fontSizePx}px · ${item.selector} — ${item.text}`)
    : ["- None. All rendered customer text, including generated pseudo-copy, met the 14px floor."]),
  "",
  "This audit expands collapsed details before measuring and checks the production-built /app mount at desktop, tablet, and mobile widths.",
  "Generated ::before/::after copy containing human-readable text is included in the typography floor.",
  "Synthetic API fixtures are browser-only and do not write account data or change any FlipForge authority.",
  ""
].join("\n");

await writeFile(path.join(outputDir, "report.md"), markdown, "utf8");
console.log(markdown);
if (failures.length) process.exitCode = 1;
