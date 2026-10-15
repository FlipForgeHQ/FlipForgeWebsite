// Bulk CSV evaluation when the server reports 422 PROVIDER_BUDGET_EXHAUSTED (hard provider budget spent):
// the batch must stop at the first refusal (no further rows sent), say nothing was saved for that row, and no
// further bulk evaluation may be submitted from the page - including after uploading another CSV.
// Controlled responses only: no provider, no paid evaluation, no production data.
// Requires the local SaaS server (node saas-prototype/serve.mjs) on FLIPFORGE_LAYOUT_AUDIT_URL.
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app/beta";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const passes = [];
const failures = [];
const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const csv = rows => ["externalListingId,marketplace,cardIdentity,listingUrl,itemPrice",
  ...Array.from({ length: rows }, (_, index) => `bulk-${index + 1},EBAY,2018 Topps Chrome Shohei Ohtani #150 PSA 9,https://www.ebay.com/itm/90000000000${index + 1},700.00`)].join("\n");

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  try {
    localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
    for (const key of Object.keys(localStorage)) if (key.startsWith("flipforge.guidedMode")) localStorage.removeItem(key);
  } catch (_) {}
});
await context.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
  status: 200, contentType: "text/javascript; charset=utf-8",
  body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "bulk-audit@flipforge.test" }),
    getSnapshot: () => ({ authenticated: true, email: "bulk-audit@flipforge.test", fullName: "Bulk Audit", membershipActive: true, membershipConfigured: true }) });`
}));
await context.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
const evaluationCalls = [];
await context.route("**/api/v1/**", async route => {
  const request = route.request();
  const url = new URL(request.url());
  const correlationId = request.headers()["x-correlation-id"] || "bulk-audit";
  const json = (status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
  if (url.pathname === "/api/v1/evaluations") {
    evaluationCalls.push(JSON.parse(request.postData() || "{}").externalListingId);
    return json(422, { error: { code: "PROVIDER_BUDGET_EXHAUSTED", message: "FlipForge stopped before finishing because this account's data-provider budget has been reached. No decision was saved and no evaluation was used.", correlationId } });
  }
  if (url.pathname === "/api/v1/health") return json(200, { meta: { contractVersion: "1.0", correlationId }, data: { status: "configured" } });
  return json(404, { error: { code: "QA_NOT_MOCKED", message: url.pathname, correlationId } });
});

const page = await context.newPage();
let loads = 0;
page.on("load", () => { loads += 1; });
try {
  await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "load" });
  await page.waitForSelector("#main-content [data-bulk-file]", { state: "attached", timeout: 15000 });
  await page.setInputFiles("#main-content [data-bulk-file]", { name: "batch-one.csv", mimeType: "text/csv", buffer: Buffer.from(csv(5)) });
  await page.locator("#main-content [data-bulk-ack]").check();
  const loadsAtStart = loads;
  await page.locator("#main-content [data-bulk-run]").click();
  await page.waitForFunction(() => !/Evaluating/.test(document.querySelector("#main-content [data-bulk-run]")?.textContent || ""), null, { timeout: 15000 });
  const afterRun = await page.evaluate(() => ({
    panel: document.querySelector("#main-content [data-bulk-evaluation]")?.innerText.replace(/\s+/g, " ") || "",
    runDisabled: document.querySelector("#main-content [data-bulk-run]")?.disabled === true
  }));
  check("the batch stops at the first refusal: exactly one row was sent", evaluationCalls.length === 1, JSON.stringify(evaluationCalls));
  check("the refused row says nothing was saved and no evaluation was used",
    /No decision was saved for this row and no evaluation was used/.test(afterRun.panel), afterRun.panel.slice(0, 200));
  check("the batch message explains the provider budget and that unsent rows were not sent",
    /data-provider budget has been reached/.test(afterRun.panel) && /not sent|nothing more will be sent/.test(afterRun.panel));
  check("Run is disabled after the stop", afterRun.runDisabled);

  await page.setInputFiles("#main-content [data-bulk-file]", { name: "batch-two.csv", mimeType: "text/csv", buffer: Buffer.from(csv(3)) });
  await page.waitForTimeout(500);
  const afterUpload = await page.evaluate(() => ({
    panel: document.querySelector("#main-content [data-bulk-evaluation]")?.innerText.replace(/\s+/g, " ") || "",
    runDisabled: document.querySelector("#main-content [data-bulk-run]")?.disabled === true,
    ack: document.querySelector("#main-content [data-bulk-ack]")?.checked === true
  }));
  check("after uploading another CSV, Run stays disabled", afterUpload.runDisabled, JSON.stringify({ ack: afterUpload.ack }));
  check("after uploading another CSV, the page still explains the provider budget stop",
    /Bulk evaluation is unavailable: this account's data-provider budget has been reached/.test(afterUpload.panel));
  await page.locator("#main-content [data-bulk-run]").click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  check("no further evaluation request is sent after the stop", evaluationCalls.length === 1, JSON.stringify(evaluationCalls));
  check("no page reload during the bulk stop", loads === loadsAtStart);
} catch (error) {
  check("bulk provider budget audit completed", false, String(error.message).split("\n")[0]);
} finally {
  await browser.close();
}
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) {
  console.log(`FAIL ${line}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Bulk provider budget (${new URL(baseUrl).pathname})::${line.replace(/\r?\n/g, " ").slice(0, 900)}`);
}
console.log(`Bulk provider budget audit: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
