import { chromium } from "playwright";

const host = "http://goflipforge.com:4173";
const fullUrl = `${host}/app/customer/#/dashboard`;
const betaUrl = `${host}/saas-prototype/#/dashboard`;

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 }
];
const fullTopLevel = [
  "dashboard",
  "discover",
  "evaluate",
  "decision-intelligence",
  "why-this-decision",
  "evidence",
  "opportunities",
  "tracking",
  "portfolio",
  "alerts",
  "forge-heat",
  "market-view"
];
const fullAdvanced = ["compare", "psa-advisor", "export"];
const betaTopLevel = ["dashboard", "discover", "opportunities", "tracking"];
const fullOnlyNav = [
  "evaluate", "decision-intelligence", "why-this-decision", "evidence",
  "portfolio", "alerts", "forge-heat", "market-view"
];

const proof = {
  id: "navigation-parity-proof",
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
  changeSummary: "A stronger exact-sale evidence set could change this decision.",
  observedAt: "2026-09-15T10:00:00Z",
  evidence: { acceptedSales: 3, averagePrice: 500, latestSaleDate: "2026-09-14" }
};

function meta(request) {
  return {
    contractVersion: "1.0",
    engineVersion: "navigation-parity-fixture",
    authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence",
    correlationId: request.headers()["x-correlation-id"] || "navigation-parity",
    generatedAt: "2026-09-15T10:00:00Z",
    evidenceFreshness: "CURRENT",
    limitations: ["Synthetic browser-audit fixture only."]
  };
}

function fixture(request) {
  const url = new URL(request.url());
  const path = url.pathname;
  const authority = meta(request);
  if (path === "/api/v1/health") {
    return { meta: authority, data: { status: "configured", bridgeEnabled: true, authenticationRequired: false } };
  }
  if (path === "/api/v1/opportunities") {
    return { meta: authority, data: { kind: "opportunities", items: [proof] } };
  }
  if (path === `/api/v1/opportunities/${proof.id}`) {
    return { meta: authority, data: { kind: "opportunity", opportunity: proof } };
  }
  if (path.startsWith("/api/v1/evidence/")) {
    return {
      meta: authority,
      data: {
        kind: "evidence",
        opportunityId: proof.id,
        cardIdentity: proof.cardIdentity,
        acceptedExactCompletedSales: 3,
        visibleButAuthorityIneligible: 1,
        linkedEvidence: [
          { sourceName: "Audit sale", type: "SOLD_COMP", amount: 500, salePrice: 500, soldAt: "2026-09-14", identityMatch: true, authorityEligible: true },
          { sourceName: "Excluded active ask", type: "ACTIVE_LISTING", amount: 525, identityMatch: true, authorityEligible: false, rejectionReason: "Not a completed sale" }
        ],
        timeline: [],
        manualCandidates: []
      }
    };
  }
  if (path.startsWith("/api/v1/psa-advisor/")) {
    return { meta: authority, data: { kind: "psa-advisor", opportunityId: proof.id, guidanceStatus: "CONTEXT_AVAILABLE", populationContext: { available: true }, recalculated: false } };
  }
  if (path === "/api/v1/entitlements") {
    return { meta: authority, data: { kind: "entitlements", readOnly: true, transactionAuthority: false, current: { code: "EARLY_ACCESS", name: "Early Access", accessState: "ACTIVE" }, usage: { completedEvaluations: 1 }, plannedCommercialPlans: [], checkoutAvailable: false } };
  }
  if (path === "/api/v1/dashboard") {
    return { meta: authority, data: { metrics: { trackedOpportunities: 1, evidenceReady: 1, populationContextAvailable: 1, needsVerification: 1 } } };
  }
  if (path === "/api/v1/forge-heat") {
    return { meta: authority, data: { kind: "forge-heat", locked: false, top5: [], hiddenGems: [], highestEdge: [], summary: {}, unscoredPreview: [] } };
  }
  return { meta: authority, data: { kind: "navigation-parity", items: [], records: [], opportunities: [] } };
}

