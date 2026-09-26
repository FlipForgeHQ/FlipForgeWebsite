import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const css = read("saas-prototype/discover-card-entry-emphasis-v1.css");
const entry = read("saas-prototype/discover-card-entry-emphasis-v1.js");
const focus = read("saas-prototype/guided-discover-focus-fix-v1.js");
const guide = read("saas-prototype/guided-mode-v1.js");
const discovery = read("saas-prototype/customer-discovery.js");
const standard = read("docs/CUSTOMER_APP_AUDIT_STANDARD.md");
const firstValue = read("saas-prototype/customer-first-value-v1.js");
const decisionClarity = read("saas-prototype/customer-decision-clarity-v1.js");
const cdi = read("saas-prototype/customer-cdi-signal-stack-v1.js");
const whyView = read("saas-prototype/customer-why-decision-view-v1.js");
const lifecycle = read("saas-prototype/customer-lifecycle.js");
const management = read("saas-prototype/customer-management.js");
const portfolio = read("saas-prototype/customer-portfolio.js");
const compare = read("saas-prototype/customer-compare.js");
const psa = read("saas-prototype/customer-psa-advisor.js");
const marketView = read("saas-prototype/customer-market-view.js");
const forgeHeat = read("saas-prototype/customer-forge-heat.js");
const savedBridge = read("saas-prototype/customer-opportunities-bridge.js");

