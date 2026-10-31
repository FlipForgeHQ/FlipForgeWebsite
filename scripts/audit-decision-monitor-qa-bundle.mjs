// Decision Change Monitor™ real-screen test from a QA bundle.
//
// The bundle is produced by the FlipForge2 hosted release-candidate validation (on staging, or in CI) for a dedicated
// QA tenant with controlled records: a card whose recorded ask crosses the saved Max Buy at a re-evaluation, a VERIFY,
// a decision made under the earlier profitability rules, and a card never re-evaluated. It holds the server's own
// response envelopes for every route the website requests. This script serves exactly those responses to the real app
// shell (only the correlation id is echoed per request, as the gateway does) and checks the four monitor sections on
// desktop and phone, saving screenshots.
//
// The browser's /api/v1 requests go through the REAL website gateway code (netlify/functions/flipforge-api.js: contract
// checks and the provider-disclosure filter), in its non-production preview-tenant mode for the QA tenant. The gateway
// forwards to a local playback server that returns the staging backend's recorded envelopes and checks that every
// request arrives with the service token and the QA tenant only.
//
// Usage: FLIPFORGE_QA_BUNDLE=path/to/bundle.json FLIPFORGE_LAYOUT_AUDIT_URL=http://127.0.0.1:4173/app \
//        node scripts/audit-decision-monitor-qa-bundle.mjs
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const bundlePath = process.env.FLIPFORGE_QA_BUNDLE;
if (!bundlePath) { console.error("FLIPFORGE_QA_BUNDLE is required"); process.exit(2); }
const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
if (bundle.kind !== "decision-monitor-qa-bundle") { console.error("not a decision-monitor QA bundle"); process.exit(2); }
const baseUrl = (process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app").replace(/\/$/, "");
const shots = process.env.FLIPFORGE_MONITOR_SCREENSHOT_DIR || "artifacts/decision-monitor-qa";
fs.mkdirSync(shots, { recursive: true });
const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);
const cards = bundle.cards;
const now = new Date(Date.parse(bundle.generatedAt) + 60_000);
const response = path => bundle.responses[path] || null;
const governed = id => response(`/api/v1/opportunities/${id}`)?.body?.data?.opportunity?.governedDecision || {};
const usd = cents => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Local playback of the backend: only GET, only the QA tenant, only the service token issued below.
const QA_TENANT = "ff-qa-decision-monitor-v1";
const SERVICE_TOKEN = `qa-local-${crypto.randomBytes(12).toString("hex")}`;
const upstreamProblems = [];
const upstream = http.createServer((req, res) => {
  const path = new URL(req.url, "http://local").pathname;
  if (req.method !== "GET") upstreamProblems.push(`method ${req.method} ${path}`);
  if (req.headers["x-flipforge-tenant-id"] !== QA_TENANT) upstreamProblems.push(`tenant ${req.headers["x-flipforge-tenant-id"]} ${path}`);
  if (req.headers.authorization !== `Bearer ${SERVICE_TOKEN}`) upstreamProblems.push(`token ${path}`);
  const recorded = response(path);
  const cid = req.headers["x-correlation-id"] || "qa-bundle";
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (!recorded) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ meta: { contractVersion: "1.0", correlationId: cid }, error: { code: "RESOURCE_NOT_FOUND", correlationId: cid } }));
  }
  const body = JSON.parse(JSON.stringify(recorded.body));
  if (body.meta) body.meta.correlationId = cid;
  if (body.error) body.error.correlationId = cid;
  res.statusCode = recorded.status;
  res.end(JSON.stringify(body));
});
await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
Object.assign(process.env, {
  CONTEXT: "deploy-preview",
  FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW: "true",
  FLIPFORGE_API_PREVIEW_TENANT_ID: QA_TENANT,
  FLIPFORGE_API_BRIDGE_ENABLED: "true",
  FLIPFORGE_API_BASE_URL: `http://127.0.0.1:${upstream.address().port}`,
  FLIPFORGE_API_SERVICE_TOKEN: SERVICE_TOKEN
});
const gateway = createRequire(import.meta.url)("../netlify/functions/flipforge-api.js").handler;

