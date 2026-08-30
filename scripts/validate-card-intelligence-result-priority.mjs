import fs from "node:fs";

const opportunities = fs.readFileSync(new URL("../saas-prototype/customer-opportunities.js", import.meta.url), "utf8");
const saveFlow = fs.readFileSync(new URL("../saas-prototype/customer-save-flow-v1.js", import.meta.url), "utf8");
const flowCss = fs.readFileSync(new URL("../saas-prototype/beta-customer-flow-v2.css", import.meta.url), "utf8");
const clarity = fs.readFileSync(new URL("../saas-prototype/customer-decision-clarity-v1.js", import.meta.url), "utf8");
const clarityCss = fs.readFileSync(new URL("../saas-prototype/customer-decision-clarity-v1.css", import.meta.url), "utf8");
const firstValue = fs.readFileSync(new URL("../saas-prototype/customer-first-value-v1.js", import.meta.url), "utf8");
const firstValueCss = fs.readFileSync(new URL("../saas-prototype/customer-first-value-v1.css", import.meta.url), "utf8");
const scrollReset = fs.readFileSync(new URL("../saas-prototype/scroll-reset.js", import.meta.url), "utf8");
const prototypeLoader = fs.readFileSync(new URL("../saas-prototype/prototype-visual-loader.js", import.meta.url), "utf8");

const checks = [
  ["saved detail has a direct detail fast path", opportunities.includes("async function loadDetailDirect()")],
  ["saved detail chooses direct path before list loading", opportunities.includes("if (state.requestedId) await loadDetailDirect();")],
  ["detail fast path loads decision evidence and PSA", ["/api/v1/opportunities/${encoded}", "/api/v1/evidence/${encoded}", "/api/v1/psa-advisor/${encoded}"].every(value => opportunities.includes(value))],
  ["detail header keeps only core actions", opportunities.includes("Saved decisions") && opportunities.includes(">Track</a>") && !opportunities.includes("PSA guidance</a><a class=\"button button-secondary\" href=\"#/tracking")],
  ["save confirmation waits for the Card Intelligence hero", saveFlow.includes('const hero = main.querySelector(".customer-intelligence-hero")') && saveFlow.includes("if (!hero)" )],
  ["save confirmation is placed after the result hero", saveFlow.includes('hero.insertAdjacentElement("afterend", bar)')],
  ["duplicate coaching summary is hidden on Card Intelligence detail", flowCss.includes(".customer-intelligence-page .ff-decision-summary") && flowCss.includes("display:none!important")],
  ["decision clarity is wired through a production-safe shell utility", scrollReset.includes("loadDecisionClarityAssets();") && scrollReset.includes("customer-decision-clarity-v1.js") && scrollReset.includes("customer-decision-clarity-v1.css")],
  ["first-value clarity is wired through the same production-safe shell utility", scrollReset.includes("loadFirstValueAssets();") && scrollReset.includes("customer-first-value-v1.js") && scrollReset.includes("customer-first-value-v1.css")],
  ["prototype visual loader remains production-isolated", prototypeLoader.includes("if (production) return;") && !prototypeLoader.includes("customer-decision-clarity") && !prototypeLoader.includes("customer-first-value")],
  ["decision clarity is presentation only", !clarity.includes("fetch(") && !clarity.includes("XMLHttpRequest") && clarity.includes("No browser-side scoring")],
  ["first-value layer is presentation only", !firstValue.includes("fetch(") && !firstValue.includes("XMLHttpRequest") && !firstValue.includes("/api/")],
  ["decision clarity defines plain-language BUY WATCH VERIFY PASS meanings", ["BUY:", "WATCH:", "VERIFY:", "PASS:"].every(value => clarity.includes(value))],
  ["first-value layer uses the same BUY WATCH VERIFY PASS meanings", ["BUY:", "WATCH:", "VERIFY:", "PASS:"].every(value => firstValue.includes(value))],
  ["decision clarity follows decision value risk why evidence hierarchy", ["Why FlipForge says", "Supported value", "Risk", "View evidence", "Decision details"].every(value => clarity.includes(value))],
  ["raw Card Intelligence metrics are progressively disclosed", clarity.includes("More decision detail") && clarity.includes("Confidence, liquidity, risk score and rank")],
  ["Evaluate is reduced to card cost decision first-value flow", ["Confirm the exact card and listing", "Enter your real all-in cost", "Review and get the decision", "Get FlipForge decision"].every(value => firstValue.includes(value))],
  ["Evaluate result leads with decision supported value cost risk why and next action", ["Your FlipForge decision", "Supported value", "All-in cost", "Risk", "Why", "What to do next"].every(value => firstValue.includes(value))],
  ["Evaluate raw result detail is progressively disclosed", firstValue.includes("data-ff-evaluate-result-details") && firstValue.includes("Raw scores, workflow status, requirements and authority notes")],
  ["Getting Started reduces first use to one four-step decision loop", ["Find the exact card", "Confirm the listing and real cost", "Read Decision → Value → Risk → Why", "Open the evidence"].every(value => firstValue.includes(value))],
  ["advanced beta tools move behind progressive disclosure", firstValue.includes("Explore advanced tools after your first decision") && firstValue.includes("data-ff-advanced-journey")],
  ["beta comprehension check asks the three required questions", ["What does FlipForge recommend?", "Why did it reach that decision?", "What would you do next?"].every(value => firstValue.includes(value))],
  ["beta feedback prompt captures comprehension without a new data contract", firstValue.includes("What decision did you see, why did FlipForge give it, and what would you do next?")],
  ["global decision key makes decision language consistently available", firstValue.includes("What do BUY / WATCH / VERIFY / PASS mean?") && firstValue.includes("data-ff-decision-key")],
  ["locked brand line uses exact capitalization", clarity.includes("Before you buy. Know Why.")],
  ["clarity layouts are responsive", clarityCss.includes("@media (max-width: 900px)") && clarityCss.includes("@media (max-width: 650px)") && firstValueCss.includes("@media (max-width: 900px)") && firstValueCss.includes("@media (max-width: 720px)")]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);