let passed = 0;
let failed = 0;
const failures = [];
const check = (name, condition, detail = "") => {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`);
  if (ok) passed += 1;
  else { failed += 1; failures.push(detail ? `${name}: ${detail}` : name); }
};

const forbiddenVisiblePrompts = [
  "START HERE · ENTER YOUR CARD",
  "TYPE YOUR CARD HERE",
  "CARD IDENTITY — ENTER THE CARD YOU WANT TO EVALUATE"
];

for (const phrase of forbiddenVisiblePrompts) {
  check(
    `duplicate entry prompt removed: ${phrase}`,
    !css.includes(phrase) && !entry.includes(phrase) && !focus.includes(phrase) && !guide.includes(phrase)
  );
}

check(
  "Discover does not create instructional pseudo-content above the search panel",
  !/\.customer-discovery-search::before\s*\{[\s\S]*?content\s*:/m.test(css)
);
check(
  "Card label does not add a numbered pseudo-badge",
  !/label:has\(input\[name="exactCardQuery"\]\)\s*>\s*span::before/m.test(css)
);
check(
  "Card field wrapper is not a second gold callout container",
  /label:has\(input\[name="exactCardQuery"\]\)\{[\s\S]*?border:0;[\s\S]*?background:transparent;/m.test(css)
);
check(
  "Card input default state stays visually neutral",
  css.includes('border:1px solid rgba(255,255,255,.18)!important;')
);
check(
  "Gold emphasis is reserved for card-input focus",
  css.includes('.customer-discovery-form input[name="exactCardQuery"]:focus')
    && css.includes('border-color:#f0ca58!important;')
);
check(
  "Guided focus does not inject another instruction banner",
  !focus.includes("HINT_ID")
    && !focus.includes("hint.innerHTML")
    && !focus.includes("ff-discover-direct-form")
);
check(
  "Guided focus highlights only the actual input",
  focus.includes(".ff-discover-direct-input")
    && focus.includes('input.classList.add("ff-discover-direct-input")')
);
check(
  "Guided Mode provides secondary identity help instead of repeating primary entry instructions",
  guide.includes("IDENTITY HELP")
    && guide.includes("Not sure which card you have?")
    && guide.includes("Find exact card")
    && !guide.includes("<span>START HERE</span><h2>Enter one exact card.</h2>")
);

const searchPanelStart = discovery.indexOf("function searchPanel()");
const searchPanelEnd = discovery.indexOf("function identityCandidate", searchPanelStart);
const searchPanel = searchPanelStart >= 0 && searchPanelEnd > searchPanelStart
  ? discovery.slice(searchPanelStart, searchPanelEnd)
  : "";

check("Discover has one canonical Card label", (searchPanel.match(/<span>Card<\/span>/g) || []).length === 1);
check("Discover has one exact-card entry input", (searchPanel.match(/name="exactCardQuery"/g) || []).length === 1);
check("Discover primary action is Search active listings", searchPanel.includes('"Search active listings"'));
check("Find exact card remains visibly secondary", searchPanel.includes('class="button button-secondary"') && searchPanel.includes(">Find exact card</button>"));
check("Detailed notation help is progressively disclosed", searchPanel.includes("<details class=\"customer-discovery-search-help\"><summary>How card entry works</summary>"));
check(
  "Decorator preserves concise Card label after rerenders",
  entry.includes('labelText.textContent !== "Card"')
    && entry.includes('labelText.textContent = "Card";')
);
check(
  "Format guidance is concise and non-duplicative",
  entry.includes("Year · Set · Player · Card # · Grade (when known).")
);

// Evaluate
check("Evaluate does not add a second three-step strip above the form", !firstValue.includes("installEvaluateFlow(root);"));
check("Evaluate does not show the decision glossary before a decision exists", !firstValue.includes('["dashboard", "discover", "tracking", "forge-heat", "evaluate"]'));
check("Evaluate panel uses a distinct Card and listing details heading", firstValue.includes('Card and listing details'));
check("Evaluate removes the duplicate panel intro and status badge", firstValue.includes('panel.querySelector(".panel-header p")?.remove()') && firstValue.includes('panel.querySelector(".panel-header .staging-status")?.remove()'));
check("Evaluate removes technical idempotency prose from the customer form", firstValue.includes('form.querySelector(".staging-form-note")?.remove()'));
check("Evaluate keeps one governed trust disclosure", firstValue.includes("How FlipForge protects this decision"));

// Decision Intelligence / Saved Decision
check("CDI explanation CTA does not repeat START HERE", !cdi.includes("<span>START HERE</span><strong>Show me why"));
check("CDI explanation uses one concise reason-trail caption", cdi.includes("Four checks behind this decision."));
check("Saved Decision never renders both legacy Why and CDI Why owners", decisionClarity.includes('const interactiveWhy = root.querySelector("[data-ff-cdi-stack], [data-ff-cdi-stack-host]")') && decisionClarity.includes('root.querySelector("[data-ff-decision-why]")?.remove()'));
check("Why This Decision suppresses duplicate full Decision Intelligence chrome", whyView.includes(".ff-di-controls") && whyView.includes(".ff-di-grid") && whyView.includes("display: none !important"));
check("Why This Decision routes deeper evidence separately", whyView.includes("Open Evidence Review"));

// Evidence / Outcomes / Saved list
check("Evidence education is one progressive disclosure, not three coaching cards", cdi.includes('const guide = document.createElement("details")') && cdi.includes("How FlipForge filters evidence") && !cdi.includes("01 · TRUSTED"));
check("Saved Decisions list does not add a redundant reopen-instruction strip", cdi.includes('document.querySelector("#main-content [data-ff-cdi-returning]")') && cdi.includes("root?.remove()"));
check("Outcome Intelligence keeps checkpoints without a duplicate mini-hero", cdi.includes("ff-cdi-outcome-flow") && !cdi.includes("<header><span>OUTCOME INTELLIGENCE</span>"));
check("Lifecycle authority notes are progressive disclosures", lifecycle.includes('<details class="boundary-note ff-trust-note"><summary>How this stays governed</summary>'));
check("Evidence and management authority notes are progressive disclosures", management.includes('<details class="boundary-note ff-trust-note"><summary>How this stays governed</summary>'));

// Portfolio / Compare / PSA / Market / Heat
check("Portfolio value boundary is progressively disclosed", portfolio.includes('<details class="boundary-note ff-trust-note"><summary>What this value means</summary>'));
check("Compare removes duplicate persistent top boundary", !compare.includes('<div class="boundary-note"><strong>Customer boundary:'));
check("Compare retains one dedicated no-new-recommendation boundary", compare.includes("No new recommendation") && compare.includes("customer-compare-boundary"));
check("PSA Advisor removes duplicate persistent top framework banner", !psa.includes('<div class="boundary-note"><strong>Decision framework:'));
check("PSA Advisor retains saved-snapshot boundary detail", psa.includes("<strong>PSA boundary:</strong>"));
check("Market View authority copy is progressively disclosed", marketView.includes('<details class="market-view-boundary ff-trust-note"><summary>How Market View stays governed</summary>'));
check("Forge Heat qualification mechanics are progressively disclosed", forgeHeat.includes('<details class="forge-heat-intelligence-bar ff-trust-note">') && forgeHeat.includes("How a card becomes Heat-eligible"));
check("Saved Decisions recovery diagnostics are progressively disclosed", savedBridge.includes('<details class="boundary-note ff-trust-note"><summary>Recovery details</summary>'));

check(
  "Audit standard owns instruction hierarchy and redundancy rules",
  standard.includes("Instruction ownership and redundancy")
    && standard.includes("one persistent instruction owner")
    && standard.includes("nested emphasis")
);

console.log(`\nCustomer UX Redundancy / Hierarchy Audit\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failures.length) failures.forEach(item => console.error(` - ${item}`));
if (failed > 0) process.exit(1);
