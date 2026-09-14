import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = "http://goflipforge.com:4173/app/customer/";
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];
// Test fixtures only: never included in the customer runtime.
const proof = {
  id: "dashboard-startup-proof",
  title: "Dashboard server response proof",
  cardIdentity: "Audit card #1 PSA 10",
  recommendation: "VERIFY",
  ask: 100,
  supportedValue: 110,
  confidence: 72,
  liquidity: 60,
  risk: 38,
  rank: 84,
  mappingState: "CONFIRMED",
  evidence: { acceptedSales: 3 }
};
const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"]
});

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    let scenario = "success";
    const calls = new Set();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(String(error.message || error)));
    await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
      contentType: "application/javascript",
      body: `
        window.FlipForgeIdentity = Object.freeze({
          getUser: () => ({ email: "audit@example.com" }),
          getSnapshot: () => ({ authenticated: true, membershipActive: true }),
          refresh: async () => ({ authenticated: true, membershipActive: true })
        });
        window.dispatchEvent(new CustomEvent("flipforge:identity-change"));
      `
    }));
    await page.route("**/api/v1/**", route => {
      const path = new URL(route.request().url()).pathname;
      calls.add(path);
      const correlationId = route.request().headers()["x-correlation-id"] || "dashboard-startup";
      const meta = {
        contractVersion: "1.0",
        engineVersion: "dashboard-startup-audit",
        authority: "Smart Opportunity",
        gradingAuthority: "Existing PSA intelligence",
        correlationId
      };
      if (scenario === "timeout-health" && path === "/api/v1/health") return;
      if (scenario === "timeout-data" && path === "/api/v1/dashboard") return;
      if (path === "/api/v1/health") {
        return route.fulfill({ json: { meta, data: { status: "configured", bridgeEnabled: true } } });
      }
      if (["401", "403", "503"].includes(scenario)) {
        return route.fulfill({
          status: Number(scenario),
          json: { error: { code: "DASHBOARD_AUDIT_DENIED", message: "Request unavailable.", correlationId } }
        });
      }
      if (scenario === "invalid-json" && path === "/api/v1/dashboard") {
        return route.fulfill({ contentType: "application/json", body: "{invalid" });
      }
      if (scenario === "invalid-authority" && path === "/api/v1/dashboard") meta.authority = "Invalid audit authority";
      const empty = scenario === "empty";
      const data = path === "/api/v1/dashboard"
        ? { metrics: { trackedOpportunities: empty ? 0 : 1, evidenceReady: empty ? 0 : 1, populationContextAvailable: 0, needsVerification: empty ? 0 : 1 } }
        : path === "/api/v1/opportunities"
          ? { kind: "opportunities", items: empty ? [] : [proof] }
          : { kind: "audit", items: [] };
      return route.fulfill({ json: { meta, data } });
    });

    async function settled(expected, timeout = 10000) {
      await page.waitForSelector(`[data-commercial-dashboard-v2][data-dashboard-state="${expected}"]`, { timeout });
      assert.equal(await page.locator("[data-production-dashboard-guard]").count(), 0, "Guard never yielded to the dashboard runtime");
      assert.equal(await page.locator("#main-content .ff-commercial-loading").count(), 0, "Dashboard stayed in Loading");
      assert.equal((await page.locator(".prototype-chip").innerText()).trim(), "CUSTOMER APP");
      assert.match(await page.title(), /Customer App/);
    }

    async function open(nextScenario) {
      scenario = nextScenario;
      calls.clear();
      // A same-URL fragment navigation can retain the previous document and data.
      // Start a fresh document for each independent gateway scenario.
      await page.goto("about:blank");
      await page.goto(`${base}#/dashboard`, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    try {
      await open("success");
      await settled("ready");
      for (const path of ["/api/v1/health", "/api/v1/dashboard", "/api/v1/opportunities"]) {
        assert(calls.has(path), `Customer dashboard never requested ${path}`);
      }
      assert.match(await page.locator(".ff-decision-identity h2").innerText(), /Dashboard server response proof/);
      assert.match(await page.locator(".ff-kpi-card").first().innerText(), /Tracked Decisions\s+1/);
      const decision = page.locator('.ff-decision-identity a[href="#/opportunities/dashboard-startup-proof"]');
      assert(await decision.isVisible(), "Saved decision has no usable detail link");

      await open("empty");
      await settled("ready");
      assert.match(await page.locator("#main-content").innerText(), /No saved decisions yet/);
      assert.equal(await page.locator(".ff-decision-identity").count(), 0, "Empty account received fabricated decisions");

      for (const failedScenario of ["401", "403", "503", "invalid-json", "invalid-authority"]) {
        await open(failedScenario);
        await settled("error");
        const retry = page.locator("[data-commercial-dashboard-refresh]");
        assert(await retry.isVisible(), `${failedScenario}: no visible recovery action`);
        assert.equal(await page.locator(".ff-decision-identity").count(), 0, "Failed response retained a decision");
        if (failedScenario === "401") {
          const signIn = page.locator("[data-ff-customer-sign-in]");
          assert(await signIn.isVisible(), "Server 401 did not provide sign-in recovery");
          const url = new URL(await signIn.getAttribute("href"), base);
          assert.equal(url.searchParams.get("return"), "/app/customer/#/dashboard");
          assert.equal(url.searchParams.get("reauth"), "1");
        }
        scenario = "success";
        await retry.click();
        await settled("ready");
      }

      // Exercise the real request deadline; never replace the production runtime.
      // Desktop covers an unresponsive health request; mobile covers stalled data.
      await open(viewport.name === "desktop" ? "timeout-health" : "timeout-data");
      await settled("error", 20000);
      assert.match(await page.locator("#main-content").innerText(), /DASHBOARD_REQUEST_TIMEOUT/);
      scenario = "success";
      await page.locator("[data-commercial-dashboard-refresh]").click();
      await settled("ready");

      await page.locator('.primary-nav a[data-route="opportunities"]').click({ force: true });
      await page.waitForURL(url => url.hash === "#/opportunities");
      await page.goto(`${base}#/dashboard`, { waitUntil: "domcontentloaded" });
      await settled("ready");
      const seriousErrors = pageErrors.filter(message => /SyntaxError|ReferenceError|TypeError|Unexpected token|Unexpected identifier/i.test(message));
      assert.deepEqual(seriousErrors, [], "Customer dashboard raised browser runtime errors");
      console.log(`PASS ${viewport.name}: server data, empty, 401/403/503, invalid JSON/authority, timeout, retry, navigation`);
    } finally {
      await context.close();
    }
  }
  console.log("Customer dashboard startup audit passed");
} finally {
  await browser.close();
}
