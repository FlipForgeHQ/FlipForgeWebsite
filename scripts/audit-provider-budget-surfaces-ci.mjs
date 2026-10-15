// A provider-budget refusal (422 PROVIDER_BUDGET_EXHAUSTED) is account-wide and definite: once any evaluation
// surface receives it, no surface on the page may send another evaluation (Discover, manual Evaluate, bulk CSV),
// and each explains why, until the page is reloaded.
// Scenario A: Discover is refused first, then manual Evaluate and bulk are tried.
// Scenario B: manual Evaluate is refused first, then Discover is tried.
// Controlled responses only: no provider, no paid evaluation, no production data. Private Beta path (/app/beta):
// the local legacy /app path reloads the document on every route change, which resets page state by design.
// Requires the local SaaS server (node saas-prototype/serve.mjs) on FLIPFORGE_LAYOUT_AUDIT_URL.
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app/beta";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const QUERY = "2018 Topps Chrome Shohei Ohtani #150 PSA 9";
const passes = [];
const failures = [];
const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const envelope = (correlationId, data) => ({ meta: { contractVersion: "1.0", engineVersion: "provider-budget-surfaces-audit",
  authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", correlationId, generatedAt: "2026-10-07T02:00:00Z",
  evidenceFreshness: "QA_FIXTURE", limitations: ["Synthetic provider budget audit fixture only."] }, data });
function discoverData() {
  const listingUrl = "https://www.ebay.com/itm/900000000001";
  const item = { rank: 1, matchQuality: "EXACT_MATCH", evaluationEligible: true, evaluationBlockReason: "",
    activeListingOnly: true, completedSaleEvidence: false, transactionAuthority: false,
    title: `${QUERY} QA exact listing`, cardIdentityQuery: QUERY, providerDisplayName: "Authorized QA Marketplace",
    marketplace: "EBAY", listingUrl, listingAvailability: "AVAILABLE", listingFreshness: "CURRENT",
    allInAskCents: 76000, allInCostComplete: true, discoveryScore: 80, discoveryLabel: "BEST_CONNECTED_CANDIDATE",
    sellerFeedbackScore: 5000, condition: "Graded", listingFormat: "FIXED_PRICE", pricePosition: "QA price context only",
    nextAction: "Verify the listing before evaluation.", rankingExplanation: "Synthetic ranking explanation.",
    rankingFactors: { identity: 100, completeness: 100, availability: 100, source: 100, freshness: 100 },
    evidence: { trustedExactCompletedSaleCount: 3, supported: true, trustedEvidenceValueCents: 85000, calibratedConfidence: 80, risk: 20 },
    evaluationRequest: { externalListingId: "QA-OHTANI-150", marketplace: "EBAY", cardIdentity: QUERY, listingUrl, seller: "QA Seller",
      itemPriceCents: 75995, shippingCents: 0, buyerPremiumCents: 0, taxCents: 0, listingFormat: "FIXED_PRICE" } };
  return { kind: "discover", readOnly: true, query: QUERY, requestedLimit: 25, targetMaxBuyCents: 0, discoveryPersisted: false,
    evaluationRequiredToSave: true, activeListingsAreCompletedSaleEvidence: false, transactionAuthority: false,
    tenantOwnedPersistenceCreated: false, tenantOwnershipCreatedOnlyByEvaluation: true, tenantIsolation: { enforced: true, defaultAccess: "DENY" },
    provider: { id: "QA_AUTHORIZED", name: "Authorized QA Marketplace", available: true, status: "QA connector available.",
      providerCredentialsExposed: false, customerCanConfigureProvider: false },
    candidateCount: 1, exactCandidateCount: 1, identityReviewCandidateCount: 0, evidenceSupportedCount: 1,
    evidenceSupportedBestAvailable: true, coverageSummary: "Synthetic exact result.", items: [item] };
}
const csv = "externalListingId,marketplace,cardIdentity,listingUrl,itemPrice\nbulk-1,EBAY," + QUERY + ",https://www.ebay.com/itm/900000000011,700.00";
const slowCsv = "externalListingId,marketplace,cardIdentity,listingUrl,itemPrice\n" + [1, 2, 3].map(n => `slow-${n},EBAY,${QUERY},https://www.ebay.com/itm/90000000002${n},700.00`).join("\n");

