import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
let passed = 0;
let failed = 0;
const failures = [];

function check(condition, name) {
  console.log(`${condition ? "PASS" : "FAIL"} | ${name}`);
  if (condition) passed += 1;
  else {
    failed += 1;
    failures.push(name);
  }
}

const redirects = read("_redirects");
const shell = read("saas-prototype/customer-only-shell-v1.js");
const css = read("saas-prototype/customer-only-shell-v1.css");
const betaSession = read("saas-prototype/beta-session-v1.js");
const mobileNav = read("saas-prototype/mobile-navigation-stabilizer-v1.js");
const authProbe = read("scripts/lib/flipforge-production-auth-probe.mjs");

check(redirects.includes("/app/customer /app/customer/ 301"),
  "customer app canonical route redirects to trailing slash");
check(redirects.includes("/app/customer/ /saas-prototype/index.html 200"),
  "customer app serves the existing production SaaS shell");
check(redirects.includes("/app/customer/* /saas-prototype/:splat 200"),
  "customer app assets stay under the production app path");
check(redirects.indexOf("/app/customer/* /saas-prototype/:splat 200") < redirects.indexOf("/app/* /saas-prototype/:splat 200"),
  "customer app wildcard precedes generic app wildcard");
check(redirects.includes("/app /saas-prototype/index.html 200")
  && redirects.includes("/app/* /saas-prototype/:splat 200"),
  "controlled beta app route remains intact");

check(shell.includes('const APP_PATH = /^\\/(?:app|saas-prototype)(?:\\/|$)/i;'),
  "existing production app path contract remains unchanged");
check(shell.includes('const FULL_CUSTOMER_PATH = /^\\/app\\/customer(?:\\/|$)/i;'),
  "full customer mode is isolated inside the production app path");
check(shell.includes('setText(chip, "PRIVATE BETA")'),
  "beta route still renders its private-beta identity");
check(shell.includes('setText(document.querySelector(".prototype-chip"), "CUSTOMER APP")'),
  "full customer route uses customer-app identity");
check(shell.includes('["tracking", "Outcome Intelligence"]'),
  "full customer navigation promotes Outcome Intelligence");
check(shell.includes('["decision-intelligence", "Decision Intelligence"]'),
  "full customer navigation exposes Decision Intelligence");
check(shell.includes('["discover", "Discover"]') && shell.includes('["evaluate", "Evaluate a Card"]'),
  "full customer navigation separates Discover from Evaluate");
check(shell.includes('["forge-heat", "Forge Heat"]') && shell.includes('["market-view", "Market View"]'),
  "full customer navigation exposes discovery intelligence surfaces");
check(shell.includes('showElement(search);'),
  "full customer mode restores global search");
check(shell.includes('showElement(document.querySelector(".notification-button"))'),
  "full customer mode restores alerts access");
check(shell.includes('if (["beta-start", "staging", "staging-evaluate"].includes(route)) hideElement(link);'),
  "full customer mode keeps beta and staging routes out of customer navigation");
check(shell.includes("T7, T14, and T30"),
  "customer home explains governed outcome checkpoints");

check(betaSession.includes('const FULL_CUSTOMER_PATH = /^\\/app\\/customer(?:\\/|$)/i;'),
  "beta session renderer recognizes the full customer route");
check(betaSession.includes("&& !FULL_CUSTOMER_PATH.test(path);"),
  "beta session renderer stands down on the full customer route");

check(mobileNav.includes('const PRIMARY_ROUTES = ["dashboard", "discover", "opportunities", "tracking"]'),
  "mobile beta navigation keeps its four-route contract");
check(mobileNav.includes('const FULL_CUSTOMER_PATH = /^\\/app\\/customer(?:\\/|$)/i;'),
  "mobile navigation recognizes full customer mode");
check(mobileNav.includes('"evaluate", "decision-intelligence"')
  && mobileNav.includes('"portfolio", "alerts", "forge-heat", "market-view"'),
  "mobile full customer navigation retains Decision Intelligence and supporting product routes");
check(mobileNav.includes("const routes = fullCustomerMode() ? FULL_CUSTOMER_ROUTES : PRIMARY_ROUTES;"),
  "mobile navigation separates beta and full customer route sets");
check(mobileNav.includes("html.ff-full-customer-app .primary-nav > .ff-advanced-nav"),
  "mobile full customer mode preserves advanced analysis access");

check(authProbe.includes('resolved.pathname === "/app/customer/"'),
  "production sign-in may return authenticated users to the full customer app");
check(authProbe.includes('resolved.origin !== window.location.origin || !pathAllowed'),
  "customer auth return remains same-origin and allowlisted");

check(css.includes("body.ff-full-customer-app .prototype-banner")
  && css.includes("display: none !important;"),
  "full customer mode removes beta banner chrome");
check(css.includes("body.ff-full-customer-app .primary-nav > .ff-advanced-nav")
  && css.includes("display: block !important;"),
  "full customer mode restores advanced customer analysis navigation");
check(css.includes("body.ff-full-customer-app .sidebar-footer .plan-card"),
  "full customer mode restores account plan surface");
check(css.includes("@media (max-width: 760px)"),
  "full customer mode retains mobile responsive handling");

const forbiddenAuthority = [
  "evaluateAndSave(",
  "saveEvidence(",
  "saveListing(",
  "appendObservation(",
  "transactionAuthority",
  "recommendation =",
  "supportedValue ="
];
for (const token of forbiddenAuthority) {
  check(!shell.includes(token), `customer presentation adds no authority token: ${token}`);
}

console.log(`\nFull Customer App Assurance\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failures.length) {
  console.log("FAILED CHECKS:");
  failures.forEach(item => console.log(` - ${item}`));
}
if (failed > 0) process.exit(1);
