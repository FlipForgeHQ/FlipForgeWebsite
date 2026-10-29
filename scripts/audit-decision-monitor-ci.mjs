// Rendered audit for Decision Change Monitor™ (tracked card + saved decision) and Collection Intelligence™ (Portfolio)
// on the real app shell, desktop and phone. Controlled synthetic responses only; the clock is fixed so decision ages
// are deterministic. Requires the local SaaS server (node saas-prototype/serve.mjs) on FLIPFORGE_LAYOUT_AUDIT_URL.
import fs from "node:fs";
import { chromium } from "playwright";
import { details, envelope } from "./fixtures/deal-check/fixtures.mjs";
import { IDS, NOW, lifecycleDetail, lifecycleList, opportunitiesList, portfolio, lifecycleRecords, alertsData } from "./fixtures/decision-monitor/fixtures.mjs";

const crash = e => { console.log(`::error title=decision-monitor crash::${String(e?.message || e).split("\n")[0].slice(0, 400)}`); process.exit(1); };
process.on("unhandledRejection", crash);
process.on("uncaughtException", crash);

const baseUrl = (process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app").replace(/\/$/, "");
const shots = process.env.FLIPFORGE_MONITOR_SCREENSHOT_DIR || "artifacts/decision-monitor";
fs.mkdirSync(shots, { recursive: true });
const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);
const D = details();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const VIEWPORTS = { desktop: { width: 1440, height: 1000 }, phone: { width: 390, height: 844 } };

async function open(viewport, hash, { disabled = false, alerts = "available" } = {}) {
  const context = await browser.newContext({ viewport });
  const requests = [];
  await context.addInitScript(flag => {
    try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); localStorage.setItem("flipforge.guidedMode.enabled", "false"); } catch (_) {}
    if (flag) window.FlipForgeDecisionMonitorDisabled = true;
  }, disabled);
  await context.route("**/assets/js/flipforge-identity.js", r => r.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "monitor@flipforge.test" }), getSnapshot: () => ({ authenticated: true, email: "monitor@flipforge.test", fullName: "Monitor Audit", membershipActive: true, membershipConfigured: true }) });` }));
  await context.route("**/assets/js/flipforge-production-signin.js", r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/v1/**", async route => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    requests.push(`${req.method()} ${p}`);
    const cid = req.headers()["x-correlation-id"] || "monitor-audit";
    const json = (status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
    const id = decodeURIComponent(p.split("/").pop());
    if (p === "/api/v1/health") return json(200, envelope(cid, { status: "configured", bridgeEnabled: true }));
    if (p === "/api/v1/opportunities") return json(200, envelope(cid, opportunitiesList()));
    if (p.startsWith("/api/v1/opportunities/")) return D[id] ? json(200, envelope(cid, D[id])) : json(404, { error: { code: "NOT_FOUND", correlationId: cid } });
    if (p === "/api/v1/lifecycle") return json(200, envelope(cid, lifecycleList()));
    if (p.startsWith("/api/v1/lifecycle/")) return json(200, envelope(cid, lifecycleDetail(id)));
    if (p === "/api/v1/portfolio") return json(200, envelope(cid, portfolio()));
    if (p === "/api/v1/alerts") return alerts === "fail" ? json(503, { error: { code: "UPSTREAM_UNAVAILABLE", correlationId: cid } }) : json(200, envelope(cid, alertsData(alerts, NOW)));
    if (p.startsWith("/api/v1/evidence/")) return json(200, envelope(cid, { kind: "evidence", opportunityId: id, acceptedExactCompletedSales: 0, visibleButAuthorityIneligible: 0, acceptedSales: [], excludedSales: [], transactionAuthority: false }));
    if (p.startsWith("/api/v1/psa-advisor/")) return json(200, envelope(cid, { kind: "psa-advisor", opportunityId: id, recalculated: false, available: false }));
    return json(404, { error: { code: "RESOURCE_NOT_FOUND", message: p, correlationId: cid } });
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await page.goto(`${baseUrl}/${hash}`, { waitUntil: "load" });
  return { context, page, requests, errors };
}

const facts = (page, selector) => page.evaluate(sel => {
  const node = document.querySelector(sel);
  if (!node) return null;
  const small = [...node.querySelectorAll("*")].filter(el => {
    const cs = getComputedStyle(el);
    const direct = [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
    return direct && cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length && parseFloat(cs.fontSize) < 14;
  }).map(el => `${el.tagName}:${getComputedStyle(el).fontSize}`);
  return { count: document.querySelectorAll(sel).length, text: node.textContent.replace(/\s+/g, " "), review: node.getAttribute("data-review"), small,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    beforeTimeline: (() => { const t = document.querySelector(".customer-decision-timeline-panel"); return t ? Boolean(node.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) : null; })(),
    afterDeal: (() => { const d = document.querySelector("[data-ff-deal-check]"); return d ? Boolean(d.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) : null; })(),
    afterMetrics: (() => { const m = document.querySelector(".customer-portfolio-metrics"); return m ? Boolean(m.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) : null; })() };
}, selector);

const common = (label, f, requests, errors) => {
  check(`${label}: renders once`, f && f.count === 1, JSON.stringify(f && f.count));
  if (!f) return;
  check(`${label}: no text below 14px`, f.small.length === 0, f.small.slice(0, 4).join(" | "));
  check(`${label}: no horizontal overflow`, f.overflow <= 1, String(f.overflow));
  check(`${label}: no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  check(`${label}: GET only, no evaluation or provider route`, requests.every(r => r.startsWith("GET ")) && !requests.some(r => /evaluations|discover|card-intelligence/.test(r)), requests.join(","));
  check(`${label}: states what is not monitored`, /not monitoring yet/i.test(f.text));
  check(`${label}: no live-monitoring claim`, !/real[- ]time|live monitoring|continuously/i.test(f.text));
  check(`${label}: no $0.00 for missing values`, !/(Max Buy|Paid) \$0\.00/.test(f.text));
};

