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
check(
  "Audit standard owns instruction hierarchy and redundancy rules",
  standard.includes("Instruction ownership and redundancy")
    && standard.includes("one persistent instruction owner")
    && standard.includes("nested emphasis")
);

console.log(`\nCustomer UX Redundancy / Hierarchy Audit\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failures.length) failures.forEach(item => console.error(` - ${item}`));
if (failed > 0) process.exit(1);
