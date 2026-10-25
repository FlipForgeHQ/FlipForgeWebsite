// Portfolio Sell Watch (hosted v1) on the tracked-card page.
//
// Full app shell, every script; only server responses are controlled. The Sell Watch responses are fixtures recorded
// from the real backend service (FlipForge2 SaaSSellWatchService on a synthetic database), so the panel is tested
// against the real contract. Checks:
//   - the panel appears on a card the customer owns, shows what they paid, and asks for their selling costs;
//   - costs are sent as whole basis points and cents with the record version and only allowlisted keys; totals
//     above 50% are refused before anything is sent;
//   - after saving, the costs are summarized and a price can be checked; the service's figures are shown as given;
//   - the panel's wording gives no instruction (no sell / hold / list / exit / buy / should / recommend);
//   - a card that is not owned gets no panel; when the service has the feature off (404) the panel is removed;
//   - a response that claims transaction authority or a displayed market comparison is refused;
//   - the Sales panel stays directly under the lifecycle form, Sell Watch below it; no overflow on a phone;
//   - the gateway allowlists exactly the four Sell Watch routes and maps its two conflict codes.
// Synthetic fixtures only: no network, no provider calls, no marketplace data.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const email = "sell-watch-audit@flipforge.test";
const fixture = (dir, name) => JSON.parse(fs.readFileSync(path.join(root, "scripts/fixtures", dir, `${name}.json`), "utf8"));
const sw = name => fixture("customer-sell-watch", name);
const life = name => fixture("customer-reported-sales", name);
const OPP = "opp-ohtani-psa10";
const OTHER = "opp-lebron-psa9";
const forCard = (body, card) => card === OPP ? body : JSON.parse(JSON.stringify(body).split(OPP).join(card));

const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

// ---- static: gateway, panel source, shells ----------------------------------------------------------------------
const gateway = fs.readFileSync(path.join(root, "netlify/functions/flipforge-api.js"), "utf8");
const routeLines = gateway.split("\n").filter(line => line.includes("sell-watch") && line.includes("method:"));
check("G1 gateway allows exactly four Sell Watch routes", routeLines.length === 4, routeLines.join(" | "));
check("G2 gateway allows GET list and card, PUT costs by channel, POST estimate",
  gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/sell-watch$/ }')
  && gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/sell-watch\\/[A-Za-z0-9._:-]+$/ }')
  && gateway.includes('{ method: "PUT", pattern: /^\\/api\\/v1\\/sell-watch\\/costs\\/(?:MARKETPLACE|AUCTION_HOUSE|CONSIGNMENT|DEALER_DIRECT|PRIVATE_SALE|OTHER)$/ }')
  && gateway.includes('{ method: "POST", pattern: /^\\/api\\/v1\\/sell-watch\\/[A-Za-z0-9._:-]+\\/estimate$/ }'));
check("G3 gateway never allows DELETE on Sell Watch", !routeLines.some(line => line.includes('"DELETE"')));
check("G4 gateway maps both Sell Watch conflict codes", gateway.includes('upstreamCode === "SELL_WATCH_COSTS_VERSION_CONFLICT"')
  && gateway.includes('upstreamCode === "SELL_WATCH_CARD_NOT_OWNED"'));
const panelSource = fs.readFileSync(path.join(root, "saas-prototype/customer-sell-watch.js"), "utf8");
check("G5 panel uses no browser dialogs", !/window\.(prompt|alert|confirm)\s*\(/.test(panelSource));
for (const shell of ["index.html", "customer.html"]) {
  const html = fs.readFileSync(path.join(root, "saas-prototype", shell), "utf8");
  check(`G6 ${shell} loads Sell Watch after the Sales panel`, html.indexOf("customer-sell-watch.js") > html.indexOf("customer-reported-sales.js")
    && html.includes('<link rel="stylesheet" href="customer-sell-watch.css">'));
}

// ---- browser ---------------------------------------------------------------------------------------------------
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
const withCorrelation = (body, correlationId) => ({ ...body, meta: { ...body.meta, correlationId } });
const INSTRUCTION = /\b(sell|hold|list|exit|buy|should|recommend|recommended|guaranteed|worth)\b/i;

process.on("unhandledRejection", error => {
  console.log(`::error title=sell-watch-audit::${String(error?.message || error).split("\n")[0]}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Sell Watch\n\nCrashed: ${String(error?.message || error).split("\n")[0]}\n\nPassed before the crash: ${passes.length}. Failed: ${failures.join("; ") || "none"}\n`);
  process.exit(1);
});

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });

async function session({ viewport = { width: 1440, height: 1000 }, mode = "on", sales = "off" } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const writes = [];
  const errors = [];
  let costsSaved = false;
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
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "${email}" }), getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Sell Watch Audit", membershipActive: true, membershipConfigured: true }) });`
  }));
  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "(() => {})();" }));
  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const correlationId = request.headers()["x-correlation-id"] || "sell-watch-audit";
    if (url.pathname === "/api/v1/health") return json(route, 200, { meta: { contractVersion: "1.0", correlationId }, data: { status: "configured" } });
    if (url.pathname === "/api/v1/opportunities") return json(route, 200, withCorrelation(life("opportunities"), correlationId));
    if (url.pathname === "/api/v1/lifecycle") return json(route, 200, withCorrelation(life("lifecycle-list"), correlationId));
    const lifecycleCard = url.pathname.match(/^\/api\/v1\/lifecycle\/([^/]+)$/);
    if (lifecycleCard && [OPP, OTHER].includes(decodeURIComponent(lifecycleCard[1]))) {
      return json(route, 200, withCorrelation(forCard(life("lifecycle-detail"), decodeURIComponent(lifecycleCard[1])), correlationId));
    }
    if (url.pathname.startsWith("/api/v1/reported-sales/")) {
      if (sales === "off") return json(route, 404, { error: { code: "UPSTREAM_REJECTED", message: "Off in this audit.", correlationId } });
      const card = decodeURIComponent(url.pathname.split("/")[4] || "");
      return json(route, 200, withCorrelation(forCard(life("sales-empty"), card), correlationId));
    }
    if (url.pathname.startsWith("/api/v1/sell-watch")) {
      if (mode === "off") return json(route, 404, { error: { code: "UPSTREAM_REJECTED", message: "The authoritative FlipForge service rejected the request.", correlationId } });
      if (request.method() !== "GET") writes.push({ method: request.method(), path: url.pathname, body: JSON.parse(request.postData() || "{}") });
      let body;
      if (request.method() === "PUT" && url.pathname === "/api/v1/sell-watch/costs/MARKETPLACE") {
        costsSaved = true;
        body = sw("costs-saved");
      } else if (request.method() === "POST" && url.pathname === `/api/v1/sell-watch/${OPP}/estimate`) {
        const sent = JSON.parse(request.postData() || "{}");
        body = !costsSaved ? sw("estimate-costs-needed") : sent.priceCents === 100000 ? sw("estimate-below") : sw("estimate");
      } else if (request.method() === "GET" && url.pathname === `/api/v1/sell-watch/${OPP}`) {
        body = costsSaved ? sw("card-with-costs") : sw("card-no-costs");
      } else if (request.method() === "GET" && url.pathname === `/api/v1/sell-watch/${OTHER}`) {
        body = forCard(sw("card-not-owned"), OTHER);
      } else {
        return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Not in this fixture.", correlationId } });
      }
      body = withCorrelation(body, correlationId);
      if (mode === "authority") body = { ...body, data: { ...body.data, transactionAuthority: true } };
      if (mode === "comparison") body = { ...body, data: { ...body.data, marketComparisonDisplayed: true } };
      return json(route, 200, body);
    }
    return json(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "Not in this fixture.", correlationId } });
  });
  await page.goto(`${baseUrl}/#/tracking/${OPP}`, { waitUntil: "load" });
  return { context, page, writes, errors };
}

