import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.FLIPFORGE_CHAOS_BASE_URL || "http://goflipforge.com:4173/app/customer/";
const workerCount = Math.max(1, Math.min(6, Number.parseInt(process.env.FLIPFORGE_STRESS_WORKERS || "3", 10) || 3));
const roundsPerWorker = Math.max(20, Math.min(250, Number.parseInt(process.env.FLIPFORGE_STRESS_ROUNDS || "70", 10) || 70));
const baseSeed = (Number.parseInt(process.env.FLIPFORGE_STRESS_SEED || "151515", 10) || 151515) >>> 0;
const reportDir = path.resolve("qa-artifacts/customer-chaos-stress");
const reportPath = path.join(reportDir, "customer-chaos-stress.json");

const routes = [
  "dashboard",
  "discover",
  "evaluate",
  "decision-intelligence",
  "decision-intelligence/why",
  "evidence",
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
  { name: "tablet", width: 1024, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];

const proof = {
  id: "chaos-stress-proof",
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
  observedAt: "2026-09-15T12:00:00Z",
  evidence: { acceptedSales: 3, averagePrice: 500, latestSaleDate: "2026-09-14" }
};

function meta(correlationId = "customer-chaos-stress") {
  return {
    contractVersion: "1.0",
    engineVersion: "customer-chaos-stress-fixture",
    authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence",
    correlationId,
    generatedAt: "2026-09-15T12:00:00Z",
    evidenceFreshness: "CURRENT",
    limitations: ["Synthetic customer chaos/stress fixture only."]
  };
}

function portfolioData() {
  return {
    kind: "portfolio",
    configured: true,
    items: [],
    transactionAuthority: false,
    currentValueConfigured: true,
    performanceConfigured: true,
    currentValueType: "EVIDENCE_SUPPORTED_REFERENCE_NOT_APPRAISAL",
    currentValueMethod: "AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES",
    performanceType: "UNREALIZED_REFERENCE_COMPARISON",
    feesIncluded: false,
    taxesIncluded: false,
    liquidationEstimate: false,
    appraisal: false,
    count: 0,
    totalCostBasisCents: 0,
    referenceValueAvailableCount: 0,
    performanceAvailableCount: 0,
    completeReferenceCoverage: true,
    completePerformanceCoverage: true,
    coveredReferenceValueCents: 0,
    coveredCostBasisCents: 0,
    coveredReferenceDeltaCents: 0,
    completePortfolioReferenceValueCents: 0,
    completePortfolioReferenceDeltaCents: 0
  };
}

function marketViewData() {
  return {
    kind: "market-view",
    marketViewVersion: "MARKET_VIEW_V1",
    readOnly: true,
    scope: { code: "SAVED_EVALUATED_UNIVERSE", label: "Your Market", marketWide: false, continuousMarketScannerActive: false },
    authority: { recommendationAuthority: "Smart Opportunity", marketViewRecommendationAuthority: false, clientComputed: false, transactionAuthority: false },
    transactionAuthority: false,
    summary: { evaluatedCards: 1, actionableSavedDecisions: 1, actionableSharePct: 100, positiveSupportedValueGap: 0, positiveGapSharePct: 0, freshWithin30Days: 1, freshnessPct: 100 },
    decisionMix: { BUY: 0, WATCH: 0, VERIFY: 1, PASS: 0, OTHER: 0 },
    evidenceHealth: { strongEvidenceCards: 1, strongEvidencePct: 100, averageExactTrustedSales: 3, averageConfidence: 72, averageRisk: 38 },
    valueContext: { profitOrRoi: false, topPositiveGap: [], medianPositiveGapPct: 0 },
    outcomeCoverage: {
      "7": { horizonDays: 7, observed: 0, eligible: 1, coveragePct: 0 },
      "14": { horizonDays: 14, observed: 0, eligible: 1, coveragePct: 0 },
      "30": { horizonDays: 30, observed: 0, eligible: 1, coveragePct: 0 }
    },
    broaderMarket: { available: false, marketWideVolume: false, marketWideMomentum: false, marketPriceIndex: false, reason: "Synthetic stress fixture." }
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
    return { meta: authority, data: { kind: "evidence", opportunityId: proof.id, cardIdentity: proof.cardIdentity, acceptedExactCompletedSales: 3, visibleButAuthorityIneligible: 1, linkedEvidence: [{ authorityEligible: true, salePrice: 500 }], timeline: [] } };
  }
  if (pathname.startsWith("/api/v1/psa-advisor/")) {
    return { meta: authority, data: { kind: "psa-advisor", opportunityId: proof.id, guidanceStatus: "CONTEXT_AVAILABLE", populationContext: { available: true, psa10Population: 1250, psa9Population: 840, totalPopulation: 2090 }, recalculated: false } };
  }
  if (pathname === "/api/v1/lifecycle") {
    return { meta: authority, data: { kind: "lifecycle", items: [] } };
  }
  if (pathname === "/api/v1/alerts") {
    return { meta: authority, data: { kind: "alerts", items: [], records: [] } };
  }
  if (pathname === "/api/v1/portfolio") {
    return { meta: authority, data: portfolioData() };
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
        serviceVersion: "stress",
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
  if (pathname === "/api/v1/market-view") {
    return { meta: authority, data: marketViewData() };
  }
  if (pathname === "/api/v1/discover") {
    return { meta: authority, data: { kind: "discover", readOnly: true, query: "stress", requestedLimit: 25, targetMaxBuyCents: 0, transactionAuthority: false, candidateCount: 0, exactCandidateCount: 0, identityReviewCandidateCount: 0, evidenceSupportedCount: 0, evidenceSupportedBestAvailable: false, items: [] } };
  }
  return { meta: authority, data: { kind: "customer-chaos-stress", items: [], records: [], opportunities: [], alerts: [], cards: [] } };
}

function makeRandom(seed) {
  let state = seed || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length) % values.length];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isNavigationContextError(error) {
  return /execution context was destroyed|most likely because of a navigation|cannot find context with specified id|frame was detached/i.test(String(error?.message || error || ""));
}

async function evaluateStable(page, fn, arg, attempts = 6) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await page.evaluate(fn, arg);
    } catch (error) {
      lastError = error;
      if (!isNavigationContextError(error)) throw error;
      await page.waitForTimeout(40 + attempt * 35);
    }
  }
  throw lastError || new Error("Browser execution context did not stabilize");
}

