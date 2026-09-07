import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const index = read("saas-prototype/index.html");
const shellJs = read("saas-prototype/customer-only-shell-v1.js");
const shellCss = read("saas-prototype/customer-only-shell-v1.css");
const mobileNav = read("saas-prototype/mobile-navigation-stabilizer-v1.js");
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
check("006 exactly four primary customer destinations are declared", (index.match(/data-ff-customer-core/g) || []).length === 4);
check(
  "007 legacy/supporting direct navigation contracts remain mounted for runtime grouping",
  ["market-view", "forge-heat", "evaluate", "portfolio", "alerts", "beta-start"].every(route =>
    index.includes(`data-route="${route}"`)
  )
);
check("008 customer intelligence tool group remains mounted", index.includes('<details class="ff-advanced-nav">'));
check(
  "009 customer intelligence tool group is visible and labeled More tools",
  shellCss.includes('body[data-ff-surface="customer"] .ff-advanced-nav {') &&
  shellCss.includes('display: block !important') &&
  shellJs.includes('replaceTextNode(summary, "More tools")') &&
  shellJs.includes('advanced.hidden = false')
);
check("010 customer app does not link to operator workspace", !index.includes("operator-beta.html"));
check("011 customer shell stylesheet is loaded", index.includes('href="customer-only-shell-v1.css"'));
check("012 customer shell runtime is loaded last", /mobile-ui-runtime-fix-v1\.js[\s\S]*customer-only-shell-v1\.js[\s\S]*<\/body>/.test(index));
check(
  "013 customer runtime hides only duplicate/internal navigation while preserving customer tools",
  shellJs.includes("CUSTOMER_TOOL_ROUTES") &&
  shellJs.includes("INTERNAL_NAV_ROUTES") &&
  shellJs.includes('"evaluate", "staging", "staging-evaluate"') &&
  !shellJs.includes("HIDDEN_NAV_ROUTES")
);
check("014 customer home remains reduced to evaluate saved decisions and tracking", shellJs.includes("Evaluate a card") && shellJs.includes("Review saved decisions") && shellJs.includes("Check tracking"));
check("015 customer shell hides plan card", shellCss.includes(".plan-card"));
check(
  "016 mobile stabilizer restores only primary customer routes plus Account/More tools",
  mobileNav.includes('const PRIMARY_ROUTES = ["dashboard", "discover", "opportunities", "tracking"]') &&
  mobileNav.includes('.primary-nav > .ff-advanced-nav') &&
  !mobileNav.includes('CORE_ROUTES.forEach')
);
check("017 operator workspace remains a separate page", operator.includes("Private operations") || operator.includes("Sign in as Operator"));
check("018 operator role remains server-defined", betaCore.includes('OPERATOR_ROLE = "flipforge-operator"'));
check("019 active customer role remains server-defined", betaCore.includes('ACTIVE_ROLE = "flipforge-active"'));
check("020 app routing remains isolated under /app", redirects.includes("/app /saas-prototype/index.html 200") && redirects.includes("/app/* /saas-prototype/:splat 200"));

for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}`);
}

const failed = checks.filter(item => !item.passed);
if (failed.length) {
  console.error(`\n${failed.length} customer/operator split validation check(s) failed.`);
  process.exit(1);
}

console.log(`\nCustomer/operator interface split validation passed (${checks.length}/${checks.length}).`);
