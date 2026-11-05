import fs from "node:fs";

// "Refresh results" / "New search" are rendered by the Discover owner (customer-discovery.js) since Nov 3 2026; the
// customer-discovery-controls-v2.js layer that added them after each render was removed.
const source = fs.readFileSync(new URL("../saas-prototype/customer-discovery.js", import.meta.url), "utf8");
const retired = !fs.existsSync(new URL("../saas-prototype/customer-discovery-controls-v2.js", import.meta.url));
const controls = source.slice(source.indexOf("function resultControlsAvailable()"), source.indexOf("function refreshResults()"));
const checks = [
  ["the result-controls layer is gone", retired],
  ["controls follow a search that returned results, not an error or an identity check", source.includes("return Boolean(state.data && !state.error && !state.identityAssist.active && state.lastSearch);")],
  ["search busy is limited to actual search and identity actions", controls.includes('const disabled = state.loading || state.identityAssist.busy ? " disabled" : "";') && !controls.includes("evaluatingIndex")],
  ["changed card identity is detected against the previous completed search", source.includes("function draftDiffersFromLastSearch()") && source.includes("current !== normalizeIdentityQuery(state.lastSearch.exactCardQuery)")],
  ["typing a changed card identity re-runs control synchronization", source.includes('identityInput?.addEventListener("input"') && source.includes("syncResultControls(form);")],
  ["a changed card draft removes stale refresh/new-search controls", controls.includes("if (!resultControlsAvailable() || draftDiffersFromLastSearch()) return \"\";") && controls.includes("button.remove()")],
  ["refresh replays the known completed search through the owner's search", source.includes("function refreshResults()") && source.includes('set("exactCardQuery", previous.exactCardQuery);') && /set\("limit", previous\.limit\);\s*search\(form\);/.test(source)],
  ["refresh does not rely on requestSubmit native constraint validation", !source.includes("requestSubmit")],
  ["new search clears the Discover workspace without reloading the page", source.includes('bindResultControls(state.main);') && source.includes('?.addEventListener("click", startNewCard)') && !source.includes("location.reload")],
  ["the last search is kept only in memory", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(controls) && source.includes("state.lastSearch = { exactCardQuery: draft.exactCardQuery")]
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
  console.log("PASS: customer-discovery.js parses as JavaScript");
} catch (error) {
  failures += 1;
  console.error(`FAIL: customer-discovery.js syntax: ${error.message}`);
}

if (failures) process.exit(1);
console.log(`Discover new-query rearm assurance passed (${checks.length + 1}/${checks.length + 1}).`);