async function fireNavigation(page, fn, arg) {
  try {
    await page.evaluate(fn, arg);
  } catch (error) {
    if (!isNavigationContextError(error)) throw error;
  }
}

async function poll(predicate, message, timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await predicate()) return;
    } catch (_) {
      // SPA transitions may replace the execution context while the target route settles.
    }
    await sleep(40);
  }
  throw new Error(message);
}

async function setHashConfirmed(page, target, timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (page.url().includes(`#/${target}`)) return;
    try {
      await page.evaluate(route => { window.location.hash = `#/${route}`; }, target);
    } catch (error) {
      if (!isNavigationContextError(error)) throw error;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`confirmed hash navigation did not settle on ${target}`);
}

async function mutationDelta(page, sampleMs = 220) {
  const start = await evaluateStable(page, () => Number(window.__ffChaosStress?.mutations || 0));
  await page.waitForTimeout(sampleMs);
  const end = await evaluateStable(page, () => Number(window.__ffChaosStress?.mutations || 0));
  return Math.max(0, end - start);
}

async function meaningfulWorkspace(page) {
  return evaluateStable(page, () => {
    const main = document.querySelector("#main-content");
    const root = main?.firstElementChild || null;
    const text = String(main?.textContent || "").replace(/\s+/g, " ").trim();
    return Boolean(main && root && text.length > 0);
  });
}

