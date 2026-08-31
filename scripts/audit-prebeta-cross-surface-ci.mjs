import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const email = "prebeta-cross-surface@flipforge.test";
const reportDir = path.resolve("qa-artifacts/prebeta-cross-surface");
const reportPath = path.join(reportDir, "cross-surface-audit.json");
const scenarios = [];
const failures = [];
const calls = [];
let marketRevision = 1;
let badMarketAuthority = false;

const opportunityA = {
  id: "qa-a",
  title: "Saved Ohtani decision",
  cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  recommendation: "WATCH",
  ask: 100,
  supportedValue: 125,
  discountPercent: 20,
  confidence: 82,
  liquidity: 76,
  risk: 28,
  rank: 84,
  mappingState: "CONFIRMED",
  workflowStatus: "TRACKING",
  evidence: { acceptedSales: 4 },
  population: { available: true, psa10Population: 1200 }
};

const opportunityB = {
  id: "qa-b",
  title: "Saved Acuna decision",
  cardIdentity: "2018 Topps Update Ronald Acuna Jr. #US250 PSA 10",
  recommendation: "BUY",
  ask: 90,
  supportedValue: 120,
  discountPercent: 25,
  confidence: 88,
  liquidity: 81,
  risk: 22,
  rank: 91,
  mappingState: "CONFIRMED",
  workflowStatus: "TRACKING",
  evidence: { acceptedSales: 5 },
  population: { available: true, psa10Population: 900 }
};

const opportunities = [opportunityA, opportunityB];

const lifecycleItems = [
  {
    opportunityId: "qa-a",
    trackingStatus: "REVIEW",
    reviewAt: "2030-09-01T15:00:00Z",
    outcomeStatus: "NONE",
    acquisitionCostCents: null,
    acquiredAt: null,
    dispositionProceedsCents: null,
    disposedAt: null,
    alertEnabled: true,
    version: 2
  },
  {
    opportunityId: "qa-b",
    trackingStatus: "WATCHING",
    reviewAt: "2030-09-02T15:00:00Z",
    outcomeStatus: "NONE",
    acquisitionCostCents: null,
    acquiredAt: null,
    dispositionProceedsCents: null,
    disposedAt: null,
    alertEnabled: false,
    version: 1
  }
];

function envelope(correlationId, data, authority = "Smart Opportunity") {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "prebeta-cross-surface-audit",
      authority,
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      generatedAt: "2026-08-31T21:00:00Z",
      evidenceFreshness: "QA_FIXTURE",
      limitations: ["Synthetic destructive cross-surface audit fixture only."]
    },
    data
  };
}

function evidenceData(id) {
  return {
    kind: "evidence",
    opportunityId: id,
    acceptedExactCompletedSales: id === "qa-a" ? 4 : 5,
    visibleButAuthorityIneligible: 1,
    linkedEvidence: [
      {
        sourceName: "Authorized QA sold evidence",
        type: "SOLD_COMP",
        amount: id === "qa-a" ? 118 : 116,
        soldAt: "2026-08-25",
        identityMatch: true,
        authorityEligible: true
      }
    ],
    manualCandidates: [
      {
        saleTitle: "QA candidate retained for review",
        cardIdentity: opportunities.find(item => item.id === id)?.cardIdentity || id,
        sourceMarketplace: "QA",
        salePrice: 115,
        saleDate: "2026-08-20",
        matchConfidence: 72,
        linkedToOpportunity: false
      }
    ],
    timeline: []
  };
}

