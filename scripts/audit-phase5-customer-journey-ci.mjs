// Phase 5 Customer Intelligence: the customer journey in a real browser with a mocked API shaped exactly like the
// FlipForge2 Phase 5 contract (docs/saas/PHASE5_CUSTOMER_INTELLIGENCE_CONTRACT.md, PR #986). Synthetic data only; the
// only write is the mocked POST /api/v1/evaluations; every other write is refused by the mock.
//
//   Discover → Evaluate → Save → Decision Receipt → Track (timeline) → Review → Portfolio → Alerts → Forge Heat (and back)
//
// Covered, at 1440 / 834 / 390:
//   J  the journey strip on the receipt, tracking, Portfolio, Alerts and Forge Heat, its links, a click-through of the
//      whole journey and back, and "Review: record what you did" landing on the tracking form;
//   W  value withheld (contract section 1): exactly "Based on 1 sale: value withheld" (or the 2 / 3 sales form) on the
//      Evaluate result, receipt, saved list, tracking, timeline, Portfolio, Alerts, Forge Heat and Market View; no Max
//      Buy / buying limit, no modeled profit or ROI, never "$0", and no dollar figure but the customer's own amounts and
//      independently confirmed checkpoint prices; verdict, sales count, confidence, risk and the ask are kept;
//   T  the D7 / D14 / D30 timeline (contract section 2): exact state labels, the three streams A / B / C shown apart with
//      their labels, every movement direction in "supported market estimate" wording (never return / profit / gain),
//      verification needed, original values preserved, evidence quality and confidence disclosures, no invented
//      checkpoint, identical on the receipt and on Tracking;
//   V  verdicts BUY / WATCH / VERIFY / PASS and the exact-card identity on every receipt;
//   I  another account's saved decision (404) renders a plain not-found state with nothing of it shown;
//   Q  axe (no serious or critical violation in the Phase 5 components; page-wide results reported), no horizontal
//      overflow, no page errors, the screen settles (no idle DOM writes or requests), a basic performance budget.
//
// Screenshots: FF_P5_SHOTS (default output/phase5). The production host is mapped to the local server
// (saas-prototype/serve.mjs, port 4173 or FLIPFORGE_P5_AUDIT_PORT).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { installMeter } from "./journey/render-stability.mjs";
import { CARDS, IDS, OTHER_TENANT_ID, TENANT_EMAIL, WITHHELD_LABEL, STATE_LABELS, MOVEMENT_LABELS, STREAM_LABELS, handler } from "./fixtures/phase5/customer-intelligence.mjs";

const require = createRequire(import.meta.url);
const PORT = process.env.FLIPFORGE_P5_AUDIT_PORT || "4173";
const APP = `http://goflipforge.com:${PORT}/app/beta/`;
const SHOTS = process.env.FF_P5_SHOTS || "output/phase5";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE || undefined;
const ONLY = (process.env.FF_P5_DEVICES || "desktop,tablet,phone").split(",");
fs.mkdirSync(SHOTS, { recursive: true });
let axeSource = "";
try { axeSource = fs.readFileSync(process.env.AXE_CORE_PATH || require.resolve("axe-core/axe.min.js"), "utf8"); } catch (_) { axeSource = ""; }
if (!axeSource && process.env.CI) { console.log("::error title=phase5-journey::axe-core is required in CI (AXE_CORE_PATH)"); process.exit(1); }