async function assertHealthy(page, expectedRoute, worker, action, mutationThreshold) {
  await poll(() => page.url().includes(`#/${expectedRoute}`), `worker ${worker}: route did not settle on ${expectedRoute}`);
  await page.locator("#main-content").waitFor({ state: "attached", timeout: 6000 });
  await poll(() => meaningfulWorkspace(page), `worker ${worker}: ${action} left a blank customer workspace on ${expectedRoute}`, 2500);
  await page.waitForTimeout(80);

  const state = await evaluateStable(page, route => {
    const main = document.querySelector("#main-content");
    const root = main?.firstElementChild || null;
    return {
      route,
      hash: location.hash,
      mainPresent: Boolean(main),
      rootPresent: Boolean(root),
      mainTextLength: String(main?.textContent || "").replace(/\s+/g, " ").trim().length,
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      scrollY: window.scrollY,
      readyState: document.readyState,
      visualSystemLoaded: Boolean([...document.styleSheets].find(sheet => String(sheet.href || "").includes("customer-app-system-v2.css")))
    };
  }, expectedRoute);

  if (state.hash !== `#/${expectedRoute}`) throw new Error(`worker ${worker}: ${action} left hash ${state.hash}, expected #/${expectedRoute}`);
  if (!state.mainPresent || !state.rootPresent || state.mainTextLength < 1) throw new Error(`worker ${worker}: ${action} rendered a blank customer workspace on ${expectedRoute}`);
  if (state.overflow > 2) throw new Error(`worker ${worker}: ${action} created ${state.overflow}px horizontal overflow on ${expectedRoute}`);
  if (!state.visualSystemLoaded) throw new Error(`worker ${worker}: ${action} lost the governed customer visual system on ${expectedRoute}`);

  const delta = await mutationDelta(page);
  if (delta > mutationThreshold) {
    throw new Error(`worker ${worker}: ${action} detected a DOM mutation storm on ${expectedRoute}: ${delta} mutations/220ms (threshold ${mutationThreshold})`);
  }

  await Promise.race([
    evaluateStable(page, () => new Promise(resolve => requestAnimationFrame(() => resolve(true)))),
    sleep(1500).then(() => { throw new Error(`worker ${worker}: ${action} event loop did not reach animation frame on ${expectedRoute}`); })
  ]);
}

async function navigate(page, target, mode, random) {
  if (mode === "click") {
    const link = page.locator(`a[href="#/${target}"]:visible`).first();
    if (await link.count()) {
      let clicked = false;
      try {
        await link.click({ timeout: 3000 });
        clicked = true;
      } catch (error) {
        if (!isNavigationContextError(error)) {
          const message = String(error?.message || error || "");
          if (!/element is not attached|not visible|intercepts pointer events|timeout/i.test(message)) throw error;
        }
      }
      if (clicked) {
        await poll(() => page.url().includes(`#/${target}`), `clicked navigation did not settle on ${target}`);
      } else {
        await setHashConfirmed(page, target);
      }
    } else {
      await setHashConfirmed(page, target);
    }
  } else {
    await setHashConfirmed(page, target);
  }
  if (random() < 0.35) await page.waitForTimeout(Math.floor(random() * 30));
}

