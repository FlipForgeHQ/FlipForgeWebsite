// Issue FlipForge2#1019 — "A decision you can hold accountable", in a real browser.
//
// Proves, at 1440 / 834 / 390, that a collector can open an original decision, see what FlipForge knew and why, return
// later to see what genuinely changed, and examine the record independently:
//
//   K  "What FlipForge knew at the time, and what it set aside" on the Decision Receipt: the exact card as decided, the
//      identity check, the ask, qualifying sales and their source, value and Max Buy exactly as the server's value
//      status allows (never computed in the browser), rule versions, exclusions, uncertainty, the consistency check,
//      the "Not recorded" facts and the receipt fingerprint;
//   L  D7 / D14 / D30: one accountability line per checkpoint, its status equal to the server's, its label from the
//      fixed set; only a checkpoint the server measured is called measured; the summary sentence is the server's;
//   W  value withheld: the withheld label in place of the value, "Not shown" for Max Buy, and no dollar figure in the
//      record but the customer's own ask;
//   N  no accuracy, win-rate or percentage-correct claim; no provider name; no "$0";
//   E  Audit Export: the CSV carries the accountability rows and the JSON carries the whole record, byte-for-byte as served;
//   I  another account opening this decision gets a plain not-found state with nothing of it shown;
//   Q  axe (no serious or critical violation in the record), no horizontal overflow, no page errors.
//
// Data. Two modes, the same assertions:
//   live   (FF_ACCT_API=http://127.0.0.1:18080): every /api/v1 request goes to a real FlipForge2 backend
//          (SaaSCustomerJourneyServer, synthetic tenants only) and through the real gateway disclosure filter
//          (netlify/functions/provider-disclosure-filter.js) before the page sees it. FF_ACCT_CAPTURE=1 also writes
//          the filtered responses to scripts/fixtures/accountability/.
//   replay (default): the captured responses from a live run are served unchanged. No backend is needed.
// Both modes refuse every write.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const filter = require("../netlify/functions/provider-disclosure-filter.js");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "fixtures", "accountability");
const API = process.env.FF_ACCT_API || "";
const TOKEN = process.env.FF_ACCT_TOKEN || "journeytoken-0123456789abcdef-0123456789";
const CAPTURE = API && process.env.FF_ACCT_CAPTURE === "1";
const PORT = process.env.FLIPFORGE_ACCT_AUDIT_PORT || "4173";
const SHOTS = process.env.FF_ACCT_SHOTS || "output/accountability";
const ONLY = (process.env.FF_ACCT_DEVICES || "desktop,tablet,phone").split(",");
const ALPHA = "journey-phase5-alpha";
const BRAVO = "journey-phase5-bravo";
const EMAIL = { [ALPHA]: "accountability-alpha@flipforge.test", [BRAVO]: "accountability-bravo@flipforge.test" };
// The synthetic decisions of SaaSPhase5JourneyFixtures: every verdict, value status and checkpoint status they hold.
const IDS = ["EBAY-p5-multi-sale", "EBAY-p5-one-sale-provider", "EBAY-p5-mixed-two-sales", "EBAY-p5-independent-single",
  "EBAY-p5-estimate-movement", "EBAY-p5-estimate-guarded", "EBAY-p5-window-open", "EBAY-p5-pass-multi-sale"];
