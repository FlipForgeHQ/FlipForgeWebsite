import fs from "node:fs";

const contract = JSON.parse(fs.readFileSync("contracts/customer-experience-contract-v1.json", "utf8"));
const navJs = fs.readFileSync("saas-prototype/customer-navigation-parity-v1.js", "utf8");
const customerHtml = fs.readFileSync("saas-prototype/customer.html", "utf8");
const decisionCard = fs.readFileSync("saas-prototype/decision-card-evidence-v1.js", "utf8");
const customerShell = fs.readFileSync("saas-prototype/customer-only-shell-v1.js", "utf8");
const appJs = fs.readFileSync("saas-prototype/app.js", "utf8");

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const coreExpected = contract.navigation.filter(item => item.kind === "core");
const advancedExpected = contract.navigation.filter(item => item.kind === "advanced");

const routePattern = /\["([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"[^"]*"\]/g;
const actualCore = [...navJs.matchAll(routePattern)].map(match => ({
  key: match[1],
  browserHref: match[2],
  label: match[3]
}));

check(
  JSON.stringify(actualCore) === JSON.stringify(coreExpected.map(({key, browserHref, label}) => ({key, browserHref, label}))),
  "Top-level customer navigation does not match the canonical cross-app contract"
);

for (const item of advancedExpected) {
  check(navJs.includes(`"${item.key}"`), `Advanced route key missing from browser navigation contract: ${item.key}`);
  const hrefNeedle = `href="${item.browserHref}"`;
  const routeNeedle = `data-route="${item.key}"`;
  const anchors = [...customerHtml.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
  const anchor = anchors.find(value => value.includes(hrefNeedle) && value.includes(routeNeedle)) || "";
  check(Boolean(anchor), `Advanced customer route/href missing from customer shell: ${item.key} -> ${item.browserHref}`);
  const renderedLabel = anchor.replace(/<span\b[^>]*>[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  check(renderedLabel === item.label, `Advanced customer label drifted for ${item.key}: expected "${item.label}", got "${renderedLabel}"`);
}

const layerPattern = /data-cdi-layer="([^"]+)"[\s\S]*?<strong>([^<]+)<\/strong>/g;
const actualLayers = [...decisionCard.matchAll(layerPattern)].map((match, index) => ({
  number: index + 1,
  key: match[1],
  label: match[2].trim()
}));
check(
  JSON.stringify(actualLayers) === JSON.stringify(contract.cdiLayers),
  "Seven CDI layers do not exactly match the canonical cross-app contract"
);

for (const checkpoint of contract.outcomeCheckpoints) {
  check(customerShell.includes(checkpoint), `Customer shell is missing outcome checkpoint ${checkpoint}`);
}

check(decisionCard.includes(contract.category), "Decision Card is missing the canonical Card Decision Intelligence category label");

const expectedStates = contract.decisionStates.join("/");
check(
  appJs.includes(`Smart Opportunity remains the sole ${expectedStates} authority`),
  `Customer app no longer preserves the canonical decision-state authority: ${expectedStates}`
);

check(
  navJs.includes('const UNSUPPORTED_CUSTOMER_ROUTES = new Set(["sell"])'),
  "Unsupported customer route fail-closed guard is missing"
);

if (failures.length) {
  console.error("Cross-app customer contract validation failed:");
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`PASS: ${contract.contractVersion}`);
console.log(`PASS: ${contract.navigation.length} customer routes`);
console.log(`PASS: ${contract.cdiLayers.length} CDI layers`);
console.log(`PASS: ${contract.outcomeCheckpoints.join(" / ")} outcome continuity`);
