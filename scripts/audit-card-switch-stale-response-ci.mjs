// A response for a card the customer has left must never replace the card they are viewing.
//
// Pre-existing defect found 2026-10-13 on /app/beta: open a card, switch to another before the first loads, and the
// first card's late response replaced the page - the Ohtani PSA 9 WATCH link ended up showing the Ohtani PSA 10 BUY
// card. customer-opportunities.js had no request guard and painted a record that had failed validation.
//
// Full app shell (every script), only server responses controlled. Every animation frame records which saved card is
// on screen (hero title, verdict, ask, supported value) against the card in the address bar. Rules:
//   - a card on screen must be the card in the address bar; previous-card details must be gone once the URL changes
//     in the frame after the address bar changes (50 ms allowance; measured: 0 ms);
//   - nothing from another card (title, verdict, price) may appear after the target card has loaded, including when
//     slower responses for cards the customer left arrive later, out of order, or fail.
// Scenarios: out-of-order arrival, three overlapping requests, abandoned failure, failure of the current card, slow
// current card after a loaded one, rapid switching among BUY/WATCH/VERIFY/PASS with out-of-order delays, and switching
// across renderers (slow Dashboard -> card, slow card -> Dashboard).
// Synthetic fixtures only: no network, no provider calls.
import { chromium } from "playwright";
import {
  prepaintRecorderInit, drainFrames, CARD_FRAME_SAMPLE, frameViolations, describeViolations,
  matrixFromEnv, launchOptions, newMatrixContext, assertNavigationApi
} from "./lib/prepaint-frame-recorder.mjs";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const email = "saved-verdict-loading-audit@flipforge.test";
const SLOW_MS = 10_500;
const VERDICTS = ["BUY", "WATCH", "VERIFY", "PASS"];

const cards = {
  "qa-verdict-buy": { title: "2018 Topps Chrome Shohei Ohtani #150 PSA 10", recommendation: "BUY", ask: 1215, supportedValue: 1675, acceptedSales: 227 },
  "qa-verdict-watch": { title: "2018 Topps Chrome Shohei Ohtani #150 PSA 9", recommendation: "WATCH", ask: 760, supportedValue: 850, acceptedSales: 40 },
  "qa-verdict-verify": { title: "2018 Topps Update Ronald Acuna Jr. #US250 PSA 10", recommendation: "VERIFY", ask: 310, supportedValue: 295, acceptedSales: 2 },
  "qa-verdict-pass": { title: "2018 Prizm Luka Doncic #280 PSA 10", recommendation: "PASS", ask: 220, supportedValue: 199, acceptedSales: 9 }
};
const ids = Object.keys(cards);
const opportunity = id => ({
  id,
  title: cards[id].title,
  cardIdentity: cards[id].title,
  recommendation: cards[id].recommendation,
  ask: cards[id].ask,
  supportedValue: cards[id].supportedValue,
  confidence: 83,
  liquidity: 75,
  risk: 35,
  rank: 80,
  observedAt: "2026-10-06T23:54:44Z",
  platform: "EBAY",
  mappingState: "CONFIRMED",
  evidence: { acceptedSales: cards[id].acceptedSales }
});

// Per-scenario server behavior: delay (ms) and failure for the record endpoints of a given card.
const behavior = new Map();
const setBehavior = (id, value) => behavior.set(id, value);
const clearBehavior = () => { behavior.clear(); listDelayMs = 0; };
// Delay for the Dashboard / list endpoints (another renderer paints those routes into the same #main-content).
let listDelayMs = 0;

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "saved-verdict-loading-audit",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      generatedAt: "2026-10-13T20:00:00Z",
      evidenceFreshness: "QA_FIXTURE",
      limitations: ["Synthetic saved-verdict loading audit fixture only."]
    },
    data
  };
}

const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });

const passes = [];
const failures = [];
let lastLabel = "";
const check = (name, ok, detail = "") => {
  lastLabel = name.split(/[:(]/)[0].trim();
  (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);
};
// Every frame recorded since the session started: correct card identity and matching saved verdict, none skipped.
const moneyText = value => `$${Number(value).toLocaleString("en-US")}`;
let navigationChecked = false;
async function strictFrames(page) {
  if (!navigationChecked) {
    await assertNavigationApi(page, matrix.navigationApi);
    navigationChecked = true;
  }
  const rec = await drainFrames(page);
  const bad = frameViolations(rec.frames, cards, moneyText);
  const label = `${lastLabel} - every frame (pre-paint, ${rec.frames.length} frames)`;
  check(`${label}: correct card identity and saved verdict in every frame, no frame skipped`,
    rec.frames.length > 30 && bad.length === 0 && rec.skipped.length === 0 && rec.errors.length === 0,
    `${describeViolations(bad)}${rec.skipped.length ? ` skipped=${rec.skipped.length}` : ""}${rec.errors.length ? ` errors=${rec.errors[0]}` : ""}`);
}

const matrix = matrixFromEnv();
const browser = await chromium.launch(launchOptions());

async function newSession() {
  const context = await newMatrixContext(browser, matrix);
  const page = await context.newPage();
  // Strict pre-paint recorder: every rendered frame is sampled after the page's own pre-paint work.
  await page.addInitScript(`(${prepaintRecorderInit.toString()})(${JSON.stringify({ sampleSource: CARD_FRAME_SAMPLE })});`);
  await page.addInitScript(({ email }) => {
    localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
    // Guided Mode on and opened, so its panel title is one of the surfaces under test.
    let hash = 2166136261;
    for (const ch of email.toLowerCase()) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    const key = (hash >>> 0).toString(36);
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.welcome`, "seen");
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.enabled`, "on");

    // Frame-by-frame recorder: which saved card is on screen vs. the card in the address bar.
    const routeId = () => {
      const match = String(location.hash || "").match(/^#\/opportunities\/([^/?]+)/);
      return match ? decodeURIComponent(match[1]) : "";
    };
    window.__ffFrames = [];
    let last = "";
    // Time since the address bar changed card, measured by the sampler itself (a frame can see the new URL before the
    // hashchange event is dispatched).
    let seenId = "";
    let seenAt = 0;
    const sample = () => {
      const id = routeId();
      const routeKey = String(location.hash || "").replace(/^#\/?/, "").split("?")[0];
      if (routeKey !== seenId) { seenId = routeKey; seenAt = performance.now(); }
      {
        const hero = document.querySelector("#main-content .customer-intelligence-hero");
        const shown = hero && hero.getClientRects().length ? {
          title: String(hero.querySelector("h2")?.textContent || "").trim(),
          verdict: String(hero.querySelector(".staging-status")?.textContent || "").trim().toUpperCase(),
          ask: String(hero.querySelector(".customer-value-summary strong")?.textContent || "").trim()
        } : null;
        const error = /We couldn.t complete that request|took too long to load|did not finish loading/i.test(document.querySelector("#main-content")?.textContent || "");
        const key = `${routeKey}|${shown ? shown.title + "|" + shown.verdict + "|" + shown.ask : "none"}|${error}`;
        if (key !== last) {
          last = key;
          window.__ffFrames.push({
            at: Math.round(performance.now()),
            id,
            route: routeKey,
            since: Math.round(performance.now() - seenAt),
            renderer: [...(document.querySelector("#main-content > *")?.attributes || [])].map(a => a.name).filter(n => n.startsWith("data-")).join(" "),
            shown,
            error
          });
        }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, { email });

  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({
      getUser: () => ({ email: "${email}" }),
      getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Verdict Audit", membershipActive: true, membershipConfigured: true })
    });`
  }));
  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "(() => {})();" }));
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const correlationId = route.request().headers()["x-correlation-id"] || "saved-verdict-loading-audit";
    if (listDelayMs && ["/api/v1/health", "/api/v1/dashboard", "/api/v1/opportunities"].includes(url.pathname)) {
      await new Promise(resolve => setTimeout(resolve, listDelayMs));
    }
    if (url.pathname === "/api/v1/health") return json(route, 200, envelope(correlationId, { status: "configured" }));
    if (url.pathname === "/api/v1/opportunities") {
      return json(route, 200, envelope(correlationId, { kind: "opportunities", items: ids.map(opportunity), count: ids.length, sourceOfTruth: "SQLite", transactionAuthority: false }));
    }
    if (url.pathname === "/api/v1/dashboard") {
      return json(route, 200, envelope(correlationId, { metrics: { trackedOpportunities: ids.length, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 1 }, items: ids.map(opportunity) }));
    }
    const record = url.pathname.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor)\/([^/]+)$/);
    if (record) {
      const [, kind, encoded] = record;
      const id = decodeURIComponent(encoded);
      const plan = behavior.get(id) || {};
      if (plan.delayMs) await new Promise(resolve => setTimeout(resolve, plan.delayMs));
      if (plan.fail || !cards[id]) {
        return json(route, plan.fail ? 503 : 404, { error: { code: plan.fail ? "SERVICE_UNAVAILABLE" : "RESOURCE_NOT_FOUND", message: "Synthetic failure.", correlationId } }).catch(() => {});
      }
      const data = kind === "opportunities"
        ? { kind: "opportunity-detail", opportunity: opportunity(id), sourceOfTruth: "SQLite", transactionAuthority: false }
        : kind === "evidence"
          ? { kind: "evidence", opportunityId: id, acceptedExactCompletedSales: cards[id].acceptedSales, visibleButAuthorityIneligible: 1, acceptedSales: [], excludedSales: [], transactionAuthority: false }
          : { kind: "psa-advisor", opportunityId: id, guidanceStatus: "AVAILABLE", recalculated: false, transactionAuthority: false, sourceOfTruth: "Existing PSA intelligence" };
      return json(route, 200, envelope(correlationId, data)).catch(() => {});
    }
    return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Not part of this fixture.", correlationId } });
  });
  return { context, page };
}

const frames = page => page.evaluate(() => window.__ffFrames.splice(0));
const GRACE_MS = 50;
// A frame is wrong when a card is on screen that is not the card in the URL (after the router's grace period).
// A card on screen that is not the card in the URL - including any card while the URL is not a card route.
const foreign = list => list.filter(f => f.shown && (!f.id || f.shown.title !== cards[f.id]?.title) && f.since > GRACE_MS);
const describe = list => list.slice(0, 4).map(f => `URL ${f.route || "(none)"} showed "${f.shown?.title}" ${f.shown?.verdict} ${f.shown?.ask} ${f.since} ms after the URL changed [${f.renderer}]`).join("; ");
const go = (page, id) => page.evaluate(target => { location.hash = `#/opportunities/${target}`; }, id);
async function onScreen(page) {
  return page.evaluate(() => {
    const hero = document.querySelector("#main-content .customer-intelligence-hero");
    return hero ? { title: hero.querySelector("h2")?.textContent.trim(), verdict: hero.querySelector(".staging-status")?.textContent.trim(), ask: hero.querySelector(".customer-value-summary strong")?.textContent.trim() } : null;
  });
}
async function waitCard(page, id, timeout = 15_000) {
  await page.waitForFunction(title => document.querySelector("#main-content .customer-intelligence-hero h2")?.textContent.trim() === title, cards[id].title, { timeout });
}
const money = value => `$${Number(value).toLocaleString("en-US")}`;
const isCard = (shown, id) => Boolean(shown) && shown.title === cards[id].title && shown.verdict === cards[id].recommendation && shown.ask === money(cards[id].ask);

try {
  // C1: out of order - the slow BUY the customer left arrives after the WATCH they switched to.
  {
    const { context, page } = await newSession();
    clearBehavior();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    setBehavior("qa-verdict-buy", { delayMs: 6000 });
    await frames(page);
    await go(page, "qa-verdict-buy");
    await page.waitForTimeout(1500);
    await go(page, "qa-verdict-watch");
    await waitCard(page, "qa-verdict-watch");
    await page.waitForTimeout(6500); // the abandoned BUY response arrives
    const seen = await frames(page);
    const shown = await onScreen(page);
    check("C1 out-of-order: the late BUY response never replaces the WATCH card (title, verdict and price stay WATCH's)",
      foreign(seen).length === 0 && isCard(shown, "qa-verdict-watch"), `${describe(foreign(seen))} final=${JSON.stringify(shown)}`);
    await strictFrames(page);
    await context.close();
  }

  // C2: three overlapping requests completing in reverse order; the last card asked for wins.
  {
    const { context, page } = await newSession();
    clearBehavior();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    setBehavior("qa-verdict-buy", { delayMs: 8000 });
    setBehavior("qa-verdict-pass", { delayMs: 4000 });
    await frames(page);
    await go(page, "qa-verdict-buy");
    await page.waitForTimeout(400);
    await go(page, "qa-verdict-pass");
    await page.waitForTimeout(400);
    await go(page, "qa-verdict-verify");
    await waitCard(page, "qa-verdict-verify");
    await page.waitForTimeout(8500);
    const seen = await frames(page);
    const shown = await onScreen(page);
    check("C2 overlapping requests (BUY 8 s, PASS 4 s, VERIFY fast): VERIFY stays on screen as both late responses arrive",
      foreign(seen).length === 0 && isCard(shown, "qa-verdict-verify"), `${describe(foreign(seen))} final=${JSON.stringify(shown)}`);
    await strictFrames(page);
    await context.close();
  }

  // C3: an abandoned request that fails late must not replace the loaded card with an error.
  {
    const { context, page } = await newSession();
    clearBehavior();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    setBehavior("qa-verdict-watch", { delayMs: 5000, fail: true });
    await frames(page);
    await go(page, "qa-verdict-watch");
    await page.waitForTimeout(1000);
    await go(page, "qa-verdict-pass");
    await waitCard(page, "qa-verdict-pass");
    await page.waitForTimeout(5500);
    const seen = await frames(page);
    const shown = await onScreen(page);
    const errorShown = seen.some(f => f.id === "qa-verdict-pass" && f.error);
    check("C3 abandoned request fails late: PASS card stays, no error from the other card",
      foreign(seen).length === 0 && isCard(shown, "qa-verdict-pass") && !errorShown, `${describe(foreign(seen))} error=${errorShown} final=${JSON.stringify(shown)}`);
    await strictFrames(page);
    await context.close();
  }

  // C4: the current card fails after a loaded card: an error, and nothing from the previous card.
  {
    const { context, page } = await newSession();
    clearBehavior();
    await page.goto(`${baseUrl}/#/opportunities/qa-verdict-buy`, { waitUntil: "domcontentloaded" });
    await waitCard(page, "qa-verdict-buy");
    setBehavior("qa-verdict-verify", { delayMs: 3000, fail: true });
    await frames(page);
    await go(page, "qa-verdict-verify");
    await page.waitForFunction(() => /We couldn.t complete that request|took too long to load|did not finish loading/i.test(document.querySelector("#main-content")?.textContent || ""), null, { timeout: 12_000 });
    await page.waitForTimeout(1000);
    const seen = await frames(page);
    const shown = await onScreen(page);
    check("C4 current card fails: an error is shown and the previous BUY card's details are gone",
      foreign(seen).length === 0 && shown === null, `${describe(foreign(seen))} final=${JSON.stringify(shown)}`);
    await strictFrames(page);
    await context.close();
  }

  // C5: slow current card after a loaded card - previous details cleared for the whole 10.5 s load.
  {
    const { context, page } = await newSession();
    clearBehavior();
    await page.goto(`${baseUrl}/#/opportunities/qa-verdict-buy`, { waitUntil: "domcontentloaded" });
    await waitCard(page, "qa-verdict-buy");
    setBehavior("qa-verdict-watch", { delayMs: SLOW_MS });
    await frames(page);
    await go(page, "qa-verdict-watch");
    await page.waitForTimeout(5000);
    const mid = await onScreen(page);
    await waitCard(page, "qa-verdict-watch");
    const seen = await frames(page);
    check("C5 slow WATCH after a loaded BUY: no BUY title, verdict or price while WATCH loads; then WATCH",
      foreign(seen).length === 0 && mid === null && isCard(await onScreen(page), "qa-verdict-watch"), `${describe(foreign(seen))} at5s=${JSON.stringify(mid)}`);
    await strictFrames(page);
    await context.close();
  }

  // C6: rapid switching among all four with out-of-order delays, three rounds.
  {
    const { context, page } = await newSession();
    clearBehavior();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const delays = { "qa-verdict-buy": 1800, "qa-verdict-watch": 300, "qa-verdict-verify": 1200, "qa-verdict-pass": 0 };
    for (const [id, delayMs] of Object.entries(delays)) setBehavior(id, { delayMs });
    await frames(page);
    let finals = [];
    for (let round = 0; round < 3; round += 1) {
      for (const id of ["qa-verdict-buy", "qa-verdict-watch", "qa-verdict-verify", "qa-verdict-pass"]) {
        await go(page, id);
        await page.waitForTimeout(150);
      }
      const target = ["qa-verdict-watch", "qa-verdict-buy", "qa-verdict-verify"][round];
      await go(page, target);
      await waitCard(page, target);
      await page.waitForTimeout(2200); // every abandoned response has arrived
      finals.push(isCard(await onScreen(page), target));
    }
    const seen = await frames(page);
    check("C6 rapid switching among BUY/WATCH/VERIFY/PASS with out-of-order responses: the card on screen always belongs to the URL",
      foreign(seen).length === 0 && finals.every(Boolean), `${describe(foreign(seen))} finals=${finals}`);
    await strictFrames(page);
    await context.close();
  }

  // C7: across renderers - a slow Dashboard response must not replace a card opened meanwhile.
  {
    const { context, page } = await newSession();
    clearBehavior();
    listDelayMs = 6000;
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await go(page, "qa-verdict-watch");
    await waitCard(page, "qa-verdict-watch");
    await page.waitForTimeout(7500); // the slow Dashboard responses arrive
    const seen = await frames(page);
    const shown = await onScreen(page);
    const lost = seen.filter(f => f.id === "qa-verdict-watch" && f.at > (seen.find(x => x.shown && x.id === "qa-verdict-watch")?.at ?? Infinity) && !f.shown);
    check("C7 slow Dashboard, then open WATCH: the late Dashboard response never replaces the WATCH card",
      foreign(seen).length === 0 && lost.length === 0 && isCard(shown, "qa-verdict-watch"), `${describe(foreign(seen))} lost=${lost.length} final=${JSON.stringify(shown)}`);
    await strictFrames(page);
    await context.close();
  }

  // C8: across renderers - a slow card response must not paint over the Dashboard the customer went back to.
  {
    const { context, page } = await newSession();
    clearBehavior();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    setBehavior("qa-verdict-buy", { delayMs: 5000 });
    await frames(page);
    await go(page, "qa-verdict-buy");
    await page.waitForTimeout(1500);
    await page.evaluate(() => { location.hash = "#/dashboard"; });
    await page.waitForTimeout(6000); // the abandoned BUY response arrives
    const seen = await frames(page);
    const onDashboard = await page.evaluate(() => ({ hash: location.hash, card: Boolean(document.querySelector("#main-content .customer-intelligence-hero")) }));
    check("C8 slow BUY, then back to Dashboard: the late BUY response never paints over the Dashboard",
      foreign(seen).length === 0 && !onDashboard.card && onDashboard.hash === "#/dashboard", `${describe(foreign(seen))} ${JSON.stringify(onDashboard)}`);
    await strictFrames(page);
    await context.close();
  }
} catch (error) {
  failures.push(`audit did not complete: ${error.message.split("\n")[0]}`);
} finally {
  await browser.close();
}

console.log(`Matrix: ${baseUrl} | navigation API ${matrix.navigationApi ? "on" : "off"} | ${matrix.viewport}`);
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`Card switch stale-response audit: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
