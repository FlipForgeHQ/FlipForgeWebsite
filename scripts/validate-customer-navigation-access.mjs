// Customer Navigation & Access UX contract (public website + customer app).
//
// Public website:
//  - every page with the public header carries ONE grouped access control: "Request Beta Access" (primary) plus
//    "Already invited? Sign in" with the exact Private Beta return URL, in the desktop nav, the mobile menu and footer;
//  - no page, build step or runtime script adds a separate, competing "Beta Sign In" link;
//  - the static default is always signed-out; "Open Dashboard" / "Check Access Status" can only come from the
//    server-verified entitlements response in assets/js/access-state-v1.js, never from browser storage or an
//    email lookup.
// Customer app:
//  - the top bar has no unexplained icon-only controls: Menu, Saved Decisions, Alerts (formerly the diamond) and the
//    initials Account control all carry visible text and accessible names;
//  - the phone drawer's Account entry shows the initials with an "Account" label and Alerts is reachable there;
//  - signed-out deep links return to the same Private Beta route after sign-in, and only to an allowlisted route.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const nav = require("./lib/public-access-nav.cjs");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail && !ok ? `${name} [${detail}]` : name);

// ---------------------------------------------------------------- public website: static pages
const rootPages = fs.readdirSync(root).filter(name => name.endsWith(".html"));
const headerPages = rootPages.filter(name => read(name).includes('class="site-header"'));
check("001 public header pages discovered", headerPages.length >= 18, headerPages.join(","));
for (const page of ["index.html", "product.html", "decision-intelligence.html", "learn.html", "pricing.html", "about.html", "faq.html", "privacy.html", "terms.html", "refund.html", "data-use.html", "beta-terms.html", "price-is-not-proof.html", "404.html", "beta-application.html", "beta-onboarding.html", "thank-you.html", "sample-decision-dossier.html", "platform-status.html"]) {
  check(`002 ${page} has the public header`, headerPages.includes(page));
}
for (const page of headerPages) {
  const html = read(page);
  const problems = nav.auditPublicAccess(html, page);
  check(`003 ${page} carries exactly the grouped access control (desktop, menu, footer)`, problems.length === 0, problems.join("; "));
  check(`004 ${page} has no standalone "Beta Sign In" link`, !/\bBeta Sign In\b/.test(html));
  check(`005 ${page} static state is signed-out only`, !/Open Dashboard|Check Access Status/.test(html) && !/data-ff-access-state="(?:member|pending)"/.test(html));
  const desktop = html.match(/<nav\b[^>]*class="[^"]*\bdesktop-nav\b[^"]*"[^>]*>([\s\S]*?)<\/nav>/i)?.[1] || "";
  const group = desktop.match(/<div\b[^>]*data-ff-access="desktop"[\s\S]*?<\/div>/)?.[0] || "";
  check(`006 ${page} desktop: "Already invited? Sign in" sits directly beside Request Beta Access`, /data-ff-access-sign-in[\s\S]*?<\/a><a\b[^>]*data-ff-access-primary/.test(group));
  const mobile = html.match(/<nav\b[^>]*id="mobile-navigation"[^>]*>([\s\S]*?)<\/nav>/i)?.[1] || "";
  check(`007 ${page} menu: access group is the first block, primary first then sign-in`, /^<div\b[^>]*data-ff-access="mobile"[^>]*><a\b[^>]*data-ff-access-primary[\s\S]*?<\/a><a\b[^>]*data-ff-access-sign-in/.test(mobile));
}
for (const page of rootPages.filter(name => !headerPages.includes(name) && name !== "production-auth.html")) {
  check(`008 ${page} has no standalone "Beta Sign In" link`, !/>\s*Beta Sign In\s*<\/a>/.test(read(page)));
}
check("009 every sign-in link keeps the exact Private Beta return destination", headerPages.every(page => {
  const html = read(page);
  const hrefs = [...html.matchAll(/href="([^"]*production-auth\.html[^"]*)"/g)].map(match => match[1]);
  return hrefs.length > 0 && hrefs.every(href => href === nav.SIGN_IN_URL);
}));

