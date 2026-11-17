// Integrated customer journey, in a real browser, through the real gateway function, against the FlipForge2 DEV
// journey server (real hosted HTTP server, tenant projections, lifecycle, alerts, Forge Heat and Smart Opportunity
// engine over a temporary database seeded only with operator-entered exact completed sales; CardSight suspended).
//
//   Discover → Evaluate → Save → Track → Re-evaluate (prefilled) → What changed → Alerts (review, seen)
//   → Own → Portfolio → Forge Heat → another account (isolation) → failed backend request → tablet and phone
//   → Phase 5 (journey-phase5-alpha / -bravo): value withheld on every surface, the D7 / D14 / D30 timeline with
//     streams A / B / C, the journey strip click-through, isolation (404), desktop / tablet / phone.
//
// Usage: JOURNEY_BASE=http://goflipforge.com:4190 JOURNEY_SHOTS=dir node scripts/journey/customer-journey-e2e.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import zlib from "node:zlib";
import { installMeter, measureRoutes, printRows } from "./render-stability.mjs";

const BASE = (process.env.JOURNEY_BASE || "http://goflipforge.com:4190").replace(/\/$/, "");
// The real customer app for invited testers is /app/beta. JOURNEY_APP_PATH=/app/customer/ runs the owner preview page.
const APP = `${BASE}${process.env.JOURNEY_APP_PATH || "/app/beta/"}`;
console.log(`JOURNEY APP ${APP}`);
const SHOTS = process.env.JOURNEY_SHOTS || "";
const email = "journey-tenant-a@journey.flipforge.test";
const CARDS = {
  strong: { identity: "2019 Topps Chrome Pete Alonso #204 PSA 10", listing: "journey-alonso-ui-001", price: "300.00" },
  second: { identity: "2018 Topps Chrome Juan Soto #155 PSA 10", listing: "journey-soto-ui-001", price: "300.00" },
  thin: { identity: "2021 Bowman Chrome Jasson Dominguez #BCP-90 PSA 10", listing: "journey-dominguez-ui-001", price: "200.00" }
};
const EMAILS = Object.freeze({ a: email, b: "journey-tenant-b@journey.flipforge.test",
  p5a: "journey-phase5-alpha@journey.flipforge.test", p5b: "journey-phase5-bravo@journey.flipforge.test" });
const passes = [];
const failures = [];
const notes = [];
const check = (name, ok, detail = "") => {
  (ok ? passes : failures).push(detail ? `${name} [${String(detail).slice(0, 300)}]` : name);
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${!ok && detail ? ` [${String(detail).slice(0, 300)}]` : ""}`);
};
const RAW = /\b(?:REVIEW_DUE|DECISION_CHANGED|MAX_BUY_CROSSED|DECISION_RECHECK_DUE|VERIFICATION_PENDING|LEGACY_DECISION|EXACT_IDENTITY_NOT_CONFIRMED|MAX_BUY_UNAVAILABLE|ASK_ABOVE_MAX_BUY)\b/;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"],
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });

async function session(tenant, viewport = { width: 1440, height: 1000 }, extra = {}) {
  const context = await browser.newContext({ viewport, ...extra });
  await context.addCookies([{ name: "ff_journey_tenant", value: tenant, url: BASE }]);
  await context.addInitScript(({ email }) => {
    try {
      localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
      localStorage.setItem("flipforge.guidedMode.enabled", "false");
      let hash = 2166136261;
      for (const ch of email.toLowerCase()) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
      const key = (hash >>> 0).toString(36);
      localStorage.setItem(`flipforge.guidedMode.v3.${key}.welcome`, "seen");
      localStorage.setItem(`flipforge.guidedMode.v3.${key}.enabled`, "off");
    } catch (_) {}
  }, { email: EMAILS[tenant] || email });
  const who = EMAILS[tenant] || email;
  await context.route(/\/assets\/js\/flipforge-identity\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${who}"}),getSnapshot:()=>({authenticated:true,email:"${who}",fullName:"Journey Tester",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${who}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"journey"});` }));
  await context.route(/\/assets\/js\/flipforge-production-signin\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await installMeter(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
  return { context, page, errors };
}

async function go(page, hash, settle = 2500) {
  await page.goto(`${APP}#/${hash}`, { waitUntil: "load" });
  await page.waitForTimeout(settle);
}
const text = page => page.evaluate(() => document.querySelector("#main-content")?.innerText || "");
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {}); };
async function step(name, fn) {
  try { await fn(); } catch (error) { check(`${name} (step did not complete)`, false, String(error?.message || error).split("\n")[0]); }
}

async function evaluateCard(page, card, price = card.price) {
  const form = page.locator("#main-content [data-staging-evaluation-form]");
  await form.waitFor({ state: "visible", timeout: 15000 });
  if (card) {
    await form.locator('[name="externalListingId"]').fill(card.listing);
    await form.locator('[name="marketplace"]').selectOption("EBAY");
    await form.locator('[name="cardIdentity"]').fill(card.identity);
    await form.locator('[name="listingUrl"]').fill(`https://www.ebay.com/itm/${Math.abs([...card.listing].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}`);
  }
  await form.locator('[name="itemPrice"]').fill(price);
  await form.locator('[name="acknowledgeBoundary"]').check();
  await form.locator('button[type="submit"]').click();
  const result = page.locator("#main-content .staging-evaluation-result");
  await result.waitFor({ state: "visible", timeout: 30000 });
  const decision = (await result.locator(".panel-header .staging-status").first().innerText()).trim().toUpperCase();
  const href = await result.locator('a[href^="#/opportunities/"]').last().getAttribute("href");
  return { decision, id: decodeURIComponent(String(href || "").replace("#/opportunities/", "")) };
}