const browser = await chromium.launch({ headless: true, executablePath });

async function newPage({ discoverEvaluationFails = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
      for (const key of Object.keys(localStorage)) if (key.startsWith("flipforge.guidedMode")) localStorage.removeItem(key);
    } catch (_) {}
  });
  await context.route("**/assets/js/flipforge-identity.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "budget-audit@flipforge.test" }),
      getSnapshot: () => ({ authenticated: true, email: "budget-audit@flipforge.test", fullName: "Budget Audit", membershipActive: true, membershipConfigured: true }) });` }));
  await context.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  const calls = [];
  await context.route("**/api/v1/**", route => {
    const request = route.request();
    const url = new URL(request.url());
    const correlationId = request.headers()["x-correlation-id"] || "budget-audit";
    const json = (status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
    if (url.pathname === "/api/v1/health") return json(200, envelope(correlationId, { status: "configured" }));
    if (url.pathname === "/api/v1/discover") return json(200, envelope(correlationId, discoverData()));
    if (url.pathname === "/api/v1/evaluations") {
      const id = JSON.parse(request.postData() || "{}").externalListingId;
      calls.push(id);
      if (id === "manual-slow-ok") {
        const headers = request.headers();
        return new Promise(resolve => setTimeout(resolve, 2500)).then(() => json(200, { meta: { contractVersion: "1.0", engineVersion: "provider-budget-surfaces-audit",
          authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", correlationId: headers["x-correlation-id"],
          generatedAt: "2026-10-07T02:00:00Z", evidenceFreshness: "QA_FIXTURE", limitations: [] },
          data: { kind: "evaluation", requestId: headers["idempotency-key"], opportunityId: "EBAY-QA-MANUAL-1", persistedToSqlite: true, tenantOwned: true,
            requestCanVerifyEvidence: false, requestCanVerifyIdentity: false, evidenceAcceptedByRequest: false, psaRecalculated: false,
            transactionAuthorized: false, providerCredentialsExposed: false,
            decision: { recommendation: "WATCH", supportedValueCents: 85000, exactTrustedCompCount: 3, confidence: 80, risk: 40, reason: "QA", missingRequirement: "", nextAction: "Review." },
            normalizedRequest: { allInAskCents: 70000 },
            tenantIsolation: { enforced: true, idempotencyScope: "TENANT", opportunityOwnership: "GRANTED_ON_COMPLETION", defaultAccess: "DENY" } } }));
      }
      if (id === "manual-502") return json(502, { error: { code: "UPSTREAM_UNAVAILABLE", message: "Unavailable.", correlationId } });
      if (discoverEvaluationFails && id === "QA-OHTANI-150" && calls.filter(value => value === id).length === 1) {
        return json(502, { error: { code: "UPSTREAM_UNAVAILABLE", message: "Unavailable.", correlationId } });
      }
      // "slow-*" rows: a slow ordinary failure, so a running batch would move on to its next row.
      if (String(id).startsWith("slow-")) {
        return new Promise(resolve => setTimeout(resolve, 2500)).then(() => json(502, { error: { code: "UPSTREAM_UNAVAILABLE", message: "Unavailable.", correlationId } }));
      }
      return json(422, { error: { code: "PROVIDER_BUDGET_EXHAUSTED", message: "FlipForge stopped before finishing because this account's data-provider budget has been reached. No decision was saved and no evaluation was used.", correlationId } });
    }
    return json(404, { error: { code: "QA_NOT_MOCKED", message: url.pathname, correlationId } });
  });
  const page = await context.newPage();
  let loads = 0;
  page.on("load", () => { loads += 1; });
  return { context, page, calls, loads: () => loads };
}

async function searchDiscover(page) {
  await page.evaluate(() => { location.hash = "#/discover"; });
  const input = page.locator('#main-content [data-customer-discovery-form] input[name="exactCardQuery"]');
  const evaluate = page.locator("#main-content [data-discovery-evaluate]").first();
  // Discover can still be finishing its first render when the form appears, which resets typed text. A search
  // never sends an evaluation, so typing and submitting again until results show cannot affect what is tested.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(QUERY);
    await page.locator("#main-content [data-customer-discovery-form]").evaluate(form => form.requestSubmit());
    try {
      await evaluate.waitFor({ state: "visible", timeout: 5000 });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

async function openManual(page) {
  await page.evaluate(() => { location.hash = "#/evaluate"; });
  await page.waitForSelector("#main-content [data-staging-evaluation-form]", { timeout: 10000 });
}

async function fillManual(page, listingId) {
  const form = "#main-content [data-staging-evaluation-form]";
  await page.fill(`${form} [name="externalListingId"]`, listingId);
  await page.selectOption(`${form} [name="marketplace"]`, "EBAY").catch(() => {});
  await page.fill(`${form} [name="cardIdentity"]`, QUERY);
  await page.fill(`${form} [name="listingUrl"]`, "https://www.ebay.com/itm/900000000099");
  await page.fill(`${form} [name="itemPrice"]`, "700.00");
  await page.check(`${form} [name="acknowledgeBoundary"]`);
}

const manualState = page => page.evaluate(() => {
  // The evaluate button itself (the form also hosts the card-lookup panel's own submit button).
  const button = document.querySelector('#main-content [data-staging-evaluation-form] .staging-form-actions button[type="submit"]');
  const error = document.querySelector("#main-content .staging-error");
  return { submitDisabled: button ? button.disabled : null, error: error ? error.innerText.replace(/\s+/g, " ") : "" };
});

// Scenario A
{
  const { context, page, calls, loads } = await newPage();
  try {
    await page.goto(`${baseUrl}/#/discover`, { waitUntil: "load" });
    const loadsAtStart = loads();
    await searchDiscover(page);
    await page.locator("#main-content [data-discovery-evaluate]").first().click();
    await page.waitForSelector("#main-content [data-discovery-evaluate-error]", { timeout: 10000 });
    check("A: Discover refusal shown beside the button", /Evaluation stopped before it finished/.test(await page.locator("#main-content [data-discovery-evaluate-error]").innerText()));
    await openManual(page);
    const manual = await manualState(page);
    check("A: manual Evaluate opened after the stop has submit disabled", manual.submitDisabled === true, JSON.stringify(manual));
    // The stop came from Discover, not from this page's own request: neutral wording, no claim about a request.
    check("A: manual Evaluate explains the stop neutrally (further evaluations unavailable)", /data-provider budget has been reached/.test(manual.error)
      && /further evaluations are unavailable/.test(manual.error) && !/No decision was saved/.test(manual.error), manual.error.slice(0, 200));
    await fillManual(page, "manual-after-discover");
    await page.evaluate(() => document.querySelector("#main-content [data-staging-evaluation-form]")?.requestSubmit());
    await page.waitForTimeout(600);
    await page.waitForSelector("#main-content [data-bulk-file]", { state: "attached", timeout: 10000 });
    await page.setInputFiles("#main-content [data-bulk-file]", { name: "after-discover.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.locator("#main-content [data-bulk-ack]").check().catch(() => {});
    await page.waitForTimeout(300);
    const bulk = await page.evaluate(() => ({ runDisabled: document.querySelector("#main-content [data-bulk-run]")?.disabled === true,
      panel: document.querySelector("#main-content [data-bulk-evaluation]")?.innerText.replace(/\s+/g, " ") || "" }));
    check("A: bulk Run is disabled and explains the stop", bulk.runDisabled && /data-provider budget has been reached/.test(bulk.panel), JSON.stringify({ runDisabled: bulk.runDisabled }));
    await page.locator("#main-content [data-bulk-run]").click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    check("A: only the one Discover evaluation request was ever sent", calls.length === 1, JSON.stringify(calls));
    check("A: no page reload", loads() === loadsAtStart);
  } catch (error) {
    check("A: completed", false, String(error.message).split("\n")[0]);
  } finally {
    await context.close();
  }
}

