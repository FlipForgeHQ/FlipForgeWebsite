import fs from "node:fs";

// The full consumer-pro navigation is the customer app (customer.html). The Private Beta page (index.html) lists only the
// founder's beta menu (Nov 3 2026), checked at the end of this file.
const html = fs.readFileSync("saas-prototype/customer.html", "utf8");
const betaHtml = fs.readFileSync("saas-prototype/index.html", "utf8");
const shellCompletion = fs.readFileSync("saas-prototype/core-platform-completion-v1.js", "utf8");
const polish = fs.readFileSync("saas-prototype/customer-professional-polish.js", "utf8");
const navMatch = html.match(/<nav class="primary-nav"[\s\S]*?<\/nav>/);
if (!navMatch) throw new Error("Primary customer navigation is missing.");
const nav = navMatch[0];
const advancedMatch = nav.match(/<details class="ff-advanced-nav"[\s\S]*?<\/details>/);
const advanced = advancedMatch ? advancedMatch[0] : "";

const coreRoutes = ["dashboard", "discover", "forge-heat", "evaluate", "evidence", "opportunities", "tracking", "portfolio", "alerts"];
const drillDownRoutes = ["compare", "psa-advisor", "export"];
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
check("Forge Heat Pro badge is removed by the customer polish layer", !nav.includes("forge-nav-pro") && !betaHtml.includes("forge-nav-pro"));
check("Forge Heat is labeled Beta without disabling navigation", [nav, betaHtml].every(page => page.includes('Forge Heat <span class="forge-nav-state">BETA</span>')) && !/data-route="forge-heat"[^>]*aria-disabled/.test(nav + betaHtml));
check("Discover precedes Forge Heat", nav.indexOf('data-route="discover"') < nav.indexOf('data-route="forge-heat"'));
const betaNav = (betaHtml.match(/<nav class="primary-nav"[\s\S]*?<\/nav>/) || [""])[0];
check("Private Beta navigation lists exactly the founder's beta menu", [...betaNav.matchAll(/data-route="([^"]+)"/g)].map(match => match[1]).join(",") === "dashboard,discover,opportunities,tracking,alerts,portfolio,forge-heat,account");
check("Compare capability remains mounted", html.includes('src="customer-compare.js"'));
check("Evidence/PSA capability remains mounted", html.includes('src="customer-explainability.js"') && html.includes('src="customer-opportunities-bridge.js"'));
check("Audit export capability remains mounted", html.includes('src="customer-export.js"'));
check("Primary nav describes core workflow", betaNav.includes('aria-label="Core FlipForge workflow"') && nav.includes('aria-label="FlipForge customer navigation"'));
check("Advanced navigation stylesheet mounted", html.includes('href="consumer-pro-navigation.css"'));
check(
  "Navigation grouping resolves the active expert route through the advanced group",
  shellCompletion.includes('advanced.querySelectorAll("[data-route]")') &&
    shellCompletion.includes('.some(link => link.dataset.route === route)')
);
check("Advanced analysis state follows the active route", shellCompletion.includes("function syncAdvancedAnalysisState()") && shellCompletion.includes("advanced.open = activeInside"));
check("Advanced route state is synchronized during the platform completion apply cycle", shellCompletion.includes("syncAdvancedAnalysisState();") && shellCompletion.includes('window.addEventListener("hashchange"'));

if (failed) throw new Error(`Consumer Pro navigation validation failed: ${failed}`);
console.log("Consumer navigation keeps the core journey visible, expert tools available under Advanced Analysis, and the active expert route synchronized without turning Forge Heat into a paid-only navigation state.");
