// Live customer views never contain prototype sample records, and a card switch never shows one card's name over
// another card's saved decision - in the final page, in any intermediate DOM state, and in any painted frame.
//
// Regressions found live on production /app/beta on 2026-10-18:
//   1. On every route change the prototype router (app.js) and feature-pages.js wrote sample records from
//      mock-data.js / feature-data.js into #main-content - on a saved card it wrote the sample "Ohtani Chrome Refractor
//      PSA 10" BUY - and the authoritative renderer replaced them about 1 ms later. Final pages were correct, so every
//      existing audit passed.
//   2. Tracking: the card selector showed the newly chosen card while the previous card's saved decision stayed on the
//      page until the hashchange render, a later task that the browser may paint before.
//
// Production host behaviour (goflipforge.com mapped to the local server), every app script, server responses mocked.
// Three independent detectors:
//   - intermediate DOM: innerHTML/outerHTML/insertAdjacentHTML writes and every node a MutationObserver sees added are
//     scanned for sample-record identities, so content inserted and removed before a paint is still caught;
//   - task boundary: after a Tracking selection, the end of the selecting task and the start of the next task are
//     checked (the browser can only paint between tasks);
//   - painted frames: an animation-frame sampler (after the app's own pre-paint callbacks), and Chrome's screencast of
//     composited frames with sample content force-coloured magenta (with a positive control proving the detector
//     sees a painted frame).
// Synthetic fixtures only: no network, no provider calls.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { chromium } from "playwright";

const root = process.cwd();
const ORIGIN = process.env.FLIPFORGE_LIVE_VIEW_AUDIT_ORIGIN || "http://goflipforge.com:4173";
const APP = `${ORIGIN}/app/beta/`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE || undefined;
const email = "live-view-integrity-audit@flipforge.test";

const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

// Synthetic saved cards (the same identities as the 2026-10-13 card-switch audit).
const cards = {
  "qa-verdict-buy": { title: "2018 Topps Chrome Shohei Ohtani #150 PSA 10", recommendation: "BUY", ask: 1215, supportedValue: 1675, acceptedSales: 227, tracking: "WATCHING" },
  "qa-verdict-watch": { title: "2018 Topps Chrome Shohei Ohtani #150 PSA 9", recommendation: "WATCH", ask: 760, supportedValue: 850, acceptedSales: 40, tracking: "REVIEW" },
  "qa-verdict-verify": { title: "2018 Topps Update Ronald Acuna Jr. #US250 PSA 10", recommendation: "VERIFY", ask: 310, supportedValue: 295, acceptedSales: 2, tracking: "WATCHING" },
  "qa-verdict-pass": { title: "2018 Prizm Luka Doncic #280 PSA 10", recommendation: "PASS", ask: 220, supportedValue: 199, acceptedSales: 9, tracking: "PASSED" }
};
const ids = Object.keys(cards);
const titles = ids.map(id => cards[id].title);

// Sample-record identities, read from the prototype data files themselves so new sample records are covered.
function sampleIdentities() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of ["saas-prototype/mock-data.js", "saas-prototype/feature-data.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  const found = new Set();
  const walk = (value, key, depth) => {
    if (depth > 8 || value == null) return;
    if (typeof value === "string") {
      if (["card", "shortCard", "target"].includes(key) && /PSA|BGS|SGC|Refractor|Prizm|Raw/i.test(value)) found.add(value);
      if (key === "id" && /^(?:opp|sell|alert|listing|holding)-/.test(value)) found.add(value);
      return;
    }
    if (typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, Array.isArray(value) ? key : k, depth + 1);
  };
  walk(sandbox.window.FlipForgePrototypeData, "", 0);
  walk(sandbox.window.FlipForgeSaaSFeatureData, "", 0);
  const lowerTitles = titles.map(t => t.toLowerCase());
  return [...found].filter(s => s.length >= 8 && !lowerTitles.includes(s.toLowerCase()));
}
const samples = sampleIdentities();
check("000 sample-record identities loaded from mock-data.js and feature-data.js", samples.length >= 10 && samples.includes("Ohtani Chrome Refractor PSA 10") && samples.includes("opp-ohtani-150"), `${samples.length}`);

