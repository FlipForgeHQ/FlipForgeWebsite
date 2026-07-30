import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prototypeRoot = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(prototypeRoot, name), "utf8");

const index = read("index.html");
const script = read("visual-intelligence.js");
const styles = read("visual-intelligence.css");
const data = read("mock-data.js");
const results = [];

function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
}

let syntaxValid = true;
try {
  new Function(script);
} catch (error) {
  syntaxValid = false;
  console.error(error.message);
}

check("001 visual stylesheet is loaded", index.includes('href="visual-intelligence.css"'));
check("002 visual script is loaded", index.includes('src="visual-intelligence.js"'));
check("003 visual stylesheet follows feature styles", index.indexOf('href="visual-intelligence.css"') > index.indexOf('href="feature-pages.css"'));
check("004 visual script follows route renderers", index.indexOf('src="visual-intelligence.js"') > index.indexOf('src="feature-pages.js"'));
check("005 route guard remains after visual module", index.indexOf('src="route-guard.js"') > index.indexOf('src="visual-intelligence.js"'));
check("006 visual JavaScript parses", syntaxValid);
check("007 dashboard-only enhancement is explicit", script.includes('activeRoute() !== "dashboard"'));
check("008 enhancement prevents duplicate insertion", script.includes("visualIntelligenceEnhanced"));
check("009 Smart Opportunity authority is explicit", script.includes("Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority"));
check("010 PSA authority is explicit", script.includes("Existing PSA intelligence remains the sole grading-guidance authority"));
check("011 graphics do not create ForgeScore authority", !/ForgeScore/i.test(`${script}\n${styles}`));
check("012 graphics explain rather than recalculate", script.includes("Graphics explain the stored decision; they do not recalculate it"));
check("013 confidence visualization exists", script.includes("Decision confidence") && script.includes("vi-gauge"));
check("014 liquidity visualization exists", script.includes('factor("Liquidity"'));
check("015 risk visualization exists", script.includes('factor("Risk"'));
check("016 evidence visualization exists", script.includes("Evidence readiness") && script.includes("evidenceRows"));
check("017 grading-economics visualization exists", script.includes("Grading economics") && script.includes("gradingBars"));
check("018 chart has accessible image labeling", script.includes('role="img"') && script.includes("aria-label"));
check("019 critical decision meaning is visible as text", script.includes("Smart Opportunity decision") && script.includes("decisionText"));
check("020 no direct network access exists", !/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b/.test(script));
check("021 no browser persistence exists", !/localStorage|sessionStorage|indexedDB/i.test(script));
check("022 no secret or authorization handling exists", !/API_KEY|Authorization\s*:|Bearer\s+/i.test(script));
check("023 responsive desktop tablet mobile rules exist", ["1180px", "760px", "480px"].every(value => styles.includes(value)));
check("024 reduced-motion handling exists", styles.includes("prefers-reduced-motion"));
check("025 approved identity data remains available", data.includes('authority: "Smart Opportunity"') && data.includes('gradingAuthority: "Existing PSA intelligence"'));
check("026 active asks remain labeled as listing context", script.includes("Saved listing context"));
check("027 population remains display-only", script.includes("Population context remains display-only"));
check("028 transaction authority is absent", !/auto-buy|checkout|collect payment|authorize purchase/i.test(script));

const failures = results.filter(result => !result.passed);
console.log("SaaSVisualIntelligenceValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