const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const VIEWPORTS = { desktop: { width: 1440, height: 1000 }, phone: { width: 390, height: 844 } };

async function open(viewport, hash) {
  const context = await browser.newContext({ viewport });
  const requests = [];
  await context.addInitScript(() => {
    try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); localStorage.setItem("flipforge.guidedMode.enabled", "false"); } catch (_) {}
  });
  await context.route("**/assets/js/flipforge-identity.js", r => r.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "qa@flipforge.test" }), getSnapshot: () => ({ authenticated: true, email: "qa@flipforge.test", fullName: "QA Monitor", membershipActive: true, membershipConfigured: true }) });` }));
  await context.route("**/assets/js/flipforge-production-signin.js", r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/v1/**", async route => {
    const req = route.request();
    const url = new URL(req.url());
    requests.push(`${req.method()} ${url.pathname}`);
    const headers = Object.fromEntries(Object.entries(req.headers()).map(([k, v]) => [k.toLowerCase(), v]));
    const result = await gateway({
      httpMethod: req.method(), path: url.pathname, rawUrl: req.url(), headers,
      queryStringParameters: Object.fromEntries(url.searchParams.entries()), body: req.postData() || null, isBase64Encoded: false
    }, {});
    return route.fulfill({ status: result.statusCode, headers: result.headers || {}, body: result.body || "" });
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(now);
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await page.goto(`${baseUrl}/${hash}`, { waitUntil: "load" });
  return { context, page, requests, errors };
}

const panel = (page, selector) => page.evaluate(sel => {
  const node = document.querySelector(sel);
  if (!node) return null;
  const groups = {};
  for (const g of node.querySelectorAll("[data-ffdm-group]")) {
    groups[g.getAttribute("data-ffdm-group")] = { text: g.textContent.replace(/\s+/g, " "), signals: [...g.querySelectorAll("[data-ffdm-signal]")].map(li => li.getAttribute("data-ffdm-signal")) };
  }
  return { count: document.querySelectorAll(sel).length, text: node.textContent.replace(/\s+/g, " "), groups,
    headings: [...node.querySelectorAll(".ffdm-group > h3, details[data-ffdm-group] > summary")].map(h => h.textContent.trim()),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
}, selector);

const SAFE_COPY = text => !/real[- ]time|live monitoring|we watch|monitoring the market|continuously|market (moved|rose|fell)/i.test(text)
  && !/card[\s_-]*sight/i.test(text) && !/Max Buy \$0\.00/.test(text);

// Missing and stale evidence: since the provider containment the backend keeps no sale records (LIVE_PRICING_ONLY) and
// the provider catalog mapping is never CONFIRMED, so neither may surface as a change, a zero count or a card-match warning.
const FALSE_EVIDENCE = text => /Fewer saved sales|saved sales count now|Card match not confirmed/i.test(text);

const CASES = [
  { key: "crossesMaxBuy", label: "ask crosses Max Buy", expect: f => [
      ["attention lists the Max Buy crossing", f.groups.attention?.signals.includes("srv-MAX_BUY_CROSSED")],
      ["the crossing is labelled a recorded change", /Changed · FlipForge review signal/.test(f.groups.attention?.text || "")],
      ["the crossing states the saved Max Buy", (f.groups.attention?.text || "").includes(`saved Max Buy ${usd(governed(cards.crossesMaxBuy).maximumBuyPriceCents)}`)],
      ["it was re-evaluated (1 re-evaluation)", /1 re-evaluation/.test(f.text)]] },
  { key: "verify", label: "VERIFY", expect: f => [
      ["attention lists pending verification", f.groups.attention?.signals.includes("srv-VERIFICATION_PENDING")],
      ["the saved decision shows VERIFY", /VERIFY/.test(f.text)]] },
  { key: "earlierRules", label: "earlier rules", expect: f => [
      ["'Decided under earlier rules' is under As saved (historical)", (f.groups.historical?.text || "").includes("Decided under earlier rules")],
      ["the earlier-rules note is not a review item", !(f.groups.attention?.text || "").includes("Decided under earlier rules")],
      ["the saved verdict stays WATCH", /WATCH/.test(f.text) && governed(cards.earlierRules).recommendation === "WATCH"]] },
  { key: "notReEvaluated", label: "never re-evaluated", expect: f => [
      ["'What changed' says it has not been re-evaluated", /has not been re-evaluated since the decision/.test(f.groups.changed?.text || "")],
      ["the header says not re-evaluated since", /not re-evaluated since/.test(f.text)],
      ["asking price not re-checked is under Not re-checked", f.groups["not-rechecked"]?.signals.includes("price-unmonitored")],
      ["no review signal on this card", !f.groups.attention]] }
];

for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  for (const c of CASES) {
    const id = cards[c.key];
    const label = `${vp}/${c.label}`;
    const { context, page, requests, errors } = await open(viewport, `#/tracking/${encodeURIComponent(id)}`);
    await page.waitForSelector(`[data-ff-decision-monitor="${id}"]`, { timeout: 20000 }).catch(() => {});
    const f = await panel(page, `[data-ff-decision-monitor="${id}"]`);
    check(`${label}: monitor renders once`, f && f.count === 1);
    if (f) {
      check(`${label}: 'What changed' and 'Not re-checked' sections present`, Boolean(f.groups.changed) && Boolean(f.groups["not-rechecked"]), Object.keys(f.groups).join(","));
      check(`${label}: states FlipForge does not watch prices between re-evaluations`, /does not watch prices between re-evaluations/.test(f.text));
      check(`${label}: no live-monitoring claim, provider name or $0.00 Max Buy`, SAFE_COPY(f.text));
      check(`${label}: saved decision shown as unchanged`, /Saved decision · unchanged/.test(f.text));
      check(`${label}: no false evidence change (saved sales are not kept since containment)`, !FALSE_EVIDENCE(f.text), f.text.slice(0, 160));
      check(`${label}: no horizontal overflow`, f.overflow <= 1, String(f.overflow));
      for (const [name, ok] of c.expect(f)) check(`${label}: ${name}`, Boolean(ok));
      const node = await page.$(`[data-ff-decision-monitor="${id}"]`);
      if (node) await node.screenshot({ path: `${shots}/${vp}-${c.key}.png` });
    }
    check(`${label}: no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
    check(`${label}: GET only, no evaluation or provider route`, requests.every(r => r.startsWith("GET ")) && !requests.some(r => /evaluations|discover|card-intelligence/.test(r)), requests.join(","));
    await context.close();
  }

  // Portfolio: Collection Intelligence for the two owned cards.
  const { context, page, requests, errors } = await open(viewport, "#/portfolio");
  await page.waitForSelector("[data-ff-collection-intelligence]", { timeout: 20000 }).catch(() => {});
  const p = await page.evaluate(() => {
    const node = document.querySelector("[data-ff-collection-intelligence]");
    return node ? { text: node.textContent.replace(/\s+/g, " "), cards: [...node.querySelectorAll("[data-ffci-attention] [data-ffci-card], [data-ffci-all] [data-ffci-card]")].map(n => n.getAttribute("data-ffci-card")),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth } : null;
  });
  const mainText = p ? "" : await page.evaluate(() => (document.querySelector("#main-content") || document.body).innerText.replace(/\s+/g, " ").slice(0, 300));
  check(`${vp}/portfolio: Collection Intelligence renders`, Boolean(p), mainText + " | " + requests.join(","));
  if (p) {
    check(`${vp}/portfolio: lists exactly the two owned QA cards`, new Set(p.cards).size === 2 && p.cards.includes(cards.earlierRules) && p.cards.includes(cards.notReEvaluated), p.cards.join(","));
    check(`${vp}/portfolio: no market value claim, provider name or $0.00 Max Buy`, SAFE_COPY(p.text) && /No current market value is shown/.test(p.text));
    check(`${vp}/portfolio: no horizontal overflow`, p.overflow <= 1, String(p.overflow));
    const node = await page.$("[data-ff-collection-intelligence]");
    if (node) await node.screenshot({ path: `${shots}/${vp}-portfolio.png` });
  }
  check(`${vp}/portfolio: no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  check(`${vp}/portfolio: GET only`, requests.every(r => r.startsWith("GET ")), requests.join(","));
  await context.close();
}

