import fs from "node:fs";

const indexUrl = new URL("../saas-prototype/index.html", import.meta.url);
const betaFlowUrl = new URL("../saas-prototype/beta-customer-flow-v2.js", import.meta.url);
const marker = '  <script src="customer-discovery.js"></script>';
const guard = '  <script src="customer-discovery-request-guard.js"></script>';
let source = fs.readFileSync(indexUrl, "utf8");

if (!source.includes(marker)) {
  throw new Error("customer-discovery.js script marker is missing from the SaaS app shell.");
}
if (!source.includes(guard)) {
  source = source.replace(marker, `${guard}\n${marker}`);
  fs.writeFileSync(indexUrl, source, "utf8");
}

// No route-ownership repair script is injected into either app page: each route owner drops responses that
// arrive after the customer left its route (generation and route checks in the owner), and the route race stress
// test passes without a repair layer (consolidation, Nov 3 2026).

let betaFlow = fs.readFileSync(betaFlowUrl, "utf8");
const rawSetHtml = `  function setHtml(node, value) {
    if (node && node.innerHTML !== value) node.innerHTML = value;
  }`;
const stableSetHtml = `  function setHtml(node, value) {
    if (!node) return;
    const template = document.createElement("template");
    template.innerHTML = value;
    const normalized = template.innerHTML;
    if (node.innerHTML !== normalized) node.innerHTML = normalized;
  }`;

if (betaFlow.includes(rawSetHtml)) betaFlow = betaFlow.replace(rawSetHtml, stableSetHtml);
if (!betaFlow.includes(stableSetHtml)) {
  throw new Error("Stable beta-flow HTML renderer transformation failed.");
}

// The saved decision page's evidence actions are plain links rendered by customer-opportunities.js (no beta-flow patch).
fs.writeFileSync(betaFlowUrl, betaFlow, "utf8");

console.log("Injected Discover request guard and normalized beta-flow HTML rendering.");
