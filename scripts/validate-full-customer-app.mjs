import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
let passed = 0;
let failed = 0;
const failures = [];

function check(condition, name) {
  console.log(`${condition ? "PASS" : "FAIL"} | ${name}`);
  if (condition) passed += 1;
  else { failed += 1; failures.push(name); }
}

const redirects = read("_redirects");
const activeRedirects = redirects
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith("#"));
const customer = read("saas-prototype/customer.html");
const shell = read("saas-prototype/customer-only-shell-v1.js");
const css = read("saas-prototype/customer-only-shell-v1.css");
const visualSystem = read("saas-prototype/customer-app-system-v2.css");
const betaSession = read("saas-prototype/beta-session-v1.js");
const mobileNav = read("saas-prototype/mobile-navigation-stabilizer-v1.js");
const commercialPolish = read("saas-prototype/commercial-app-polish-v2.js");
const cockpitFinalUx = read("saas-prototype/cockpit-final-ux.js");
const loginRedirect = read("saas-prototype/production-identity-login-redirect.js");
const authProbe = read("scripts/lib/flipforge-production-auth-probe.mjs");

check(activeRedirects.includes("/app/customer /saas-prototype/customer.html 200"), "customer no-slash route serves dedicated customer document");
check(activeRedirects.includes("/app/customer/ /saas-prototype/customer.html 200"), "customer trailing-slash route serves dedicated customer document");
check(!activeRedirects.includes("/app/customer /app/customer/ 301"), "customer route avoids redirect loops");
check(activeRedirects.includes("/app/customer/* /saas-prototype/:splat 200"), "customer assets stay under production app path");
check(activeRedirects.indexOf("/app/customer/* /saas-prototype/:splat 200") < activeRedirects.indexOf("/app/* /app/customer/:splat 301"), "customer wildcard precedes generic app canonical redirect");
check(activeRedirects.includes("/app /app/customer/ 301") && !activeRedirects.includes("/app /saas-prototype/index.html 200"), "public app entry resolves to the full customer app instead of the beta shell");

check(customer.includes('window.FlipForgeFullCustomerEntry=true'), "customer document hard-marks full customer entry before app scripts");
check(customer.includes('>CUSTOMER APP</span>'), "customer document is statically labeled CUSTOMER APP");
check(!customer.includes('>CUSTOMER BETA</span>'), "customer document contains no customer-beta chip");
check(!customer.includes('<div class="prototype-banner"'), "customer document contains no beta banner");
check(!customer.includes('src="private-beta.js"'), "customer document never loads private-beta runtime");
check(!customer.includes('src="beta-session-v1.js"'), "customer document never loads beta-session runtime");
check(!customer.includes('src="beta-customer-flow-v2.js"'), "customer document never loads beta customer-flow runtime");
check(!customer.includes('src="beta-qa-customer-polish-v1.js"'), "customer document never loads beta QA presentation runtime");
check(!customer.includes('href="private-beta.css"'), "customer document never loads private-beta stylesheet");
check(!customer.includes('href="beta-session-v1.css"'), "customer document never loads beta-session stylesheet");
check(!customer.includes('href="beta-customer-flow-v2.css"'), "customer document never loads beta-flow stylesheet");

check(customer.includes('data-route="decision-intelligence"') && customer.includes('Decision Intelligence'), "customer navigation exposes Decision Intelligence");
check(customer.includes('data-route="tracking"') && customer.includes('Outcome Intelligence'), "customer navigation exposes Outcome Intelligence");
check(customer.includes('data-route="discover"') && customer.includes('data-route="evaluate"'), "customer navigation separates Discover and Evaluate");
check(customer.includes('data-route="forge-heat"') && customer.includes('data-route="market-view"'), "customer navigation exposes Forge Heat and Market View");
check(customer.includes('id="global-search-form"'), "customer document includes global search");
check(customer.includes('class="icon-button notification-button"'), "customer document includes alerts access");

