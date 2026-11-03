// Saved Decisions & Tracking M1 (2026-11-02): plain-language Alerts, Mark as reviewed, Mark all as seen, and one-step
// re-evaluation. Display and customer review facts only: every decision, value and date comes from a synthetic fixture
// shaped like FlipForge2 #967 /api/v1/alerts; the browser never computes or changes a decision.
//
//   M1  Alerts read as sentences: no raw codes (MAX_BUY_CROSSED, DECISION_RECHECK_DUE, ...), no ISO timestamps.
//   M2  New since your last visit is marked and counted; the window explanation is shown.
//   M3  Mark as reviewed sends one PUT to /api/v1/alerts/reviewed/{alertId} and moves the item to Reviewed.
//   M4  Mark all as seen sends one PUT to /api/v1/alerts/last-seen with the response's generatedAt.
//   M5  An older backend (no alertId / title / review state) still renders plain titles and offers no review buttons.
//   M6  Re-evaluate opens Evaluate prefilled from GET /api/v1/reevaluation-draft/{id}; nothing is written on load.
//   M7  Phone width: no horizontal page overflow; no page errors anywhere.
//
// The production host is mapped to the local server (saas-prototype/serve.mjs, port 4173 or FLIPFORGE_M1_AUDIT_PORT).
import { chromium } from "playwright";
import fs from "node:fs";

const PORT = process.env.FLIPFORGE_M1_AUDIT_PORT || "4173";
const SHELLS = { beta: `http://goflipforge.com:${PORT}/app/beta/`, customer: `http://goflipforge.com:${PORT}/app/customer/` };
const SHOTS = process.env.FLIPFORGE_M1_AUDIT_SHOTS || "";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE || undefined;
const email = "alerts-m1-audit@flipforge.test";

const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const NOW = Date.now();
const iso = days => new Date(NOW - days * 86_400_000).toISOString();
const hex = c => c.repeat(64);

const CARDS = {
  "qa-m1-keith": "2005-06 Upper Deck Duncan Keith #230 Young Guns PSA 10",
  "qa-m1-ohtani": "2018 Topps Chrome Shohei Ohtani #150 PSA 9",
  "qa-m1-luka": "2018 Prizm Luka Doncic #280 PSA 10"
};
const IDS = Object.keys(CARDS);

function opportunity(id) {
  return { id, title: CARDS[id], cardIdentity: CARDS[id], recommendation: "WATCH", ask: 200, observedAt: iso(20), platform: "EBAY",
    evidenceProvenanceStatus: "CURRENT_EVIDENCE_RULES", governedDecision: { available: true, recommendation: "WATCH", immutable: true, transactionAuthority: false } };
}