for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  // Tracked card with a re-evaluation.
  {
    const label = `${vp}/tracking-buy`;
    const { context, page, requests, errors } = await open(viewport, `#/tracking/${encodeURIComponent(IDS.buy)}`);
    await page.waitForSelector("[data-ff-decision-monitor]", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    const f = await facts(page, "[data-ff-decision-monitor]");
    common(label, f, requests, errors);
    if (f) {
      check(`${label}: above the Decision Timeline`, f.beforeTimeline === true);
      check(`${label}: decision change WATCH → BUY from the timeline`, /Decision changed: WATCH → BUY/.test(f.text));
      check(`${label}: ask change placed against saved Max Buy`, /\$680\.00 → \$599\.95/.test(f.text) && /saved Max Buy \$\d/.test(f.text) && /inside the buying limit/.test(f.text));
      check(`${label}: paid vs Max Buy from customer record`, /You paid \$\d[\d,]*\.\d\d under the Max Buy/.test(f.text));
      check(`${label}: decision age with fixed clock`, /33 days old/.test(f.text));
      check(`${label}: Max Buy crossing comes from the backend review signal`, /Asking price crossed the saved Max Buy/.test(f.text) && /FlipForge review signal/i.test(f.text));
      check(`${label}: no duplicate 30-day prompt`, (f.text.match(/33 days old/g) || []).length === 1, String((f.text.match(/33 days old/g) || []).length));
    }
    await page.locator("[data-ff-decision-monitor]").screenshot({ path: `${shots}/${vp}-tracking-buy.png` }).catch(() => {});
    await context.close();
  }
  // Tracked card with a single snapshot.
  {
    const label = `${vp}/tracking-watch`;
    const { context, page, requests, errors } = await open(viewport, `#/tracking/${encodeURIComponent(IDS.watch)}`);
    await page.waitForSelector("[data-ff-decision-monitor]", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    const f = await facts(page, "[data-ff-decision-monitor]");
    common(label, f, requests, errors);
    if (f) {
      check(`${label}: says the price was not re-checked`, /Asking price not re-checked/.test(f.text) && /does not watch live listings/.test(f.text));
      check(`${label}: no invented price change`, !/Asking price changed/.test(f.text));
      check(`${label}: paid above Max Buy noted`, /above the Max Buy at decision/.test(f.text));
    }
    await context.close();
  }
  // Saved decision page: compact monitor under Deal Check.
  {
    const label = `${vp}/decision-buy`;
    const { context, page, requests, errors } = await open(viewport, `#/opportunities/${encodeURIComponent(IDS.buy)}`);
    await page.waitForSelector("[data-ff-decision-monitor]", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    const f = await facts(page, "[data-ff-decision-monitor]");
    common(label, f, requests, errors);
    if (f) {
      check(`${label}: under Deal Check`, f.afterDeal === true);
      check(`${label}: links to Tracking to monitor`, await page.locator(`[data-ff-decision-monitor] a[href="#/tracking/${encodeURIComponent(IDS.buy)}"]`).count() === 1);
      const verdict = await page.evaluate(() => document.querySelector("[data-ff-deal-check] .ffdc-verdict")?.textContent.trim());
      check(`${label}: Deal Check verdict unchanged`, verdict === "BUY", verdict);
    }
    await page.locator("[data-ff-decision-monitor]").screenshot({ path: `${shots}/${vp}-decision-buy-monitor.png` }).catch(() => {});
    await context.close();
  }
  // Portfolio.
  {
    const label = `${vp}/portfolio`;
    const { context, page, requests, errors } = await open(viewport, "#/portfolio");
    await page.waitForSelector("[data-ff-collection-intelligence]", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    const f = await facts(page, "[data-ff-collection-intelligence]");
    check(`${label}: renders once`, f && f.count === 1);
    if (f) {
      check(`${label}: placed after the portfolio summary`, f.afterMetrics === true);
      check(`${label}: no text below 14px`, f.small.length === 0, f.small.slice(0, 4).join(" | "));
      check(`${label}: no horizontal overflow`, f.overflow <= 1, String(f.overflow));
      check(`${label}: no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
      check(`${label}: GET only`, requests.every(r => r.startsWith("GET ")), requests.join(","));
      const total = portfolio().totalCostBasisCents;
      check(`${label}: cost basis is the server total`, f.text.includes(`$${(total / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`), f.text.slice(0, 200));
      check(`${label}: no market value claim`, /No current market value is shown/.test(f.text));
      check(`${label}: cards to review listed`, /to review next/.test(f.text) && await page.locator("[data-ffci-attention] > li").count() > 0);
      const order = await page.locator("[data-ffci-all] .ffci-list > li").evaluateAll(els => els.map(e => e.getAttribute("data-ffci-card")));
      check(`${label}: all cards in server order`, JSON.stringify(order) === JSON.stringify(portfolio().items.map(i => i.opportunityId)), order.join(","));
      check(`${label}: unlinked card says so`, /No saved decision linked/.test(f.text));
      check(`${label}: need-another-look from backend signals`, /Need another look\s*3/.test(f.text), f.text.slice(0, 400));
      check(`${label}: harder exits counted`, /Harder exits\s*1/.test(f.text));
      check(`${label}: exit difficulty per card`, /Exit difficulty: (Lower|Moderate|Higher|High)/.test(f.text));
      check(`${label}: existing portfolio sections still present`, await page.locator(".customer-portfolio-page .customer-portfolio-metrics").count() === 1);
    }
    await page.locator("[data-ff-collection-intelligence]").screenshot({ path: `${shots}/${vp}-portfolio-collection.png` }).catch(() => {});
    await context.close();
  }
}

// Backend review signals unavailable / older backend: stated, nothing invented.
for (const [mode, phrase] of [["fail", /Review signals temporarily unavailable/], ["unsupported", /Review signals not available yet/]]) {
  const { context, page, requests, errors } = await open(VIEWPORTS.desktop, `#/tracking/${encodeURIComponent(IDS.verify)}`, { alerts: mode });
  await page.waitForSelector("[data-ff-decision-monitor]", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  const f = await facts(page, "[data-ff-decision-monitor]");
  check(`alerts ${mode}: monitor still renders`, f && f.count === 1);
  if (f) {
    check(`alerts ${mode}: says review signals are unavailable`, phrase.test(f.text), f.text.slice(0, 200));
    check(`alerts ${mode}: no verification or re-check prompt invented`, !/Still needs verification/.test(f.text) && !/due for a re-check/.test(f.text) && !/33 days old/.test(f.text));
    check(`alerts ${mode}: saved verdict still shown`, /VERIFY/.test(f.text));
    check(`alerts ${mode}: no page errors`, errors.length === 0, errors.join("|"));
  }
  await context.close();
}

// Portfolio with backend unavailable.
{
  const { context, page } = await open(VIEWPORTS.desktop, "#/portfolio", { alerts: "fail" });
  await page.waitForSelector("[data-ff-collection-intelligence]", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  const t = await page.evaluate(() => document.querySelector("[data-ff-collection-intelligence]")?.textContent.replace(/\s+/g, " ") || "");
  check("portfolio alerts fail: need-another-look marked unavailable", /Review signals unavailable right now/.test(t), t.slice(0, 200));
  await context.close();
}

// Kill switch: nothing rendered, Tracking unchanged.
{
  const { context, page } = await open(VIEWPORTS.desktop, `#/tracking/${encodeURIComponent(IDS.buy)}`, { disabled: true });
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => ({ monitor: Boolean(document.querySelector("[data-ff-decision-monitor]")), timeline: Boolean(document.querySelector(".customer-decision-timeline-panel")) }));
  check("kill switch: no monitor, Tracking timeline intact", !s.monitor && s.timeline, JSON.stringify(s));
  await context.close();
}

// Card switching on Tracking replaces the monitor with the new card's.
{
  const { context, page } = await open(VIEWPORTS.desktop, `#/tracking/${encodeURIComponent(IDS.buy)}`);
  await page.waitForSelector("[data-ff-decision-monitor]", { timeout: 15000 }).catch(() => {});
  await page.evaluate(id => { location.hash = `#/tracking/${encodeURIComponent(id)}`; }, IDS.watch);
  await page.waitForTimeout(2500);
  const ids = await page.locator("[data-ff-decision-monitor]").evaluateAll(els => els.map(e => e.getAttribute("data-ff-decision-monitor")));
  check("switching tracked cards shows only the new card's monitor", ids.length === 1 && ids[0] === IDS.watch, ids.join(","));
  await context.close();
}

await browser.close();
console.log("DecisionMonitorRenderedAudit");
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
for (const f of failures) console.log(`FAIL: ${f}`);
if (failures.length) process.exit(1);
