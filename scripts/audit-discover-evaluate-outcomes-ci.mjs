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
let entitlementsMode = "beta"; // which allowance the read-only entitlements response reports after a 429
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
    if (url.pathname === "/api/v1/entitlements") {
      if (entitlementsMode === "stall") await new Promise(r => setTimeout(r, 4000));
      if (entitlementsMode === "available-slow") await new Promise(r => setTimeout(r, 3000));
      // Limit reached partly by an in-progress reservation: 4 completed + 1 reserved of 5.
      if (entitlementsMode === "reserved" || entitlementsMode === "reserved-noadmission") {
        const usage = { evaluationAllowanceScope: "PRIVATE_BETA_LIFETIME", completedEvaluations: 4, inProgressReservations: 1,
          evaluationAllowanceLimit: 5, remainingEvaluations: 0, evaluationAllowedNow: false };
        if (entitlementsMode === "reserved") usage.admissionUsage = 5;
        return json(200, envelope(correlationId, { kind: "entitlements", readOnly: true,
          current: { code: "PRIVATE_BETA", accessState: "PRIVATE_BETA_EVALUATION_ALLOWANCE_REACHED", evaluationAllowanceScope: "PRIVATE_BETA_LIFETIME", effectiveEvaluationLimit: 5 },
          usage }));
      }
      if (entitlementsMode === "fail") return json(503, { error: { code: "UPSTREAM_UNAVAILABLE", message: "Unavailable.", correlationId } });
      const beta = entitlementsMode !== "monthly";
      if (entitlementsMode === "available" || entitlementsMode === "available-slow") return json(200, envelope(correlationId, {
        kind: "entitlements", readOnly: true,
        current: { code: "PRIVATE_BETA", accessState: "PRIVATE_BETA_ACTIVE", evaluationAllowanceScope: "PRIVATE_BETA_LIFETIME", effectiveEvaluationLimit: 50 },
        usage: { evaluationAllowanceScope: "PRIVATE_BETA_LIFETIME", completedEvaluations: 5, inProgressReservations: 0, admissionUsage: 5,
          evaluationAllowanceLimit: 50, remainingEvaluations: 45, evaluationAllowedNow: true }
      }));
      return json(200, envelope(correlationId, {
        kind: "entitlements", readOnly: true,
        current: { code: beta ? "PRIVATE_BETA" : "SCOUT", accessState: beta ? "PRIVATE_BETA_EVALUATION_ALLOWANCE_REACHED" : "MONTHLY_EVALUATION_LIMIT_REACHED",
          evaluationAllowanceScope: beta ? "PRIVATE_BETA_LIFETIME" : "UTC_CALENDAR_MONTH", effectiveEvaluationLimit: beta ? 5 : 25 },
        usage: { evaluationAllowanceScope: beta ? "PRIVATE_BETA_LIFETIME" : "UTC_CALENDAR_MONTH", completedEvaluations: beta ? 5 : 25,
          inProgressReservations: 0, admissionUsage: beta ? 5 : 25, evaluationAllowanceLimit: beta ? 5 : 25, remainingEvaluations: 0, evaluationAllowedNow: false }
      }));
    }
    if (url.pathname === "/api/v1/evaluations") {
      evaluationCalls.push(request.headers()["idempotency-key"]);
      const mode = evalModes.length > 1 ? evalModes.shift() : evalModes[0];
      if (mode === "success") return json(200, envelope(correlationId, evaluationData(request.headers()["idempotency-key"])));
      if (mode === "limit-slow") await new Promise(r => setTimeout(r, 3000));
      if (mode === "limit" || mode === "limit-slow") return route.fulfill({ status: 429, contentType: "application/json; charset=utf-8", headers: { "Retry-After": "1468800" },
        body: JSON.stringify({ error: { code: "EVALUATION_LIMIT_REACHED", message: "Your monthly evaluation limit has been reached.", correlationId } }) });
      if (mode === "expired") return json(401, { error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in with an invited FlipForge account.", correlationId } });
      if (mode === "denied") return json(403, { error: { code: "ENTITLEMENT_ACCESS_DENIED", message: "Your current FlipForge access does not permit a new evaluation.", correlationId } });
      if (mode === "server") return json(502, { error: { code: "UPSTREAM_UNAVAILABLE", message: "The authoritative service is unavailable.", correlationId } });
      // The gateway sent the request on, then its upstream call timed out: the evaluation may already be saved.
      if (mode === "gateway-timeout") return json(503, { error: { code: "UPSTREAM_TIMEOUT", message: "The authoritative FlipForge service timed out.", correlationId } });
      // A definite rejection by FlipForge: nothing was evaluated or saved.
      if (mode === "rejected") return json(422, { error: { code: "EVALUATION_REQUEST_INVALID", message: "This listing could not be evaluated.", correlationId } });
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


// Local legacy /app reloads the document on every route change (production-dashboard-guard.js cleanRouteTransition);
// production redirects /app to sign-in. /app/beta and /owner/customer keep the document.
const LEGACY_RELOADING_PATH = /^\/app\/?$/.test(new URL(baseUrl).pathname);
const passes = [];
const failures = [];
const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const EXPECT = {
  success: { saved: true },
  limit: { title: /You\u2019ve reached your Private Beta evaluation allowance\./, body: /No new evaluation was created.*You have used 5 of 5/, link: "#/account", disablesEvaluate: true },
  "limit-monthly": { title: /You\u2019ve reached this month\u2019s evaluation limit\./, body: /No new evaluation was created.*You have used 25 of 25/, link: "#/account", disablesEvaluate: true },
  "limit-unknown": { title: /Evaluation limit reached/, body: /No new evaluation was created/, link: "#/account", disablesEvaluate: true },
  // Restoring sign-in returns the customer to this same Discover page (never a different route).
  expired: { title: /Sign in again/, linkPattern: new RegExp(`^/production-auth\\.html\\?return=${encodeURIComponent(`${new URL(baseUrl).pathname.replace(/\/?$/, "/")}#/discover`).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) },
  denied: { title: /can't run evaluations/, link: "#/account" },
  // Gateway/upstream failures after the request was sent on: outcome unknown (Codex P1 on 8daa884).
  server: { title: /couldn't confirm this evaluation/, unknownOutcome: true, link: "#/opportunities" },
  "gateway-timeout": { title: /No answer from FlipForge yet/, unknownOutcome: true, link: "#/opportunities" },
  rejected: { title: /couldn't be completed/ },
  // 429 while the allowance lookup stalls: the neutral limit alert shows at once, then names the allowance in place.
  "limit-stalled": { title: /Evaluation limit reached/, body: /No new evaluation was created/, link: "#/account", disablesEvaluate: true,
    enrichedTitle: /You\u2019ve reached your Private Beta evaluation allowance\./, enrichedBody: /You have used 5 of 5/ },
  // The usage line counts in-progress reservations (server admissionUsage, else completed + reserved) (Codex P2).
  "limit-reserved": { title: /You\u2019ve reached your Private Beta evaluation allowance\./, body: /You have used 5 of 5, including 1 still in progress\./, link: "#/account", disablesEvaluate: true },
  "limit-reserved-noadmission": { title: /You\u2019ve reached your Private Beta evaluation allowance\./, body: /You have used 5 of 5, including 1 still in progress\./, link: "#/account", disablesEvaluate: true },
  // 429, then the allowance becomes available again: a new search re-checks it and lifts the block (Codex P2).
  "limit-restored": { title: /You\u2019ve reached your Private Beta evaluation allowance\./, link: "#/account", disablesEvaluate: true, restoredAfter: true },
  // Outcome unknown: the server may have saved it. Must not claim nothing was saved; must point to saved decisions.
  network: { title: /Connection lost/, unknownOutcome: true, link: "#/opportunities" },
  timeout: { title: /No answer from FlipForge yet/, unknownOutcome: true, link: "#/opportunities" }
};

async function run(label, viewport, modes, entitlements = "beta") {
  entitlementsMode = entitlements;
  evalModes = modes.map(mode => mode.startsWith("limit") ? "limit" : mode);
  const clickedAt = [];
  const expectFor = mode => EXPECT[mode];
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
      const expect = expectFor(mode);
      await evaluate.scrollIntoViewIfNeeded();
      await evaluate.click({ timeout: 5000 });
      clickedAt[attempt] = Date.now();
      if (expect.saved) {
        await page.waitForFunction(() => /#\/opportunities\/EBAY-QA-OHTANI-150$/.test(location.hash), null, { timeout: 15000 });
        await page.waitForFunction(() => /PSA 9/.test(document.querySelector("#main-content .customer-intelligence-hero h2")?.textContent || ""), null, { timeout: 15000 });
        const card = await page.evaluate(() => ({
          title: document.querySelector("#main-content .customer-intelligence-hero h2")?.textContent.trim(),
          verdict: document.querySelector("#main-content .customer-intelligence-hero .staging-status")?.textContent.trim()
        }));
        // Opening the saved decision is a route change; only the legacy /app path reloads the document on route changes.
        const reloadsAllowed = LEGACY_RELOADING_PATH ? 1 : 0;
        check(`${label} attempt ${attempt + 1} (${mode}): opens the correct saved decision`,
          card.title === QUERY && card.verdict === "WATCH" && loads - loadsAtStart <= reloadsAllowed, `${JSON.stringify(card)} reloads=${loads - loadsAtStart}`);
        continue;
      }
      await page.waitForSelector("#main-content [data-discovery-evaluate-error]", { timeout: mode === "timeout" ? 45000 : 10000 });
      const alertAfterMs = Date.now() - clickedAt[attempt];
      if (mode === "limit-stalled") check(`${label} (${mode}): the limit alert appears without waiting for the allowance lookup`, alertAfterMs < 2000, `${alertAfterMs} ms`);
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
          // Guided Mode's recovery coach must not add search/"nothing saved" copy to an evaluation alert.
          coach: (document.querySelector("#main-content [data-ff-recovery]")?.innerText || "").replace(/\s+/g, " "),
          pageLevelErrorShown: Boolean(document.querySelector("#main-content > .page > .staging-error:not([data-discovery-evaluate-error])"))
        };
      });
      const linkOk = expect.link ? state.links.includes(expect.link) : expect.linkPattern ? state.links.some(href => expect.linkPattern.test(href)) : true;
      check(`${label} attempt ${attempt + 1} (${mode}): stays on Discover with no reload or route change`, state.hash === "#/discover" && loads === loadsAtStart, `${state.hash} reloads=${loads - loadsAtStart}`);
      check(`${label} attempt ${attempt + 1} (${mode}): the alert is on screen beside the button within 300 ms`, early);
      check(`${label} attempt ${attempt + 1} (${mode}): a visible, focused alert beside the button explains it (after the page settles)`,
        state.inView && state.nearButton && state.focused && state.role === "alert" && expect.title.test(state.text)
          && (expect.unknownOutcome
            ? /couldn't confirm whether this evaluation finished/.test(state.text) && !/nothing was saved|not evaluated/i.test(state.text)
            : /not evaluated|Nothing was saved|nothing was saved/.test(state.text))
          && (!expect.body || expect.body.test(state.text)),
        JSON.stringify({ inView: state.inView, nearButton: state.nearButton, focused: state.focused, text: state.text.slice(0, 120) }));
      check(`${label} attempt ${attempt + 1} (${mode}): offers the next step`, linkOk, state.links.join(","));
      check(`${label} attempt ${attempt + 1} (${mode}): no second, off-screen copy of the error`, !state.pageLevelErrorShown);
      check(`${label} attempt ${attempt + 1} (${mode}): no other guidance on the page contradicts the alert (no search-failure or "nothing saved" coach)`,
        !/didn't finish|nothing (new )?was saved/i.test(state.coach), state.coach.slice(0, 160));
      if (expect.enrichedTitle) {
        await page.waitForTimeout(4000);
        const enriched = await page.evaluate(() => {
          const alert = document.querySelector("#main-content [data-discovery-evaluate-error]");
          const r = alert?.getBoundingClientRect();
          return { text: alert ? alert.innerText.replace(/\s+/g, " ") : "", focused: document.activeElement === alert,
            inView: Boolean(r && r.top >= 0 && r.bottom <= innerHeight && r.height > 0), hash: location.hash };
        });
        check(`${label} (${mode}): once the lookup answers, the same alert names the allowance and keeps focus and position`,
          expect.enrichedTitle.test(enriched.text) && expect.enrichedBody.test(enriched.text) && enriched.focused && enriched.inView
            && enriched.hash === "#/discover" && loads === loadsAtStart, JSON.stringify(enriched).slice(0, 220));
      }
      if (expect.disablesEvaluate) {
        check(`${label} (${mode}): Evaluate is disabled once the limit is reached`, state.buttonDisabled === true);
        if (expect.restoredAfter) entitlementsMode = "available";
        // Search again: the disabled button must still be explained, with the way forward.
        await page.locator("#main-content [data-customer-discovery-form] input[name=\"exactCardQuery\"]").fill(QUERY);
        await page.locator("#main-content [data-customer-discovery-form]").evaluate(form => form.requestSubmit());
        await page.waitForTimeout(2500);
        const after = await page.evaluate(() => {
          const note = document.querySelector("#main-content [data-discovery-allowance-note]");
          const button = document.querySelector("#main-content [data-discovery-evaluate]");
          return { disabled: Boolean(button && button.disabled), note: note ? note.innerText : "", link: note?.querySelector('a[href="#/account"]') ? true : false };
        });
        if (expect.restoredAfter) {
          check(`${label} (${mode}): after the allowance is restored, a new search re-checks it and Evaluate is available again`,
            !after.disabled && !after.note, JSON.stringify(after));
        } else {
          check(`${label} (${mode}): after a new search the disabled Evaluate is still explained, with Plan & Usage`,
            after.disabled && /no evaluations left/.test(after.note) && after.link, JSON.stringify(after));
        }
      }
    }
  } catch (error) {
    check(`${label}: completed`, false, String(error.message).split("\n")[0]);
  } finally { await context.close(); }
}

// A late answer must never draw Discover over the route the customer moved to (Codex P2 on cfaa126).
async function runNavigateAway(label, viewport, variant) {
  entitlementsMode = variant === "enrich" ? "stall" : "beta";
  evalModes = [variant === "evaluate" ? "limit-slow" : "limit"];
  const { context, page } = await newPage(viewport);
  let loads = 0; page.on("load", () => { loads += 1; });
  const goto = hash => page.evaluate(h => { location.hash = h; }, hash);
  const DISCOVER_MARKUP = ".customer-discovery-page, [data-customer-discovery-form], [data-discovery-evaluate-error]";
  // Watch every DOM change while Plan & Usage is the route: Discover markup appearing even for one mutation is a failure
  // (route ownership may put the account page back afterwards, which would hide it from an end-state check).
  const watchAccount = () => page.evaluate(selector => {
    window.__discoverOverAccount = 0;
    const main = document.querySelector("#main-content");
    const observer = new MutationObserver(() => {
      if (location.hash === "#/account" && main.querySelector(selector)) window.__discoverOverAccount += 1;
    });
    observer.observe(main, { childList: true, subtree: true });
    window.__stopAccountWatch = () => observer.disconnect();
  }, DISCOVER_MARKUP);
  const accountIntact = () => page.evaluate(selector => {
    window.__stopAccountWatch?.();
    const main = document.querySelector("#main-content");
    return { hash: location.hash, discover: Boolean(main.querySelector(selector)), drawnOver: window.__discoverOverAccount ?? -1,
      account: /Plan\s*&\s*Usage/.test(main.querySelector("h1")?.textContent || "") };
  }, DISCOVER_MARKUP);
  try {
    await page.goto(`${baseUrl}/#/discover`, { waitUntil: "load" });
    const input = page.locator('#main-content [data-customer-discovery-form] input[name="exactCardQuery"]');
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(QUERY);
    await page.locator("#main-content [data-customer-discovery-form]").evaluate(form => form.requestSubmit());
    const evaluate = page.locator("#main-content [data-discovery-evaluate]").first();
    await evaluate.waitFor({ state: "visible", timeout: 10000 });
    const loadsAtStart = loads;
    await evaluate.scrollIntoViewIfNeeded();
    await evaluate.click({ timeout: 5000 });
    if (variant === "evaluate") {
      await goto("#/account"); // the 429 answers 3 s later
    } else if (variant === "enrich") {
      await page.waitForSelector("#main-content [data-discovery-evaluate-error]", { timeout: 10000 });
      await goto("#/account"); // the allowance lookup answers ~4 s later
    } else {
      await page.waitForSelector("#main-content [data-discovery-evaluate-error]", { timeout: 10000 });
      await goto("#/account");
      await page.waitForTimeout(1500);
      entitlementsMode = "available-slow";
      await goto("#/discover"); // entering Discover re-checks the allowance (answers 3 s later)...
      await page.waitForFunction(() => Boolean(document.querySelector("#main-content .customer-discovery-page")), null, { timeout: 10000 });
      await goto("#/account"); // ...but the customer has already moved on
    }
    await page.waitForFunction(() => /Plan\s*&\s*Usage/.test(document.querySelector("#main-content h1")?.textContent || "")
      && !document.querySelector("#main-content .customer-discovery-page"), null, { timeout: 10000 });
    await watchAccount();
    await page.waitForTimeout(5500);
    const after = await accountIntact();
    check(`${label}: after the late answer, Plan & Usage is still shown and Discover never redraws over it`,
      after.hash === "#/account" && after.account && !after.discover && after.drawnOver === 0 && loads === loadsAtStart, `${JSON.stringify(after)} reloads=${loads - loadsAtStart}`);
    // Back on Discover, the state from that late answer is shown correctly.
    await goto("#/discover");
    await page.waitForFunction(() => Boolean(document.querySelector("#main-content [data-discovery-evaluate]")), null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(variant === "revalidate" ? 4000 : 1000);
    const back = await page.evaluate(() => ({ disabled: document.querySelector("#main-content [data-discovery-evaluate]")?.disabled ?? null,
      note: Boolean(document.querySelector("#main-content [data-discovery-allowance-note]")) }));
    const expectedDisabled = variant !== "revalidate";
    check(`${label}: returning to Discover shows the current allowance (${expectedDisabled ? "still blocked" : "available again"})`,
      back.disabled === expectedDisabled, JSON.stringify(back));
  } catch (error) {
    check(`${label}: completed`, false, String(error.message).split("\n")[0]);
  } finally { await context.close(); }
}

const desktop = { width: 1440, height: 900 }; const mobile = { width: 390, height: 844 };
const cases = [
  ["success", ["success"]], ["Private Beta allowance reached (429)", ["limit"]],
  ["monthly plan limit reached (429)", ["limit-monthly"], "monthly"], ["limit reached, entitlements unavailable (429)", ["limit-unknown"], "fail"],
  ["expired session (401)", ["expired"]],
  ["access denied (403)", ["denied"]], ["server error (502)", ["server"]], ["network failure", ["network"]],
  ["recovery: 502 then success", ["server", "success"]], ["timeout", ["timeout"]],
  ["gateway upstream timeout (503 UPSTREAM_TIMEOUT)", ["gateway-timeout"]], ["definite rejection (422)", ["rejected"]],
  ["limit reached, allowance lookup slow (429)", ["limit-stalled"], "stall"], ["limit reached, then allowance restored (429)", ["limit-restored"]],
  ["limit reached with a reservation in progress (429)", ["limit-reserved"], "reserved"],
  ["limit reached with a reservation, no admissionUsage field (429)", ["limit-reserved-noadmission"], "reserved-noadmission"]
];
for (const [name, modes, entitlements] of cases) {
  for (const [vpName, vp] of [["desktop", desktop], ["mobile", mobile]]) await run(`${name} ${vpName}`, vp, modes, entitlements);
}
// The local legacy /app path reloads the whole document on every route change (production-dashboard-guard.js
// cleanRouteTransition; production redirects /app to sign-in), so a late answer has no page left to draw over there.
// The race is checked on the routes that keep the document across navigation (/app/beta, /owner/customer).
const legacyReloadingPath = LEGACY_RELOADING_PATH;
if (legacyReloadingPath) console.log("NOTE navigate-away races not applicable on legacy /app (route changes reload the document); checked on /app/beta.");
for (const [vpName, vp] of legacyReloadingPath ? [] : [["desktop", desktop], ["mobile", mobile]]) {
  await runNavigateAway(`navigate away before the 429 answers ${vpName}`, vp, "evaluate");
  await runNavigateAway(`navigate away before the allowance lookup answers ${vpName}`, vp, "enrich");
  await runNavigateAway(`navigate away before the allowance re-check answers ${vpName}`, vp, "revalidate");
}
await browser.close();
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) {
  console.log(`FAIL ${line}`);
  // In GitHub Actions, also surface each failure as an annotation (readable from the check run).
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Discover evaluate outcomes (${new URL(baseUrl).pathname})::${line.replace(/\r?\n/g, " ").slice(0, 900)}`);
}
console.log(`Discover evaluate outcomes audit: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