const ACCOUNTABILITY_LABELS = {
  MEASURED: "Measured: independently confirmed exact-card sales",
  NOT_YET_DUE: "Not yet due",
  WINDOW_OPEN: "Due now: window open",
  MISSED: "Missed: nothing was recorded in the window",
  NO_NEW_SALES: "Checked: no new completed sales",
  NO_NEW_VERIFIED_EVIDENCE: "Checked: too few qualifying sales to measure",
  PROVIDER_UNAVAILABLE: "Checked: no evidence source was available",
  IDENTITY_INELIGIBLE: "Not measurable: exact card not confirmed",
  COMPLETED_UNMEASURABLE: "Recorded, but not measurable"
};
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  tablet: { viewport: { width: 834, height: 1112 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
};
const APP = `http://goflipforge.com:${PORT}/app/`;
const ACCURACY_CLAIM = /\b(accuracy|accurate|win rate|hit rate|success rate|was right|were right|proven correct)\b|\d+(?:\.\d+)?\s?% (?:correct|accurate|of (?:decisions|verdicts))/i;
const money = cents => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const dollars = t => [...String(t).matchAll(/\$\s?(\d[\d,]*(?:\.\d{2})?)/g)].map(m => Number(m[1].replace(/,/g, "")));

fs.mkdirSync(SHOTS, { recursive: true });
let axeSource = "";
try { axeSource = fs.readFileSync(process.env.AXE_CORE_PATH || require.resolve("axe-core/axe.min.js"), "utf8"); } catch (_) { axeSource = ""; }
if (!axeSource && process.env.CI) { console.log("::error title=accountability-journey::axe-core is required in CI (AXE_CORE_PATH)"); process.exit(1); }

const passes = [];
const failures = [];
const notes = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${String(detail).slice(0, 400)}]` : name);

// ---- data source -------------------------------------------------------------------------------------------------
const fixtureFile = (tenant, p) => path.join(FIXTURES, tenant, `${p.replace(/^\/api\/v1\//, "").replace(/[^A-Za-z0-9_-]+/g, "__") || "root"}.json`);
const gatewayHealth = cid => ({ meta: { contractVersion: "1.0", correlationId: cid, generatedAt: "2026-11-24T00:00:00Z" },
  data: { service: "flipforge-saas-api-gateway", status: "configured", bridgeEnabled: true, upstreamConfigured: true,
    authenticationRequired: true, tenantMembershipRequired: true, clientIdentityHeadersAccepted: false } });
const served = new Map();
async function upstream(tenant, p, search) {
  if (p === "/api/v1/health") return { status: 200, body: gatewayHealth("acct-audit") };
  if (!API) {
    const f = fixtureFile(tenant, p);
    if (!fs.existsSync(f)) return { status: 404, body: { error: { code: "NOT_FOUND", message: "Not found." } } };
    return JSON.parse(fs.readFileSync(f, "utf8"));
  }
  const response = await fetch(`${API}${p}${search}`, { headers: { Authorization: `Bearer ${TOKEN}`, "X-FlipForge-Tenant-Id": tenant, Accept: "application/json" } });
  const raw = await response.json().catch(() => null);
  if (raw && response.ok) {
    const leaks = filter.violations(raw);
    check(`G backend ${tenant} ${p}: the backend response is already free of provider disclosure before the gateway filter`, leaks.length === 0, leaks.slice(0, 5).join(", "));
  }
  let out = { status: response.status, body: raw || { error: { code: "INVALID", message: "Invalid." } } };
  if (raw && response.ok) {
    const filtered = filter.filterBackendPayload(raw, { path: p, strict: !filter.containmentAwareMeta(raw.meta) });
    out = filtered.ok ? { status: response.status, body: filtered.payload } : { status: 503, body: { error: { code: "TEMPORARILY_UNAVAILABLE" } } };
    if (/^\/api\/v1\/lifecycle\/[^/]+$/.test(p)) {
      const a = raw.data?.outcomeTimeline?.accountabilityRecord;
      const b = out.body.data?.outcomeTimeline?.accountabilityRecord;
      check(`G gateway ${tenant} ${p}: the gateway passes the accountability record through unchanged`, JSON.stringify(a) === JSON.stringify(b));
    }
  }
  if (CAPTURE) {
    const f = fixtureFile(tenant, p);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, `${JSON.stringify(out, null, 2)}\n`);
  }
  return out;
}
async function lifecycle(tenant, id) {
  const key = `${tenant}|${id}`;
  if (!served.has(key)) served.set(key, await upstream(tenant, `/api/v1/lifecycle/${encodeURIComponent(id)}`, ""));
  return served.get(key);
}

// ---- browser -----------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"] });
async function open(route, device, tenant = ALPHA, waitFor = null, app = APP) {
  const context = await browser.newContext({ ...DEVICES[device], acceptDownloads: true });
  const email = EMAIL[tenant];
  await context.addInitScript(mail => {
    try {
      localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
      localStorage.setItem("flipforge.guidedMode.enabled", "false");
      let hash = 2166136261;
      for (const ch of mail.toLowerCase()) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
      const key = (hash >>> 0).toString(36);
      localStorage.setItem(`flipforge.guidedMode.v3.${key}.welcome`, "seen");
      localStorage.setItem(`flipforge.guidedMode.v3.${key}.enabled`, "off");
    } catch (_) {}
  }, email);
  await context.route(/\/assets\/js\/flipforge-identity\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${email}"}),getSnapshot:()=>({authenticated:true,email:"${email}",fullName:"Accountability Audit",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${email}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"t"});` }));
  await context.route(/\/assets\/js\/flipforge-production-signin\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  const writes = [];
  await context.route("**/api/v1/**", async r => {
    const req = r.request();
    const u = new URL(req.url());
    if (req.method() !== "GET") { writes.push(`${req.method()} ${u.pathname}`); return r.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: { code: "READ_ONLY_AUDIT" } }) }); }
    const lc = u.pathname.match(/^\/api\/v1\/lifecycle\/([^/]+)$/);
    const base = lc ? await lifecycle(tenant, decodeURIComponent(lc[1])) : await upstream(tenant, u.pathname, u.search);
    // The gateway and the backend echo the caller's correlation id; the page rejects a response that does not.
    const res = { status: base.status, body: JSON.parse(JSON.stringify(base.body)) };
    const cid = req.headers()["x-correlation-id"];
    if (cid && res.body && typeof res.body === "object") {
      if (res.body.meta && typeof res.body.meta === "object") res.body.meta.correlationId = cid;
      if (res.body.error && typeof res.body.error === "object") res.body.error.correlationId = cid;
    }
    if (process.env.FF_ACCT_DEBUG) console.log(`debug ${tenant} ${u.pathname} ${res.status} ${res.status >= 400 ? JSON.stringify(res.body).slice(0, 160) : ""}`);
    return r.fulfill({ status: res.status, contentType: "application/json", body: JSON.stringify(res.body) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
  await page.goto(`${app}#/${route}`, { waitUntil: "load" });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(waitFor ? 1200 : 4500);
  return { context, page, errors, writes };
}
const textOf = (page, selector) => page.evaluate(s => { document.querySelectorAll("#main-content details").forEach(d => { d.open = true; });
  return [...document.querySelectorAll(`#main-content ${s}`)].map(n => n.innerText).join("\n"); }, selector);
async function axe(page, selector) {
  if (!axeSource) { notes.push("axe-core not installed: not scanned"); return []; }
  await page.addScriptTag({ content: axeSource }).catch(() => {});
  return page.evaluate(async s => {
    const out = [];
    for (const node of document.querySelectorAll(`#main-content ${s}`)) {
      const r = await window.axe.run(node, { resultTypes: ["violations"] });
      r.violations.filter(v => v.impact === "serious" || v.impact === "critical").forEach(v => out.push(`${v.id}:${v.nodes[0]?.target.join(" ")}`));
    }
    return out;
  }, selector).catch(e => [`axe-error ${e.message}`]);
}

const KNEW = '[data-ff-otl-question="knew"]';
async function receipt(id, device) {
  const { body } = await lifecycle(ALPHA, id);
  const timeline = body?.data?.outcomeTimeline;
  const record = timeline?.accountabilityRecord;
  const label = `${device} receipt ${id}`;
  if (!record) { check(`K ${label}: the server returned an accountability record`, false); return; }
  const knew = record.whatFlipForgeKnew;
  const s = await open(`opportunities/${encodeURIComponent(id)}`, device, ALPHA, KNEW);
  const k = await textOf(s.page, KNEW);
  const main = await textOf(s.page, "");
  check(`K ${label}: "What FlipForge knew at the time, and what it set aside" is shown once`, (await s.page.locator(`#main-content ${KNEW}`).count()) === 1);
  check(`K ${label}: the exact card as decided is shown`, k.includes(knew.cardIdentity), knew.cardIdentity);
  check(`K ${label}: the saved verdict ${knew.recommendation} is shown on the receipt`, main.includes(knew.recommendation));
  check(`K ${label}: the customer's ask is shown`, k.includes(money(knew.askCents)));
  check(`K ${label}: qualifying exact sales ${knew.evidence.qualifiedExactSales} is shown`, new RegExp(`Qualifying exact sales\\s*${knew.evidence.qualifiedExactSales}\\b`).test(k));
  check(`K ${label}: the exact-card check is "${knew.identity.basis === "CONFIRMED" ? "Confirmed" : "Not confirmed"}"`,
    k.includes(knew.identity.basis === "CONFIRMED" ? "Confirmed" : knew.identity.basis === "NOT_CONFIRMED" ? "Not confirmed" : "Not recorded"));
  check(`K ${label}: rule versions are shown as recorded`, k.includes(knew.ruleVersions.decisionRules) && k.includes(knew.ruleVersions.profitabilityPolicy));
  check(`K ${label}: facts the saved decision does not hold are shown as "Not recorded"`, /Not recorded in this saved decision:/.test(k) && /How recent the sales were\s*Not recorded/.test(k));
  check(`K ${label}: the receipt fingerprint matches the server's receipt hash`, k.includes(String(record.receiptSha256).slice(0, 12)));
  const v = knew.value;
  const recordDollars = [...new Set(dollars(k))];
  if (["SHOWN", "SHOWN_NO_MAX_BUY", "SHOWN_VERIFY_NO_LIMIT"].includes(v.status)) {
    check(`K ${label}: Supported Value at decision is the server's figure`, k.includes(`Supported value at decision\n${money(v.supportedValueCents)}`) || new RegExp(`Supported value at decision\\s*${money(v.supportedValueCents).replace(/[$.]/g, "\\$&")}`).test(k));
    if (v.status === "SHOWN") check(`K ${label}: Max Buy at decision is the server's figure`, new RegExp(`Max Buy at decision\\s*${money(v.maximumBuyPriceCents).replace(/[$.]/g, "\\$&")}`).test(k));
    else check(`K ${label}: no Max Buy figure for value status ${v.status}`, /Max Buy at decision\s*(None: no price works|No buying limit \(VERIFY\))/.test(k));
    const allowed = new Set([knew.askCents / 100, v.supportedValueCents / 100, ...(v.status === "SHOWN" ? [v.maximumBuyPriceCents / 100] : [])]);
    check(`K ${label}: no dollar figure in the record but the ask and the saved values`, recordDollars.every(x => allowed.has(x)), recordDollars.join(","));
  } else {
    check(`W ${label}: the value is withheld in the record ("${v.label}")`, k.includes(v.label) && /Max Buy at decision\s*Not shown/.test(k), v.label);
    check(`W ${label}: no dollar figure in the record but the customer's own ask`, recordDollars.every(x => x === knew.askCents / 100), recordDollars.join(","));
  }
  const findings = record.whyThisDecision.consistency.findings || [];
  check(`K ${label}: the consistency check says what the server found (${findings.map(f => f.code).join(",") || "consistent"})`,
    findings.length ? findings.every(f => k.includes(f.explanation)) : /matches the saved verdict/.test(k));
  // L: one line per checkpoint, the server's status, a fixed label, no invented measurement.
  const lines = await s.page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-outcome-timeline] [data-ff-otl-accountability]")]
    .map(n => ({ status: n.getAttribute("data-ff-otl-accountability"), measured: n.getAttribute("data-ff-otl-measured"), label: n.querySelector("b")?.innerText.trim() || "" })));
  const want = timeline.checkpoints.map(c => c.accountability.status);
  check(`L ${label}: one accountability line per checkpoint, statuses ${want.join("/")}`, lines.map(x => x.status).join(",") === want.join(","), lines.map(x => x.status).join(","));
  check(`L ${label}: every line uses the fixed label for its status`, lines.every(x => x.label === ACCOUNTABILITY_LABELS[x.status]), JSON.stringify(lines.map(x => x.label)));
  check(`L ${label}: only a checkpoint the server measured is marked measured`, lines.every((x, i) => (x.measured === "true") === (timeline.checkpoints[i].accountability.measured === true && x.status === "MEASURED")));
  const summary = await textOf(s.page, "[data-ff-acct-summary]");
  check(`L ${label}: the checkpoint summary is the server's statement`, summary.replace(/\s+/g, " ").includes(timeline.accountabilitySummary.statement.replace(/\s+/g, " ")), summary.slice(0, 200));
  // N, Q
  check(`N ${label}: no accuracy or win-rate claim, no provider name, never "$0"`, !ACCURACY_CLAIM.test(k + summary) && !/card\s*sight/i.test(main) && !/\$0(?:\.00)?(?![\d,])/.test(main),
    ((k + summary).match(ACCURACY_CLAIM) || [""])[0]);
  const o = await s.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`Q ${label}: no horizontal overflow`, o <= 1, String(o));
  check(`Q ${label}: no page errors and no write requests`, s.errors.length === 0 && s.writes.length === 0, `${s.errors.join(" | ")} ${s.writes.join(",")}`);
  if (device !== "tablet") { const a = await axe(s.page, `${KNEW}, [data-ff-outcome-timeline]`); check(`Q ${label}: axe finds no serious or critical violation in the record`, a.length === 0, a.join("; ")); }
  const node = s.page.locator(`#main-content ${KNEW}`).first();
  if (await node.count()) { await node.scrollIntoViewIfNeeded().catch(() => {}); await node.screenshot({ path: path.join(SHOTS, `${device}-${id}-knew.png`) }).catch(() => {}); }
  await s.context.close();
}

