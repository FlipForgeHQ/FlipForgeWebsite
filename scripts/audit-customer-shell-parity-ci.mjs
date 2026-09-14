import { chromium } from "playwright";

const base = "http://goflipforge.com:4173/app/customer/";
const routes = [
  "dashboard",
  "discover",
  "evaluate",
  "decision-intelligence",
  "opportunities",
  "tracking",
  "portfolio",
  "alerts",
  "forge-heat",
  "market-view",
  "account"
];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "wide", width: 2048, height: 1152 },
  { name: "mobile", width: 390, height: 844 }
];

const proof = {
  id: "customer-shell-parity-proof",
  platform: "EBAY",
  marketplace: "EBAY",
  recommendation: "VERIFY",
  title: "2018 Topps Chrome Shohei Ohtani #150 Refractor PSA 10",
  cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 Refractor PSA 10",
  ask: 525,
  supportedValue: 500,
  confidence: 72,
  liquidity: 81,
  risk: 38,
  rank: 84,
  mappingState: "CONFIRMED",
  workflowStatus: "EVIDENCE_REVIEW_REQUIRED",
  authorityBoundary: "Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority.",
  observedAt: "2026-09-13T13:30:00Z",
  evidence: { acceptedSales: 3, averagePrice: 500, latestSaleDate: "2026-09-12" }
};

function meta(correlationId = "customer-shell-parity") {
  return {
    contractVersion: "1.0",
    engineVersion: "customer-shell-parity-fixture",
    authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence",
    correlationId,
    generatedAt: "2026-09-13T13:30:00Z",
    evidenceFreshness: "CURRENT",
    limitations: ["Synthetic rendered-shell fixture only."]
  };
}