// Deal Check on the saved-decision page (#/opportunities/{id}), same server responses, both viewports.
for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  for (const [key, id] of Object.entries(cards)) {
    const label = `${vp}/deal-check/${key}`;
    const g = governed(id);
    const live = /LIVE_PRICING_ONLY/i.test(JSON.stringify(response(`/api/v1/opportunities/${id}`)?.body?.data?.opportunity?.evidence?.priceStatus || ""));
    const { context, page, requests, errors } = await open(viewport, `#/opportunities/${encodeURIComponent(id)}`);
    await page.waitForSelector(`[data-ff-deal-check="${id}"]`, { timeout: 20000 }).catch(() => {});
    const d = await page.evaluate(sel => {
      const node = document.querySelector(sel);
      if (!node) return null;
      const row = k => { const li = node.querySelector(`[data-ffdc-check="${k}"]`); return li ? { status: li.getAttribute("data-status"), text: li.textContent.replace(/\s+/g, " ") } : null; };
      const receipt = node.querySelector("[data-ffdc-receipt]");
      return { count: document.querySelectorAll(sel).length, text: node.textContent.replace(/\s+/g, " "), identity: row("identity"),
        receipt: receipt ? receipt.textContent.replace(/\s+/g, " ") : "",
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    }, `[data-ff-deal-check="${id}"]`);
    check(`${label}: Deal Check renders once`, d && d.count === 1);
    if (d) {
      check(`${label}: shows the saved verdict (${g.recommendation})`, Boolean(g.recommendation) && d.text.includes(g.recommendation));
      if (Number.isFinite(g.maximumBuyPriceCents) && g.maximumBuyPriceCents > 0) {
        check(`${label}: shows the saved Max Buy exactly`, d.text.includes(usd(g.maximumBuyPriceCents)), usd(g.maximumBuyPriceCents));
      }
      check(`${label}: no false evidence statement`, !FALSE_EVIDENCE(d.text));
      check(`${label}: no live-monitoring claim, provider name or $0.00 Max Buy`, SAFE_COPY(d.text));
      if (live) check(`${label}: saved-sales count is not shown as a number (LIVE_PRICING_ONLY)`, !/Sales saved for this card now\s*\d/.test(d.receipt), d.receipt.slice(0, 120));
      if (g.recommendation === "VERIFY") check(`${label}: VERIFY is not shown as exact-card checks passed`, !(d.identity && /Exact-card checks passed/.test(d.identity.text)));
      else check(`${label}: governed non-VERIFY shows exact-card checks passed`, Boolean(d.identity) && d.identity.status === "pass" && /Exact-card checks passed/.test(d.identity.text), d.identity ? d.identity.text : "no identity row");
      check(`${label}: no horizontal overflow`, d.overflow <= 1, String(d.overflow));
      const node = await page.$(`[data-ff-deal-check="${id}"]`);
      if (node && key === "crossesMaxBuy") await node.screenshot({ path: `${shots}/${vp}-dealcheck-${key}.png` });
    }
    check(`${label}: no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
    check(`${label}: GET only, no evaluation or provider route`, requests.every(r => r.startsWith("GET ")) && !requests.some(r => /evaluations|discover|card-intelligence/.test(r)), requests.join(","));
    await context.close();
  }
}

check("backend saw only GET requests, the service token and the QA tenant", upstreamProblems.length === 0, upstreamProblems.slice(0, 5).join(" | "));
await browser.close();
upstream.close();
console.log("DecisionMonitorQaBundleAudit");
console.log(`bundle generatedAt=${bundle.generatedAt} policy=${bundle.profitabilityPolicy} reviewSignals=${bundle.reviewSignalVersion}`);
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
for (const f of failures) console.log(`FAIL: ${f}`);
if (failures.length) process.exit(1);