// ---------------- Phase 5 Customer Intelligence (FlipForge2 PHASE5_CUSTOMER_INTELLIGENCE_CONTRACT) ----------------
// Runs against the scenarios the journey server seeds for journey-phase5-alpha (contract section 5): one-sale and
// few-sales withheld, mixed live + independent, multi-sale, independent single sale, D7 / D14 / D30 timeline states and
// movements; journey-phase5-bravo checks isolation. The seeded decisions are found from the account's own saved list
// (by their markers), so the script does not depend on seeded ids. When the server seeds nothing for Phase 5 the
// section is skipped with a note, unless JOURNEY_PHASE5_REQUIRED=1.
const P5_LABEL = /^Based on [1-3] sales?: value withheld$/;
const P5_MOVEMENT = { INCREASED: "Supported market estimate increased", DECREASED: "Supported market estimate decreased",
  UNCHANGED: "Supported market estimate unchanged (within 5%)", UNAVAILABLE: "Supported market estimate unavailable", NOT_YET_AVAILABLE: "Not yet available" };
const P5_FORBIDDEN = /\breturns?\b|\breturned\b|profit made|\bgains?\b|\bgained\b/i;
const p5Dollars = value => [...String(value).matchAll(/\$\s?(\d[\d,]*(?:\.\d{2})?)/g)].map(m => Number(m[1].replace(/,/g, "")));
const p5Withheld = record => Boolean(record) && /^(SINGLE_PROVIDER_SALE_BASIS|FEW_PROVIDER_SALES_BASIS)$/.test(String(record.valuesWithheld || record.governedDecision?.valuesWithheld || ""));
const p5Label = record => {
  const label = String(record?.valuesWithheldLabel || record?.governedDecision?.valuesWithheldLabel || "");
  if (P5_LABEL.test(label)) return label;
  const n = Number(record?.withheldBasisSales ?? record?.governedDecision?.withheldBasisSales);
  return n >= 2 && n <= 3 ? `Based on ${n} sales: value withheld` : "Based on 1 sale: value withheld";
};
async function p5Get(page, path) {
  return page.evaluate(async p => {
    const response = await fetch(p, { headers: { Accept: "application/json", "X-Correlation-Id": `p5-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` }, credentials: "same-origin", cache: "no-store" });
    let body = null;
    try { body = await response.json(); } catch (_) { body = null; }
    return { status: response.status, body };
  }, path);
}

