import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const email = "results-first-qa@flipforge.test";
const query = "2018 Topps Chrome Shohei Ohtani #150 PSA 9";
const failures = [];

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "results-first-qa",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      generatedAt: "2026-09-30T00:00:00Z",
      evidenceFreshness: "QA_FIXTURE",
      limitations: ["Synthetic results-first layout fixture only."]
    },
    data
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

const discoverData = {
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
    status: "CONNECTED",
    providerCredentialsExposed: false,
    customerCanConfigureProvider: false
  },
  candidateCount: 1,
  exactCandidateCount: 1,
  identityReviewCandidateCount: 0,
  evidenceSupportedCount: 1,
  evidenceSupportedBestAvailable: true,
  coverageSummary: "1 exact active candidate",
  items: [{
    rank: 1,
    discoveryScore: 94,
    discoveryLabel: "BEST_CONNECTED_CANDIDATE",
    providerDisplayName: "Authorized QA Marketplace",
    marketplace: "EBAY",
    matchQuality: "EXACT_MATCH",
    title: query,
    cardIdentityQuery: query,
    listingUrl: "https://example.test/item/123",
    allInAskCents: 52500,
    allInCostComplete: true,
    listingAvailability: "AVAILABLE",
    listingFreshness: "CURRENT",
    activeListingOnly: true,
    completedSaleEvidence: false,
    transactionAuthority: false,
    evaluationEligible: true,
    sellerFeedbackScore: 999,
    condition: "Graded",
    listingFormat: "BUY_IT_NOW",
    pricePosition: "Within supported range",
    nextAction: "Evaluate this listing with Smart Opportunity.",
    evidence: {
      trustedExactCompletedSaleCount: 4,
      supported: true,
      trustedEvidenceValueCents: 54000,
      calibratedConfidence: 82,
      risk: 28
    },
    evaluationRequest: {
      externalListingId: "QA-123",
      marketplace: "EBAY",
      cardIdentity: query,
      listingUrl: "https://example.test/item/123",
      seller: "QA Seller",
      itemPriceCents: 51500,
      shippingCents: 1000,
      buyerPremiumCents: 0,
      taxCents: 0,
      listingFormat: "BUY_IT_NOW"
    }
  }]
};

for (const [name,width,height] of [["desktop",1440,1000],["tablet",900,900],["mobile",390,844]]) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
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
        getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Results First QA", membershipActive: true, membershipConfigured: true })
      });`
    }));
    await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: "(() => {})();"
    }));
    await page.route("**/api/conversion-event", route => route.fulfill({ status: 202, contentType: "application/json", body: "{}" }));
    await page.route("**/api/v1/**", async route => {
      const req = route.request();
      const url = new URL(req.url());
      const correlationId = req.headers()["x-correlation-id"] || "results-first-qa";
      if (url.pathname === "/api/v1/health") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(envelope(correlationId, { status: "configured" })) });
        return;
      }
      if (url.pathname === "/api/v1/discover") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(envelope(correlationId, discoverData)) });
        return;
      }
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    });

    await page.goto(`${baseUrl}/#/discover`, { waitUntil: "domcontentloaded", timeout: 12000 });
    const form = page.locator("#main-content [data-customer-discovery-form]");
    await form.waitFor({ state: "visible", timeout: 8000 });
    await form.locator('input[name="exactCardQuery"]').fill(query);
    await form.locator('button[type="submit"]').click();

    const results = page.locator("#ff-discovery-results");
    await results.waitFor({ state: "visible", timeout: 6000 });
    await page.waitForTimeout(500);

    const metrics = await page.evaluate(() => {
      const results = document.querySelector("#ff-discovery-results");
      const search = document.querySelector(".customer-discovery-search");
      const provider = [...document.querySelectorAll(".panel")].find(node => /Connected source status/i.test(node.textContent || ""));
      const shell = document.querySelector("[data-ff-p3-evaluate-shell]");
      const rect = results?.getBoundingClientRect();
      const searchRect = search?.getBoundingClientRect();
      const providerRect = provider?.getBoundingClientRect();
      return {
        resultTop: rect?.top ?? null,
        resultBottom: rect?.bottom ?? null,
        searchBottom: searchRect?.bottom ?? null,
        providerTop: providerRect?.top ?? null,
        shellVisible: shell ? getComputedStyle(shell).display !== "none" : false,
        activeId: document.activeElement?.id || "",
        viewportHeight: innerHeight
      };
    });

    if (metrics.resultTop == null) failures.push(`${name}: results had no rendered position`);
    if (metrics.resultTop != null && metrics.resultTop > Math.max(220, height * .33)) {
      failures.push(`${name}: results start at ${Math.round(metrics.resultTop)}px instead of near the top after search`);
    }
    if (metrics.searchBottom != null && metrics.resultTop != null && metrics.resultTop - metrics.searchBottom > 140) {
      failures.push(`${name}: ${Math.round(metrics.resultTop - metrics.searchBottom)}px of non-actionable content sits between search and results`);
    }
    if (metrics.providerTop != null && metrics.resultTop != null && metrics.providerTop < metrics.resultTop) {
      failures.push(`${name}: provider diagnostics still appear before actionable results`);
    }
    if (metrics.shellVisible) failures.push(`${name}: Phase 3 instruction shell remains visible after results are ready`);
    if (metrics.activeId !== "ff-discovery-results") failures.push(`${name}: focus did not land on the result section after search`);
  } finally {
    await context.close();
    await browser.close();
  }
}

console.log("FlipForge Discover results-first audit");
console.log(`Failures: ${failures.length}`);
failures.forEach(failure => console.log(`FAIL | ${failure}`));
if (!failures.length) console.log("PASS | completed searches move directly to actionable results with no instructional or provider block in front of them");
if (failures.length) process.exit(1);
