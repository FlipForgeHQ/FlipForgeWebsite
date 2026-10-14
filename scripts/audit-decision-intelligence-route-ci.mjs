// Decision Intelligence on the production beta path, as a signed-in member, in a foreground and a background tab.
// Regression for 2026-10-13: production /app/beta/#/decision-intelligence showed the prototype dashboard
// ("Good evening, Todd", sample figures) - briefly in a visible tab and persistently in a background tab, because the
// governed renderer only started on an animation frame. Browser fixture only: stubbed identity, mocked /api/v1.
import { chromium } from "playwright";
import { g1Items, envelope, opportunitiesData, dashboardData, detailData } from "./validate-decision-dashboard-v3.mjs";
const items = g1Items();
const failures = []; const passes = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);
const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"] });
for (const mode of ["fg", "bg"]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); } catch (_) {} });
  await context.addInitScript(() => {
    window.__protoSeen = [];
    const watch = () => { const m = document.querySelector("#main-content"); if (!m) return setTimeout(watch, 5);
      new MutationObserver(() => { if (!location.hash.includes("decision-intelligence")) return; const t = m.textContent || ""; const hit = (t.match(/Good evening, Todd|\$18,420|prototype trend|Prototype customer activity/) || [])[0]; if (hit && !window.__protoSeen.includes(hit)) window.__protoSeen.push(hit); }).observe(m, { childList: true, subtree: true, characterData: true }); };
    watch();
  });
  if (mode === "bg") await context.addInitScript(() => {
    // Background tab: Chrome delivers no animation frames until the tab is shown.
    const queued = []; const real = window.requestAnimationFrame.bind(window);
    window.__ffHidden = true;
    window.requestAnimationFrame = cb => { if (window.__ffHidden) { queued.push(cb); return queued.length; } return real(cb); };
    Object.defineProperty(document, "visibilityState", { get: () => window.__ffHidden ? "hidden" : "visible" });
    Object.defineProperty(document, "hidden", { get: () => window.__ffHidden });
    window.__ffShow = () => { window.__ffHidden = false; const list = queued.splice(0); list.forEach(cb => real(cb)); document.dispatchEvent(new Event("visibilitychange")); };
  });
  await context.route(/\/assets\/js\/flipforge-identity\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"di@flipforge.test"}),getSnapshot:()=>({authenticated:true,email:"di@flipforge.test",fullName:"DI Probe",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"di@flipforge.test"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"t"});` }));
  await context.route(/\/assets\/js\/flipforge-production-signin\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  const calls = [];
  await context.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url()); calls.push(url.pathname);
    const cid = route.request().headers()["x-correlation-id"] || "di";
    const json = (s, b) => route.fulfill({ status: s, contentType: "application/json; charset=utf-8", body: JSON.stringify(b) });
    if (url.pathname === "/api/v1/health") return json(200, envelope(cid, { status: "configured", bridgeEnabled: true }));
    if (url.pathname === "/api/v1/entitlements") return json(200, envelope(cid, { current: { code: "PRIVATE_BETA", accessState: "ACTIVE" }, usage: { completedEvaluations: 0 } }));
    if (url.pathname === "/api/v1/dashboard") return json(200, envelope(cid, dashboardData(items)));
    if (url.pathname === "/api/v1/opportunities") return json(200, envelope(cid, opportunitiesData(items)));
    if (url.pathname.startsWith("/api/v1/opportunities/")) { const id = decodeURIComponent(url.pathname.split("/").pop()); const s = items.find(e => e.id === id); return s ? json(200, envelope(cid, detailData(s))) : json(404, {}); }
    const tail = decodeURIComponent(url.pathname.split("/").pop());
    const item = items.find(e => e.id === tail);
    if (url.pathname.startsWith("/api/v1/evidence/") && item) return json(200, envelope(cid, { kind: "evidence", opportunityId: item.id, cardIdentity: item.cardIdentity, readOnly: true,
      acceptedExactCompletedSales: 0, visibleButAuthorityIneligible: 0, linkedEvidence: [], manualCandidates: [], timeline: [], currentAdmission: { admitted: 0, excluded: 0, held: 0, notUsed: 0 } }));
    if (url.pathname.startsWith("/api/v1/psa-advisor/") && item) return json(200, envelope(cid, { kind: "psa-advisor", opportunityId: item.id, cardIdentity: item.cardIdentity, readOnly: true,
      guidanceStatus: "NOT_AVAILABLE", savedPsaSnapshot: null, populationContext: null, gradingDecisionSeparate: true, acquisitionDecisionSeparate: true }));
    if (url.pathname === "/api/v1/compare") return json(200, envelope(cid, { kind: "compare", items: [] }));
    return json(404, { error: { code: "QA_NOT_MOCKED", message: url.pathname } });
  });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 160)));
  const path = "/app/beta/";
  await page.goto(`${process.env.FLIPFORGE_DI_AUDIT_ORIGIN || "http://goflipforge.com:4173"}${path}#/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { location.hash = "#/decision-intelligence"; });
  const state = async () => page.evaluate(() => {
    const m = document.querySelector("#main-content"); const t = m?.innerText || "";
    return { url: location.pathname + location.hash, h1: m?.querySelector("h1")?.textContent?.trim(), di: m?.querySelector(".ff-di-page")?.dataset.decisionIntelligenceSource || null,
      pending: !!m?.querySelector("[data-ff-route-pending]"), unavailable: !!m?.querySelector("[data-ff-route-unavailable]") || !!m?.querySelector(".ff-di-error"), proto: /Good evening|prototype contract data|sample/i.test(t), len: t.length };
  });
  await page.waitForTimeout(4000);
  const hidden = await state();
  check(`${mode}: governed server page renders${mode === "bg" ? " while the tab is still in the background" : ""}`, hidden.di === "server" && !hidden.unavailable && !hidden.pending, JSON.stringify(hidden));
  if (mode === "bg") {
    await page.evaluate(() => window.__ffShow());
    await page.waitForTimeout(3000);
    const shown = await state();
    check("bg: still the governed page after the tab is shown", shown.di === "server" && !shown.unavailable, JSON.stringify(shown));
  }
  const seen = await page.evaluate(() => window.__protoSeen);
  check(`${mode}: prototype content never shown on this route, not even briefly`, seen.length === 0, JSON.stringify(seen));
  check(`${mode}: no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await context.close();
}
await browser.close();
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`Decision Intelligence route audit: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
