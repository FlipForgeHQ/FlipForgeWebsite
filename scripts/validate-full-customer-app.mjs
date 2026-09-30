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
const navigationParity = read("saas-prototype/customer-navigation-parity-v1.js");
const css = read("saas-prototype/customer-only-shell-v1.css");
const visualSystem = read("saas-prototype/customer-app-system-v2.css");
const betaSession = read("saas-prototype/beta-session-v1.js");
const mobileNav = read("saas-prototype/mobile-navigation-stabilizer-v1.js");
const commercialPolish = read("saas-prototype/commercial-app-polish-v2.js");
const cockpitFinalUx = read("saas-prototype/cockpit-final-ux.js");
const productionDashboardGuard = read("saas-prototype/production-dashboard-guard.js");
const loginRedirect = read("saas-prototype/production-identity-login-redirect.js");
const authProbe = read("scripts/lib/flipforge-production-auth-probe.mjs");
const privateBetaGate = read("saas-prototype/private-beta-access-gate.js");
const authRecoveryAudit = read("scripts/audit-customer-auth-recovery-ci.mjs");
const fullCustomerWorkflow = read(".github/workflows/full-customer-app-assurance.yml");

check(activeRedirects.includes("/app/beta /saas-prototype/index.html 200"), "production exposes the dedicated Private Beta route");
check(activeRedirects.includes("/app/beta/ /saas-prototype/index.html 200"), "production exposes the Private Beta slash route");
check(activeRedirects.includes("/app/beta/* /saas-prototype/:splat 200"), "Private Beta assets remain isolated under /app/beta");
check(!activeRedirects.some(rule => rule.startsWith("/app/customer")), "customer app is not publicly routed before launch");
check(activeRedirects.includes("/app /production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start 302"), "generic app entry fails closed to Private Beta Sign In");
check(activeRedirects.indexOf("/app/beta/* /saas-prototype/:splat 200") < activeRedirects.indexOf("/app/* /production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start 302"), "beta wildcard precedes generic app fail-closed redirect");

check(customer.includes('window.FlipForgeFullCustomerEntry=true'), "customer document hard-marks full customer entry before app scripts");
check(customer.includes('>CUSTOMER APP</span>'), "prelaunch customer document remains statically labeled CUSTOMER APP");
check(customer.includes('window.location.replace("/")'), "raw production customer document redirects away before render");
check(!customer.includes('<div class="prototype-banner"'), "customer document contains no beta banner");
check(customer.includes('src="private-beta.js"'), "customer document loads private-beta onboarding runtime in the canonical shell");
check(!customer.includes('src="beta-session-v1.js"'), "customer document never loads beta-session runtime");
check(!customer.includes('src="beta-customer-flow-v2.js"'), "customer document never loads beta customer-flow runtime");
check(!customer.includes('src="beta-qa-customer-polish-v1.js"'), "customer document never loads beta QA presentation runtime");
check(customer.includes('href="private-beta.css"'), "customer document loads private-beta onboarding stylesheet in the canonical shell");
check(!customer.includes('href="beta-session-v1.css"'), "customer document never loads beta-session stylesheet");
check(!customer.includes('href="beta-customer-flow-v2.css"'), "customer document never loads beta-flow stylesheet");

check(customer.includes('data-route="decision-intelligence"') && customer.includes('Decision Intelligence'), "customer navigation exposes Decision Intelligence");
check(customer.includes('href="#/decision-intelligence/why" data-route="why-this-decision"') && customer.includes('Why This Decision'), "customer navigation exposes Why This Decision as a Decision Intelligence subview");
check(customer.includes('href="#/evidence" data-route="evidence"') && customer.includes('Evidence Review'), "customer navigation promotes Evidence Review");
check(customer.includes('data-route="tracking"') && customer.includes('Outcome Intelligence'), "customer navigation exposes Outcome Intelligence");
check(customer.includes('data-route="discover"') && customer.includes('data-route="evaluate"'), "customer navigation separates Discover and Evaluate");
check(customer.includes('data-route="forge-heat"') && customer.includes('data-route="market-view"'), "customer navigation exposes Forge Heat and Market View");
check(customer.includes('src="customer-navigation-parity-v1.js"'), "customer document loads full-customer navigation parity controller");
check(customer.includes('id="global-search-form"'), "customer document includes global search");
check(customer.includes('class="icon-button notification-button"'), "customer document includes alerts access");
check(customer.indexOf('src="production-dashboard-guard.js"') < customer.indexOf('src="app.js"'), "authoritative auth observer loads before customer app runtime");

