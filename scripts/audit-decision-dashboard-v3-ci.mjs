// Rendered audit for Dashboard V3 (behind the flag): Decision Command Center, Decision Dossier
// sections 2-7, Decision Lifecycle (8) and Secondary Analytics (9). Requires the local SaaS server (node saas-prototype/serve.mjs)
// on FLIPFORGE_LAYOUT_AUDIT_URL. Screenshots for owner visual review are written to
// FLIPFORGE_V3_SCREENSHOT_DIR (default: artifacts/dashboard-v3).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { FIXTURE_IDS, g1Items, envelope, opportunitiesData, dashboardData, detailData, productionShapedItem, PRODUCTION_SHAPED_ID } from "./validate-decision-dashboard-v3.mjs";

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

const RAW_ENUM = /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/;

async function brandProbe(page) {
  return page.evaluate(() => {
    const style = selector => { const node = document.querySelector(selector); return node ? getComputedStyle(node) : null; };
    const root = style("[data-decision-dashboard-v3]");
    const verdict = style(".ffv3-verdict-word");
    const title = style(".ffv3-dossier-title");
    const heading = style(".ffv3-command-title h1");
    const kicker = style('[data-ffv3-section="economics"] .ffv3-section-head h3');
    return {
      font: root && root.fontFamily, background: root && root.backgroundColor, color: root && root.color,
      verdict: verdict && `${verdict.fontSize}/${verdict.lineHeight}/${verdict.fontWeight}`,
      title: title && `${title.fontSize}/${title.fontWeight}`, heading: heading && heading.fontWeight,
      kicker: kicker && `${kicker.fontSize}/${kicker.fontWeight}/${kicker.color}/${kicker.textTransform}`,
      geistLoaded: document.fonts ? document.fonts.check('15px "Geist Sans"') : false
    };
  });
}

async function midWordBreaks(page, word) {
  return page.evaluate(target => {
    const root = document.querySelector("[data-decision-dashboard-v3]");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let broken = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let index = node.data.indexOf(target);
      while (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const tops = new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top)));
        if (tops.size > 1) broken += 1;
        index = node.data.indexOf(target, index + 1);
      }
    }
    return broken;
  }, word);
}

