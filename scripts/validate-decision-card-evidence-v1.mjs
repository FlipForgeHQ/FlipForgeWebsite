import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const index = read("saas-prototype/index.html");
const loader = read("saas-prototype/decision-intelligence-final-polish-v1.js");
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

try {
  new Function(loader);
  check("002 Decision Intelligence polish loader parses", true);
} catch (error) {
  check(`002 Decision Intelligence polish loader parses (${error.message})`, false);
}

check("003 existing polish runtime is loaded by app shell", index.includes('src="decision-intelligence-final-polish-v1.js"'));
check("004 loader mounts Decision Card stylesheet", loader.includes('link.href = "decision-card-evidence-v1.css"') && loader.includes("data-ff-decision-card-evidence"));
check("005 loader mounts Decision Card runtime", loader.includes('script.src = "decision-card-evidence-v1.js"') && loader.includes("FlipForgeDecisionCardEvidenceV1"));
check("006 loader runs through existing apply lifecycle", loader.includes("ensureDecisionCardEvidenceAssets();"));
check("007 beta result route is first-class", js.includes('parts[0] !== "opportunities"') && js.includes('[data-ff-decision-summary]'));
check("008 standalone Decision Intelligence remains supported", js.includes('routeName() !== "decision-intelligence"') && js.includes('[data-ff-di-v2-command]'));

for (const [number, label] of [
  ["009", "Identity Intelligence"],
  ["010", "Evidence Intelligence"],
  ["011", "Economic Intelligence"],
  ["012", "Risk + Uncertainty Intelligence"],
  ["013", "Decision Intelligence"],
  ["014", "Decision Traceback / Decision Receipt"],
  ["015", "Outcome Intelligence"]
]) {
  check(`${number} ${label} is present`, js.includes(label));
}

check("016 decision remains above the evidence layer", js.includes('model.anchor.insertAdjacentElement("afterend", panel)') && js.includes("The decision stays first"));
check("017 full evidence trail stays native", js.includes("Open full evidence trail") && js.includes("#/evidence/"));
check("018 receipt is never reconstructed on the beta result screen", js.includes("does not reconstruct it in the browser") && js.includes('receiptMode: "reference"'));
check("019 attached server receipt can still be opened", js.includes("data-ff-open-decision-receipt") && js.includes(".ff-di-v2-receipt"));
check("020 outcome layer routes to governed Tracking", js.includes("trackingHref") && js.includes("Continue to Tracking"));
check("021 economics copy forbids inferred profit", js.includes("does not infer profit or recompute value"));
check("022 presentation layer performs no network activity", !/fetch\s*\(|XMLHttpRequest/i.test(js));
check("023 presentation layer introduces no browser persistence", !/localStorage|sessionStorage|indexedDB/i.test(js));
check("024 presentation layer does not assign recommendation authority", !/recommendation\s*=|authorityEligible\s*=\s*true/i.test(js));
check("025 customer-visible text floor is 14px or larger", !/font-size\s*:\s*(?:[0-9]|1[0-3])px/i.test(css));
check("026 tablet responsiveness exists", css.includes("@media (max-width:1020px)"));
check("027 phone responsiveness exists", css.includes("@media (max-width:640px)"));

console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) {
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