const text = async (page, selector) => (await page.locator(selector).innerText().catch(() => "")).replace(/\s+/g, " ");
const P = "[data-sell-watch-panel]";

// 1. Owned card: costs, check a price, wording.
{
  const { context, page, writes, errors } = await session();
  await page.waitForSelector(`${P}:not([hidden]) [data-sell-watch-costs-form]`, { timeout: 30000 });
  const first = await text(page, P);
  check("B1 panel appears on the owned card with what was paid", /Sell Watch/.test(first) && /You paid \$1,215\.00/i.test(first), first.slice(0, 200));
  check("B2 no costs saved: the costs form is shown and no price can be checked yet",
    await page.locator(`${P} [data-sell-watch-price-form]`).count() === 0);
  const f = `${P} [data-sell-watch-costs-form]`;
  await page.fill(`${f} [name=commissionBps]`, "40");
  await page.fill(`${f} [name=paymentProcessingBps]`, "20");
  await page.click(`${f} button[type=submit]`);
  await page.waitForTimeout(300);
  check("B3 percentages above 50% in total are refused before sending", writes.length === 0 && /limited to 50%/i.test(await text(page, P)));
  await page.fill(`${f} [name=commissionBps]`, "13.25");
  await page.fill(`${f} [name=paymentProcessingBps]`, "2.9");
  await page.fill(`${f} [name=fixedFeeCents]`, "0.30");
  await page.fill(`${f} [name=shippingCents]`, "6");
  await page.click(`${f} button[type=submit]`);
  await page.waitForSelector(`${P} [data-sell-watch-price-form]`, { timeout: 20000 });
  const put = writes.find(w => w.method === "PUT");
  check("B4 costs PUT goes to the channel's route", put?.path === "/api/v1/sell-watch/costs/MARKETPLACE");
  check("B5 costs are sent as whole basis points and cents with version 0", put?.body.commissionBps === 1325 && put?.body.paymentProcessingBps === 290
    && put?.body.fixedFeeCents === 30 && put?.body.shippingCents === 600 && put?.body.insuranceCents === 0 && put?.body.otherCostCents === 0
    && put?.body.expectedVersion === 0, JSON.stringify(put?.body || {}));
  const allowed = ["commissionBps", "paymentProcessingBps", "fixedFeeCents", "shippingCents", "insuranceCents", "otherCostCents", "expectedVersion"];
  check("B6 costs PUT sends only allowlisted keys", put && Object.keys(put.body).every(key => allowed.includes(key)));
  const saved = await text(page, P);
  check("B7 saved costs are summarized and marked on the channel", /13\.25% commission, 2\.9% payment processing, \$0\.30 fixed fee, \$6\.00 shipping/.test(saved)
    && /Marketplace \(costs saved\)/.test(saved), saved.slice(0, 400));
  await page.fill(`${P} [data-sell-watch-price-form] [name=price]`, "1500");
  await page.click(`${P} [data-sell-watch-price-form] button[type=submit]`);
  await page.waitForSelector(`${P} [data-sell-watch-result]`, { timeout: 20000 });
  const post = writes.find(w => w.method === "POST");
  check("B8 estimate POST sends the channel and the price in cents only", post?.path === `/api/v1/sell-watch/${OPP}/estimate`
    && post?.body.channel === "MARKETPLACE" && post?.body.priceCents === 150000 && Object.keys(post?.body || {}).length === 2);
  const result = await text(page, `${P} [data-sell-watch-result]`);
  check("B9 the service's message and every cost line are shown", /you would keep about \$1,251\.45/.test(result)
    && /\$36\.45 \(3\.0%\) more than you paid/.test(result) && /Commission − \$198\.75/.test(result)
    && /Payment processing − \$43\.50/.test(result) && /You would keep \$1,251\.45/.test(result), result);
  await page.fill(`${P} [data-sell-watch-price-form] [name=price]`, "1000");
  await page.click(`${P} [data-sell-watch-price-form] button[type=submit]`);
  await page.waitForFunction(sel => /less than you paid/.test(document.querySelector(sel)?.innerText || ""), `${P} [data-sell-watch-result]`, { timeout: 20000 });
  check("B10 a lower price shows the shortfall", /less than you paid/.test(await text(page, `${P} [data-sell-watch-result]`)));
  const wording = (await text(page, P)).replace(/Sell Watch/g, "");
  check("B11 the panel gives no instruction or claim", !INSTRUCTION.test(wording), (wording.match(INSTRUCTION) || [""])[0]);
  check("B12 no page errors or browser dialogs", errors.length === 0, errors.join(" | "));
  const used = await page.evaluate(() => window.FlipForgeSellWatch?.requestCount?.() ?? -1);
  check("B13 the panel makes a bounded number of requests (no reload loop)", used > 0 && used <= 10, `requests=${used}`);
  await page.selectOption("[data-lifecycle-select]", OTHER);
  await page.waitForTimeout(2500);
  check("B14 a card that is not owned gets no Sell Watch panel", await page.locator(P).count() === 0);
  await context.close();
}

