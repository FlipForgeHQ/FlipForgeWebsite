import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const email = "prebeta-state-audit@flipforge.test";
const reportDir = path.resolve("qa-artifacts/prebeta-customer-state");
const reportPath = path.join(reportDir, "customer-state-audit.json");
const failures = [];
const scenarios = [];
const calls = { search: [], resolve: [], discover: [], evaluation: [], api: [] };
const transientAttempts = new Map();

const identities = {
  ohtani10: {
    imperfect: "2018 Topps Chrome Shohei Ohtani PSA 10",
    canonical: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
    name: "Shohei Ohtani",
    year: "2018",
    setName: "Topps Chrome",
    cardNumber: "150",
    grader: "PSA",
    grade: "10",
    token: "a".repeat(64)
  },
  ohtani9: {
    imperfect: "2018 Topps Chrome Shohei Ohtani PSA 9",
    canonical: "2018 Topps Chrome Shohei Ohtani #150 PSA 9",
    name: "Shohei Ohtani",
    year: "2018",
    setName: "Topps Chrome",
    cardNumber: "150",
    grader: "PSA",
    grade: "9",
    token: "b".repeat(64)
  },
  acuna10: {
    imperfect: "2018 Topps Update Ronald Acuna PSA 10",
    canonical: "2018 Topps Update Ronald Acuna Jr. #US250 PSA 10",
    name: "Ronald Acuna Jr.",
    year: "2018",
    setName: "Topps Update",
    cardNumber: "US250",
    grader: "PSA",
    grade: "10",
    token: "c".repeat(64)
  }
};

const tokenMap = new Map(Object.values(identities).map(identity => [identity.token, identity]));

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "prebeta-state-audit",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      generatedAt: "2026-08-31T16:15:00Z",
      evidenceFreshness: "QA_FIXTURE",
      limitations: ["Synthetic pre-beta destructive customer-state audit fixture only."]
    },
    data
  };
}

function cardIntelligenceData(extra = {}) {
  return {
    transactionAuthority: false,
    providerIdentifierExposed: false,
    rawProviderPayloadExposed: false,
    providerPayloadPersisted: false,
    soldEvidenceAccepted: false,
    smartOpportunityRecalculated: false,
    ...extra
  };
}

function identityForQuery(query) {
  const text = String(query || "");
  if (/Acuna/i.test(text)) return identities.acuna10;
  if (/PSA\s*9\b/i.test(text)) return identities.ohtani9;
  return identities.ohtani10;
}

function identitySearchData(query) {
  const identity = identityForQuery(query);
  return cardIntelligenceData({
    results: [
      {
        type: "CARD_IDENTITY",
        name: identity.name,
        year: identity.year,
        setName: identity.setName,
        cardNumber: identity.cardNumber,
        parallelName: "",
        grader: identity.grader,
        grade: identity.grade,
        exactCardCandidate: true,
        selectionToken: identity.token
      },
      {
        type: "CARD_IDENTITY",
        name: identity.name,
        year: identity.year,
        setName: `${identity.setName} Alternate`,
        cardNumber: `${identity.cardNumber}A`,
        parallelName: "Alternate",
        grader: identity.grader,
        grade: identity.grade,
        exactCardCandidate: false
      }
    ]
  });
}

function safeId(value) {
  return String(value || "qa").replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 80) || "qa";
}