function psaData(id) {
  const opportunity = opportunities.find(item => item.id === id) || opportunityA;
  return {
    kind: "psa-advisor",
    opportunityId: id,
    guidanceStatus: "SAVED_GUIDANCE_AVAILABLE",
    authoritativeOpportunityRecommendation: opportunity.recommendation,
    savedPsaSnapshot: {
      readinessStatus: "REVIEW_READY",
      manualVerificationRequired: false,
      evidenceRefreshRequired: false,
      freshCompEvidenceRequired: false,
      additionalSnapshotRequired: false
    },
    populationContext: {
      available: true,
      psa10Population: opportunity.population?.psa10Population || 0,
      displayOnly: true
    },
    recalculated: false
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

function forgeHeatData() {
  return {
    kind: "forge-heat",
    heatVersion: "FORGE_HEAT_V1",
    proFeature: true,
    access: { allowed: false, requiredPlan: "PRO", currentPlan: "PRIVATE_BETA" },
    authority: {
      recommendationAuthority: "Smart Opportunity",
      forgeHeatRecommendationAuthority: false,
      clientComputed: false,
      transactionAuthority: false
    },
    scope: {
      code: "SAVED_EVALUATED_UNIVERSE",
      marketWide: false,
      continuousMarketScannerActive: false
    },
    locked: true,
    top5: [],
    hiddenGems: [],
    highestEdge: [],
    upgradeMessage: "Forge Heat remains locked in this synthetic audit fixture."
  };
}

function marketViewData() {
  const evaluatedCards = marketRevision;
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
      evaluatedCards,
      actionableSavedDecisions: 1,
      actionableSharePct: 50,
      positiveSupportedValueGap: 0,
      positiveGapSharePct: 0,
      freshWithin30Days: evaluatedCards,
      freshnessPct: 100
    },
    decisionMix: { BUY: 1, WATCH: 0, VERIFY: 0, PASS: 0, OTHER: 0 },
    evidenceHealth: {
      strongEvidenceCards: 1,
      strongEvidencePct: 100,
      averageExactTrustedSales: 4,
      averageConfidence: 85,
      averageRisk: 25
    },
    valueContext: {
      profitOrRoi: false,
      topPositiveGap: [],
      medianPositiveGapPct: 0
    },
    outcomeCoverage: {
      "7": { horizonDays: 7, observed: 0, eligible: 1, coveragePct: 0 },
      "14": { horizonDays: 14, observed: 0, eligible: 1, coveragePct: 0 },
      "30": { horizonDays: 30, observed: 0, eligible: 1, coveragePct: 0 }
    },
    broaderMarket: {
      available: false,
      marketWideVolume: false,
      marketWideMomentum: false,
      marketPriceIndex: false
    }
  };
}

function compareData() {
  return {
    kind: "comparison",
    count: 2,
    sameExactCardIdentity: false,
    comparisonBoundary: "Saved records remain independent. No winner, reranking, or new recommendation is created.",
    items: [opportunityA, opportunityB]
  };
}

function accountHash(value) {
  let hash = 2166136261;
  const text = String(value || "anonymous").trim().toLowerCase();
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function requestBody(request) {
  try { return request.postDataJSON(); } catch (_) { return {}; }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function poll(predicate, message, timeoutMs = 7000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await predicate()) return;
    } catch (_) {
      // A route transition may briefly destroy the old execution context.
    }
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error(message);
}

