// "Record what you did" stays with the card on screen, and the saved-decision receipt action ends on its own panel.
//
// Regression for two review findings on the 2026-11-06 website batch:
//   1. The panel was mounted after the closest section of the re-evaluate link, which is the persistent
//      section.workspace outside #main-content. It survived route changes, and because an existing panel returned
//      before the card id was updated, opening card A, then card B, then submitting recorded B's action against A.
//   2. The "Open Decision Receipt" action also matched the document-level [data-ff-cdi-receipt] handler of the CDI
//      Signal Stack, which scrolled away to the evidence passport after the local action opened the receipt panel.
// Rules checked here:
//   - the panel lives inside #main-content's saved-decision view, is bound to the card in the address bar, and there
//     is never more than one; it is gone on a non-card route;
//   - A -> B -> submit sends the POST to B's id only; returning to A shows A's records only;
//   - clicking "Open Decision Receipt" leaves the receipt panel open and in view, and still emits
//     decision_receipt_opened once.
// Synthetic fixtures only: every /api/v1 response is mocked in the browser. No network, no account data.
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const email = "decision-outcome-audit@flipforge.test";

const cards = {
  "qa-outcome-a": { title: "2018 Topps Chrome Shohei Ohtani #150 PSA 10", recommendation: "BUY", ask: 1215, supportedValue: 1675, acceptedSales: 12 },
  "qa-outcome-b": { title: "2018 Prizm Luka Doncic #280 PSA 10", recommendation: "WATCH", ask: 220, supportedValue: 240, acceptedSales: 9 }
};
const ids = Object.keys(cards);
const opportunity = id => ({
  id, title: cards[id].title, cardIdentity: cards[id].title, recommendation: cards[id].recommendation,
  ask: cards[id].ask, supportedValue: cards[id].supportedValue, confidence: 83, liquidity: 75, risk: 35, rank: 80,
  observedAt: "2026-11-05T15:00:00Z", platform: "EBAY", mappingState: "CONFIRMED",
  supportedValueCents: cards[id].supportedValue * 100, recommendationSource: "GOVERNED_SNAPSHOT", evidenceProvenanceStatus: "CURRENT_EVIDENCE_RULES",
  evidence: { acceptedSales: cards[id].acceptedSales },
  // Same governed-record shape as audit-in-app-events-e2e.mjs, so the saved decision offers its server receipt.
  governedDecision: { available: true, recommendation: cards[id].recommendation, confidence: 83, risk: 35, reason: `${cards[id].recommendation}: synthetic saved reason.`,
    evaluatedAt: "2026-11-05T15:00:00Z", supportedValueCents: cards[id].supportedValue * 100, supportedValueStatus: "ESTABLISHED",
    maximumBuyPriceCents: Math.round(cards[id].ask * 90), allInAskCents: cards[id].ask * 100, exactTrustedCompCount: cards[id].acceptedSales,
    snapshotCount: 1, immutable: true, transactionAuthority: false }
});
const envelope = (correlationId, data) => ({
  meta: { contractVersion: "1.0", engineVersion: "decision-outcome-audit", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", correlationId,
    generatedAt: "2026-11-06T20:00:00Z", evidenceFreshness: "QA_FIXTURE", limitations: ["Synthetic audit fixture only."] },
  data
});
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) }).catch(() => {});

const passes = [];
const failures = [];
const check = (name, ok, detail = "") => ((ok ? passes : failures).push(detail ? `${name} [${detail}]` : name), ok);

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });

// Per-card outcome records held by the fake service; each POST is recorded with the id in its URL.
const records = { "qa-outcome-a": [{ outcomeId: "out-a-1", action: "BOUGHT", priceCents: 120000, actionDate: "2026-11-05" }], "qa-outcome-b": [] };
const posts = [];
const events = [];
const unmocked = new Set();
const pageErrors = [];