function exactItem(query, index = 1) {
  const listingId = safeId(`QA-${index}-${query}`).slice(0, 100);
  const listingUrl = `https://www.ebay.com/itm/${900000000000 + index}`;
  return {
    rank: 1,
    matchQuality: "EXACT_MATCH",
    evaluationEligible: true,
    evaluationBlockReason: "",
    activeListingOnly: true,
    completedSaleEvidence: false,
    transactionAuthority: false,
    title: `${query} QA exact listing`,
    cardIdentityQuery: query,
    providerDisplayName: "Authorized QA Marketplace",
    marketplace: "EBAY",
    listingUrl,
    listingAvailability: "AVAILABLE",
    listingFreshness: "CURRENT",
    allInAskCents: 10000 + index,
    allInCostComplete: true,
    discoveryScore: 78,
    discoveryLabel: "BEST_CONNECTED_CANDIDATE",
    sellerFeedbackScore: 5000,
    condition: "Graded",
    listingFormat: "FIXED_PRICE",
    pricePosition: "QA price context only",
    nextAction: "Verify the listing before evaluation.",
    rankingExplanation: "Synthetic server-owned ranking explanation for state-transition QA.",
    rankingFactors: { identity: 100, completeness: 100, availability: 100, source: 100, freshness: 100 },
    evidence: {
      trustedExactCompletedSaleCount: 3,
      supported: true,
      trustedEvidenceValueCents: 9500,
      calibratedConfidence: 80,
      risk: 20
    },
    evaluationRequest: {
      externalListingId: listingId,
      marketplace: "EBAY",
      cardIdentity: query,
      listingUrl,
      seller: "QA Seller",
      itemPriceCents: 9500,
      shippingCents: 500,
      buyerPremiumCents: 0,
      taxCents: 0,
      listingFormat: "FIXED_PRICE"
    }
  };
}

function excludedItem(query, index = 2) {
  const listingUrl = `https://www.ebay.com/itm/${900000000000 + index}`;
  return {
    rank: 0,
    matchQuality: "IDENTITY_REVIEW",
    evaluationEligible: false,
    evaluationBlockReason: "Exact listing identity is not confirmed.",
    activeListingOnly: true,
    completedSaleEvidence: false,
    transactionAuthority: false,
    title: `${query} QA identity-review listing`,
    cardIdentityQuery: query,
    providerDisplayName: "Authorized QA Marketplace",
    marketplace: "EBAY",
    listingUrl,
    listingAvailability: "AVAILABLE",
    listingFreshness: "CURRENT",
    allInAskCents: 12500,
    allInCostComplete: true,
    discoveryScore: 41,
    discoveryLabel: "IDENTITY_REVIEW",
    sellerFeedbackScore: 100,
    condition: "Graded",
    listingFormat: "FIXED_PRICE",
    pricePosition: "Evidence required",
    nextAction: "Resolve exact identity before evaluation.",
    rankingExplanation: "Synthetic excluded listing for destructive state QA.",
    rankingFactors: { identity: 38, completeness: 100, availability: 100, source: 100, freshness: 100 },
    evidence: {
      trustedExactCompletedSaleCount: 0,
      supported: false,
      trustedEvidenceValueCents: 0,
      calibratedConfidence: 0,
      risk: 90
    }
  };
}

function discoverData(query, { empty = false } = {}) {
  const items = empty ? [] : [exactItem(query, calls.discover.length + 1), excludedItem(query, calls.discover.length + 2)];
  return {
    kind: "discover",
    readOnly: true,
    query,
    requestedLimit: 25,
    targetMaxBuyCents: 0,
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
      status: "Official QA active-listing connector available.",
      providerCredentialsExposed: false,
      customerCanConfigureProvider: false
    },
    candidateCount: items.length,
    exactCandidateCount: empty ? 0 : 1,
    identityReviewCandidateCount: empty ? 0 : 1,
    evidenceSupportedCount: empty ? 0 : 1,
    evidenceSupportedBestAvailable: !empty,
    coverageSummary: empty ? "No active candidates matched this exact-card search." : "Synthetic exact plus identity-review results.",
    items
  };
}

