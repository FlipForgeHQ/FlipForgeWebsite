import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const js = read("saas-prototype/customer-discover-scanner-v1.js");
const css = read("saas-prototype/customer-discover-scanner-v1.css");
const customer = read("saas-prototype/customer.html");
const legacy = read("saas-prototype/index.html");
const pkg = JSON.parse(read("package.json"));

const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });

check("001 scanner JavaScript exists", js.includes("ffDiscoverScannerV1"));
check("002 scanner CSS exists", css.includes(".ff-discover-scanner-toolbar"));
check("003 scanner runs only on Discover", js.includes("function onDiscover()") && js.includes("#\\/discover"));
check("004 exact provider result cards remain source data", js.includes("customer-discovery-candidate:not(.customer-discovery-candidate-review)"));
check("005 existing governed evaluation control is reused", js.includes('querySelector("[data-discovery-evaluate]")'));
check("006 scanner never performs network requests", !/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/.test(js));
check("007 scanner never persists browser state", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(js));
check("008 scanner does not create decision authority", !/recommendation\s*=|decision\s*=|supportedValue\s*=|calibratedConfidence\s*=/.test(js));
check("009 default sort preserves server rank", js.includes('sort: "rank"') && js.includes("return a.rank - b.rank"));
check("010 view filters include ask evidence confidence source state and format", ["maxAsk","evidence","confidence","source","availability","format"].every(token => js.includes(token)));
check("011 selection is explicit", js.includes("dataset.ffDiscoverSelect") && js.includes("aria-pressed"));
check("012 scanner does not auto-select first listing", !/records\s*\[\s*0\s*\].*selectRecord|selectRecord\([^,]+,\s*records\s*\[\s*0\s*\]/s.test(js));
check("013 view-only boundary is explicit", js.includes("Filters and sorting only reorganize listings already returned by FlipForge."));
check("014 server-owned values are not relabeled as browser decisions", js.includes("Server rank") && js.includes("Server-owned"));
check("015 responsive table layout exists", css.includes("@media (max-width: 980px)") && css.includes("@media (max-width: 620px)"));
check("016 reduced motion is respected", css.includes("prefers-reduced-motion"));
check("017 customer shell loads scanner stylesheet", customer.includes('href="customer-discover-scanner-v1.css"'));
check("018 customer shell loads scanner runtime", customer.includes('src="customer-discover-scanner-v1.js"'));
check("019 limited beta preview does not inherit full customer scanner", !legacy.includes('customer-discover-scanner-v1.css') && !legacy.includes('customer-discover-scanner-v1.js'));
check("020 scanner loads after core Discover runtime", customer.indexOf('src="customer-discovery.js"') < customer.indexOf('src="customer-discover-scanner-v1.js"'));
check("021 scanner validator is part of customer Discover validation", String(pkg.scripts["validate:customer-discovery"] || "").includes("validate-discover-scanner-v1.mjs"));

try {
  new Function(js);
  check("022 scanner JavaScript parses", true);
} catch {
  check("022 scanner JavaScript parses", false);
}

const failures = checks.filter(row => !row.passed);
console.log("Discover scanner v1 validation");
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
