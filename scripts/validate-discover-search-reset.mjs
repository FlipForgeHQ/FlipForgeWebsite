import fs from "node:fs";

const source = fs.readFileSync(new URL("../saas-prototype/customer-discovery.js", import.meta.url), "utf8");

const checks = [
  ["successful candidate searches clear the exact-card input", 'state.draft = { exactCardQuery: "", targetMaxBuy: "", limit: String(draft.limit) };'],
  ["the reset only happens when candidates were returned", "if (state.data.candidateCount > 0)"],
  ["the selected result limit is preserved", 'limit: String(draft.limit)'],
  ["submitted values are retained before the request for retry/error correction", 'state.draft = { exactCardQuery: draft.exactCardQuery, targetMaxBuy: draft.targetMaxBuy, limit: String(draft.limit) };']
];

let failures = 0;
for (const [label, needle] of checks) {
  if (!source.includes(needle)) {
    failures += 1;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

try {
  new Function(source);
  console.log("PASS: customer-discovery.js parses as JavaScript");
} catch (error) {
  failures += 1;
  console.error(`FAIL: customer-discovery.js syntax: ${error.message}`);
}

if (failures) process.exit(1);
console.log(`Discover search reset assurance passed (${checks.length + 1}/${checks.length + 1}).`);