async function phase5Journey() {
  const required = process.env.JOURNEY_PHASE5_REQUIRED === "1";
  const alphaPricesById = new Map(); // alpha's own checkpoint and baseline prices, to prove bravo never sees them
  const pageTexts = [];
  const a = await session("p5a");
  let items = [];
  await step("Phase 5 seed", async () => {
    await go(a.page, "opportunities", 2500);
    const list = await p5Get(a.page, "/api/v1/opportunities");
    items = Array.isArray(list.body?.data?.items) ? list.body.data.items : [];
    notes.push(`phase5: ${items.length} saved decisions for journey-phase5-alpha (${items.map(i => `${i.id}:${i.recommendation}${p5Withheld(i) ? ":withheld" : ""}`).join(", ")})`);
  });
  if (!items.length) {
    check("P5-0 the journey server seeded the Phase 5 scenarios for journey-phase5-alpha", !required, "no saved decisions for the Phase 5 tenant");
    await a.context.close();
    return;
  }
  const withheld = items.filter(p5Withheld);
  const open = items.filter(i => !p5Withheld(i));
  check("P5-0 the seed includes a withheld decision and one whose values are shown", withheld.length > 0 && open.length > 0, `${withheld.length} withheld, ${open.length} shown`);
  for (const verdict of ["BUY", "WATCH", "VERIFY", "PASS"]) {
    if (!items.some(i => String(i.recommendation || "").toUpperCase() === verdict)) notes.push(`phase5: no seeded ${verdict} decision`);
  }

  // Saved decisions list: every withheld row reads its label, keeps its verdict, shows no figure but the ask.
  await step("Phase 5 saved list", async () => {
    await go(a.page, "opportunities", 3000);
    for (const item of withheld) {
      const row = await a.page.evaluate(id => [...document.querySelectorAll("#main-content tr, #main-content article, #main-content li")]
        .find(n => n.querySelector(`a[href="#/opportunities/${CSS.escape(encodeURIComponent(id))}"], a[href="#/opportunities/${CSS.escape(id)}"]`))?.innerText || "", item.id);
      check(`P5-L ${item.id}: the saved list reads "${p5Label(item)}" with its verdict`, row.includes(p5Label(item)) && row.toUpperCase().includes(String(item.recommendation).toUpperCase()), row.replace(/\s+/g, " ").slice(0, 200));
    }
  });

  // Decision Receipt and Tracking timeline for every seeded decision.
  for (const item of items) {
    await step(`Phase 5 receipt ${item.id}`, async () => {
      const id = encodeURIComponent(item.id);
      const detail = await p5Get(a.page, `/api/v1/lifecycle/${id}`);
      const timeline = detail.body?.data?.outcomeTimeline;
      const prices = [];
      if (Number.isFinite(timeline?.originalDecision?.baselineSupportedValueCents)) prices.push(timeline.originalDecision.baselineSupportedValueCents / 100);
      for (const c of Array.isArray(timeline?.checkpoints) ? timeline.checkpoints : []) if (Number.isFinite(c.evidence?.observedValueCents)) prices.push(c.evidence.observedValueCents / 100);
      alphaPricesById.set(String(item.id), prices);
      await go(a.page, `opportunities/${id}`, 0);
      await a.page.waitForSelector("#main-content [data-ff-journey]", { timeout: 15000 }).catch(() => {});
      if (timeline?.available === true) await a.page.waitForSelector("#main-content [data-ff-outcome-timeline]", { timeout: 15000 }).catch(() => {});
      await a.page.waitForTimeout(1000);
      const t = await text(a.page);
      pageTexts.push(t);
      check(`P5-R ${item.id}: verdict and exact card identity shown`, t.toUpperCase().includes(String(item.recommendation).toUpperCase()) && t.includes(String(item.title || item.cardIdentity || "").slice(0, 24)));
      if (p5Withheld(item)) {
        const label = p5Label(item);
        const cells = await a.page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-value-withheld]")].map(n => n.innerText.trim()));
        check(`P5-W ${item.id}: "${label}" in place of every value`, t.includes(label) && cells.length > 0 && cells.every(c => P5_LABEL.test(c)), JSON.stringify(cells));
        check(`P5-W ${item.id}: no Max Buy / buying limit, no profit or ROI figure, never $0`, await a.page.locator("#main-content [data-max-buy-at-decision]").count() === 0
          && !/Max Buy\s*\$\d/i.test(t) && !/(profit|ROI)[^\n]{0,40}[$%]\s?\d/i.test(t) && !/\$0\.00/.test(t), (t.match(/.{0,40}(Max Buy|profit|ROI|\$0\.00).{0,30}/i) || [""])[0]);
        const allowed = new Set([Number(item.ask)]);
        if (Number.isFinite(Number(item.governedDecision?.allInAskCents))) allowed.add(Number(item.governedDecision.allInAskCents) / 100);
        for (const c of Array.isArray(timeline?.checkpoints) ? timeline.checkpoints : []) {
          if (c.state === "PRICE_OBSERVED" && Number.isFinite(c.evidence?.observedValueCents)) allowed.add(c.evidence.observedValueCents / 100);
          for (const r of Array.isArray(c.customerReports) ? c.customerReports : []) if (Number.isFinite(r.reportedPriceCents)) allowed.add(r.reportedPriceCents / 100);
          if (Number.isFinite(c.comparisonToBaseline?.changeCents)) allowed.add(Math.abs(c.comparisonToBaseline.changeCents) / 100);
          if (Number.isFinite(c.comparisonToPrior?.changeCents)) allowed.add(Math.abs(c.comparisonToPrior.changeCents) / 100);
        }
        const shown = [...new Set(p5Dollars(t))];
        check(`P5-W ${item.id}: no dollar figure but the customer's own amounts and independently confirmed prices`, shown.every(v => allowed.has(v)), `${shown.join(",")} allowed ${[...allowed].join(",")}`);
      }
      if (timeline?.available === true) {
        const states = await a.page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-outcome-timeline] [data-ff-otl-state]")].map(e => e.getAttribute("data-ff-otl-state")));
        check(`P5-T ${item.id}: the D7 / D14 / D30 timeline shows the server's three states`, states.join("|") === timeline.checkpoints.map(c => c.state).join("|"), states.join("|"));
        const streams = await a.page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-outcome-timeline] .ff-otl-checkpoint")].map(cp =>
          [...cp.querySelectorAll("[data-ff-otl-stream]")].map(s => ({ s: s.getAttribute("data-ff-otl-stream"), m: s.getAttribute("data-ff-otl-movement") || "", v: s.querySelector("dd > strong")?.innerText.trim() || "" }))));
        check(`P5-T ${item.id}: streams A / B / C shown apart at every checkpoint`, streams.length === 3 && streams.every(l => l.map(x => x.s).join("") === "ABC"), JSON.stringify(streams[0]));
        if (/-v([2-9]|\d{2,})$/.test(String(timeline.version || ""))) {
          const expected = timeline.checkpoints.map(c => c.streams?.derivedMarketEstimate?.movement || "");
          check(`P5-T ${item.id}: stream A movement in "supported market estimate" wording`, streams.every((l, i) => l[0].m === expected[i] && l[0].v === P5_MOVEMENT[expected[i]]),
            streams.map(l => `${l[0]?.m}:${l[0]?.v}`).join(" | "));
          const tl = await a.page.evaluate(() => document.querySelector("#main-content [data-ff-outcome-timeline]")?.innerText || "");
          check(`P5-T ${item.id}: no return / profit / gain wording; verification stated`, !P5_FORBIDDEN.test(tl)
            && (typeof timeline.verification?.needed !== "boolean" || /verification needed/i.test(tl)), (tl.match(/.{0,30}(returns?|gains?|profit made).{0,20}/i) || [""])[0]);
        }
      } else {
        notes.push(`phase5: ${item.id} has no available outcome timeline (${timeline?.status || detail.status})`);
      }
      const journey = await a.page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-journey] li")].map(li => li.getAttribute("data-ff-journey-step")).join(","));
      check(`P5-J ${item.id}: the journey strip is on the Decision Receipt`, journey === "discover,evaluate,save,receipt,track,review,portfolio,alerts,heat", journey);
    });
  }

  // Click through the journey from a withheld decision: Track → Review → Portfolio → Alerts → Forge Heat → back.
  await step("Phase 5 journey click-through", async () => {
    const item = withheld[0] || open[0];
    const id = encodeURIComponent(item.id);
    await go(a.page, `opportunities/${id}`, 0);
    await a.page.waitForSelector("#main-content [data-ff-journey]", { timeout: 15000 });
    const click = async (step, hash, ready) => {
      await a.page.locator(`#main-content [data-ff-journey] [data-ff-journey-step="${step}"] a`).click();
      await a.page.waitForFunction(h => location.hash === h, hash, { timeout: 8000 }).catch(() => {});
      if (ready) await a.page.waitForSelector(ready, { timeout: 15000 }).catch(() => {});
      await a.page.waitForTimeout(1200);
      return a.page.evaluate(() => location.hash);
    };
    check("P5-J Track opens the card's tracking timeline", await click("track", `#/tracking/${id}`, "#main-content [data-lifecycle-form]") === `#/tracking/${id}`);
    await click("review", `#/tracking/${id}`, "#main-content [data-lifecycle-form]");
    check("P5-J Review lands on the tracking form (record what you did)", await a.page.evaluate(() => Boolean(document.activeElement?.closest("[data-lifecycle-form]"))));
    for (const [step, hash] of [["portfolio", "#/portfolio"], ["alerts", "#/alerts"], ["heat", "#/forge-heat"]]) {
      check(`P5-J ${step} opens from the journey strip`, await click(step, hash, "#main-content [data-ff-journey]") === hash);
      const t = await text(a.page);
      pageTexts.push(t);
      check(`P5-W ${step}: never "$0" and no Max Buy next to a withheld card`, !/\$0\.00/.test(t) && !withheld.some(w => {
        const title = String(w.title || w.cardIdentity || "");
        const at = title ? t.indexOf(title) : -1;
        return at >= 0 && /Max Buy\s*\$\d/.test(t.slice(at, at + 400));
      }), (t.match(/.{0,40}\$0\.00.{0,20}/) || [""])[0]);
      if (step === "heat") {
        const ranked = await a.page.evaluate(() => [...document.querySelectorAll("#main-content .ff-heat-table a[href^='#/opportunities/'], #main-content [data-ff-heat-control-room] a[href^='#/opportunities/']")]
          .filter(x => !x.closest("[data-forge-heat-withheld], [data-ff-journey]")).map(x => decodeURIComponent(x.getAttribute("href").replace("#/opportunities/", ""))));
        check("P5-W Forge Heat ranks no withheld decision and never overrides one", !ranked.some(r => withheld.some(w => w.id === r)) && !/Forge Heat (?:overrides|changes the verdict)/i.test(t), ranked.join(","));
      }
    }
    check("P5-J back to the same Decision Receipt", await click("receipt", `#/opportunities/${id}`, "#main-content [data-ff-journey]") === `#/opportunities/${id}`);
    check("P5-X no page errors in the Phase 5 journey", a.errors.length === 0, a.errors.join(" | "));
    // Contract section 5: the withheld values of the seeded decisions never appear anywhere.
    const sentinels = String(process.env.JOURNEY_PHASE5_WITHHELD_SENTINELS || "517.43,498.00").split(",").map(x => x.trim()).filter(Boolean);
    const leaked = sentinels.filter(v => pageTexts.some(t => t.includes(v)));
    check("P5-W no withheld seed value appears on any Phase 5 screen", leaked.length === 0, leaked.join(","));
  });

  // Settled screens on the Phase 5 routes.
  await step("Phase 5 render stability", async () => {
    const item = withheld[0] || open[0];
    const id = encodeURIComponent(item.id);
    const rows = await measureRoutes(a.page, APP, [`opportunities/${id}`, `tracking/${id}`, "portfolio", "alerts", "forge-heat", "market-view"], { settleMs: 4000, idleMs: 4000 });
    printRows("phase5", rows);
    for (const row of rows) check(`P5-RS ${row.route}: settles with no idle redraws or requests`, !row.error && row.idle.records <= 5 && row.idle.fetches === 0,
      row.error || `${row.idle.records} mutations, ${row.idle.fetches} requests idle`);
  });
  await a.context.close();

  // Another account cannot open journey-phase5-alpha's decisions. An id that only alpha has is 404 for bravo and renders
  // a plain not-found state; an id both accounts have (contract section 5: the shared multi-sale id, EBAY-p5-* style) shows bravo's own decision
  // and nothing of alpha's (no alpha verdict or alpha checkpoint price).
  await step("Phase 5 isolation", async () => {
    const b = await session("p5b");
    await go(b.page, "opportunities", 2000);
    const bravoList = await p5Get(b.page, "/api/v1/opportunities");
    const bravo = new Map((Array.isArray(bravoList.body?.data?.items) ? bravoList.body.data.items : []).map(i => [String(i.id), i]));
    const onlyAlpha = items.filter(i => !bravo.has(String(i.id)));
    const shared = items.filter(i => bravo.has(String(i.id)));
    check("P5-I at least one alpha-only decision to test isolation with", onlyAlpha.length > 0, `${onlyAlpha.length} alpha-only, ${shared.length} shared ids`);
    for (const item of onlyAlpha.slice(0, 3)) {
      const id = encodeURIComponent(item.id);
      const api = await p5Get(b.page, `/api/v1/opportunities/${id}`);
      check(`P5-I ${item.id}: another account gets 404 from the API`, api.status === 404, String(api.status));
      const lifecycleApi = await p5Get(b.page, `/api/v1/lifecycle/${id}`);
      check(`P5-I ${item.id}: another account gets 404 for its tracking timeline`, lifecycleApi.status === 404, String(lifecycleApi.status));
      for (const route of [`opportunities/${id}`, `tracking/${id}`]) {
        await go(b.page, route, 3500);
        const t = await text(b.page);
        check(`P5-I ${item.id} ${route.split("/")[0]}: renders a not-found state with nothing of the card`, !/value withheld/.test(t)
          && await b.page.locator("#main-content [data-ff-outcome-timeline]").count() === 0
          && /not found|couldn.t find|could not be found|isn.t in your account|no saved decision|not available|unavailable/i.test(t), t.replace(/\s+/g, " ").slice(0, 200));
      }
    }
    for (const item of shared) {
      const id = encodeURIComponent(item.id);
      const own = bravo.get(String(item.id));
      await go(b.page, `opportunities/${id}`, 4000);
      const t = await text(b.page);
      check(`P5-I ${item.id}: the shared id shows the other account's own decision (${own.recommendation})`, t.toUpperCase().includes(String(own.recommendation).toUpperCase()), t.slice(0, 200));
      const alphaPrices = (alphaPricesById.get(String(item.id)) || []).filter(v => !p5Dollars(JSON.stringify(own)).includes(v));
      check(`P5-I ${item.id}: none of the first account's checkpoint prices are shown`, !p5Dollars(t).some(v => alphaPrices.includes(v)), alphaPrices.join(","));
    }
    await shot(b.page, "p5-11-other-account");
    check("P5-I no page errors for the other account", b.errors.length === 0, b.errors.join(" | "));
    await b.context.close();
  });

  // Desktop, tablet and phone: the withheld receipt and its tracking page.
  for (const [label, viewport, extra] of [["desktop", { width: 1440, height: 900 }, {}], ["tablet", { width: 834, height: 1112 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["phone", { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    await step(`Phase 5 viewport ${label}`, async () => {
      const s = await session("p5a", viewport, extra);
      const item = withheld[0] || open[0];
      const id = encodeURIComponent(item.id);
      for (const hash of [`opportunities/${id}`, `tracking/${id}`, "portfolio", "forge-heat"]) {
        await go(s.page, hash, 4000);
        const o = await s.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`P5-V ${label} ${hash.split("/")[0]}: no horizontal overflow`, o <= 2, String(o));
        await shot(s.page, `p5-${label}-${hash.split("/")[0]}`);
      }
      check(`P5-V ${label}: no page errors`, s.errors.length === 0, s.errors.join(" | "));
      await s.context.close();
    });
  }
}

const saved = {};
// JOURNEY_ONLY_PHASE5=1 runs only the Phase 5 section (local development against a Phase 5-only server).
const ONLY_PHASE5 = process.env.JOURNEY_ONLY_PHASE5 === "1";
try {
  journey: {
  if (ONLY_PHASE5) break journey;
  const { context, page, errors } = await session("a");

  // ---------------- Discover ----------------
  await step("Discover", async () => {
    await go(page, "discover", 3000);
    const t = await text(page);
    check("D1 Discover opens for a signed-in customer", /Discover/i.test(t) && !/Lifecycle unavailable/.test(t), t.slice(0, 200));
    await shot(page, "01-discover");
  });

  // ---------------- Evaluate and save ----------------
  await step("Evaluate", async () => {
    await go(page, "evaluate", 2500);
    for (const key of ["strong", "second", "thin"]) {
      if (key !== "strong") await go(page, "evaluate", 2500);
      saved[key] = await evaluateCard(page, CARDS[key]);
      notes.push(`${key}: ${saved[key].decision} (${saved[key].id})`);
      if (key === "strong") await shot(page, "02-evaluate-result");
    }
    console.log("DECISIONS", JSON.stringify(saved));
    check("E1 three cards evaluated and saved to the account", Object.values(saved).every(s => s.id && /^(BUY|WATCH|VERIFY|PASS)$/.test(s.decision)), JSON.stringify(saved));
    check("E2 deep exact evidence at a low ask is BUY", saved.strong.decision === "BUY", saved.strong.decision);
    check("E3 one exact sale is never BUY", saved.thin.decision !== "BUY", saved.thin.decision);
  });

  // ---------------- Saved decision and receipt ----------------
  await step("Saved decision", async () => {
    await go(page, `opportunities/${encodeURIComponent(saved.strong.id)}`, 3500);
    const t = await text(page);
    check("S1 the saved decision opens with its verdict and the ask when evaluated", /BUY/.test(t) && /Ask when evaluated/i.test(t) && /\$300\.00/.test(t), t.slice(0, 300));
    check("S2 the saved decision offers Track and Re-evaluate this listing", await page.locator('#main-content a[href^="#/tracking/"]').count() > 0
      && await page.locator("#main-content [data-card-reevaluate]").count() === 1);
    await shot(page, "03-saved-decision");
    await go(page, "opportunities", 3000);
    const list = await text(page);
    check("S3 the saved list shows all three cards", Object.values(CARDS).every(c => list.includes(c.identity.split(" #")[0].slice(0, 20))), list.slice(0, 300));
  });

  // ---------------- Track with a reminder ----------------
  await step("Track", async () => {
    await go(page, `tracking/${encodeURIComponent(saved.strong.id)}`, 3500);
    const form = page.locator("#main-content [data-lifecycle-form]");
    await form.waitFor({ state: "visible", timeout: 15000 });
    await form.locator('[name="trackingStatus"]').selectOption("WATCHING");
    const past = new Date(Date.now() - 2 * 3600_000);
    const pad = n => String(n).padStart(2, "0");
    await form.locator('[name="reviewAt"]').fill(`${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`);
    await form.locator('[name="alertEnabled"]').check();
    await form.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    check("T1 tracking with a review reminder is saved", /saved to your account/i.test(await text(page)), (await text(page)).slice(0, 200));
  });

  // ---------------- Re-evaluate from the saved decision ----------------
  let maxBuyText = "";
  await step("Re-evaluate", async () => {
    await go(page, `opportunities/${encodeURIComponent(saved.strong.id)}`, 3500);
    const maxBuyCell = await page.locator("#main-content [data-max-buy-at-decision]").first().innerText().catch(() => "");
    maxBuyText = (maxBuyCell.match(/\$([0-9,]+\.\d{2})/) || [])[1] || "";
    check("S4 the saved decision shows its Max Buy", Boolean(maxBuyText), (await text(page)).slice(0, 300));
    // Identity is the exact-card check the decision recorded (FlipForge2#970 governedDecision.exactIdentityBasis), not the
    // provider catalog link: a new BUY recorded it as confirmed, so it reads "Confirmed when saved" with no disclosure.
    const identityLine = value => (value.match(/Identity status: ([^\n·]+)/) || [])[1]?.trim() || "";
    const strongText = await text(page);
    check("S5 the saved BUY shows the identity check it recorded (Confirmed when saved), not the catalog link", identityLine(strongText) === "Confirmed when saved"
      && await page.locator("#main-content [data-ff-identity-basis]").count() === 0, identityLine(strongText) || strongText.slice(0, 200));
    await go(page, `opportunities/${encodeURIComponent(saved.thin.id)}`, 3500);
    const thinText = await text(page);
    check("S6 the VERIFY decision shows its recorded identity check and no BUY identity disclosure", ["Confirmed when saved", "Not confirmed when saved", "Not recorded (earlier rules)"].includes(identityLine(thinText))
      && await page.locator("#main-content [data-ff-identity-basis]").count() === 0, identityLine(thinText) || thinText.slice(0, 200));
    // A VERIFY decision sets no buying limit: the saved-decision page shows no Max Buy, whatever the receipt recorded.
    check("S6a the VERIFY decision shows no Max Buy", await page.locator("#main-content [data-max-buy-at-decision]").count() === 0
      && !/Max Buy \$[0-9]/.test(thinText), thinText.slice(0, 300));
    await go(page, `opportunities/${encodeURIComponent(saved.strong.id)}`, 3500);
    await page.locator("#main-content [data-card-reevaluate]").click();
    await page.waitForSelector("#main-content .ff-reevaluation-banner[data-reevaluation-state=\"ready\"]", { timeout: 15000 });
    const form = page.locator("#main-content [data-staging-evaluation-form]");
    const prefilled = { listing: await form.locator('[name="externalListingId"]').inputValue(), card: await form.locator('[name="cardIdentity"]').inputValue(),
      price: await form.locator('[name="itemPrice"]').inputValue(), ack: await form.locator('[name="acknowledgeBoundary"]').isChecked() };
    check("R1 Re-evaluate opens the form prefilled with what was entered last time", prefilled.listing === CARDS.strong.listing
      && prefilled.card === CARDS.strong.identity && prefilled.price === "300.00" && prefilled.ack === false, JSON.stringify(prefilled));
    await shot(page, "04-reevaluate-prefilled");
    const maxBuy = Number(maxBuyText.replace(/,/g, "")) || 450;
    const newPrice = (maxBuy + 25).toFixed(2);
    notes.push(`saved Max Buy ${maxBuyText || "(not read)"}; re-evaluated at ${newPrice}`);
    const again = await evaluateCard(page, null, newPrice);
    check("R2 the re-evaluation lands on the same saved decision", again.id === saved.strong.id, `${again.id} vs ${saved.strong.id}`);
    check("R3 above its saved Max Buy the card is no longer BUY", again.decision !== "BUY", again.decision);
    saved.strongAgain = again;
  });

  // ---------------- What changed ----------------
  await step("What changed", async () => {
    // Wait for the card's history (not a fixed pause), and record how long it took to appear after re-evaluation.
    const started = Date.now();
    await go(page, `tracking/${encodeURIComponent(saved.strong.id)}`, 0);
    const appeared = await page.waitForFunction(() => /Saved decision 2/.test(document.querySelector("#main-content .customer-decision-timeline-panel")?.innerText || ""),
      null, { timeout: 15000 }).then(() => true, () => false);
    const elapsed = Date.now() - started;
    notes.push(`Decision Timeline with the re-evaluation appeared in ${elapsed} ms`);
    const timeline = await page.evaluate(() => document.querySelector("#main-content .customer-decision-timeline-panel")?.innerText || "");
    if (!appeared) notes.push(`Tracking page after 15 s: ${(await text(page)).slice(0, 400)}`);
    check("W0 the card's Decision Timeline appears within 15 seconds of re-evaluating", appeared, `${elapsed} ms`);
    check("W1 history shows the original decision first, unchanged, and the re-evaluation", /T0 · Original saved decision/.test(timeline)
      && /Saved decision 2/.test(timeline) && /\$300\.00/.test(timeline), timeline.slice(0, 400));
    check("W2 what changed is in plain words, no ISO timestamps", /What changed/.test(timeline) && /ask/i.test(timeline) && !ISO.test(timeline));
    await shot(page, "05-what-changed");
  });

  // ---------------- Alerts ----------------
  await step("Alerts", async () => {
    await go(page, "alerts", 4000);
    const t = await text(page);
    check("A1 the Max Buy crossing reads as a sentence with the saved figures", /Ask moved above your Max Buy/.test(t) && /saved Max Buy \$/.test(t), t.slice(0, 400));
    check("A2 the due reminder and the decision change are listed", /Your scheduled review is due/.test(t) && /Decision changed from BUY to /.test(t), t.slice(0, 400));
    check("A3 no raw codes and no ISO timestamps", !RAW.test(t) && !ISO.test(t), (t.match(RAW) || t.match(ISO) || [""])[0]);
    check("A4 the delivery boundary is visible", /Email \/ push delivery is not connected/.test(t));
    await shot(page, "06-alerts");
    const crossing = page.locator('#main-content .ff-alert-card[data-alert-kind="MAX_BUY_CROSSED"] [data-alert-review]');
    await crossing.click();
    await page.waitForTimeout(2000);
    await page.evaluate(() => document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }));
    const reviewedText = await page.evaluate(() => document.querySelector("#main-content .ff-alerts-reviewed")?.innerText || "");
    check("A5 Mark as reviewed moves the alert to Reviewed, saved on the server", /Ask moved above your Max Buy/.test(reviewedText), reviewedText.slice(0, 200));
    await page.locator("#main-content [data-alerts-seen]").click();
    await page.waitForTimeout(2000);
    check("A6 Mark all as seen clears New and keeps items open", await page.locator('#main-content .ff-alert-card[data-new="true"]').count() === 0
      && /New since you last marked alerts as seen/.test(await text(page)));
    await go(page, "alerts", 3500);
    await page.evaluate(() => document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }));
    check("A7 review and seen state persist after reload", /Reviewed \(1\)/.test(await text(page)) && await page.locator('#main-content .ff-alert-card[data-new="true"]').count() === 0);
    await shot(page, "07-alerts-reviewed");
    await page.locator('#main-content .ff-alert-card[data-alert-kind="DECISION_CHANGED"] a[href^="#/tracking/"]').first().click();
    await page.waitForTimeout(3000);
    check("A8 an alert links to the card's history", /Decision Timeline/.test(await text(page)));
  });

  // ---------------- Own → Portfolio ----------------
  await step("Portfolio", async () => {
    await go(page, `tracking/${encodeURIComponent(saved.strong.id)}`, 3500);
    const form = page.locator("#main-content [data-lifecycle-form]");
    await form.waitFor({ state: "visible", timeout: 15000 });
    const paid = (Number(maxBuyText.replace(/,/g, "")) > 0 ? Number(maxBuyText.replace(/,/g, "")) + 25 : 475).toFixed(2);
    await form.locator('[name="trackingStatus"]').selectOption("OWNED");
    // The outcome follows the tracking status in the customer app (the select is hidden); set it only if shown.
    if (await form.locator('[name="outcomeStatus"]').isVisible()) await form.locator('[name="outcomeStatus"]').selectOption("ACQUIRED");
    await form.locator('[name="acquisitionCost"]').fill(paid);
    const d = new Date(Date.now() - 86_400_000);
    await form.locator('[name="acquiredAt"]').fill(d.toISOString().slice(0, 10));
    // The review reminder stays on: owning a card does not silence its alerts.
    await form.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    check("P1 marking the card owned with what was paid is saved", /saved to your account/i.test(await text(page)), (await text(page)).slice(0, 200));
    await go(page, "portfolio", 5000);
    const t = await text(page);
    check("P2 Portfolio shows the owned card and what was paid", t.includes("Pete Alonso") && t.includes(`$${Number(paid).toLocaleString("en-US", { minimumFractionDigits: 2 })}`), t.slice(0, 400));
    check("P3 Portfolio shows the saved verdict and Max Buy at decision, and that the price paid was over it",
      /Max Buy \$[0-9,]+\.\d{2} at decision/.test(t) && /over it/i.test(t), t.slice(0, 600));
    const attention = await page.evaluate(id => [...document.querySelectorAll(`[data-portfolio-attention-card="${id}"]`)].map(li => li.innerText.replace(/\s+/g, " ")), saved.strong.id);
    check("P4 owned cards that need a look list its open alerts (reminder due, decision changed), each linking to the decision and Alerts",
      attention.length >= 2 && attention.some(t => /Your scheduled review is due/.test(t)) && attention.some(t => /Decision changed from BUY to/.test(t))
        && await page.locator(`[data-portfolio-attention-card="${saved.strong.id}"] a[href="#/alerts"]`).count() === attention.length
        && await page.locator(`[data-portfolio-attention-card="${saved.strong.id}"] a[href="#/opportunities/${encodeURIComponent(saved.strong.id)}"]`).count() === attention.length,
      attention.join(" | "));
    check("P4a the alert already marked reviewed is not repeated on Portfolio", !attention.some(t => /Ask moved above your Max Buy/.test(t)), attention.join(" | "));
    check("P5 no raw codes on Portfolio", !RAW.test(t));
    await shot(page, "08-portfolio");
  });

  // ---------------- Forge Heat ----------------
  await step("Forge Heat", async () => {
    await go(page, "forge-heat", 5000);
    await page.evaluate(() => document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }));
    const t = await text(page);
    const rankedIds = await page.evaluate(() => [...document.querySelectorAll("#main-content .ff-heat-table a[href^='#/opportunities/']")].map(a => decodeURIComponent(a.getAttribute("href").replace("#/opportunities/", ""))));
    check("H1 Forge Heat states it ranks by room under the saved Max Buy", /Room under Max Buy/.test(t));
    check("H2 the card now above its Max Buy is not ranked", !rankedIds.includes(saved.strong.id), rankedIds.join(","));
    check("H3 the one-sale card is never ranked", !rankedIds.includes(saved.thin.id));
    if (saved.second.decision === "BUY") {
      check("H4 the second BUY is ranked with its Max Buy and room under it", rankedIds.includes(saved.second.id) && /Under Max Buy/i.test(t), rankedIds.join(","));
    } else {
      notes.push(`second card was ${saved.second.decision}; H4 not applicable`);
    }
    check("H5 reasons and lists are in plain words", !RAW.test(t), (t.match(RAW) || [""])[0]);
    check("H6 Forge Heat says it ranks saved evaluations, not live prices", /saved evaluation/i.test(t));
    await shot(page, "09-forge-heat");
  });
  check("X1 no page errors in the whole journey", errors.length === 0, errors.join(" | "));

  // ---------------- Render stability (idle redraws) and API capture ----------------
  await step("Render stability", async () => {
    const captured = [];
    const onResponse = async response => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith("/api/v1/")) return;
      try {
        captured.push({ method: response.request().method(), path: url.pathname + url.search, status: response.status(),
          contentType: response.headers()["content-type"] || "", body: await response.text() });
      } catch (_) {}
    };
    page.on("response", onResponse);
    const routes = ["dashboard", "discover", "evaluate", "opportunities", `opportunities/${encodeURIComponent(saved.strong.id)}`, "tracking",
      `tracking/${encodeURIComponent(saved.strong.id)}`, "alerts", "portfolio", "forge-heat", "account"];
    const rows = await measureRoutes(page, APP, routes);
    printRows(process.env.JOURNEY_STABILITY_LABEL || "journey", rows);
    // A settled screen must stop rewriting itself: no DOM changes and no API requests while nobody touches it.
    for (const row of rows) {
      check(`RS ${row.route}: settles with no idle redraws or requests`, !row.error && row.idle.records <= 5 && row.idle.fetches === 0,
        row.error || `${row.idle.records} mutations, ${row.idle.fetches} requests in 6s idle`);
    }
    page.off("response", onResponse);
    const packed = zlib.gzipSync(Buffer.from(JSON.stringify({ tenant: email, saved, captured }))).toString("base64");
    console.log(`API-CAPTURE-BEGIN ${packed.length}`);
    for (let i = 0; i < packed.length; i += 4000) console.log(`API-CAPTURE ${packed.slice(i, i + 4000)}`);
    console.log("API-CAPTURE-END");
    if (SHOTS) fs.writeFileSync(`${SHOTS}/render-stability.json`, JSON.stringify(rows, null, 2));
  });

  // ---------------- Failed backend request ----------------
  await step("Failure", async () => {
    await page.route("**/api/v1/alerts", r => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "AUTHORITY_UNAVAILABLE", message: "The authoritative service is unavailable." } }) }));
    await go(page, "alerts", 3000);
    const t = await text(page);
    check("F1 a failed Alerts request shows a plain error, not stale or invented alerts", /unavailable/i.test(t) && !/Ask moved above your Max Buy/.test(t), t.slice(0, 200));
    await page.unroute("**/api/v1/alerts");
    await shot(page, "10-alerts-failure");
  });
  await context.close();

  // ---------------- Another account ----------------
  await step("Isolation", async () => {
    const b = await session("b");
    await go(b.page, "alerts", 3500);
    const alertsB = await text(b.page);
    check("I1 another account sees none of the first account's alerts", !/Pete Alonso|Ask moved above/.test(alertsB) && /Nothing needs your review/.test(alertsB), alertsB.slice(0, 200));
    await go(b.page, `opportunities/${encodeURIComponent(saved.strong.id)}`, 3500);
    const cardB = await text(b.page);
    check("I2 another account cannot open the first account's saved decision", !/Pete Alonso/.test(cardB), cardB.slice(0, 200));
    await go(b.page, "portfolio", 3500);
    check("I3 another account's Portfolio is empty", !/Pete Alonso/.test(await text(b.page)));
    await go(b.page, `evaluate/${encodeURIComponent(saved.strong.id)}`, 3500);
    const formB = await b.page.locator('#main-content [name="cardIdentity"]').inputValue().catch(() => "");
    check("I4 another account gets no prefill for the first account's listing", formB === "", formB);
    await shot(b.page, "11-other-account-alerts");
    await b.context.close();
  });

  // ---------------- Tablet and phone ----------------
  for (const [label, viewport] of [["tablet", { width: 820, height: 1180 }], ["phone", { width: 390, height: 844 }]]) {
    await step(`Viewport ${label}`, async () => {
      const s = await session("a", viewport, label === "phone" ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {});
      for (const hash of ["alerts", "portfolio", "forge-heat", `opportunities/${encodeURIComponent(saved.strong.id)}`, `tracking/${encodeURIComponent(saved.strong.id)}`]) {
        await go(s.page, hash, 3500);
        const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const t = await text(s.page);
        check(`V ${label} ${hash.split("/")[0]}: renders with no horizontal page overflow`, overflow <= 2 && t.length > 50, String(overflow));
        await shot(s.page, `12-${label}-${hash.split("/")[0]}`);
      }
      check(`V ${label}: no page errors`, s.errors.length === 0, s.errors.join(" | "));
      await s.context.close();
    });
  }
  }
  await phase5Journey();
} finally {
  await browser.close();
}

console.log("NOTES", JSON.stringify(notes));
console.log("Integrated customer journey (browser, real gateway, real DEV backend)");
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure}`);
// CI logs are not always readable from the other repository: failures and the Phase 5 summary are also annotations.
if (process.env.GITHUB_ACTIONS) {
  const p5 = [passes.filter(x => /^P5-/.test(x)).length, failures.filter(x => /^(P5-|Phase 5)/.test(x)).length];
  console.log(`::notice title=journey-phase5::Phase 5 section: ${p5[0]} passed, ${p5[1]} failed. ${notes.filter(n => n.startsWith("phase5")).join(" ").slice(0, 700)}`);
  for (const failure of failures.slice(0, 40)) console.log(`::error title=journey::${failure.replace(/\r?\n/g, " ").slice(0, 900)}`);
}
if (failures.length) process.exitCode = 1;