// Scenario B
{
  const { context, page, calls, loads } = await newPage();
  try {
    await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "load" });
    const loadsAtStart = loads();
    await openManual(page);
    await fillManual(page, "manual-first");
    await page.evaluate(() => document.querySelector("#main-content [data-staging-evaluation-form]")?.requestSubmit());
    await page.waitForSelector("#main-content .staging-error", { timeout: 10000 });
    await page.waitForTimeout(300);
    const manual = await manualState(page);
    check("B: manual refusal keeps submit disabled", manual.submitDisabled === true, JSON.stringify(manual));
    check("B: manual refusal explains the stop", /No decision was saved and no evaluation was used/.test(manual.error) && /until it is reloaded/.test(manual.error), manual.error.slice(0, 200));
    await page.evaluate(() => document.querySelector("#main-content [data-staging-evaluation-form]")?.requestSubmit());
    await page.waitForTimeout(400);
    await searchDiscover(page);
    await page.waitForTimeout(400);
    const discover = await page.evaluate(() => ({ disabled: document.querySelector("#main-content [data-discovery-evaluate]")?.disabled === true,
      note: document.querySelector("#main-content [data-discovery-budget-note]")?.innerText || "" }));
    check("B: Discover Evaluate is disabled after the manual stop, with the budget note", discover.disabled && /data-provider budget has been reached/.test(discover.note), JSON.stringify(discover));
    await page.locator("#main-content [data-discovery-evaluate]").first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    check("B: only the one manual evaluation request was ever sent", calls.length === 1, JSON.stringify(calls));
    check("B: no page reload", loads() === loadsAtStart);
  } catch (error) {
    check("B: completed", false, String(error.message).split("\n")[0]);
  } finally {
    await context.close();
  }
}