async function tracking(id, device) {
  const { body } = await lifecycle(ALPHA, id);
  const timeline = body?.data?.outcomeTimeline;
  const s = await open(`tracking/${encodeURIComponent(id)}`, device, ALPHA, "[data-ff-outcome-timeline]");
  const label = `${device} tracking ${id}`;
  const lines = await s.page.evaluate(() => [...document.querySelectorAll("#main-content [data-ff-otl-accountability]")].map(n => n.getAttribute("data-ff-otl-accountability")));
  check(`L ${label}: returning later on Tracking shows the same checkpoint statuses as the receipt`, lines.join(",") === timeline.checkpoints.map(c => c.accountability.status).join(","), lines.join(","));
  check(`K ${label}: Tracking shows the same as-decided record`, (await s.page.locator(`#main-content ${KNEW}`).count()) === 1
    && (await textOf(s.page, KNEW)).includes(String(timeline.accountabilityRecord.receiptSha256).slice(0, 12)));
  check(`Q ${label}: no page errors and no write requests`, s.errors.length === 0 && s.writes.length === 0, `${s.errors.join(" | ")} ${s.writes.join(",")}`);
  await s.page.screenshot({ path: path.join(SHOTS, `${device}-${id}-tracking.png`), fullPage: false }).catch(() => {});
  await s.context.close();
}

