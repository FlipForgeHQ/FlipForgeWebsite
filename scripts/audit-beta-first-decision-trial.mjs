import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_FIRST_DECISION_URL || "https://goflipforge.com/app/";
const outputDir = path.resolve("qa-artifacts", "beta-first-decision-trial");
const email = "first-decision-trial@flipforge.test";

const cases = [
  {
    key: "A-strong-buy",
    opportunityId: "QA-FIRST-A-OHTANI",
    card: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
    recommendation: "BUY",
    ask: 650,
    supportedValue: 780,
    confidence: 88,
    liquidity: 82,
    risk: 25,
    acceptedSales: 12,
    mappingState: "CONFIRMED",
    statusMessage: "Twelve exact completed-sale QA rows support the controlled value fixture.",
    workflowStatus: "BUY_READY_QA_FIXTURE",
    expectedPurpose: "strong exact evidence and favorable controlled economics"
  },
  {
    key: "B-verify-missing-evidence",
    opportunityId: "QA-FIRST-B-HALIBURTON",
    card: "2020 Panini Prizm Tyrese Haliburton #262 PSA 10",
    recommendation: "VERIFY",
    ask: 85,
    supportedValue: 0,
    confidence: 20,
    liquidity: 40,
    risk: 90,
    acceptedSales: 0,
    mappingState: "CONFIRMED",
    statusMessage: "No accepted exact completed-sale QA rows are available for this controlled fixture.",
    workflowStatus: "NEEDS_EXACT_COMPLETED_SALE_EVIDENCE",
    expectedPurpose: "insufficient exact evidence should feel intelligent rather than broken"
  },
  {
    key: "C-pass-negative-economics",
    opportunityId: "QA-FIRST-C-ZION",
    card: "2019 Panini Prizm Zion Williamson #248 PSA 10",
    recommendation: "PASS",
    ask: 45,
    supportedValue: 21.5,
    confidence: 88,
    liquidity: 74,
    risk: 35,
    acceptedSales: 8,
    mappingState: "CONFIRMED",
    statusMessage: "Eight exact completed-sale QA rows support the controlled value fixture, but the evaluated ask is materially above support.",
    workflowStatus: "PASS_PRICE_ABOVE_SUPPORTED_VALUE_QA_FIXTURE",
    expectedPurpose: "clear negative economics should explain why to walk away"
  }
];

function safeId(value) {
  return String(value || "qa").replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 100) || "qa";
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

function meta(correlationId, fixture) {
  return {
    contractVersion: "1.0",
    engineVersion: "first-decision-trial-qa-v1",
    authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence",
    correlationId,
    generatedAt: "2026-09-11T18:00:00Z",
    evidenceFreshness: "CONTROLLED_QA_FIXTURE_NOT_LIVE_MARKET_DATA",
    limitations: [
      "Controlled UX fixture only; values and recommendations are not live market claims.",
      `Trial purpose: ${fixture.expectedPurpose}.`
    ]
  };
}

function envelope(correlationId, fixture, data) {
  return { meta: meta(correlationId, fixture), data };
}

function opportunity(fixture) {
  return {
    id: fixture.opportunityId,
    platform: "EBAY",
    recommendation: fixture.recommendation,
    title: fixture.card,
    cardIdentity: fixture.card,
    ask: fixture.ask,
    supportedValue: fixture.supportedValue,
    confidence: fixture.confidence,
    liquidity: fixture.liquidity,
    risk: fixture.risk,
    rank: fixture.recommendation === "BUY" ? 92 : fixture.recommendation === "PASS" ? 28 : 44,
    mappingState: fixture.mappingState,
    statusMessage: fixture.statusMessage,
    changeSummary: "CONTROLLED_FIRST_DECISION_TRIAL",
    workflowStatus: fixture.workflowStatus,
    authorityBoundary: "Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. This QA fixture tests presentation only and grants no transaction authority.",
    observedAt: "2026-09-11T18:00:00Z",
    evidenceCount: fixture.acceptedSales,
    evidence: {
      acceptedSales: fixture.acceptedSales,
      averagePrice: fixture.supportedValue,
      latestSaleDate: fixture.acceptedSales ? "2026-09-10" : null
    }
  };
}