// Scenario C: bulk is refused while the manual form (same page) has typed values.
{
  const { context, page, calls, loads } = await newPage();
  try {
    await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "load" });
    const loadsAtStart = loads();
    await openManual(page);
    await fillManual(page, "typed-before-bulk");
    await page.waitForSelector("#main-content [data-bulk-file]", { state: "attached", timeout: 10000 });
    await page.setInputFiles("#main-content [data-bulk-file]", { name: "bulk-first.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.locator("#main-content [data-bulk-ack]").check();
    await page.locator("#main-content [data-bulk-run]").click();
    await page.waitForFunction(() => !/Evaluating/.test(document.querySelector("#main-content [data-bulk-run]")?.textContent || ""), null, { timeout: 15000 });
    await page.waitForTimeout(300);
    const manual = await manualState(page);
    const typed = await page.inputValue('#main-content [data-staging-evaluation-form] [name="externalListingId"]');
    check("C: after a bulk refusal the manual Evaluate button is disabled without navigating", manual.submitDisabled === true, JSON.stringify(manual).slice(0, 160));
    check("C: the manual form explains the stop in place", /data-provider budget has been reached/.test(manual.error));
    check("C: the customer's typed manual values are kept", typed === "typed-before-bulk", typed);
    await page.evaluate(() => document.querySelector("#main-content [data-staging-evaluation-form]")?.requestSubmit());
    await page.waitForTimeout(400);
    check("C: only the one bulk request was ever sent", calls.length === 1 && calls[0] === "bulk-1", JSON.stringify(calls));
    check("C: no page reload", loads() === loadsAtStart);
  } catch (error) {
    check("C: completed", false, String(error.message).split("\n")[0]);
  } finally {
    await context.close();
  }
}