const passes = [];
const failures = [];
const notes = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${String(detail).slice(0, 400)}]` : name);

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  tablet: { viewport: { width: 834, height: 1112 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
};
const LABEL_FOR = id => CARDS[id].fewSales ? `Based on ${CARDS[id].sales} sales: value withheld` : WITHHELD_LABEL;
const FORBIDDEN_WORDS = /\breturns?\b|\breturned\b|profit made|\bgains?\b|\bgained\b/i;
const PROVIDER = /CardSight|CARDSIGHT/;
const money = cents => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const dollars = textValue => [...String(textValue).matchAll(/\$\s?(\d[\d,]*(?:\.\d{2})?)/g)].map(m => Number(m[1].replace(/,/g, "")));
// The dollar amounts a withheld card's own pages may show: the customer's own ask / paid / reported prices, and prices
// independently confirmed at a checkpoint (stream B, from independent exact-card sales; never the withheld value).
function allowedDollars(id) {
  const c = CARDS[id];
  const set = new Set([c.askCents / 100]);
  if (c.paidCents) set.add(c.paidCents / 100);
  for (const cp of c.timeline(id).checkpoints) {
    if (cp.state === "PRICE_OBSERVED" && Number.isFinite(cp.evidence.observedValueCents)) set.add(cp.evidence.observedValueCents / 100);
    for (const r of cp.customerReports) if (Number.isFinite(r.reportedPriceCents)) set.add(r.reportedPriceCents / 100);
  }
  return set;
}

const browser = await chromium.launch({ executablePath, args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"] });

async function open(route, device, { waitFor = null, evaluateId = null } = {}) {
  const context = await browser.newContext(DEVICES[device]);
  await context.addInitScript(email => {
    try {
      localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
      localStorage.setItem("flipforge.guidedMode.enabled", "false");
      let hash = 2166136261;
      for (const ch of email.toLowerCase()) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
      const key = (hash >>> 0).toString(36);
      localStorage.setItem(`flipforge.guidedMode.v3.${key}.welcome`, "seen");
      localStorage.setItem(`flipforge.guidedMode.v3.${key}.enabled`, "off");
    } catch (_) {}
  }, TENANT_EMAIL);
  await context.route(/\/assets\/js\/flipforge-identity\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${TENANT_EMAIL}"}),getSnapshot:()=>({authenticated:true,email:"${TENANT_EMAIL}",fullName:"Phase 5 Audit",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${TENANT_EMAIL}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"t"});` }));
  await context.route(/\/assets\/js\/flipforge-production-signin\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  const requests = [];
  await context.route("**/api/v1/**", handler(requests, { evaluateId }));
  await installMeter(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
  const started = Date.now();
  await page.goto(`${APP}#/${route}`, { waitUntil: "load" });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(waitFor ? 1500 : 4500);
  const readyMs = Date.now() - started;
  return { context, page, errors, requests, readyMs };
}
const mainText = page => page.evaluate(() => { document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }); return document.querySelector("#main-content")?.innerText || ""; });
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function settles(page, ms = 3000) {
  const before = await page.evaluate(() => ({ r: window.__ffRenderMeter?.records ?? -1, f: window.__ffRenderMeter?.fetches ?? -1 }));
  await page.waitForTimeout(ms);
  const after = await page.evaluate(() => ({ r: window.__ffRenderMeter?.records ?? -1, f: window.__ffRenderMeter?.fetches ?? -1 }));
  return { records: after.r - before.r, fetches: after.f - before.f, ok: before.r >= 0 && after.r - before.r <= 5 && after.f - before.f === 0 };
}
async function perf(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return { dcl: Math.round(nav?.domContentLoadedEventEnd || 0), load: Math.round(nav?.loadEventEnd || 0), nodes: document.getElementsByTagName("*").length,
      heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  });
}
// axe: Phase 5 components must have no serious or critical violation; page-wide results are reported as notes.
async function axe(page, label) {
  if (!axeSource) { notes.push(`axe-core not installed: ${label} not scanned`); return { scoped: [], page: [] }; }
  await page.addScriptTag({ content: axeSource }).catch(() => {});
  const result = await page.evaluate(async () => {
    const run = async context => {
      const r = await window.axe.run(context, { resultTypes: ["violations"] });
      return r.violations.filter(v => v.impact === "serious" || v.impact === "critical")
        .map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
    };
    const scopedTargets = [...document.querySelectorAll("#main-content [data-ff-journey], #main-content [data-ff-outcome-timeline], #main-content [data-forge-heat-withheld], #main-content [data-market-view-withheld], #main-content [data-ff-value-withheld]")];
    const scoped = [];
    for (const node of scopedTargets) for (const v of await run(node)) scoped.push(v);
    const whole = await run(document.querySelector("#main-content") || document);
    return { scoped, page: whole };
  }).catch(error => ({ scoped: [{ id: "axe-error", impact: "critical", nodes: [String(error.message).slice(0, 120)] }], page: [] }));
  if (result.page.length) notes.push(`axe page-wide ${label}: ${result.page.map(v => `${v.id}(${v.impact}) ${v.nodes[0] || ""}`).join("; ")}`);
  return result;
}
async function shot(page, name, full = false) { await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full }).catch(() => {}); }
async function shotOf(page, selector, name) {
  const node = page.locator(selector).first();
  if (await node.count()) { await node.scrollIntoViewIfNeeded().catch(() => {}); await node.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {}); }
  else await shot(page, name);
}
async function common(s, label, { axeScan = true, budgetMs = 9000 } = {}) {
  const o = await overflow(s.page);
  check(`Q ${label}: no horizontal overflow`, o <= 1, String(o));
  const p = await perf(s.page);
  check(`Q ${label}: performance budget (DOMContentLoaded < 4 s, load < 6 s, ready < ${budgetMs / 1000} s, < 9000 nodes)`, p.dcl < 4000 && p.load < 6000 && s.readyMs < budgetMs && p.nodes < 9000,
    `${JSON.stringify(p)} ready ${s.readyMs} ms`);
  const st = await settles(s.page);
  check(`Q ${label}: the screen settles (no idle DOM writes or requests)`, st.ok, JSON.stringify(st));
  if (axeScan) {
    const a = await axe(s.page, label);
    check(`Q ${label}: axe finds no serious or critical violation in the Phase 5 components`, a.scoped.length === 0, JSON.stringify(a.scoped));
  }
  const t = await mainText(s.page);
  check(`Q ${label}: no page errors, never names the provider, never "$0"`, s.errors.length === 0 && !PROVIDER.test(t) && !/\$0(?:\.00)?(?!\d|,|\.\d*[1-9])/.test(t),
    `${s.errors.join(" | ")} ${(t.match(/.{0,40}\$0(?:\.00)?(?![\d,]).{0,20}/) || [""])[0]}`);
  return t;
}
const timelineText = page => page.evaluate(() => document.querySelector("#main-content [data-ff-outcome-timeline]")?.innerText.replace(/\s+/g, " ").trim() || "");
const journeySteps = page => page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-journey] li")].map(li => ({ step: li.getAttribute("data-ff-journey-step"),
  href: li.querySelector("a")?.getAttribute("href") || "", current: li.querySelector("a")?.getAttribute("aria-current") === "step" })));

