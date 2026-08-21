import fs from "node:fs";

const html = fs.readFileSync("saas-prototype/index.html", "utf8");
const shellCompletion = fs.readFileSync("saas-prototype/core-platform-completion-v1.js", "utf8");
const professionalPolish = fs.readFileSync("saas-prototype/customer-professional-polish.js", "utf8");
const navMatch = html.match(/<nav class="primary-nav"[\s\S]*?<\/nav>/);
if (!navMatch) throw new Error("Primary customer navigation is missing.");
const nav = navMatch[0];
const advancedMatch = nav.match(/<details class="ff-advanced-nav"[\s\S]*?<\/details>/);
const advanced = advancedMatch ? advancedMatch[0] : "";

const coreRoutes = ["dashboard", "discover", "forge-heat", "evaluate", "opportunities", "tracking", "portfolio", "alerts", "beta-start"];
const drillDownRoutes = ["compare", "psa-advisor", "evidence", "sell", "export"];
let failed = 0;

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} | ${label}`);
  if (!condition) failed++;
}

for (const route of coreRoutes) check(`core route remains directly visible: ${route}`, nav.includes(`data-route="${route}"`) && !advanced.includes(`data-route="${route}"`));
check("advanced analysis group exists", Boolean(advanced));
check("advanced analysis is collapsed by default", Boolean(advanced) && !/<details class="ff-advanced-nav"[^>]*\sopen(?:\s|>)/.test(advanced));
for (const route of drillDownRoutes) check(`expert route retained under advanced analysis: ${route}`, advanced.includes(`data-route="${route}"`));

check(
  "Forge Heat beta navigation replaces legacy Pro treatment",
  nav.includes('data-route="forge-heat"') &&
    html.includes('src="customer-professional-polish.js"') &&
    professionalPolish.includes('nav.querySelector(".forge-nav-pro")?.remove()') &&
    professionalPolish.includes('setText(state, "BETA")') &&
    professionalPolish.includes('nav.setAttribute("aria-label", "Forge Heat beta intelligence")')
);
check("Discover precedes Forge Heat", nav.indexOf('data-route="discover"') < nav.indexOf('data-route="forge-heat"'));
check("Forge Heat precedes Evaluate", nav.indexOf('data-route="forge-heat"') < nav.indexOf('data-route="evaluate"'));
check("Compare capability remains mounted", html.includes('src="customer-compare.js"'));
check("Evidence/PSA capability remains mounted", html.includes('src="customer-explainability.js"') && html.includes('src="customer-opportunities-bridge.js"'));
check("Audit export capability remains mounted", html.includes('src="customer-export.js"'));
check("Primary nav describes core workflow", nav.includes('aria-label="Core FlipForge workflow"'));
check("Advanced navigation stylesheet mounted", html.includes('href="consumer-pro-navigation.css"'));
check(
  "Navigation grouping resolves active expert routes inside the advanced group",
  shellCompletion.includes('const activeInside = [...advanced.querySelectorAll("[data-route]")]') &&
    shellCompletion.includes('.some(link => link.dataset.route === route)')
);
check("Advanced analysis state follows the active route", shellCompletion.includes("function syncAdvancedAnalysisState()") && shellCompletion.includes("advanced.open = activeInside"));
check("Advanced route state synchronizes during shell completion", shellCompletion.includes("syncAdvancedAnalysisState();") && shellCompletion.includes('window.addEventListener("hashchange", () => queueMicrotask(apply))'));

if (failed) throw new Error(`Consumer navigation validation failed: ${failed}`);
console.log("Consumer navigation keeps the core journey visible, preserves beta Forge Heat access, and keeps expert tools collapsed but available while opening the advanced group for its active route.");
