import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const contract = JSON.parse(read("contracts/customer-parity-v2.json"));
const nav = read("saas-prototype/customer-navigation-parity-v1.js");
const customerHtml = read("saas-prototype/customer.html");
const decision = read("saas-prototype/decision-card-evidence-v1.js");
const shell = read("saas-prototype/customer-only-shell-v1.js");
const app = read("saas-prototype/app.js");

let passed = 0;
let failed = 0;
const failures = [];
const check = (condition, name, detail = "") => {
  console.log(`${condition ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`);
  if (condition) passed += 1;
  else { failed += 1; failures.push(detail ? `${name}: ${detail}` : name); }
};

const routePattern = /\["([^"]+)",\s*"(#\/[^"]+)",\s*"([^"]+)",\s*"[^"]*"\]/g;
const actualTop = [...nav.matchAll(routePattern)].map(match => ({
  route: match[1],
  href: match[2],
  label: match[3]
}));
check(
  JSON.stringify(actualTop) === JSON.stringify(contract.topLevelRoutes),
  "website top-level route order/hrefs/labels match canonical contract",
  JSON.stringify(actualTop)
);

const anchors = [...customerHtml.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
for (const item of contract.advancedRoutes) {
  const anchor = anchors.find(value =>
    value.includes(`href="${item.href}"`) &&
    value.includes(`data-route="${item.route}"`)
  ) || "";
  const renderedLabel = anchor
    .replace(/<span\b[^>]*>[\s\S]*?<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  check(Boolean(anchor), `website advanced route exists: ${item.route}`);
  check(renderedLabel === item.label,
    `website advanced label exact: ${item.route}`,
    `expected=${item.label}, actual=${renderedLabel}`);
}

const layerMatches = [...decision.matchAll(/data-cdi-layer="([^"]+)"[\s\S]*?<strong>([^<]+)<\/strong>/g)]
  .map(match => ({ key: match[1], label: match[2].trim() }));
check(
  JSON.stringify(layerMatches) === JSON.stringify(contract.cdiLayers),
  "website CDI layer order and labels match canonical contract",
  JSON.stringify(layerMatches)
);

check(
  decision.includes("Identity → Evidence → Economics → Risk → Decision → Traceback → Outcome"),
  "website seven-layer summary uses canonical Traceback sequence"
);
for (const checkpoint of contract.outcomeCheckpoints) {
  check(shell.includes(checkpoint), `website customer shell preserves outcome checkpoint ${checkpoint}`);
}
const decisionStates = contract.decisionStates.join("/");
check(
  app.includes(`Smart Opportunity remains the sole ${decisionStates} authority`),
  "browser preserves canonical decision authority states"
);
check(
  nav.includes('const UNSUPPORTED_CUSTOMER_ROUTES = new Set(["sell"])'),
  "unsupported customer route remains fail-closed"
);
check(contract.transactionAuthority === false, "canonical contract forbids transaction authority");
check(contract.sourceOfTruth === "SQLite", "canonical source of truth remains SQLite");
check(contract.customerOnlyBoundary?.operatorControlsVisible === false, "customer contract excludes operator controls");
check(contract.customerOnlyBoundary?.rawProviderPayloadsVisible === false, "customer contract excludes raw provider payloads");
check(contract.customerOnlyBoundary?.manualEvidenceMutationVisible === false, "customer contract excludes manual evidence mutation");
check(contract.customerOnlyBoundary?.recommendationRecalculationInBrowser === false, "browser cannot recalculate recommendation authority");

const allRoutes = [...contract.topLevelRoutes, ...contract.advancedRoutes];
check(allRoutes.length === 15 && new Set(allRoutes.map(item => item.route)).size === 15,
  "canonical customer route keys are unique and complete");
check(new Set(allRoutes.map(item => item.label)).size === 15,
  "canonical customer route labels are unique and complete");

console.log(`\nCross-App Customer Contract — Website\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failures.length) failures.forEach(item => console.log(` - ${item}`));
if (failed > 0) process.exit(1);
