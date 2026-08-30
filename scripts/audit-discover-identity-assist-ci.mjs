import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const email = "discover-identity-qa@flipforge.test";
const imperfectQuery = "2018 Topps Chrome Shohei Ohtani PSA 9";
const canonicalIdentity = "2018 Topps Chrome Shohei Ohtani #150 PSA 9";
const selectionToken = "a".repeat(64);
const failures = [];
const calls = { search: [], resolve: [], discover: [] };

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "discover-identity-qa",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      generatedAt: "2026-08-30T22:30:00Z",
      evidenceFreshness: "QA_FIXTURE",
      limitations: ["Synthetic identity-assist QA fixture only."]
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

function discoverData() {
  return {
    kind: "discover",
    readOnly: true,
    query: canonicalIdentity,
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
      status: "CONNECTED",
      providerCredentialsExposed: false,
      customerCanConfigureProvider: false
    },
    candidateCount: 0,
    exactCandidateCount: 0,
    identityReviewCandidateCount: 0,
    evidenceSupportedCount: 0,
    evidenceSupportedBestAvailable: false,
    coverageSummary: "Synthetic identity-assist QA returned no active listings after canonical resolution.",
    items: []
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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

try {
  const key = accountHash(email);
  await page.addInitScript(({ key }) => {
    // Model a returning invited tester. The private-beta first-run redirect is
    // a real product guard, so this test must explicitly complete that browser
    // preference before exercising the signed-in Step 9 identity path.
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
      getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Identity QA", membershipActive: true, membershipConfigured: true })
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
    const correlationId = request.headers()["x-correlation-id"] || "discover-identity-qa";
    const body = requestBody(request);

    if (url.pathname === "/api/v1/health") {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(envelope(correlationId, { status: "configured" }))
      });
      return;
    }

    if (url.pathname === "/api/v1/card-intelligence/search") {
      calls.search.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(envelope(correlationId, cardIntelligenceData({
          results: [
            {
              type: "CARD_IDENTITY",
              name: "Shohei Ohtani",
              year: "2018",
              setName: "Topps Chrome",
              cardNumber: "150",
              parallelName: "",
              grader: "PSA",
              grade: "9",
              exactCardCandidate: true,
              selectionToken
            },
            {
              type: "CARD_IDENTITY",
              name: "Shohei Ohtani",
              year: "2018",
              setName: "Topps Chrome Update",
              cardNumber: "HMT1",
              parallelName: "",
              grader: "PSA",
              grade: "9",
              exactCardCandidate: false
            }
          ]
        })))
      });
      return;
    }

    if (url.pathname === "/api/v1/card-intelligence/resolve") {
      calls.resolve.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(envelope(correlationId, cardIntelligenceData({
          readyForEvaluation: true,
          cardIdentity: canonicalIdentity,
          message: "Exact card identity confirmed by the server-owned resolver."
        })))
      });
      return;
    }

    if (url.pathname === "/api/v1/discover") {
      calls.discover.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(envelope(correlationId, discoverData()))
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto(`${baseUrl}/#/discover`, { waitUntil: "domcontentloaded", timeout: 10_000 });
  const form = page.locator("#main-content [data-customer-discovery-form]");
  const input = form.locator('input[name="exactCardQuery"]');
  await input.waitFor({ state: "visible", timeout: 7_000 });
  await input.fill(imperfectQuery);
  await form.locator('button[type="submit"]').click();

  const assist = page.locator("#main-content .customer-discovery-identity-assist");
  await assist.waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(250);

  if (calls.search.length !== 1) failures.push(`identity search call count was ${calls.search.length}, expected 1`);
  if (calls.search[0]?.query !== imperfectQuery) failures.push(`identity search changed the imperfect query before resolution: ${JSON.stringify(calls.search[0])}`);
  if (calls.search[0]?.limit !== 12) failures.push(`identity search limit was ${calls.search[0]?.limit}, expected 12`);
  if (calls.discover.length !== 0) failures.push("Discover ran before the customer selected an identity candidate");
  if (calls.resolve.length !== 0) failures.push("identity resolve ran before the customer selected a candidate");

  const assistText = (await assist.innerText()).replace(/\s+/g, " ").trim();
  if (!/FlipForge will not choose one for you/i.test(assistText)) failures.push("identity-assist panel does not state that FlipForge will not auto-select");
  if (!/Exact card match found/i.test(assistText)) failures.push("exact-card candidate is not promoted as the primary verified option");

  const exactButton = assist.locator("[data-discovery-use-identity]").first();
  if (!(await exactButton.isVisible().catch(() => false))) failures.push("verified identity candidate has no explicit selection control");
  const exactButtonText = String(await exactButton.textContent()).trim();
  if (!/Use exact match/i.test(exactButtonText)) failures.push(`verified identity action label was ${JSON.stringify(exactButtonText)}`);
  if (await assist.locator("[data-discovery-use-identity]").count() !== 1) failures.push("review-only alternate was incorrectly made directly selectable");

  // When an exact match exists, review-only variants should stay collapsed by
  // default. Expand them explicitly and prove they expose verification rather
  // than a direct evaluation handoff.
  const reviewButton = assist.locator("[data-ff-verify-review-match]").first();
  const reviewInitiallyVisible = await reviewButton.isVisible().catch(() => false);
  if (reviewInitiallyVisible) failures.push("review-only alternate was not progressively disclosed when an exact match was available");
  const alternateToggle = assist.locator("[data-ff-toggle-identity-alternates]");
  if (!(await alternateToggle.isVisible().catch(() => false))) {
    failures.push("hidden review-only alternate has no progressive-disclosure control");
  } else {
    await alternateToggle.click();
    if (!(await reviewButton.isVisible().catch(() => false))) failures.push("expanded review-only alternate has no explicit verification control");
  }

  await exactButton.click();
  await page.waitForFunction(() => {
    const input = document.querySelector('#main-content [data-customer-discovery-form] input[name="exactCardQuery"]');
    return input && input.value.includes("#150");
  }, { timeout: 5_000 });
  await page.waitForTimeout(250);

  if (calls.resolve.length !== 1) failures.push(`identity resolve call count was ${calls.resolve.length}, expected 1`);
  if (calls.resolve[0]?.selectionToken !== selectionToken) failures.push("identity resolve did not send only the selected server-issued token");
  if (calls.discover.length !== 1) failures.push(`Discover call count after resolution was ${calls.discover.length}, expected 1`);
  if (calls.discover[0]?.exactCardQuery !== canonicalIdentity) failures.push(`Discover did not receive the server-resolved canonical identity: ${JSON.stringify(calls.discover[0])}`);
  if (calls.discover[0]?.exactCardQuery === imperfectQuery) failures.push("Discover reused the imperfect input instead of the resolved canonical identity");

  const finalInputValue = await page.locator('#main-content [data-customer-discovery-form] input[name="exactCardQuery"]').inputValue();
  if (finalInputValue !== canonicalIdentity) failures.push(`Discover input did not retain the canonical identity after resolution: ${JSON.stringify(finalInputValue)}`);
  if (await page.locator("#main-content .customer-discovery-identity-assist").count()) failures.push("identity-assist choices remained mounted after exact resolution");
} finally {
  await context.close();
  await browser.close();
}

console.log("FlipForge Discover imperfect-identity audit");
console.log(`Imperfect input: ${imperfectQuery}`);
console.log(`Canonical identity: ${canonicalIdentity}`);
console.log(`Failures: ${failures.length}`);
failures.forEach(failure => console.log(`FAIL | ${failure}`));
if (!failures.length) console.log("PASS | explicit candidate selection, progressive variant verification, server-token resolution, canonical identity handoff, and no auto-selection");
if (failures.length) process.exit(1);