// 2. Feature off on the service.
{
  const { context, page, writes } = await session({ mode: "off" });
  await page.waitForSelector("[data-lifecycle-form]", { timeout: 30000 });
  await page.waitForTimeout(2000);
  check("C1 feature off: no Sell Watch panel", await page.locator(P).count() === 0);
  check("C2 feature off: lifecycle form untouched and nothing written", await page.locator("[data-lifecycle-form]").count() === 1 && writes.length === 0);
  const requests = await page.evaluate(() => window.FlipForgeSellWatch?.requestCount?.() ?? -1);
  check("C3 feature off: the panel asked once and stopped", requests === 1, `requests=${requests}`);
  await context.close();
}

// 3. Contract refusal.
for (const mode of ["authority", "comparison"]) {
  const { context, page } = await session({ mode });
  await page.waitForFunction(sel => /SELL_WATCH_CONTRACT_INVALID/.test(document.querySelector(sel)?.innerText || ""), P, { timeout: 20000 }).catch(() => {});
  const shown = await text(page, P);
  check(`D1 a response claiming ${mode === "authority" ? "transaction authority" : "a displayed market comparison"} is refused`,
    /SELL_WATCH_CONTRACT_INVALID/.test(shown) && !/\$1,215/.test(shown), shown.slice(0, 200));
  await context.close();
}

// 4. With Mark as Sold on: Sales stays directly under the lifecycle form, Sell Watch below it.
{
  const { context, page } = await session({ sales: "on" });
  await page.waitForSelector(`${P}:not([hidden])`, { timeout: 30000 });
  await page.waitForSelector("[data-reported-sales-panel]", { timeout: 30000 });
  const order = await page.evaluate(() => {
    const sales = document.querySelector("[data-reported-sales-panel]");
    const watch = document.querySelector("[data-sell-watch-panel]");
    return Boolean(sales && watch && (sales.compareDocumentPosition(watch) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  check("F1 Sell Watch sits below the Sales panel", order);
  await context.close();
}

// 5. Phone width.
{
  const { context, page } = await session({ viewport: { width: 390, height: 844 } });
  await page.waitForSelector(`${P}:not([hidden]) [data-sell-watch-costs-form]`, { timeout: 30000 });
  check("E1 no horizontal overflow on a phone with the costs form open", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await context.close();
}

await browser.close();

console.log(`Sell Watch audit: ${passes.length} passed, ${failures.length} failed.`);
for (const failure of failures) console.log(`FAIL ${failure}\n::error title=sell-watch-audit::${failure}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Sell Watch\n\n${passes.length} passed, ${failures.length} failed.\n${failures.map(f => `- FAIL ${f}`).join("\n")}\n`);
}
if (failures.length) process.exit(1);