// Scenario D: a bulk batch is mid-flight when the manual form is refused; the batch must not send its next row.
{
  const { context, page, calls } = await newPage();
  try {
    await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "load" });
    await openManual(page);
    await page.waitForSelector("#main-content [data-bulk-file]", { state: "attached", timeout: 10000 });
    await page.setInputFiles("#main-content [data-bulk-file]", { name: "slow.csv", mimeType: "text/csv", buffer: Buffer.from(slowCsv) });
    await page.locator("#main-content [data-bulk-ack]").check();
    await page.locator("#main-content [data-bulk-run]").click();
    await page.waitForFunction(() => /Evaluating/.test(document.querySelector("#main-content [data-bulk-run]")?.textContent || ""), null, { timeout: 5000 });
    await fillManual(page, "manual-during-bulk");
    await page.evaluate(() => document.querySelector("#main-content [data-staging-evaluation-form]")?.requestSubmit());
    await page.waitForFunction(() => !/Evaluating/.test(document.querySelector("#main-content [data-bulk-run]")?.textContent || ""), null, { timeout: 20000 });
    await page.waitForTimeout(500);
    const panel = await page.evaluate(() => document.querySelector("#main-content [data-bulk-evaluation]")?.innerText.replace(/\s+/g, " ") || "");
    check("D: the running batch stops before its next row once another surface is refused",
      calls.includes("slow-1") && calls.includes("manual-during-bulk") && !calls.includes("slow-2") && !calls.includes("slow-3"), JSON.stringify(calls));
    check("D: the bulk panel explains why the batch stopped", /data-provider budget has been reached/.test(panel), panel.slice(0, 160));
  } catch (error) {
    check("D: completed", false, String(error.message).split("\n")[0]);
  } finally {
    await context.close();
  }
}