check(shell.includes('const FULL_CUSTOMER_PATH = /^\\/app\\/customer(?:\\/|$)/i;'), "customer shell still recognizes full customer route");
check(shell.includes('"why-this-decision", "evidence"'), "canonical customer shell includes Why This Decision and Evidence Review in the full route set");
const orderedRouteTokens = [
  '"dashboard"', '"discover"', '"evaluate"', '"decision-intelligence"', '"why-this-decision"', '"evidence"',
  '"opportunities"', '"tracking"', '"portfolio"', '"alerts"', '"forge-heat"', '"market-view"'
];
const orderedRouteAnchor = shell.indexOf("const orderedRoutes = [");
const orderedRouteEnd = shell.indexOf("];", orderedRouteAnchor);
const orderedRouteBlock = orderedRouteAnchor >= 0 && orderedRouteEnd > orderedRouteAnchor
  ? shell.slice(orderedRouteAnchor, orderedRouteEnd)
  : "";
let previousRoutePosition = -1;
const lifecycleOrderValid = orderedRouteTokens.every(token => {
  const position = orderedRouteBlock.indexOf(token, previousRoutePosition + 1);
  if (position < 0) return false;
  previousRoutePosition = position;
  return true;
});
check(lifecycleOrderValid, "canonical customer shell preserves CDI lifecycle ordering");
check(shell.includes('setText(document.querySelector(".prototype-chip"), "CUSTOMER APP")'), "DEV customer shell reinforces customer identity");
check(shell.includes("T7, T14, and T30"), "customer home explains governed outcome checkpoints");
check(betaSession.includes("&& !FULL_CUSTOMER_PATH.test(path);"), "beta session renderer still stands down on full customer route");
check(navigationParity.includes('if (!FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""))) return;'), "navigation parity controller cannot run outside /app/customer");
check(navigationParity.includes('const ADVANCED_ROUTES = new Set(["compare", "psa-advisor", "export"])'), "advanced customer navigation contains only supported routes");
check(navigationParity.includes('const UNSUPPORTED_CUSTOMER_ROUTES = new Set(["sell"])') && navigationParity.includes("guardUnsupportedCustomerRoute"), "unsupported Exit Review fails closed");
check(mobileNav.includes('"decision-intelligence", "why-this-decision", "evidence"') && mobileNav.includes('"portfolio", "alerts", "forge-heat", "market-view"'), "mobile full customer navigation retains the complete CDI route set");
check(!customer.includes('data-route="sell"'), "customer document removes unsupported Exit Review");
check(mobileNav.includes('parts[0] === "decision-intelligence" && parts[1] === "why"') && mobileNav.includes('return "why-this-decision"'), "mobile active navigation distinguishes Why This Decision from Decision Intelligence");
check(commercialPolish.includes('chip.textContent = customer ? "CUSTOMER APP" : production() ? "PRIVATE BETA" : "BETA PREVIEW"'), "commercial polish preserves DEV customer identity");
check(cockpitFinalUx.includes('prototypeChip.textContent = customer ? "CUSTOMER APP" : "SAAS PREVIEW"'), "legacy cockpit preserves DEV customer identity");

check(loginRedirect.includes('a[href^="/production-auth.html"]'), "customer login interceptor covers feature-level auth links");
check(loginRedirect.includes('pathname === "/app/customer" ? "/app/customer/"'), "customer login interceptor still normalizes the customer pathname");
check(loginRedirect.includes('const returnPath = `${normalizedPath}${window.location.search}${window.location.hash || "#/account"}`'), "customer login interceptor still rebuilds local auth return");
check(loginRedirect.includes('if (!launcher && !authLink) return;'), "customer login interceptor handles launchers and feature auth links");
check(authProbe.includes('const PRIVATE_BETA_START = "/app/beta/#/beta-start";'), "production auth locks destination to dedicated beta-start");
check(authProbe.includes("return PRIVATE_BETA_START;"), "production sign-in cannot return to arbitrary customer route");
check(authProbe.includes("async function verifyAccess()") && authProbe.includes('fetch("/api/v1/entitlements"'), "production auth verifies authoritative beta access before continuing");
check(authProbe.includes('reauthRequested'), "production auth page recognizes server-requested reauthentication");
check(authProbe.includes('The app rejected this cached session'), "production auth explains stale-session recovery");

