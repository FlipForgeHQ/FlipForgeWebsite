import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const js = read("saas-prototype/customer-product-architecture-v1.js");
const css = read("saas-prototype/customer-product-architecture-v1.css");
const customer = read("saas-prototype/customer.html");
const beta = read("saas-prototype/index.html");

const checks = [];
const check = (name, value) => checks.push({ name, passed: Boolean(value) });

check("001 architecture is full-customer only", js.includes("const FULL_CUSTOMER_PATH") && js.includes("FULL_CUSTOMER_PATH.test(String(window.location.pathname") && js.includes('params.get("ffArchitecture") !== "1"'));
check("002 architecture requires explicit preview feature flag", js.includes('params.get("ffArchitecture") !== "1"'));
check("003 primary portal has five routes", ["dashboard","discover","opportunities","tracking","portfolio"].every(route => js.includes(`["${route}"`)));
check("004 saved opportunities are relabeled Decisions", js.includes('["opportunities", "Decisions"]'));
check("005 tracking is relabeled Monitor", js.includes('["tracking", "Monitor"]'));
check("006 architecture states SCAN DECIDE PROVE MONITOR LEARN", ["SCAN","DECIDE","PROVE","MONITOR","LEARN"].every(value => js.includes(value)));
check("007 decision workspace preserves saved opportunity id", js.includes("function routeId()") && js.includes("encodeURIComponent(id)"));
check("008 workspace uses native opportunity route", js.includes('#/opportunities/'));
check("009 workspace uses native evidence route", js.includes('#/evidence/'));
check("010 workspace uses native PSA route", js.includes('#/psa-advisor/'));
check("011 workspace uses native tracking route", js.includes('#/tracking/'));
check("012 workspace uses native exit route", js.includes('#/sell/'));
check("013 receipt focus opens native receipt object", js.includes("[data-ff-decision-receipt]") && js.includes("receipt.open = true"));
check("014 why view is presentation focus over governed evidence", js.includes("?focus=why") && js.includes("governed evidence record"));
check("015 architecture performs no network activity", !/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/.test(js));
check("016 architecture creates no browser persistence", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(js));
check("017 architecture contains no recommendation calculation", !/recommendation\s*=|supportedValue\s*=|calibratedConfidence\s*=|discoveryScore\s*=/.test(js));
check("018 responsive decision workspace exists", css.includes("@media (max-width: 1080px)") && css.includes("@media (max-width: 720px)"));
check("019 reduced motion is handled", css.includes("prefers-reduced-motion"));
check("020 customer shell loads architecture CSS", customer.includes('customer-product-architecture-v1.css'));
check("021 customer shell loads architecture JS", customer.includes('customer-product-architecture-v1.js'));
check("022 limited beta shell does not load architecture", !beta.includes("customer-product-architecture-v1"));
try { new Function(js); check("023 architecture JS parses", true); } catch { check("023 architecture JS parses", false); }

const failures = checks.filter(row => !row.passed);
console.log("Full customer product architecture v1 validation");
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
