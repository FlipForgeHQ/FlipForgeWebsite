// The Private Beta workspace (/app/beta, saas-prototype/index.html) never shows prototype sample records - on any
// route, at any moment during load - and an address that matches no FlipForge page says so at once with a link Home.
//
// Regression found live on production /app/beta on 2026-10-19: #/saved-decisions (not a FlipForge route) fell through
// app.js's router default to the prototype dashboard built from mock-data.js ($18,420 portfolio, "+3.8% prototype
// trend", sample BUY rows such as "Ohtani Chrome Refractor PSA 10"). On a first visit it was painted for about 1-1.5 s
// before private-beta.js replaced it with Getting Started on a later animation frame.
//
// The page is loaded from the local static server (saas-prototype/serve.mjs, which mirrors the _redirects rewrite of
// /app/beta/* to saas-prototype/*) both as the production host (goflipforge.com mapped to 127.0.0.1) and as a local
// preview host. Every /api/v1 response is a synthetic fixture: no network, no provider calls.
//
// For each of #/beta-start, #/dashboard, #/saved-decisions and a random unknown route, <main> text is sampled every
// 50 ms from document start until 5 s after load, and every node a MutationObserver sees added is scanned as well (so
// content added and removed between samples is still caught). None of the prototype strings may ever appear.
import { chromium } from "playwright";

const PORT = process.env.FLIPFORGE_BETA_SAMPLE_AUDIT_PORT || "4173";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE || undefined;
const HOSTS = [
  ["production host", `http://goflipforge.com:${PORT}/app/beta/`],
  ["preview host", `http://127.0.0.1:${PORT}/app/beta/`]
];
const MOCK_STRINGS = ["18,420", "prototype trend", "Ohtani Chrome Refractor", "Mahomes Silver Prizm"];
const SAMPLE_WINDOW_MS = 5000;
const email = "beta-sample-audit@flipforge.test";
const unknownRoute = `zz-unknown-${Math.random().toString(36).slice(2, 8)}`;
const ROUTES = ["beta-start", "dashboard", "saved-decisions", unknownRoute];

const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

// ---------- server fixture ----------
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) }).catch(() => {});
const envelope = (correlationId, data) => ({
  meta: { contractVersion: "1.0", engineVersion: "beta-sample-audit", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence",
    correlationId, generatedAt: "2026-10-19T12:00:00Z", evidenceFreshness: "QA_FIXTURE", limitations: ["Synthetic beta sample-content audit fixture only."] },
  data
});
const card = { id: "qa-beta-buy", title: "2019 Bowman Chrome Wander Franco #BCP1 PSA 10", recommendation: "BUY", ask: 410, supportedValue: 520 };
const opportunity = () => ({ id: card.id, title: card.title, cardIdentity: card.title, recommendation: card.recommendation, ask: card.ask,
  supportedValue: card.supportedValue, confidence: 81, liquidity: 70, risk: 35, rank: 78, observedAt: "2026-10-06T23:54:44Z", platform: "EBAY",
  mappingState: "CONFIRMED", governedDecision: { recommendation: "BUY", risk: 35, confidence: 81 }, evidence: { acceptedSales: 6 } });

async function fixture(route) {
  const url = new URL(route.request().url());
  const method = route.request().method().toUpperCase();
  const cid = route.request().headers()["x-correlation-id"] || "beta-sample-audit";
  if (method !== "GET") return json(route, 405, { error: { code: "QA_READ_ONLY", message: "This audit performs no writes.", correlationId: cid } });
  const p = url.pathname;
  if (p === "/api/v1/health") return json(route, 200, envelope(cid, { status: "configured", bridgeEnabled: true }));
  if (p === "/api/v1/entitlements") return json(route, 200, envelope(cid, { kind: "entitlements", membershipActive: true, current: { code: "PRIVATE_BETA", accessState: "ACTIVE" }, plan: { code: "PRIVATE_BETA" }, usage: { completedEvaluations: 0 } }));
  if (p === "/api/v1/opportunities") return json(route, 200, envelope(cid, { kind: "opportunities", items: [opportunity()], count: 1, sourceOfTruth: "SQLite", transactionAuthority: false }));
  if (p === "/api/v1/dashboard") return json(route, 200, envelope(cid, { metrics: { trackedOpportunities: 1, evidenceReady: 1, populationContextAvailable: 0, needsVerification: 0 }, items: [opportunity()] }));
  if (p === "/api/v1/lifecycle") return json(route, 200, envelope(cid, { kind: "lifecycle", sourceOfTruth: "SQLite", items: [], transactionAuthority: false }));
  return json(route, 404, { error: { code: "QA_NOT_MOCKED", message: p, correlationId: cid } });
}