async function runScenario(name, fn) {
  const started = Date.now();
  try {
    await fn();
    scenarios.push({ name, status: "PASS", durationMs: Date.now() - started });
    console.log(`PASS | ${name}`);
  } catch (error) {
    const message = error?.message || String(error);
    scenarios.push({ name, status: "FAIL", durationMs: Date.now() - started, message });
    failures.push(`${name}: ${message}`);
    console.log(`FAIL | ${name} | ${message}`);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
const page = await context.newPage();

async function openRoute(route, selector) {
  const target = `${baseUrl}/#/${route}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 12_000 });
  await poll(() => page.url().includes(`#/${route}`), `Route ${route} did not settle`);
  if (selector) await page.locator(selector).waitFor({ state: "visible", timeout: 7000 });
}

async function clickRoute(route, selector) {
  const href = `#/${route}`;
  const link = page.locator(`a[href="${href}"]`).first();
  await link.waitFor({ state: "attached", timeout: 7000 });
  await link.click({ force: true });
  await poll(() => page.url().includes(href), `Customer navigation did not reach ${route}`);
  if (selector) await page.locator(selector).waitFor({ state: "visible", timeout: 7000 });
}

function callsFor(pathname) {
  return calls.filter(call => call.path === pathname);
}

try {
  const key = accountHash(email);
  await page.addInitScript(({ key }) => {
    localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.welcome`, "seen");
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.enabled`, "off");
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.steps`, "discover,evaluate,understand,track");
  }, { key });

  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({
      getUser: () => ({ email: "${email}" }),
      getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Pre-beta Cross-Surface Audit", membershipActive: true, membershipConfigured: true })
    });`
  }));

  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: "(() => {})();"
  }));

  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const headers = request.headers();
    const body = requestBody(request);
    const correlationId = headers["x-correlation-id"] || "prebeta-cross-surface";
    calls.push({ method, path: url.pathname, search: url.search, headers, body });

    const fulfill = data => route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(data)
    });

    if (url.pathname === "/api/v1/health") {
      await fulfill({ meta: { contractVersion: "1.0", correlationId }, data: { status: "configured" } });
      return;
    }

    if (url.pathname === "/api/v1/opportunities") {
      await fulfill(envelope(correlationId, { kind: "opportunities", items: opportunities }));
      return;
    }

    if (url.pathname === "/api/v1/lifecycle") {
      await fulfill(envelope(correlationId, { kind: "lifecycle", sourceOfTruth: "SQLite", items: lifecycleItems }));
      return;
    }

    const lifecycleMatch = url.pathname.match(/^\/api\/v1\/lifecycle\/(qa-[ab])$/);
    if (lifecycleMatch) {
      const lifecycle = lifecycleItems.find(item => item.opportunityId === lifecycleMatch[1]);
      await fulfill(envelope(correlationId, { kind: "lifecycle-detail", opportunityId: lifecycleMatch[1], lifecycle, history: [] }));
      return;
    }

    if (url.pathname === "/api/v1/alerts") {
      await fulfill(envelope(correlationId, {
        kind: "alerts",
        configured: true,
        notificationDeliveryConfigured: false,
        items: [{ opportunityId: "qa-a", alertEnabled: true, reviewAt: "2030-09-01T15:00:00Z", trackingStatus: "REVIEW" }]
      }));
      return;
    }

    if (url.pathname === "/api/v1/portfolio") {
      await fulfill(envelope(correlationId, portfolioData()));
      return;
    }

    if (url.pathname === "/api/v1/forge-heat") {
      await fulfill(envelope(correlationId, forgeHeatData()));
      return;
    }

    if (url.pathname === "/api/v1/market-view") {
      await fulfill(envelope(correlationId, marketViewData(), badMarketAuthority ? "Browser Fake" : "Smart Opportunity"));
      return;
    }

    if (url.pathname === "/api/v1/compare") {
      await fulfill(envelope(correlationId, compareData()));
      return;
    }

    const opportunityMatch = url.pathname.match(/^\/api\/v1\/opportunities\/(qa-[ab])$/);
    if (opportunityMatch) {
      const opportunity = opportunities.find(item => item.id === opportunityMatch[1]);
      await fulfill(envelope(correlationId, { kind: "opportunity-detail", opportunity }));
      return;
    }

    const evidenceMatch = url.pathname.match(/^\/api\/v1\/evidence\/(qa-[ab])$/);
    if (evidenceMatch) {
      await fulfill(envelope(correlationId, evidenceData(evidenceMatch[1])));
      return;
    }

    const psaMatch = url.pathname.match(/^\/api\/v1\/psa-advisor\/(qa-[ab])$/);
    if (psaMatch) {
      await fulfill(envelope(correlationId, psaData(psaMatch[1])));
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ error: { code: "QA_NOT_MOCKED", message: `${method} ${url.pathname}` } })
    });
  });

  await runScenario("Alerts renders server-owned reminders without external delivery authority", async () => {
    await openRoute("alerts", ".customer-lifecycle-page");
    expect(await page.locator("#main-content h1").filter({ hasText: "Alerts" }).count() === 1, "Alerts heading did not render");
    expect(callsFor("/api/v1/alerts").length > 0, "Alerts API was not read");
    const text = await page.locator("#main-content").innerText();
    expect(/Email\s*\/\s*push|delivery/i.test(text), "Alerts did not disclose the external-delivery boundary");
  });

  await runScenario("Portfolio renders only governed reference context and no invented holding", async () => {
    await openRoute("portfolio", ".customer-portfolio-page");
    expect(callsFor("/api/v1/portfolio").length > 0, "Portfolio API was not read");
    const text = await page.locator("#main-content").innerText();
    expect(/No owned holdings yet/i.test(text), "Empty governed Portfolio state did not render honestly");
    expect(!/Sample holding|mock holding|fake value/i.test(text), "Portfolio invented a holding or value");
  });

  await runScenario("Portfolio to Alerts transition cannot leave stale Portfolio ownership", async () => {
    await openRoute("portfolio", ".customer-portfolio-page");
    await clickRoute("alerts", ".customer-lifecycle-page");
    expect(await page.locator("#main-content .customer-portfolio-page").count() === 0, "Portfolio DOM survived after Alerts owned the route");
    expect(await page.locator("#main-content h1").filter({ hasText: "Alerts" }).count() === 1, "Alerts did not own the workspace after Portfolio");
  });

  await runScenario("Forge Heat locked state cannot surface fabricated opportunities", async () => {
    await openRoute("forge-heat", ".forge-heat-shell");
    expect(callsFor("/api/v1/forge-heat").length > 0, "Forge Heat API was not read");
    const text = await page.locator("#main-content").innerText();
    expect(/included with FlipForge Pro|Premium intelligence/i.test(text), "Locked Forge Heat state did not render");
    expect(await page.locator("#main-content .forge-heat-card").count() === 0, "Locked Forge Heat fabricated an opportunity card");
  });

  await runScenario("Forge Heat to Market View transition removes stale Heat UI", async () => {
    await openRoute("forge-heat", ".forge-heat-shell");
    await clickRoute("market-view", ".market-view-shell");
    expect(await page.locator("#main-content .forge-heat-shell").count() === 0, "Forge Heat retained route ownership after Market View navigation");
    expect(await page.locator("#main-content h1").filter({ hasText: "Market View" }).count() === 1, "Market View did not own the workspace");
  });

  await runScenario("Market View stays scoped to saved evaluated universe and never claims market-wide intelligence", async () => {
    await openRoute("market-view", ".market-view-shell");
    const text = await page.locator("#main-content").innerText();
    expect(/Your Market/i.test(text), "Market View did not identify the saved-evaluation scope");
    expect(/Broader market scanning is not active yet/i.test(text), "Market View omitted the broader-market boundary");
    expect(!/market-wide scanner active|live market index/i.test(text), "Market View overstated market-wide authority");
  });

  await runScenario("Market View revisit reloads fresh server state instead of cached summary", async () => {
    marketRevision = 1;
    await openRoute("market-view", ".market-view-shell");
    expect((await page.locator("#main-content").innerText()).includes("Evaluated cards"), "Market View summary did not render");
    marketRevision = 2;
    await openRoute("portfolio", ".customer-portfolio-page");
    await openRoute("market-view", ".market-view-shell");
    const text = await page.locator("#main-content").innerText();
    expect(/Evaluated cards\s*2/i.test(text.replace(/\n+/g, " ")), "Market View reused stale cached summary after revisit");
  });

  await runScenario("Compare keeps two saved records independent and creates no winner", async () => {
    await openRoute("compare", ".customer-compare-page");
    await poll(() => callsFor("/api/v1/compare").length > 0, "Compare API did not run");
    const text = await page.locator("#main-content").innerText();
    expect(text.includes(opportunityA.title) && text.includes(opportunityB.title), "Compare did not preserve both saved record identities");
    expect(/No new recommendation|does not rerank|No browser-side score or winner/i.test(text), "Compare omitted its no-winner boundary");
  });

  await runScenario("Compare swap cannot mix or duplicate saved identities", async () => {
    await openRoute("compare", ".customer-compare-page");
    const swap = page.locator("[data-compare-swap]");
    await swap.waitFor({ state: "visible", timeout: 7000 });
    await swap.click();
    const left = await page.locator("#compare-left").inputValue();
    const right = await page.locator("#compare-right").inputValue();
    expect(left !== right, "Compare swap duplicated one saved record into both sides");
    expect(new Set([left, right]).size === 2 && [left, right].every(id => ["qa-a", "qa-b"].includes(id)), "Compare swap mixed an unknown record identity");
  });

  await runScenario("PSA Advisor reads saved guidance and does not recalculate or predict a grade", async () => {
    await openRoute("psa-advisor/qa-a", ".customer-management-page");
    expect(callsFor("/api/v1/psa-advisor/qa-a").length > 0, "PSA Advisor did not read the exact saved record");
    const text = await page.locator("#main-content").innerText();
    expect(/PSA Advisor/i.test(text), "PSA Advisor heading did not render");
    expect(/Recalculated\s*No/i.test(text.replace(/\n+/g, " ")), "PSA Advisor did not expose its saved non-recalculated state");
    expect(/without predicting a grade|never runs or persists a new analysis/i.test(text), "PSA Advisor omitted the no-grade-prediction boundary");
  });

  await runScenario("Evidence Center stays read-only and exact-record scoped", async () => {
    await openRoute("evidence/qa-a", ".customer-management-page");
    expect(callsFor("/api/v1/evidence/qa-a").length > 0, "Evidence Center did not read qa-a evidence");
    const text = await page.locator("#main-content").innerText();
    expect(/Evidence Center/i.test(text), "Evidence Center heading did not render");
    expect(/cannot accept, reject, hold, relink/i.test(text), "Evidence Center omitted the operator-mutation boundary");
    const buttons = (await page.locator("#main-content button").allTextContents()).join(" ");
    expect(!/accept|reject|relink|hold evidence/i.test(buttons), "Evidence Center exposed an operator evidence mutation control");
  });

  await runScenario("Evidence record switch cannot leak the prior card identity", async () => {
    await openRoute("evidence/qa-a", ".customer-management-page");
    const select = page.locator("[data-customer-management-select]");
    await select.waitFor({ state: "visible", timeout: 7000 });
    const before = callsFor("/api/v1/evidence/qa-b").length;
    await select.selectOption("qa-b");
    await poll(() => callsFor("/api/v1/evidence/qa-b").length > before, "Evidence did not load qa-b after switching records");
    expect(page.url().includes("#/evidence/qa-b"), "Evidence route did not preserve the newly selected record id");
  });

  await runScenario("Exit Review uses saved context only and exposes no sell transaction action", async () => {
    await openRoute("sell/qa-a", ".customer-management-page");
    const text = await page.locator("#main-content").innerText();
    expect(/Exit Review/i.test(text), "Exit Review heading did not render");
    expect(/No sell recommendation was created|sell recommendation/i.test(text), "Exit Review omitted its no-new-sell-recommendation boundary");
    const controls = (await page.locator("#main-content a, #main-content button").allTextContents()).join(" ");
    expect(!/create listing|list now|sell now|accept offer|checkout|pay now/i.test(controls), "Exit Review exposed transaction/listing authority");
  });

  await runScenario("Malformed Market View authority fails closed instead of rendering invented intelligence", async () => {
    badMarketAuthority = true;
    await openRoute("market-view", "#main-content");
    await page.locator("#main-content .staging-error").waitFor({ state: "visible", timeout: 7000 });
    const text = await page.locator("#main-content").innerText();
    expect(/authority contract|Market View/i.test(text), "Invalid Market View authority did not fail closed visibly");
    expect(await page.locator("#main-content .market-view-metrics").count() === 0, "Invalid authority still rendered Market View intelligence");
    badMarketAuthority = false;
  });

  await runScenario("Rapid cross-surface route churn settles on the final governed owner", async () => {
    await openRoute("forge-heat", ".forge-heat-shell");
    await clickRoute("market-view", ".market-view-shell");
    await clickRoute("compare", ".customer-compare-page");
    await clickRoute("portfolio", ".customer-portfolio-page");
    await page.waitForTimeout(250);
    expect(page.url().includes("#/portfolio"), "Rapid route churn did not settle on Portfolio");
    expect(await page.locator("#main-content .customer-portfolio-page").count() === 1, "Final Portfolio owner was not stable");
    expect(await page.locator("#main-content .forge-heat-shell, #main-content .market-view-shell, #main-content .customer-compare-page").count() === 0, "A stale prior surface repainted after final route ownership");
  });

  await runScenario("Cross-surface browser requests never supply tenant identity or recommendation transaction authority", async () => {
    const forbiddenHeaders = calls.filter(call => call.headers["x-flipforge-tenant-id"] || call.headers["x-flipforge-user-id"] || call.headers.authorization);
    expect(forbiddenHeaders.length === 0, "Browser supplied forbidden tenant, user, or authorization headers");
    const forbiddenBodies = calls.filter(call => Object.keys(call.body || {}).some(key => /tenantId|userId|transactionAuthority|recommendationAuthority/i.test(key)));
    expect(forbiddenBodies.length === 0, "Browser request body attempted to supply tenant or authority fields");
    const writes = calls.filter(call => !["GET"].includes(call.method));
    expect(writes.length === 0, `Read-only cross-surface audit observed unexpected write methods: ${writes.map(call => `${call.method} ${call.path}`).join(", ")}`);
  });
} finally {
  await fs.mkdir(reportDir, { recursive: true });
  const report = {
    audit: "FlipForge Pre-Beta Destructive Cross-Surface Audit",
    generatedAt: new Date().toISOString(),
    baseUrl,
    scenarioCount: scenarios.length,
    passedCount: scenarios.filter(item => item.status === "PASS").length,
    failedCount: failures.length,
    passed: failures.length === 0,
    surfaces: ["alerts", "portfolio", "forge-heat", "market-view", "compare", "psa-advisor", "evidence", "sell"],
    scenarios,
    requestSummary: calls.reduce((summary, call) => {
      summary[`${call.method} ${call.path}`] = (summary[`${call.method} ${call.path}`] || 0) + 1;
      return summary;
    }, {}),
    failures
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await context.close();
  await browser.close();
}

console.log("FlipForge Pre-Beta Destructive Cross-Surface Audit");
console.log(`Scenarios: ${scenarios.length}`);
console.log(`Passed: ${scenarios.filter(item => item.status === "PASS").length}`);
console.log(`Failed: ${failures.length}`);
console.log(`Report: ${reportPath}`);
failures.forEach(failure => console.log(`FAIL | ${failure}`));
if (!failures.length) console.log("PASS | Alerts, Portfolio, Forge Heat, Market View, Compare, PSA Advisor, Evidence, Exit Review, route ownership, freshness, and authority boundaries are intact");
if (failures.length) process.exit(1);
