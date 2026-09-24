import fs from "node:fs";
import path from "node:path";

// Integrated customer-surface CDI presentation gate.
const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const customer = read("saas-prototype/customer.html");
const index = read("saas-prototype/index.html");
const js = read("saas-prototype/customer-cdi-signal-stack-v1.js");
const css = read("saas-prototype/customer-cdi-signal-stack-v1.css");

let passed = 0;
const failures = [];
function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log("PASS | " + label);
  } else {
    failures.push(label);
    console.error("FAIL | " + label);
  }
}

try {
  new Function(js);
  check("001 customer CDI Signal Stack JavaScript parses", true);
} catch (error) {
  check("001 customer CDI Signal Stack JavaScript parses (" + error.message + ")", false);
}

for (const [name, html] of [["canonical customer shell", customer], ["prototype shell", index]]) {
  check("002 " + name + " loads customer CDI stylesheet", html.includes('href="customer-cdi-signal-stack-v1.css"'));
  check("003 " + name + " loads customer CDI runtime", html.includes('src="customer-cdi-signal-stack-v1.js"'));
  check("004 " + name + " loads CDI runtime after UX v2", html.indexOf('src="customer-cdi-signal-stack-v1.js"') > html.indexOf('src="decision-intelligence-ux-v2.js"'));
}

check("005 four plain-language checks are explicit", ["Exact card","Trustworthy sales","Price check","Uncertainty"].every(item => js.includes(item)));
check("006 plain verdicts cover every governed decision state", ["Buy looks supported","Watch this one","Verify before acting","Pass at this price"].every(item => js.includes(item)));
check("007 raw BUY WATCH VERIFY PASS status remains visible as metadata", ["BUY","WATCH","VERIFY","PASS"].every(item => js.includes(item)) && js.includes("Decision engine · Smart Opportunity"));
check("008 primary teaching CTA is explicit", js.includes("Show me why FlipForge said ") && js.includes("Watch the 4 checks assemble · about 3 seconds"));
check("009 signal reveal uses approved 340ms stagger", js.includes("const STAGGER_MS = 340"));
check("010 reduced-motion path completes without staged animation", js.includes('prefers-reduced-motion: reduce') && js.includes("rows.forEach(row => row.classList.add"));
check("011 presentation layer performs no network activity", !/fetch\s*\(|XMLHttpRequest|WebSocket/i.test(js));
check("012 presentation layer introduces no browser persistence", !/localStorage|sessionStorage|indexedDB/i.test(js));
check("013 presentation layer does not assign recommendation authority", !/recommendation\s*=|authorityEligible\s*=\s*true|supportedValue\s*=/i.test(js));
check("014 real Decision Intelligence route is covered", js.includes('parts[0] === "decision-intelligence"'));
check("015 saved Decision detail route is covered", js.includes('parts[0] === "opportunities" && parts[1]'));
check("016 returning Saved Decisions route is covered", js.includes('parts[0] !== "opportunities" || parts[1]'));
check("017 Evidence detail gets plain-language orientation", js.includes("Check trustworthy sales") && js.includes("what FlipForge could use, what it excluded"));
check("018 full evidence stays on native route", js.includes("#/evidence/") && js.includes("Open full evidence"));
check("019 existing Decision Receipt is opened rather than rebuilt", js.includes("[data-ff-decision-receipt]") && !js.includes("SERVER-OWNED RECORD"));
check("020 deeper detail uses progressive disclosure", js.includes("Full evidence & Decision Receipt") && js.includes("Full evidence & saved decision detail"));
check("021 tablet/mobile rules exist", css.includes("@media (max-width:760px)") && css.includes("@media (max-width:480px)"));
check("022 reduced-motion CSS exists", css.includes("@media (prefers-reduced-motion:reduce)"));
check("023 primary meaning stays white with gold accent", css.includes("color:#fff") && css.includes("color:#d4af37"));
check("024 no theatrical headline sizing is introduced", !/font-size\s*:\s*(?:[5-9]\d|[1-9]\d{2,})px/i.test(css));
check("025 real-data signal visuals cover exact card sales price and uncertainty", ["ff-cdi-visual-exact","ff-cdi-visual-sales","ff-cdi-visual-price","ff-cdi-visual-uncertainty"].every(item => js.includes(item) && css.includes(item)));
check("026 price visual consumes returned ask/support rather than fake time series", js.includes("moneyFromText") && js.includes("signal.ask") && js.includes("signal.supported") && !js.includes("sparkline"));
check("027 evidence visual distinguishes accepted and excluded rows", js.includes("signal.accepted") && js.includes("signal.excluded") && css.includes(".ff-cdi-visual-sales .is-kept") && css.includes(".ff-cdi-visual-sales .is-out"));
check("028 uncertainty visual uses returned confidence and risk", js.includes("signal.confidence") && js.includes("signal.risk") && css.includes("--confidence") && css.includes("--risk"));
check("029 mobile keeps signal visuals visible", css.includes("@media (max-width:480px)") && css.includes(".ff-cdi-visual{display:grid") && !css.includes(".ff-cdi-visual{display:none"));
check("030 Outcome Intelligence receives T0 T7 T14 T30 continuity", js.includes("data-ff-cdi-outcome-guide") && ["T0","T7","T14","T30"].every(item => js.includes(item)));
check("031 returning Home language points back to saved reasoning", js.includes("Open a card to see the verdict and replay its four checks.") && js.includes("See what changed after the original T0 decision."));
check("032 reasoning stack stays collapsed until the customer asks for it", js.includes('data-ff-cdi-reasoning hidden') && css.includes(".ff-cdi-reasoning[hidden]{display:none!important}"));
check("033 Decision Receipt handoff uses existing receipt and a presentation-only arrival cue", js.includes("ff-cdi-receipt-arrival") && css.includes("@keyframes ff-cdi-receipt-arrival") && js.includes("[data-ff-decision-receipt]"));

console.log("PASSED: " + passed);
console.log("FAILED: " + failures.length);
if (failures.length) {
  failures.forEach(item => console.error("  - " + item));
  process.exit(1);
}