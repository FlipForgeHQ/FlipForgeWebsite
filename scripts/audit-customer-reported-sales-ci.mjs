// Customer-reported sales, Phase 1 ("Mark as Sold") on the tracked-card page.
//
// Full app shell, every script; only server responses are controlled. The responses are fixtures recorded from the
// real backend services (FlipForge2 SaaSCustomerReportedSaleService on a synthetic database), so the panel is tested
// against the real contract. Checks:
//   - the panel appears under a tracked card's lifecycle and offers Mark as Sold;
//   - the form sends whole cents, the customer's explicit consent choice (off by default), a retry-safe client id, and
//     no buyer or personal field; an email typed as the transaction number is refused before anything is sent;
//   - a recorded sale is shown as "User reported", awaiting verification, with net proceeds and realized profit;
//   - a refund is sent with the record version and the reduced result is shown;
//   - when the service has the feature switched off (404) the panel is removed and the lifecycle form is untouched;
//   - a response that is not labelled USER_REPORTED, or that claims data use, is refused;
//   - no horizontal overflow on a phone;
//   - the gateway allowlists exactly the four reported-sales routes.
// Synthetic fixtures only: no network, no provider calls, no marketplace data.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const email = "reported-sales-audit@flipforge.test";
const fixture = name => JSON.parse(fs.readFileSync(path.join(root, "scripts/fixtures/customer-reported-sales", `${name}.json`), "utf8"));
const OPP = "opp-ohtani-psa10";
const OTHER = "opp-lebron-psa9";
// The same recorded fixture, re-addressed to the second tracked card.
const forCard = (body, card) => card === OPP ? body : JSON.parse(JSON.stringify(body).split(OPP).join(card));

const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

// ---- gateway allowlist (static) ------------------------------------------------------------------------------
const gateway = fs.readFileSync(path.join(root, "netlify/functions/flipforge-api.js"), "utf8");
check("G1 gateway allows GET of the reported-sales list", gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/reported-sales$/ }'));
check("G2 gateway allows GET and POST for one card", gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/reported-sales\\/[A-Za-z0-9._:-]+$/ }')
  && gateway.includes('{ method: "POST", pattern: /^\\/api\\/v1\\/reported-sales\\/[A-Za-z0-9._:-]+$/ }'));
check("G3 gateway allows PUT only on a card and an rs_ report id", gateway.includes('{ method: "PUT", pattern: /^\\/api\\/v1\\/reported-sales\\/[A-Za-z0-9._:-]+\\/rs_[0-9a-f-]{36}$/ }'));
check("G4 gateway never allows DELETE on reported sales", !/method: "DELETE", pattern: \/\^\\\/api\\\/v1\\\/reported-sales/.test(gateway));
check("G5 gateway maps the version conflict", gateway.includes("REPORTED_SALE_VERSION_CONFLICT"));
const panelSource = fs.readFileSync(path.join(root, "saas-prototype/customer-reported-sales.js"), "utf8");
check("G6 panel has no buyer fields", !/name="buyer|buyerName|buyerEmail|shippingAddress|name="notes"/i.test(panelSource));
check("G7 panel uses no browser dialogs", !/window\.(prompt|alert|confirm)\s*\(/.test(panelSource));
for (const shell of ["index.html", "customer.html"]) {
  const html = fs.readFileSync(path.join(root, "saas-prototype", shell), "utf8");
  check(`G8 ${shell} loads the panel after the lifecycle display`, html.indexOf("customer-reported-sales.js") > html.indexOf("customer-lifecycle-display.js")
    && html.includes('<link rel="stylesheet" href="customer-reported-sales.css">'));
}

// ---- browser ---------------------------------------------------------------------------------------------------
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
const withCorrelation = (body, correlationId) => ({ ...body, meta: { ...body.meta, correlationId } });

process.on("unhandledRejection", error => {
  console.log(`::error title=reported-sales-audit::${String(error?.message || error).split("\n")[0]}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Customer reported sales\n\nCrashed: ${String(error?.message || error).split("\n")[0]}\n\nPassed before the crash: ${passes.length}. Failed: ${failures.join("; ") || "none"}\n`);
  process.exit(1);
});

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });

async function session({ viewport = { width: 1440, height: 1000 }, mode = "on", postDelayMs = 0 } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const writes = [];
  const errors = [];
  const sales = new Map([[OPP, fixture("sales-empty")], [OTHER, forCard(fixture("sales-empty"), OTHER)]]);
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => { errors.push(`dialog: ${dialog.type()}`); dialog.dismiss(); });
  await page.addInitScript(({ email }) => {
    localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
    let hash = 2166136261;
    for (const ch of email.toLowerCase()) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    const key = (hash >>> 0).toString(36);
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.welcome`, "seen");
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.enabled`, "off");
  }, { email });
  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "${email}" }), getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Reported Sales Audit", membershipActive: true, membershipConfigured: true }) });`
  }));
  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "(() => {})();" }));
  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const correlationId = request.headers()["x-correlation-id"] || "reported-sales-audit";
    if (url.pathname === "/api/v1/health") return json(route, 200, { meta: { contractVersion: "1.0", correlationId }, data: { status: "configured" } });
    if (url.pathname === "/api/v1/opportunities") return json(route, 200, withCorrelation(fixture("opportunities"), correlationId));
    if (url.pathname === "/api/v1/lifecycle") return json(route, 200, withCorrelation(fixture("lifecycle-list"), correlationId));
    const lifecycleCard = url.pathname.match(/^\/api\/v1\/lifecycle\/([^/]+)$/);
    if (lifecycleCard && [OPP, OTHER].includes(decodeURIComponent(lifecycleCard[1]))) {
      return json(route, 200, withCorrelation(forCard(fixture("lifecycle-detail"), decodeURIComponent(lifecycleCard[1])), correlationId));
    }
    if (url.pathname.startsWith("/api/v1/reported-sales/")) {
      if (mode === "off") return json(route, 404, { error: { code: "UPSTREAM_REJECTED", message: "The authoritative FlipForge service rejected the request.", correlationId } });
      const card = decodeURIComponent(url.pathname.split("/")[4] || "");
      if (request.method() !== "GET") writes.push({ method: request.method(), path: url.pathname, body: JSON.parse(request.postData() || "{}") });
      if (request.method() === "POST") {
        if (postDelayMs) await new Promise(resolve => setTimeout(resolve, postDelayMs));
        sales.set(card, forCard(fixture("sales-after-sale"), card));
      }
      if (request.method() === "PUT") sales.set(card, forCard(fixture("sales-after-refund"), card));
      let body = withCorrelation(sales.get(card) || fixture("sales-empty"), correlationId);
      if (mode === "tampered") body = { ...body, data: { ...body.data, label: "VERIFIED" } };
      if (mode === "data-use") body = { ...body, data: { ...body.data, dataUseEnabled: true } };
      return json(route, 200, body);
    }
    return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Not in this fixture.", correlationId } });
  });
  await page.goto(`${baseUrl}/#/tracking/${OPP}`, { waitUntil: "load" });
  return { context, page, writes, errors };
}

const text = async (page, selector) => (await page.locator(selector).innerText().catch(() => "")).replace(/\s+/g, " ");