async function auditExport(id, device) {
  const { body } = await lifecycle(ALPHA, id);
  const record = body?.data?.outcomeTimeline?.accountabilityRecord;
  // Production is HTTPS. Over the local plain-HTTP server only localhost is a secure context, and Audit Export needs
  // crypto.subtle for its SHA-256 integrity digest, so this step uses the localhost preview host the page accepts.
  const s = await open(`export/${encodeURIComponent(id)}`, device, ALPHA, "[data-customer-export-prepare]", `http://localhost:${PORT}/app/`);
  const label = `${device} export ${id}`;
  await s.page.waitForSelector("[data-customer-export-prepare]:not([disabled])", { timeout: 15000 }).catch(() => {});
  await s.page.click("[data-customer-export-prepare]").catch(() => {});
  await s.page.waitForSelector("[data-customer-export-csv]:not([disabled])", { timeout: 15000 }).catch(() => {});
  const grab = async sel => {
    const [d] = await Promise.all([s.page.waitForEvent("download", { timeout: 10000 }).catch(() => null), s.page.click(sel).catch(() => {})]);
    if (!d) return "";
    const f = path.join(SHOTS, `${device}-${id}-${d.suggestedFilename()}`);
    await d.saveAs(f).catch(() => {});
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  };
  await s.page.screenshot({ path: path.join(SHOTS, `${device}-${id}-export.png`), fullPage: true }).catch(() => {});
  if (process.env.FF_ACCT_DEBUG) console.log(`debug export page: ${(await textOf(s.page, "")).replace(/\s+/g, " ").slice(0, 900)}`);
  const csv = await grab("[data-customer-export-csv]");
  const json = await grab("[data-customer-export-json]");
  check(`E ${label}: the CSV carries the accountability rows`, /accountability,receipt_sha256,/.test(csv) && csv.includes(record.receiptSha256)
    && /accountability,decision_rules_version,/.test(csv) && /checkpoint_d7,accountability_status,/.test(csv) && /accountability,checkpoint_summary,/.test(csv), csv.slice(0, 160));
  const v = record.whatFlipForgeKnew.value;
  if (!["SHOWN", "SHOWN_NO_MAX_BUY", "SHOWN_VERIFY_NO_LIMIT"].includes(v.status)) {
    check(`W ${label}: a withheld value stays blank in the CSV`, /accountability,supported_value_cents_as_decided,\s*\r?\n/.test(csv) && /accountability,max_buy_cents_as_decided,\s*\r?\n/.test(csv));
  }
  let exported = null;
  try { exported = JSON.parse(json); } catch (_) { exported = null; }
  const find = (o, depth = 0) => {
    if (!o || typeof o !== "object" || depth > 12) return null;
    if (o.kind === "decision-accountability-record" && o.requestId === record.requestId) return o;
    for (const k of Object.keys(o)) { const r = find(o[k], depth + 1); if (r) return r; }
    return null;
  };
  // The dossier is canonical JSON (keys sorted for its SHA-256), so the comparison is key-order independent.
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.keys(v).sort().reduce((o, k) => { o[k] = canonical(v[k]); return o; }, {}) : v;
  const inDossier = find(exported);
  check(`E ${label}: the JSON dossier carries the accountability record exactly as served`, !!inDossier && JSON.stringify(canonical(inDossier)) === JSON.stringify(canonical(record)),
    inDossier ? "differs" : `not found (${json.length} bytes)`);
  check(`Q ${label}: no page errors and no write requests`, s.errors.length === 0 && s.writes.length === 0, `${s.errors.join(" | ")} ${s.writes.join(",")}`);
  await s.context.close();
}

