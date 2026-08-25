import fs from "node:fs";

const opportunities = fs.readFileSync(new URL("../saas-prototype/customer-opportunities.js", import.meta.url), "utf8");
const saveFlow = fs.readFileSync(new URL("../saas-prototype/customer-save-flow-v1.js", import.meta.url), "utf8");
const flowCss = fs.readFileSync(new URL("../saas-prototype/beta-customer-flow-v2.css", import.meta.url), "utf8");

const checks = [
  ["saved detail has a direct detail fast path", opportunities.includes("async function loadDetailDirect()")],
  ["saved detail chooses direct path before list loading", opportunities.includes("if (state.requestedId) await loadDetailDirect();")],
  ["detail fast path loads decision evidence and PSA", ["/api/v1/opportunities/${encoded}", "/api/v1/evidence/${encoded}", "/api/v1/psa-advisor/${encoded}"].every(value => opportunities.includes(value))],
  ["detail header keeps only core actions", opportunities.includes("Saved decisions") && opportunities.includes(">Track</a>") && !opportunities.includes("PSA guidance</a><a class=\"button button-secondary\" href=\"#/tracking")],
  ["save confirmation waits for the Card Intelligence hero", saveFlow.includes('const hero = main.querySelector(".customer-intelligence-hero")') && saveFlow.includes("if (!hero)" )],
  ["save confirmation is placed after the result hero", saveFlow.includes('hero.insertAdjacentElement("afterend", bar)')],
  ["duplicate coaching summary is hidden on Card Intelligence detail", flowCss.includes(".customer-intelligence-page .ff-decision-summary") && flowCss.includes("display:none!important")]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