function journeyChecks(label, list, currentStep, cardId) {
  const order = ["discover", "evaluate", "save", "receipt", "track", "review", "portfolio", "alerts", "heat"];
  check(`J ${label}: the journey strip lists Discover → Evaluate → Saved → Receipt → Track → Review → Portfolio → Alerts → Forge Heat`,
    list.map(x => x.step).join(",") === order.join(","), list.map(x => x.step).join(","));
  check(`J ${label}: the current step is ${currentStep}`, list.filter(x => x.current).map(x => x.step).join(",") === currentStep, JSON.stringify(list.filter(x => x.current)));
  if (cardId) {
    const enc = encodeURIComponent(cardId);
    const by = Object.fromEntries(list.map(x => [x.step, x.href]));
    check(`J ${label}: Receipt, Track and Review point at this card`, by.receipt === `#/opportunities/${enc}` && by.track === `#/tracking/${enc}` && by.review === `#/tracking/${enc}`, JSON.stringify(by));
  }
}

async function receiptChecks(id, device) {
  const c = CARDS[id];
  const s = await open(`opportunities/${id}`, device, { waitFor: "#main-content [data-ff-outcome-timeline]" });
  const label = `${device} receipt ${id}`;
  const t = await common(s, label, { axeScan: device !== "tablet" });
  check(`V ${label}: verdict ${c.verdict} and the exact-card identity are shown`, t.includes(c.verdict) && t.includes(c.title), t.slice(0, 200));
  check(`V ${label}: the customer's own ask is shown`, t.includes(money(c.askCents)));
  if (c.withheld) {
    const wanted = LABEL_FOR(id);
    const cells = await s.page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-value-withheld]")].map(n => n.innerText.trim()));
    check(`W ${label}: "${wanted}" is shown in place of the value`, t.includes(wanted) && cells.length >= 2 && cells.every(x => x === wanted), JSON.stringify(cells));
    check(`W ${label}: no Max Buy / buying limit figure`, await s.page.locator("#main-content [data-max-buy-at-decision]").count() === 0 && !/Max Buy\s*\$\d/i.test(t) && !/buying limit\s*\$\d/i.test(t));
    check(`W ${label}: no modeled profit or ROI figure`, !/(profit|ROI)[^\n]{0,40}[$%]\s?\d/i.test(t), (t.match(/(profit|ROI)[^\n]{0,40}[$%]\s?\d/i) || [""])[0]);
    const allowed = allowedDollars(id);
    const shown = [...new Set(dollars(t))];
    check(`W ${label}: no dollar figure but the customer's own amounts and independently confirmed prices`, shown.every(v => allowed.has(v)), `${shown.join(",")} allowed ${[...allowed].join(",")}`);
    check(`W ${label}: verdict, sales count, confidence and risk are kept`, t.includes(String(c.confidence)) && t.includes(String(c.risk)) && new RegExp(`\\b${c.sales}\\b`).test(t));
  } else if (c.maxBuyCents && c.verdict === "BUY") {
    check(`W ${label}: a multi-sale BUY still shows its Max Buy`, (await s.page.locator("#main-content [data-max-buy-at-decision]").first().innerText().catch(() => "")).includes(money(c.maxBuyCents)));
    check(`W ${label}: no withheld label on a decision whose values are not withheld`, !/value withheld/.test(t));
  } else {
    check(`W ${label}: no withheld label on a decision whose values are not withheld`, !/value withheld/.test(t));
  }
  if (c.verdict === "VERIFY") check(`W ${label}: a VERIFY decision shows no Max Buy`, await s.page.locator("#main-content [data-max-buy-at-decision]").count() === 0);
  journeyChecks(label, await journeySteps(s.page), "receipt", id);
  const tl = await timelineChecks(s.page, id, label);
  const insideStack = await s.page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-journey], #main-content [data-ff-outcome-timeline]")].some(n => n.closest("[data-ff-cdi-signal], [data-ff-cdi-stack-host]")));
  check(`J ${label}: neither the journey strip nor the timeline sits inside the CDI Signal Stack`, !insideStack);
  check(`Q ${label}: reads only (no write request)`, s.requests.every(r => r.startsWith("GET ")), s.requests.filter(r => !r.startsWith("GET ")).join(" | "));
  if (device === "desktop" || ["p5-one-sale-watch", "p5-multi-buy"].includes(id)) {
    await shot(s.page, `${device}-receipt-${id}`);
    await shotOf(s.page, "#main-content [data-ff-outcome-timeline]", `${device}-timeline-${id}`);
  }
  await s.context.close();
  return tl;
}