// ---------- server fixture ----------
const delays = new Map(); // "<kind>:<id>" -> ms
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) }).catch(() => {});
const envelope = (correlationId, data) => ({
  meta: { contractVersion: "1.0", engineVersion: "live-view-integrity-audit", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence",
    correlationId, generatedAt: "2026-10-18T12:00:00Z", evidenceFreshness: "QA_FIXTURE", limitations: ["Synthetic live-view integrity audit fixture only."] },
  data
});
const opportunity = id => ({ id, title: cards[id].title, cardIdentity: cards[id].title, recommendation: cards[id].recommendation, ask: cards[id].ask,
  supportedValue: cards[id].supportedValue, confidence: 83, liquidity: 75, risk: 35, rank: 80, observedAt: "2026-10-06T23:54:44Z", platform: "EBAY",
  mappingState: "CONFIRMED", evidence: { acceptedSales: cards[id].acceptedSales } });
const snapshot = id => ({ opportunityId: id, trackingStatus: cards[id].tracking, outcomeStatus: "NONE", reviewAt: null, alertEnabled: false,
  acquisitionCostCents: null, acquiredAt: null, dispositionProceedsCents: null, disposedAt: null, version: 1 });
const timeline = id => ({ kind: "decision-timeline", opportunityId: id, available: true, timelineVersion: "v1.5.0", snapshotCount: 1, changedEntryCount: 0,
  historicalSnapshotsImmutable: true, historicalRescoring: false, historicalBackfill: false, transactionAuthority: false,
  entries: [{ requestId: `qa-t0-${id}`, evaluatedAt: "2026-10-06T23:54:44Z", cardIdentity: cards[id].title, marketplace: "EBAY", decision: cards[id].recommendation,
    workflowStatus: cards[id].tracking, allInAskCents: cards[id].ask * 100, supportedValueCents: cards[id].supportedValue * 100, evidenceQuality: "QA_FIXTURE",
    acceptedEvidenceCount: cards[id].acceptedSales, reviewEvidenceCount: 0, rejectedEvidenceCount: 0, confidence: 83, risk: 35, exactIdentityEligible: true,
    decisionContractAvailable: true, profitabilitySnapshotPresent: false, whatWouldChange: [], immutable: true, changedFromPrevious: false, changes: [], whatChanged: [] }] });

async function fixture(route) {
  const url = new URL(route.request().url());
  const method = route.request().method().toUpperCase();
  const cid = route.request().headers()["x-correlation-id"] || "live-view-integrity";
  if (method !== "GET") return json(route, 405, { error: { code: "QA_READ_ONLY", message: "This audit performs no writes.", correlationId: cid } });
  const p = url.pathname;
  const record = p.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor|lifecycle)\/([^/]+)$/);
  if (record) {
    const [, kind, encoded] = record;
    const id = decodeURIComponent(encoded);
    const delay = delays.get(`${kind}:${id}`) || 0;
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (!cards[id]) return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Unknown synthetic record.", correlationId: cid } });
    if (kind === "opportunities") return json(route, 200, envelope(cid, { kind: "opportunity-detail", opportunity: opportunity(id), sourceOfTruth: "SQLite", transactionAuthority: false }));
    if (kind === "evidence") return json(route, 200, envelope(cid, { kind: "evidence", opportunityId: id, acceptedExactCompletedSales: cards[id].acceptedSales, visibleButAuthorityIneligible: 0, acceptedSales: [], excludedSales: [], transactionAuthority: false }));
    if (kind === "psa-advisor") return json(route, 200, envelope(cid, { kind: "psa-advisor", opportunityId: id, guidanceStatus: "NOT_AVAILABLE", recalculated: false, transactionAuthority: false, sourceOfTruth: "Existing PSA intelligence" }));
    return json(route, 200, envelope(cid, { kind: "lifecycle-detail", opportunityId: id, sourceOfTruth: "SQLite", lifecycle: snapshot(id),
      history: [{ recordedAt: "2026-10-06T23:54:44Z", eventType: "CREATED", trackingStatus: cards[id].tracking, outcomeStatus: "NONE", recordVersion: 1 }], decisionTimeline: timeline(id), transactionAuthority: false }));
  }
  if (p === "/api/v1/health") return json(route, 200, envelope(cid, { status: "configured", bridgeEnabled: true }));
  if (p === "/api/v1/entitlements") return json(route, 200, envelope(cid, { kind: "entitlements", membershipActive: true, current: { code: "PRIVATE_BETA", accessState: "ACTIVE" }, plan: { code: "PRIVATE_BETA" }, usage: { completedEvaluations: 0 } }));
  if (p === "/api/v1/opportunities") return json(route, 200, envelope(cid, { kind: "opportunities", items: ids.map(opportunity), count: ids.length, sourceOfTruth: "SQLite", transactionAuthority: false }));
  if (p === "/api/v1/dashboard") return json(route, 200, envelope(cid, { metrics: { trackedOpportunities: ids.length, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 1 }, items: ids.map(opportunity) }));
  if (p === "/api/v1/lifecycle") return json(route, 200, envelope(cid, { kind: "lifecycle", sourceOfTruth: "SQLite", items: ids.map(snapshot), transactionAuthority: false }));
  return json(route, 404, { error: { code: "QA_NOT_MOCKED", message: p, correlationId: cid } });
}

