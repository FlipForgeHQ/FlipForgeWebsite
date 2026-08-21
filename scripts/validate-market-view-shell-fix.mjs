import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const scroll = read("saas-prototype/scroll-reset.js");
const productionIdentity = read("scripts/lib/flipforge-production-signin.mjs");

const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });

check("001 hash navigation resets the new workspace route to top", scroll.includes('window.addEventListener("hashchange"') && scroll.includes("resetRouteScroll()") && scroll.includes("resetScroll(0)"));
check("002 reload and resize preserve vertical reading position", scroll.includes('window.addEventListener("pageshow", resetHorizontalAfterLayout)') && scroll.includes('window.addEventListener("resize", resetHorizontalAfterLayout)'));
check("003 Market View zero state gives a direct first action", scroll.includes("Build your first Market View.") && scroll.includes("Start with Discover and complete one exact-card evaluation."));
check("004 Market View zero-state polish is presentation-only", scroll.includes("MutationObserver") && !/fetch\(|XMLHttpRequest|X-FlipForge-|recommendationAuthority|transactionAuthority/.test(scroll));
check("005 signed-in production users do not keep the fixed account launcher", productionIdentity.includes("if (state.user && !state.panelOpen)") && productionIdentity.includes('document.getElementById(ROOT_ID)?.remove()'));
check("006 Account page receives the authenticated sign-out control", productionIdentity.includes('ACCOUNT_SIGN_OUT_ATTRIBUTE = "data-ff-production-account-signout"') && productionIdentity.includes("syncAccountSignOut") && productionIdentity.includes('button.textContent = "Sign out"'));
check("007 production sign-out still refreshes shared Identity and tenant adapters", productionIdentity.includes("await window.FlipForgeIdentity?.refresh?.()") && productionIdentity.includes("window.FlipForgeStagingReadAdapter?.refresh?.()"));
check("008 production identity remains host and app-path restricted", productionIdentity.includes("PRODUCTION_HOST") && productionIdentity.includes("PRODUCTION_APP_PATH") && productionIdentity.includes("productionAppHost()"));
check("009 no public signup or browser credential persistence was introduced", !productionIdentity.includes("signup(") && !/localStorage|sessionStorage|document\.cookie/.test(productionIdentity));
check("010 no tenant header or FlipForge service token can be constructed by this UI", !/X-FlipForge-Tenant-Id|X-FlipForge-User-Id|FLIPFORGE_API_SERVICE_TOKEN|FLIPFORGE_SAAS_SERVICE_TOKEN/.test(productionIdentity));

const failures = checks.filter(item => !item.passed);
console.log("MarketViewShellFixValidation");
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