// ---------------------------------------------------------------- public website: build and runtime injection
const buildAssets = read("scripts/build-assets.js");
check("010 build normalizes the grouped access control", buildAssets.includes("normalizePublicAccess(html, { fileName })") && buildAssets.includes("auditPublicAccess(html, path.basename(htmlPath))"));
check("011 build no longer injects separate data-app-preview sign-in links", !/data-app-preview="(?:desktop|mobile|footer)" href/.test(buildAssets) && !buildAssets.includes("ensureDesktopAppLink"));
check("012 build no longer rewrites links into \"Beta Sign In\"", !buildAssets.includes("'>Beta Sign In</a>'"));
const publicJs = fs.readdirSync(path.join(root, "assets/js")).filter(name => name.endsWith(".js") && !/^flipforge-(?:identity|production-signin|production-auth-probe|staging-auth-probe)\.js$/.test(name));
for (const file of publicJs) {
  const source = read(`assets/js/${file}`);
  check(`013 assets/js/${file} does not inject a "Beta Sign In" link`, !/Beta Sign In/.test(source));
  check(`014 assets/js/${file} does not render a separate "Sign In" nav item`, !/label:'Sign In'/.test(source) && !/textContent\s*=\s*['"]Private Beta App['"]/.test(source));
  if (file !== "access-state-v1.js") check(`015 assets/js/${file} cannot upgrade the access state`, !/Open Dashboard|Check Access Status/.test(source));
}
const siteJs = read("assets/js/site.js");
check("016 site.js no longer injects or relabels a sign-in link", !siteJs.includes("ensureReturningBetaSignIn") && !siteJs.includes("data-ff-marketing-sign-in"));
const conversion = read("assets/js/conversion-events.js");
check("017 conversion-events.js preserves the access group when it normalizes the nav", conversion.includes("container.querySelector('[data-ff-access]')") && conversion.includes("accessGroup.remove()"));
const homepageV1 = read("assets/js/homepage-v1.js");
check("018 homepage-v1.js preserves the access group when it normalizes the nav", homepageV1.includes("nav.querySelector('[data-ff-access]')"));

// ---------------------------------------------------------------- public website: verified state
const access = read("assets/js/access-state-v1.js");
const code = access.replace(/\/\/.*$/gm, "");
check("019 verified state uses the same-origin gateway entitlements check", code.includes('const ENTITLEMENTS_PATH = "/api/v1/entitlements";') && code.includes("fetch(ENTITLEMENTS_PATH") && code.includes('credentials: "same-origin"') && code.includes('cache: "no-store"') && code.includes('redirect: "error"'));
check("020 exactly one network call, memoized in memory per page view", (code.match(/fetch\(/g) || []).length === 1 && code.includes("if (!verification) verification = verifyServerSession();"));
check("021 browser storage is never consulted", !/localStorage|sessionStorage|indexedDB|caches\./.test(code));
check("022 no email address is sent or looked up", !/email(?!_change_token)/i.test(code) && !/method:\s*"POST"/.test(code) && !/body:/.test(code));
check("023 the session cookie is only a hint for whether to ask the server", code.includes("if (!sessionHint()) return;") && code.includes("const state = await verifiedState();") && code.indexOf("if (!sessionHint()) return;") < code.indexOf("const state = await verifiedState();"));
check("024 Open Dashboard only after a verified 200 with a data object", /if \(response\.status === 200\) \{\s*return payload && typeof payload === "object" && payload\.data && typeof payload\.data === "object" \? "member" : "signed-out";/.test(code));
check("025 Check Access Status only after a verified 403 membership/admission code", /if \(response\.status === 403\) \{\s*return PENDING_CODES\.has\(String\(payload\?\.error\?\.code \|\| ""\)\) \? "pending" : "signed-out";/.test(code) && code.includes('new Set(["TENANT_MEMBERSHIP_REQUIRED", "TENANT_MEMBERSHIP_INACTIVE", "ENTITLEMENT_ACCESS_DENIED"])'));
check("026 everything else (401, 5xx, network, timeout) stays signed-out", code.includes('return "signed-out";\n    } catch (_) {\n      return "signed-out";') && code.includes('if (state !== "member" && state !== "pending") return;'));
check("027 invitation / recovery links are left to the activation flow", code.includes("invite_token") && code.includes("if (TOKEN_HASH.test(String(window.location.hash || \"\"))) return;"));
check("028 destinations: dashboard for members, status page (not the app) for pending accounts", code.includes('const DASHBOARD_URL = "/app/beta/#/dashboard";') && code.includes(`const STATUS_URL = "${nav.SIGN_IN_URL}";`));
check("029 access script is deferred, same-origin, no inline code", headerPages.every(page => read(page).includes('<script src="assets/js/access-state-v1.js" defer></script>')) && headerPages.every(page => !/<script>(?!\s*<\/script>)/.test(read(page).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""))));
const accessCss = read("assets/css/access-actions-v1.css");
check("030 access controls have a visible keyboard focus ring", accessCss.includes("[data-ff-access] a:focus-visible") && accessCss.includes("outline:2px solid #f0ca58"));
check("031 a verified session's hidden sign-in link really hides", accessCss.includes("[data-ff-access-sign-in][hidden]{display:none!important}"));

// ---------------------------------------------------------------- customer app: labelled navigation
const shells = { "saas-prototype/index.html": read("saas-prototype/index.html"), "saas-prototype/customer.html": read("saas-prototype/customer.html") };
const visibleText = markup => markup
  .replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, "")
  .replace(/<svg\b[\s\S]*?<\/svg>/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
for (const [file, html] of Object.entries(shells)) {
  const topbar = html.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1] || "";
  check(`032 ${file}: top bar found`, Boolean(topbar));
  const controls = [...topbar.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)];
  for (const [, , attrs, inner] of controls) {
    const label = attrs.match(/aria-label="([^"]+)"/)?.[1] || "";
    const text = visibleText(inner);
    check(`033 ${file}: top-bar control "${label || text}" has visible text`, text.length >= 4, inner.slice(0, 80));
    check(`034 ${file}: top-bar control "${text}" has an aria-label naming its visible label`, Boolean(label) && label.toLowerCase().includes(text.split(" ")[0].toLowerCase()), `${label} / ${text}`);
  }
  check(`035 ${file}: the retired diamond glyph is gone`, !topbar.includes("♢") && !topbar.includes("&#9826;"));
  check(`036 ${file}: Alerts keeps its real destination with a visible label`, /href="#\/alerts" data-ff-labeled-control="alerts" aria-label="Alerts: review reminders for your saved cards">[\s\S]*?<span class="ff-control-label">Alerts<\/span><\/a>/.test(topbar));
  check(`037 ${file}: Saved Decisions is a labelled top-bar control`, /href="#\/opportunities" data-ff-labeled-control="saved-decisions" aria-label="Saved Decisions[^"]*">[\s\S]*?<span class="ff-control-label">Saved Decisions<\/span><\/a>/.test(topbar));
  check(`038 ${file}: initials avatar sits beside a visible "Account" label`, /data-ff-labeled-control="account" aria-label="Account: Plan &amp; Usage and sign-out">\s*<span class="avatar" aria-hidden="true">[A-Z]{2}<\/span>\s*<span class="profile-copy"><strong>Account<\/strong>/.test(topbar));
  check(`039 ${file}: the menu button reads "Menu"`, /data-nav-toggle data-ff-labeled-control="menu" aria-label="Open navigation menu"[^>]*>[\s\S]*?<span class="ff-control-label">Menu<\/span><\/button>/.test(topbar));
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(match => match[1]).filter(href => !href.startsWith("/"));
  check(`040 ${file}: labelled-navigation stylesheet loads last`, links[links.length - 1] === "customer-navigation-labels-v1.css", links.slice(-2).join(","));
}
const labelsCss = read("saas-prototype/customer-navigation-labels-v1.css");
check("041 labelled controls keep their text at every width the top bar shows them", labelsCss.includes('[data-ff-labeled-control] .ff-control-label{\n  display:inline!important;') && !/\.ff-control-label\{[^}]*display:none/.test(labelsCss));
check("042 Account keeps its visible label on tablet widths", !/\[data-ff-labeled-control="account"\] \.profile-copy\{[^}]*display:none/.test(labelsCss) && labelsCss.includes('[data-ff-labeled-control="account"] .profile-copy{\n  display:grid!important;'));
const onlyShell = read("saas-prototype/customer-only-shell-v1.js");
check("043 beta top bar no longer hides Saved Decisions / Alerts behind aria-hidden", !onlyShell.includes("hideElement(saved)") && !onlyShell.includes("hideElement(alerts)"));
const stabilizer = read("saas-prototype/mobile-navigation-stabilizer-v1.js");
check("044 phone drawer Account entry shows initials + visible Account label", stabilizer.includes('data-ff-account-initials></span><span class="ff-mobile-account-copy"><strong>Account</strong>') && !stabilizer.includes("●</span>Account"));
check("045 phone drawer carries a labelled Alerts entry", stabilizer.includes("<strong>Alerts</strong><small>Review reminders</small>") && stabilizer.includes('alerts.href = "#/alerts";'));
check("046 Guided Mode Minimize and Close have visible words", read("saas-prototype/guided-mode-v1.js").includes('<span class="ff-guide-control-label">Minimize</span>') && read("saas-prototype/guided-mode-v1.js").includes('<span class="ff-guide-control-label">Close</span>'));
check("047 Compare swap has a visible word", read("saas-prototype/customer-compare.js").includes('<span class="ff-swap-label">Swap</span>'));

// ---------------------------------------------------------------- customer app: deep links through sign-in
const gate = read("saas-prototype/private-beta-access-gate.js");
const probe = read("scripts/lib/flipforge-production-auth-probe.mjs");
const gateRegex = gate.match(/const RETURN_ROUTE = (\/\^#.*\$\/);/)?.[1];
const probeRegex = probe.match(/const PRIVATE_BETA_RETURN = (\/\^\\\/app.*\$\/);/)?.[1];
check("048 gate and sign-in page share one deep-link allowlist", Boolean(gateRegex && probeRegex) && probeRegex.replace("^\\/app\\/beta\\/#", "^#") === gateRegex, `${gateRegex} vs ${probeRegex}`);
if (probeRegex) {
  // eslint-disable-next-line no-new-func
  const allow = new Function(`return ${probeRegex};`)();
  for (const [value, expected] of [
    ["/app/beta/#/opportunities/opp-123", true], ["/app/beta/#/tracking/abc_9", true], ["/app/beta/#/beta-start", true],
    ["//evil.example/app/beta/#/x", false], ["https://evil.example/app/beta/#/x", false], ["/app/customer/#/dashboard", false],
    ["/app/beta/#/x?next=//evil", false], ["/app/beta/#/x/../y", false], ["/app/beta/#/x\n", false], ["javascript:alert(1)", false],
    ["/app/beta/#/opportunities/%2F%2Fevil", false], ["/app/beta/#/a/b/c/d/e", false]
  ]) check(`049 return allowlist ${expected ? "accepts" : "rejects"} ${JSON.stringify(value)}`, allow.test(value) === expected);
}
check("050 gate sends the current deep link as the sign-in return destination", gate.includes("encodeURIComponent(`/app/beta/${hash}`)") && gate.includes("window.location.replace(betaAuthUrl"));
check("051 sign-in continue link uses the validated return path", probe.includes("returnLink.href = safeReturnPath();\n      returnLink.hidden = false;"));
check("052 sign-in falls back to Getting Started for anything else", probe.includes("if (PRIVATE_BETA_RETURN.test(requested)) return requested;\n  return PRIVATE_BETA_START;"));

console.log(`PASSED: ${passes.length}`);
for (const failure of failures) console.log(`FAIL | ${failure}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) process.exit(1);
