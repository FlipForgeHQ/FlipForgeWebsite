import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const index = read("saas-prototype/index.html");
const js = read("saas-prototype/decision-card-evidence-v1.js");
const css = read("saas-prototype/decision-card-evidence-v1.css");

let passed = 0;
const failures = [];
const check = (label, condition) => {
  if (condition) {
    passed += 1;
    console.log(`PASS | ${label}`);
  } else {
    failures.push(label);
    console.error(`FAIL | ${label}`);
  }
};

try {
  new Function(js);
  check("001 Decision Card evidence JavaScript parses", true);
} catch (error) {
  check(`001 Decision Card evidence JavaScript parses (${error.message})`, false);
}

check("002 stylesheet is loaded", index.includes('href="decision-card-evidence-v1.css"'));
check("003 runtime is loaded", index.includes('src="decision-card-evidence-v1.js"'));
check("004 runtime loads after Decision Intelligence UX v2", index.indexOf('src="decision-card-evidence-v1.js"') > index.indexOf('src="decision-intelligence-ux-v2.js"'));
check("005 stylesheet loads after Decision Intelligence UX v2", index.indexOf('href="decision-card-evidence-v1.css"') > index.indexOf('href="decision-intelligence-ux-v2.css"'));
check("006 beta result route is first-class", js.includes('parts[0] !== "opportunities"') && js.includes('[data-ff-decision-summary]'));
check("007 standalone Decision Intelligence remains supported", js.includes('routeName() !== "decision-intelligence"') && js.includes('[data-ff-di-v2-command]'));

for (const [number, label] of [
  ["08", "Identity Intelligence"],
  ["09", "Evidence Intelligence"],
  ["10", "Economic Intelligence"],
  ["11", "Risk + Uncertainty Intelligence"],
  ["12", "Decision Intelligence"],
  ["13", "Decision Traceback / Decision Receipt"],
  ["14", "Outcome Intelligence"]
]) {
  check(`${number} ${label} is present`, js.includes(label));
}

check("015 decision remains above the evidence layer", js.includes('model.anchor.insertAdjacentElement("afterend", panel)') && js.includes("The decision stays first"));
check("016 full evidence trail stays native", js.includes("Open full evidence trail") && js.includes("#/evidence/"));
check("017 receipt is never reconstructed on the beta result screen", js.includes("does not reconstruct it in the browser") && js.includes('receiptMode: "reference"'));
check("018 attached server receipt can still be opened", js.includes("data-ff-open-decision-receipt") && js.includes(".ff-di-v2-receipt"));
check("019 outcome layer routes to governed Tracking", js.includes("trackingHref") && js.includes("Continue to Tracking"));
check("020 economics copy forbids inferred profit", js.includes("does not infer profit or recompute value"));
check("021 presentation layer performs no network activity", !/fetch\s*\(|XMLHttpRequest/i.test(js));
check("022 presentation layer introduces no browser persistence", !/localStorage|sessionStorage|indexedDB/i.test(js));
check("023 presentation layer does not assign recommendation authority", !/recommendation\s*=|authorityEligible\s*=\s*true/i.test(js));
check("024 customer-visible text floor is 14px or larger", !/font-size\s*:\s*(?:[0-9]|1[0-3])px/i.test(css));
check("025 tablet responsiveness exists", css.includes("@media (max-width:1020px)"));
check("026 phone responsiveness exists", css.includes("@media (max-width:640px)"));

console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) {
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