async function isolation(id, device) {
  const { body: alpha } = await lifecycle(ALPHA, id);
  const title = alpha?.data?.outcomeTimeline?.accountabilityRecord?.whatFlipForgeKnew?.cardIdentity || id;
  const other = await lifecycle(BRAVO, id);
  check(`I ${device} ${id}: the other account's lifecycle request is refused (404)`, other.status === 404, String(other.status));
  const s = await open(`opportunities/${encodeURIComponent(id)}`, device, BRAVO);
  const t = await textOf(s.page, "");
  check(`I ${device} ${id}: the other account sees nothing of this decision`, (await s.page.locator(`#main-content ${KNEW}`).count()) === 0
    && !t.includes(title) && !t.includes(String(alpha?.data?.outcomeTimeline?.accountabilityRecord?.receiptSha256 || "zz").slice(0, 12)), t.slice(0, 160));
  check(`I ${device} ${id}: no page errors and no write requests`, s.errors.length === 0 && s.writes.length === 0, `${s.errors.join(" | ")} ${s.writes.join(",")}`);
  await s.page.screenshot({ path: path.join(SHOTS, `${device}-${id}-other-account.png`) }).catch(() => {});
  await s.context.close();
}

try {
  if (!API && !fs.existsSync(path.join(FIXTURES, ALPHA))) throw new Error(`no captured responses in ${FIXTURES}; run once with FF_ACCT_API and FF_ACCT_CAPTURE=1`);
  for (const device of ["desktop", "tablet", "phone"].filter(d => ONLY.includes(d))) {
    for (const id of IDS) await receipt(id, device);
    for (const id of ["EBAY-p5-multi-sale", "EBAY-p5-one-sale-provider"]) await tracking(id, device);
    if (device === "desktop") for (const id of ["EBAY-p5-multi-sale", "EBAY-p5-one-sale-provider"]) await auditExport(id, device);
    await isolation("EBAY-p5-one-sale-provider", device);
  }
  // Coverage of the fixture set (what this run could and could not prove).
  const statuses = new Set();
  const values = new Set();
  const verdicts = new Set();
  for (const id of IDS) {
    const t = (await lifecycle(ALPHA, id)).body?.data?.outcomeTimeline;
    t?.checkpoints?.forEach(c => statuses.add(c.accountability.status));
    values.add(t?.accountabilityRecord?.whatFlipForgeKnew?.value?.status);
    verdicts.add(t?.accountabilityRecord?.whatFlipForgeKnew?.recommendation);
  }
  check("C the fixture set covers BUY, WATCH, VERIFY and PASS", ["BUY", "WATCH", "VERIFY", "PASS"].every(v => verdicts.has(v)), [...verdicts].join(","));
  notes.push(`checkpoint statuses exercised: ${[...statuses].sort().join(", ")}`);
  notes.push(`value statuses exercised: ${[...values].sort().join(", ")}`);
  const missing = Object.keys(ACCOUNTABILITY_LABELS).filter(x => !statuses.has(x));
  if (missing.length) notes.push(`checkpoint statuses not in this fixture set (covered by the backend runner and the static validator): ${missing.join(", ")}`);
  notes.push(`mode: ${API ? `live backend ${API} through the gateway disclosure filter${CAPTURE ? " (captured)" : ""}` : "replay of captured live responses"}`);
} catch (error) {
  failures.push(`audit aborted: ${error.message}`);
} finally {
  await browser.close();
}
for (const n of notes) console.log(`note: ${n}`);
for (const f of failures) console.log(`FAIL ${f}`);
console.log(`audit-accountability-journey: ${passes.length} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