function fixture(request) {
  const url = new URL(request.url());
  const pathname = url.pathname;
  const authority = meta(request.headers()["x-correlation-id"]);

  if (pathname === "/api/v1/health") {
    return { meta: authority, data: { status: "configured", bridgeEnabled: true, upstreamConfigured: true, authenticationRequired: true, tenantMembershipRequired: true } };
  }
  if (pathname === "/api/v1/dashboard") {
    return { meta: authority, data: { metrics: { trackedOpportunities: 1, evidenceReady: 1, populationContextAvailable: 1, needsVerification: 1 } } };
  }
  if (pathname === "/api/v1/opportunities") {
    return { meta: authority, data: { kind: "opportunities", items: [proof] } };
  }
  if (pathname === `/api/v1/opportunities/${proof.id}`) {
    return { meta: authority, data: { kind: "opportunity", opportunity: proof } };
  }
  if (pathname.startsWith("/api/v1/evidence/")) {
    return { meta: authority, data: { kind: "evidence", opportunityId: proof.id, cardIdentity: proof.cardIdentity, acceptedExactCompletedSales: 3, visibleButAuthorityIneligible: 1, linkedEvidence: [{ authorityEligible: true, salePrice: 500 }] } };
  }
  if (pathname.startsWith("/api/v1/psa-advisor/")) {
    return { meta: authority, data: { kind: "psa-advisor", opportunityId: proof.id, guidanceStatus: "CONTEXT_AVAILABLE", populationContext: { available: true, psa10Population: 1250, psa9Population: 840, totalPopulation: 2090 }, recalculated: false } };
  }
  if (pathname === "/api/v1/lifecycle") {
    return { meta: authority, data: { kind: "lifecycle", items: [] } };
  }
  if (pathname === "/api/v1/entitlements") {
    return {
      meta: authority,
      data: {
        kind: "entitlements",
        readOnly: true,
        transactionAuthority: false,
        current: { code: "EARLY_ACCESS", name: "Early Access", accessState: "ACTIVE", entitlementSource: "Invitation", paidPlanActive: false },
        usage: { completedEvaluations: 3, inProgressReservations: 0, admissionUsage: 3, monthlyEvaluationLimit: null, remainingEvaluations: null },
        plannedCommercialPlans: [],
        checkoutAvailable: false,
        customerCheckoutAllowed: false,
        billingProviderConnected: false
      }
    };
  }
  if (pathname === "/api/v1/forge-heat") {
    return {
      meta: authority,
      data: {
        kind: "forge-heat",
        heatVersion: "FORGE_HEAT_V1",
        serviceVersion: "qa",
        proFeature: true,
        access: { allowed: true, currentPlan: "EARLY_ACCESS", requiredPlan: "PRO", privateBetaPreview: false, accessState: "ACTIVE" },
        authority: { recommendationAuthority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", forgeHeatRecommendationAuthority: false, clientComputed: false, transactionAuthority: false },
        scope: { code: "SAVED_EVALUATED_UNIVERSE", marketWide: false, continuousMarketScannerActive: false, maxSnapshotAgeDays: 30 },
        componentAvailability: {},
        locked: false,
        top5: [],
        hiddenGems: [],
        highestEdge: [],
        summary: { latestEvaluationsConsidered: 1, heatEligible: 1, surfaced: 0, unscored: 0 },
        unscoredPreview: []
      }
    };
  }
  return { meta: authority, data: { kind: "customer-shell-parity", items: [], records: [], opportunities: [] } };
}

function closeEnough(a, b, tolerance = 1.25) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function fail(message, detail) {
  const suffix = detail ? `\n${JSON.stringify(detail, null, 2)}` : "";
  throw new Error(`${message}${suffix}`);
}

async function measure(page, route, viewport) {
  await page.goto(`${base}#/${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#main-content", { timeout: 10_000 });
  await page.waitForTimeout(800);

  return page.evaluate(({ route, viewport }) => {
    const rect = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const sidebar = document.querySelector(".sidebar");
    const topbar = document.querySelector(".topbar");
    const main = document.querySelector("#main-content");
    const root = main?.firstElementChild || null;
    const heading = main?.querySelector("h1") || null;
    const active = [...document.querySelectorAll('.primary-nav a[aria-current="page"]')]
      .map(link => link.getAttribute("data-route") || String(link.textContent || "").trim());
    const titleStyle = heading ? getComputedStyle(heading) : null;
    const rootStyle = root ? getComputedStyle(root) : null;
    return {
      route,
      viewport,
      hash: location.hash,
      sidebar: rect(sidebar),
      topbar: rect(topbar),
      main: rect(main),
      root: rect(root),
      heading: heading ? {
        text: String(heading.textContent || "").replace(/\s+/g, " ").trim(),
        rect: rect(heading),
        fontSize: Number.parseFloat(titleStyle.fontSize),
        lineHeight: titleStyle.lineHeight
      } : null,
      rootDisplay: rootStyle?.display || "",
      active,
      scrollY: window.scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      governanceLoaded: Boolean([...document.styleSheets].find(sheet => String(sheet.href || "").includes("customer-app-governance-v2.css")))
    };
  }, { route, viewport });
}

const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"]
});

const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(String(error?.message || error)));
    await page.route("**/api/v1/**", handler => handler.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(fixture(handler.request()))
    }));

    let baseline = null;
    for (const route of routes) {
      const state = await measure(page, route, viewport.name);
      results.push(state);
      if (!state.governanceLoaded) fail(`${viewport.name}/${route}: customer governance stylesheet is not loaded`, state);
      if (state.hash !== `#/${route}`) fail(`${viewport.name}/${route}: route changed unexpectedly`, state);
      if (!state.root) fail(`${viewport.name}/${route}: customer route rendered no main root`, state);
      if (state.horizontalOverflow > 1) fail(`${viewport.name}/${route}: page has horizontal overflow`, state);
      if (state.scrollY > 1) fail(`${viewport.name}/${route}: route changed the viewport scroll position`, state);

      if (!baseline) baseline = state;
      if (viewport.name !== "mobile") {
        for (const key of ["width", "height"]) {
          if (!closeEnough(state.sidebar?.[key], baseline.sidebar?.[key])) fail(`${viewport.name}/${route}: sidebar ${key} drifted`, { baseline, state });
          if (!closeEnough(state.topbar?.[key], baseline.topbar?.[key])) fail(`${viewport.name}/${route}: topbar ${key} drifted`, { baseline, state });
        }
        if (!closeEnough(state.topbar?.left, baseline.topbar?.left)) fail(`${viewport.name}/${route}: topbar horizontal origin drifted`, { baseline, state });
        if (!closeEnough(state.main?.left, baseline.main?.left)) fail(`${viewport.name}/${route}: workspace horizontal origin drifted`, { baseline, state });
        if (!closeEnough(state.root?.left, baseline.root?.left)) fail(`${viewport.name}/${route}: route content left edge drifted`, { baseline, state });
        if (!closeEnough(state.root?.top, baseline.root?.top)) fail(`${viewport.name}/${route}: route content top edge drifted`, { baseline, state });
      } else if (state.root.left < 14 || state.root.right > state.innerWidth - 14) {
        fail(`mobile/${route}: route content escaped the governed mobile gutters`, state);
      }

      if (state.heading && baseline.heading && !closeEnough(state.heading.fontSize, baseline.heading.fontSize, 0.2)) {
        fail(`${viewport.name}/${route}: customer page title size drifted`, { baseline: baseline.heading, state: state.heading });
      }
      if (state.heading) {
        const [min, max] = viewport.name === "mobile" ? [27, 33] : [30, 39];
        if (state.heading.fontSize < min || state.heading.fontSize > max) {
          fail(`${viewport.name}/${route}: customer page title escaped the governed scale`, state.heading);
        }
      }
    }

    const serious = pageErrors.filter(message => /SyntaxError|Unexpected token|Unexpected identifier/i.test(message));
    if (serious.length) fail(`${viewport.name}: browser syntax errors`, serious);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log("PASS: full customer shell parity is governed across core routes.");
for (const state of results) {
  const heading = state.heading ? `${state.heading.fontSize}px ${state.heading.text}` : "no h1";
  console.log(`${state.viewport.padEnd(7)} ${state.route.padEnd(22)} root=${Math.round(state.root.left)},${Math.round(state.root.top)} topbar=${Math.round(state.topbar.height)}px scrollY=${Math.round(state.scrollY)} overflow=${state.horizontalOverflow}px title=${heading}`);
}
