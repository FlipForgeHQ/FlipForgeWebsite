import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const contract = JSON.parse(read("contracts/customer-parity-v2.json"));
const nav = read("saas-prototype/customer-navigation-parity-v1.js");
const decision = read("saas-prototype/decision-card-evidence-v1.js");

let passed = 0;
let failed = 0;
const failures = [];
const check = (condition, name) => {
  console.log(`${condition ? "PASS" : "FAIL"} | ${name}`);
  if (condition) passed += 1;
  else { failed += 1; failures.push(name); }
};

const orderedLabels = [
  ...contract.topLevelRoutes.map(item => item.label),
  ...contract.advancedRoutes.map(item => item.label)
];

for (const { route, label } of contract.topLevelRoutes) {
  check(nav.includes(`["${route}"`) && nav.includes(`"${label}"`), `website route contract: ${route} -> ${label}`);
}
for (const { route, label } of contract.advancedRoutes) {
  check(nav.includes(`"${route}"`) && read("saas-prototype/customer.html").includes(`data-route="${route}"`) && read("saas-prototype/customer.html").includes(label),
    `website advanced route contract: ${route} -> ${label}`);
}

const layerMatches = [...decision.matchAll(/data-cdi-layer="([^"]+)"[\s\S]*?<strong>([^<]+)<\/strong>/g)]
  .map(match => ({ key: match[1], label: match[2] }));
check(JSON.stringify(layerMatches) === JSON.stringify(contract.cdiLayers), "website CDI layer order and labels match canonical contract");

const flowText = "Identity → Evidence → Economics → Risk → Decision → Traceback → Outcome";
check(decision.includes(flowText), "website seven-layer summary uses canonical Traceback sequence");

check(contract.transactionAuthority === false, "canonical contract forbids transaction authority");
check(contract.decisionStates.join("/") === "BUY/WATCH/VERIFY/PASS", "canonical decision states remain BUY/WATCH/VERIFY/PASS");
check(contract.outcomeCheckpoints.join("/") === "T0/T7/T14/T30", "canonical outcome checkpoints remain T0/T7/T14/T30");
check(orderedLabels.length === 15 && new Set(orderedLabels).size === 15, "canonical customer route labels are unique and complete");

console.log(`\nCross-App Customer Contract — Website\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failures.length) failures.forEach(item => console.log(` - ${item}`));
if (failed > 0) process.exit(1);