async function newSession() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); } catch (_) {}
  });
  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "${email}" }),
      getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Outcome Audit", membershipActive: true, membershipConfigured: true }) });`
  }));
  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "(() => {})();" }));
  await page.route("**/api/conversion-event", route => {
    try { events.push(JSON.parse(route.request().postData() || "{}").event); } catch (_) {}
    return json(route, 202, { accepted: true });
  });
  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const correlationId = request.headers()["x-correlation-id"] || "decision-outcome-audit";
    if (url.pathname === "/api/v1/health") return json(route, 200, envelope(correlationId, { status: "configured" }));
    if (url.pathname === "/api/v1/opportunities") return json(route, 200, envelope(correlationId, { kind: "opportunities", items: ids.map(opportunity), count: ids.length, sourceOfTruth: "SQLite", transactionAuthority: false }));
    if (url.pathname === "/api/v1/dashboard") return json(route, 200, envelope(correlationId, { metrics: { trackedOpportunities: ids.length, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 0 }, items: ids.map(opportunity) }));
    const outcome = url.pathname.match(/^\/api\/v1\/decision-outcomes\/([^/]+)$/);
    if (outcome) {
      const id = decodeURIComponent(outcome[1]);
      if (!records[id]) return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Unknown card.", correlationId } });
      if (request.method() === "POST") {
        const body = JSON.parse(request.postData() || "{}");
        posts.push({ id, action: body.action });
        records[id].push({ outcomeId: `out-${id}-${records[id].length + 1}`, action: body.action, priceCents: body.priceCents ?? null, actionDate: body.actionDate || null });
      }
      return json(route, 200, envelope(correlationId, { kind: "customer-decision-outcomes", opportunityId: id, verificationStatus: "UNVERIFIED",
        learningEligible: false, savedDecisionChanged: false, records: records[id] }));
    }
    const record = url.pathname.match(/^\/api\/v1\/(opportunities|evidence|psa-advisor)\/([^/]+)$/);
    if (record) {
      const [, kind, encoded] = record;
      const id = decodeURIComponent(encoded);
      if (!cards[id]) return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Unknown card.", correlationId } });
      const data = kind === "opportunities"
        ? { kind: "opportunity-detail", opportunity: opportunity(id), sourceOfTruth: "SQLite", transactionAuthority: false }
        : kind === "evidence"
          ? { kind: "evidence", opportunityId: id, acceptedExactCompletedSales: cards[id].acceptedSales, visibleButAuthorityIneligible: 0, acceptedSales: [], excludedSales: [], transactionAuthority: false }
          : { kind: "psa-advisor", opportunityId: id, guidanceStatus: "AVAILABLE", recalculated: false, transactionAuthority: false, sourceOfTruth: "Existing PSA intelligence" };
      return json(route, 200, envelope(correlationId, data));
    }
    unmocked.add(`${request.method()} ${url.pathname}`);
    return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Not part of this fixture.", correlationId } });
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  return { context, page };
}

const panelSelector = id => `#main-content .customer-saved-decisions-page [data-decision-outcome-panel][data-decision-outcome-opportunity="${id}"]`;
const go = (page, hash) => page.evaluate(target => { location.hash = target; }, hash);
const panels = page => page.evaluate(() => [...document.querySelectorAll("[data-decision-outcome-panel]")].map(panel => ({
  id: panel.getAttribute("data-decision-outcome-opportunity"),
  inMain: Boolean(panel.closest("#main-content")),
  inStack: Boolean(panel.closest("[data-ff-cdi-signal], [data-ff-cdi-stack-host]")),
  // Only the recorded entries (the form's own option labels also read "I bought it" / "I passed").
  text: [...panel.querySelectorAll(".ff-decision-outcome-list li")].map(li => li.textContent.trim()).join(" | ") || "(none recorded)"
})));
async function waitForPanel(page, id) {
  await page.waitForSelector(`${panelSelector(id)} [data-decision-outcome-form]`, { timeout: 15000 });
  await page.waitForTimeout(600); // the panel's GET of this card's records settles
}