function freshAlerts() {
  return {
    reviewed: new Map(),
    lastSeenAt: null,
    items: [
      { alertId: hex("1"), opportunityId: "qa-m1-keith", kind: "REVIEW_DUE", reviewAt: iso(3), due: true, enabled: true, recordVersion: 2,
        observedAt: iso(3), title: "Your scheduled review is due", customerExplanation: "You asked FlipForge to remind you to look at this saved decision again.",
        nextStep: "Open the saved decision and check whether the listing and price have changed." },
      { alertId: hex("2"), changeId: hex("2"), opportunityId: "qa-m1-ohtani", kind: "DECISION_CHANGED", changedAt: iso(1), observedAt: iso(1),
        previousDecision: "VERIFY", currentDecision: "WATCH", title: "Decision changed from VERIFY to WATCH",
        customerExplanation: "A re-evaluation you ran recorded stronger exact-sale support. The earlier decision and receipt are kept unchanged.",
        nextStep: "Open the saved decision to see each recorded change.",
        whatChanged: ["Decision changed from VERIFY to WATCH."],
        changes: [{ code: "DECISION_CHANGED", before: "VERIFY", after: "WATCH", description: "Decision changed from VERIFY to WATCH." }] },
      { alertId: hex("5"), opportunityId: "qa-m1-luka", kind: "REVIEW_DUE", reviewAt: new Date(NOW + 9 * 86_400_000).toISOString(), due: false, enabled: true,
        observedAt: null, title: "Review scheduled", customerExplanation: "You set a reminder to look at this saved decision again.", nextStep: "Open the saved decision." }
    ],
    signals: [
      { alertId: hex("3"), signalId: hex("3"), opportunityId: "qa-m1-ohtani", kind: "MAX_BUY_CROSSED", direction: "ABOVE_BUYING_LIMIT", decision: "WATCH",
        evaluatedAt: iso(1), observedAt: iso(1), previousAllInAskCents: 18_500, allInAskCents: 21_878, maximumBuyPriceCents: 19_000,
        title: "Ask moved above your Max Buy", customerExplanation: "A re-evaluation recorded an all-in ask above the saved Max Buy.",
        nextStep: "Re-evaluate at the current price before relying on this decision.", decidedUnderEarlierRules: false },
      { alertId: hex("4"), signalId: hex("4"), opportunityId: "qa-m1-luka", kind: "DECISION_RECHECK_DUE", decision: "VERIFY", evaluatedAt: iso(44), ageDays: 44,
        recheckAfterDays: 30, observedAt: iso(14), title: "Decision is 44 days old",
        customerExplanation: "The latest saved decision is 44 days old. Re-check the price and evidence before relying on it.",
        nextStep: "Re-evaluate with the current asking price. FlipForge does not re-check listings on its own.",
        decidedUnderEarlierRules: true, rulesNote: "Decided under earlier rules. The saved decision and its Max Buy are kept exactly as they were made." }
    ]
  };
}

function alertsData(store, { legacy = false } = {}) {
  const since = store.lastSeenAt || iso(14);
  const decorate = item => {
    if (legacy) {
      const { alertId, title, customerExplanation, nextStep, observedAt, ...rest } = item;
      return rest;
    }
    const reviewedAt = store.reviewed.get(item.alertId) || null;
    const needs = item.kind === "REVIEW_DUE" ? item.due === true : true;
    const fresh = !reviewedAt && needs && item.observedAt && Date.parse(item.observedAt) > Date.parse(since);
    return { ...item, reviewed: Boolean(reviewedAt), reviewedAt, needsAttention: needs && !reviewedAt, newSinceLastVisit: Boolean(fresh) };
  };
  const items = store.items.map(decorate);
  const signals = store.signals.map(decorate);
  const base = { kind: "alerts", configured: true, readOnly: false, status: "IN_APP_REVIEW_AND_DECISION_CHANGE_ALERTS_AVAILABLE",
    notificationDeliveryConfigured: false, items, count: items.length, dueCount: 1, reviewRuleCount: 2, decisionChangeCount: 1,
    decisionReviewSignals: signals, decisionReviewSignalCount: signals.length, collectionSignals: [], transactionAuthority: false };
  if (legacy) return { ...base, acknowledgementConfigured: false };
  return { ...base, acknowledgementConfigured: true, acknowledgementScope: "TENANT_IN_APP_REVIEW_ONLY", generatedAt: new Date(NOW).toISOString(),
    sinceLastVisit: { basis: store.lastSeenAt ? "MARKED_AS_SEEN" : "FIRST_VISIT_WINDOW", since, lastSeenAt: store.lastSeenAt, firstVisitWindowDays: 14,
      explanation: store.lastSeenAt ? "New since you last marked alerts as seen." : "No visit marked yet, so the last 14 days are shown as new." } };
}

const DRAFT = { externalListingId: "123456789012", marketplace: "EBAY", cardIdentity: CARDS["qa-m1-ohtani"], listingUrl: "https://example.invalid/listing/ohtani",
  itemPriceCents: 21_378, shippingCents: 500, buyerPremiumCents: 0, taxCents: 0, allInAskCents: 21_878 };