function evidenceRows(fixture) {
  return Array.from({ length: Math.min(3, fixture.acceptedSales) }, (_, index) => ({
    sourceName: "Controlled QA exact sale",
    type: "COMPLETED_SALE_QA_FIXTURE",
    amount: Math.max(1, fixture.supportedValue + index - 1),
    soldAt: `2026-09-${String(10 - index).padStart(2, "0")}`,
    identityMatch: true,
    authorityEligible: true
  }));
}

function discoverItem(fixture) {
  const listingUrl = `https://www.ebay.com/itm/${safeId(fixture.opportunityId)}`;
  return {
    rank: 1,
    matchQuality: "EXACT_MATCH",
    evaluationEligible: true,
    evaluationBlockReason: "",
    activeListingOnly: true,
    completedSaleEvidence: false,
    transactionAuthority: false,
    title: `${fixture.card} · controlled QA listing`,
    cardIdentityQuery: fixture.card,
    providerDisplayName: "Authorized QA Marketplace",
    marketplace: "EBAY",
    listingUrl,
    listingAvailability: "AVAILABLE",
    listingFreshness: "CURRENT",
    allInAskCents: Math.round(fixture.ask * 100),
    allInCostComplete: true,
    discoveryScore: fixture.recommendation === "BUY" ? 92 : fixture.recommendation === "PASS" ? 38 : 58,
    discoveryLabel: "BEST_CONNECTED_CANDIDATE",
    sellerFeedbackScore: 5000,
    condition: "Graded",
    listingFormat: "FIXED_PRICE",
    pricePosition: "Controlled QA context only",
    nextAction: "Evaluate this controlled QA listing.",
    rankingExplanation: "Controlled production-shell first-decision trial fixture.",
    rankingFactors: { identity: 100, completeness: 100, availability: 100, source: 100, freshness: 100 },
    evidence: {
      trustedExactCompletedSaleCount: fixture.acceptedSales,
      supported: fixture.acceptedSales > 0,
      trustedEvidenceValueCents: Math.round(fixture.supportedValue * 100),
      calibratedConfidence: fixture.confidence,
      risk: fixture.risk
    },
    evaluationRequest: {
      externalListingId: fixture.opportunityId,
      marketplace: "EBAY",
      cardIdentity: fixture.card,
      listingUrl,
      seller: "QA Seller",
      itemPriceCents: Math.round(fixture.ask * 100),
      shippingCents: 0,
      buyerPremiumCents: 0,
      taxCents: 0,
      listingFormat: "FIXED_PRICE"
    }
  };
}

function lifecycleRecord(fixture) {
  return {
    opportunityId: fixture.opportunityId,
    trackingStatus: fixture.recommendation === "PASS" ? "PASSED" : "WATCHING",
    outcomeStatus: fixture.recommendation === "PASS" ? "PASSED" : "NONE",
    reviewAt: "2026-09-18T14:00:00Z",
    alertEnabled: true,
    acquisitionCostCents: null,
    acquiredAt: null,
    dispositionProceedsCents: null,
    disposedAt: null,
    version: 1,
    updatedAt: "2026-09-11T18:00:00Z"
  };
}

function requestJson(request) {
  try { return request.postDataJSON(); } catch (_) { return {}; }
}

async function poll(predicate, message, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error(message);
}

