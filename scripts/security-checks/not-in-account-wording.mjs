// A saved decision that is not in the signed-in account must be explained in plain customer wording.
//
// When a customer opens a saved-decision, tracking, evidence or export link that is not theirs, the gateway answers
// 404 RESOURCE_NOT_FOUND (or the id is not in the account's list). The app must show one calm message with a way back
// to Saved Decisions, and never internal terms such as "tenant" or "lifecycle record". Wording only: authorization is
// decided by the server and is not changed by these files.
import fs from "node:fs";
import vm from "node:vm";

const failures = [];
const passes = [];
const check = (condition, message) => (condition ? passes : failures).push(message);

const HEADING = "This decision isn’t in your account";
const BODY = "It may belong to a different account, or the link may be out of date. Open Saved Decisions to see your own decisions.";
const INTERNAL_TERMS = /tenant|lifecycle record|browser-only|failed closed|contract|RESOURCE_NOT_FOUND|record was not returned/i;

const MODULES = [
  { file: "saas-prototype/customer-lifecycle.js", route: "Tracking" },
  { file: "saas-prototype/customer-management.js", route: "Evidence / PSA / Portfolio" },
  { file: "saas-prototype/customer-export.js", route: "Decision Dossier" },
  { file: "saas-prototype/customer-opportunities.js", route: "Saved decision" },
];

function extract(source, name) {
  const start = source.indexOf(`  function ${name}(`);
  if (start < 0) return null;
  const end = source.indexOf("\n  }\n", start);
  return end < 0 ? null : source.slice(start, end + 4);
}

function visibleText(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

for (const { file, route } of MODULES) {
  const source = fs.readFileSync(file, "utf8");
  const notInAccount = extract(source, "notInAccount");
  const panel = extract(source, "notInAccountPanel");
  check(Boolean(notInAccount && panel), `${route}: not-in-account helpers present (${file})`);
  if (!notInAccount || !panel) continue;
  const sandbox = vm.runInNewContext(`${notInAccount}\n${panel}\n({ notInAccount, notInAccountPanel })`);
  const html = sandbox.notInAccountPanel();
  const text = visibleText(html);
  check(sandbox.notInAccount({ code: "RESOURCE_NOT_FOUND", status: 404 }) === true, `${route}: RESOURCE_NOT_FOUND is treated as not in this account`);
  check(sandbox.notInAccount({ code: "SERVICE_UNAVAILABLE", status: 503 }) === false && sandbox.notInAccount({ status: 401 }) === false,
    `${route}: outages and sign-in errors keep their own messages`);
  check(text.includes(HEADING) && text.includes(BODY), `${route}: plain heading and body`);
  check(/href="#\/opportunities"/.test(html) && text.includes("Open Saved Decisions"), `${route}: offers a way back to Saved Decisions`);
  check(!INTERNAL_TERMS.test(text), `${route}: no internal terms in the customer message`);
  check(/notInAccount\(state\.error\)|notInAccount\(error\)/.test(source.replace(panel, "").replace(notInAccount, "")),
    `${route}: the error view uses the not-in-account message`);
}

// No customer-reachable string may describe a missing decision in internal terms.
for (const file of fs.readdirSync("saas-prototype").filter(name => name.endsWith(".js")).map(name => `saas-prototype/${name}`)) {
  const source = fs.readFileSync(file, "utf8");
  check(!/not returned for this tenant/i.test(source), `${file}: no "not returned for this tenant" wording`);
}

console.log("NotInAccountWordingValidation");
for (const failure of failures) console.error(`FAIL | ${failure}`);
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) process.exitCode = 1;
