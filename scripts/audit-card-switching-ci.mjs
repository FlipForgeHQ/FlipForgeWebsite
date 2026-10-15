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
const localOrigin = (process.env.FF_AUDIT_LOCAL_ORIGIN || "http://127.0.0.1:4173").replace(/\/$/, "");
const productionHost = new URL(baseUrl).hostname === "goflipforge.com";
const engineName = process.env.FF_AUDIT_ENGINE || "chromium";
const engine = { chromium, firefox, webkit }[engineName];
const deviceName = process.env.FF_AUDIT_DEVICE || "";
const disableNavigationApi = process.env.FF_AUDIT_NO_NAVIGATION_API === "1";
const runLabel = `${engineName}${deviceName ? ` / ${deviceName}` : ""}${productionHost ? " / production host emulated" : ""}${disableNavigationApi ? " / Navigation API disabled (fallback path)" : ""}`;

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
  const context = await browser.newContext({ ...(deviceName ? { ...devices[deviceName] } : { viewport: { width: 1440, height: 900 } }), ignoreHTTPSErrors: true });
  if (productionHost) {
    // Production-host emulation: the page is loaded as https://goflipforge.com/... (the real hostname, so every
    // production-only branch of the app runs) while the bytes come from this checkout's local server.
    await context.route(/^https:\/\/goflipforge\.com\//, async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `${localOrigin}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    });
  }
  const page = await context.newPage();
  await page.addInitScript(({ cardTable, noNavigationApi }) => {
    if (noNavigationApi) { try { Object.defineProperty(window, "navigation", { value: undefined, configurable: true }); } catch (_) { /* property not configurable */ } }
    localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
    const usdText = value => `$${Number(value).toLocaleString("en-US")}`;
    // The legacy /app shell replaces the whole document on a route change, so everything the recorder has seen survives
    // in sessionStorage across reloads and is written out again on pagehide; nothing seen before a reload is lost.
    const stored = key => { try { return JSON.parse(window.sessionStorage.getItem(key) || "null"); } catch (_) { return null; } };
    const persist = () => { try {
      window.sessionStorage.setItem("__ffForeign", JSON.stringify(window.__ffForeign));
      window.sessionStorage.setItem("__ffCounters", JSON.stringify([window.__ffOrderViolations, window.__ffCanaryFrames, window.__ffSampledFrames]));
    } catch (_) { /* storage unavailable */ } };
    window.__ffFrames = [];
    window.__ffForeign = stored("__ffForeign") || [];
    try { window.sessionStorage.setItem("__ffDocLoads", String(Number(window.sessionStorage.getItem("__ffDocLoads") || 0) + 1)); } catch (_) { /* diagnostics only */ }
    // Diagnostics only (never asserted): a small cross-document trace of what #main-content held and when, shown with any failing snapshot.
    {
      const log = what => { try { const list = JSON.parse(window.sessionStorage.getItem("__ffTrace") || "[]"); list.push(`${Date.now() % 100000}|d${window.sessionStorage.getItem("__ffDocLoads")}|${location.hash.slice(0, 28)}|${what}`); window.sessionStorage.setItem("__ffTrace", JSON.stringify(list.slice(-30))); } catch (_) { /* diagnostics only */ } };
      log("doc-start");
      window.addEventListener("hashchange", () => log("hashchange"), true);
      window.addEventListener("pagehide", () => log("pagehide"), true);
      new MutationObserver(records => { for (const record of records) { if (record.target && record.target.id === "main-content") { const main = record.target; log(`main:${String(main.querySelector("h1,h2,[role=status]")?.textContent || main.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30)}`); break; } } }).observe(document, { childList: true, subtree: true });
    }
    // Test hook for scenario L2: while set, hashchange/popstate are not delivered to the page, reproducing a browser that has
    // already changed the URL (Back/Forward) but has not yet told the app, for as many frames as the scenario wants.
    for (const type of ["hashchange", "popstate"]) window.addEventListener(type, event => { if (window.__ffSwallowNavigationEvents) event.stopImmediatePropagation(); }, true);
    // First hashchange listener on the window: marks the moment the browser tells the app the route changed.
    window.__ffDispatchedHash = String(location.hash || "");
    window.addEventListener("hashchange", () => { window.__ffDispatchedHash = String(location.hash || ""); }, true);
    const seen = new Set();
    // What the customer sees is the page AFTER every requestAnimationFrame callback of the frame has run (they all run
    // before the frame is drawn). The recorder therefore owns the page's requestAnimationFrame: every callback the page
    // registers is queued and run, in registration order, by ONE native callback per frame, and the sample is taken
    // immediately after the last of them - whatever order the page's own callbacks (re)armed in. Nothing else can run
    // between that point and the draw. Two independent checks prove it: a page-level canary (registered through the page's
    // own requestAnimationFrame, every frame) must have run before every sample in the same frame, and an untouched native
    // callback chain counts every frame the browser produced, so any frame the recorder skipped shows as lost coverage.
    const nativeRaf = window.requestAnimationFrame.bind(window);
    const pageQueue = new Map();
    let nextCallbackId = 1;
    let flushArmed = false;
    let canaryStamp = -1;
    const counters = stored("__ffCounters") || [0, 0, 0];
    window.__ffOrderViolations = counters[0];
    window.__ffCanaryFrames = counters[1];
    window.__ffSampledFrames = counters[2];
    window.addEventListener("pagehide", persist);
    const armFlush = () => { if (!flushArmed) { flushArmed = true; nativeRaf(flush); } };
    // Test hook for scenario L only: while set, the page's callbacks and the sampler are not run for this frame (and the frame
    // is not counted by either counter), modelling a navigation whose hashchange and render both complete between two frames.
    const flush = stamp => {
      flushArmed = false;
      if (window.__ffHoldFrames) { window.setTimeout(armFlush, 4); return; }
      const batch = [...pageQueue];
      pageQueue.clear();
      for (const [, callback] of batch) { try { callback(stamp); } catch (error) { window.setTimeout(() => { throw error; }, 0); } }
      sample(stamp);
    };
    window.requestAnimationFrame = callback => { const id = nextCallbackId++; pageQueue.set(id, callback); armFlush(); return id; };
    window.cancelAnimationFrame = id => { pageQueue.delete(id); };
    const nativeFrames = () => { if (!window.__ffHoldFrames) window.__ffCanaryFrames += 1; nativeRaf(nativeFrames); };
    nativeRaf(nativeFrames);
    const canary = stamp => { canaryStamp = stamp; window.requestAnimationFrame(canary); };
    window.requestAnimationFrame(canary);
    const sample = stamp => {
      window.__ffSampledFrames += 1;
      if (canaryStamp !== stamp) window.__ffOrderViolations += 1;
      const main = document.querySelector("#main-content");
      const match = String(location.hash || "").match(/^#\/opportunities\/([^/?]+)/);
      const routeId = match ? decodeURIComponent(match[1]) : "";
      const route = String(location.hash || "#/dashboard");
      const hero = main?.querySelector(".customer-intelligence-hero");
      const problems = [];
      if (routeId && main) {
        // Whatever else is painted on a card page - the built-in prototype sample record, a verdict badge with no card, or
        // the name of any other card - is another card's identity on this card's URL.
        const text = main.textContent || "";
        if (/Prototype saved record|OPPORTUNITY DETAIL/i.test(text)) problems.push("a prototype sample record is painted");
        if (!hero && main.children.length) {
          // On a card's URL the only things that may be on screen are that card, or a neutral loading / recovery / error state.
          const neutral = main.querySelector('[data-ff-route-pending], [data-saved-intelligence-recovery], [data-card-intelligence-recovery], [data-saved-intelligence-recovery-error], [data-card-intelligence-recovery-error], .staging-error, .staging-loading, .ff-commercial-loading, [role="status"], [role="alert"]') || /Loading|Opening|could not|unavailable/i.test(text);
          if (!neutral) problems.push(`another page is on screen under the card URL ("${String(main.querySelector("h1")?.textContent || text).trim().slice(0, 50)}")`);
        }
        if (!hero) {
          const badge = [...main.querySelectorAll(".staging-status")].map(node => node.textContent.trim().toUpperCase()).find(value => /^(BUY|WATCH|VERIFY|PASS)$/.test(value));
          if (badge) problems.push(`verdict ${badge} shown with no card`);
        }
        for (const [otherId, other] of Object.entries(cardTable)) {
          if (otherId !== routeId && text.includes(other.title)) problems.push(`text of another card "${other.title}"`);
        }
      }
      if (hero) {
        const status = String(hero.querySelector(".staging-status")?.textContent || "").trim().toUpperCase();
        const title = String(hero.querySelector("h2")?.textContent || "").trim();
        const ask = String(hero.querySelector(".customer-value-summary strong")?.textContent || "").trim();
        const evidenceLabel = [...main.querySelectorAll(".staging-key-grid div")].find(node => /Accepted exact sales/i.test(node.querySelector("span")?.textContent || ""));
        const accepted = evidenceLabel ? Number(String(evidenceLabel.querySelector("strong")?.textContent || "").replace(/[^0-9]/g, "")) : null;
        const expected = cardTable[routeId];
        if (!routeId) problems.push("a card page is painted on a non-card route");
        else if (!expected) problems.push("a card page is painted for an unknown card");
        else {
          if (title !== expected.title) problems.push(`title "${title}"`);
          if (status !== expected.recommendation) problems.push(`verdict ${status}`);
          if (ask !== usdText(expected.ask)) problems.push(`price ${ask}`);
          if (accepted !== null && accepted !== expected.acceptedSales) problems.push(`evidence count ${accepted}`);
        }
      }
      if (problems.length) {
        // "gap": the URL has changed but the browser has not yet delivered hashchange to the app.
        const gap = String(location.hash || "") !== window.__ffDispatchedHash;
        const key = `${gap ? "gap" : "app"}|${route}|${problems.join(",")}`;
        const now = Math.round(performance.now());
        if (!seen.has(key)) { seen.add(key); window.__ffForeign.push({ at: now, until: now, frames: 1, gap, route, problems }); }
        else { const entry = window.__ffForeign.find(item => `${item.gap ? "gap" : "app"}|${item.route}|${item.problems.join(",")}` === key); if (entry) { entry.until = now; entry.frames += 1; } }
      }
      if (window.__ffSampledFrames % 10 === 0) persist();
      window.setTimeout(armFlush, 0);
    };
  }, { cardTable: cards, noNavigationApi: disableNavigationApi });

  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({
      getUser: () => ({ email: "${email}" }),
      getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Switching Audit", membershipActive: true, membershipConfigured: true }),
      // The production-host private-beta access gate asks the identity layer to refresh and confirm membership.
      refresh: async () => ({ authenticated: true, email: "${email}", fullName: "Switching Audit", membershipActive: true, membershipConfigured: true }),
      noteServerMembership: () => ({ authenticated: true, membershipActive: true, membershipConfigured: true })
    });`
  }));
  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "(() => {})();" }));
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const correlationId = route.request().headers()["x-correlation-id"] || "card-switching-audit";
    if (url.pathname === "/api/v1/health") return json(route, 200, envelope(correlationId, { status: "configured" }));
    if (url.pathname === "/api/v1/entitlements") return json(route, 200, envelope(correlationId, { kind: "entitlements", membershipActive: true, plan: "PRIVATE_BETA", transactionAuthority: false }));
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
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide"))).catch(() => {});
      const frames = await page.evaluate(() => ({ violations: window.__ffOrderViolations, canary: window.__ffCanaryFrames, sampled: window.__ffSampledFrames }));
      recorderHealth.violations += frames.violations; recorderHealth.canary += frames.canary; recorderHealth.sampled += frames.sampled;
    } catch (_) { /* page already gone */ }
    return realClose();
  };
  return { context, page };
}

// Full-page reloads (the legacy /app shell) destroy the execution context mid-call; retry across them.
async function evalStable(page, fn, arg) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await page.evaluate(fn, arg); } catch (error) {
      if (attempt >= 6 || !/Execution context was destroyed|Cannot find context|Target closed|navigat/i.test(String(error.message))) throw error;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(150);
    }
  }
}
const go = (page, hash) => evalStable(page, target => { location.hash = target; }, hash);
// Strict always: every frame is checked, whether the route changed through a link click, Back/Forward or a script assigning
// location.hash (browsers without the Navigation API included). Nothing is filtered out or reported as a limitation.
async function foreign(page) {
  // Flush the recorder first so a pending reload cannot hide frames seen just before it.
  return evalStable(page, () => { window.dispatchEvent(new Event("pagehide")); return window.__ffForeign.slice(); });
}
// A real, user-style click on an in-page link to a hash route.
async function clickTo(page, hash) {
  for (let attempt = 0; ; attempt += 1) {
    try { await clickToOnce(page, hash); return; } catch (error) {
      if (attempt >= 4 || !/Execution context was destroyed|Cannot find context|navigat|detached|Timeout/i.test(String(error.message))) throw error;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}
async function clickToOnce(page, hash) {
  await page.evaluate(target => {
    let link = document.getElementById("__ffAuditLink");
    if (!link) {
      link = document.createElement("a");
      link.id = "__ffAuditLink";
      link.textContent = "audit link";
      link.style.cssText = "position:fixed;left:4px;top:4px;z-index:2147483647;padding:10px 14px;background:#fff;color:#000";
      (document.body || document.documentElement).appendChild(link);
    }
    link.setAttribute("href", target);
  }, hash);
  await page.click("#__ffAuditLink");
}
const describe = list => list.slice(0, 3).map(f => `${f.gap ? "[before hashchange delivered] " : "[after hashchange delivered] "}${f.route}: ${f.problems.join("; ")} at ${f.at}ms for ${f.until - f.at}ms / ${f.frames} frame(s)`).join(" | ");
async function showsCard(page, id, timeout = 15_000) {
  const wait = () => page.waitForFunction(({ expected }) => {
    const hero = document.querySelector("#main-content .customer-intelligence-hero");
    return Boolean(hero) && String(hero.querySelector("h2")?.textContent || "").trim() === expected.title;
  }, { expected: cards[id] }, { timeout });
  // The card must be on screen in the document that stays: if a reload replaced the document that first showed it, wait again.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await wait();
    const loadsBefore = await evalStable(page, () => Number(window.sessionStorage.getItem("__ffDocLoads") || 0));
    await settleDocument(page);
    const loadsAfter = await evalStable(page, () => Number(window.sessionStorage.getItem("__ffDocLoads") || 0));
    if (loadsAfter === loadsBefore) return;
  }
  await wait();
}
// The legacy (non-production) shell reloads the document on a route change, and some engines take ~100 ms after hashchange to
// unload the old document while it keeps rendering. A final-state check must be read from the document that stays, so wait
// until no new document has loaded for 400 ms. Only the wait is relaxed: every assertion on the state is unchanged, and the
// frame recorder (which persists across reloads) still checks every frame of every document.
async function settleDocument(page) {
  let last = -1;
  let since = Date.now();
  for (let i = 0; i < 100; i += 1) {
    const loads = await evalStable(page, () => Number(window.sessionStorage.getItem("__ffDocLoads") || 0));
    if (loads !== last) { last = loads; since = Date.now(); }
    if (Date.now() - since >= 400) return;
    await page.waitForTimeout(80);
  }
}
const snapshot = async (page, { settle = true } = {}) => {
  if (settle) await settleDocument(page);
  return takeSnapshot(page);
};
const takeSnapshot = page => evalStable(page, () => {
  const main = document.querySelector("#main-content");
  return {
    hero: Boolean(main?.querySelector(".customer-intelligence-hero")),
    title: String(main?.querySelector(".customer-intelligence-hero h2")?.textContent || "").trim(),
    verdict: String(main?.querySelector(".customer-intelligence-hero .staging-status")?.textContent || "").trim().toUpperCase(),
    error: Boolean(main?.querySelector(".staging-error")),
    loading: /Loading card intelligence/i.test(main?.textContent || ""),
    heading: String(main?.querySelector("h1")?.textContent || "").trim(),
    hash: location.hash,
    // Diagnostics only (never asserted): how many documents this tab has loaded, how old this one is, and what is in #main-content.
    loads: Number(window.sessionStorage.getItem("__ffDocLoads") || 0),
    docAgeMs: Math.round(performance.now()),
    mainHead: String(main?.innerHTML || "").replace(/\s+/g, " ").slice(0, 140),
    trace: (window.sessionStorage.getItem("__ffTrace") || "").slice(-1500)
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
    const mid = await snapshot(page, { settle: false });
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
    const bad = await foreign(page);
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
    const bad = await foreign(page);
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
    const bad = await foreign(page);
    check("J Dashboard round trips: no frame ever showed a card on the Dashboard or another card's details", bad.length === 0, describe(bad));
    clearBehavior();
    await context.close();
  }

  // L. Leaving a loaded card for another page that shares the generic page classes (PSA Advisor): the destination must stay
  // on screen (an earlier guard treated the shared class as proof the card still owned the screen and replaced PSA Advisor
  // with the old card's loading view), and Back must return to the card.
  {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/opportunities/${BUY}`, { waitUntil: "domcontentloaded" });
    await showsCard(page, BUY);
    // Hold the frame clock, navigate, wait until PSA Advisor has rendered, then let frames run: the card's pre-paint guard now
    // runs AFTER the destination painted itself, which is the order that used to overwrite the destination.
    await page.evaluate(() => { window.__ffHoldFrames = true; });
    await go(page, "#/psa-advisor");
    await page.waitForFunction(() => /PSA Advisor/.test(document.querySelector("#main-content h1")?.textContent || ""), null, { timeout: 15_000 }).catch(() => {});
    await page.evaluate(() => { window.__ffHoldFrames = false; });
    await page.waitForTimeout(2000);
    let view = await snapshot(page);
    check("L card -> PSA Advisor: PSA Advisor stays on screen (the card's guard does not overwrite another renderer's page)", /PSA Advisor/i.test(String(view.heading || "")) && !view.hero && view.hash === "#/psa-advisor", JSON.stringify(view));
    await page.goBack();
    await showsCard(page, BUY);
    view = await snapshot(page);
    check("L PSA Advisor -> Back: the card is shown again", view.title === cards[BUY].title && view.verdict === "BUY", JSON.stringify(view));
    const bad = await foreign(page);
    check("L card <-> PSA Advisor: no frame ever showed a card under the wrong route or another card's details", bad.length === 0, describe(bad));
    await context.close();
  }

  // L2. The same Back navigation when the browser is slow to tell the app (URL changed, hashchange/popstate not yet delivered):
  // for 600 ms of frames the page being left must not stay on screen under the card's URL.
  {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/opportunities/${BUY}`, { waitUntil: "domcontentloaded" });
    await showsCard(page, BUY);
    await go(page, "#/psa-advisor");
    await page.waitForFunction(() => /PSA Advisor/.test(document.querySelector("#main-content h1")?.textContent || ""), null, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.__ffSwallowNavigationEvents = true; });
    await page.goBack();
    await page.waitForTimeout(600);
    const bad = await foreign(page);
    check("L2 Back to a card while the browser has not yet delivered hashchange: no frame shows the page being left under the card URL", bad.length === 0, describe(bad));
    await page.evaluate(() => { window.__ffSwallowNavigationEvents = false; window.dispatchEvent(new PopStateEvent("popstate")); window.dispatchEvent(new HashChangeEvent("hashchange")); }).catch(() => {});
    await showsCard(page, BUY);
    const view = await snapshot(page);
    check("L2 once the events arrive the card is shown", view.title === cards[BUY].title && view.verdict === "BUY", JSON.stringify(view));
    await context.close();
  }

  // K. Realistic worst case: a 10.5 s response (the slowest load seen in production) for a card the customer abandons at
  // 3 s, both by link click and by Back, while the next card loads at once. The late response must change nothing.
  {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    setBehavior(WATCH, { delayMs: 10_500 });
    await clickTo(page, `#/opportunities/${WATCH}`);
    await page.waitForTimeout(3000);
    const loadingView = await snapshot(page, { settle: false });
    check("K 3 s into a 10.5 s load: a clear loading state and no card", loadingView.loading && !loadingView.hero, JSON.stringify(loadingView));
    await clickTo(page, `#/opportunities/${BUY}`);
    await showsCard(page, BUY);
    await page.waitForTimeout(8200); // the abandoned 10.5 s WATCH response arrives at ~10.5 s
    let view = await snapshot(page);
    check("K 10.5 s response for an abandoned card (link click): BUY stays, WATCH never appears", view.title === cards[BUY].title && view.verdict === "BUY", JSON.stringify(view));
    setBehavior(PASS, { delayMs: 10_500 });
    await clickTo(page, `#/opportunities/${PASS}`);
    await page.waitForTimeout(3000);
    await page.goBack(); // back to BUY while the 10.5 s PASS request is in flight
    await showsCard(page, BUY);
    await page.waitForTimeout(8200);
    view = await snapshot(page);
    check("K 10.5 s response for an abandoned card (Back): BUY stays, PASS never appears", view.title === cards[BUY].title && view.verdict === "BUY", JSON.stringify(view));
    const bad = await foreign(page);
    check("K 10.5 s delays: no frame ever showed another card's decision, price or evidence", bad.length === 0, describe(bad));
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
console.log(`Card switching audit [${runLabel}]: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
