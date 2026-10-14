// Discover -> "Evaluate with Smart Opportunity" -> saved decision, for every outcome the server can return.
//
// Production incident 2026-10-14: every evaluation was refused with HTTP 429 EVALUATION_LIMIT_REACHED (Netlify gateway
// logs). The page stayed on Discover, the button reset immediately and the error panel was rendered below the visible
// screen (the Discover layout moves it under the results), so to the customer "nothing happened" / the page looped back.
//
// Each outcome must either reach the correct saved decision (success, also after a failed attempt) or show a visible,
// focused, actionable error beside the button that was clicked - with no full page reload and no unexplained route
// change. Controlled responses only: no provider, no paid evaluation, no production data.
// Requires the local SaaS server (node saas-prototype/serve.mjs) on FLIPFORGE_LAYOUT_AUDIT_URL.
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const QUERY = "2018 Topps Chrome Shohei Ohtani #150 PSA 9";
let semanticReplay = false;
let evalModes = ["success"];
const evaluationCalls = [];

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "semantic-replay-ui-audit",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      generatedAt: "2026-10-07T02:00:00Z",
      evidenceFreshness: "QA_FIXTURE",
      limitations: ["Synthetic semantic replay UI audit fixture only."]
    },
    data
  };
}

function item() {
  const listingUrl = "https://www.ebay.com/itm/900000000001";
  return {
    rank: 1, matchQuality: "EXACT_MATCH", evaluationEligible: true, evaluationBlockReason: "",
    activeListingOnly: true, completedSaleEvidence: false, transactionAuthority: false,
    title: `${QUERY} QA exact listing`, cardIdentityQuery: QUERY, providerDisplayName: "Authorized QA Marketplace",
    marketplace: "EBAY", listingUrl, listingAvailability: "AVAILABLE", listingFreshness: "CURRENT",
    allInAskCents: 76000, allInCostComplete: true, discoveryScore: 80, discoveryLabel: "BEST_CONNECTED_CANDIDATE",
    sellerFeedbackScore: 5000, condition: "Graded", listingFormat: "FIXED_PRICE", pricePosition: "QA price context only",
    nextAction: "Verify the listing before evaluation.", rankingExplanation: "Synthetic ranking explanation.",
    rankingFactors: { identity: 100, completeness: 100, availability: 100, source: 100, freshness: 100 },
    evidence: { trustedExactCompletedSaleCount: 3, supported: true, trustedEvidenceValueCents: 85000, calibratedConfidence: 80, risk: 20 },
    evaluationRequest: {
      externalListingId: "QA-OHTANI-150", marketplace: "EBAY", cardIdentity: QUERY, listingUrl, seller: "QA Seller",
      itemPriceCents: 75995, shippingCents: 0, buyerPremiumCents: 0, taxCents: 0, listingFormat: "FIXED_PRICE"
    }
  };
}

function discoverData() {
  return {
    kind: "discover", readOnly: true, query: QUERY, requestedLimit: 25, targetMaxBuyCents: 0, discoveryPersisted: false,
    evaluationRequiredToSave: true, activeListingsAreCompletedSaleEvidence: false, transactionAuthority: false,
    tenantOwnedPersistenceCreated: false, tenantOwnershipCreatedOnlyByEvaluation: true,
    tenantIsolation: { enforced: true, defaultAccess: "DENY" },
    provider: { id: "QA_AUTHORIZED", name: "Authorized QA Marketplace", available: true, status: "QA connector available.",
      providerCredentialsExposed: false, customerCanConfigureProvider: false },
    candidateCount: 1, exactCandidateCount: 1, identityReviewCandidateCount: 0, evidenceSupportedCount: 1,
    evidenceSupportedBestAvailable: true, coverageSummary: "Synthetic exact result.", items: [item()]
  };
}

function evaluationData(requestId) {
  return {
    kind: "evaluation", requestId, opportunityId: "EBAY-QA-OHTANI-150",
    persistedToSqlite: true, tenantOwned: true, quotaEnforced: true,
    requestCanVerifyEvidence: false, requestCanVerifyIdentity: false, evidenceAcceptedByRequest: false,
    psaRecalculated: false, transactionAuthorized: false, providerCredentialsExposed: false,
    idempotentReplay: semanticReplay, ...(semanticReplay ? { semanticReplay: true, replayOfRequestId: "original-request-0001" } : {}),
    decision: { recommendation: "WATCH", supportedValueCents: 85000, exactTrustedCompCount: 3, confidence: 80, risk: 70 },
    normalizedRequest: { allInAskCents: 75995 },
    tenantIsolation: { enforced: true, idempotencyScope: "TENANT", opportunityOwnership: "GRANTED_ON_COMPLETION", defaultAccess: "DENY" }
  };
}

