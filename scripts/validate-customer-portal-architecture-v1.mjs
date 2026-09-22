import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const js = read("saas-prototype/customer-portal-architecture-v1.js");
const css = read("saas-prototype/customer-portal-architecture-v1.css");
const customer = read("saas-prototype/customer.html");
const beta = read("saas-prototype/index.html");

const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });

check("001 portal architecture runtime exists", js.includes("FlipForgeCustomerPortalArchitectureV1"));
check("002 runtime is full-customer path gated", js.includes("FULL_CUSTOMER_PATH") && js.includes("/app/customer"));
check("003 primary architecture is five destinations", ["dashboard","discover","opportunities","tracking","portfolio"].every(value => js.includes(value)) && js.includes('"Decisions"') && js.includes('"Monitor"'));
check("004 Discover contextual tools are preserved", ["Manual Evaluate","Forge Heat","Market View"].every(value => js.includes(value)));
check("005 saved decision workspace exists", js.includes("DECISION WORKSPACE"));
check("006 workspace preserves Decision Evidence Grade Monitor Exit Receipt", ["Decision","Evidence","Grade","Monitor","Exit","Receipt"].every(value => js.includes(value)));
check("007 workspace uses exact saved id", js.includes("currentRecordId()") && js.includes("encodeURIComponent(id)"));
check("008 no network authority added", !/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/.test(js));
check("009 no browser persistence added", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(js));
check("010 no recommendation assignment added", !/recommendation\s*=|supportedValue\s*=|evidenceAccepted\s*=/.test(js));
check("011 responsive contextual navigation exists", css.includes("@media (max-width: 860px)") && css.includes("@media (max-width: 520px)"));
check("012 reduced motion supported", css.includes("prefers-reduced-motion"));
check("013 full customer shell loads portal architecture CSS", customer.includes('customer-portal-architecture-v1.css'));
check("014 full customer shell loads portal architecture JS", customer.includes('customer-portal-architecture-v1.js'));
check("015 limited beta preview does not load portal architecture", !beta.includes('customer-portal-architecture-v1.css') && !beta.includes('customer-portal-architecture-v1.js'));
check("016 limited beta preview does not load full scanner", !beta.includes('customer-discover-scanner-v1.css') && !beta.includes('customer-discover-scanner-v1.js'));

try {
  new Function(js);
  check("017 portal architecture JavaScript parses", true);
} catch {
  check("017 portal architecture JavaScript parses", false);
}

const failures = checks.filter(row => !row.passed);
console.log("Customer Portal architecture v1 validation");
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