check(productionDashboardGuard.includes('installEarlyAuthoritativeAuthObserver()'), "early production guard installs auth observer before app clients capture fetch");
check(productionDashboardGuard.includes('window.__FlipForgeAuthoritativeAuthDenied = denied'), "early production guard persists authoritative auth state");
check(productionDashboardGuard.includes('new CustomEvent("flipforge:authoritative-auth"'), "early production guard broadcasts authoritative auth changes");
check(productionDashboardGuard.includes('response.status === 401'), "early production guard recognizes authoritative 401");
check(loginRedirect.includes('let authoritativeAuthenticationDenied = window.__FlipForgeAuthoritativeAuthDenied === true'), "customer sign-in shell consumes auth state captured before it loads");
check(loginRedirect.includes('window.addEventListener("flipforge:authoritative-auth", handleAuthoritativeAuthEvent)'), "customer sign-in shell subscribes to early authoritative auth events");
check(loginRedirect.includes('const AUTH_PROBE_PATH = "/api/v1/entitlements"') && loginRedirect.includes('async function probeAuthoritativeSession()'), "cached identity is actively validated against authoritative entitlement endpoint");
check(loginRedirect.includes('const SIGN_IN_ID = "ff-customer-sign-in-entry"'), "customer shell owns a persistent sign-in recovery control");
check(loginRedirect.includes('link.dataset.ffCustomerSignIn = ""'), "persistent sign-in control has an auditable selector");
check(loginRedirect.includes('"Sign in to FlipForge"') && loginRedirect.includes('"Restore FlipForge sign in"'), "DEV customer recovery control remains available for local testing");
check(loginRedirect.includes('link.href = productionAuthUrl()'), "persistent sign-in control preserves the governed production auth handoff");
check(loginRedirect.includes('setAuthoritativeAuthDenied(true)'), "server 401 records authoritative authentication denial");
check(loginRedirect.includes('response.status === 401'), "customer shell retains redundant late 401 observation");
check(loginRedirect.includes('const requiresSignIn = authoritativeAuthenticationDenied || !currentUser()'), "server 401 overrides cached browser identity");
check(loginRedirect.includes('link.hidden = !requiresSignIn'), "persistent sign-in visibility follows authoritative recovery state");
check(loginRedirect.includes('installAuthoritativeAuthObserver()'), "customer shell retains fallback production API auth observation");
check(loginRedirect.includes('window.addEventListener("hashchange", ensureSignInControl)'), "persistent sign-in return updates as the customer changes routes");
check(loginRedirect.includes('window.addEventListener("flipforge:identity-change", handleIdentityChange)') && loginRedirect.includes('if (currentUser()) probeAuthoritativeSession()'), "persistent sign-in reacts to identity changes by validating server authority");
check(loginRedirect.includes('@media(max-width:760px)'), "persistent sign-in has a mobile visibility contract");
check(privateBetaGate.includes("membershipActive"), "private beta gate requires active invited membership");
check(privateBetaGate.includes('fetch("/api/v1/entitlements"'), "private beta gate verifies server entitlement");
check(privateBetaGate.includes("window.location.replace(betaAuthUrl"), "failed beta entry is redirected to Private Beta Sign In");
check(privateBetaGate.includes("window.__FlipForgePrivateBetaAccessVerified = true"), "successful beta gate publishes verified state");

check(authRecoveryAudit.includes('const customerRoutes = ['), "auth recovery audit declares the complete customer route matrix");
for (const route of ["dashboard", "discover", "evaluate", "decision-intelligence", "decision-intelligence/why", "opportunities", "tracking", "portfolio", "alerts", "forge-heat", "market-view", "account", "compare", "psa-advisor", "evidence", "export"]) {
  check(authRecoveryAudit.includes(`"${route}"`), `auth recovery audit covers ${route}`);
}
check(authRecoveryAudit.includes('{ name: "desktop", width: 1440, height: 900 }'), "auth recovery audit covers desktop");
check(authRecoveryAudit.includes('{ name: "mobile", width: 390, height: 844 }'), "auth recovery audit covers mobile");
check(authRecoveryAudit.includes('status: 401'), "auth recovery audit exercises anonymous 401 state");
check(authRecoveryAudit.includes('protected route rendered a blank customer workspace'), "auth recovery audit fails blank protected routes");
check(authRecoveryAudit.includes('healthy authenticated customer still sees the anonymous sign-in control'), "auth recovery audit checks healthy authenticated cleanup");
check(authRecoveryAudit.includes('auditStaleCachedSessionState'), "auth recovery audit exercises stale cached identity");
check(authRecoveryAudit.includes('server 401 was hidden by stale cached browser identity'), "auth recovery audit fails the exact production dead-end regression");
check(authRecoveryAudit.includes('destination.searchParams.get("reauth") !== "1"'), "auth recovery audit proves stale-session reauthentication intent");
check(fullCustomerWorkflow.includes('node scripts/audit-customer-auth-recovery-ci.mjs'), "full customer CI runs auth recovery audit");
check(fullCustomerWorkflow.includes('node scripts/validate-customer-navigation-parity.mjs'), "full customer CI runs static navigation parity audit");
check(fullCustomerWorkflow.includes('node scripts/audit-customer-navigation-parity-ci.mjs'), "full customer CI runs rendered customer/beta separation audit");
check(fullCustomerWorkflow.includes('push:') && fullCustomerWorkflow.includes('- main'), "full customer assurance re-runs after merge on main");

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