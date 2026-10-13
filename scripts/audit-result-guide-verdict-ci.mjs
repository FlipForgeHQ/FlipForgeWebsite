// The "How to read this result" guide must explain the saved, server-returned verdict only.
// Regression for 2026-10-13: on goflipforge.com a saved WATCH showed "The evaluated price cleared the current
// decision checks ... BUY" because the guide scraped the first [data-decision] element (a legend chip) and was
// never updated afterwards. Browser-only fixture; no network, no provider calls.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = fs.readFileSync(path.join(root, "saas-prototype/phase3-first-decision-activation-v1.js"), "utf8");
const page = `<!doctype html><html><body><main id="main-content">
<div class="legend"><span data-decision="BUY">BUY</span> <span>What do BUY / WATCH / VERIFY / PASS mean?</span></div>
<section class="customer-intelligence-hero"><span class="staging-status" id="status"></span><h1>2018 Topps Chrome Shohei Ohtani #150 PSA 9</h1></section>
</main><script src="/app/phase3.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/app/phase3.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(runtime); }
  if (req.url.startsWith("/app/")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(page); }
  if (req.url.startsWith("/api/")) { res.writeHead(204); return res.end(); }
  res.writeHead(404); res.end();
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const failures = [];
const passes = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
const tab = await browser.newPage();
const guide = () => tab.evaluate(() => [...document.querySelectorAll("[data-ff-p3-result-guide]")]
  .map(node => `${node.dataset.decision}|${node.querySelector("h2")?.textContent || ""}`));
await tab.goto(`${base}/app/#/opportunities/EBAY-QA-1`);
await tab.waitForTimeout(600);
const unknown = await guide();
check("G01 no guide while the saved verdict is not yet shown (a BUY legend chip is not a verdict)", unknown.length === 0, unknown.join(";"));
await tab.evaluate(() => { document.getElementById("status").textContent = "WATCH"; });
await tab.waitForTimeout(600);
const watch = await guide();
check("G02 saved WATCH is explained as WATCH, never as BUY",
  watch.length === 1 && watch[0].startsWith("WATCH|") && !/cleared the current decision checks/.test(watch[0]), watch.join(";"));
await tab.evaluate(() => { document.getElementById("status").textContent = "PASS"; });
await tab.waitForTimeout(600);
const pass = await guide();
check("G03 guide follows a changed saved verdict and never duplicates", pass.length === 1 && pass[0].startsWith("PASS|"), pass.join(";"));
await browser.close();
server.close();

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`Result guide verdict audit: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
