// Rendered check: when the backend answers an evaluation from an existing saved decision
// (semanticReplay), the customer is told "Already evaluated" instead of seeing a new evaluation.
// Covers Discover -> saved decision handoff and the Manual Evaluate result panel.
// Requires the local SaaS server (node saas-prototype/serve.mjs) on FLIPFORGE_LAYOUT_AUDIT_URL.
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const passes = [];
const failures = [];
const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);
const QUERY = "2018 Topps Chrome Shohei Ohtani #150 PSA 9";
let semanticReplay = true;
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
      return json(200, envelope(correlationId, evaluationData(request.headers()["idempotency-key"])));
    }
    return json(404, { error: { code: "QA_NOT_MOCKED", message: url.pathname, correlationId } });
  });
  return { context, page: await context.newPage() };
}

async function discoverHandoff(label, viewport, replay) {
  semanticReplay = replay;
  const { context, page } = await newPage(viewport);
  try {
    await page.goto(`${baseUrl}/#/discover`, { waitUntil: "domcontentloaded" });
    const input = page.locator('#main-content [data-customer-discovery-form] input[name="exactCardQuery"]');
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(QUERY);
    await page.locator("#main-content [data-customer-discovery-form]").evaluate(form => form.requestSubmit());
    const evaluate = page.locator("#main-content [data-discovery-evaluate]").first();
    await evaluate.waitFor({ state: "visible", timeout: 10000 });
    await evaluate.evaluate(button => button.click());
    await page.waitForFunction(() => /#\/opportunities\/EBAY-QA-OHTANI-150$/.test(location.hash), null, { timeout: 10000 });
    const notice = page.locator("[data-ff-already-evaluated]");
    if (replay) {
      await notice.waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
      const text = (await notice.count()) ? await notice.first().innerText() : "";
      check(`D1 ${label}: Discover opens the existing saved decision with an Already evaluated notice`,
        /^Already evaluated/.test(text) && /No evaluation was used/.test(text), text);
      const bar = page.locator("#main-content [data-ff-saved-decision-bar]");
      const barText = (await bar.count()) ? await bar.first().innerText() : "";
      const pendingSave = await page.evaluate(() => { try { return sessionStorage.getItem("flipforge.pendingEvaluationSave"); } catch (_) { return null; } });
      check(`D3 ${label}: the saved decision page does not claim a new evaluation completed`,
        pendingSave !== "1" && !/Evaluation complete/i.test(barText), `pendingEvaluationSave=${pendingSave}; bar=${barText.slice(0, 80) || "absent"}`);
    } else {
      await page.waitForTimeout(1500);
      check(`D2 ${label}: a genuinely new evaluation shows no Already evaluated notice`, (await notice.count()) === 0);
    }
  } catch (error) {
    check(`D0 ${label}: Discover handoff completed`, false, String(error?.message || error).slice(0, 300));
  } finally {
    await context.close();
  }
}

async function manualEvaluate(label, viewport) {
  semanticReplay = true;
  const { context, page } = await newPage(viewport);
  try {
    await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "domcontentloaded" });
    const form = page.locator("[data-staging-evaluation-form]");
    await form.waitFor({ state: "visible", timeout: 10000 });
    await form.locator('input[name="externalListingId"]').fill("QA-OHTANI-150");
    await form.locator('textarea[name="cardIdentity"]').fill(QUERY);
    await form.locator('input[name="listingUrl"]').fill("https://www.ebay.com/itm/900000000001");
    await form.locator('input[name="itemPrice"]').fill("759.95");
    await form.locator('input[name="acknowledgeBoundary"]').check();
    await form.evaluate(node => node.requestSubmit());
    const result = page.locator(".staging-evaluation-result");
    await result.waitFor({ state: "visible", timeout: 10000 });
    const heading = await result.locator("h2").first().innerText();
    const copy = await result.locator(".panel-header p").first().innerText();
    const open = result.locator(`a[href$="EBAY-QA-OHTANI-150"]`).last();
    check(`M1 ${label}: Manual Evaluate says "Already evaluated — open saved decision"`, heading.trim() === "Already evaluated — open saved decision", heading);
    check(`M2 ${label}: Manual Evaluate explains no evaluation was used`, /no evaluation was used/i.test(copy), copy);
    check(`M3 ${label}: Manual Evaluate links straight to the saved decision`, (await open.count()) === 1 && /Open saved decision/i.test(await open.textContent()), (await open.count()) ? await open.textContent() : "missing");
  } catch (error) {
    check(`M0 ${label}: Manual Evaluate completed`, false, String(error?.message || error).slice(0, 300));
  } finally {
    await context.close();
  }
}

async function storageFailureHandoff(label, viewport) {
  semanticReplay = true;
  const { context, page } = await newPage(viewport, { storageWritesFail: true });
  try {
    await page.goto(`${baseUrl}/#/discover`, { waitUntil: "domcontentloaded" });
    const input = page.locator('#main-content [data-customer-discovery-form] input[name="exactCardQuery"]');
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(QUERY);
    await page.locator("#main-content [data-customer-discovery-form]").evaluate(form => form.requestSubmit());
    const evaluate = page.locator("#main-content [data-discovery-evaluate]").first();
    await evaluate.waitFor({ state: "visible", timeout: 10000 });
    // Production's click capture marks a pending save before the response arrives.
    await page.evaluate(() => sessionStorage.setItem("flipforge.pendingEvaluationSave", "1"));
    await evaluate.evaluate(button => button.click());
    await page.waitForFunction(() => /#\/opportunities\/EBAY-QA-OHTANI-150$/.test(location.hash), null, { timeout: 10000 });
    await page.waitForTimeout(2500);
    const pendingSave = await page.evaluate(() => { try { return sessionStorage.getItem("flipforge.pendingEvaluationSave"); } catch (_) { return null; } });
    const bar = page.locator("#main-content [data-ff-saved-decision-bar]");
    const barText = (await bar.count()) ? await bar.first().innerText() : "";
    check(`D4 ${label}: when sessionStorage writes fail, the saved decision still opens and never claims a new evaluation`,
      pendingSave !== "1" && !/Evaluation complete/i.test(barText), `pendingEvaluationSave=${pendingSave}; bar=${barText.slice(0, 80) || "absent"}`);
  } catch (error) {
    check(`D4 ${label}: storage-failure handoff completed`, false, String(error?.message || error).slice(0, 300));
  } finally {
    await context.close();
  }
}

for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  await discoverHandoff(label, viewport, true);
  await discoverHandoff(label, viewport, false);
  await manualEvaluate(label, viewport);
  await storageFailureHandoff(label, viewport);
}
await browser.close();
check("X1 every evaluation request carried an Idempotency-Key (normal retries unchanged)", evaluationCalls.length >= 6 && evaluationCalls.every(Boolean), String(evaluationCalls.length));

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) {
  console.log(`FAIL ${line}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Semantic replay UI audit::${line.replace(/[\r\n]+/g, " ").slice(0, 900)}`);
}
console.log(`\nSemantic replay UI audit: ${passes.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
