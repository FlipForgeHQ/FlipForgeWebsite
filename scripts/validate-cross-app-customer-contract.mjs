import fs from "node:fs";

const contract = JSON.parse(fs.readFileSync("contracts/customer-experience-contract-v1.json", "utf8"));
const navJs = fs.readFileSync("saas-prototype/customer-navigation-parity-v1.js", "utf8");
const customerHtml = fs.readFileSync("saas-prototype/customer.html", "utf8");
const decisionCard = fs.readFileSync("saas-prototype/decision-card-evidence-v1.js", "utf8");
const customerShell = fs.readFileSync("saas-prototype/customer-only-shell-v1.js", "utf8");
const appJs = fs.readFileSync("saas-prototype/app.js", "utf8");

const checks = [];
const record = (name, pass, detail = null) => checks.push({name, pass: Boolean(pass), detail});

const coreExpected = contract.navigation.filter(item => item.kind === "core");
const advancedExpected = contract.navigation.filter(item => item.kind === "advanced");
const routePattern = /\["([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"[^"]*"\]/g;
const actualCore = [...navJs.matchAll(routePattern)].map(match => ({
  key: match[1], browserHref: match[2], label: match[3]
}));
const expectedCore = coreExpected.map(({key,browserHref,label}) => ({key,browserHref,label}));
record("core navigation exact", JSON.stringify(actualCore) === JSON.stringify(expectedCore), {actualCore, expectedCore});

const anchors = [...customerHtml.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
for (const item of advancedExpected) {
  const hrefNeedle = `href="${item.browserHref}"`;
  const routeNeedle = `data-route="${item.key}"`;
  const anchor = anchors.find(value => value.includes(hrefNeedle) && value.includes(routeNeedle)) || "";
  const renderedLabel = anchor.replace(/<span\b[^>]*>[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  record(`advanced route ${item.key}`, Boolean(anchor), {href:item.browserHref, found:Boolean(anchor)});
  record(`advanced label ${item.key}`, renderedLabel === item.label, {expected:item.label, actual:renderedLabel});
}

const layerPattern = /data-cdi-layer="([^"]+)"[\s\S]*?<strong>([^<]+)<\/strong>/g;
const actualLayers = [...decisionCard.matchAll(layerPattern)].map((match, index) => ({
  number:index+1, key:match[1], label:match[2].trim()
}));
record("seven CDI layers exact", JSON.stringify(actualLayers) === JSON.stringify(contract.cdiLayers), {actualLayers, expected:contract.cdiLayers});

for (const checkpoint of contract.outcomeCheckpoints) {
  record(`outcome checkpoint ${checkpoint}`, customerShell.includes(checkpoint));
}
record("category label", decisionCard.includes(contract.category), {expected:contract.category});
const expectedStates = contract.decisionStates.join("/");
record("decision authority states", appJs.includes(`Smart Opportunity remains the sole ${expectedStates} authority`), {expected:`Smart Opportunity remains the sole ${expectedStates} authority`});
record("unsupported sell guard", navJs.includes('const UNSUPPORTED_CUSTOMER_ROUTES = new Set(["sell"])'));

const report = {
  contractVersion: contract.contractVersion,
  passed: checks.filter(x => x.pass).length,
  failed: checks.filter(x => !x.pass).length,
  checks
};
fs.writeFileSync("parity-debug.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
