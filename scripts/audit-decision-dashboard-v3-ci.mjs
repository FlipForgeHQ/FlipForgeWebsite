// Rendered audit for Dashboard V3 Slice 2 (behind the flag): Decision Command Center +
// Decision Dossier sections 2-7. Requires the local SaaS server (node saas-prototype/serve.mjs)
// on FLIPFORGE_LAYOUT_AUDIT_URL. Screenshots for owner visual review are written to
// FLIPFORGE_V3_SCREENSHOT_DIR (default: artifacts/dashboard-v3).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { FIXTURE_IDS, g1Items, envelope, opportunitiesData, dashboardData, detailData } from "./validate-decision-dashboard-v3.mjs";

const baseUrl = (process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app").replace(/\/$/, "");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const screenshotDir = process.env.FLIPFORGE_V3_SCREENSHOT_DIR || "artifacts/dashboard-v3";
fs.mkdirSync(screenshotDir, { recursive: true });

const passes = [];
const failures = [];
const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);
const ALLOWED = [/^\/api\/v1\/health$/, /^\/api\/v1\/dashboard$/, /^\/api\/v1\/opportunities$/, /^\/api\/v1\/opportunities\/[A-Za-z0-9._:%-]+$/];
const V3_URL = `${baseUrl}/?dashboard=v3#/dashboard`;
const V2_URL = `${baseUrl}/#/dashboard`;

const browser = await chromium.launch({ headless: true, executablePath });