// ---------- in-page recorders (installed before any app script) ----------
function recorders({ samples, titles }) {
  const state = window.__ffIntegrity = { writes: [], inserted: [], frames: [], taskChecks: [], route: () => String(location.hash || "").replace(/^#\/?/, "").split("?")[0] };
  const hit = text => (typeof text === "string" && text) ? samples.find(s => text.includes(s)) : undefined;
  const caller = () => (new Error().stack || "").split("\n").map(s => s.trim()).filter(s => /\.js/.test(s) && !/__ffIntegrity|recorders/.test(s)).slice(1, 2).join("")
    .replace(/https?:\/\/[^/]+\/app\/beta\//, "");
  // 1. Every HTML write.
  const wrap = (proto, prop) => {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    Object.defineProperty(proto, prop, { configurable: true, get: d.get, set(value) { const h = hit(value); if (h) state.writes.push({ route: state.route(), via: prop, sample: h, by: caller() }); return d.set.call(this, value); } });
  };
  wrap(Element.prototype, "innerHTML");
  wrap(Element.prototype, "outerHTML");
  const insert = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (position, value) { const h = hit(value); if (h) state.writes.push({ route: state.route(), via: "insertAdjacentHTML", sample: h, by: caller() }); return insert.call(this, position, value); };
  // 2. Every node added to the document (records keep removed nodes, so add-then-remove is still seen). Sample content
  //    is also marked so the paint detector can colour it.
  const mark = node => { const el = node.nodeType === 1 ? node : node.parentElement; if (el && el.isConnected) el.setAttribute("data-ff-qa-sample", ""); };
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") { const h = hit(record.target.data); if (h) { state.inserted.push({ route: state.route(), sample: h }); mark(record.target); } continue; }
      for (const node of record.addedNodes) {
        const h = hit(node.textContent || "") || (node.nodeType === 1 ? hit(node.outerHTML) : undefined);
        if (h) { state.inserted.push({ route: state.route(), sample: h }); mark(node); }
      }
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  const style = () => { const s = document.createElement("style"); s.textContent = "[data-ff-qa-sample]{background:#ff00ff!important;color:#ff00ff!important;outline:300vmax solid #ff00ff!important;outline-offset:-1px!important;visibility:visible!important;opacity:1!important}"; document.head.appendChild(s); };
  if (document.head) style(); else document.addEventListener("DOMContentLoaded", style, { once: true });

  // What saved card(s) the page shows outside the card selector.
  const shownCards = main => {
    const found = new Set();
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement?.closest("select,option,[hidden]")) continue;
      const t = n.data;
      for (const title of titles) if (t.includes(title)) found.add(title);
    }
    return [...found];
  };
  state.snapshot = () => {
    const main = document.querySelector("#main-content");
    const select = main?.querySelector("select[data-lifecycle-select]");
    return { route: state.route(), selected: select ? String(select.selectedOptions[0]?.dataset.ffTrackingBaseLabel || select.selectedOptions[0]?.textContent || "").replace(/\s+·\s+saved.*$/, "").trim() : null,
      shown: main ? shownCards(main) : [], sample: hit(main?.innerText || ""), pending: Boolean(main?.querySelector("[data-ff-route-pending]")), unavailable: Boolean(main?.querySelector("[data-ff-route-unavailable]")) };
  };
  // 3. Animation-frame sampler, installed after the app's own pre-paint callbacks.
  let last = "";
  const sample = () => {
    const s = state.snapshot();
    const key = JSON.stringify(s);
    if (key !== last) { last = key; state.frames.push({ at: Math.round(performance.now()), ...s }); }
    requestAnimationFrame(sample);
  };
  window.addEventListener("load", () => requestAnimationFrame(sample), { once: true });
  // 4. Task boundary after a Tracking selection: the end of the selecting task, and the start of the next task.
  window.addEventListener("change", event => {
    if (!event.target?.matches?.("select[data-lifecycle-select]")) return;
    const chosen = String(event.target.selectedOptions[0]?.dataset.ffTrackingBaseLabel || event.target.selectedOptions[0]?.textContent || "").replace(/\s+·\s+saved.*$/, "").trim();
    const endOfTask = state.snapshot();
    const channel = new MessageChannel();
    channel.port1.onmessage = () => state.taskChecks.push({ chosen, endOfTask, nextTask: state.snapshot() });
    channel.port2.postMessage(0);
  });
}

// ---------- screencast (composited frames) ----------
async function startScreencast(page) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async event => {
    frames.push(event.data);
    await cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 480, maxHeight: 480, everyNthFrame: 1 });
  return { frames, stop: () => cdp.send("Page.stopScreencast").catch(() => {}) };
}
let decoder;
async function magentaFrames(frames) {
  if (!decoder) {
    const context = await browser.newContext();
    decoder = await context.newPage();
    await decoder.setContent("<canvas></canvas>");
  }
  let hits = 0;
  for (let i = 0; i < frames.length; i += 20) {
    hits += await decoder.evaluate(async batch => {
      let count = 0;
      const canvas = document.querySelector("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      for (const b64 of batch) {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${b64}`;
        await img.decode();
        canvas.width = img.width; canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, img.width, img.height).data;
        let magenta = 0;
        for (let p = 0; p < px.length; p += 16) if (px[p] > 200 && px[p + 1] < 70 && px[p + 2] > 200) magenta += 1;
        if (magenta / (px.length / 16) > 0.02) count += 1;
      }
      return count;
    }, frames.slice(i, i + 20));
  }
  return hits;
}