async function timelineChecks(page, id, label) {
  const expected = CARDS[id].timeline(id);
  const tl = await timelineText(page);
  const states = await page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-outcome-timeline] [data-ff-otl-state]")].map(e => e.innerText.trim()));
  check(`T ${label}: exactly three checkpoints, labels match the server states`, states.join("|") === expected.checkpoints.map(x => STATE_LABELS[x.state]).join("|"), states.join(" | "));
  const streams = await page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-outcome-timeline] .ff-otl-checkpoint")].map(cp =>
    [...cp.querySelectorAll("[data-ff-otl-stream]")].map(s => ({ stream: s.getAttribute("data-ff-otl-stream"), label: s.querySelector("dt")?.innerText.trim() || "",
      movement: s.getAttribute("data-ff-otl-movement") || "", value: s.querySelector("dd > strong")?.innerText.trim() || "" }))));
  check(`T ${label}: each checkpoint shows streams A, B and C apart, with their labels`, streams.length === 3 && streams.every(list => list.map(x => x.stream).join("") === "ABC"
    && list[0].label.endsWith(STREAM_LABELS.A) && list[1].label.endsWith(STREAM_LABELS.B) && list[2].label.endsWith(STREAM_LABELS.C)), JSON.stringify(streams[0]));
  const movements = expected.checkpoints.map(x => x.streams.derivedMarketEstimate.movement);
  check(`T ${label}: stream A movement reads in "supported market estimate" wording`, streams.every((list, i) => list[0].movement === movements[i] && list[0].value === MOVEMENT_LABELS[movements[i]]),
    streams.map(l => `${l[0]?.movement}:${l[0]?.value}`).join(" | "));
  check(`T ${label}: no return / profit / gain wording in the timeline`, !FORBIDDEN_WORDS.test(tl), (tl.match(new RegExp(`.{0,40}(${FORBIDDEN_WORDS.source}).{0,20}`, "i")) || [""])[0]);
  check(`T ${label}: original conclusion, why, and evidence disclosures (count, quality, confidence, risk)`, /1\. What FlipForge originally concluded and why/.test(tl)
    && tl.includes(expected.originalDecision.reasonExplanation) && /Exact completed sales/.test(tl) && /Evidence quality/.test(tl) && /Confidence \d+\/100/.test(tl) && /Risk \d+\/100/.test(tl)
    && /individual sale prices are never shown/.test(tl), tl.slice(0, 300));
  check(`T ${label}: what changed at each checkpoint and the conclusion`, /2\. What changed at Day 7, Day 14 and Day 30/.test(tl) && /3\. What can be concluded/.test(tl)
    && tl.includes(expected.conclusion.statement) && expected.checkpoints.every(x => !x.whatChanged || tl.includes(x.whatChanged)));
  const verification = await page.evaluate(() => document.querySelector("#main-content [data-ff-outcome-timeline] [data-ff-otl-verification]")?.getAttribute("data-ff-otl-verification") || "");
  check(`T ${label}: verification ${expected.verification.needed ? "needed" : "not needed"} is stated`, verification === (expected.verification.needed ? "needed" : "not-needed")
    && (!expected.verification.needed || /Additional verification needed/.test(tl)), verification);
  const reports = expected.checkpoints.reduce((n, x) => n + x.customerReports.length, 0);
  const shownReports = await page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-outcome-timeline] [data-ff-otl-report]")].map(e => e.innerText));
  check(`T ${label}: customer reports are "Customer-Reported — Unverified" and not counted as a market price`, shownReports.length === reports
    && shownReports.every(r => r.includes("Customer-Reported — Unverified") && /not counted as a market price/.test(r)), shownReports.join(" | "));
  if (CARDS[id].withheld) {
    check(`W ${label}: the timeline shows the withheld label for the original value and no baseline figure`, await page.evaluate(() =>
      document.querySelector('#main-content [data-ff-outcome-timeline] [data-ff-otl-baseline]')?.getAttribute("data-ff-otl-baseline")) === "withheld" && tl.includes(LABEL_FOR(id)));
  } else if (expected.originalDecision.baselineSupported) {
    check(`T ${label}: the original supported value is preserved as recorded`, tl.includes(money(expected.originalDecision.baselineSupportedValueCents)));
  }
  check(`T ${label}: the Decision Receipt is preserved, unchanged`, /Preserved, unchanged/.test(tl));
  return tl;
}

