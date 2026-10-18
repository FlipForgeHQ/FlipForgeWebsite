// Customer shell must settle: after a screen has loaded, the page must stop changing.
//
// 2026-10-18: on a phone, signed-in Private Beta screens flickered continuously. Several shell scripts each watched the
// same navigation attributes with a MutationObserver and re-wrote them on every pass, even when unchanged (an attribute
// set to its current value still notifies observers), and a few disagreed outright (Alerts link hidden vs shown, two
// Tracking subtitles, nav order). The page re-rendered every animation frame: ~3,700-6,200 DOM mutations per second.
//
// For each screen at phone and desktop width this audit loads the route with controlled responses, waits for it to
// render, then counts DOM mutations in a quiet window (3s-6s after load) and fails if the page is still changing.
// Controlled responses only: no provider, no paid evaluation, no production data.
// Requires the local SaaS server (node saas-prototype/serve.mjs) on FLIPFORGE_LAYOUT_AUDIT_URL.
import { chromium } from "playwright";
import { g1Items, envelope, opportunitiesData, dashboardData, detailData } from "./validate-decision-dashboard-v3.mjs";

const baseUrl = (process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app/beta").replace(/\/$/, "");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const ROUTES = ["dashboard", "discover", "evaluate", "decision-intelligence", "opportunities", "tracking", "account"];
const VIEWPORTS = [{ name: "phone", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 900 }];
// A settled page makes no changes at all; a small allowance covers one-off late work (a clock tick, a lazy image).
const MAX_QUIET_WINDOW_MUTATIONS = 25;
const passes = [];
const failures = [];
const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);
const items = g1Items();

const browser = await chromium.launch({ headless: true, executablePath });

async function open(viewport, route) {
  const mobile = viewport.width < 761;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: mobile, isMobile: mobile });
  await context.addInitScript(() => {
    try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); } catch (_) {}
    window.__ffShellMutations = 0;
    window.__ffShellTargets = {};
    new MutationObserver(list => {
      window.__ffShellMutations += list.length;
      for (const m of list) {
        const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        const key = `${t?.id ? "#" + t.id : t?.tagName || "?"}${t?.className && typeof t.className === "string" ? "." + t.className.trim().split(/\s+/)[0] : ""} ${m.type}${m.attributeName ? "@" + m.attributeName : ""}`;
        window.__ffShellTargets[key] = (window.__ffShellTargets[key] || 0) + 1;
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await context.route("**/assets/js/flipforge-identity.js", r => r.fulfill({
    status: 200, contentType: "text/javascript; charset=utf-8",
    body: `const s = Object.freeze({ authenticated: true, email: "settle-audit@flipforge.test", fullName: "Settle Audit", membershipActive: true, membershipConfigured: true, operatorActive: false });
      window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: s.email }), getSnapshot: () => s, refresh: async () => s });`
  }));
  await context.route("**/assets/js/flipforge-production-signin.js", r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/**", r => {
    const url = new URL(r.request().url());
    const correlationId = r.request().headers()["x-correlation-id"] || "settle-audit";
    const json = (body, status = 200) => r.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
    if (url.pathname === "/api/v1/health") return json(envelope(correlationId, { status: "configured", bridgeEnabled: true }));
    if (url.pathname === "/api/v1/dashboard") return json(envelope(correlationId, dashboardData(items, { g1: true })));
    if (url.pathname === "/api/v1/opportunities") return json(envelope(correlationId, opportunitiesData(items, { g1: true })));
    if (url.pathname.startsWith("/api/v1/opportunities/")) {
      const source = items.find(entry => entry.id === decodeURIComponent(url.pathname.split("/").pop()));
      return source ? json(envelope(correlationId, detailData(source))) : json({ error: { code: "NOT_FOUND", correlationId } }, 404);
    }
    if (url.pathname === "/api/conversion-event") return json({ accepted: true });
    return json({ error: { code: "QA_NOT_MOCKED", message: url.pathname, correlationId } }, 404);
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/#/${route}`, { waitUntil: "domcontentloaded" });
  return { context, page };
}

for (const viewport of VIEWPORTS) {
  for (const route of ROUTES) {
    const { context, page } = await open(viewport, route);
    try {
      await page.waitForTimeout(3000);
      const before = await page.evaluate(() => { window.__ffShellTargets = {}; return window.__ffShellMutations; });
      await page.waitForTimeout(3000);
      const result = await page.evaluate(() => ({ total: window.__ffShellMutations, hash: location.hash,
        top: Object.entries(window.__ffShellTargets).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${v}x ${k}`) }));
      const quiet = result.total - before;
      check(`${viewport.name} ${route}: screen settles after load (${quiet} DOM changes in the 3s-6s window)`,
        quiet <= MAX_QUIET_WINDOW_MUTATIONS && result.hash.startsWith(`#/${route}`), `${result.hash} ${result.top.join("; ")}`);
    } finally {
      await context.close();
    }
  }
}

await browser.close();
passes.forEach(line => console.log(`PASS | ${line}`));
failures.forEach(line => console.log(`FAIL | ${line}`));
console.log(`Customer shell settle audit (${baseUrl}): ${passes.length}/${passes.length + failures.length} checks passed.`);
if (failures.length) process.exit(1);