async function textSnapshot(page) {
  return page.locator("#main-content").evaluate(main => {
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    };
    const text = String(main.innerText || "").replace(/\s+/g, " ").trim();
    const headings = [...main.querySelectorAll("h1,h2,h3")].filter(visible).map(node => String(node.textContent || "").trim()).filter(Boolean);
    const actions = [...main.querySelectorAll("a,button")].filter(visible).map(node => String(node.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    return { text: text.slice(0, 7000), headings, actions };
  });
}

async function screenshot(page, fixture, step) {
  const file = `${fixture.key}-${step}.png`;
  await page.screenshot({ path: path.join(outputDir, file), fullPage: true });
  return file;
}

async function runCase(browser, fixture) {
  const telemetry = [];
  const apiCalls = [];
  const failures = [];
  const screens = [];
  const key = accountHash(email);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

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
      getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "First Decision QA", membershipActive: true, membershipConfigured: true })
    });`
  }));
  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: "(() => {})();"
  }));

  await page.route("**/api/conversion-event", async route => {
    telemetry.push(requestJson(route.request()));
    await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify({ ok: true }) });
  });

  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const headers = request.headers();
    const correlationId = headers["x-correlation-id"] || "first-decision-trial";
    const body = requestJson(request);
    apiCalls.push({ method, path: url.pathname, body });

    const fulfill = data => route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(envelope(correlationId, fixture, data))
    });

    if (url.pathname === "/api/v1/health") {
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify({ meta: { contractVersion: "1.0", correlationId }, data: { status: "configured" } }) });
      return;
    }
    if (url.pathname === "/api/v1/discover" && method === "POST") {
      await fulfill({
        kind: "discover",
        readOnly: true,
        query: fixture.card,
        requestedLimit: 25,
        targetMaxBuyCents: Math.round(fixture.ask * 100),
        discoveryPersisted: false,
        evaluationRequiredToSave: true,
        activeListingsAreCompletedSaleEvidence: false,
        transactionAuthority: false,
        tenantOwnedPersistenceCreated: false,
        tenantOwnershipCreatedOnlyByEvaluation: true,
        tenantIsolation: { enforced: true, defaultAccess: "DENY" },
        provider: {
          id: "QA_AUTHORIZED",
          name: "Authorized QA Marketplace",
          available: true,
          status: "Controlled QA active-listing connector available.",
          providerCredentialsExposed: false,
          customerCanConfigureProvider: false
        },
        candidateCount: 1,
        exactCandidateCount: 1,
        identityReviewCandidateCount: 0,
        evidenceSupportedCount: fixture.acceptedSales > 0 ? 1 : 0,
        evidenceSupportedBestAvailable: fixture.acceptedSales > 0,
        coverageSummary: fixture.acceptedSales > 0 ? "Controlled exact-card evidence context available." : "Controlled fixture has no accepted exact completed-sale evidence.",
        items: [discoverItem(fixture)]
      });
      return;
    }
    if (url.pathname === "/api/v1/evaluations" && method === "POST") {
      await fulfill({
        kind: "evaluation",
        requestId: `qa-${fixture.key}`,
        opportunityId: fixture.opportunityId,
        persistedToSqlite: true,
        tenantOwned: true,
        requestCanVerifyEvidence: false,
        requestCanVerifyIdentity: false,
        evidenceAcceptedByRequest: false,
        psaRecalculated: false,
        transactionAuthorized: false,
        providerCredentialsExposed: false,
        decision: { recommendation: fixture.recommendation },
        tenantIsolation: { enforced: true, idempotencyScope: "TENANT", opportunityOwnership: "GRANTED_ON_COMPLETION", defaultAccess: "DENY" }
      });
      return;
    }
    if (url.pathname === "/api/v1/opportunities") {
      await fulfill({ kind: "opportunities", items: [opportunity(fixture)] });
      return;
    }
    if (url.pathname === `/api/v1/opportunities/${fixture.opportunityId}`) {
      await fulfill({ kind: "opportunity-detail", opportunity: opportunity(fixture) });
      return;
    }
    if (url.pathname === `/api/v1/evidence/${fixture.opportunityId}`) {
      await fulfill({
        kind: "evidence",
        opportunityId: fixture.opportunityId,
        acceptedExactCompletedSales: fixture.acceptedSales,
        visibleButAuthorityIneligible: 0,
        linkedEvidence: evidenceRows(fixture),
        manualCandidates: [],
        ledger: []
      });
      return;
    }
    if (url.pathname === `/api/v1/psa-advisor/${fixture.opportunityId}`) {
      await fulfill({
        kind: "psa-advisor",
        opportunityId: fixture.opportunityId,
        guidanceStatus: "SAVED_CONTEXT_ONLY_QA_FIXTURE",
        savedPsaSnapshot: { readinessStatus: "CONTEXT_AVAILABLE", manualVerificationRequired: false },
        populationContext: { psa10Population: 1000, psa9Population: 3000 },
        recalculated: false
      });
      return;
    }
    if (url.pathname === "/api/v1/dashboard") {
      await fulfill({ metrics: { trackedOpportunities: 1, evidenceReady: fixture.acceptedSales > 0 ? 1 : 0, populationContextAvailable: 1, needsVerification: fixture.recommendation === "VERIFY" ? 1 : 0 } });
      return;
    }
    if (url.pathname === "/api/v1/lifecycle") {
      await fulfill({ kind: "lifecycle", items: [lifecycleRecord(fixture)] });
      return;
    }
    if (url.pathname === `/api/v1/lifecycle/${fixture.opportunityId}`) {
      await fulfill({ kind: "lifecycle-detail", lifecycle: lifecycleRecord(fixture), history: [] });
      return;
    }
    if (url.pathname === "/api/v1/portfolio") {
      await fulfill({ kind: "portfolio", items: [] });
      return;
    }
    if (url.pathname === "/api/v1/alerts") {
      await fulfill({ kind: "alerts", items: [] });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json; charset=utf-8", body: JSON.stringify({ error: { code: "QA_NOT_MOCKED", message: `${method} ${url.pathname}` } }) });
  });

  try {
    await page.goto(`${baseUrl}#/discover`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator('#main-content [data-customer-discovery-form] input[name="exactCardQuery"]').waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(350);

    const evaluateScreen = await textSnapshot(page);
    screens.push({ step: "01-evaluate", screenshot: await screenshot(page, fixture, "01-evaluate"), ...evaluateScreen });
    check(evaluateScreen.headings.some(value => /Evaluate one card/i.test(value)), "Evaluate screen did not present the simplified 'Evaluate one card' heading.");
    check(!evaluateScreen.text.includes("Connected source status"), "Evaluate screen exposed connected-source technical status.");
    check(!evaluateScreen.text.includes("Result limit"), "Evaluate screen exposed result-limit complexity.");

    const form = page.locator("#main-content [data-customer-discovery-form]");
    await form.locator('input[name="exactCardQuery"]').fill(fixture.card);
    const maxPrice = form.locator('input[name="targetMaxBuy"]');
    if (await maxPrice.count()) await maxPrice.fill(String(fixture.ask));
    await form.locator('button[type="submit"]').click();
    await page.locator("#main-content .customer-discovery-results [data-discovery-evaluate]").first().waitFor({ state: "visible", timeout: 12_000 });
    await page.waitForTimeout(250);

    const resultScreen = await textSnapshot(page);
    screens.push({ step: "02-found-card", screenshot: await screenshot(page, fixture, "02-found-card"), ...resultScreen });
    check(resultScreen.text.includes(fixture.card), "Search result did not clearly preserve the exact card identity.");
    check(resultScreen.actions.some(value => /Evaluate/i.test(value)), "Search result did not provide an obvious evaluation action.");

    await page.locator("#main-content .customer-discovery-results [data-discovery-evaluate]").first().click();
    await poll(() => page.url().includes(`#/opportunities/${fixture.opportunityId}`), "Evaluation did not land on the saved decision.", 12_000);
    await page.locator("#main-content .customer-intelligence-hero").waitFor({ state: "visible", timeout: 12_000 });
    await page.waitForTimeout(450);

    const decisionScreen = await textSnapshot(page);
    screens.push({ step: "03-decision", screenshot: await screenshot(page, fixture, "03-decision"), ...decisionScreen });
    check(decisionScreen.text.includes(fixture.recommendation), `Decision screen did not visibly state ${fixture.recommendation}.`);
    check(decisionScreen.text.includes(fixture.card), "Decision screen did not keep the card identity visible.");
    check(decisionScreen.text.includes("What you should do next"), "Decision screen did not give an obvious next action.");
    check(decisionScreen.actions.some(value => /Show me why/i.test(value)), "Decision screen did not provide a clear 'Show me why' action.");

    const whyLink = page.locator(`#main-content a[href="#/evidence/${fixture.opportunityId}"]`).first();
    if (await whyLink.count()) {
      await whyLink.click();
    } else {
      await page.locator("#main-content [data-ff-show-why]").first().click();
    }
    await poll(() => page.url().includes(`#/evidence/${fixture.opportunityId}`), "Show me why did not open the evidence explanation.", 10_000);
    await page.waitForTimeout(450);

    const whyScreen = await textSnapshot(page);
    screens.push({ step: "04-why", screenshot: await screenshot(page, fixture, "04-why"), ...whyScreen });
    check(/Evidence behind this decision|Why FlipForge trusts this decision|What FlipForge/i.test(whyScreen.text), "Explanation screen did not frame the evidence behind the decision.");
    if (fixture.recommendation === "VERIFY") {
      check(/0|No linked evidence|not enough|missing|unavailable/i.test(whyScreen.text), "VERIFY explanation did not make the missing evidence understandable.");
    }

    await page.goto(`${baseUrl}#/opportunities`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(550);
    const savedScreen = await textSnapshot(page);
    screens.push({ step: "05-saved-decisions", screenshot: await screenshot(page, fixture, "05-saved-decisions"), ...savedScreen });
    check(savedScreen.text.includes(fixture.card), "Saved Decisions did not show the evaluated card.");
    check(savedScreen.text.includes(fixture.recommendation), "Saved Decisions did not preserve the authoritative recommendation.");

    await page.goto(`${baseUrl}#/tracking/${fixture.opportunityId}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(600);
    const trackingScreen = await textSnapshot(page);
    screens.push({ step: "06-tracking", screenshot: await screenshot(page, fixture, "06-tracking"), ...trackingScreen });
    check(/Tracking/i.test(trackingScreen.text), "Tracking screen did not render its core purpose.");
    check(trackingScreen.text.includes(fixture.card), "Tracking did not retain the selected card identity.");

    const nav = await page.locator("body").evaluate(() => [...document.querySelectorAll("a")]
      .filter(node => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
      })
      .map(node => String(node.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean));

    const telemetryEvents = telemetry.map(item => item?.event).filter(Boolean);
    check(telemetryEvents.includes("evaluation_started"), "Telemetry missed evaluation_started.");
    check(telemetryEvents.includes("evaluation_completed"), "Telemetry missed evaluation_completed.");
    check(telemetryEvents.includes("decision_saved"), "Telemetry missed decision_saved.");
    check(telemetryEvents.includes("tracking_viewed"), "Telemetry missed tracking_viewed.");
    check(telemetryEvents.includes("decision_explanation_viewed"), "Telemetry missed decision_explanation_viewed.");

    return {
      fixture: {
        key: fixture.key,
        card: fixture.card,
        recommendation: fixture.recommendation,
        purpose: fixture.expectedPurpose,
        controlledQaFixture: true,
        liveMarketClaim: false
      },
      passed: failures.length === 0,
      failures,
      telemetryEvents,
      visibleNavigation: nav,
      apiCallCount: apiCalls.length,
      screens
    };
  } catch (error) {
    failures.push(error?.message || String(error));
    try {
      const crash = await textSnapshot(page);
      screens.push({ step: "99-failure", screenshot: await screenshot(page, fixture, "99-failure"), ...crash });
    } catch (_) {}
    return {
      fixture: { key: fixture.key, card: fixture.card, recommendation: fixture.recommendation, purpose: fixture.expectedPurpose, controlledQaFixture: true, liveMarketClaim: false },
      passed: false,
      failures,
      telemetryEvents: telemetry.map(item => item?.event).filter(Boolean),
      apiCallCount: apiCalls.length,
      screens
    };
  } finally {
    await context.close();
  }
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const fixture of cases) {
    console.log(`\n=== ${fixture.key} | ${fixture.card} | ${fixture.recommendation} ===`);
    const result = await runCase(browser, fixture);
    results.push(result);
    console.log(`${result.passed ? "PASS" : "FAIL"} | ${fixture.key}`);
    for (const failure of result.failures) console.log(`  - ${failure}`);
    console.log(`  telemetry: ${result.telemetryEvents.join(", ") || "none"}`);
    for (const screen of result.screens) {
      console.log(`  ${screen.step}: headings=[${screen.headings.join(" | ")}] actions=[${screen.actions.slice(0, 10).join(" | ")}]`);
    }
  }
} finally {
  await browser.close();
}

const summary = {
  runAt: new Date().toISOString(),
  productionShellUrl: baseUrl,
  productionShellExpectedCommit: "0e75633552a6b0548b6fdd83e0736c997b81f11a",
  controlledQaFixtures: true,
  liveMarketClaims: false,
  historicalT0Mutated: false,
  transactionAuthority: false,
  cases: results
};
await writeFile(path.join(outputDir, "first-decision-trial.json"), JSON.stringify(summary, null, 2));

const failed = results.filter(result => !result.passed);
console.log(`\nFlipForge First Decision Trial: ${results.length - failed.length}/${results.length} cases passed.`);
if (failed.length) process.exit(1);