const { context, page } = await newSession();
try {
  // 1. Card A: one panel, inside the route-owned saved-decision view, showing A's own record.
  await page.goto(`${baseUrl}/#/opportunities/qa-outcome-a`, { waitUntil: "domcontentloaded" });
  await waitForPanel(page, "qa-outcome-a");
  let list = await panels(page);
  check("card A shows exactly one panel", list.length === 1, JSON.stringify(list.map(p => p.id)));
  check("card A panel is inside #main-content", list.every(p => p.inMain));
  check("card A panel is not inside the CDI Signal Stack", list.every(p => !p.inStack));
  check("card A panel is bound to card A", list[0]?.id === "qa-outcome-a");
  check("card A panel shows A's record", /I bought it/.test(list[0]?.text || ""), list[0]?.text.slice(0, 160));

  // 2. Navigate to card B: A's panel is gone and B's panel is the only one.
  await go(page, "#/opportunities/qa-outcome-b");
  await waitForPanel(page, "qa-outcome-b");
  list = await panels(page);
  check("after A -> B exactly one panel exists", list.length === 1, JSON.stringify(list.map(p => p.id)));
  check("after A -> B the panel is bound to card B", list[0]?.id === "qa-outcome-b");
  check("after A -> B no record of card A is shown", !/I bought it/.test(list[0]?.text || ""), list[0]?.text.slice(0, 160));

  // 3. Submit on B: the request must carry B's id.
  await page.selectOption(`${panelSelector("qa-outcome-b")} select[name="outcomeAction"]`, "PASSED");
  await page.click(`${panelSelector("qa-outcome-b")} button[type="submit"]`);
  await page.waitForFunction(sel => /Saved as your own report/.test(document.querySelector(sel)?.textContent || ""), panelSelector("qa-outcome-b"), { timeout: 10000 }).catch(() => {});
  check("submit after A -> B posts exactly once", posts.length === 1, JSON.stringify(posts));
  check("submit after A -> B carries card B's id", posts.length === 1 && posts[0].id === "qa-outcome-b", JSON.stringify(posts));
  check("card A received no report from card B", records["qa-outcome-a"].length === 1);

  // 4. Back to A: A's panel only, with A's records only.
  await go(page, "#/opportunities/qa-outcome-a");
  await waitForPanel(page, "qa-outcome-a");
  list = await panels(page);
  check("returning to A shows exactly one panel", list.length === 1, JSON.stringify(list.map(p => p.id)));
  check("returning to A the panel is bound to card A", list[0]?.id === "qa-outcome-a");
  check("returning to A shows A's records only", /I bought it/.test(list[0]?.text || "") && !/I passed/.test(list[0]?.text || ""), list[0]?.text.slice(0, 160));

  // 5. A non-card route has no panel at all (nothing left in the persistent workspace).
  await go(page, "#/dashboard");
  await page.waitForTimeout(1200);
  list = await panels(page);
  check("a non-card route shows no panel anywhere", list.length === 0, JSON.stringify(list.map(p => p.id)));

  // 6. Receipt action: ends with the receipt panel open and in view, and still emits decision_receipt_opened.
  await go(page, "#/opportunities/qa-outcome-a");
  await waitForPanel(page, "qa-outcome-a");
  const hasPassport = await page.locator("#main-content .ff-decision-card-evidence").count();
  check("fixture renders the evidence passport the old handler scrolled to", hasPassport > 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  const receiptButton = page.locator("#main-content [data-ff-ux-open-receipt]");
  check("Open Decision Receipt action is present", await receiptButton.count() === 1);
  await receiptButton.click();
  await page.waitForTimeout(1500);
  const receipt = await page.evaluate(() => {
    const panel = document.querySelector("#main-content [data-ff-ux-receipt-panel]");
    if (!panel) return null;
    const rect = panel.querySelector("summary").getBoundingClientRect();
    return { open: panel.open, top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: window.innerHeight };
  });
  check("receipt panel is open after the click", receipt?.open === true, JSON.stringify(receipt));
  check("receipt click ends with the receipt panel in view", Boolean(receipt) && receipt.top >= 0 && receipt.bottom <= receipt.height, JSON.stringify(receipt));
  await page.waitForTimeout(300);
  check("receipt click still emits decision_receipt_opened once", events.filter(e => e === "decision_receipt_opened").length === 1, JSON.stringify(events));
} catch (error) {
  failures.push(`audit error: ${error.message.split("\n")[0]}`);
  const where = await page.evaluate(() => ({ hash: location.hash, card: document.querySelector("#main-content [data-ff-card-id]")?.getAttribute("data-ff-card-id") || "",
    reevaluate: Boolean(document.querySelector("#main-content [data-card-reevaluate]")), panels: document.querySelectorAll("[data-decision-outcome-panel]").length,
    heading: document.querySelector("#main-content h1, #main-content h2")?.textContent || "",
    text: (document.querySelector("#main-content")?.textContent || "").replace(/\s+/g, " ").slice(0, 300) })).catch(() => ({}));
  console.log("state at failure:", JSON.stringify({ ...where, unmocked: [...unmocked], pageErrors: pageErrors.slice(0, 3) }));
} finally {
  await context.close();
  await browser.close();
}

for (const name of passes) console.log(`PASS ${name}`);
for (const name of failures) console.log(`FAIL ${name}`);
console.log(`Decision outcome record audit: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
