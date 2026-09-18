import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const index = read("saas-prototype/index.html");
const customer = read("saas-prototype/customer.html");
const shellJs = read("saas-prototype/customer-only-shell-v1.js");
const shellCss = read("saas-prototype/customer-only-shell-v1.css");
const mobileNav = read("saas-prototype/mobile-navigation-stabilizer-v1.js");
const operator = read("operator-beta.html");
const betaCore = read("netlify/modern-functions/lib/beta-operations-core.mjs");
const redirects = read("_redirects");
const privateBeta = read("saas-prototype/private-beta.js");

const redirectLines = redirects
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith("#"));
const hasRedirect = rule => redirectLines.includes(rule);

const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });

check("001 legacy prototype remains a non-authoritative customer-compatible surface", index.includes('data-ff-surface="customer"'));
check("002 dedicated customer entry is explicitly marked as full customer", customer.includes('class="ff-full-customer-app"'));
check("003 definitive customer entry is not branded as a separate beta app", customer.includes('>DECISION WORKSPACE</span>') && !customer.includes('>CUSTOMER BETA</span>'));
check("004 definitive customer entry hosts the Private Beta Guide runtime", customer.includes('href="private-beta.css"') && customer.includes('src="private-beta.js"'));
check("005 dedicated customer entry excludes legacy beta session runtime", !customer.includes('src="beta-session-v1.js"'));
check("006 dedicated customer entry excludes legacy separate beta flow runtime", !customer.includes('src="beta-customer-flow-v2.js"'));
check("007 Private Beta Guide is an onboarding route inside the customer shell", privateBeta.includes('const ROUTE = "beta-start"') && shellJs.includes('"beta-start"'));
check("008 customer entry exposes Decision Intelligence", customer.includes('data-route="decision-intelligence"'));
check("009 customer entry exposes Outcome Intelligence", customer.includes('data-route="tracking"') && customer.includes('Outcome Intelligence'));
check("010 customer entry exposes Discover and Evaluate separately", customer.includes('data-route="discover"') && customer.includes('data-route="evaluate"'));
check("011 advanced customer analysis remains mounted", customer.includes('<details class="ff-advanced-nav">'));
check("012 Decision Workspace does not link to operator workspace", !customer.includes("operator-beta.html"));
check("013 customer shell stylesheet is loaded", customer.includes('href="customer-only-shell-v1.css"'));
check("014 customer shell runtime remains loaded", customer.includes('src="customer-only-shell-v1.js"'));
check("015 legacy navigation helpers cannot turn beta into a second authoritative app", shellJs.includes('const CORE_ROUTES = new Set(["dashboard", "discover", "opportunities", "tracking"])') && mobileNav.includes('const PRIMARY_ROUTES = ["dashboard", "discover", "opportunities", "tracking"]'));
check("016 full customer CSS preserves advanced navigation", shellCss.includes("body.ff-full-customer-app .primary-nav > .ff-advanced-nav"));
check("017 operator workspace remains a separate page", operator.includes("Private operations") || operator.includes("Sign in as Operator"));
check("018 operator role remains server-defined", betaCore.includes('OPERATOR_ROLE = "flipforge-operator"'));
check("019 active customer role remains server-defined", betaCore.includes('ACTIVE_ROLE = "flipforge-active"'));
check("020 public app alias canonicalizes to definitive Decision Workspace", hasRedirect("/app /app/customer/ 301"));
check("021 full customer route serves dedicated customer document", hasRedirect("/app/customer /saas-prototype/customer.html 200") && hasRedirect("/app/customer/ /saas-prototype/customer.html 200"));
check("022 customer assets remain isolated under /app/customer", hasRedirect("/app/customer/* /saas-prototype/:splat 200"));
check("023 generic app routes canonicalize into the Decision Workspace", hasRedirect("/app/* /app/customer/:splat 301"));
check("024 legacy /app beta-index route is inactive", !hasRedirect("/app /saas-prototype/index.html 200") && !hasRedirect("/app/ /saas-prototype/index.html 200"));
check("025 legacy /app beta wildcard is inactive", !hasRedirect("/app/* /saas-prototype/:splat 200"));

for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}`);
const failed = checks.filter(item => !item.passed);
if (failed.length) {
  console.error(`\n${failed.length} customer/operator split validation check(s) failed.`);
  process.exit(1);
}
console.log(`\nCustomer/operator interface split validation passed (${checks.length}/${checks.length}).`);