const browser = await chromium.launch({ headless: true, executablePath });
async function newPage(viewport, { storageWritesFail = false } = {}) {
  const context = await browser.newContext({ viewport });
  if (storageWritesFail) {
    // Quota exhausted at the moment the replay marker is written: that sessionStorage write throws.
    await context.addInitScript(() => {
      try {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (this === window.sessionStorage && key === "flipforge.semanticReplayNotice") throw new DOMException("Quota exceeded", "QuotaExceededError");
          return original.call(this, key, value);
        };
      } catch (_) {}
    });
  }
  await context.addInitScript(() => {
    try {
      localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
      for (const key of Object.keys(localStorage)) if (key.startsWith("flipforge.guidedMode")) localStorage.removeItem(key);
    } catch (_) {}
  });
  await context.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "semantic-audit@flipforge.test" }),
      getSnapshot: () => ({ authenticated: true, email: "semantic-audit@flipforge.test", fullName: "Semantic Audit", membershipActive: true, membershipConfigured: true }) });`
  }));
  await context.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const correlationId = request.headers()["x-correlation-id"] || "semantic-audit";
    const json = (status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
    if (url.pathname === "/api/v1/health") return json(200, envelope(correlationId, { status: "configured" }));
    if (url.pathname === "/api/v1/discover") return json(200, envelope(correlationId, discoverData()));
    if (url.pathname === "/api/v1/evaluations") {
      evaluationCalls.push(request.headers()["idempotency-key"]);
      const mode = evalModes.length > 1 ? evalModes.shift() : evalModes[0];
      if (mode === "success") return json(200, envelope(correlationId, evaluationData(request.headers()["idempotency-key"])));
      if (mode === "limit") return route.fulfill({ status: 429, contentType: "application/json; charset=utf-8", headers: { "Retry-After": "1468800" },
        body: JSON.stringify({ error: { code: "EVALUATION_LIMIT_REACHED", message: "Your monthly evaluation limit has been reached.", correlationId } }) });
      if (mode === "expired") return json(401, { error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in with an invited FlipForge account.", correlationId } });
      if (mode === "denied") return json(403, { error: { code: "ENTITLEMENT_ACCESS_DENIED", message: "Your current FlipForge access does not permit a new evaluation.", correlationId } });
      if (mode === "server") return json(502, { error: { code: "UPSTREAM_UNAVAILABLE", message: "The authoritative service is unavailable.", correlationId } });
      if (mode === "timeout") { await new Promise(r => setTimeout(r, 35000)); return route.abort("timedout").catch(() => {}); }
      if (mode === "network") return route.abort("failed");
    }
    if (url.pathname === "/api/v1/opportunities/EBAY-QA-OHTANI-150") return json(200, envelope(correlationId, { kind: "opportunity-detail", opportunity: { id: "EBAY-QA-OHTANI-150", title: QUERY, cardIdentity: QUERY, recommendation: "WATCH", ask: 759.95, supportedValue: 850, confidence: 80, liquidity: 70, risk: 70, rank: 70, observedAt: "2026-10-14T16:00:00Z", platform: "EBAY", mappingState: "CONFIRMED", evidence: { acceptedSales: 3 } }, sourceOfTruth: "SQLite", transactionAuthority: false }));
    if (url.pathname === "/api/v1/evidence/EBAY-QA-OHTANI-150") return json(200, envelope(correlationId, { kind: "evidence", opportunityId: "EBAY-QA-OHTANI-150", acceptedExactCompletedSales: 3, visibleButAuthorityIneligible: 0, acceptedSales: [], excludedSales: [], transactionAuthority: false }));
    if (url.pathname === "/api/v1/psa-advisor/EBAY-QA-OHTANI-150") return json(200, envelope(correlationId, { kind: "psa-advisor", opportunityId: "EBAY-QA-OHTANI-150", guidanceStatus: "AVAILABLE", recalculated: false, transactionAuthority: false }));
    return json(404, { error: { code: "QA_NOT_MOCKED", message: url.pathname, correlationId } });
  });
  return { context, page: await context.newPage() };
}


const passes = [];
const failures = [];
const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const EXPECT = {
  success: { saved: true },
  limit: { title: /Evaluation limit reached/, link: "#/account", disablesEvaluate: true },
  // Restoring sign-in returns the customer to this same Discover page (never a different route).
  expired: { title: /Sign in again/, linkPattern: new RegExp(`^/production-auth\\.html\\?return=${encodeURIComponent(`${new URL(baseUrl).pathname.replace(/\/?$/, "/")}#/discover`).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) },
  denied: { title: /can't run evaluations/, link: "#/account" },
  server: { title: /couldn't be completed/ },
  network: { title: /Connection lost/ },
  timeout: { title: /didn't finish/ }
};

async function run(label, viewport, modes) {
  evalModes = modes.slice();
  const { context, page } = await newPage(viewport);
  let loads = 0; page.on("load", () => { loads += 1; });
  try {
    await page.goto(`${baseUrl}/#/discover`, { waitUntil: "load" });
    const input = page.locator('#main-content [data-customer-discovery-form] input[name="exactCardQuery"]');
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(QUERY);
    await page.locator("#main-content [data-customer-discovery-form]").evaluate(form => form.requestSubmit());
    const evaluate = page.locator("#main-content [data-discovery-evaluate]").first();
    await evaluate.waitFor({ state: "visible", timeout: 10000 });
    const loadsAtStart = loads;
    for (let attempt = 0; attempt < modes.length; attempt += 1) {
      const mode = modes[attempt];
      const expect = EXPECT[mode];
      await evaluate.scrollIntoViewIfNeeded();
      await evaluate.click({ timeout: 5000 });
      if (expect.saved) {
        await page.waitForFunction(() => /#\/opportunities\/EBAY-QA-OHTANI-150$/.test(location.hash), null, { timeout: 15000 });
        await page.waitForFunction(() => /PSA 9/.test(document.querySelector("#main-content .customer-intelligence-hero h2")?.textContent || ""), null, { timeout: 15000 });
        const card = await page.evaluate(() => ({
          title: document.querySelector("#main-content .customer-intelligence-hero h2")?.textContent.trim(),
          verdict: document.querySelector("#main-content .customer-intelligence-hero .staging-status")?.textContent.trim()
        }));
        check(`${label} attempt ${attempt + 1} (${mode}): opens the correct saved decision`,
          card.title === QUERY && card.verdict === "WATCH" && loads === loadsAtStart, `${JSON.stringify(card)} reloads=${loads - loadsAtStart}`);
        continue;
      }
      await page.waitForSelector("#main-content [data-discovery-evaluate-error]", { timeout: mode === "timeout" ? 45000 : 10000 });
      await page.waitForTimeout(300);
      const early = await page.evaluate(() => {
        const r = document.querySelector("#main-content [data-discovery-evaluate-error]")?.getBoundingClientRect();
        return Boolean(r && r.top >= 0 && r.bottom <= innerHeight && r.height > 0);
      });
      // The Discover layout keeps rearranging for a moment after a re-render; judge focus once it has settled.
      await page.waitForTimeout(1700);
      const state = await page.evaluate(() => {
        const alert = document.querySelector("#main-content [data-discovery-evaluate-error]");
        const r = alert.getBoundingClientRect();
        const button = document.querySelector("#main-content [data-discovery-evaluate]");
        const b = button.getBoundingClientRect();
        return {
          hash: location.hash,
          inView: r.top >= 0 && r.bottom <= innerHeight && r.height > 0,
          nearButton: Math.abs(r.top - b.bottom) < 200,
          focused: document.activeElement === alert,
          role: alert.getAttribute("role"),
          text: alert.innerText.replace(/\s+/g, " "),
          links: [...alert.querySelectorAll("a[href]")].map(a => a.getAttribute("href")),
          buttonDisabled: button.disabled,
          pageLevelErrorShown: Boolean(document.querySelector("#main-content > .page > .staging-error:not([data-discovery-evaluate-error])"))
        };
      });
      const linkOk = expect.link ? state.links.includes(expect.link) : expect.linkPattern ? state.links.some(href => expect.linkPattern.test(href)) : true;
      check(`${label} attempt ${attempt + 1} (${mode}): stays on Discover with no reload or route change`, state.hash === "#/discover" && loads === loadsAtStart, `${state.hash} reloads=${loads - loadsAtStart}`);
      check(`${label} attempt ${attempt + 1} (${mode}): the alert is on screen beside the button within 300 ms`, early);
      check(`${label} attempt ${attempt + 1} (${mode}): a visible, focused alert beside the button explains it (after the page settles)`,
        state.inView && state.nearButton && state.focused && state.role === "alert" && expect.title.test(state.text) && /not evaluated|Nothing was saved|nothing was saved/.test(state.text),
        JSON.stringify({ inView: state.inView, nearButton: state.nearButton, focused: state.focused, text: state.text.slice(0, 120) }));
      check(`${label} attempt ${attempt + 1} (${mode}): offers the next step`, linkOk, state.links.join(","));
      check(`${label} attempt ${attempt + 1} (${mode}): no second, off-screen copy of the error`, !state.pageLevelErrorShown);
      if (expect.disablesEvaluate) check(`${label} (${mode}): Evaluate is disabled once the limit is reached`, state.buttonDisabled === true);
    }
  } catch (error) {
    check(`${label}: completed`, false, String(error.message).split("\n")[0]);
  } finally { await context.close(); }
}

const desktop = { width: 1440, height: 900 }; const mobile = { width: 390, height: 844 };
const cases = [
  ["success", ["success"]], ["limit reached (429)", ["limit"]], ["expired session (401)", ["expired"]],
  ["access denied (403)", ["denied"]], ["server error (502)", ["server"]], ["network failure", ["network"]],
  ["recovery: 502 then success", ["server", "success"]], ["timeout", ["timeout"]]
];
for (const [name, modes] of cases) {
  for (const [vpName, vp] of [["desktop", desktop], ["mobile", mobile]]) await run(`${name} ${vpName}`, vp, modes);
}
await browser.close();
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`Discover evaluate outcomes audit: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