function fail(message, detail = null) {
  throw new Error(detail ? `${message}\n${JSON.stringify(detail, null, 2)}` : message);
}

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function semanticLabel(value) {
  return String(value || "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function shellState(page) {
  return page.evaluate(() => {
    const visible = element => {
      if (!element || element.hidden || element.getAttribute("aria-hidden") === "true") return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    const nav = document.querySelector(".primary-nav");
    const top = [...(nav?.querySelectorAll(":scope > a[data-route]") || [])];
    const advanced = nav?.querySelector(":scope > .ff-advanced-nav") || null;
    const controls = document.querySelector("#main-content .ff-di-controls");
    const grid = document.querySelector("#main-content .ff-di-grid");
    return {
      path: location.pathname,
      hash: location.hash,
      chip: document.querySelector(".prototype-chip")?.textContent?.trim() || "",
      parity: nav?.dataset.ffCustomerNavigationParity || "",
      topLevelAll: top.map(link => String(link.dataset.route || "")),
      topLevelVisible: top.filter(visible).map(link => String(link.dataset.route || "")),
      coreVisible: top.filter(link => link.hasAttribute("data-ff-customer-core") && visible(link)).map(link => String(link.dataset.route || "")),
      labels: Object.fromEntries(top.map(link => [String(link.dataset.route || ""), String(link.textContent || "").replace(/\s+/g, " ").trim()])),
      advancedHidden: !advanced || !visible(advanced),
      advancedRoutes: [...(advanced?.querySelectorAll("a[data-route]") || [])].map(link => String(link.dataset.route || "")),
      active: [...(nav?.querySelectorAll('a[data-route][aria-current="page"]') || [])].map(link => String(link.dataset.route || "")),
      mainText: String(document.querySelector("#main-content")?.textContent || "").replace(/\s+/g, " ").trim(),
      mainTitle: String(document.querySelector("#main-content h1")?.textContent || "").replace(/\s+/g, " ").trim(),
      whyFocused: document.documentElement.classList.contains("ff-customer-why-decision-view"),
      whyRuntime: Boolean(window.FlipForgeCustomerWhyDecisionViewV1),
      whyMarker: document.querySelector("#main-content .ff-di-page")?.dataset.ffCustomerWhyDecisionView || "",
      whyActions: [...document.querySelectorAll("[data-ff-customer-why-actions] a")].map(link => link.getAttribute("href") || ""),
      controlsDisplay: controls ? getComputedStyle(controls).display : "",
      gridDisplay: grid ? getComputedStyle(grid).display : ""
    };
  });
}

const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"]
});

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(String(error?.message || error)));
    await page.route("**/api/v1/**", route => route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(fixture(route.request()))
    }));

    const mobile = viewport.name === "mobile";
    const expectedFullVisible = mobile ? [...fullTopLevel, "account"] : fullTopLevel;
    const expectedBetaVisible = mobile ? [...betaTopLevel, "account"] : betaTopLevel;

    await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector(".primary-nav", { timeout: 10_000 });
    await page.waitForTimeout(1000);
    let state = await shellState(page);
    if (state.chip !== "CUSTOMER APP") fail(`${viewport.name}: full customer shell lost CUSTOMER APP identity`, state);
    if (state.parity !== "v1") fail(`${viewport.name}: full customer parity controller did not apply`, state);
    if (!same(state.topLevelVisible, expectedFullVisible)) fail(`${viewport.name}: full customer top-level navigation is incomplete, duplicated, or out of order`, state);
    if (!same(state.coreVisible, fullTopLevel)) fail(`${viewport.name}: full customer core-route markers do not match the canonical hierarchy`, state);
    if (!same(state.advancedRoutes, fullAdvanced)) fail(`${viewport.name}: full customer Advanced analysis overlaps or is incomplete`, state);
    if (state.advancedHidden) fail(`${viewport.name}: full customer Advanced analysis is hidden`, state);
    if (semanticLabel(state.labels["why-this-decision"]) !== "Why This Decision") fail(`${viewport.name}: Why This Decision label is missing or changed`, state);
    if (semanticLabel(state.labels.evidence) !== "Evidence Review") fail(`${viewport.name}: Evidence Review label is missing or changed`, state);
    if (mobile && semanticLabel(state.labels.account) !== "Account") fail("mobile: full customer Account navigation is missing or changed", state);
    if (new Set(state.topLevelAll).size !== state.topLevelAll.length) fail(`${viewport.name}: full customer contains duplicate top-level route keys`, state);

    await page.evaluate(() => { location.hash = "#/sell"; });
    await page.waitForTimeout(500);
    state = await shellState(page);
    if (state.hash !== "#/tracking") fail(`${viewport.name}: Exit Review direct route was not withheld`, state);
    if (state.advancedRoutes.includes("sell")) fail(`${viewport.name}: Exit Review leaked into Advanced analysis`, state);

    await page.evaluate(() => { location.hash = "#/decision-intelligence/why"; });
    await page.waitForTimeout(1300);
    state = await shellState(page);
    if (state.hash !== "#/decision-intelligence/why") fail(`${viewport.name}: Why This Decision subview rewrote the route`, state);
    if (!same(state.active, ["why-this-decision"])) fail(`${viewport.name}: Why This Decision does not own active navigation state`, state);
    if (!state.whyFocused || !state.whyRuntime || state.whyMarker !== "v1") fail(`${viewport.name}: focused Why presentation did not activate`, state);
    if (state.mainTitle !== "Why FlipForge made this decision.") fail(`${viewport.name}: Why presentation did not become explanation-first`, state);
    if (state.controlsDisplay !== "none" || state.gridDisplay !== "none") fail(`${viewport.name}: Why presentation still exposes the full analysis controls/grid`, state);
    if (!same(state.whyActions, ["#/decision-intelligence", "#/evidence"])) fail(`${viewport.name}: Why presentation lost governed analysis/evidence handoffs`, state);
    if (!/decision|evidence|why/i.test(state.mainText) || state.mainText.length < 80) fail(`${viewport.name}: Why This Decision rendered a blank or unrelated workspace`, state);

    await page.evaluate(() => { location.hash = "#/evidence"; });
    await page.waitForTimeout(1000);
    state = await shellState(page);
    if (!state.active.includes("evidence")) fail(`${viewport.name}: Evidence Review does not own active navigation state`, state);
    if (state.whyFocused) fail(`${viewport.name}: focused Why presentation leaked into Evidence Review`, state);
    if (!/Evidence/i.test(state.mainText) || state.mainText.length < 60) fail(`${viewport.name}: Evidence Review rendered a blank workspace`, state);

    await page.goto(betaUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector(".primary-nav", { timeout: 10_000 });
    await page.waitForTimeout(1000);
    state = await shellState(page);
    if (state.chip !== "PRIVATE BETA") fail(`${viewport.name}: private beta shell lost PRIVATE BETA identity`, state);
    if (state.parity) fail(`${viewport.name}: full-customer parity controller leaked into private beta`, state);
    if (state.whyRuntime || state.whyFocused) fail(`${viewport.name}: focused Why presentation leaked into private beta`, state);
    if (!same(state.topLevelVisible, expectedBetaVisible)) fail(`${viewport.name}: private beta navigation expanded or lost its simplified core`, state);
    if (!state.advancedHidden) fail(`${viewport.name}: Advanced analysis leaked into private beta`, state);
    if (mobile && semanticLabel(state.labels.account) !== "Account") fail("mobile: private beta Account navigation is missing or changed", state);
    for (const route of fullOnlyNav) {
      if (state.topLevelVisible.includes(route) || state.coreVisible.includes(route)) fail(`${viewport.name}: full-customer route leaked into private beta navigation: ${route}`, state);
    }
    if (semanticLabel(state.labels.discover) !== "Evaluate a Card") {
      fail(`${viewport.name}: private beta Discover route no longer presents as the simplified Evaluate action`, state);
    }

    const serious = pageErrors.filter(message => /SyntaxError|Unexpected token|Unexpected identifier|Maximum call stack/i.test(message));
    if (serious.length) fail(`${viewport.name}: navigation parity browser audit observed serious runtime errors`, serious);
    await context.close();
  }

  console.log("PASS: full customer CDI navigation is complete, explanation-focused, deduplicated, mobile-safe, and isolated from private beta navigation.");
} finally {
  await browser.close();
}