const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) }).catch(() => {});
const envelope = (correlationId, data) => ({ meta: { contractVersion: "1.0", engineVersion: "alerts-m1-audit", authority: "Smart Opportunity",
  gradingAuthority: "Existing PSA intelligence", correlationId, generatedAt: new Date(NOW).toISOString(), limitations: [] }, data });

function fixture(store, writes, options) {
  return async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const cid = request.headers()["x-correlation-id"] || "alerts-m1-audit";
    const p = url.pathname;
    if (method !== "GET") {
      writes.push(`${method} ${p} ${request.postData() || ""}`);
      const reviewed = p.match(/^\/api\/v1\/alerts\/reviewed\/([a-f0-9]{64})$/);
      if (method === "PUT" && reviewed && !options.legacy) {
        if (!store.reviewed.has(reviewed[1])) store.reviewed.set(reviewed[1], new Date().toISOString());
        return json(route, 200, envelope(cid, alertsData(store)));
      }
      if (method === "PUT" && p === "/api/v1/alerts/last-seen" && !options.legacy) {
        store.lastSeenAt = JSON.parse(request.postData() || "{}").seenThrough || new Date().toISOString();
        return json(route, 200, envelope(cid, alertsData(store)));
      }
      return json(route, 405, { error: { code: "QA_READ_ONLY", message: "No other writes.", correlationId: cid } });
    }
    if (p === "/api/v1/health") return json(route, 200, envelope(cid, { status: "configured", bridgeEnabled: true, evidenceStorageGuard: "VERIFIED" }));
    if (p === "/api/v1/entitlements") return json(route, 200, envelope(cid, { kind: "entitlements", membershipActive: true, current: { code: "PRIVATE_BETA", accessState: "ACTIVE" }, plan: { code: "PRIVATE_BETA" }, usage: { completedEvaluations: 0 } }));
    if (p === "/api/v1/opportunities") return json(route, 200, envelope(cid, { kind: "opportunities", items: IDS.map(opportunity), count: IDS.length, sourceOfTruth: "SQLite" }));
    if (p === "/api/v1/alerts") return json(route, 200, envelope(cid, alertsData(store, options)));
    const draft = p.match(/^\/api\/v1\/reevaluation-draft\/([^/]+)$/);
    if (draft) {
      const id = decodeURIComponent(draft[1]);
      return json(route, 200, envelope(cid, { kind: "reevaluation-draft", opportunityId: id, readOnly: true, evaluationCreated: false, allowanceUsed: false,
        providerCallPerformed: false, savedDecisionChanged: false, available: true, status: "PREFILL_FROM_YOUR_LATEST_EVALUATION",
        previousEvaluatedAt: iso(1), fields: DRAFT, pricesAreFromPreviousEvaluation: true }));
    }
    if (p === "/api/v1/lifecycle") return json(route, 200, envelope(cid, { kind: "lifecycle", sourceOfTruth: "SQLite", items: [] }));
    return json(route, 404, { error: { code: "QA_NOT_MOCKED", message: p, correlationId: cid } });
  };
}

const browser = await chromium.launch({ executablePath, args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"] });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function open(base, hash, { device = null, store = freshAlerts(), legacy = false, wait = 4500 } = {}) {
  const context = await browser.newContext(device || { viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); localStorage.setItem("flipforge.guidedMode.enabled", "false"); } catch (_) {} });
  await context.route(/\/assets\/js\/flipforge-identity\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${email}"}),getSnapshot:()=>({authenticated:true,email:"${email}",fullName:"Alerts Audit",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${email}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"t"});` }));
  await context.route(/\/assets\/js\/flipforge-production-signin\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  const writes = [];
  await context.route("**/api/v1/**", fixture(store, writes, { legacy }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message.slice(0, 160)));
  await page.goto(`${base}#/${hash}`, { waitUntil: "load" });
  await page.waitForTimeout(wait);
  return { context, page, errors, writes, store };
}
const mainText = page => page.evaluate(() => document.querySelector("#main-content")?.innerText || "");
const RAW = /\b(?:REVIEW_DUE|DECISION_CHANGED|MAX_BUY_CROSSED|DECISION_RECHECK_DUE|VERIFICATION_PENDING|LEGACY_DECISION|INTO_BUYING_LIMIT|ABOVE_BUYING_LIMIT|STATUS_UNAVAILABLE)\b/;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); } };

