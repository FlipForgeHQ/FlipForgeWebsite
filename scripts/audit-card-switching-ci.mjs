// A saved-card page may only ever show the card in its own URL.
//
// Regression (found 2026-10-13 while fixing the BUY-on-WATCH loading bug, #505): customer-opportunities.js kept one
// shared state object and wrote every response into it, with no check that the card or route was still the one
// requested. A slow response for a card the customer had already left could replace the card being viewed, or paint a
// card page over a different route. This audit loads the full app shell and controls only the server responses.
//
// Every animation frame it records the card on screen (title, verdict, ask, accepted-sale count) and the route in the
// URL. Rules, checked on every frame:
//   - a card page may show nothing but the card named in the URL (no other card's decision, price or evidence);
//   - no card page may be painted onto any other route;
//   - an old card's details are gone as soon as the URL changes (a loading state, never the previous card).
// Scenarios: out-of-order completion, overlapping requests, navigation away mid-load, a failed request that arrives
// late, a failed then a good card, and rapid switching among BUY, WATCH, VERIFY and PASS with mixed delays.
// Synthetic fixtures only: no network, no provider calls.
import { chromium, firefox, webkit, devices } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const email = "card-switching-audit@flipforge.test";
// Browser engine, device and Navigation API mode, so one audit covers: Chromium (Chrome, Edge, Chrome Android), Firefox,
// WebKit (Safari), a phone-sized touch device, and the fallback path used by browsers without the Navigation API.
const engineName = process.env.FF_AUDIT_ENGINE || "chromium";
const engine = { chromium, firefox, webkit }[engineName];
const deviceName = process.env.FF_AUDIT_DEVICE || "";
const disableNavigationApi = process.env.FF_AUDIT_NO_NAVIGATION_API === "1";
const runLabel = `${engineName}${deviceName ? ` / ${deviceName}` : ""}${disableNavigationApi ? " / Navigation API disabled (fallback path)" : ""}`;

const cards = {
  "qa-switch-buy": { title: "2018 Topps Chrome Shohei Ohtani #150 PSA 10", recommendation: "BUY", ask: 1215, supportedValue: 1675, acceptedSales: 227 },
  "qa-switch-watch": { title: "2018 Topps Chrome Shohei Ohtani #150 PSA 9", recommendation: "WATCH", ask: 760, supportedValue: 850, acceptedSales: 40 },
  "qa-switch-verify": { title: "2018 Topps Update Ronald Acuna Jr. #US250 PSA 10", recommendation: "VERIFY", ask: 310, supportedValue: 295, acceptedSales: 2 },
  "qa-switch-pass": { title: "2018 Prizm Luka Doncic #280 PSA 10", recommendation: "PASS", ask: 220, supportedValue: 199, acceptedSales: 9 }
};
const ids = Object.keys(cards);
const [BUY, WATCH, VERIFY, PASS] = ids;
const usd = value => `$${Number(value).toLocaleString("en-US")}`;
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

// Server behavior for the next request(s) of a card: delay (ms) and failure.
const behavior = new Map();
const setBehavior = (id, value) => behavior.set(id, value);
const clearBehavior = () => behavior.clear();

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "card-switching-audit",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      generatedAt: "2026-10-14T12:00:00Z",
      evidenceFreshness: "QA_FIXTURE",
      limitations: ["Synthetic card-switching audit fixture only."]
    },
    data
  };
}
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });

