import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const index = read("saas-prototype/index.html");
const js = read("saas-prototype/decision-intelligence-ux-v2.js");
const css = read("saas-prototype/decision-intelligence-ux-v2.css");

let passed = 0;
const failures = [];
function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS | ${label}`);
  } else {
    failures.push(label);
    console.error(`FAIL | ${label}`);
  }
}

try {
  // Parse only; do not execute the browser module in Node.
  new Function(js);
  check("001 UX v2 JavaScript parses", true);
} catch (error) {
  check(`001 UX v2 JavaScript parses (${error.message})`, false);
}

const decisionNav = '<a href="#/decision-intelligence" data-route="decision-intelligence" data-ff-customer-core>';
const advancedStart = index.indexOf('<details class="ff-advanced-nav">');
const advancedEnd = index.indexOf("</details>", advancedStart);
const advanced = advancedStart >= 0 && advancedEnd > advancedStart
  ? index.slice(advancedStart, advancedEnd)
  : "";

check("002 Decision Intelligence is primary navigation", index.includes(decisionNav));
check("003 Decision Intelligence precedes Saved Decisions", index.indexOf(decisionNav) < index.indexOf('href="#/opportunities"'));
check("004 Decision Intelligence is removed from Advanced analysis", !advanced.includes('data-route="decision-intelligence"'));
check("005 UX v2 stylesheet is loaded", index.includes('href="decision-intelligence-ux-v2.css"'));
check("006 UX v2 runtime is loaded", index.includes('src="decision-intelligence-ux-v2.js"'));
check("007 UX v2 loads after existing Decision Intelligence polish", index.indexOf('src="decision-intelligence-ux-v2.js"') > index.indexOf('src="decision-intelligence-final-polish-v1.js"'));

check("008 runtime reads server-owned opportunity detail", js.includes('/api/v1/opportunities/${encoded}'));
check("009 runtime reads server-owned evidence", js.includes('/api/v1/evidence/${encoded}'));
check("010 runtime validates Smart Opportunity authority", js.includes('meta.authority !== "Smart Opportunity"'));
check("011 runtime validates PSA authority", js.includes('meta.gradingAuthority !== "Existing PSA intelligence"'));
check("012 runtime uses GET only", js.includes('method: "GET"') && !/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i.test(js));
check("013 runtime introduces no browser persistence", !/\blocalStorage\b|\bsessionStorage\b/.test(js));
check("014 runtime consumes authorityEligible instead of accepting evidence", js.includes("authorityEligible") && !/\.accepted\s*=|authorityEligible\s*=\s*true/.test(js));
check("015 runtime consumes server rejectionReason", js.includes("rejectionReason"));
check("016 Evidence Integrity is first-class copy", js.includes("EVIDENCE INTEGRITY") && js.includes("What FlipForge trusted — and rejected"));
check("017 Decision Receipt is present", js.includes("Decision Receipt"));
check("018 what-changes guidance is present", js.includes("WHAT CHANGES THIS DECISION?"));
check("019 supported value can be explicitly withheld", js.includes('"WITHHELD"') && js.includes('"Withheld"'));
check("020 evidence trail links to native evidence route", js.includes('href="#/evidence/${encodeURIComponent(state.activeId)}"'));
check("021 preview remains explicitly non-authoritative", js.includes("Preview mode demonstrates the Decision Intelligence layout only"));
check("022 CSS has decision-specific verdict tones", css.includes('[data-decision="BUY"]') && css.includes('[data-decision="VERIFY"]') && css.includes('[data-decision="PASS"]'));
check("023 CSS includes tablet responsiveness", css.includes("@media (max-width: 1020px)"));
check("024 CSS includes phone responsiveness", css.includes("@media (max-width: 640px)"));

console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) {
  failures.forEach(item => console.error(`  - ${item}`));
  process.exit(1);
}