async function visibleEvaluateActions(page) {
  return page.evaluate(() => [...document.querySelectorAll(".topbar a, .topbar button, [data-ffv3-section='command-bar'] a, [data-ffv3-section='command-bar'] button")]
    .filter(node => /evaluate a card/i.test(node.textContent || "") && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden").length);
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
  check(`D04 ${label} capped decision shows WATCH + guardrail tag`, (await textOf(page, '[data-ffv3-section="verdict"] .ffv3-verdict-word')).trim() === "WATCH"
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
  const brand = await brandProbe(page);
  check(`B01 ${label} Geist Sans on the V3 root`, /Geist Sans/.test(brand.font || "") && brand.geistLoaded, brand.font);
  check(`B02 ${label} black-first surface and white primary text`, brand.background === "rgb(7, 8, 10)" && brand.color === "rgb(255, 255, 255)", `${brand.background} ${brand.color}`);
  check(`B03 ${label} verdict Black 52/54, card title Bold 26 (treatment C), page heading Bold+`, brand.verdict === "52px/54px/900" && brand.title === "26px/700" && Number(brand.heading) >= 700, `${brand.verdict} ${brand.title} ${brand.heading}`);
  // V3 CSS declares kickers at 11px; the existing customer typography floor (14px minimum,
  // customer-typography-floor-v1.js) may raise them in the app shell. Both are accepted here.
  check(`B04 ${label} section kickers Semibold uppercase silver (11px declared, shell floor <= 14px)`, /^(?:11|14)px\/600\/rgb\(136, 143, 152\)\/uppercase$/.test(brand.kicker || ""), brand.kicker);
  check(`B05 ${label} no raw server enum codes`, !RAW_ENUM.test(await page.locator("[data-decision-dashboard-v3]").innerText()));
  check(`B06 ${label} 'Not established' never breaks mid-word`, (await midWordBreaks(page, "established")) === 0);
  check(`B07 ${label} exactly one visible Evaluate action in the header area`, (await visibleEvaluateActions(page)) === 1, String(await visibleEvaluateActions(page)));
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
    JSON.stringify(sectionOrder) === JSON.stringify(["verdict", "economics", "why", "unknowns", "change", "next-action", "lifecycle"]), sectionOrder.join(","));
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
  check("M08 VERIFY detail is internally consistent (no exact-sold basis)", !/backed by trusted exact|Exact completed sales of this card/i.test(verifyText));
  check("M09 no raw server enum codes on mobile VERIFY", !RAW_ENUM.test(verifyText));
  check("M10 'Not established' never breaks mid-word on mobile", (await midWordBreaks(page, "established")) === 0);
  check("M11 exactly one visible Evaluate action on mobile", (await visibleEvaluateActions(page)) === 1, String(await visibleEvaluateActions(page)));
  const skipCover = await page.evaluate(() => {
    const skip = document.querySelector(".skip-link");
    if (!skip) return "none";
    const s = skip.getBoundingClientRect();
    const visible = s.width > 1 && s.height > 1 && s.bottom > 0 && s.top < window.innerHeight && getComputedStyle(skip).visibility !== "hidden";
    if (!visible) return "hidden";
    const hits = [...document.querySelectorAll("[data-decision-dashboard-v3] button, [data-decision-dashboard-v3] a")].filter(node => {
      const r = node.getBoundingClientRect();
      return r.width && r.height && !(r.right <= s.left || r.left >= s.right || r.bottom <= s.top || r.top >= s.bottom);
    });
    return hits.length ? `covers ${hits.length}` : "clear";
  });
  check("M12 skip link does not cover V3 controls after selection", skipCover !== "covers" && !skipCover.startsWith("covers"), skipCover);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(100);
  const skipTop = await page.evaluate(() => { const skip = document.querySelector(".skip-link"); const r = skip && skip.getBoundingClientRect(); return r ? Math.round(r.bottom) : -1; });
  const refreshTop = await page.evaluate(() => { const r = document.querySelector("[data-ffv3-refresh]")?.getBoundingClientRect(); return r ? Math.round(r.top) : -1; });
  check("M13 skip link not visible over the V3 command bar at page top", skipTop <= 0 || refreshTop < 0 || skipTop <= refreshTop, `skip bottom ${skipTop}px, refresh top ${refreshTop}px`);
  await page.screenshot({ path: path.join(screenshotDir, "dashboard-v3-mobile-390x844-verify.png"), fullPage: true });
  await context.close();
}

/* Production-shaped governed decision (sanitized fixture): authority, lifecycle, analytics, first screen */
async function readyProduction(page) {
  await page.waitForSelector('[data-decision-dashboard-v3][data-ffv3-state="ready"]', { timeout: 15000 });
  await page.waitForSelector('[data-ffv3-section="dossier"] [data-ffv3-section="why"] .ffv3-note', { timeout: 15000 }).catch(() => {});
}
const productionItems = () => [productionShapedItem(), ...g1Items()];
for (const viewport of [{ width: 1440, height: 900 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  const label = `${viewport.width}x${viewport.height}`;
  const { context, page } = await open(viewport, { items: productionItems() });
  await readyProduction(page);
  const dossierText = (await page.locator('[data-ffv3-section="dossier"]').innerText()).replace(/\s+/g, " ");
  check(`R01 ${label} governed WATCH, decision evidence 62 leads, current saved sales 40 separate`,
    (await textOf(page, '[data-ffv3-section="verdict"] .ffv3-verdict-word')).trim() === "WATCH"
      && /Exact sales used for this decision 62 exact sales/.test(dossierText) && /Current saved sales 40/.test(dossierText));
  check(`R02 ${label} governed confidence 83 / risk 70 rendered`, /Confidence score 83\/100/.test(dossierText) && /Risk score 70\/100/.test(dossierText) && !/Confidence score 55|Risk score 20/.test(dossierText));
  check(`R03 ${label} lifecycle shows latest governed decision and 2 immutable snapshots`, /Decision history 2 immutable snapshots/.test(dossierText) && /Latest governed decision Oct 6, 2026/.test(dossierText));
  check(`R04 ${label} no fake zero, no structured exclusion count`, !/\$0(?![\d,])/.test(dossierText) && (await page.locator("[data-ffv3-excluded]").count()) === 0);
  // Measure all three in one layout pass after lazy per-record calls settle (avoids a measure-while-loading race).
  await page.waitForLoadState("networkidle").catch(() => {});
  const { analytics, dossier, ledger } = await page.evaluate(() => Object.fromEntries(["analytics", "dossier", "ledger"].map(key => {
    const node = document.querySelector(`[data-ffv3-section="${key}"]`);
    if (!node) return [key, null];
    const r = node.getBoundingClientRect();
    return [key, { y: r.top, height: r.height }];
  })));
  check(`R05 ${label} secondary analytics below ledger and dossier`, analytics && dossier && ledger && analytics.y >= dossier.y + dossier.height - 1 && analytics.y >= ledger.y + ledger.height - 1);
  if (viewport.width === 390) {
    const firstScreen = await page.evaluate(() => {
      const bottom = selector => { const node = document.querySelector(selector); if (!node) return null; const r = node.getBoundingClientRect(); return Math.round(r.bottom); };
      const fontSize = selector => { const node = document.querySelector(selector); return node ? parseFloat(getComputedStyle(node).fontSize) : 0; };
      return {
        verdict: bottom('[data-ffv3-section="verdict"] .ffv3-verdict-word'), card: bottom(".ffv3-dossier-title"),
        key: bottom("[data-ffv3-key-unknown]"), econ: bottom('[data-ffv3-section="economics"] .ffv3-econ-grid'),
        minText: Math.min(fontSize("[data-ffv3-key-unknown]"), fontSize(".ffv3-reason"), fontSize('.ffv3-econ-grid .ffv3-fact dt')),
        height: window.innerHeight
      };
    });
    check("R06 390x844 first screen: verdict → card → key uncertainty → Ask/Supported/Max Buy",
      firstScreen.verdict && firstScreen.card && firstScreen.key && firstScreen.econ && firstScreen.verdict < firstScreen.card && firstScreen.card < firstScreen.key
        && firstScreen.key < firstScreen.econ && firstScreen.econ <= firstScreen.height, JSON.stringify(firstScreen));
    check("R07 390x844 first screen keeps readable text (>= 12px)", firstScreen.minText >= 12, String(firstScreen.minText));
    await page.screenshot({ path: path.join(screenshotDir, "dashboard-v3-production-shaped-mobile-390x844.png") });
    await page.click("[data-ffv3-reason-toggle]");
    check("R08 390x844 reason disclosure expands accessibly", (await page.getAttribute("[data-ffv3-reason-toggle]", "aria-expanded")) === "true"
      && !(await page.locator("[data-ffv3-reason]").getAttribute("class")).includes("is-clamped"));
    await page.screenshot({ path: path.join(screenshotDir, "dashboard-v3-production-shaped-mobile-390x844-full.png"), fullPage: true });
  } else {
    await page.screenshot({ path: path.join(screenshotDir, `dashboard-v3-production-shaped-${label}.png`) });
    await page.screenshot({ path: path.join(screenshotDir, `dashboard-v3-production-shaped-${label}-full.png`), fullPage: true });
  }
  check(`R09 ${label} selected dossier is the production-shaped decision`, (await page.getAttribute('[data-ffv3-section="dossier"]', "data-ffv3-selected")) === PRODUCTION_SHAPED_ID);
  await context.close();
}

/* PASS selection on desktop */
{
  const { context, page } = await open({ width: 1440, height: 900 });
  await readyV3(page);
  await page.click(`[data-ffv3-select="${FIXTURE_IDS.pass}"]`);
  await page.waitForFunction(id => document.querySelector('[data-ffv3-section="dossier"]')?.getAttribute("data-ffv3-selected") === id, FIXTURE_IDS.pass);
  const passText = await page.locator('[data-ffv3-section="dossier"]').innerText();
  check("P01 PASS dossier renders governed PASS without $0", (await textOf(page, '[data-ffv3-section="verdict"] .ffv3-verdict-word')).trim() === "PASS" && !/\$0(?![\d,])/.test(passText));
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
    && (await page.locator('[data-ffv3-action="analysis"]').count()) === 1 && (await page.locator('[data-ffv3-section="verdict"] .ffv3-verdict-word').innerText()).trim() === "WATCH");
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

/* Guided Mode launcher: suppressed only while V3 renders the Dashboard (Visual Lock V1 §5.4) */
const LAUNCHER = "#ff-guided-mode-root .ff-guide-launcher";
const launcherVisible = page => page.waitForSelector(LAUNCHER, { state: "visible", timeout: 6000 }).then(() => true, () => false);
const launcherCount = async page => { await page.waitForTimeout(1500); return page.locator(LAUNCHER).count(); };
for (const viewport of [{ width: 1440, height: 900 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  const label = `${viewport.width}x${viewport.height}`;
  const { context, page } = await open(viewport, { items: productionItems() });
  await readyProduction(page);
  check(`G01 ${label} V3 active: Guide me launcher absent`, (await launcherCount(page)) === 0);
  const obstructed = await page.evaluate(() => {
    const root = document.querySelector("[data-decision-dashboard-v3]");
    const fixed = [...document.querySelectorAll("body *")].filter(node => !root.contains(node) && getComputedStyle(node).position === "fixed"
      && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
    const content = [...root.querySelectorAll(".ffv3-dossier h2, .ffv3-dossier h3, .ffv3-fact, .ffv3-econ-grid dd, .ffv3-tag, .ffv3-btn, .ffv3-evidence-lead")];
    const hits = [];
    for (const f of fixed) {
      const a = f.getBoundingClientRect();
      if (a.width < 2 || a.height < 2 || a.top <= 0 && a.bottom >= innerHeight && a.width < 300) continue; // ignore full-height side rails
      for (const c of content) {
        const b = c.getBoundingClientRect();
        if (b.width && b.height && !(b.right <= a.left || b.left >= a.right || b.bottom <= a.top || b.top >= a.bottom)) { hits.push(`${f.id || f.className}`); break; }
      }
    }
    return [...new Set(hits)];
  });
  check(`G02 ${label} no fixed overlay covers V3 dossier content in the first screen`, obstructed.length === 0, obstructed.join(", "));
  // Other screens keep their normal Guided Mode (the same panel/launcher V2 users get there).
  await page.evaluate(() => { window.location.hash = "#/tracking"; });
  const restored = await page.waitForSelector("#ff-guided-mode-root .ff-guide-launcher, #ff-guided-mode-root .ff-guide-panel", { state: "visible", timeout: 6000 }).then(() => true, () => false);
  check(`G03 ${label} leaving the V3 Dashboard restores normal Guided Mode on other screens`, restored);
  await context.close();
}
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const label = `${viewport.width}x${viewport.height}`;
  {
    const { context, page } = await open(viewport, {}, { url: V2_URL });
    await page.waitForSelector("[data-commercial-dashboard-v2] .ff-kpi-card", { timeout: 15000 });
    check(`G04 ${label} V2 default: Guide me launcher unchanged (present)`, await launcherVisible(page));
    await context.close();
  }
  {
    const { context, page } = await open(viewport, {}, { init: () => { window.FlipForgeDashboardV3Disabled = true; } });
    await page.waitForSelector("[data-commercial-dashboard-v2] .ff-kpi-card", { timeout: 15000 });
    check(`G05 ${label} kill switch: V2 renders and the launcher is restored`, (await page.locator("[data-decision-dashboard-v3]").count()) === 0 && await launcherVisible(page));
    await context.close();
  }
}

/* Mobile section headings wrap instead of clipping */
{
  const { context, page } = await open({ width: 390, height: 844 }, { items: productionItems() });
  await readyProduction(page);
  const clipped = await page.evaluate(() => [...document.querySelectorAll("[data-decision-dashboard-v3] .ffv3-section-head h2, [data-decision-dashboard-v3] .ffv3-section-head h3")]
    .filter(node => node.getClientRects().length).filter(node => {
      const r = node.getBoundingClientRect();
      const box = node.closest("section, .ffv3-analytics, .ffv3-ledger").getBoundingClientRect();
      return node.scrollWidth > node.clientWidth + 1 || r.right > box.right + 1 || r.right > window.innerWidth;
    }).map(node => node.textContent.trim()));
  const why = await page.evaluate(() => { const h = document.querySelector('[data-ffv3-section="why"] .ffv3-section-head h3'); return h ? getComputedStyle(h).whiteSpace : ""; });
  check("H01 390x844 every section heading fits its panel (wraps, no clipping)", clipped.length === 0 && why === "normal", clipped.join(" | ") || why);
  await context.close();
}

await browser.close();
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`Dashboard V3 rendered audit: ${passes.length}/${passes.length + failures.length} passed. Screenshots: ${screenshotDir}`);
if (failures.length) process.exit(1);