async function trackingChecks(id, device, receiptTimeline) {
  const s = await open(`tracking/${id}`, device, { waitFor: "#main-content [data-ff-outcome-timeline]" });
  const label = `${device} tracking ${id}`;
  const t = await common(s, label, { axeScan: device === "desktop" });
  const tl = await timelineChecks(s.page, id, label);
  check(`T ${label}: the same timeline text as on the receipt`, !receiptTimeline || tl === receiptTimeline, `${tl.length} vs ${receiptTimeline.length}`);
  check(`T ${label}: never reads "Waiting for observation"`, !/waiting for observation/i.test(t));
  journeyChecks(label, await journeySteps(s.page), "track", id);
  check(`J ${label}: the tracking form (record what you did) is on the page`, await s.page.locator("#main-content [data-lifecycle-form]").count() === 1);
  if (CARDS[id].withheld) {
    const cells = await s.page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-value-withheld]")].map(n => n.innerText.trim()));
    check(`W ${label}: the decision history and timeline show "${LABEL_FOR(id)}"`, cells.length >= 2 && cells.every(x => x === LABEL_FOR(id)), JSON.stringify(cells));
    const shown = [...new Set(dollars(t))];
    const allowed = allowedDollars(id);
    check(`W ${label}: no dollar figure but the customer's own amounts and independently confirmed prices`, shown.every(v => allowed.has(v)), `${shown.join(",")}`);
    check(`W ${label}: no Max Buy figure`, !/Max Buy\s*\$\d/i.test(t));
  }
  if (device === "desktop" || id === "p5-one-sale-watch") await shot(s.page, `${device}-tracking-${id}`);
  await s.context.close();
}