async function open(viewport, scenario = {}, { url = V3_URL, init } = {}) {
  const items = scenario.items || g1Items();
  const g1 = scenario.g1 !== false;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const requests = [];
  await context.addInitScript(() => {
    try {
      localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
      localStorage.setItem("flipforge.guidedMode.enabled", "false");
    } catch (_) {}
    // Record any browser sort applied to decision records (V3 must keep server order).
    window.__ffv3SortedDecisions = 0;
    for (const name of ["sort", "toSorted"]) {
      const original = Array.prototype[name];
      if (typeof original !== "function") continue;
      Array.prototype[name] = function (...args) {
        if (this.some?.(entry => entry && typeof entry === "object" && "governedDecision" in entry)) window.__ffv3SortedDecisions += 1;
        return original.apply(this, args);
      };
    }
  });
  if (init) await context.addInitScript(init);
  await context.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "v3-audit@flipforge.test" }),
      getSnapshot: () => ({ authenticated: true, email: "v3-audit@flipforge.test", fullName: "V3 Audit", membershipActive: true, membershipConfigured: true }) });`
  }));
  await context.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(`${request.method()} ${url.pathname}`);
    const correlationId = request.headers()["x-correlation-id"] || "v3-audit";
    const json = (status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
    if (scenario.delayMs) await new Promise(resolve => setTimeout(resolve, scenario.delayMs));
    if (url.pathname === "/api/v1/health") {
      return json(200, envelope(correlationId, { status: "configured", bridgeEnabled: scenario.bridgeDisabled ? false : true }));
    }
    if (scenario.status && (url.pathname === "/api/v1/dashboard" || url.pathname === "/api/v1/opportunities")) {
      return json(scenario.status, { error: { code: scenario.code || "QA_ERROR", reason: scenario.reason, message: "QA error", correlationId: "qa-corr-5xx" } });
    }
    if (url.pathname === "/api/v1/dashboard") return json(200, envelope(correlationId, dashboardData(items, { g1 })));
    if (url.pathname === "/api/v1/opportunities") return json(200, envelope(correlationId, opportunitiesData(items, { g1 })));
    if (url.pathname.startsWith("/api/v1/opportunities/")) {
      if (scenario.detailFails) return json(500, { error: { code: "QA_DETAIL_FAILED", message: "QA", correlationId } });
      const id = decodeURIComponent(url.pathname.slice("/api/v1/opportunities/".length));
      const source = items.find(entry => entry.id === id);
      return source ? json(200, envelope(correlationId, detailData(source))) : json(404, { error: { code: "NOT_FOUND", correlationId } });
    }
    return json(404, { error: { code: "QA_NOT_MOCKED", message: url.pathname, correlationId } });
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return { context, page, requests };
}

const box = (page, selector) => page.locator(selector).first().boundingBox();
const textOf = (page, selector) => page.locator(selector).first().innerText();

async function readyV3(page) {
  await page.waitForSelector('[data-decision-dashboard-v3][data-ffv3-state="ready"]', { timeout: 15000 });
  await page.waitForSelector("[data-ffv3-price-check], [data-ffv3-evidence-unavailable]", { timeout: 15000 }).catch(() => {});
}

function requestsAllowed(requests) {
  return requests.every(entry => {
    const [method, pathname] = entry.split(" ");
    return method === "GET" && ALLOWED.some(pattern => pattern.test(pathname));
  });
}

/* Desktop above-the-fold + content contract */
for (const viewport of [{ width: 1440, height: 900 }, { width: 1200, height: 800 }]) {
  const label = `${viewport.width}x${viewport.height}`;
  const { context, page, requests } = await open(viewport);
  await readyV3(page);
  const verdict = await box(page, '[data-ffv3-section="verdict"]');
  const economics = await box(page, '[data-ffv3-section="economics"]');
  check(`D01 ${label} verdict + economics above the fold`, verdict && economics && verdict.y >= 0 && economics.y + economics.height <= viewport.height,
    economics ? `economics bottom ${Math.round(economics.y + economics.height)}px` : "missing");
  const ledger = await box(page, '[data-ffv3-section="ledger"]');
  const dossier = await box(page, '[data-ffv3-section="dossier"]');
  check(`D02 ${label} Command Center left (~34%), dossier right`, ledger && dossier && ledger.x < dossier.x && Math.abs(ledger.width / (ledger.width + dossier.width) - 0.34) < 0.06,
    ledger && dossier ? `ledger share ${(ledger.width / (ledger.width + dossier.width)).toFixed(2)}` : "");
  check(`D03 ${label} default selection is items[0].id`, (await page.getAttribute('[data-ffv3-section="dossier"]', "data-ffv3-selected")) === FIXTURE_IDS.capped);
  check(`D04 ${label} capped decision shows WATCH + guardrail tag`, (await textOf(page, '[data-ffv3-section="verdict"] .ffv3-verdict')).trim() === "WATCH"
    && (await page.locator("[data-ffv3-guardrail]").count()) === 1);
  const body = await page.locator("[data-decision-dashboard-v3]").innerText();
  check(`D05 ${label} required labels present`, body.includes("Modeled estimate") && body.includes("Read-only price check"));
  check(`D06 ${label} Breakeven and Sell number absent`, !/breakeven|sell number/i.test(body));
  check(`D07 ${label} V3 root uses no V2 classes and no V2 root rendered`, (await page.locator("[data-commercial-dashboard-v2]").count()) === 0
    && (await page.evaluate(() => [...document.querySelectorAll("[data-decision-dashboard-v3], [data-decision-dashboard-v3] *")]
      .flatMap(node => [...node.classList]).every(token => token.startsWith("ffv3-") || token === "is-selected"))));
  check(`D08 ${label} ledger in server order`, JSON.stringify(await page.$$eval("[data-ffv3-select]", nodes => nodes.map(node => node.getAttribute("data-ffv3-select"))))
    === JSON.stringify(g1Items().map(entry => entry.id)));
  check(`D10 ${label} browser applied no sort to decision records`, (await page.evaluate(() => window.__ffv3SortedDecisions)) === 0);
  check(`D11 ${label} only allowlisted GET endpoints used`, requestsAllowed(requests), requests.join(", "));
  await page.screenshot({ path: path.join(screenshotDir, `dashboard-v3-desktop-${label}.png`) });
  await context.close();
}

/* Sticky dossier while a long ledger scrolls */
for (const viewport of [{ width: 1440, height: 900 }, { width: 1200, height: 800 }]) {
  const label = `${viewport.width}x${viewport.height}`;
  const many = Array.from({ length: 5 }, (_, round) => g1Items().map(entry => ({ ...entry, id: `${entry.id}-R${round}` }))).flat();
  const { context, page } = await open(viewport, { items: many });
  await readyV3(page);
  const before = await box(page, '[data-ffv3-section="dossier"]');
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
  await page.waitForTimeout(150);
  const after = await box(page, '[data-ffv3-section="dossier"]');
  const scrolled = await page.evaluate(() => window.scrollY);
  check(`D09 ${label} dossier stays in view while the ledger scrolls`, scrolled > 300 && before && after && after.y >= 0 && after.y <= 40,
    after ? `scrollY ${scrolled}, dossier top ${Math.round(after.y)}px` : "missing");
  await context.close();
}

/* Mobile order + selection */
{
  const viewport = { width: 390, height: 844 };
  const { context, page } = await open(viewport);
  await readyV3(page);
  const dossier = await box(page, '[data-ffv3-section="dossier"]');
  check("M01 390x844 dossier starts within 420px", dossier && dossier.y <= 420, dossier ? `${Math.round(dossier.y)}px` : "missing");
  const commandBar = await box(page, '[data-ffv3-section="command-bar"]');
  const ledger = await box(page, '[data-ffv3-section="ledger"]');
  check("M02 order: command bar → dossier → ledger", commandBar && dossier && ledger && commandBar.y < dossier.y && dossier.y < ledger.y);
  const sectionOrder = await page.$$eval('[data-ffv3-section="dossier"] > section', nodes => nodes.map(node => node.getAttribute("data-ffv3-section")));
  check("M03 dossier sections in order verdict → economics → why → unknowns → change → next action",
    JSON.stringify(sectionOrder) === JSON.stringify(["verdict", "economics", "why", "unknowns", "change", "next-action"]), sectionOrder.join(","));
  await page.screenshot({ path: path.join(screenshotDir, "dashboard-v3-mobile-390x844.png") });
  await page.click(`[data-ffv3-select="${FIXTURE_IDS.verify}"]`);
  await page.waitForFunction(id => document.querySelector('[data-ffv3-section="dossier"]')?.getAttribute("data-ffv3-selected") === id, FIXTURE_IDS.verify);
  await page.waitForTimeout(200);
  const swapped = await box(page, '[data-ffv3-dossier-slot]');
  check("M04 selecting a ledger row swaps the dossier and scrolls to it", swapped && Math.abs(swapped.y) <= 40, swapped ? `${Math.round(swapped.y)}px` : "");
  check("M05 no overlay on selection", (await page.locator('[data-decision-dashboard-v3] [role="dialog"], [data-decision-dashboard-v3] dialog').count()) === 0);
  const verifyText = await page.locator('[data-ffv3-section="dossier"]').innerText();
  check("M06 VERIFY with no supported value: 'Not established', no $0", verifyText.includes("Not established") && !/\$0(?![\d,])/.test(verifyText));
  check("M07 VERIFY framed as intelligence outcome", verifyText.includes("FlipForge needs exact completed-sale evidence for this card before it will commit."));
  await page.screenshot({ path: path.join(screenshotDir, "dashboard-v3-mobile-390x844-verify.png"), fullPage: true });
  await context.close();
}

/* PASS selection on desktop */
{
  const { context, page } = await open({ width: 1440, height: 900 });
  await readyV3(page);
  await page.click(`[data-ffv3-select="${FIXTURE_IDS.pass}"]`);
  await page.waitForFunction(id => document.querySelector('[data-ffv3-section="dossier"]')?.getAttribute("data-ffv3-selected") === id, FIXTURE_IDS.pass);
  const passText = await page.locator('[data-ffv3-section="dossier"]').innerText();
  check("P01 PASS dossier renders governed PASS without $0", (await textOf(page, '[data-ffv3-section="verdict"] .ffv3-verdict')).trim() === "PASS" && !/\$0(?![\d,])/.test(passText));
  await context.close();
}

/* States */
async function stateCheck(name, scenario, assertion, viewport = { width: 1200, height: 800 }) {
  const { context, page, requests } = await open(viewport, scenario);
  try {
    await assertion(page, requests);
  } catch (error) {
    check(name, false, String(error && error.message || error));
  }
  await context.close();
}

await stateCheck("T01 loading: skeleton, never first-use content", { delayMs: 1500 }, async page => {
  await page.waitForSelector('[data-decision-dashboard-v3][data-ffv3-state="loading"]', { timeout: 5000 });
  const text = await page.locator("#main-content").innerText();
  check("T01 loading: skeleton, never first-use content",
    (await page.locator('[data-ffv3-skeleton="dossier"]').count()) === 1 && (await page.locator('[data-ffv3-skeleton="ledger"]').count()) === 1 && !/first card|four checks|Start with one/i.test(text));
});
await stateCheck("T02 empty: four-checks first-decision panel", { items: [] }, async page => {
  await page.waitForSelector('[data-ffv3-state="empty"]', { timeout: 15000 });
  check("T02 empty: four-checks first-decision panel", (await page.locator(".ffv3-checks li").count()) === 4);
});
await stateCheck("T03 401: sign-in message", { status: 401, code: "AUTH_REQUIRED" }, async page => {
  await page.waitForSelector('[data-ffv3-state-panel="401"]', { timeout: 15000 });
  const text = await page.locator("#main-content").innerText();
  check("T03 401: sign-in message", /Sign in securely/.test(text) && !/first card|four checks/i.test(text));
});
await stateCheck("T04 403 seat: BETA_FULL messaging", { status: 403, code: "BETA_SEAT", reason: "BETA_FULL" }, async page => {
  await page.waitForSelector('[data-ffv3-state-panel="403"]', { timeout: 15000 });
  check("T04 403 seat: BETA_FULL messaging", (await page.locator("#main-content").innerText()).includes("Beta full:"));
});
await stateCheck("T05 5xx: load failure + Retry + correlation id", { status: 503, code: "UPSTREAM_UNAVAILABLE" }, async page => {
  await page.waitForSelector('[data-ffv3-state-panel="load-failure"]', { timeout: 15000 });
  const text = await page.locator("#main-content").innerText();
  check("T05 5xx: load failure + Retry + correlation id", text.includes("Retry") && text.includes("qa-corr-5xx") && !/first card|four checks/i.test(text));
});
await stateCheck("T06 bridge disabled: offline, no sample data", { bridgeDisabled: true }, async page => {
  await page.waitForSelector('[data-ffv3-state-panel="offline"]', { timeout: 15000 });
  check("T06 bridge disabled: offline, no sample data", (await page.locator("#main-content").innerText()).includes("Decision data is offline.") && (await page.locator("[data-ffv3-select]").count()) === 0);
});
await stateCheck("T07 partial evidence failure", { detailFails: true }, async page => {
  await page.waitForSelector("[data-ffv3-evidence-unavailable]", { timeout: 15000 });
  check("T07 partial evidence failure keeps the rest usable", (await page.locator('[data-ffv3-section="economics"]').count()) === 1
    && (await page.locator('[data-ffv3-action="analysis"]').count()) === 1 && (await page.locator('[data-ffv3-section="verdict"] .ffv3-verdict').innerText()).trim() === "WATCH");
});
await stateCheck("T08 pre-G1 backend falls back to V2", { g1: false }, async page => {
  await page.waitForSelector("[data-commercial-dashboard-v2] .ff-kpi-card", { timeout: 15000 });
  check("T08 pre-G1 backend falls back to V2", (await page.locator("[data-decision-dashboard-v3]").count()) === 0
    && (await page.evaluate(() => window.FlipForgeDashboardRenderer)) === "v2");
});

/* Activation flag */
{
  const { context, page } = await open({ width: 1200, height: 800 }, {}, { url: V2_URL });
  await page.waitForSelector("[data-commercial-dashboard-v2] .ff-kpi-card", { timeout: 15000 });
  check("F01 without the flag V2 stays the default renderer", (await page.locator("[data-decision-dashboard-v3]").count()) === 0);
  await context.close();
}
{
  const { context, page } = await open({ width: 1200, height: 800 }, {}, { url: V2_URL, init: () => { try { localStorage.setItem("flipforge.dashboard.renderer", "v3"); } catch (_) {} } });
  await readyV3(page);
  check("F02 localStorage renderer=v3 activates V3", (await page.locator("[data-decision-dashboard-v3]").count()) === 1);
  await context.close();
}
{
  const { context, page } = await open({ width: 1200, height: 800 }, {}, { init: () => { window.FlipForgeDashboardV3Disabled = true; } });
  await page.waitForSelector("[data-commercial-dashboard-v2] .ff-kpi-card", { timeout: 15000 });
  check("F03 FlipForgeDashboardV3Disabled forces V2", (await page.locator("[data-decision-dashboard-v3]").count()) === 0);
  await context.close();
}

await browser.close();
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`Dashboard V3 Slice 2 rendered audit: ${passes.length}/${passes.length + failures.length} passed. Screenshots: ${screenshotDir}`);
if (failures.length) process.exit(1);