try {
  for (const [shell, base] of Object.entries(SHELLS)) {
    for (const [label, device] of [["desktop", null], ["phone", PHONE]]) {
      const { context, page, errors, writes } = await open(base, "alerts", { device });
      const text = await mainText(page);
      await shot(page, `alerts-${shell}-${label}`);
      check(`M1 ${shell} ${label}: alert titles are sentences`, /Your scheduled review is due/.test(text) && /Decision changed from VERIFY to WATCH/.test(text)
        && /Ask moved above your Max Buy/.test(text) && /Decision is 44 days old/.test(text), text.slice(0, 300).replace(/\s+/g, " "));
      check(`M1 ${shell} ${label}: no raw alert codes`, !RAW.test(text), (text.match(RAW) || [""])[0]);
      check(`M1 ${shell} ${label}: no ISO timestamps`, !ISO.test(text));
      check(`M1 ${shell} ${label}: Max Buy crossing shows the saved figures in dollars`, /All-in ask \$185\.00 → \$218\.78 · saved Max Buy \$190\.00/.test(text));
      check(`M1 ${shell} ${label}: next step and earlier-rules note shown`, /Next step:/.test(text) && /Decided under earlier rules/.test(text));
      const newCards = await page.locator('#main-content .ff-alert-card[data-new="true"]').count();
      check(`M2 ${shell} ${label}: items recorded in the last 14 days are marked new`, newCards === 3, String(newCards));
      check(`M2 ${shell} ${label}: first-visit window is explained`, /No visit marked yet, so the last 14 days are shown as new\./.test(text));
      const scheduled = await page.locator('#main-content .ff-alert-card[data-alert-mode="scheduled"]').count();
      check(`M2 ${shell} ${label}: a reminder not yet due is listed separately`, scheduled === 1, String(scheduled));
      check(`M6 ${shell} ${label}: opening Alerts writes nothing`, writes.length === 0, writes.join(" | "));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`M7 ${shell} ${label}: no horizontal page overflow`, overflow <= 1, String(overflow));
      check(`M7 ${shell} ${label}: no page errors`, errors.length === 0, errors.join(" | "));
      await context.close();
    }
  }

  // ---- M3/M4: review actions (customer shell, desktop) ----
  {
    const { context, page, errors, writes } = await open(SHELLS.customer, "alerts");
    const before = await page.locator('#main-content [data-alerts-attention] .ff-alert-card').count();
    await page.locator(`#main-content [data-alert-review="${hex("3")}"]`).click();
    await page.waitForTimeout(800);
    check("M3 Mark as reviewed sends exactly one PUT for that alert", writes.length === 1 && writes[0].startsWith(`PUT /api/v1/alerts/reviewed/${hex("3")}`), writes.join(" | "));
    const after = await page.locator('#main-content [data-alerts-attention] .ff-alert-card').count();
    check("M3 the reviewed alert leaves Needs your review", after === before - 1, `${before} -> ${after}`);
    await page.evaluate(() => document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }));
    const reviewedText = await page.evaluate(() => document.querySelector("#main-content .ff-alerts-reviewed")?.innerText || "");
    check("M3 it appears under Reviewed with its time", /Reviewed \(1\)/.test(reviewedText) && /Ask moved above your Max Buy/.test(reviewedText) && /Reviewed [A-Z][a-z]{2} \d/.test(reviewedText), reviewedText.slice(0, 200).replace(/\s+/g, " "));
    check("M3 confirmation is shown", /Marked as reviewed/.test(await mainText(page)));
    await page.locator("#main-content [data-alerts-seen]").click();
    await page.waitForTimeout(800);
    const seenWrite = writes.find(w => w.startsWith("PUT /api/v1/alerts/last-seen"));
    check("M4 Mark all as seen sends the response's generatedAt", Boolean(seenWrite) && seenWrite.includes(new Date(NOW).toISOString()), seenWrite || "none");
    const newAfter = await page.locator('#main-content .ff-alert-card[data-new="true"]').count();
    const text = await mainText(page);
    check("M4 nothing is new after marking seen, and items stay open", newAfter === 0 && /Needs your review/.test(text) && /New since you last marked alerts as seen\./.test(text), String(newAfter));
    check("M3/M4 only the two review writes were sent", writes.length === 2, writes.join(" | "));
    await shot(page, "alerts-after-review");
    check("M3/M4 no page errors", errors.length === 0, errors.join(" | "));
    await context.close();
  }

  // ---- M5: older backend ----
  {
    const { context, page, errors } = await open(SHELLS.beta, "alerts", { legacy: true });
    const text = await mainText(page);
    check("M5 older backend: titles still plain", /Your scheduled review is due/.test(text) && /Decision changed from VERIFY to WATCH/.test(text) && /Ask moved across your Max Buy/.test(text), text.slice(0, 300).replace(/\s+/g, " "));
    check("M5 older backend: no raw codes", !RAW.test(text), (text.match(RAW) || [""])[0]);
    check("M5 older backend: no review buttons without server review state", await page.locator("#main-content [data-alert-review], #main-content [data-alerts-seen]").count() === 0);
    check("M5 older backend: no page errors", errors.length === 0, errors.join(" | "));
    await context.close();
  }

  // ---- M6: one-step re-evaluation ----
  for (const [shell, base] of Object.entries(SHELLS)) {
    const { context, page, errors, writes } = await open(base, "alerts");
    await page.locator('#main-content .ff-alert-card[data-alert-kind="MAX_BUY_CROSSED"] [data-alert-reevaluate]').click();
    await page.waitForTimeout(3000);
    const hash = await page.evaluate(() => window.location.hash);
    check(`M6 ${shell}: Re-evaluate opens Evaluate for that saved decision`, hash === "#/evaluate/qa-m1-ohtani", hash);
    const values = await page.evaluate(() => {
      const form = document.querySelector("#main-content [data-staging-evaluation-form]");
      if (!form) return null;
      const v = name => form.querySelector(`[name="${name}"]`)?.value ?? null;
      return { listing: v("externalListingId"), marketplace: v("marketplace"), card: v("cardIdentity"), url: v("listingUrl"), price: v("itemPrice"), shipping: v("shipping"),
        ack: form.querySelector('[name="acknowledgeBoundary"]')?.checked };
    });
    check(`M6 ${shell}: the form is prefilled with last time's listing facts`, values && values.listing === "123456789012" && values.marketplace === "EBAY"
      && values.card === CARDS["qa-m1-ohtani"] && values.url === DRAFT.listingUrl && values.price === "213.78" && values.shipping === "5.00", JSON.stringify(values));
    check(`M6 ${shell}: the boundary confirmation is not pre-ticked`, values && values.ack === false);
    const text = await mainText(page);
    check(`M6 ${shell}: banner explains the prices are from last time and the saved decision is kept`, /Re-evaluating your saved decision/.test(text)
      && /Update the price to what the listing asks now/.test(text) && /earlier decision and its receipt stay exactly as they were/.test(text), text.slice(0, 400).replace(/\s+/g, " "));
    check(`M6 ${shell}: opening the prefilled form writes nothing`, writes.length === 0, writes.join(" | "));
    await shot(page, `reevaluate-${shell}`);
    check(`M6 ${shell}: no page errors`, errors.length === 0, errors.join(" | "));
    await context.close();
  }
} catch (error) {
  failures.push(`audit did not complete: ${String(error.message || error).split("\n")[0]}`);
} finally {
  await browser.close();
}

console.log("Saved Decisions & Tracking M1 — Alerts and re-evaluation audit");
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure}`);
if (failures.length) process.exitCode = 1;
