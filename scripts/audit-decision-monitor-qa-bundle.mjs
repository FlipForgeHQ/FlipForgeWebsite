// Decision Change Monitor™ real-screen test from a QA bundle.
//
// The bundle is produced by the FlipForge2 hosted release-candidate validation (on staging, or in CI) for a dedicated
// QA tenant with controlled records: a card whose recorded ask crosses the saved Max Buy at a re-evaluation, a VERIFY,
// a decision made under the earlier profitability rules, and a card never re-evaluated. It holds the server's own
// response envelopes for every route the website requests. This script serves exactly those responses to the real app
// shell (only the correlation id is echoed per request, as the gateway does) and checks the four monitor sections on
// desktop and phone, saving screenshots.
//
// Usage: FLIPFORGE_QA_BUNDLE=path/to/bundle.json FLIPFORGE_LAYOUT_AUDIT_URL=http://127.0.0.1:4173/app \
//        node scripts/audit-decision-monitor-qa-bundle.mjs
import fs from "node:fs";
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
    const path = new URL(req.url()).pathname;
    requests.push(`${req.method()} ${path}`);
    const cid = req.headers()["x-correlation-id"] || "qa-bundle";
    const recorded = response(path);
    if (!recorded) {
      if (path.startsWith("/api/v1/psa-advisor/")) {
        return route.fulfill({ status: 200, contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ meta: { contractVersion: "1.0", correlationId: cid }, data: { kind: "psa-advisor", available: false, recalculated: false } }) });
      }
      return route.fulfill({ status: 404, contentType: "application/json; charset=utf-8", body: JSON.stringify({ error: { code: "RESOURCE_NOT_FOUND", correlationId: cid } }) });
    }
    const body = JSON.parse(JSON.stringify(recorded.body));
    if (body.meta) body.meta.correlationId = cid;
    if (body.error) body.error.correlationId = cid;
    return route.fulfill({ status: recorded.status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
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
  check(`${vp}/portfolio: Collection Intelligence renders`, Boolean(p));
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

await browser.close();
console.log("DecisionMonitorQaBundleAudit");
console.log(`bundle generatedAt=${bundle.generatedAt} policy=${bundle.profitabilityPolicy} reviewSignals=${bundle.reviewSignalVersion}`);
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
for (const f of failures) console.log(`FAIL: ${f}`);
if (failures.length) process.exit(1);