check(shell.includes('const FULL_CUSTOMER_PATH = /^\\/app\\/customer(?:\\/|$)/i;'), "customer shell still recognizes full customer route");
check(shell.includes('setText(document.querySelector(".prototype-chip"), "CUSTOMER APP")'), "customer shell reinforces customer identity");
check(shell.includes("T7, T14, and T30"), "customer home explains governed outcome checkpoints");
check(betaSession.includes("&& !FULL_CUSTOMER_PATH.test(path);"), "beta session renderer still stands down on full customer route");
check(mobileNav.includes('"evaluate", "decision-intelligence"') && mobileNav.includes('"portfolio", "alerts", "forge-heat", "market-view"'), "mobile full customer navigation retains full route set");
check(commercialPolish.includes('chip.textContent = customer ? "CUSTOMER APP" : production() ? "PRIVATE BETA" : "BETA PREVIEW"'), "commercial polish cannot overwrite customer identity");
check(cockpitFinalUx.includes('prototypeChip.textContent = customer ? "CUSTOMER APP" : "SAAS PREVIEW"'), "legacy cockpit cannot overwrite customer identity");

check(loginRedirect.includes('a[href^="/production-auth.html"]'), "customer login interceptor covers feature-level auth links");
check(loginRedirect.includes('pathname === "/app/customer" ? "/app/customer/"'), "customer login interceptor normalizes customer pathname");
check(loginRedirect.includes('const returnPath = `${normalizedPath}${window.location.search}${window.location.hash || "#/account"}`'), "customer login interceptor rebuilds auth return from current route");
check(loginRedirect.includes('if (!launcher && !authLink) return;'), "customer login interceptor handles launchers and feature auth links");
check(authProbe.includes('resolved.pathname === "/app/customer" ? "/app/customer/"'), "production auth normalizes no-slash customer return");
check(authProbe.includes('normalizedPath === "/app/customer/"'), "production sign-in may return to full customer app");
check(authProbe.includes('resolved.origin !== window.location.origin || !pathAllowed'), "auth return remains same-origin and allowlisted");

check(css.includes("body.ff-full-customer-app .primary-nav > .ff-advanced-nav") && css.includes("display: block !important;"), "full customer CSS preserves advanced navigation");
check(customer.includes('href="customer-app-system-v2.css"'), "full customer app loads final visual system");
check(customer.indexOf('href="customer-app-system-v2.css"') > customer.indexOf('href="customer-only-shell-v1.css"'), "customer app visual system is the final stylesheet owner");
check(visualSystem.includes("--ff-app-sidebar-width: 272px"), "customer app owns one desktop sidebar width");
check(visualSystem.includes("--ff-app-topbar-height: 72px"), "customer app owns one desktop topbar height");
check(visualSystem.includes("--ff-app-content-max: 1440px"), "customer app owns one content width");
check(visualSystem.includes("#main-content .page-heading"), "customer app owns one page-heading geometry");
check(visualSystem.includes("#main-content .page-heading h1") && visualSystem.includes("#main-content .ff-di-hero-copy h1"), "Decision Intelligence and standard routes share the customer title scale");
check(visualSystem.includes("#main-content .panel-header h2") && visualSystem.includes("#main-content h2"), "customer app owns one section-title scale");
check(visualSystem.includes("@media (max-width: 760px)"), "customer app visual system has a mobile contract");
check(visualSystem.includes("grid-template-columns: 44px minmax(0, 1fr)"), "mobile customer topbar uses one menu-search geometry");
check(visualSystem.includes("overflow-x: hidden !important"), "mobile customer app prevents horizontal shell overflow");

const forbiddenAuthority = ["evaluateAndSave(", "saveEvidence(", "saveListing(", "appendObservation(", "transactionAuthority", "recommendation =", "supportedValue ="];
for (const token of forbiddenAuthority) check(!customer.includes(token), `customer entry adds no authority token: ${token}`);

console.log(`\nFull Customer App Assurance\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failures.length) failures.forEach(item => console.log(` - ${item}`));
if (failed > 0) process.exit(1);
