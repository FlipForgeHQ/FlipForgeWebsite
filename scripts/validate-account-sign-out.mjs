// Sign out is visible and consistent in every app shell and on the public site, and it only uses the existing
// identity path (FlipForgeIdentity.signOut() in the app, the sign-in page's Netlify Identity logout() elsewhere).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail && !ok ? `${name} [${detail}]` : name);

const module = read("saas-prototype/account-sign-out-v1.js");
const code = module.replace(/\/\/.*$/gm, "");
for (const shell of ["saas-prototype/index.html", "saas-prototype/customer.html"]) {
  const html = read(shell);
  const topbar = html.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1] || "";
  check(`001 ${shell}: visible top-bar Sign out next to Account`, /<\/a>\s*<button class="icon-button ff-topbar-signout" type="button" data-ff-sign-out data-ff-labeled-control="sign-out" aria-label="Sign out of FlipForge">[\s\S]*?<span class="ff-control-label">Sign out<\/span><\/button>/.test(topbar) && topbar.indexOf('data-ff-labeled-control="account"') < topbar.indexOf('data-ff-sign-out'));
  check(`002 ${shell}: loads the shared sign-out flow after the identity client`, html.includes('<script src="account-sign-out-v1.js"></script>') && html.indexOf('/assets/js/flipforge-identity.js') < html.indexOf("account-sign-out-v1.js"));
}
check("003 phone drawer has a Sign out directly under Account", read("saas-prototype/mobile-navigation-stabilizer-v1.js").includes('button.setAttribute("data-ff-sign-out", "");') && read("saas-prototype/mobile-navigation-stabilizer-v1.js").includes('account.insertAdjacentElement("afterend", button)') && read("saas-prototype/mobile-navigation-stabilizer-v1.js").includes('<span class="ff-sign-out-label">Sign out</span>'));
check("004 every [data-ff-sign-out] control runs one flow", code.includes('event.target.closest("[data-ff-sign-out]")') && code.includes("signOut();"));
check("005 the flow calls the existing identity sign-out path", code.includes("const identity = window.FlipForgeIdentity;") && code.includes('if (identity && typeof identity.signOut === "function") await identity.signOut();'));
check("006 no new auth path (no direct Identity or gateway calls besides the session re-check)", !/\/\.netlify\/identity|document\.cookie|nf_jwt/.test(code) && (code.match(/fetch\(/g) || []).length === 1 && code.includes('fetch("/api/v1/entitlements"'));
check("007 per-account browser data is cleared after sign-out", code.includes('key.startsWith("flipforge.") && !KEEP_KEYS.includes(key)') && code.includes('const KEEP_KEYS = ["flipforge.betaTerms.pending.v1", "flipforge.dashboard.renderer", BROADCAST_KEY];'));
check("008 the rendered workspace is removed and the page is replaced (Back cannot return to it)", code.includes("main.replaceChildren();") && code.includes("window.location.replace(SIGNED_OUT_URL);"));
check("009 pages restored from the back/forward cache re-check the session first", code.includes('window.addEventListener("pageshow"') && code.includes("event.persisted") && code.includes('document.documentElement.classList.add("ff-private-beta-access-pending");'));
check("010 other open tabs drop access when one tab signs out", code.includes('window.addEventListener("storage"') && code.includes("event.key !== BROADCAST_KEY"));
check("011 a failed sign-out keeps the person signed in and says so (never pretends)", code.includes('setControls("Sign out failed — retry", false);') && code.indexOf("clearAccountState();", code.indexOf("async function signOut")) > code.indexOf("await identity.signOut()"));
check("012 Account page and legacy account panel use the same flow", read("saas-prototype/customer-account.js").includes("await window.FlipForgeSignOut.signOut();") && read("saas-prototype/account-lifecycle.js").includes("await window.FlipForgeSignOut.signOut();"));
const css = read("saas-prototype/customer-navigation-labels-v1.css");
check("013 Sign out stays visible on tablet widths and the drawer button on phones", css.includes('[data-ff-labeled-control="sign-out"]{display:inline-flex!important}') && css.includes("button.ff-mobile-signout-nav{\n    display:grid!important;"));
check("014 hidden-while-checking state also covers the customer shell", css.includes("html.ff-private-beta-access-pending body{visibility:hidden!important}"));

const probe = read("scripts/lib/flipforge-production-auth-probe.mjs");
check("015 sign-in/status page signs out through Netlify Identity logout()", probe.includes("async function signOutSession() {\n  await withTimeout(logout());"));
check("016 public sign-out request needs a same-tab intent (no cross-site sign-out by link)", probe.includes("if (signOutRequested && consumeSignOutIntent() && user)") && probe.includes('window.sessionStorage.removeItem(SIGN_OUT_INTENT_KEY);'));
check("017 sign-in page clears the same per-account data and tells other tabs", probe.includes('const SIGN_OUT_KEEP_KEYS = ["flipforge.betaTerms.pending.v1", "flipforge.dashboard.renderer", SIGNED_OUT_BROADCAST_KEY];') && probe.includes('const SIGNED_OUT_BROADCAST_KEY = "flipforge.session.signedOutAt";'));
check("018 signed-out confirmation is shown", probe.includes('setStatus("You are signed out of FlipForge.", "ok");'));
const access = read("assets/js/access-state-v1.js");
check("019 public verified state offers Sign out", access.includes('signOut.textContent = "Sign out";') && access.includes('const SIGN_OUT_URL = "/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start&signout=1";') && access.indexOf("data-ff-access-sign-out") > access.indexOf("function applyGroup"));
check("020 public Sign out appears only after server verification", !/data-ff-access-sign-out/.test(fs.readdirSync(root).filter(name => name.endsWith(".html")).map(read).join("\n")));
const sw = read("sw.js");
check("021 service worker never serves or caches API, Identity or app requests", sw.includes("if(/^\\/(?:api|\\.netlify|app|owner|saas-prototype)(?:\\/|$)/.test(requestPath))return;") && sw.indexOf("requestPath))return;") < sw.indexOf("if(event.request.mode==='navigate')"));

console.log(`PASSED: ${passes.length}`);
for (const failure of failures) console.log(`FAIL | ${failure}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) process.exit(1);
