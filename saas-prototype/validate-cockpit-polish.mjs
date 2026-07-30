import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(root, name), "utf8");

const index = read("index.html");
const script = read("cockpit-polish.js");
const styles = read("cockpit-polish.css");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

check("001 polish stylesheet is loaded", index.includes('href="cockpit-polish.css"'));
check("002 polish script is loaded", index.includes('src="cockpit-polish.js"'));
check("003 polish loads after layout fix", index.indexOf('src="cockpit-polish.js"') > index.indexOf('src="cockpit-layout-fix.js"'));
check("004 cockpit title is compact and product-specific", script.includes("FlipForge Intelligence Cockpit"));
check("005 evidence-first summary is present", script.includes("evidence-first workspace"));
check("006 KPI strip exists", script.includes("cockpit-kpi-strip"));
check("007 tracked opportunities KPI exists", script.includes("Tracked opportunities"));
check("008 evidence readiness KPI exists", script.includes("Evidence readiness"));
check("009 portfolio value KPI exists", script.includes("Portfolio value"));
check("010 review-state KPI exists", script.includes("Needs review"));
check("011 market pulse KPI exists", script.includes("Market pulse"));
check("012 market sparkline has accessible label", script.includes('role="img"') && script.includes("Prototype demand trend"));
check("013 navigation reset targets primary nav", script.includes("primaryNav.scrollTop = 0"));
check("014 navigation reset retries after restoration", script.includes("setTimeout(reset, 220)"));
check("015 no direct network access exists", !/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b/.test(script));
check("016 no browser persistence exists", !/localStorage|sessionStorage|indexedDB/.test(script));
check("017 no credentials exist", !/API_KEY|Authorization\s*:|Bearer\s+/i.test(script));
check("018 five-column desktop KPI grid exists", styles.includes("grid-template-columns: repeat(5"));
check("019 KPI layout has responsive breakpoint", styles.includes("@media (max-width: 1320px)"));
check("020 mobile single-column layout exists", styles.includes("@media (max-width: 640px)"));
check("021 reduced-motion support exists", styles.includes("@media (prefers-reduced-motion: reduce)"));

const failures = results.filter(result => !result.passed);
console.log("SaaSCockpitPolishValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
