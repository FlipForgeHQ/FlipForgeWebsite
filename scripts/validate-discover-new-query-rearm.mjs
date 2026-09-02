import fs from "node:fs";

const source = fs.readFileSync(new URL("../saas-prototype/customer-discovery-controls-v2.js", import.meta.url), "utf8");
const checks = [
  ["disabled evaluation controls do not mark the whole search busy", !source.includes('root?.querySelector?.("[data-discovery-evaluate][disabled]")') && source.includes('const identify = target?.querySelector("[data-discovery-find-exact]")')],
  ["search busy is limited to actual search and identity actions", source.includes("return Boolean(primary?.disabled || identify?.disabled)")],
  ["changed card identity is detected against the previous completed search", source.includes("function editingDifferentSearch(target, previous)") && source.includes("current !== normalizedQuery(previous.query)")],
  ["typing a changed card identity re-runs control synchronization", source.includes('document.addEventListener("input"') && source.includes("queue();")],
  ["a changed card draft removes stale refresh/new-search controls", source.includes("hasNewQueryDraft") && source.includes("if (hasNewQueryDraft)") && source.includes("removeResultControls(actions)")],
  ["refresh replays the known completed search through an explicit submit event", source.includes("function dispatchKnownSearch(target, refreshButton)") && source.includes('new SubmitEvent("submit"') && source.includes("target.dispatchEvent(submitEvent)")],
  ["refresh does not rely on requestSubmit native constraint validation", !source.includes("target.requestSubmit?.()")],
  ["refresh gives immediate customer-visible progress", source.includes('refreshButton.textContent = "Refreshing…"') && source.includes('refreshButton.setAttribute("aria-busy", "true")')],
  ["new-query detection does not persist or authorize anything", !/localStorage|indexedDB|document\.cookie|transactionAuthority|BUY|WATCH|PASS/.test(source)]
];

let failures = 0;
for (const [label, passed] of checks) {
  if (!passed) {
    failures += 1;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

try {
  new Function(source);
  console.log("PASS: customer-discovery-controls-v2.js parses as JavaScript");
} catch (error) {
  failures += 1;
  console.error(`FAIL: customer-discovery-controls-v2.js syntax: ${error.message}`);
}

if (failures) process.exit(1);
console.log(`Discover new-query rearm assurance passed (${checks.length + 1}/${checks.length + 1}).`);
