import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const customer = read("saas-prototype/customer.html");
const guard = read("saas-prototype/production-dashboard-guard.js");
const dashboard = read("saas-prototype/commercial-dashboard-v2.js");
const redirects = read("_redirects");

const checks = [];
const check = (name, passed) => checks.push({ name, passed: Boolean(passed) });

check("001 full customer entry declares itself before scripts", customer.includes("window.FlipForgeFullCustomerEntry=true"));
check("002 full customer entry loads Dashboard guard", customer.includes('src="production-dashboard-guard.js"'));
check("003 Dashboard guard runs before legacy router", customer.indexOf('src="production-dashboard-guard.js"') < customer.indexOf('src="app.js"'));
check("004 full customer Dashboard bootstrap is explicitly gated", guard.includes("window.FlipForgeFullCustomerEntry === true"));
check("005 full customer bootstrap loads authoritative Dashboard script", guard.includes('FULL_CUSTOMER_DASHBOARD_SCRIPT = "commercial-dashboard-v2.js"') && guard.includes("document.head.appendChild(script)"));
check("006 full customer bootstrap loads authoritative Dashboard stylesheet", guard.includes('FULL_CUSTOMER_DASHBOARD_STYLESHEET = "commercial-dashboard-v2.css"') && guard.includes("document.head.appendChild(stylesheet)"));
check("007 bootstrap refuses duplicate Dashboard assets", guard.includes("[data-ff-commercial-dashboard-js]") && guard.includes("[data-ff-commercial-dashboard-css]"));
check("008 renderer load failure cannot leave endless loading guard", guard.includes("DASHBOARD_RENDERER_UNAVAILABLE") && guard.includes("rendererFailureMarkup"));
check("009 customer asset route rewrites to SaaS prototype assets", redirects.includes("/app/customer/* /saas-prototype/:splat 200"));
check("010 production guard still recognizes authoritative renderer", guard.includes('[data-commercial-dashboard-v2]'));
check("011 full customer hash navigation stays in one workspace", guard.includes("function handleHashChange(event)") && guard.includes("if (fullCustomerEntry()) {\n      closeFullCustomerNavigation();\n      scheduleEnforce();\n      return;\n    }"));
check("012 guard batches Dashboard enforcement work", guard.includes("let enforceQueued = false") && guard.includes("function scheduleEnforce()") && guard.includes("new MutationObserver(scheduleEnforce)"));
check("013 full customer route taps close the mobile drawer without forcing reload", guard.includes("function closeFullCustomerNavigation()") && guard.includes('shell.dataset.navOpen = "false"') && guard.includes('toggle.setAttribute("aria-expanded", "false")') && guard.includes("if (fullCustomerEntry()) {\n      // Customer experience rule") && guard.includes("closeFullCustomerNavigation();") && guard.indexOf("closeFullCustomerNavigation();") < guard.indexOf("if (legacyBetaReloading || targetHash"));
check("014 authoritative Dashboard renderer owns hash navigation lifecycle", dashboard.includes('window.addEventListener("hashchange", () => queueMicrotask(apply))'));
check("015 SPA performance change preserves customer API timeout guard", guard.includes("AUTHORITATIVE_FETCH_TIMEOUT_MS = 15000") && guard.includes("fetchWithAuthoritativeTimeout"));
check("016 legacy beta reload boundary is isolated from full customer mode", guard.includes("function legacyBetaEntry()") && guard.includes("return customerApp() && !fullCustomerEntry()") && guard.includes("if (!legacyBetaEntry() || legacyBetaReloading) return;"));
check("017 full customer click path remains ahead of legacy beta reload", guard.indexOf("if (fullCustomerEntry()) {\n      // Customer experience rule") < guard.indexOf("if (legacyBetaReloading || targetHash"));
check("018 exact Tracking handoff keeps selected card context without document reload", guard.includes('TRACKING_STORAGE_KEY = "flipforge.trackingContext.v1"') && guard.includes("function openExactTrackingInWorkspace") && guard.includes("window.sessionStorage.setItem(TRACKING_STORAGE_KEY, id)") && guard.includes("window.location.hash = targetHash"));
check("019 exact Tracking handoff cooperates with customer route ownership", guard.includes("FlipForgeCustomerRouteOwnership") && guard.includes("owner.rememberExplicitIntent(targetHash)"));

const failed = checks.filter(result => !result.passed);
for (const result of checks) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
}

if (failed.length) {
  console.error(`Full customer Dashboard entry validation failed: ${failed.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`Full customer Dashboard entry validation passed: ${checks.length}/${checks.length}.`);
