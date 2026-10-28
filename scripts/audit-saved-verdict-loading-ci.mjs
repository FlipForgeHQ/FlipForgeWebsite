// A saved decision is explained only by its own saved verdict, including while it loads.
//
// Regression for 2026-10-13 (production, after #501): opening a saved WATCH (Ohtani PSA 9) from the Dashboard showed
// "The evaluated price cleared the current decision checks ... BUY" for ~7.6 s while the record loaded. The injected
// decision summary scraped the first verdict word from page text (the "BUY, WATCH, VERIFY, or PASS" legend) and the
// result guide trusted that summary. audit-result-guide-verdict-ci.mjs tests the guide script alone and could not see
// this interaction, so this audit loads the full app shell (every script) and only controls the server responses.
//
// Every animation frame it records each visible verdict claim - the "How to read this result" guide, the decision
// summary pill, the Guided Mode panel title and the decision panel ("See why FlipForge said ...") - together with the
// saved card on screen (the Card Intelligence hero, rendered from the saved record). Rules:
//   - a claim must equal the saved verdict of the card on screen;
//   - while no card is on screen (loading, failed request) no verdict may be claimed at all;
//   - without card switching the card on screen is the card in the URL, so every claim must equal that card's verdict.
// Scenarios: all four verdicts behind a 10.5 s response, a direct load of the Ohtani PSA 9 WATCH, failed requests
// (immediate and after 10.5 s), and switching cards after load, while loading and rapidly through all four. Positive
// checks prove the surfaces do show the right verdict once the record arrives, so a pass is not vacuous.
// Synthetic fixtures only: no network, no provider calls.
import { chromium } from "playwright";

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
const clearBehavior = () => behavior.clear();

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
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });

async function newSession() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(({ email }) => {
    localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
    // Guided Mode on and opened, so its panel title is one of the surfaces under test.
    let hash = 2166136261;
    for (const ch of email.toLowerCase()) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    const key = (hash >>> 0).toString(36);
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.welcome`, "seen");
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.enabled`, "on");

    // Frame-by-frame recorder of every visible verdict claim. Runs in the page before any app script.
    const VERDICT = /^(BUY|WATCH|VERIFY|PASS)$/;
    const visible = node => Boolean(node && node.isConnected && !node.closest("[hidden]") && node.getClientRects().length
      && getComputedStyle(node).visibility !== "hidden" && Number(getComputedStyle(node).opacity) > 0.01);
    const routeId = () => {
      const match = String(location.hash || "").match(/^#\/opportunities\/([^/?]+)/);
      return match ? decodeURIComponent(match[1]) : "";
    };
    window.__ffClaims = [];
    window.__ffClaimLog = new Set();
    const sample = () => {
      const id = routeId();
      if (id) {
        const main = document.querySelector("#main-content");
        const claims = [];
        main?.querySelectorAll("[data-ff-p3-result-guide]").forEach(node => {
          if (!visible(node)) return;
          const decision = String(node.dataset.decision || "").toUpperCase();
          if (decision) claims.push(["result guide", decision]);
          const active = node.querySelector('[data-active="true"]');
          if (active && visible(active)) claims.push(["result guide key", String(active.textContent || "").trim().toUpperCase()]);
        });
        main?.querySelectorAll("[data-ff-decision-summary] .ff-decision-summary-pill").forEach(node => {
          const value = String(node.textContent || "").trim().toUpperCase();
          if (visible(node) && VERDICT.test(value)) claims.push(["decision summary", value]);
        });
        const guideTitle = document.querySelector("#ff-guided-mode-root .ff-guide-panel h2");
        const titleMatch = String(guideTitle?.textContent || "").match(/Start here:\s*(BUY|WATCH|VERIFY|PASS)\b/i);
        if (titleMatch && visible(guideTitle)) claims.push(["Guided Mode", titleMatch[1].toUpperCase()]);
        const stack = main?.querySelector("[data-ff-cdi-stack-host]");
        const saidMatch = stack && visible(stack) ? String(stack.innerText || "").match(/FlipForge said (BUY|WATCH|VERIFY|PASS)\b/) : null;
        if (saidMatch) claims.push(["decision panel", saidMatch[1]]);
        const heroStatus = main?.querySelector(".customer-intelligence-hero .staging-status");
        const hero = heroStatus && visible(heroStatus) ? String(heroStatus.textContent || "").trim().toUpperCase() : "";
        const heroTitle = String(main?.querySelector(".customer-intelligence-hero h2")?.textContent || "").trim();
        for (const [surface, verdict] of claims) {
          const key = `${id}|${surface}|${verdict}|${hero}|${heroTitle}`;
          if (window.__ffClaimLog.has(key)) continue;
          window.__ffClaimLog.add(key);
          window.__ffClaims.push({ at: Math.round(performance.now()), id, surface, verdict, hero, heroTitle });
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

const claims = page => page.evaluate(() => window.__ffClaims.splice(0));
// Claim differs from the card on screen, or a verdict is claimed while no card is on screen.
const offScreen = list => list.filter(claim => claim.verdict !== claim.hero);
// Without switching, the card on screen must be the card in the URL.
const offUrl = list => list.filter(claim => cards[claim.id] && claim.verdict !== cards[claim.id].recommendation);
const wrong = list => [...new Set([...offScreen(list), ...offUrl(list)])];
const describe = list => list.slice(0, 4).map(c => `${c.id}: ${c.surface} said ${c.verdict} at ${c.at}ms (card on screen: ${c.hero || "none"})`).join("; ");

async function openGuide(page) {
  await page.waitForFunction(() => Boolean(window.FlipForgeGuidedMode), null, { timeout: 10_000 });
  await page.evaluate(() => window.FlipForgeGuidedMode.open());
}

async function heroVerdict(page, id, timeout = SLOW_MS + 6000) {
  await page.waitForFunction(expected => {
    const node = document.querySelector("#main-content .customer-intelligence-hero .staging-status");
    return String(node?.textContent || "").trim().toUpperCase() === expected;
  }, cards[id].recommendation, { timeout });
  await page.waitForTimeout(900); // let every injected surface settle on the loaded record
}

async function surfacesAfterLoad(page) {
  // Private Beta Guided Mode now starts minimized after a full page load (it never auto-opens). The check below is that the
  // guide, once the tester opens it, names the saved verdict, so open it when the load restarted the page.
  const opened = await page.evaluate(() => {
    if (document.querySelector("#ff-guided-mode-root .ff-guide-panel") || !window.FlipForgeGuidedMode?.open) return false;
    window.FlipForgeGuidedMode.open();
    return true;
  });
  if (opened) await page.waitForTimeout(900);
  return page.evaluate(() => {
    const guide = document.querySelector("#main-content [data-ff-p3-result-guide]");
    const pill = document.querySelector("#main-content [data-ff-decision-summary] .ff-decision-summary-pill");
    const title = document.querySelector("#ff-guided-mode-root .ff-guide-panel h2");
    const stack = document.querySelector("#main-content [data-ff-cdi-stack-host]");
    return {
      // The reading guide steps aside once the full decision panel renders (by design); otherwise it must be present.
      guide: guide ? String(guide.dataset.decision || "").toUpperCase() : stack ? "REPLACED" : "",
      panel: (String(stack?.innerText || "").match(/FlipForge said (BUY|WATCH|VERIFY|PASS)\b/) || [])[1] || "",
      pill: pill && !pill.closest("[hidden]") ? String(pill.textContent || "").trim().toUpperCase() : "",
      guided: (String(title?.textContent || "").match(/Start here:\s*(\w+)/i) || [])[1]?.toUpperCase() || ""
    };
  });
}

async function midLoadSurfaces(page) {
  return page.evaluate(() => ({
    loading: /Loading card intelligence/i.test(document.querySelector("#main-content")?.textContent || ""),
    hero: Boolean(document.querySelector("#main-content .customer-intelligence-hero")),
    guide: Boolean(document.querySelector("#main-content [data-ff-p3-result-guide]")),
    summaryShown: [...document.querySelectorAll("#main-content [data-ff-decision-summary]")].some(node => !node.hidden && node.getClientRects().length),
    guidedTitle: String(document.querySelector("#ff-guided-mode-root .ff-guide-panel h2")?.textContent || "").trim()
  }));
}

try {
  // S1: each verdict, opened from the Dashboard (the production path) behind a 10.5 s response.
  for (const id of ids) {
    const { context, page } = await newSession();
    const verdict = cards[id].recommendation;
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await openGuide(page);
    await page.waitForTimeout(1200);
    clearBehavior();
    setBehavior(id, { delayMs: SLOW_MS });
    await claims(page);
    await page.evaluate(target => { location.hash = `#/opportunities/${target}`; }, id);
    await page.waitForTimeout(5000);
    const mid = await midLoadSurfaces(page);
    check(`S1 ${verdict}: 5 s into a slow load the page shows a neutral loading state (no guide, no summary, no verdict in Guided Mode)`,
      mid.loading && !mid.hero && !mid.guide && !mid.summaryShown && !/Start here:\s*(BUY|WATCH|VERIFY|PASS)/i.test(mid.guidedTitle), JSON.stringify(mid));
    await heroVerdict(page, id);
    const seen = await claims(page);
    const bad = wrong(seen);
    check(`S1 ${verdict}: no surface ever named another verdict during the ${SLOW_MS / 1000} s load or after it`, bad.length === 0, describe(bad));
    const after = await surfacesAfterLoad(page);
    check(`S1 ${verdict}: once loaded, the decision panel and Guided Mode say ${verdict} (reading guide says ${verdict} or has handed over to the panel)`,
      after.panel === verdict && after.guided === verdict && (after.guide === verdict || after.guide === "REPLACED") && (!after.pill || after.pill === verdict), JSON.stringify(after));
    await context.close();
  }

  // S2: the founder's case - a direct, fresh load of the saved Ohtani PSA 9 WATCH behind a 10.5 s response.
  {
    const { context, page } = await newSession();
    clearBehavior();
    setBehavior("qa-verdict-watch", { delayMs: SLOW_MS });
    await page.goto(`${baseUrl}/#/opportunities/qa-verdict-watch`, { waitUntil: "domcontentloaded" });
    await openGuide(page);
    await heroVerdict(page, "qa-verdict-watch");
    const seen = await claims(page);
    const buy = seen.filter(claim => claim.verdict !== "WATCH");
    check("S2 Ohtani PSA 9 saved WATCH (direct load, 10.5 s): never displays BUY or any other verdict, even for one frame", buy.length === 0, describe(buy));
    const after = await surfacesAfterLoad(page);
    check("S2 Ohtani PSA 9: after load the decision panel and Guided Mode say WATCH", after.panel === "WATCH" && after.guided === "WATCH"
      && (after.guide === "WATCH" || after.guide === "REPLACED") && (!after.pill || after.pill === "WATCH"), JSON.stringify(after));
    await context.close();
  }

  // S3: failed requests - fast failure and a failure after 10.5 s. No verdict may be claimed at any point.
  for (const delayMs of [0, SLOW_MS]) {
    const { context, page } = await newSession();
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
    await openGuide(page);
    await page.waitForTimeout(1200);
    clearBehavior();
    setBehavior("qa-verdict-watch", { delayMs, fail: true });
    await claims(page);
    await page.evaluate(() => { location.hash = "#/opportunities/qa-verdict-watch"; });
    await page.waitForFunction(() => !/Loading card intelligence/i.test(document.querySelector("#main-content")?.textContent || "")
      && /#\/opportunities\/qa-verdict-watch/.test(location.hash), null, { timeout: delayMs + 8000 });
    await page.waitForTimeout(1500);
    const seen = await claims(page);
    const state = await midLoadSurfaces(page);
    check(`S3 failed request (${delayMs ? "after 10.5 s" : "immediate"}): no verdict is claimed anywhere and no guide is shown`,
      seen.length === 0 && !state.hero && !state.guide && !state.summaryShown, `${describe(seen)} ${JSON.stringify(state)}`);
    await context.close();
  }

  // S4: switching cards. (a) loaded BUY -> slow WATCH, (b) switch away while still loading, (c) through all four.
  {
    const { context, page } = await newSession();
    clearBehavior();
    await page.goto(`${baseUrl}/#/opportunities/qa-verdict-buy`, { waitUntil: "domcontentloaded" });
    await openGuide(page);
    await heroVerdict(page, "qa-verdict-buy");
    await claims(page);
    setBehavior("qa-verdict-watch", { delayMs: SLOW_MS });
    await page.evaluate(() => { location.hash = "#/opportunities/qa-verdict-watch"; });
    await heroVerdict(page, "qa-verdict-watch");
    let seen = await claims(page);
    check("S4a loaded BUY -> slow WATCH: no BUY claim once the BUY card has left the screen, and none while WATCH loads",
      offScreen(seen).length === 0 && !seen.some(c => c.verdict === "BUY" && c.hero !== "BUY"), describe(offScreen(seen)));
    check("S4a positive: the WATCH card is then explained as WATCH", seen.some(c => c.id === "qa-verdict-watch" && c.surface === "decision panel" && c.verdict === "WATCH"), describe(seen));

    clearBehavior();
    setBehavior("qa-verdict-pass", { delayMs: SLOW_MS });
    await page.evaluate(() => { location.hash = "#/opportunities/qa-verdict-pass"; });
    await page.waitForTimeout(3000);
    await page.evaluate(() => { location.hash = "#/opportunities/qa-verdict-verify"; });
    await heroVerdict(page, "qa-verdict-verify");
    await page.waitForTimeout(SLOW_MS - 2000); // the abandoned PASS response arrives late; it must not repaint
    seen = await claims(page);
    check("S4b switching away mid-load: every claim matches the card on screen, including when the abandoned response arrives",
      offScreen(seen).length === 0, describe(offScreen(seen)));

    clearBehavior();
    for (const id of ["qa-verdict-pass", "qa-verdict-buy", "qa-verdict-watch", "qa-verdict-verify", "qa-verdict-buy"]) {
      await page.evaluate(target => { location.hash = `#/opportunities/${target}`; }, id);
      await heroVerdict(page, id, 10_000);
    }
    seen = await claims(page);
    check("S4c rapid switching through all four verdicts: every claim matches the card on screen in every frame", offScreen(seen).length === 0, describe(offScreen(seen)));
    await context.close();
  }
} catch (error) {
  failures.push(`audit did not complete: ${error.message.split("\n")[0]}`);
} finally {
  await browser.close();
}

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`Saved verdict loading audit: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