async function runWorker(browser, workerIndex, seed) {
  const random = makeRandom(seed);
  const viewport = viewports[workerIndex % viewports.length];
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const history = [];
  const pageErrors = [];
  const seriousConsoleErrors = [];
  let currentRoute = "dashboard";
  let mutationThreshold = 700;

  page.on("pageerror", error => pageErrors.push(String(error?.message || error)));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Uncaught|TypeError|ReferenceError|RangeError|SyntaxError|Maximum call stack|too much recursion|Unhandled/i.test(text)) {
      seriousConsoleErrors.push(text);
    }
  });

  await page.addInitScript(() => {
    window.__ffChaosStress = { mutations: 0 };
    const attach = () => {
      if (!document.documentElement || window.__ffChaosStress.observing) return;
      const observer = new MutationObserver(records => {
        window.__ffChaosStress.mutations += records.length;
      });
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      window.__ffChaosStress.observing = true;
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attach, { once: true });
    else attach();
  });

  await page.route("**/api/v1/**", handler => handler.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(fixture(handler.request()))
  }));

  try {
    await page.goto(`${base}#/dashboard`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("#main-content").waitFor({ state: "attached", timeout: 8000 });
    await page.waitForTimeout(500);
    const baselineMutations = await mutationDelta(page, 250);
    mutationThreshold = Math.max(700, baselineMutations * 12 + 200);
    await assertHealthy(page, currentRoute, workerIndex, "baseline", mutationThreshold);

    for (let round = 0; round < roundsPerWorker; round += 1) {
      const actionRoll = random();
      let action = "navigate-hash";
      let expectedRoute = currentRoute;
      const trace = { round, action: "pending", from: currentRoute, target: currentRoute, status: "RUNNING" };
      history.push(trace);

      if (actionRoll < 0.34) {
        action = "navigate-click";
        expectedRoute = pick(random, routes);
        trace.action = action;
        trace.target = expectedRoute;
        await navigate(page, expectedRoute, "click", random);
      } else if (actionRoll < 0.58) {
        action = "navigate-hash";
        expectedRoute = pick(random, routes);
        trace.action = action;
        trace.target = expectedRoute;
        await navigate(page, expectedRoute, "hash", random);
      } else if (actionRoll < 0.70) {
        action = "rapid-route-burst";
        const burst = Array.from({ length: 4 + Math.floor(random() * 5) }, () => pick(random, routes));
        expectedRoute = burst.at(-1);
        trace.action = action;
        trace.target = expectedRoute;
        trace.burst = burst;
        for (const route of burst.slice(0, -1)) {
          await fireNavigation(page, nextRoute => { window.location.hash = `#/${nextRoute}`; }, route);
          await page.waitForTimeout(2);
        }
        await setHashConfirmed(page, expectedRoute);
        await page.waitForTimeout(180);
      } else if (actionRoll < 0.80) {
        action = "history-back-forward";
        const first = pick(random, routes);
        let second = pick(random, routes);
        if (second === first) second = routes[(routes.indexOf(first) + 1) % routes.length];
        trace.action = action;
        trace.target = second;
        trace.historyPair = [first, second];
        await navigate(page, first, "hash", random);
        await navigate(page, second, "hash", random);
        try {
          await page.goBack({ timeout: 3500 });
        } catch (error) {
          if (!isNavigationContextError(error) && !/timeout/i.test(String(error?.message || error || ""))) throw error;
        }
        await poll(() => page.url().includes(`#/${first}`), `history.back() did not settle on ${first}`);
        try {
          await page.goForward({ timeout: 3500 });
        } catch (error) {
          if (!isNavigationContextError(error) && !/timeout/i.test(String(error?.message || error || ""))) throw error;
        }
        await poll(() => page.url().includes(`#/${second}`), `history.forward() did not settle on ${second}`);
        expectedRoute = second;
      } else if (actionRoll < 0.88) {
        action = "reload";
        expectedRoute = currentRoute;
        trace.action = action;
        trace.target = expectedRoute;
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
        await poll(() => page.url().includes(`#/${expectedRoute}`), `reload did not preserve ${expectedRoute}`);
      } else if (actionRoll < 0.94) {
        action = "viewport-churn";
        const nextViewport = pick(random, viewports);
        trace.action = action;
        trace.target = currentRoute;
        trace.viewport = nextViewport.name;
        await page.setViewportSize({ width: nextViewport.width, height: nextViewport.height });
        expectedRoute = currentRoute;
      } else {
        action = "stale-storage-recovery";
        expectedRoute = "discover";
        const malformed = random() < 0.5;
        trace.action = action;
        trace.target = expectedRoute;
        trace.malformed = malformed;
        await evaluateStable(page, ({ malformed: broken }) => {
          sessionStorage.setItem("flipforge.discover.lastSearch.v2", broken ? "{broken-json" : JSON.stringify({ exactCardQuery: "stale-card", grade: "PSA 10", observedAt: 0 }));
          sessionStorage.setItem("flipforge.discover.resetLimit.v2", broken ? "not-a-number" : "999999");
        }, { malformed });
        await navigate(page, expectedRoute, "hash", random);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
        await poll(() => page.url().includes("#/discover"), "Discover did not recover after stale storage reload");
      }

      currentRoute = expectedRoute;
      trace.route = currentRoute;
      trace.url = page.url();
      await assertHealthy(page, currentRoute, workerIndex, action, mutationThreshold);
      trace.status = "PASS";

      if (pageErrors.length) throw new Error(`worker ${workerIndex}: browser pageerror after ${action}: ${pageErrors.at(-1)}`);
      if (seriousConsoleErrors.length) throw new Error(`worker ${workerIndex}: serious console error after ${action}: ${seriousConsoleErrors.at(-1)}`);
    }

    const stableRoute = currentRoute;
    const sibling = await context.newPage();
    await sibling.route("**/api/v1/**", handler => handler.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(fixture(handler.request()))
    }));
    await sibling.goto(`${base}#/market-view`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await poll(() => sibling.url().includes("#/market-view"), "sibling tab did not reach market-view");
    if (!page.url().includes(`#/${stableRoute}`)) throw new Error(`worker ${workerIndex}: sibling tab navigation changed the original tab route`);
    await sibling.close();

    return {
      worker: workerIndex,
      seed,
      viewport: viewport.name,
      rounds: roundsPerWorker,
      mutationThreshold,
      status: "PASS",
      finalRoute: currentRoute,
      pageErrors,
      seriousConsoleErrors,
      history
    };
  } catch (error) {
    const running = history.findLast?.(entry => entry.status === "RUNNING");
    if (running) {
      running.status = "FAIL";
      running.url = page.url();
      running.message = error?.message || String(error);
    }
    return {
      worker: workerIndex,
      seed,
      viewport: viewport.name,
      rounds: roundsPerWorker,
      mutationThreshold,
      status: "FAIL",
      finalRoute: currentRoute,
      message: error?.message || String(error),
      pageErrors,
      seriousConsoleErrors,
      history
    };
  } finally {
    await context.close();
  }
}