async function listPages(device) {
  // Saved decisions list
  {
    const s = await open("opportunities", device);
    const t = await common(s, `${device} saved decisions`);
    for (const id of IDS) if (CARDS[id].withheld) {
      const row = await s.page.evaluate(id => [...document.querySelectorAll("#main-content tr, #main-content article, #main-content li")]
        .find(n => n.querySelector(`a[href="#/opportunities/${id}"]`))?.innerText || "", id);
      check(`W ${device} saved decisions: ${id} reads "${LABEL_FOR(id)}" with its verdict and no figure`, row.includes(LABEL_FOR(id)) && row.includes(CARDS[id].verdict)
        && dollars(row).every(v => v === CARDS[id].askCents / 100), row.replace(/\s+/g, " ").slice(0, 200));
    }
    for (const v of ["BUY", "WATCH", "VERIFY", "PASS"]) check(`V ${device} saved decisions: verdict ${v} is rendered`, new RegExp(`\\b${v}\\b`).test(t));
    await shot(s.page, `${device}-saved-decisions`);
    await s.context.close();
  }
  // Home dashboard (full view): withheld rows read their label, never a figure.
  {
    const s = await open("dashboard", device);
    for (const b of await s.page.locator("#main-content button:has-text('Show full dashboard')").all()) await b.click().catch(() => {});
    await s.page.waitForTimeout(1200);
    const t = await common(s, `${device} home dashboard`, { axeScan: false });
    for (const id of IDS.filter(x => CARDS[x].withheld)) {
      const row = await s.page.evaluate(title => [...document.querySelectorAll("#main-content tr")].find(tr => tr.innerText.includes(title))?.innerText || "", CARDS[id].title);
      check(`W ${device} home dashboard: ${id} reads "${LABEL_FOR(id)}" and no figure but its ask`, !row || (row.includes(LABEL_FOR(id)) && dollars(row).every(v => v === CARDS[id].askCents / 100)), row.replace(/\s+/g, " "));
    }
    check(`W ${device} home dashboard: the withheld label is shown`, t.includes(WITHHELD_LABEL));
    await s.context.close();
  }
  // Portfolio
  {
    const s = await open("portfolio", device);
    const t = await common(s, `${device} portfolio`);
    journeyChecks(`${device} portfolio`, await journeySteps(s.page), "portfolio", null);
    const row = await s.page.evaluate(() => [...document.querySelectorAll("#main-content tr")].find(tr => /Jackson Holliday/.test(tr.innerText))?.innerText || "");
    check(`W ${device} portfolio: the one-sale card reads "${WITHHELD_LABEL}", keeps WATCH and what you paid, with no buying limit`, row.includes(WITHHELD_LABEL)
      && /WATCH/.test(row) && row.includes(money(CARDS["p5-one-sale-watch"].paidCents)) && !/Max Buy \$/.test(row), row.replace(/\s+/g, " "));
    check(`W ${device} portfolio: a multi-sale BUY keeps its Max Buy at decision`, /Max Buy \$85\.00 at decision/.test(t));
    await shot(s.page, `${device}-portfolio`);
    await s.context.close();
  }
  // Alerts
  {
    const s = await open("alerts", device);
    const t = await common(s, `${device} alerts`);
    journeyChecks(`${device} alerts`, await journeySteps(s.page), "alerts", null);
    check(`W ${device} alerts: alerts on withheld decisions read "${WITHHELD_LABEL}" with no value or buying limit`, (t.match(/Based on 1 sale: value withheld/g) || []).length >= 2
      && !/Max Buy \$/.test(t) && dollars(t).length === 0, (t.match(/.{0,60}\$\d.{0,20}/) || [""])[0]);
    await shot(s.page, `${device}-alerts`);
    await s.context.close();
  }
  // Forge Heat
  {
    const s = await open("forge-heat", device);
    const t = await common(s, `${device} forge heat`);
    journeyChecks(`${device} forge heat`, await journeySteps(s.page), "heat", null);
    const ranked = await s.page.evaluate(() => [...document.querySelectorAll("#main-content .ff-heat-table a[href^='#/opportunities/'], #main-content [data-ff-heat-control-room] a[href^='#/opportunities/']")]
      .filter(a => !a.closest("[data-forge-heat-withheld], [data-ff-journey]")).map(a => decodeURIComponent(a.getAttribute("href").replace("#/opportunities/", ""))));
    check(`W ${device} forge heat: no withheld decision is ranked (even one an older read path listed)`, !ranked.some(id => CARDS[id]?.withheld) && ranked.includes("p5-multi-buy"), ranked.join(","));
    const withheld = await s.page.evaluate(() => [...document.querySelectorAll("#main-content [data-forge-heat-withheld-card]")].map(li => li.innerText.replace(/\s+/g, " ")));
    check(`W ${device} forge heat: withheld decisions are listed with their verdict and label, no value`, withheld.length === 3 && withheld.some(x => x.includes(WITHHELD_LABEL))
      && withheld.some(x => x.includes("Based on 2 sales: value withheld")) && withheld.every(x => dollars(x).length === 0), withheld.join(" | "));
    check(`W ${device} forge heat: Forge Heat never presents itself as overriding the decision`, /never overrides a decision/.test(t) && /does not create a second BUY\/WATCH\/VERIFY\/PASS authority/.test(t)
      && !/Forge Heat (?:overrides|changes the verdict|recommends)/i.test(t));
    await shot(s.page, `${device}-forge-heat`);
    await s.context.close();
  }
  // Market View
  {
    const s = await open("market-view", device);
    const t = await common(s, `${device} market view`);
    check(`W ${device} market view: loads, drops the withheld decision from the value list and names it with the label`, !/temporarily unavailable/i.test(t)
      && await s.page.locator("#main-content [data-market-view-withheld]").count() === 1 && t.includes(WITHHELD_LABEL)
      && !/\$125\.00 →/.test(t), t.slice(0, 200));
    await shot(s.page, `${device}-market-view`);
    await s.context.close();
  }
}