function requestBody(request) {
  try { return request.postDataJSON(); } catch (_) { return {}; }
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

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function poll(predicate, message, timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
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

const form = () => page.locator("#main-content [data-customer-discovery-form]");
const queryInput = () => form().locator('input[name="exactCardQuery"]');
const findButton = () => form().locator("[data-discovery-find-exact]");
const searchButton = () => form().locator('button[type="submit"]');

async function waitForForm() {
  await queryInput().waitFor({ state: "visible", timeout: 7000 });
}

async function resetDiscover() {
  await page.goto(`${baseUrl}/#/discover`, { waitUntil: "domcontentloaded", timeout: 10_000 });
  await waitForForm();
  await page.evaluate(() => {
    sessionStorage.removeItem("flipforge.discover.lastSearch.v2");
    sessionStorage.removeItem("flipforge.discover.resetLimit.v2");
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });
  await waitForForm();
}

async function fillQuery(value) {
  await waitForForm();
  await queryInput().fill(value);
  await page.waitForTimeout(120);
}

async function directSearch(value) {
  const before = calls.discover.length;
  await fillQuery(value);
  await searchButton().click();
  await poll(() => calls.discover.length > before, `Discover did not run for ${value}`);
  await page.waitForTimeout(120);
  return calls.discover.at(-1);
}

async function resolveByIdentityAssist(value) {
  const searchBefore = calls.search.length;
  const resolveBefore = calls.resolve.length;
  const discoverBefore = calls.discover.length;
  await fillQuery(value);
  await findButton().click();
  const assist = page.locator("#main-content .customer-discovery-identity-assist");
  await assist.waitFor({ state: "visible", timeout: 5000 });
  await poll(() => calls.search.length > searchBefore, `Identity search did not run for ${value}`);
  expect(calls.resolve.length === resolveBefore, "Identity resolved before customer selection");
  expect(calls.discover.length === discoverBefore, "Discover ran before customer selected an identity");
  const useExact = assist.locator("[data-discovery-use-identity]").first();
  await useExact.waitFor({ state: "visible", timeout: 5000 });
  await useExact.click();
  await poll(() => calls.resolve.length > resolveBefore, `Identity resolve did not run for ${value}`);
  await poll(() => calls.discover.length > discoverBefore, `Discover did not run after resolving ${value}`);
  await page.waitForTimeout(120);
  return { search: calls.search.at(-1), resolve: calls.resolve.at(-1), discover: calls.discover.at(-1) };
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
      getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Pre-beta State Audit", membershipActive: true, membershipConfigured: true })
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
    const correlationId = headers["x-correlation-id"] || "prebeta-state-audit";
    const body = requestBody(request);
    calls.api.push({ method, path: url.pathname, body, headers });

    if (url.pathname === "/api/v1/health") {
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, { status: "configured" })) });
      return;
    }

    if (url.pathname === "/api/v1/card-intelligence/search" && method === "POST") {
      calls.search.push(body);
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, identitySearchData(body.query))) });
      return;
    }

    if (url.pathname === "/api/v1/card-intelligence/resolve" && method === "POST") {
      calls.resolve.push(body);
      const identity = tokenMap.get(String(body.selectionToken || ""));
      if (!identity) {
        await route.fulfill({ status: 400, contentType: "application/json; charset=utf-8", body: JSON.stringify({ error: { code: "QA_TOKEN_UNKNOWN", message: "Unknown synthetic selection token." } }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(envelope(correlationId, cardIntelligenceData({
          readyForEvaluation: true,
          cardIdentity: identity.canonical,
          grader: identity.grader,
          grade: identity.grade,
          message: "Exact card identity confirmed by synthetic server-owned resolver."
        })))
      });
      return;
    }

    if (url.pathname === "/api/v1/discover" && method === "POST") {
      calls.discover.push(body);
      const query = String(body.exactCardQuery || "");
      if (/Slow Player/i.test(query)) await new Promise(resolve => setTimeout(resolve, 300));
      if (/Error Player/i.test(query)) {
        const attempt = (transientAttempts.get(query) || 0) + 1;
        transientAttempts.set(query, attempt);
        if (attempt === 1) {
          await route.fulfill({
            status: 503,
            contentType: "application/json; charset=utf-8",
            body: JSON.stringify({ error: { code: "QA_TRANSIENT_PROVIDER_ERROR", message: "Synthetic transient provider failure." } })
          });
          return;
        }
      }
      const empty = /#404\b/i.test(query);
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, discoverData(query, { empty }))) });
      return;
    }

    if (url.pathname === "/api/v1/evaluations" && method === "POST") {
      calls.evaluation.push(body);
      const requestId = headers["idempotency-key"] || "qa-evaluation-request";
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(envelope(correlationId, {
          kind: "evaluation",
          requestId,
          opportunityId: "qa-opportunity-1",
          persistedToSqlite: true,
          tenantOwned: true,
          requestCanVerifyEvidence: false,
          requestCanVerifyIdentity: false,
          evidenceAcceptedByRequest: false,
          psaRecalculated: false,
          transactionAuthorized: false,
          providerCredentialsExposed: false,
          decision: { recommendation: "WATCH" },
          tenantIsolation: {
            enforced: true,
            idempotencyScope: "TENANT",
            opportunityOwnership: "GRANTED_ON_COMPLETION",
            defaultAccess: "DENY"
          }
        }))
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json; charset=utf-8", body: JSON.stringify({ error: { code: "QA_NOT_MOCKED", message: url.pathname } }) });
  });

  await runScenario("baseline imperfect identity resolves before marketplace search", async () => {
    await resetDiscover();
    const result = await resolveByIdentityAssist(identities.ohtani10.imperfect);
    expect(result.search?.query === identities.ohtani10.imperfect, "Identity search changed the customer query");
    expect(result.resolve?.selectionToken === identities.ohtani10.token, "Resolver did not receive the server-issued PSA 10 token");
    expect(result.discover?.exactCardQuery === identities.ohtani10.canonical, "Canonical PSA 10 identity did not reach Discover");
    await page.locator("#main-content .customer-discovery-results").waitFor({ state: "visible", timeout: 5000 });
    await poll(() => page.locator("[data-discovery-refresh-v2]").count().then(count => count === 1), "Refresh results control did not appear after a completed search");
    expect(await page.locator(".customer-discovery-identity-review [data-discovery-evaluate]").count() === 0, "Excluded identity-review result exposed an evaluation control");
    expect(await page.locator("[data-discovery-clear-v2]").isEnabled(), "New search was disabled by an excluded/ineligible result");
  });

  await runScenario("PSA 10 to PSA 9 re-arms without + New card", async () => {
    const discoverBefore = calls.discover.length;
    await fillQuery(identities.ohtani9.imperfect);
    expect(await page.locator("[data-discovery-refresh-v2]").count() === 0, "Stale Refresh results remained after editing to a different grade");
    expect(await page.locator("[data-discovery-clear-v2]").count() === 0, "Stale New search remained after editing to a different grade");
    expect(await findButton().isEnabled(), "Find exact card did not re-arm after changing PSA 10 to PSA 9");
    await findButton().click();
    await page.locator("#main-content .customer-discovery-identity-assist").waitFor({ state: "visible", timeout: 5000 });
    const useExact = page.locator("#main-content .customer-discovery-identity-assist [data-discovery-use-identity]").first();
    await useExact.click();
    await poll(() => calls.discover.length > discoverBefore, "PSA 9 Discover did not run without + New card");
    const body = calls.discover.at(-1);
    expect(body.exactCardQuery === identities.ohtani9.canonical, `PSA 9 canonical identity was not used: ${JSON.stringify(body)}`);
    expect(!/PSA\s*10/i.test(body.exactCardQuery), "Previous PSA 10 grade leaked into the PSA 9 search");
  });

  await runScenario("player change replaces previous card state", async () => {
    const body = await directSearch(identities.acuna10.canonical);
    expect(body.exactCardQuery === identities.acuna10.canonical, "Acuna query did not replace the prior Ohtani query");
    expect(!/Ohtani/i.test(body.exactCardQuery), "Previous player leaked into the next Discover request");
    expect(!/PSA\s*9\b/i.test(body.exactCardQuery), "Previous PSA 9 grade leaked into Acuna PSA 10 search");
  });

  await runScenario("Refresh results repeats the completed search exactly", async () => {
    await poll(() => page.locator("[data-discovery-refresh-v2]").count().then(count => count === 1), "Refresh results was unavailable");
    const before = calls.discover.length;
    await page.locator("[data-discovery-refresh-v2]").click();
    await poll(() => calls.discover.length > before, "Refresh results did not issue another Discover request");
    expect(calls.discover.at(-1)?.exactCardQuery === identities.acuna10.canonical, "Refresh changed the completed card identity");
  });

  await runScenario("no-results state does not trap the next search", async () => {
    const emptyQuery = "2020 Test Player #404 PSA 9";
    await directSearch(emptyQuery);
    await poll(() => page.locator("#main-content .customer-discovery-provider").count().then(count => count === 1), "No-results provider state did not render");
    const body = await directSearch(identities.ohtani9.canonical);
    expect(body.exactCardQuery === identities.ohtani9.canonical, "New search after no-results reused stale identity");
  });

  await runScenario("removing a grade does not inherit the old grade", async () => {
    const ungraded = "2018 Topps Chrome Shohei Ohtani #150";
    const body = await directSearch(ungraded);
    expect(body.exactCardQuery === ungraded, "Ungraded query was altered before Discover");
    expect(!/PSA|BGS|SGC|CGC|CSG|TAG|BCCG/i.test(body.exactCardQuery), "A prior grader/grade leaked into an ungraded search");
  });

  await runScenario("changing identity while assist is open invalidates the old selection", async () => {
    await resetDiscover();
    const searchBefore = calls.search.length;
    const resolveBefore = calls.resolve.length;
    await fillQuery(identities.ohtani9.imperfect);
    await findButton().click();
    await page.locator("#main-content .customer-discovery-identity-assist").waitFor({ state: "visible", timeout: 5000 });
    await poll(() => calls.search.length > searchBefore, "Initial identity-assist search did not run");
    await fillQuery(identities.acuna10.imperfect);
    await findButton().click();
    await poll(() => calls.search.length > searchBefore + 1, "Replacement identity-assist search did not run");
    expect(calls.resolve.length === resolveBefore, "Old Ohtani identity token resolved after the customer changed the query");
    const useExact = page.locator("#main-content .customer-discovery-identity-assist [data-discovery-use-identity]").first();
    await useExact.click();
    await poll(() => calls.resolve.length > resolveBefore, "Replacement identity did not resolve");
    expect(calls.resolve.at(-1)?.selectionToken === identities.acuna10.token, "Old selection token survived after identity query changed");
    await poll(() => calls.discover.at(-1)?.exactCardQuery === identities.acuna10.canonical, "Resolved Acuna identity did not reach Discover");
  });

  await runScenario("transient provider failure can be corrected and retried", async () => {
    await resetDiscover();
    const errorQuery = "2021 Error Player #999 PSA 9";
    const before = calls.discover.length;
    await fillQuery(errorQuery);
    await searchButton().click();
    await poll(() => calls.discover.length > before, "First transient-error request did not run");
    await page.locator("#main-content .staging-error").waitFor({ state: "visible", timeout: 5000 });
    expect(await queryInput().inputValue() === errorQuery, "Customer query was lost after a provider error");
    await searchButton().click();
    await poll(() => calls.discover.length > before + 1, "Retry did not issue a second Discover request");
    await page.locator("#main-content .customer-discovery-results").waitFor({ state: "visible", timeout: 5000 });
    expect(transientAttempts.get(errorQuery) === 2, "Transient error fixture was not retried exactly once");
  });

  await runScenario("explicit evaluation handoff does not poison Discover on return", async () => {
    await resetDiscover();
    await directSearch(identities.ohtani10.canonical);
    const evalBefore = calls.evaluation.length;
    const evaluate = page.locator("#main-content .customer-discovery-results [data-discovery-evaluate]").first();
    await evaluate.waitFor({ state: "visible", timeout: 5000 });
    await evaluate.click();
    await poll(() => calls.evaluation.length > evalBefore, "Explicit evaluation request did not run");
    await poll(() => /#\/opportunities\/qa-opportunity-1$/.test(page.url()), "Evaluation did not hand off to the saved opportunity route");
    await page.evaluate(() => { window.location.hash = "#/discover"; });
    await waitForForm();
    const discoverBefore = calls.discover.length;
    await fillQuery(identities.ohtani9.canonical);
    await searchButton().click();
    await poll(() => calls.discover.length > discoverBefore, "Discover was not usable after returning from evaluation");
    expect(calls.discover.at(-1)?.exactCardQuery === identities.ohtani9.canonical, "Returning from evaluation restored stale PSA 10 identity");
  });

  await runScenario("double submit collapses to one in-flight search", async () => {
    await resetDiscover();
    const slowQuery = "2022 Slow Player #777 PSA 9";
    await fillQuery(slowQuery);
    const before = calls.discover.length;
    await page.evaluate(() => {
      const target = document.querySelector("#main-content [data-customer-discovery-form]");
      target?.requestSubmit?.();
      target?.requestSubmit?.();
    });
    await poll(() => calls.discover.length > before, "Slow Discover request did not start");
    await page.waitForTimeout(500);
    expect(calls.discover.length === before + 1, `Double submit created ${calls.discover.length - before} Discover requests`);
  });

  await runScenario("target max buy and result limit do not leak between searches", async () => {
    await resetDiscover();
    await fillQuery(identities.ohtani10.canonical);
    await form().locator('input[name="targetMaxBuy"]').fill("123.45");
    await form().locator('select[name="limit"]').selectOption("10");
    let before = calls.discover.length;
    await searchButton().click();
    await poll(() => calls.discover.length > before, "Configured target/limit search did not run");
    let body = calls.discover.at(-1);
    expect(body.targetMaxBuyCents === 12345, `Target max buy was ${body.targetMaxBuyCents}, expected 12345`);
    expect(body.limit === 10, `Result limit was ${body.limit}, expected 10`);

    await fillQuery(identities.ohtani9.canonical);
    await form().locator('input[name="targetMaxBuy"]').fill("");
    await form().locator('select[name="limit"]').selectOption("25");
    before = calls.discover.length;
    await searchButton().click();
    await poll(() => calls.discover.length > before, "Second target/limit search did not run");
    body = calls.discover.at(-1);
    expect(body.targetMaxBuyCents === 0, "Previous target max buy leaked into the next search");
    expect(body.limit === 25, "Previous result limit leaked into the next search");
  });

  await runScenario("card-number change replaces the previous identity", async () => {
    await resetDiscover();
    await directSearch(identities.ohtani9.canonical);
    const changed = "2018 Topps Chrome Shohei Ohtani #151 PSA 9";
    const body = await directSearch(changed);
    expect(body.exactCardQuery === changed, "Changed card number did not replace #150");
    expect(!/#150\b/.test(body.exactCardQuery), "Previous #150 card number leaked into #151 search");
  });

  await runScenario("browser requests never supply tenant identity or transaction authority", async () => {
    const identityHeaders = calls.api.filter(call => call.headers["x-flipforge-tenant-id"] || call.headers["x-flipforge-user-id"]);
    expect(identityHeaders.length === 0, "Browser supplied forbidden tenant/user identity headers");
    const searchBodies = [...calls.search, ...calls.resolve, ...calls.discover];
    const forbidden = searchBodies.filter(body => Object.keys(body || {}).some(key => /transactionAuthority|recommendation|tenantId|userId/i.test(key)));
    expect(forbidden.length === 0, "Search-state requests attempted to supply authority or tenant identity fields");
    expect(calls.evaluation.length === 1, `Expected one explicit evaluation mutation, saw ${calls.evaluation.length}`);
  });
} finally {
  await fs.mkdir(reportDir, { recursive: true });
  const report = {
    audit: "FlipForge Pre-Beta Destructive Customer-State Audit",
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed: failures.length === 0,
    scenarioCount: scenarios.length,
    passedCount: scenarios.filter(scenario => scenario.status === "PASS").length,
    failedCount: scenarios.filter(scenario => scenario.status === "FAIL").length,
    scenarios,
    requestSummary: {
      identitySearchCalls: calls.search.length,
      identityResolveCalls: calls.resolve.length,
      discoverCalls: calls.discover.length,
      evaluationCalls: calls.evaluation.length,
      apiCalls: calls.api.length
    },
    failures
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await context.close();
  await browser.close();
}

console.log("FlipForge Pre-Beta Destructive Customer-State Audit");
console.log(`Scenarios: ${scenarios.length}`);
console.log(`Passed: ${scenarios.filter(scenario => scenario.status === "PASS").length}`);
console.log(`Failed: ${failures.length}`);
console.log(`Report: ${reportPath}`);
failures.forEach(failure => console.log(`FAIL | ${failure}`));
if (!failures.length) console.log("PASS | repeated-search state, identity supersession, grade/card/player replacement, no-results recovery, retry, evaluation return, double-submit, parameter reset, and authority boundaries are intact");
if (failures.length) process.exit(1);