await fs.mkdir(reportDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"]
});

let results = [];
try {
  results = await Promise.all(
    Array.from({ length: workerCount }, (_, index) => runWorker(browser, index, (baseSeed + Math.imul(index + 1, 0x9e3779b1)) >>> 0))
  );
} finally {
  await browser.close();
}

const failed = results.filter(result => result.status !== "PASS");
const report = {
  audit: "FlipForge Customer Chaos Stress Audit",
  generatedAt: new Date().toISOString(),
  base,
  baseSeed,
  workerCount,
  roundsPerWorker,
  totalRandomizedActions: workerCount * roundsPerWorker,
  passed: failed.length === 0,
  workers: results
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("FlipForge Customer Chaos Stress Audit");
console.log(`Seed: ${baseSeed}`);
console.log(`Workers: ${workerCount}`);
console.log(`Rounds per worker: ${roundsPerWorker}`);
console.log(`Randomized actions: ${workerCount * roundsPerWorker}`);
console.log(`Report: ${reportPath}`);
for (const result of results) {
  console.log(`${result.status} | worker=${result.worker} seed=${result.seed} viewport=${result.viewport} final=${result.finalRoute}${result.message ? ` | ${result.message}` : ""}`);
}
if (failed.length) {
  console.log("Reproduce with the printed base seed and the same worker/round settings.");
  process.exit(1);
}
console.log("PASS | randomized route churn, history churn, reloads, viewport changes, stale storage recovery, cross-tab isolation, event-loop liveness, and DOM mutation-storm detection remained healthy");