async function evaluateOneSale(device) {
  const s = await open("evaluate", device, { evaluateId: "p5-one-sale-watch" });
  const form = s.page.locator("#main-content [data-staging-evaluation-form]");
  try {
    await form.waitFor({ state: "visible", timeout: 15000 });
    await s.page.evaluate(() => document.querySelectorAll("#main-content [data-staging-evaluation-form] details").forEach(d => { d.open = true; }));
    const c = CARDS["p5-one-sale-watch"];
    await form.locator('[name="externalListingId"]').fill("phase5-holliday-001");
    await form.locator('[name="marketplace"]').selectOption("EBAY").catch(() => {});
    await form.locator('[name="cardIdentity"]').fill(c.title);
    const url = form.locator('[name="listingUrl"]');
    await url.fill("https://www.ebay.com/itm/1234567890");
    await form.locator('[name="itemPrice"]').fill((c.askCents / 100).toFixed(2));
    await form.locator('[name="acknowledgeBoundary"]').check();
    await form.locator('button[type="submit"]').click();
    await s.page.locator("#main-content .staging-evaluation-result").waitFor({ state: "visible", timeout: 20000 });
    await s.page.waitForTimeout(1200);
    const result = await s.page.evaluate(() => { document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }); return document.querySelector("#main-content .staging-evaluation-result")?.innerText || ""; });
    const label = `${device} evaluate result (one sale)`;
    check(`W ${label}: verdict WATCH with "${WITHHELD_LABEL}" in place of the value`, /WATCH/.test(result) && result.includes(WITHHELD_LABEL), result.slice(0, 300));
    check(`W ${label}: no "$0", no Max Buy, no profit or ROI, only the customer's own ask`, !/\$0\.00/.test(result) && !/Max Buy/i.test(result)
      && dollars(result).every(v => v === c.askCents / 100) && result.includes(money(c.askCents)), (result.match(/.{0,40}\$\d[\d,.]*.{0,10}/g) || []).join(" | "));
    check(`W ${label}: the sales count, confidence and risk are kept`, /\b1\b/.test(result) && result.includes("41") && /Risk/.test(result));
    const o = await overflow(s.page);
    check(`Q ${label}: no horizontal overflow, no page errors`, o <= 1 && s.errors.length === 0, `${o} ${s.errors.join(" | ")}`);
    await shotOf(s.page, "#main-content .staging-evaluation-result", `${device}-evaluate-result-one-sale`);
  } catch (error) {
    check(`W ${device} evaluate result (one sale): the evaluation completed`, false, String(error.message).split("\n")[0]);
  }
  await s.context.close();
}

async function isolation(device) {
  for (const route of [`opportunities/${OTHER_TENANT_ID}`, `tracking/${OTHER_TENANT_ID}`]) {
    const s = await open(route, device);
    const t = await mainText(s.page);
    const label = `${device} isolation ${route.split("/")[0]}`;
    check(`I ${label}: another account's decision renders a plain not-found state (404)`, /not found|couldn.t find|could not be found|isn.t in your account|no saved decision|not available|unavailable/i.test(t)
      && s.requests.some(r => r.includes(OTHER_TENANT_ID)), t.replace(/\s+/g, " ").slice(0, 300));
    check(`I ${label}: nothing of any card, no value and no timeline is shown`, await s.page.locator("#main-content [data-ff-outcome-timeline]").count() === 0
      && !IDS.some(id => t.includes(CARDS[id].title) && route.startsWith("opportunities")) && !/value withheld/.test(t), t.slice(0, 200));
    check(`I ${label}: no page errors and no horizontal overflow`, s.errors.length === 0 && await overflow(s.page) <= 1, s.errors.join(" | "));
    if (route.startsWith("opportunities")) await shot(s.page, `${device}-isolation-404`);
    await s.context.close();
  }
}

