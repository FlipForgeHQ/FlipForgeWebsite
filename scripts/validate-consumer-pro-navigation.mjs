import fs from "node:fs";

const html = fs.readFileSync("saas-prototype/index.html", "utf8");
const shellCompletion = fs.readFileSync("saas-prototype/core-platform-completion-v1.js", "utf8");
const polish = fs.readFileSync("saas-prototype/customer-professional-polish.js", "utf8");
const customerShell = fs.readFileSync(new URL("../saas-prototype/customer-only-shell-v1.js", import.meta.url), "utf8");
const navMatch = html.match(/<nav class="primary-nav"[\s\S]*?<\/nav>/);
if (!navMatch) throw new Error("Primary customer navigation is missing.");
const nav = navMatch[0];
const advancedMatch = nav.match(/<details class="ff-advanced-nav"[\s\S]*?<\/details>/);
const advanced = advancedMatch ? advancedMatch[0] : "";

const coreRoutes = ["dashboard", "discover", "forge-heat", "evaluate", "opportunities", "tracking", "portfolio", "alerts", "beta-start"];
const drillDownRoutes = ["compare", "psa-advisor", "evidence", "export"];
let failed = 0;

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} | ${label}`);
  if (!condition) failed++;
}

for (const route of coreRoutes) check(`core route remains directly visible: ${route}`, nav.includes(`data-route="${route}"`) && !advanced.includes(`data-route="${route}"`));
check("advanced analysis group exists", Boolean(advanced));
check("advanced analysis is collapsed by default", Boolean(advanced) && !/<details class="ff-advanced-nav"[^>]*\sopen(?:\s|>)/.test(advanced));
for (const route of drillDownRoutes) check(`expert route retained under advanced analysis: ${route}`, advanced.includes(`data-route="${route}"`));

check("Forge Heat route remains mounted", nav.includes('data-route="forge-heat"'));
check("Forge Heat Pro badge is removed by canonical navigation owner", customerShell.includes('nav.querySelector(".forge-nav-pro")?.remove()'));
check("Forge Heat is labeled Beta without disabling navigation", customerShell.includes('setText(state, "BETA")') && customerShell.includes('nav.removeAttribute("aria-disabled")'));
check("Professional polish no longer owns navigation", !/function (consolidateAccountNavigation|installNavigationIcons|restoreInteractiveNavigation|prepareForgeHeatNavigation)/.test(polish));
check("Discover precedes Forge Heat", nav.indexOf('data-route="discover"') < nav.indexOf('data-route="forge-heat"'));
check("Forge Heat precedes Evaluate", nav.indexOf('data-route="forge-heat"') < nav.indexOf('data-route="evaluate"'));
check("Compare capability remains mounted", html.includes('src="customer-compare.js"'));
check("Evidence/PSA capability remains mounted", html.includes('src="customer-explainability.js"') && html.includes('src="customer-opportunities-bridge.js"'));
check("Audit export capability remains mounted", html.includes('src="customer-export.js"'));
check("Primary nav describes core workflow", nav.includes('aria-label="Core FlipForge workflow"'));
check("Advanced navigation stylesheet mounted", html.includes('href="consumer-pro-navigation.css"'));
// One owner: customer-only-shell-v1.js decides which links (and whether the Advanced group) appear per surface.
check("Navigation has one owner: a route manifest per surface in the customer shell", customerShell.includes("const NAV_MANIFEST = Object.freeze({") && customerShell.includes("function surfaceNavigation(nav)"));
check("Advanced analysis group is shown on the full customer app and closed/hidden on the beta by the same owner", /full: Object\.freeze\(\{[\s\S]*?advanced: true/.test(customerShell) && /beta: Object\.freeze\(\{[\s\S]*?advanced: false/.test(customerShell));
check("Platform completion no longer writes the Advanced group's open state (it fought the shell every frame)", !shellCompletion.includes("advanced.open =") && !shellCompletion.includes("syncAdvancedAnalysisState"));

if (failed) throw new Error(`Consumer Pro navigation validation failed: ${failed}`);
console.log("Consumer navigation keeps the core journey visible, expert tools available under Advanced Analysis, and the active expert route synchronized without turning Forge Heat into a paid-only navigation state.");