// Scenario E: an older Discover error must not hide the budget stop that another surface reported later.
{
  const { context, page, calls } = await newPage({ discoverEvaluationFails: true });
  try {
    await page.goto(`${baseUrl}/#/discover`, { waitUntil: "load" });
    await searchDiscover(page);
    await page.locator("#main-content [data-discovery-evaluate]").first().click();
    await page.waitForSelector("#main-content [data-discovery-evaluate-error]", { timeout: 10000 });
    const first = await page.locator("#main-content [data-discovery-evaluate-error]").innerText();
    check("E: Discover first shows the ordinary (retryable) failure", /couldn't confirm this evaluation/i.test(first), first.slice(0, 80));
    await openManual(page);
    await fillManual(page, "manual-after-discover-error");
    await page.evaluate(() => document.querySelector("#main-content [data-staging-evaluation-form]")?.requestSubmit());
    await page.waitForSelector("#main-content .staging-error", { timeout: 10000 });
    await page.evaluate(() => { location.hash = "#/discover"; });
    await page.waitForSelector("#main-content [data-discovery-evaluate]", { timeout: 10000 });
    await page.waitForTimeout(400);
    const discover = await page.evaluate(() => ({
      disabled: document.querySelector("#main-content [data-discovery-evaluate]")?.disabled === true,
      note: document.querySelector("#main-content [data-discovery-budget-note]")?.innerText || "",
      staleAlert: document.querySelector("#main-content [data-discovery-evaluate-error]")?.innerText || ""
    }));
    check("E: back on Discover the budget note replaces the stale retryable error", discover.disabled
      && /data-provider budget has been reached/.test(discover.note) && !/try again|couldn't confirm/i.test(discover.staleAlert), JSON.stringify(discover).slice(0, 220));
    check("E: two requests in total (the failed Discover one and the refused manual one)", calls.length === 2, JSON.stringify(calls));
  } catch (error) {
    check("E: completed", false, String(error.message).split("\n")[0]);
  } finally {
    await context.close();
  }
}

// Scenario G: a manual request already in flight completes after bulk (same page) reports the stop.
{
  const { context, page, calls } = await newPage();
  try {
    await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "load" });
    await openManual(page);
    await fillManual(page, "manual-slow-ok");
    await page.evaluate(() => document.querySelector("#main-content [data-staging-evaluation-form]")?.requestSubmit());
    await page.waitForSelector("#main-content [data-bulk-file]", { state: "attached", timeout: 10000 });
    await page.setInputFiles("#main-content [data-bulk-file]", { name: "during-manual.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.locator("#main-content [data-bulk-ack]").check();
    await page.locator("#main-content [data-bulk-run]").click();
    await page.waitForSelector("#main-content .staging-evaluation-result", { timeout: 15000 });
    await page.waitForTimeout(400);
    const view = await page.evaluate(() => ({
      result: document.querySelector("#main-content .staging-evaluation-result")?.innerText.replace(/\s+/g, " ") || "",
      errors: [...document.querySelectorAll("#main-content .staging-error")].map(node => node.innerText.replace(/\s+/g, " ")),
      submitDisabled: document.querySelector('#main-content [data-staging-evaluation-form] .staging-form-actions button[type="submit"]')?.disabled === true
    }));
    check("G: the in-flight manual evaluation's saved result is shown", /WATCH/.test(view.result), view.result.slice(0, 120));
    check("G: nothing on the page claims that no decision was saved", !view.errors.some(text => /No decision was saved/.test(text)), JSON.stringify(view.errors).slice(0, 220));
    check("G: the neutral stop is explained and further manual evaluations are disabled", view.submitDisabled
      && view.errors.some(text => /further evaluations are unavailable/.test(text)), JSON.stringify(view.errors).slice(0, 220));
    check("G: requests: the manual one and the single refused bulk row", calls.length === 2 && calls.includes("manual-slow-ok") && calls.includes("bulk-1"), JSON.stringify(calls));
  } catch (error) {
    check("G: completed", false, String(error.message).split("\n")[0]);
  } finally {
    await context.close();
  }
}

// Scenario F: an older manual-form error must not hide the budget stop that Discover reported later.
{
  const { context, page, calls } = await newPage();
  try {
    await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "load" });
    await openManual(page);
    await fillManual(page, "manual-502");
    await page.evaluate(() => document.querySelector("#main-content [data-staging-evaluation-form]")?.requestSubmit());
    await page.waitForSelector("#main-content .staging-error", { timeout: 10000 });
    await searchDiscover(page);
    await page.locator("#main-content [data-discovery-evaluate]").first().click();
    await page.waitForSelector("#main-content [data-discovery-evaluate-error]", { timeout: 10000 });
    await openManual(page);
    await page.waitForTimeout(400);
    const manual = await manualState(page);
    const errors = await page.evaluate(() => [...document.querySelectorAll("#main-content .staging-error")].map(node => node.innerText.replace(/\s+/g, " ")));
    check("F: back on manual Evaluate the budget stop is shown, not the stale retryable error", manual.submitDisabled === true
      && errors.length === 1 && /data-provider budget has been reached/.test(errors[0]), JSON.stringify(errors).slice(0, 220));
    check("F: two requests in total (the failed manual one and the refused Discover one)", calls.length === 2, JSON.stringify(calls));
  } catch (error) {
    check("F: completed", false, String(error.message).split("\n")[0]);
  } finally {
    await context.close();
  }
}

await browser.close();
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) {
  console.log(`FAIL ${line}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Provider budget surfaces (${new URL(baseUrl).pathname})::${line.replace(/\r?\n/g, " ").slice(0, 900)}`);
}
console.log(`Provider budget surfaces audit: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