// The whole journey by clicking: receipt → Track → Review (form focused) → Portfolio → Alerts → Forge Heat → back to the receipt.
async function clickThrough(device) {
  const id = "p5-multi-buy";
  const s = await open(`opportunities/${id}`, device, { waitFor: "#main-content [data-ff-journey]" });
  const go = async (step, expectHash, ready) => {
    await s.page.locator(`#main-content [data-ff-journey] [data-ff-journey-step="${step}"] a`).click();
    await s.page.waitForFunction(h => location.hash === h, expectHash, { timeout: 8000 }).catch(() => {});
    if (ready) await s.page.waitForSelector(ready, { timeout: 12000 }).catch(() => {});
    await s.page.waitForTimeout(800);
    return s.page.evaluate(() => location.hash);
  };
  try {
    check(`J ${device} click-through: receipt → Track opens this card's timeline`, await go("track", `#/tracking/${id}`, "#main-content [data-ff-outcome-timeline]") === `#/tracking/${id}`
      && await s.page.locator("#main-content [data-ff-outcome-timeline]").count() === 1);
    await go("review", `#/tracking/${id}`, "#main-content [data-lifecycle-form]");
    await s.page.waitForTimeout(600);
    check(`J ${device} click-through: Review lands on "record what you did" (the tracking form, status focused)`, await s.page.evaluate(() =>
      document.activeElement?.getAttribute("name") === "trackingStatus" && Boolean(document.activeElement.closest("[data-lifecycle-form]"))));
    check(`J ${device} click-through: Portfolio`, await go("portfolio", "#/portfolio", "#main-content [data-ff-journey]") === "#/portfolio" && /Portfolio/.test(await mainText(s.page)));
    const portfolioLinks = await journeySteps(s.page);
    check(`J ${device} click-through: on Portfolio the card steps still point at the card last opened`, portfolioLinks.find(x => x.step === "receipt")?.href === `#/opportunities/${id}`);
    check(`J ${device} click-through: Alerts`, await go("alerts", "#/alerts", "#main-content [data-ff-journey]") === "#/alerts");
    check(`J ${device} click-through: Forge Heat`, await go("heat", "#/forge-heat", "#main-content [data-ff-journey]") === "#/forge-heat");
    check(`J ${device} click-through: back to the Decision Receipt of the same card`, await go("receipt", `#/opportunities/${id}`, "#main-content [data-ff-outcome-timeline]") === `#/opportunities/${id}`
      && (await mainText(s.page)).includes(CARDS[id].title));
    check(`J ${device} click-through: no page errors`, s.errors.length === 0, s.errors.join(" | "));
  } catch (error) {
    check(`J ${device} click-through completed`, false, String(error.message).split("\n")[0]);
  }
  await s.context.close();
}

try {
  for (const device of Object.keys(DEVICES).filter(d => ONLY.includes(d))) {
    const ids = device === "desktop" ? IDS : ["p5-one-sale-watch", "p5-few-mixed", "p5-multi-buy"];
    for (const id of ids) {
      const tl = await receiptChecks(id, device);
      if (device === "desktop" || id === "p5-one-sale-watch") await trackingChecks(id, device, tl);
    }
    await listPages(device);
    await evaluateOneSale(device);
    await isolation(device);
    await clickThrough(device);
  }
  // Every movement direction and every stream state appears somewhere in the fixtures that were rendered.
  const movements = new Set(IDS.flatMap(id => CARDS[id].timeline(id).checkpoints.map(c => c.streams.derivedMarketEstimate.movement)));
  check("T every stream A movement direction is covered (increased, decreased, unchanged, unavailable, not yet available)",
    ["INCREASED", "DECREASED", "UNCHANGED", "UNAVAILABLE", "NOT_YET_AVAILABLE"].every(m => movements.has(m)), [...movements].join(","));
  const states = new Set(IDS.flatMap(id => CARDS[id].timeline(id).checkpoints.map(c => c.state)));
  check("T every checkpoint state is covered", ["AWAITING_CHECKPOINT", "PRICE_OBSERVED", "NO_RELIABLE_EVIDENCE", "NO_NEW_SALES", "WINDOW_CLOSED", "CUSTOMER_REPORTED_UNVERIFIED"].every(x => states.has(x)), [...states].join(","));
} finally {
  await browser.close();
}

console.log(`Phase 5 customer journey audit: ${passes.length} passed, ${failures.length} failed. Screenshots: ${SHOTS}`);
for (const n of notes) console.log(`NOTE ${n}`);
for (const f of failures) console.log(`FAIL ${f}`);
// CI logs are not always readable: the first failures are also written as annotations.
if (process.env.GITHUB_ACTIONS) for (const f of failures.slice(0, 40)) console.log(`::error title=phase5-journey::${f.replace(/\r?\n/g, " ").slice(0, 900)}`);
if (process.env.GITHUB_ACTIONS) for (const n of notes.slice(0, 10)) console.log(`::notice title=phase5-journey::${n.replace(/\r?\n/g, " ").slice(0, 900)}`);
if (process.env.FF_P5_VERBOSE) for (const p of passes) console.log(`PASS ${p}`);
process.exit(failures.length ? 1 : 0);
