import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const width = 390;
const height = 844;
const email = "guided-mode-qa@flipforge.test";

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
const context = await browser.newContext({ viewport: { width, height } });
const page = await context.newPage();
const failures = [];

try {
  const key = accountHash(email);
  await page.addInitScript(({ key }) => {
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.welcome`, "seen");
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.enabled`, "on");
  }, { key });

  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({
      getUser: () => ({ email: "${email}" }),
      getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Mobile QA", membershipActive: true, membershipConfigured: true })
    });`
  }));
  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "(() => {})();" }));
  await page.route("**/api/v1/**", route => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({
      meta: { contractVersion: "1.0", engineVersion: "guided-mode-qa", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", correlationId: route.request().headers()["x-correlation-id"] || "guided-mode-qa", generatedAt: "2026-08-29T20:00:00Z", evidenceFreshness: "QA_FIXTURE", limitations: ["Synthetic Guided Mode fixture only."] },
      data: { metrics: { trackedOpportunities: 0, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 0 }, items: [] }
    })
  }));

  await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded", timeout: 10_000 });
  await page.waitForSelector(".ff-guide-panel", { state: "visible", timeout: 7000 });
  await page.waitForTimeout(250);

  const geometry = await page.locator(".ff-guide-panel").evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height };
  });
  if (geometry.height > height * 0.43) failures.push(`guide height ${Math.round(geometry.height)}px exceeds 43% mobile viewport`);
  if (geometry.left < 6 || geometry.right > width - 6) failures.push(`guide escapes mobile horizontal gutters: ${JSON.stringify(geometry)}`);
  if (geometry.bottom > height - 4) failures.push(`guide extends below viewport: ${Math.round(geometry.bottom)}px`);

  const mainHeading = page.locator("#main-content h1, #main-content h2").first();
  if (!(await mainHeading.isVisible().catch(() => false))) failures.push("main task heading is not visible while Guided Mode is open");

  await page.locator("[data-guide-minimize]").click();
  await page.waitForSelector(".ff-guide-launcher", { state: "visible", timeout: 3000 });
  if (await page.locator(".ff-guide-panel").count()) failures.push("guide panel remains mounted after minimize");

  await page.locator("[data-guide-open]").click();
  await page.waitForSelector(".ff-guide-panel", { state: "visible", timeout: 3000 });

  await page.locator("[data-guide-toggle]").click();
  await page.waitForSelector(".ff-guide-launcher", { state: "visible", timeout: 3000 });
  if (await page.locator(".ff-guide-panel").count()) failures.push("guide panel remains mounted after Guided Mode is turned off");

  await page.locator("[data-guide-open]").click();
  await page.waitForSelector(".ff-guide-panel", { state: "visible", timeout: 3000 });
} finally {
  await context.close();
  await browser.close();
}

console.log("FlipForge mobile Guided Mode audit");
console.log(`Viewport: ${width}x${height}`);
console.log(`Failures: ${failures.length}`);
failures.forEach(failure => console.log(`FAIL | ${failure}`));
if (!failures.length) console.log("PASS | guide size, minimize, off, reopen, and task visibility");
if (failures.length) process.exit(1);
