import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const BETA_AUTH = "/production-auth.html?return=%2Fapp%2Fcustomer%2F%23%2Fbeta-start";
const publicPages = [
  "index.html",
  "product.html",
  "decision-intelligence.html",
  "learn.html",
  "pricing.html",
  "about.html",
  "faq.html",
  "data-use.html",
  "privacy.html",
  "terms.html",
  "beta-terms.html",
  "refund.html",
  "thank-you.html",
  "beta-application.html",
  "beta-onboarding.html",
  "sample-decision-dossier.html",
  "platform-status.html",
  "404.html"
];

const redirects = read("_redirects");
const authPage = read("production-auth.html");
const authProbe = read("scripts/lib/flipforge-production-auth-probe.mjs");
const appGate = read("saas-prototype/private-beta-access-gate.js");
const customer = read("saas-prototype/customer.html");
const siteJs = read("assets/js/site.js");
const buildAssets = read("scripts/build-assets.js");
const customerShell = read("saas-prototype/customer-only-shell-v1.js");
const commercialPolish = read("saas-prototype/commercial-app-polish-v2.js");
const cockpitPolish = read("saas-prototype/cockpit-final-ux.js");

check(redirects.includes(`/app ${BETA_AUTH} 302`), "generic /app must route to Private Beta Sign In");
check(redirects.includes(`/app/* ${BETA_AUTH} 302`), "generic /app/* must route to Private Beta Sign In");
check(!redirects.includes("/app /app/customer/ 301"), "generic /app must not expose the customer route");
check(!redirects.includes("/app/* /app/customer/:splat 301"), "generic app wildcard must not expose customer routes");

check(authPage.includes("<title>Private Beta Sign In | FlipForge</title>"), "auth page must be explicitly Private Beta");
check(authPage.includes("Customer access is not publicly available."), "auth page must state customer access is not public");
check(authPage.includes("There is no public customer login or signup."), "auth page must state no public customer login");
check(authPage.includes('href="/app/customer/#/beta-start" hidden>Enter Private Beta</a>'), "auth continue action must enter beta-start");
check(!authPage.includes("Test account access"), "developer account-test control must not be public");
check(!authPage.includes("/app/#/account"), "auth page must not default to customer account");

check(authProbe.includes('const PRIVATE_BETA_START = "/app/customer/#/beta-start";'), "auth probe must lock the post-login destination");
check(authProbe.includes("async function verifyAccess()"), "auth probe must verify server access before continuing");
check(authProbe.includes('fetch("/api/v1/entitlements"'), "auth probe must use authoritative entitlements");
check(authProbe.includes("returnLink.hidden = true"), "continue action must stay hidden until verification");
check(!authProbe.includes('return "/app/#/account"'), "auth probe must not return to customer account");
check(!authProbe.includes('normalizedPath === "/app/customer/"'), "auth probe must not allow arbitrary customer return routes");

check(customer.includes("<title>FlipForge | Private Beta — Card Decision Intelligence</title>"), "app shell must present as Private Beta");
check(customer.includes('<span class="prototype-chip">PRIVATE BETA</span>'), "app shell chip must say Private Beta");
check(customer.includes('src="/assets/js/flipforge-identity.js"'), "customer shell must load identity before access gate");
check(customer.includes('src="private-beta-access-gate.js"'), "customer shell must load fail-closed access gate");
check(customer.indexOf('src="/assets/js/flipforge-identity.js"') < customer.indexOf('src="private-beta-access-gate.js"'), "identity must load before beta gate");
check(customer.indexOf('src="private-beta-access-gate.js"') < customer.indexOf('src="mock-data.js"'), "beta gate must run before app/data runtimes");
check(!customer.includes('<span class="prototype-chip">CUSTOMER APP</span>'), "production shell must not visibly present as launched customer app");

check(appGate.includes("membershipActive"), "entry gate must require active invited membership");
check(appGate.includes('fetch("/api/v1/entitlements"'), "entry gate must verify authoritative server access");
check(appGate.includes("window.location.replace(betaAuthUrl"), "entry gate must redirect failed access to beta sign-in");
check(appGate.includes("window.__FlipForgePrivateBetaAccessVerified = true"), "entry gate must publish successful verification");
check(appGate.includes('document.documentElement.classList.remove("ff-private-beta-access-pending")'), "entry gate must keep app hidden until access resolves");

check(buildAssets.includes("const BETA_SIGNIN_URL"), "build generator must own a Private Beta sign-in URL");
check(!buildAssets.includes("const CUSTOMER_APP_URL"), "build generator must not inject a public customer app URL");
check(buildAssets.includes("Beta Sign In"), "generated public app links must be Beta Sign In");
check(siteJs.includes("Beta Sign In"), "runtime public sign-in must say Beta Sign In");
check(siteJs.includes(BETA_AUTH), "runtime public sign-in must target beta-start auth");

check(customerShell.includes('setText(document.querySelector(".prototype-chip"), "PRIVATE BETA")'), "customer shell runtime must preserve Private Beta label");
check(commercialPolish.includes('production() ? "PRIVATE BETA"'), "commercial polish must preserve Private Beta label");
check(cockpitPolish.includes('customer ? "PRIVATE BETA" : "SAAS PREVIEW"'), "legacy cockpit must not overwrite beta label");

for (const page of publicPages) {
  const html = read(page);
  check(!html.includes('href="/app/#/dashboard"'), `${page} must not link directly to legacy app dashboard`);
  check(!html.includes('href="/app/customer/#/dashboard"'), `${page} must not link directly to customer dashboard`);
  check(!html.includes('data-ff-marketing-sign-in>Sign In</a>'), `${page} must not expose generic customer Sign In`);
  if (html.includes("data-ff-marketing-sign-in")) {
    check(html.includes("Beta Sign In</a>"), `${page} marketing auth must be labeled Beta Sign In`);
    check(html.includes(BETA_AUTH), `${page} marketing auth must enter beta-start`);
  }
}

console.log("PrivateBetaPublicAccessValidation");
console.log(`PASSED: ${40 + publicPages.length * 4 - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure}`);
if (failures.length) process.exitCode = 1;
