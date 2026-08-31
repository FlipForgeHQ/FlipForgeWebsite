import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const id = "qa-opportunity-1";
const email = "tracking-route-diagnostic@flipforge.test";
const apiCalls = [];

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "tracking-route-diagnostic",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      generatedAt: "2026-08-31T17:00:00Z",
      evidenceFreshness: "QA_FIXTURE",
      limitations: ["Synthetic route diagnostic only."]
    },
    data
  };
}

const opportunity = {
  id,
  title: "2018 Topps Chrome Shohei Ohtani #150 PSA 9",
  cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 9",
  recommendation: "WATCH",
  ask: 875,
  supportedValue: 820,
  confidence: 82,
  liquidity: 76,
  risk: 24,
  rank: 79,
  observedAt: "2026-08-31T16:00:00Z",
  platform: "EBAY",
  mappingState: "CONFIRMED",
  evidence: { acceptedSales: 3 }
};

const lifecycle = {
  opportunityId: id,
  trackingStatus: "WATCHING",
  outcomeStatus: "NONE",
  reviewAt: null,
  alertEnabled: false,
  acquisitionCostCents: null,
  acquiredAt: null,
  dispositionProceedsCents: null,
  disposedAt: null,
  version: 1
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
const page = await context.newPage();

try {
  await page.addInitScript(() => {
    localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
  });

  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({
      getUser: () => ({ email: "${email}" }),
      getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Tracking Diagnostic", membershipActive: true, membershipConfigured: true })
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
    const correlationId = headers["x-correlation-id"] || "tracking-route-diagnostic";
    apiCalls.push(`${method} ${url.pathname}`);
    console.log(`DIAG API | ${method} ${url.pathname}`);

    let data;
    if (method === "GET" && url.pathname === "/api/v1/health") {
      data = { status: "configured" };
    } else if (method === "GET" && url.pathname === "/api/v1/opportunities") {
      data = { kind: "opportunities", items: [opportunity], count: 1, sourceOfTruth: "SQLite", transactionAuthority: false };
    } else if (method === "GET" && url.pathname === `/api/v1/opportunities/${id}`) {
      data = { kind: "opportunity-detail", opportunity, sourceOfTruth: "SQLite", transactionAuthority: false };
    } else if (method === "GET" && url.pathname === `/api/v1/evidence/${id}`) {
      data = { kind: "evidence", opportunityId: id, acceptedExactCompletedSales: 3, visibleButAuthorityIneligible: 0, acceptedSales: [], excludedSales: [], transactionAuthority: false };
    } else if (method === "GET" && url.pathname === `/api/v1/psa-advisor/${id}`) {
      data = { kind: "psa-advisor", opportunityId: id, guidanceStatus: "AVAILABLE", recalculated: false, transactionAuthority: false, sourceOfTruth: "Existing PSA intelligence" };
    } else if (method === "GET" && url.pathname === "/api/v1/lifecycle") {
      data = { kind: "lifecycle", sourceOfTruth: "SQLite", items: [lifecycle], transactionAuthority: false };
    } else if (method === "GET" && url.pathname === `/api/v1/lifecycle/${id}`) {
      data = { kind: "lifecycle-detail", opportunityId: id, sourceOfTruth: "SQLite", lifecycle, history: [], transactionAuthority: false };
    } else {
      console.log(`DIAG UNMOCKED | ${method} ${url.pathname}`);
      await route.fulfill({ status: 404, contentType: "application/json; charset=utf-8", body: JSON.stringify({ error: { code: "QA_NOT_MOCKED", message: `${method} ${url.pathname}` } }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, data)) });
  });

  await page.goto(`${baseUrl}/#/opportunities/${id}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
  await page.waitForTimeout(900);
  console.log(`DIAG BEFORE URL | ${page.url()}`);
  console.log(`DIAG BEFORE PAGE | ${await page.locator("#main-content > *").first().getAttribute("class").catch(() => "")}`);

  const links = page.locator(`#main-content a[href='#/tracking/${id}']`);
  const count = await links.count();
  console.log(`DIAG TRACK LINKS | ${count}`);
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    console.log(`DIAG TRACK LINK ${index} | class=${await link.getAttribute("class")} | parent=${await link.evaluate(node => node.parentElement?.className || "")}`);
  }

  if (!count) throw new Error("No Track link rendered on saved decision.");
  await links.first().click();
  await page.waitForTimeout(1500);

  console.log(`DIAG AFTER URL | ${page.url()}`);
  console.log(`DIAG AFTER HASH | ${await page.evaluate(() => window.location.hash)}`);
  console.log(`DIAG AFTER PAGE | ${await page.locator("#main-content > *").first().getAttribute("class").catch(() => "")}`);
  console.log(`DIAG AFTER H1 | ${await page.locator("#main-content h1").first().textContent().catch(() => "")}`);
  console.log(`DIAG FORM COUNT | ${await page.locator("#main-content [data-lifecycle-form]").count()}`);
  console.log(`DIAG ERROR | ${await page.locator("#main-content .staging-error").first().innerText().catch(() => "")}`);
  console.log(`DIAG API SEQUENCE | ${apiCalls.join(" -> ")}`);

  if (!/#\/tracking\/qa-opportunity-1$/.test(page.url())) throw new Error("Tracking hash did not remain active.");
  if (await page.locator("#main-content [data-lifecycle-form]").count() !== 1) throw new Error("Tracking form did not mount after real Track click.");
} finally {
  await context.close();
  await browser.close();
}

console.log("PASS | focused Saved Decision -> Tracking route diagnostic");
