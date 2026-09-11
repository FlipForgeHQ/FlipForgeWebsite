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

for (const [number, label] of [
  ["01", "Identity Intelligence"],
  ["02", "Evidence Intelligence"],
  ["03", "Economic Intelligence"],
  ["04", "Risk + Uncertainty Intelligence"],
  ["05", "Decision Intelligence"],
  ["06", "Decision Traceback / Decision Receipt"],
  ["07", "Outcome Intelligence"]
]) {
  check(`${number} ${label} is present`, js.includes(label));
}

check("013 top summary remains decision-first", js.includes("Decision Card summary") && js.includes(">Decision<") && js.includes(">Evidence<") && js.includes("Risk + uncertainty"));
check("014 full evidence trail stays native", js.includes("Open full evidence trail"));
check("015 Decision Receipt opens the existing server-owned receipt", js.includes("data-ff-open-decision-receipt") && js.includes(".ff-di-v2-receipt"));
check("016 outcome layer routes to governed Tracking", js.includes('href="#/tracking"'));
check("017 economics copy forbids inferred profit", js.includes("does not infer profit or recompute value"));
check("018 presentation layer performs no network writes", !/fetch\s*\(|XMLHttpRequest|method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i.test(js));
check("019 presentation layer introduces no browser persistence", !/localStorage|sessionStorage|indexedDB/i.test(js));
check("020 presentation layer does not assign recommendation authority", !/recommendation\s*=|supportedValue\s*=|authorityEligible\s*=\s*true/i.test(js));
check("021 customer-visible text floor is 13px or larger", !/font-size\s*:\s*(?:[0-9]|1[0-2])px/i.test(css));
check("022 tablet responsiveness exists", css.includes("@media (max-width:1020px)"));
check("023 phone responsiveness exists", css.includes("@media (max-width:640px)"));

console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) {
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
