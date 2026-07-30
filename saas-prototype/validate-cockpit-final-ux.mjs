import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(root, name), "utf8");

const index = read("index.html");
const script = read("cockpit-final-ux.js");
const styles = read("cockpit-final-ux.css");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

check("001 final UX stylesheet is loaded", index.includes('href="cockpit-final-ux.css"'));
check("002 final UX script is loaded", index.includes('src="cockpit-final-ux.js"'));
check("003 final UX loads after cockpit polish", index.indexOf('src="cockpit-final-ux.js"') > index.indexOf('src="cockpit-polish.js"'));
check("004 selected analysis is collapsed with details", script.includes('document.createElement("details")') && script.includes("cockpit-analysis-details"));
check("005 selected analysis is not opened by default", !/details\.open\s*=|setAttribute\(["']open/.test(script));
check("006 summary preserves saved recommendation context", script.includes("opportunity.recommendation") && script.includes("opportunity.supported") && script.includes("opportunity.gap"));
check("007 sidebar and nav both reset to top", script.includes('document.querySelector(".sidebar")') && script.includes('document.querySelector(".primary-nav")') && script.includes("scrollTop = 0"));
check("008 delayed navigation restoration is countered", script.includes("setInterval") && script.includes("attempts >= 20"));
check("009 market chart gains visible date labels", script.includes("cockpit-market-axis-labels") && script.includes("points.at(-1).date"));
check("010 market chart gains demand dots", script.includes("demand-dot"));
check("011 market chart gains liquidity dots", script.includes("liquidity-dot"));
check("012 opportunity map gains recommendation legend", script.includes("cockpit-map-legend") && ["BUY", "WATCH", "VERIFY", "PASS"].every(value => script.includes(value)));
check("013 grading lanes show value delta from raw", script.includes("cockpit-grade-delta") && script.includes("vs raw"));
check("014 full expected value is not falsely claimed", script.includes("No full expected value is claimed because lower-grade outcomes are not modeled"));
check("015 grading predictor wording is softened", script.includes("Grading value scenarios") && script.includes("Net value by saved PSA outcome lane"));
check("016 repeated staging copy is reduced", script.includes('"Owner preview"') && script.includes('"5 currently displayed"') && script.includes('"Demand / liquidity index"'));
check("017 top non-production banner remains", index.includes("NON-PRODUCTION PROTOTYPE"));
check("018 no recommendation authority is added", !/ForgeScore|new recommendation engine/i.test(script));
check("019 no network calls exist", !/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b/.test(script));
check("020 no browser persistence exists", !/localStorage|sessionStorage|indexedDB/.test(script));
check("021 no credentials exist", !/API_KEY|Authorization\s*:|Bearer\s+/i.test(script));
check("022 details styling exists", styles.includes(".cockpit-analysis-details"));
check("023 market dot styling exists", styles.includes(".demand-dot") && styles.includes(".liquidity-dot"));
check("024 map legend styling exists", styles.includes(".cockpit-map-legend"));
check("025 grading delta styling exists", styles.includes(".cockpit-grade-delta"));
check("026 mobile breakpoint exists", styles.includes("@media (max-width: 640px)"));
check("027 reduced motion support exists", styles.includes("@media (prefers-reduced-motion: reduce)"));
check("028 keyboard focus is visible", styles.includes(":focus-visible"));

const failures = results.filter(result => !result.passed);
console.log("SaaSCockpitFinalUxValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