const recorderHealth = { violations: 0, canary: 0, sampled: 0 };
const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const browser = await engine.launch({ headless: true, ...(engineName === "chromium" && process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });

async function newSession() {
  const context = await browser.newContext(deviceName ? { ...devices[deviceName] } : { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(({ cardTable, noNavigationApi }) => {
    if (noNavigationApi) { try { Object.defineProperty(window, "navigation", { value: undefined, configurable: true }); } catch (_) { /* property not configurable */ } }
    localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
    const usdText = value => `$${Number(value).toLocaleString("en-US")}`;
    window.__ffFrames = [];
    window.__ffForeign = [];
    // First hashchange listener on the window: marks the moment the browser tells the app the route changed.
    window.__ffDispatchedHash = String(location.hash || "");
    window.addEventListener("hashchange", () => { window.__ffDispatchedHash = String(location.hash || ""); }, true);
    const seen = new Set();
    // What the customer sees is the page AFTER every requestAnimationFrame callback of the frame has run (they run
    // before the frame is drawn). So this recorder samples after the page's own pre-paint callbacks, not before them:
    // it is re-armed from a timer, which queues it behind every callback the page armed during the previous frame.
    // A canary armed first proves this ordering held in every frame (callbacks in one frame share one timestamp), and
    // two counters prove no frame was skipped.
    let canaryStamp = -1;
    window.__ffOrderViolations = 0;
    window.__ffCanaryFrames = 0;
    window.__ffSampledFrames = 0;
    const canary = stamp => { canaryStamp = stamp; window.__ffCanaryFrames += 1; requestAnimationFrame(canary); };
    requestAnimationFrame(canary);
    const sample = stamp => {
      window.__ffSampledFrames += 1;
      if (canaryStamp !== stamp) window.__ffOrderViolations += 1;
      const main = document.querySelector("#main-content");
      const match = String(location.hash || "").match(/^#\/opportunities\/([^/?]+)/);
      const routeId = match ? decodeURIComponent(match[1]) : "";
      const route = String(location.hash || "#/dashboard");
      const hero = main?.querySelector(".customer-intelligence-hero");
      if (hero) {
        const status = String(hero.querySelector(".staging-status")?.textContent || "").trim().toUpperCase();
        const title = String(hero.querySelector("h2")?.textContent || "").trim();
        const ask = String(hero.querySelector(".customer-value-summary strong")?.textContent || "").trim();
        const evidenceLabel = [...main.querySelectorAll(".staging-key-grid div")].find(node => /Accepted exact sales/i.test(node.querySelector("span")?.textContent || ""));
        const accepted = evidenceLabel ? Number(String(evidenceLabel.querySelector("strong")?.textContent || "").replace(/[^0-9]/g, "")) : null;
        const expected = cardTable[routeId];
        const problems = [];
        if (!routeId) problems.push("a card page is painted on a non-card route");
        else if (!expected) problems.push("a card page is painted for an unknown card");
        else {
          if (title !== expected.title) problems.push(`title "${title}"`);
          if (status !== expected.recommendation) problems.push(`verdict ${status}`);
          if (ask !== usdText(expected.ask)) problems.push(`price ${ask}`);
          if (accepted !== null && accepted !== expected.acceptedSales) problems.push(`evidence count ${accepted}`);
        }
        if (problems.length) {
          // "gap": the URL has changed but the browser has not yet delivered hashchange to the app.
          const gap = String(location.hash || "") !== window.__ffDispatchedHash;
          const key = `${gap ? "gap" : "app"}|${route}|${problems.join(",")}`;
          const now = Math.round(performance.now());
          if (!seen.has(key)) { seen.add(key); window.__ffForeign.push({ at: now, until: now, frames: 1, gap, route, problems }); }
          else { const entry = window.__ffForeign.find(item => `${item.gap ? "gap" : "app"}|${item.route}|${item.problems.join(",")}` === key); if (entry) { entry.until = now; entry.frames += 1; } }
        }
      }
      window.setTimeout(() => requestAnimationFrame(sample), 0);
    };
    requestAnimationFrame(sample);
  }, { cardTable: cards, noNavigationApi: disableNavigationApi });

  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({
      getUser: () => ({ email: "${email}" }),
      getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Switching Audit", membershipActive: true, membershipConfigured: true })
    });`
  }));
  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "(() => {})();" }));
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const correlationId = route.request().headers()["x-correlation-id"] || "card-switching-audit";
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
  const realClose = context.close.bind(context);
  context.close = async () => {
    try {
      const frames = await page.evaluate(() => ({ violations: window.__ffOrderViolations, canary: window.__ffCanaryFrames, sampled: window.__ffSampledFrames }));
      recorderHealth.violations += frames.violations; recorderHealth.canary += frames.canary; recorderHealth.sampled += frames.sampled;
    } catch (_) { /* page already gone */ }
    return realClose();
  };
  return { context, page };
}

const go = (page, hash) => page.evaluate(target => { location.hash = target; }, hash);
// Strict by default. In a browser WITHOUT the Navigation API a script that assigns location.hash cannot be intercepted
// before the browser paints once, so those pre-hashchange frames are counted and reported as a limitation (never
// hidden); frames after hashchange, and every real link click or Back/Forward, are always strict.
let limitationFrames = 0;
async function foreign(page, { scripted = true } = {}) {
  const all = await page.evaluate(() => window.__ffForeign.slice());
  if (!scripted || await page.evaluate(() => Boolean(window.navigation))) return all;
  const gaps = all.filter(f => f.gap);
  limitationFrames += gaps.length;
  return all.filter(f => !f.gap);
}
// A real, user-style click on an in-page link to a hash route.
async function clickTo(page, hash) {
  await page.evaluate(target => {
    let link = document.getElementById("__ffAuditLink");
    if (!link) {
      link = document.createElement("a");
      link.id = "__ffAuditLink";
      link.textContent = "audit link";
      link.style.cssText = "position:fixed;left:4px;top:4px;z-index:2147483647;padding:10px 14px;background:#fff;color:#000";
      document.body.appendChild(link);
    }
    link.setAttribute("href", target);
  }, hash);
  await page.click("#__ffAuditLink");
}
const describe = list => list.slice(0, 3).map(f => `${f.gap ? "[before hashchange delivered] " : "[after hashchange delivered] "}${f.route}: ${f.problems.join("; ")} at ${f.at}ms for ${f.until - f.at}ms / ${f.frames} frame(s)`).join(" | ");
async function showsCard(page, id, timeout = 15_000) {
  await page.waitForFunction(({ expected }) => {
    const hero = document.querySelector("#main-content .customer-intelligence-hero");
    return Boolean(hero) && String(hero.querySelector("h2")?.textContent || "").trim() === expected.title;
  }, { expected: cards[id] }, { timeout });
}
const snapshot = page => page.evaluate(() => {
  const main = document.querySelector("#main-content");
  return {
    hero: Boolean(main?.querySelector(".customer-intelligence-hero")),
    title: String(main?.querySelector(".customer-intelligence-hero h2")?.textContent || "").trim(),
    verdict: String(main?.querySelector(".customer-intelligence-hero .staging-status")?.textContent || "").trim().toUpperCase(),
    error: Boolean(main?.querySelector(".staging-error")),
    loading: /Loading card intelligence/i.test(main?.textContent || ""),
    heading: String(main?.querySelector("h1")?.textContent || "").trim(),
    hash: location.hash
  };
});

try {
  // A. Out-of-order: a slow card is abandoned for a fast one; the slow response arrives last and must be discarded.
  {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    setBehavior(WATCH, { delayMs: 6000 });
    await go(page, `#/opportunities/${WATCH}`);
    await page.waitForTimeout(1000);
    await go(page, `#/opportunities/${BUY}`);
    await showsCard(page, BUY);
    await page.waitForTimeout(6500); // the abandoned WATCH response arrives now
    const view = await snapshot(page);
    const bad = await foreign(page);
    check("A out-of-order: BUY stays on screen after the abandoned slow WATCH response arrives", view.title === cards[BUY].title && view.verdict === "BUY", JSON.stringify(view));
    check("A out-of-order: no frame ever showed another card's decision, price or evidence", bad.length === 0, describe(bad));
    clearBehavior();
    await context.close();
  }

  // B. Overlapping requests: PASS (slow) then VERIFY (medium); VERIFY lands first, PASS lands later and must not replace it.
  {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/opportunities/${BUY}`, { waitUntil: "domcontentloaded" });
    await showsCard(page, BUY);
    setBehavior(PASS, { delayMs: 5000 });
    setBehavior(VERIFY, { delayMs: 2000 });
    await go(page, `#/opportunities/${PASS}`);
    await page.waitForTimeout(1000);
    const mid = await snapshot(page);
    check("B overlapping: right after leaving a loaded BUY card, the BUY card is gone (neutral loading state)", !mid.hero && mid.loading, JSON.stringify(mid));
    await go(page, `#/opportunities/${VERIFY}`);
    await showsCard(page, VERIFY);
    await page.waitForTimeout(4500); // the PASS response arrives after VERIFY is already displayed
    const view = await snapshot(page);
    const bad = await foreign(page);
    check("B overlapping: VERIFY stays on screen after the older PASS response arrives", view.title === cards[VERIFY].title && view.verdict === "VERIFY", JSON.stringify(view));
    check("B overlapping: no frame ever showed another card's details", bad.length === 0, describe(bad));
    clearBehavior();
    await context.close();
  }

  // C. Navigating away mid-load: a late card response must not paint a card page over another route.
  {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    setBehavior(WATCH, { delayMs: 5000 });
    await go(page, `#/opportunities/${WATCH}`);
    await page.waitForTimeout(800);
    await go(page, "#/dashboard");
    await page.waitForTimeout(6500);
    const view = await snapshot(page);
    const bad = await foreign(page);
    check("C navigate away: the late WATCH response does not paint a card page onto the Dashboard", !view.hero && view.hash === "#/dashboard" && !/Card Intelligence/i.test(view.heading), JSON.stringify(view));
    check("C navigate away: no frame showed a card on a non-card route", bad.length === 0, describe(bad));
    clearBehavior();
    await context.close();
  }

  // D. A failure for an abandoned card arrives late: it must not replace the card being viewed with an error.
  {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    setBehavior(PASS, { delayMs: 4000, fail: true });
    await go(page, `#/opportunities/${PASS}`);
    await page.waitForTimeout(1000);
    await go(page, `#/opportunities/${VERIFY}`);
    await showsCard(page, VERIFY);
    await page.waitForTimeout(4500);
    const view = await snapshot(page);
    const bad = await foreign(page);
    check("D late failure: the abandoned card's failure does not replace VERIFY with an error", view.title === cards[VERIFY].title && !view.error, JSON.stringify(view));
    check("D late failure: no frame showed another card's details", bad.length === 0, describe(bad));
    clearBehavior();
    await context.close();
  }

  // E. A failed card, then a good one: the error and the failed card's id never linger on the next card.
  {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    setBehavior(WATCH, { fail: true });
    await go(page, `#/opportunities/${WATCH}`);
    await page.waitForFunction(() => Boolean(document.querySelector("#main-content .staging-error")), null, { timeout: 15_000 });
    const failed = await snapshot(page);
    check("E failed request: the failed card shows an error and no card details", failed.error && !failed.hero, JSON.stringify(failed));
    await go(page, `#/opportunities/${BUY}`);
    await showsCard(page, BUY);
    const view = await snapshot(page);
    const bad = await foreign(page);
    check("E failed then good: BUY shows with no leftover error", view.title === cards[BUY].title && !view.error, JSON.stringify(view));
    check("E failed then good: no frame showed another card's details", bad.length === 0, describe(bad));
    clearBehavior();
    await context.close();
  }

  // F. Rapid switching through BUY, WATCH, VERIFY and PASS with mixed delays, every 250 ms, ending on a known card.
  {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/opportunities/${BUY}`, { waitUntil: "domcontentloaded" });
    await showsCard(page, BUY);
    const delays = [3200, 0, 2400, 900, 3000, 150, 2600, 0, 1800, 3400, 300, 1200];
    const order = [PASS, WATCH, VERIFY, BUY, PASS, VERIFY, WATCH, BUY, VERIFY, PASS, WATCH, VERIFY];
    for (let i = 0; i < order.length; i += 1) {
      setBehavior(order[i], { delayMs: delays[i] });
      await go(page, `#/opportunities/${order[i]}`);
      await page.waitForTimeout(250);
    }
    const last = order[order.length - 1];
    clearBehavior();
    await showsCard(page, last);
    await page.waitForTimeout(4000); // every abandoned response has now arrived
    const view = await snapshot(page);
    const bad = await foreign(page);
    check(`F rapid switching: the card in the URL (${cards[last].recommendation}) is the card on screen after every response has arrived`, view.title === cards[last].title && view.verdict === cards[last].recommendation, JSON.stringify(view));
    check("F rapid switching: across BUY, WATCH, VERIFY and PASS no frame ever showed another card's decision, price or evidence", bad.length === 0, describe(bad));
    await context.close();
  }

  // H. Browser Back and Forward across loaded, loading and slow cards: the card on screen is always the card in the URL.
  {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    for (const id of [BUY, WATCH]) { await clickTo(page, `#/opportunities/${id}`); await showsCard(page, id); }
    setBehavior(VERIFY, { delayMs: 3000 });
    await clickTo(page, `#/opportunities/${VERIFY}`);
    await page.waitForTimeout(500);
    await page.goBack(); // VERIFY is still loading: back to WATCH
    await showsCard(page, WATCH);
    await page.waitForTimeout(3500); // the abandoned VERIFY response arrives
    let view = await snapshot(page);
    check("H Back while the next card is still loading: WATCH is shown and the late VERIFY response is discarded", view.title === cards[WATCH].title && view.verdict === "WATCH", JSON.stringify(view));
    await page.goBack();
    await showsCard(page, BUY);
    view = await snapshot(page);
    check("H Back again: BUY is shown", view.title === cards[BUY].title && view.verdict === "BUY", JSON.stringify(view));
    await page.goForward();
    await showsCard(page, WATCH);
    await page.goForward();
    await showsCard(page, VERIFY);
    view = await snapshot(page);
    check("H Forward to the slow card: VERIFY is shown once it loads", view.title === cards[VERIFY].title && view.verdict === "VERIFY", JSON.stringify(view));
    const bad = await foreign(page, { scripted: false });
    check("H Back/Forward: no frame ever showed another card's decision, price or evidence", bad.length === 0, describe(bad));
    clearBehavior();
    await context.close();
  }

  // I. Real link clicks, rapid, with a slow and a failing card in the mix.
  {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    setBehavior(PASS, { delayMs: 2500 });
    setBehavior(WATCH, { delayMs: 1500, fail: true });
    const clicks = [BUY, WATCH, VERIFY, PASS, BUY, PASS, VERIFY, BUY, WATCH, BUY, VERIFY];
    for (const id of clicks) { await clickTo(page, `#/opportunities/${id}`); await page.waitForTimeout(220); }
    clearBehavior();
    await showsCard(page, clicks[clicks.length - 1]);
    await page.waitForTimeout(3500);
    const view = await snapshot(page);
    const bad = await foreign(page, { scripted: false });
    check("I rapid link clicks (with a slow and a failing card): the card in the URL is on screen after every response has arrived", view.title === cards[VERIFY].title && view.verdict === "VERIFY" && !view.error, JSON.stringify(view));
    check("I rapid link clicks: no frame ever showed another card's decision, price or evidence", bad.length === 0, describe(bad));
    await context.close();
  }

  // J. Dashboard <-> saved card round trips, rapid: a card never appears on the Dashboard, the Dashboard never leaves a card behind.
  {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    setBehavior(WATCH, { delayMs: 1800 });
    for (const id of [BUY, WATCH, PASS, VERIFY]) {
      await clickTo(page, `#/opportunities/${id}`);
      await page.waitForTimeout(300);
      await clickTo(page, "#/dashboard");
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(2500);
    let view = await snapshot(page);
    check("J Dashboard round trips: the Dashboard is on screen with no card page left behind", !view.hero && view.hash === "#/dashboard" && !/Card Intelligence/i.test(view.heading), JSON.stringify(view));
    await clickTo(page, `#/opportunities/${PASS}`);
    await showsCard(page, PASS);
    view = await snapshot(page);
    check("J Dashboard -> card: the requested card appears", view.title === cards[PASS].title && view.verdict === "PASS", JSON.stringify(view));
    const bad = await foreign(page, { scripted: false });
    check("J Dashboard round trips: no frame ever showed a card on the Dashboard or another card's details", bad.length === 0, describe(bad));
    clearBehavior();
    await context.close();
  }

  // G. Positive control: a plain, undisturbed open of each card shows that card (a pass is not vacuous).
  for (const id of ids) {
    const { context, page } = await newSession();
    clearBehavior();
    await page.goto(`${baseUrl}/#/opportunities/${id}`, { waitUntil: "domcontentloaded" });
    await showsCard(page, id);
    const view = await snapshot(page);
    const bad = await foreign(page);
    check(`G control ${cards[id].recommendation}: an undisturbed open shows that card and its evidence`, view.title === cards[id].title && view.verdict === cards[id].recommendation && bad.length === 0, `${JSON.stringify(view)} ${describe(bad)}`);
    await context.close();
  }
  // Recorder health: it must have sampled after the page's pre-paint callbacks in every frame, and not skipped frames.
  check("recorder ordering canary: every sampled frame was taken after the page's own pre-paint callbacks", recorderHealth.violations === 0 && recorderHealth.sampled > 0, `${recorderHealth.violations} out-of-order frame(s) of ${recorderHealth.sampled}`);
  const coverage = recorderHealth.canary ? recorderHealth.sampled / recorderHealth.canary : 0;
  check("recorder coverage: at least 90% of rendered frames were sampled", coverage >= 0.9, `${recorderHealth.sampled}/${recorderHealth.canary} frames = ${(coverage * 100).toFixed(1)}%`);
} catch (error) {
  failures.push(`audit did not complete: ${error.message.split("\n")[0]}`);
} finally {
  await browser.close();
}

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
if (limitationFrames) console.log(`LIMITATION ${limitationFrames} pre-hashchange frame(s) from scripted location.hash changes in this browser (no Navigation API); not counted as failures, reported so they are not hidden.`);
console.log(`Card switching audit [${runLabel}]: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