// ---------- in-page recorder (installed before any app script) ----------
function recorder({ strings, intervalMs }) {
  const state = window.__ffBetaSamples = { samples: 0, hits: [], inserted: [], notFoundAt: [], startedAt: performance.now() };
  const hit = text => (typeof text === "string" && text) ? strings.find(s => text.includes(s)) : undefined;
  const mainEl = () => document.querySelector("main") || document.querySelector("#main-content");
  const route = () => String(location.hash || "");
  state.tick = () => {
    const main = mainEl();
    state.samples += 1;
    if (!main) return;
    const text = `${main.innerText || ""}\n${main.textContent || ""}`;
    const h = hit(text);
    if (h) state.hits.push({ at: Math.round(performance.now()), route: route(), sample: h });
    if (main.querySelector("[data-ff-route-not-found]")) state.notFoundAt.push({ at: Math.round(performance.now()), route: route() });
  };
  setInterval(state.tick, intervalMs);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") { const h = hit(record.target.data); if (h) state.inserted.push({ route: route(), sample: h }); continue; }
      for (const node of record.addedNodes) {
        const h = hit(node.textContent || "");
        if (h) state.inserted.push({ route: route(), sample: h });
      }
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
}

const browser = await chromium.launch({ executablePath, args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"] });
async function session({ onboardingComplete }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (onboardingComplete) await context.addInitScript(() => { try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); } catch (_) {} });
  await context.addInitScript(recorder, { strings: MOCK_STRINGS, intervalMs: 50 });
  await context.route(/\/assets\/js\/flipforge-identity\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${email}"}),getSnapshot:()=>({authenticated:true,email:"${email}",fullName:"Beta Sample Audit",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${email}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"t"});` }));
  await context.route(/\/assets\/js\/flipforge-production-signin\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/v1/**", fixture);
  const page = await context.newPage();
  const errors = [];
  const sampleScripts = [];
  page.on("pageerror", e => errors.push(e.message.slice(0, 160)));
  page.on("request", request => { if (/\/(?:mock-data|feature-data)\.js(?:\?|$)/.test(request.url())) sampleScripts.push(request.url()); });
  return { context, page, errors, sampleScripts };
}
const read = page => page.evaluate(() => {
  const s = window.__ffBetaSamples;
  const main = document.querySelector("#main-content");
  return { samples: s.samples, hits: s.hits.splice(0), inserted: s.inserted.splice(0), notFoundAt: s.notFoundAt.splice(0), hash: location.hash,
    notFound: Boolean(main?.querySelector("[data-ff-route-not-found]")), homeLink: Boolean(main?.querySelector('[data-ff-route-not-found] a[href="#/dashboard"]')),
    title: main?.querySelector("h1")?.textContent.trim() || "" };
});
const summary = list => [...new Set(list.map(h => `${h.route || "(start)"}: "${h.sample}"`))].slice(0, 4).join("; ");

try {
  // C0: positive control - the sampler sees a prototype string that is present for less than the sample window.
  {
    const { context, page } = await session({ onboardingComplete: true });
    await page.goto(`${HOSTS[1][1]}#/dashboard`, { waitUntil: "load" });
    // The control must test the sampler, not race the app: on a slow runner the Dashboard's own render (after its data
    // arrives) can replace #main-content inside the 150 ms window and wipe the test string before the first tick. Wait
    // for the page to settle, and discard an attempt the app wiped early (it says nothing about the sampler).
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    let r = { hits: [], inserted: [] };
    let valid = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await read(page); // clear anything recorded before this attempt
      const wiped = await page.evaluate(async sample => {
        const d = document.createElement("div");
        d.textContent = `Portfolio value $${sample}`;
        document.querySelector("#main-content").appendChild(d);
        await new Promise(resolve => setTimeout(resolve, 150));
        const removedByApp = !d.isConnected;
        d.remove();
        return removedByApp;
      }, MOCK_STRINGS[0]);
      await page.waitForTimeout(250);
      r = await read(page);
      if (wiped) continue;
      valid += 1;
      break;
    }
    check("C0 control: a prototype string shown for 150 ms is caught by the 50 ms sampler and the insertion recorder",
      valid === 1 && r.hits.length >= 1 && r.inserted.length >= 1, `${r.hits.length} samples, ${r.inserted.length} insertions, valid attempts ${valid}`);
    await context.close();
  }

  for (const [hostLabel, app] of HOSTS) {
    // B1: direct load of every route; first visit (Getting Started not yet completed) and returning visit.
    for (const onboardingComplete of [false, true]) {
      const visit = onboardingComplete ? "returning visit" : "first visit";
      for (const route of ROUTES) {
        const label = route === unknownRoute ? "#/<random unknown route>" : `#/${route}`;
        const { context, page, errors, sampleScripts } = await session({ onboardingComplete });
        await page.goto(`${app}#/${route}`, { waitUntil: "load" });
        await page.waitForTimeout(SAMPLE_WINDOW_MS);
        const r = await read(page);
        check(`B1 ${hostLabel}, ${visit}, direct ${label}: <main> never contains a prototype string (sampled every 50 ms for 5 s after load)`,
          r.samples >= 90 && r.hits.length === 0, `${r.samples} samples; ${summary(r.hits)}`);
        check(`B1 ${hostLabel}, ${visit}, direct ${label}: no node with a prototype string is ever added`, r.inserted.length === 0, summary(r.inserted));
        check(`B1 ${hostLabel}, ${visit}, direct ${label}: mock-data.js and feature-data.js are never requested`, sampleScripts.length === 0, sampleScripts.join(", "));
        if (onboardingComplete && route !== "beta-start" && route !== "dashboard") {
          check(`B1 ${hostLabel}, ${visit}, direct ${label}: shows "Page not available" with a link Home (#/dashboard)`,
            r.notFound && r.homeLink && r.title === "Page not available", `hash=${r.hash} title="${r.title}"`);
        }
        check(`B1 ${hostLabel}, ${visit}, direct ${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
        await context.close();
      }
    }

    // B2: in-app navigation from a settled page to each route; an unknown route says "Page not available" at once.
    {
      const { context, page, errors, sampleScripts } = await session({ onboardingComplete: true });
      await page.goto(`${app}#/dashboard`, { waitUntil: "load" });
      await page.waitForTimeout(1500);
      await read(page);
      for (const route of [...ROUTES, "dashboard", `another-${unknownRoute}`]) {
        const label = route.includes(unknownRoute) ? "#/<random unknown route>" : `#/${route}`;
        const before = await page.evaluate(() => performance.now());
        await page.evaluate(h => { location.hash = h; }, `#/${route}`);
        if (route === "saved-decisions" || route.includes(unknownRoute)) {
          const shown = await page.waitForFunction(() => document.querySelector("#main-content [data-ff-route-not-found]"), null, { timeout: 2000 }).then(() => true).catch(() => false);
          const at = await page.evaluate(() => performance.now());
          check(`B2 ${hostLabel}: in-app ${label} immediately shows "Page not available" with a link Home`, shown && at - before < 500
            && await page.locator('#main-content [data-ff-route-not-found] a[href="#/dashboard"]').count() === 1, `${Math.round(at - before)} ms`);
        }
        await page.waitForTimeout(SAMPLE_WINDOW_MS);
        const r = await read(page);
        check(`B2 ${hostLabel}: in-app ${label} - <main> never contains a prototype string for 5 s`, r.hits.length === 0 && r.inserted.length === 0, summary([...r.hits, ...r.inserted]));
        if (route === "saved-decisions" || route.includes(unknownRoute)) {
          check(`B2 ${hostLabel}: in-app ${label} still shows "Page not available" after 5 s`, r.notFound && r.homeLink, `title="${r.title}"`);
        }
      }
      check(`B2 ${hostLabel}: mock-data.js and feature-data.js are never requested`, sampleScripts.length === 0, sampleScripts.join(", "));
      check(`B2 ${hostLabel}: no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
      await context.close();
    }
  }
} catch (error) {
  failures.push(`audit did not complete: ${String(error.message || error).split("\n")[0]}`);
} finally {
  await browser.close();
}

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) {
  console.log(`FAIL ${line}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Beta sample-content audit::${line.replace(/[\r\n]+/g, " ").slice(0, 900)}`);
}
console.log(`\nPrivate Beta sample-content audit: ${passes.length}/${passes.length + failures.length} passed.`);
process.exit(failures.length ? 1 : 0);