// ---------- session ----------
const browser = await chromium.launch({ executablePath, args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"] });
async function session(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => { try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); } catch (_) {} });
  await context.addInitScript(recorders, { samples, titles });
  await context.route(/\/assets\/js\/flipforge-identity\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${email}"}),getSnapshot:()=>({authenticated:true,email:"${email}",fullName:"Integrity Audit",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${email}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"t"});` }));
  await context.route(/\/assets\/js\/flipforge-production-signin\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/v1/**", fixture);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message.slice(0, 160)));
  return { context, page, errors };
}
const drain = page => page.evaluate(() => { const s = window.__ffIntegrity; const out = { writes: s.writes.splice(0), inserted: s.inserted.splice(0), frames: s.frames.splice(0), taskChecks: s.taskChecks.splice(0) }; return out; });
const go = (page, hash) => page.evaluate(h => { location.hash = h; }, hash);
const summary = list => [...new Set(list.map(w => `${w.route || "(start)"}: "${w.sample}"${w.by ? ` by ${w.by}` : ""}`))].slice(0, 6).join("; ");
async function settle(page, ms = 1200) {
  await page.waitForFunction(() => !document.querySelector("#main-content [data-ff-route-pending]"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

const ROUTES = ["dashboard", "discover", "evaluate", "opportunities", "opportunities/qa-verdict-watch", "tracking", "tracking/qa-verdict-buy", "portfolio",
  "alerts", "account", "forge-heat", "market-view", "compare", "psa-advisor", "evidence", "sell", "export", "decision-intelligence", "beta-start"];

try {
  // L0: positive control - the paint detector sees sample content that is actually painted.
  {
    const { context, page } = await session();
    await page.goto(`${APP}#/dashboard`, { waitUntil: "load" });
    await settle(page);
    const cast = await startScreencast(page);
    await page.waitForTimeout(300);
    await page.evaluate(sample => { const d = document.createElement("div"); d.textContent = sample; d.style.cssText = "position:fixed;inset:0;z-index:2147483647"; document.body.appendChild(d); setTimeout(() => d.remove(), 400); }, samples[0]);
    await page.waitForTimeout(900);
    await cast.stop();
    const painted = await magentaFrames(cast.frames);
    check("L0 control: a painted frame containing sample content is detected by the screencast detector", painted >= 1, `${painted}/${cast.frames.length} frames`);
    await context.close();
  }

  // L1: every route, as a navigation inside the workspace and as a direct link.
  for (const [mode, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const { context, page, errors } = await session(viewport);
    await page.goto(`${APP}#/dashboard`, { waitUntil: "load" });
    await settle(page);
    const cast = await startScreencast(page);
    const finals = [];
    for (const route of ROUTES) {
      await go(page, `#/${route}`);
      await settle(page, 900);
      finals.push({ route, ...(await page.evaluate(() => window.__ffIntegrity.snapshot())) });
    }
    await cast.stop();
    const seen = await drain(page);
    const painted = await magentaFrames(cast.frames);
    check(`L1 ${mode}: no sample record is written into the page on any route change (intermediate DOM)`, seen.writes.length === 0, summary(seen.writes));
    check(`L1 ${mode}: no node containing a sample record is ever added to the page (intermediate DOM)`, seen.inserted.length === 0, summary(seen.inserted));
    check(`L1 ${mode}: no animation frame shows a sample record`, !seen.frames.some(f => f.sample), summary(seen.frames.filter(f => f.sample)));
    check(`L1 ${mode}: no composited frame shows a sample record (screencast)`, painted === 0, `${painted}/${cast.frames.length} frames`);
    const unowned = finals.filter(f => f.pending || f.unavailable || f.sample);
    check(`L1 ${mode}: every route ends in its authoritative page (never the placeholder, "didn't load", or sample data)`, unowned.length === 0, unowned.map(f => f.route).join(", "));
    check(`L1 ${mode}: no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
    await context.close();

    // Direct links (first render at page load).
    for (const route of ["dashboard", "opportunities/qa-verdict-watch", "tracking/qa-verdict-pass", "discover", "compare", "psa-advisor"]) {
      const s = await session(viewport);
      await s.page.goto(`${APP}#/${route}`, { waitUntil: "load" });
      await settle(s.page);
      const d = await drain(s.page);
      const end = await s.page.evaluate(() => window.__ffIntegrity.snapshot());
      check(`L1 ${mode}: direct link #/${route} - no sample record written, inserted or framed; authoritative page`,
        d.writes.length === 0 && d.inserted.length === 0 && !d.frames.some(f => f.sample) && !end.pending && !end.unavailable,
        `${summary([...d.writes, ...d.inserted])} pending=${end.pending} unavailable=${end.unavailable}`);
      await s.context.close();
    }
  }

  // L2: saved-card switching with out-of-order responses - no sample record and no other card at any point.
  {
    const { context, page, errors } = await session();
    await page.goto(`${APP}#/dashboard`, { waitUntil: "load" });
    await settle(page);
    delays.clear();
    delays.set("opportunities:qa-verdict-buy", 1800).set("opportunities:qa-verdict-watch", 300).set("opportunities:qa-verdict-verify", 1200);
    const cast = await startScreencast(page);
    await drain(page);
    const finals = [];
    for (let round = 0; round < 3; round += 1) {
      for (const id of ["qa-verdict-buy", "qa-verdict-watch", "qa-verdict-verify", "qa-verdict-pass"]) { await go(page, `#/opportunities/${id}`); await page.waitForTimeout(120); }
      const target = ["qa-verdict-watch", "qa-verdict-buy", "qa-verdict-verify"][round];
      await go(page, `#/opportunities/${target}`);
      await page.waitForFunction(t => document.querySelector("#main-content .customer-intelligence-hero h2")?.textContent.trim() === t, cards[target].title, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2200);
      const end = await page.evaluate(() => window.__ffIntegrity.snapshot());
      finals.push(end.shown.length === 1 && end.shown[0] === cards[target].title);
    }
    await cast.stop();
    delays.clear();
    const seen = await drain(page);
    const painted = await magentaFrames(cast.frames);
    const foreign = seen.frames.filter(f => { const m = f.route.match(/^opportunities\/(.+)$/); return m && f.shown.some(t => t !== cards[m[1]]?.title); });
    check("L2 rapid card switching with out-of-order responses: no sample record written, inserted or painted",
      seen.writes.length === 0 && seen.inserted.length === 0 && !seen.frames.some(f => f.sample) && painted === 0, `${summary([...seen.writes, ...seen.inserted])} painted=${painted}`);
    check("L2 rapid card switching: every animation frame shows only the card in the address bar, and the last card asked for wins",
      foreign.length === 0 && finals.every(Boolean), `${foreign.slice(0, 3).map(f => `${f.route} showed ${f.shown.join(" + ")}`).join("; ")} finals=${finals}`);
    check("L2 no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
    await context.close();
  }

  // L3: Tracking card selector - the previous card's saved decision is gone in the same task that picks a new card.
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const { context, page, errors } = await session(viewport);
    await page.goto(`${APP}#/tracking/qa-verdict-buy`, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector("#main-content select[data-lifecycle-select]"), null, { timeout: 15000 });
    await settle(page);
    const cast = await startScreencast(page);
    await drain(page);
    const steps = [["qa-verdict-watch", 0], ["qa-verdict-pass", 1500], ["qa-verdict-verify", 0]];
    const finals = [];
    for (const [id, slow] of steps) {
      delays.clear();
      if (slow) delays.set(`lifecycle:${id}`, slow);
      await page.locator("#main-content select[data-lifecycle-select]").selectOption(id);
      await page.waitForFunction(t => {
        const s = window.__ffIntegrity.snapshot();
        return s.selected === t && s.shown.includes(t);
      }, cards[id].title, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(600);
      const end = await page.evaluate(() => window.__ffIntegrity.snapshot());
      finals.push(end.selected === cards[id].title && end.shown.length >= 1 && end.shown.every(t => t === cards[id].title));
    }
    // Out of order: a slow selection, then a fast one before it answers; the slow answer arrives afterwards.
    delays.clear();
    delays.set("lifecycle:qa-verdict-buy", 2500);
    await page.locator("#main-content select[data-lifecycle-select]").selectOption("qa-verdict-buy").catch(() => {});
    await page.waitForTimeout(150);
    await go(page, "#/tracking/qa-verdict-watch");
    await page.waitForTimeout(3500);
    const outOfOrder = await page.evaluate(() => window.__ffIntegrity.snapshot());
    await cast.stop();
    delays.clear();
    const seen = await drain(page);
    const painted = await magentaFrames(cast.frames);
    const leftovers = seen.taskChecks.flatMap(t => [["end of the selecting task", t.endOfTask], ["start of the next task", t.nextTask]]
      .filter(([, s]) => s.shown.some(title => title !== t.chosen)).map(([when, s]) => `${when}: picked "${t.chosen}", page showed ${s.shown.join(" + ")}`));
    const frameMismatch = seen.frames.filter(f => /^tracking/.test(f.route) && f.shown.some(t => (f.selected && t !== f.selected) || (/^tracking\/(.+)/.test(f.route) && t !== cards[f.route.split("/")[1]]?.title)));
    check(`L3 ${label}: picking a card clears the previous card's saved decision before the browser can paint (task boundary)`,
      seen.taskChecks.length >= 3 && leftovers.length === 0, `${seen.taskChecks.length} selections; ${leftovers.slice(0, 3).join("; ")}`);
    check(`L3 ${label}: no animation frame shows one card in the selector and another card's details`, frameMismatch.length === 0,
      frameMismatch.slice(0, 3).map(f => `selector "${f.selected}" / URL ${f.route} / page ${f.shown.join(" + ")}`).join("; "));
    check(`L3 ${label}: each selection ends on the chosen card (including a slow one)`, finals.every(Boolean), String(finals));
    check(`L3 ${label}: a slow answer for a card the customer left never replaces the card now selected`,
      outOfOrder.selected === cards["qa-verdict-watch"].title && outOfOrder.shown.every(t => t === cards["qa-verdict-watch"].title) && outOfOrder.shown.length >= 1, JSON.stringify(outOfOrder));
    check(`L3 ${label}: no sample record written, inserted or painted on Tracking`, seen.writes.length === 0 && seen.inserted.length === 0 && painted === 0,
      `${summary([...seen.writes, ...seen.inserted])} painted=${painted}`);
    check(`L3 ${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
    await context.close();
  }
} catch (error) {
  failures.push(`audit did not complete: ${String(error.message || error).split("\n")[0]}`);
} finally {
  await browser.close();
}

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) {
  console.log(`FAIL ${line}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Live view integrity audit::${line.replace(/[\r\n]+/g, " ").slice(0, 900)}`);
}
console.log(`\nLive view integrity audit: ${passes.length}/${passes.length + failures.length} passed.`);
process.exit(failures.length ? 1 : 0);
