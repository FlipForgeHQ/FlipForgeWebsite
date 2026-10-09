import fs from "node:fs";
import { runInNewContext } from "node:vm";

const read = path => fs.readFileSync(path, "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const BETA_AUTH = "/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start";
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
const beta = read("saas-prototype/index.html");
const customer = read("saas-prototype/customer.html");
const siteJs = read("assets/js/site.js");
const buildAssets = read("scripts/build-assets.js");
const customerShell = read("saas-prototype/customer-only-shell-v1.js");
const commercialPolish = read("saas-prototype/commercial-app-polish-v2.js");
const cockpitPolish = read("saas-prototype/cockpit-final-ux.js");
const betaGuide = read("saas-prototype/private-beta.js");
const betaTermsGate = read("assets/js/beta-invite-terms-gate.js");

// Exercise the real production guide script with a signed-in test snapshot.
// This protects against sign-in loops caused by beta onboarding taking over
// the owner/customer route, or repeated jumps when localStorage is unavailable.
function guideNavigation(pathname, { hostname = "goflipforge.com", blockedStorage = false } = {}) {
  const location = { hostname, pathname, hash: "#/discover" };
  const window = {
    location,
    localStorage: {
      getItem() { if (blockedStorage) throw new Error("storage blocked"); return null; },
      setItem() {},
      removeItem() {}
    },
    FlipForgeIdentity: { getSnapshot: () => ({ authenticated: true, membershipActive: true }) },
    requestAnimationFrame: callback => callback(),
    addEventListener() {}
  };
  const document = { querySelectorAll: () => [], querySelector: () => null };
  runInNewContext(betaGuide, { window, document }, { timeout: 1000 });
  return {
    eligible: window.FlipForgePrivateBeta.isEligible(),
    redirected: location.hash === "#/beta-start",
    finalHash: location.hash
  };
}
check(!guideNavigation("/owner/customer/").eligible && !guideNavigation("/owner/customer/").redirected,
  "signed-in owner customer preview must never be hijacked by Private Beta onboarding");
check(!guideNavigation("/app/customer/").eligible && !guideNavigation("/app/customer/").redirected,
  "signed-in full customer route must never redirect to beta-start");
check(!guideNavigation("/owner/").eligible && !guideNavigation("/owner/").redirected,
  "operator Owner Hub must not enter beta onboarding");
check(guideNavigation("/app/beta/").eligible && guideNavigation("/app/beta/").redirected,
  "dedicated Private Beta route retains intended first-run onboarding");
check(!guideNavigation("/app/beta/", { blockedStorage: true }).redirected,
  "blocked browser storage must not force endless onboarding redirects after sign-in");
check(!guideNavigation("/app/customer/", { hostname:"deploy-preview-495--goflipforge.netlify.app" }).redirected,
  "preview customer route must not be redirected to beta-start");
check(guideNavigation("/app/", { hostname:"localhost" }).eligible,
  "local preview retains legacy beta rehearsal entry");
check(betaTermsGate.includes('!/^\\/app\\/beta\\/?$/i.test') 
    && !betaTermsGate.includes('!=="/app/customer/"'),
  "Terms acceptance must avoid redundant navigation when already at beta-start");


check(redirects.includes(`/app ${BETA_AUTH} 302`), "generic /app must route to Private Beta Sign In");
check(redirects.includes(`/app/* ${BETA_AUTH} 302`), "generic /app/* must route to Private Beta Sign In");
check(redirects.includes("/app/beta /saas-prototype/index.html 200"), "dedicated Private Beta route must serve the beta shell");
check(redirects.includes("/app/beta/ /saas-prototype/index.html 200"), "Private Beta slash route must serve the beta shell");
check(redirects.includes("/app/beta/* /saas-prototype/:splat 200"), "Private Beta assets must stay on the beta route");
check(!redirects.includes("/app/customer /saas-prototype/customer.html 200"), "customer route must not be publicly served");
check(!redirects.includes("/app/customer/ /saas-prototype/customer.html 200"), "customer slash route must not be publicly served");
check(!redirects.includes("/app/customer/* /saas-prototype/:splat 200"), "customer assets must not be publicly routed");

check(authPage.includes("<title>Private Beta Sign In | FlipForge</title>"), "auth page must be explicitly Private Beta");
check(authPage.includes("Customer access is not publicly available."), "auth page must state customer access is not public");
check(authPage.includes("There is no public customer login or signup."), "auth page must state no public customer login");
check(authPage.includes('href="/app/beta/#/beta-start" hidden>Enter Private Beta</a>'), "auth continue action must enter the dedicated beta shell");
check(!authPage.includes("Test account access"), "developer account-test control must not be public");
check(!authPage.includes("/app/#/account"), "auth page must not default to customer account");

check(authProbe.includes('const PRIVATE_BETA_START = "/app/beta/#/beta-start";'), "auth probe must lock the post-login destination to the dedicated beta shell");
check(authProbe.includes("async function verifyAccess()"), "auth probe must verify server access before continuing");
check(authProbe.includes('fetch("/api/v1/entitlements"'), "auth probe must use authoritative entitlements");
check(authProbe.includes("returnLink.hidden = true"), "continue action must stay hidden until verification");
check(authPage.includes('<a class="button-link" data-production-auth-owner href="/owner" hidden>Open Owner Hub</a>'), "operator Owner Hub link must be hidden by default");
check(authProbe.includes('const OPERATOR_ROLE = "flipforge-operator";') && authProbe.includes("ownerLink.hidden = !isOperatorAccount(currentUser)"), "Owner Hub link must appear only for operator accounts");
check(authProbe.includes("response.status === 403 && isOperatorAccount(currentUser)"), "operator accounts must be pointed to the Owner Hub instead of a dead end");
check(!authProbe.includes("ownerLink.hidden = false"), "Owner Hub link must never be shown unconditionally");
check(!authProbe.includes('return "/app/#/account"'), "auth probe must not return to customer account");
check(!authProbe.includes('normalizedPath === "/app/customer/"'), "auth probe must not allow arbitrary customer return routes");

check(beta.includes("<title>FlipForge | Private Beta — Card Decision Intelligence</title>"), "dedicated beta shell must present as Private Beta");
check(beta.includes('<span class="prototype-chip">PRIVATE BETA</span>'), "beta shell chip must say Private Beta");
check(beta.includes('src="/assets/js/flipforge-identity.js"'), "beta shell must load identity before access gate");
check(beta.includes('src="private-beta-access-gate.js"'), "beta shell must load fail-closed access gate");
check(beta.indexOf('src="/assets/js/flipforge-identity.js"') < beta.indexOf('src="private-beta-access-gate.js"'), "identity must load before beta gate");
check(beta.indexOf('src="private-beta-access-gate.js"') < beta.indexOf('src="mock-data.js"'), "beta gate must run before app/data runtimes");
check(customer.includes('<span class="prototype-chip">CUSTOMER APP</span>'), "customer shell remains distinctly CUSTOMER APP");
check(customer.includes('window.location.replace("/")'), "raw production customer document must redirect away before render");
check(!customer.includes('src="private-beta-access-gate.js"'), "customer shell must not masquerade as the beta shell");

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

check(customerShell.includes('setText(document.querySelector(".prototype-chip"), "CUSTOMER APP")'), "customer shell runtime must preserve CUSTOMER APP label");
check(commercialPolish.includes('customer ? "CUSTOMER APP"'), "customer polish must preserve customer identity in the customer experience");
check(cockpitPolish.includes('customer ? "CUSTOMER APP" : "SAAS PREVIEW"'), "legacy cockpit must preserve customer identity");

for (const page of publicPages) {
  const html = read(page);
  check(!html.includes('href="/app/#/dashboard"'), `${page} must not link directly to legacy app dashboard`);
  check(!html.includes('href="/app/customer/#/dashboard"'), `${page} must not link directly to customer dashboard`);
  check(!html.includes('href="/app/customer/'), `${page} must not expose any customer-app link`);
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
