import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_HEAT_AUDIT_URL || "http://127.0.0.1:4173/app";
const viewports = [
  ["desktop", 1440, 1000],
  ["tablet", 900, 1100],
  ["mobile", 390, 844]
];

function heatEnvelope(correlationId) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "visual-heat-v1",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      generatedAt: "2026-08-15T02:00:00Z",
      evidenceFreshness: "SAVED_COMPLETED_EVALUATION_SNAPSHOT",
      limitations: ["Synthetic Forge Heat visual QA fixture only."]
    },
    data: {
      kind: "forge-heat",
      heatVersion: "FORGE_HEAT_V1",
      serviceVersion: "visual-qa",
      proFeature: true,
      locked: false,
      access: { allowed: true, currentPlan: "PRO", requiredPlan: "PRO", privateBetaPreview: false, accessState: "ACTIVE" },
      authority: {
        recommendationAuthority: "Smart Opportunity",
        gradingAuthority: "Existing PSA intelligence",
        forgeHeatRecommendationAuthority: false,
        clientComputed: false,
        transactionAuthority: false
      },
      scope: {
        code: "SAVED_EVALUATED_UNIVERSE",
        marketWide: false,
        continuousMarketScannerActive: false,
        description: "Forge Heat V1 ranks the latest eligible completed evaluations saved for this account."
      },
      componentAvailability: {
        momentum: { available: false, reason: "Heat history is not yet sufficient." },
        stability: { available: false, reason: "Price-dispersion scoring is not active in V1." },
        scarcity: { available: false, reason: "Population context is not included in V1." },
        netEconomics: { available: false, reason: "V1 reports supported-value gap, not net profit." }
      },
      summary: { latestEvaluationsConsidered: 18, heatEligible: 7, surfaced: 4, unscored: 11 },
      top5: [
        {
          rank: 1,
          requestId: "req-heat-visual-001",
          opportunityId: "opp-heat-visual-001",
          cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 Refractor PSA 10",
          marketplace: "EBAY",
          externalListingId: "listing-heat-001",
          recommendation: "BUY",
          heat: 91,
          heatBand: "WHITE_HOT",
          confidence: 93,
          risk: 21,
          acceptedExactSales: 24,
          evidenceScore: 90,
          allInAskCents: 42500,
          supportedValueCents: 55500,
          supportedValueGapCents: 13000,
          supportedValueGapPct: 30.6,
          supportRating: "SUPPORTED",
          evaluatedAt: "2026-08-15T01:30:00Z",
          snapshotAgeDays: 0,
          whyHot: [
            "Supported value is 30.6% above the saved all-in ask.",
            "24 exact trusted completed sales support the decision context.",
            "Forge Confidence is 93/100.",
            "Opportunity Risk is 21/100."
          ],
          couldCool: ["New completed-sale evidence can move supported value, confidence, and risk."],
          invalidates: [
            "Smart Opportunity changes from BUY/WATCH to VERIFY/PASS.",
            "Confidence falls below 50 or risk rises above 80.",
            "The all-in ask reaches or exceeds the current supported value of $555.00."
          ],
          transactionAuthority: false
        }
      ],
      hiddenGems: [],
      highestEdge: [],
      unscoredPreview: []
    }
  };
}

async function stubIdentity(page) {
  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({
      getUser: () => ({ id: "qa-user" }),
      getSnapshot: () => ({ authenticated: true, email: "qa@goflipforge.com", fullName: "QA User", membershipActive: true, membershipConfigured: true })
    });`
  }));
}

async function audit(browser, name, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      window.localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
    });
    await stubIdentity(page);
    await page.route("**/api/v1/forge-heat?**", route => {
      const correlationId = route.request().headers()["x-correlation-id"] || "heat-qa";
      return route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(heatEnvelope(correlationId)) });
    });
    await page.goto(`${baseUrl}/#/forge-heat`, { waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.waitForSelector(".forge-heat-shell", { timeout: 5000 });
    await page.waitForSelector(".forge-heat-card", { timeout: 5000 });
    await page.waitForTimeout(150);

    return await page.evaluate(viewportName => {
      const failures = [];
      const viewportWidth = window.innerWidth;
      const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      if (documentWidth > viewportWidth + 4) failures.push(`horizontal overflow: ${documentWidth}px document in ${viewportWidth}px viewport`);

      const text = document.querySelector("#main-content")?.textContent || "";
      for (const required of ["Forge Heat", "WHITE HOT", "93/100", "21/100", "24 sales", "Supported value", "What invalidates it"]) {
        if (!text.includes(required)) failures.push(`missing consumer intelligence: ${required}`);
      }
      if (text.includes("net profit") && !text.includes("not net profit")) failures.push("net profit language lacks V1 limitation");

      const score = document.querySelector(".forge-heat-score");
      if (!score || score.getBoundingClientRect().width < 1 || score.getBoundingClientRect().height < 1) failures.push("Heat score is not visibly rendered");
      const card = document.querySelector(".forge-heat-card");
      const rect = card?.getBoundingClientRect();
      if (!rect || rect.right > viewportWidth + 8) failures.push(`Heat card exceeds ${viewportName} viewport`);

      return { viewport: viewportName, width: viewportWidth, documentWidth, failures };
    }, name);
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
let failed = 0;
try {
  for (const [name, width, height] of viewports) {
    const result = await audit(browser, name, width, height);
    console.log(`${result.failures.length ? "FAIL" : "PASS"} | ${name} | ${result.width}px viewport | ${result.documentWidth}px document`);
    for (const failure of result.failures) console.log(`  - ${failure}`);
    failed += result.failures.length;
  }
} finally {
  await browser.close();
}

if (failed) throw new Error(`Forge Heat consumer visual audit failed: ${failed}`);
console.log("Forge Heat consumer visual audit passed at desktop, tablet, and mobile widths.");