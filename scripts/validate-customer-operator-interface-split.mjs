import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const index = read("saas-prototype/index.html");
const shellJs = read("saas-prototype/customer-only-shell-v1.js");
const shellCss = read("saas-prototype/customer-only-shell-v1.css");
const operator = read("operator-beta.html");
const betaCore = read("netlify/modern-functions/lib/beta-operations-core.mjs");
const redirects = read("_redirects");

const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });

check("001 customer app is explicitly marked as customer surface", index.includes('data-ff-surface="customer"'));
check("002 customer app exposes Home", index.includes('data-route="dashboard" data-ff-customer-core') && index.includes(">Home</a>"));
check("003 customer app exposes Evaluate", index.includes('data-route="discover" data-ff-customer-core') && index.includes(">Evaluate</a>"));
check("004 customer app exposes Saved Decisions", index.includes('data-route="opportunities" data-ff-customer-core') && index.includes("Saved Decisions"));
check("005 customer app exposes Tracking", index.includes('data-route="tracking" data-ff-customer-core') && index.includes(">Tracking</a>"));
check("006 exactly four visible customer-core destinations are declared", (index.match(/data-ff-customer-core/g) || []).length === 4);
check("007 advanced route registry is hidden from customer navigation", index.includes('class="ff-customer-route-registry" hidden aria-hidden="true"'));
check("008 advanced analysis container is hidden", index.includes('class="ff-advanced-nav" hidden aria-hidden="true"'));
check("009 customer app does not link to operator workspace", !index.includes("operator-beta.html"));
check("010 customer shell stylesheet is loaded", index.includes('href="customer-only-shell-v1.css"'));
check("011 customer shell runtime is loaded last", /mobile-ui-runtime-fix-v1\.js[\s\S]*customer-only-shell-v1\.js[\s\S]*<\/body>/.test(index));
check("012 customer runtime keeps internal nav destinations hidden", shellJs.includes("HIDDEN_NAV_ROUTES") && shellJs.includes("simplifyNavigation"));
check("013 customer home is reduced to evaluate saved decisions and tracking", shellJs.includes("Evaluate a card") && shellJs.includes("Review saved decisions") && shellJs.includes("Check tracking"));
check("014 customer shell hides plan card and advanced navigation", shellCss.includes(".ff-advanced-nav") && shellCss.includes(".plan-card"));
check("015 operator workspace remains a separate page", operator.includes("Private operations") || operator.includes("Sign in as Operator"));
check("016 operator role remains server-defined", betaCore.includes('OPERATOR_ROLE = "flipforge-operator"'));
check("017 active customer role remains server-defined", betaCore.includes('ACTIVE_ROLE = "flipforge-active"'));
check("018 app routing remains isolated under /app", redirects.includes("/app /saas-prototype/index.html 200") && redirects.includes("/app/* /saas-prototype/:splat 200"));

for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}`);
}

const failed = checks.filter(item => !item.passed);
if (failed.length) {
  console.error(`\n${failed.length} customer/operator split validation check(s) failed.`);
  process.exit(1);
}

console.log(`\nCustomer/operator interface split validation passed (${checks.length}/${checks.length}).`);