// 1. Mount, form, submit, display.
{
  const { context, page, writes, errors } = await session();
  await page.waitForSelector("[data-reported-sales-panel] [data-reported-sale-open]", { timeout: 30000 });
  check("B1 panel appears under the tracked card with Mark as Sold", await page.locator("[data-lifecycle-form]").count() === 1
    && /Mark as Sold/i.test(await text(page, "[data-reported-sales-panel]")));
  check("B2 empty state says no sale is recorded", /No sale recorded for this card yet/i.test(await text(page, "[data-reported-sales-panel]")));
  await page.click("[data-reported-sale-open]");
  const f = "[data-reported-sale-form]";
  check("B3 consent is off until the customer ticks it", !(await page.isChecked(`${f} [name=consent]`)));
  check("B4 form has no buyer or note fields", await page.locator(`${f} [name*=buyer i], ${f} [name=notes], ${f} [name*=address i], ${f} [name*=email i]`).count() === 0);
  await page.fill(`${f} [name=salePrice]`, "1650");
  await page.fill(`${f} [name=saleDate]`, "2026-10-20");
  await page.selectOption(`${f} [name=venue]`, "EBAY");
  await page.selectOption(`${f} [name=evidenceType]`, "ORDER_NUMBER");
  await page.fill(`${f} [name=evidenceReference]`, "jane.buyer@example.com");
  await page.click(`${f} button[type=submit]`);
  await page.waitForTimeout(300);
  check("B5 an email typed as the transaction number is refused before sending", writes.length === 0
    && /transaction number only/i.test(await text(page, "[data-reported-sales-panel]")));
  await page.fill(`${f} [name=evidenceReference]`, "26-13579-24680");
  await page.selectOption(`${f} [name=saleFormat]`, "AUCTION");
  await page.fill(`${f} [name=marketplaceFee]`, "214.50");
  await page.fill(`${f} [name=paymentFee]`, "0");
  await page.fill(`${f} [name=shippingCost]`, "18");
  await page.fill(`${f} [name=otherFee]`, "0");
  await page.click(`${f} button[type=submit]`);
  await page.waitForSelector("[data-reported-sale-id]", { timeout: 20000 });
  const post = writes.find(w => w.method === "POST");
  const allowedKeys = ["clientReportId", "salePriceCents", "saleDate", "venue", "saleStatus", "marketplaceFeeCents", "paymentFeeCents",
    "shippingCostCents", "otherFeeCents", "aggregateResearchConsent", "saleFormat", "evidenceType", "evidenceReference", "acquisitionCostCents", "acquiredAt"];
  check("B6 POST goes to the card's route", post?.path === `/api/v1/reported-sales/${OPP}`);
  check("B7 POST sends whole cents", post?.body.salePriceCents === 165000 && post?.body.marketplaceFeeCents === 21450 && post?.body.shippingCostCents === 1800);
  check("B8 POST sends the explicit consent choice (false)", post?.body.aggregateResearchConsent === false);
  check("B9 POST sends only allowlisted keys", post && Object.keys(post.body).every(key => allowedKeys.includes(key)), Object.keys(post?.body || {}).join(","));
  check("B10 POST carries a retry-safe client id", /^[0-9a-f-]{36}$/.test(String(post?.body.clientReportId || "")));
  check("B11 POST never claims verification", post && !("verificationStatus" in post.body) && !("reviewStatus" in post.body));
  await page.waitForTimeout(1200);
  await page.waitForSelector("[data-reported-sale-id]", { timeout: 20000 });
  const shown = await text(page, "[data-reported-sales-panel]");
  check("B12 sale is labelled User reported and awaiting verification", /User reported/i.test(shown) && /Awaiting verification/i.test(shown));
  check("B13 net proceeds and realized profit are shown", /\$1,417\.50/.test(shown) && /\$202\.50/.test(shown));
  check("B14 only the last four of the order number are shown", /ending 4680/i.test(shown) && !/13579/.test(shown));
  check("B15 says reported sales are not used in pricing", /not used in FlipForge's pricing/i.test(shown));
  await page.click("[data-reported-sale-action=refund]");
  await page.fill("[data-refund-for]", "100");
  await page.click(".ff-reported-sale-refund button");
  await page.waitForFunction(() => /Partly refunded/i.test(document.querySelector("[data-reported-sales-panel]")?.innerText || ""), null, { timeout: 20000 });
  const put = writes.find(w => w.method === "PUT");
  check("B16 refund PUT carries amount in cents and the record version", put?.body.action === "RECORD_REFUND" && put?.body.refundCents === 10000
    && put?.body.expectedVersion === 1 && /\/rs_[0-9a-f-]{36}$/.test(put?.path || ""));
  check("B17 reduced result is shown after the refund", /\$1,317\.50/.test(await text(page, "[data-reported-sales-panel]")));
  check("B18 no page errors or browser dialogs", errors.length === 0, errors.join(" | "));
  const used = await page.evaluate(() => window.FlipForgeReportedSales?.requestCount?.() ?? -1);
  check("B19 the panel makes a bounded number of requests (no reload loop)", used > 0 && used <= 12, `requests=${used}`);
  await context.close();
}

// 1b. A save that finishes after the customer switched cards never touches the other card's panel.
{
  const { context, page, writes, errors } = await session({ postDelayMs: 3000 });
  await page.waitForSelector("[data-reported-sales-panel] [data-reported-sale-open]", { timeout: 30000 });
  await page.click("[data-reported-sale-open]");
  const f = "[data-reported-sale-form]";
  await page.fill(`${f} [name=salePrice]`, "1650");
  await page.fill(`${f} [name=saleDate]`, "2026-10-20");
  await page.click(`${f} button[type=submit]`);
  await page.waitForFunction(() => /Saving/i.test(document.querySelector("[data-reported-sales-panel]")?.innerText || ""), null, { timeout: 5000 }).catch(() => {});
  await page.selectOption("[data-lifecycle-select]", OTHER);
  await page.waitForSelector(`[data-reported-sales-panel][data-opportunity-id="${OTHER}"]`, { timeout: 20000 });
  // Watch the second card's panel continuously: the first card's sale must never appear in it, even briefly.
  await page.evaluate(other => {
    window.__ffOtherPanelLeaks = 0;
    const look = () => {
      const node = document.querySelector(`[data-reported-sales-panel][data-opportunity-id="${other}"]`);
      if (node && /\$1,650/.test(node.textContent || "")) window.__ffOtherPanelLeaks += 1;
    };
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(look, 25);
  }, OTHER);
  await page.waitForTimeout(4500); // the first card's save finishes in the meantime
  const other = await text(page, `[data-reported-sales-panel][data-opportunity-id="${OTHER}"]`);
  check("S1 the save went to the first card", writes.some(w => w.method === "POST" && w.path === `/api/v1/reported-sales/${OPP}`));
  const leaks = await page.evaluate(() => window.__ffOtherPanelLeaks);
  check("S2 the second card's panel never shows the first card's sale, even briefly", leaks === 0 && !/\$1,650/.test(other)
    && /No sale recorded/i.test(other), `leaks=${leaks} ${other.slice(0, 120)}`);
  check("S3 the second card's panel is not stuck saving and can open its own form", !/Saving/i.test(other)
    && await page.locator(`[data-reported-sales-panel][data-opportunity-id="${OTHER}"] [data-reported-sale-open]`).count() === 1);
  await page.click(`[data-reported-sales-panel][data-opportunity-id="${OTHER}"] [data-reported-sale-open]`);
  await page.waitForTimeout(3500);
  check("S4 a late response does not close the second card's open form", await page.locator(`[data-reported-sales-panel][data-opportunity-id="${OTHER}"] [data-reported-sale-form]`).count() === 1);
  check("S5 no page errors during the switch", errors.length === 0, errors.join(" | "));
  await context.close();
}

// 2. Feature off on the service.
{
  const { context, page, writes } = await session({ mode: "off" });
  await page.waitForSelector("[data-lifecycle-form]", { timeout: 30000 });
  await page.waitForTimeout(2000);
  check("C1 feature off: no Sales panel", await page.locator("[data-reported-sales-panel]").count() === 0,
    (await text(page, "[data-reported-sales-panel]")).slice(0, 300));
  check("C2 feature off: lifecycle form untouched and nothing written", await page.locator("[data-lifecycle-form]").count() === 1 && writes.length === 0);
  const requests = await page.evaluate(() => window.FlipForgeReportedSales?.requestCount?.() ?? -1);
  check("C3 feature off: the panel asked once and stopped (no request loop)", requests === 1, `requests=${requests}`);
  await context.close();
}

// 3. Contract refusal.
for (const mode of ["tampered", "data-use"]) {
  const { context, page } = await session({ mode });
  await page.waitForSelector("[data-reported-sales-panel]", { timeout: 30000 });
  await page.waitForFunction(() => /SALES_CONTRACT_INVALID/.test(document.querySelector("[data-reported-sales-panel]")?.innerText || ""), null, { timeout: 15000 }).catch(() => {});
  const shown = await text(page, "[data-reported-sales-panel]");
  check(`D1 ${mode} response is refused`, /SALES_CONTRACT_INVALID/.test(shown) && !/\$1,650/.test(shown));
  await context.close();
}

// 4. Phone width.
{
  const { context, page } = await session({ viewport: { width: 390, height: 844 } });
  await page.waitForSelector("[data-reported-sales-panel] [data-reported-sale-open]", { timeout: 30000 });
  await page.click("[data-reported-sale-open]");
  check("E1 no horizontal overflow on a phone with the form open", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await context.close();
}

await browser.close();

console.log(`Customer reported sales audit: ${passes.length} passed, ${failures.length} failed.`);
for (const failure of failures) console.log(`FAIL ${failure}\n::error title=reported-sales-audit::${failure}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Customer reported sales\n\n${passes.length} passed, ${failures.length} failed.\n${failures.map(f => `- FAIL ${f}`).join("\n")}\n`);
}
if (failures.length) process.exit(1);
