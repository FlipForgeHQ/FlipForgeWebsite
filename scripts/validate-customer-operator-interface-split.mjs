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
check("002 Home route remains mounted", index.includes('data-route="dashboard"'));
check("003 Evaluate route remains mounted", index.includes('data-route="discover"'));
check("004 Decision Intelligence route remains mounted for decision-result handoff", index.includes('data-route="decision-intelligence"'));
check("005 Saved Decisions route remains mounted", index.includes('data-route="opportunities"'));
check("006 Tracking route remains mounted", index.includes('data-route="tracking"'));
check(
  "007 beta runtime limits primary customer navigation to four destinations",
  shellJs.includes('const CORE_ROUTES = new Set(["dashboard", "discover", "opportunities", "tracking"])')
);
check(
  "008 deeper product routes remain mounted but hidden from beta navigation",
  ["decision-intelligence", "market-view", "forge-heat", "evaluate", "portfolio", "alerts", "beta-start",
   "compare", "psa-advisor", "evidence", "sell", "export"].every(route => shellJs.includes(`"${route}"`))
);
check("009 customer intelligence tool group remains mounted for non-beta/internal reuse", index.includes('<details class="ff-advanced-nav">'));
check(
  "010 advanced tool group is hidden from the private beta",
  shellCss.includes('body[data-ff-surface="customer"] .ff-advanced-nav') &&
  shellCss.includes('display: none !important') &&
  shellJs.includes('hideElement(advanced)')
);
check(
  "011 Decision Intelligence stays out of beta primary nav and is exposed only by full customer mode",
  shellJs.includes('const FULL_CUSTOMER_PATH = /^\\/app\\/customer(?:\\/|$)/i;') &&
  shellJs.includes('if (fullCustomerMode()) {\n      fullCustomerNavigation(nav);') &&
  shellJs.includes('["decision-intelligence", "Decision Intelligence"]') &&
  shellJs.includes('if (route !== "account") hideElement(link)')
);
check("012 customer app does not link to operator workspace", !index.includes("operator-beta.html"));
check("013 customer shell stylesheet is loaded", index.includes('href="customer-only-shell-v1.css"'));
check("014 customer shell runtime is loaded after route presentation scripts", /mobile-ui-runtime-fix-v1\.js[\s\S]*customer-only-shell-v1\.js[\s\S]*<\/body>/.test(index));
check(
  "015 customer runtime hides all non-core beta navigation without disabling underlying routes",
  shellJs.includes("BETA_HIDDEN_NAV_ROUTES") &&
  shellJs.includes('if (route !== "account") hideElement(link)')
);
check(
  "016 customer home teaches a three-step beta loop",
  shellJs.includes("What card are you considering?") &&
  shellJs.includes("One card. One decision. Clear reasons.") &&
  shellJs.includes("BUY, WATCH, VERIFY, or PASS")
);
check(
  "017 beta customer home keeps two secondary destinations after the primary Evaluate CTA",
  shellJs.includes('["Saved Decisions", "Reopen cards you already evaluated."') &&
  shellJs.includes('["Tracking", "See what changed after the original decision."')
);
check("018 customer shell hides plan card in beta", shellCss.includes(".plan-card"));
check(
  "019 mobile stabilizer preserves the four-route beta contract",
  mobileNav.includes('const PRIMARY_ROUTES = ["dashboard", "discover", "opportunities", "tracking"]') &&
  mobileNav.includes('.primary-nav > .ff-advanced-nav') &&
  mobileNav.includes('display:none !important')
);
check("020 operator workspace remains a separate page", operator.includes("Private operations") || operator.includes("Sign in as Operator"));
check("021 operator role remains server-defined", betaCore.includes('OPERATOR_ROLE = "flipforge-operator"'));
check("022 active customer role remains server-defined", betaCore.includes('ACTIVE_ROLE = "flipforge-active"'));
check(
  "023 beta and full customer routing remain isolated under /app",
  redirects.includes("/app /saas-prototype/index.html 200") &&
  redirects.includes("/app/customer/ /saas-prototype/index.html 200") &&
  redirects.includes("/app/customer/* /saas-prototype/:splat 200") &&
  redirects.includes("/app/* /saas-prototype/:splat 200")
);

for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}`);
}

const failed = checks.filter(item => !item.passed);
if (failed.length) {
  console.error(`\n${failed.length} customer/operator split validation check(s) failed.`);
  process.exit(1);
}

console.log(`\nCustomer/operator interface split validation passed (${checks.length}/${checks.length}).`);