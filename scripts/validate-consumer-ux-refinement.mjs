import fs from "node:fs";

const index = fs.readFileSync("saas-prototype/index.html", "utf8");
const ux = fs.readFileSync("saas-prototype/consumer-ux-refinement.js", "utf8");
const css = fs.readFileSync("saas-prototype/consumer-ux-refinement.css", "utf8");

const checks = [];
function expect(condition, label) {
  checks.push({ condition: Boolean(condition), label });
}

expect(index.includes("FlipForge | Card Intelligence"), "app title uses Card Intelligence");
expect(index.includes("FlipForge private-beta card intelligence platform."), "meta description uses Card Intelligence");
expect(index.includes("<span class=\"brand-subtitle\">CARD INTELLIGENCE</span>"), "brand subtitle uses Card Intelligence");
expect(!index.includes("CARD VALUE INTELLIGENCE"), "legacy Card Value Intelligence descriptor removed from app shell");
expect(index.includes('href="consumer-ux-refinement.css"'), "consumer UX stylesheet is mounted");
expect(index.includes('src="consumer-ux-refinement.js"'), "consumer UX script is mounted");

expect(ux.includes('"IDENTITY INTELLIGENCE"'), "CardSight vendor-facing heading is converted to product intelligence language");
expect(ux.includes('"PRO CARD INTELLIGENCE"'), "Forge Heat hero uses product intelligence language");
expect(ux.includes('["Tenant-owned saved intelligence", "SAVED CARD INTELLIGENCE"]'), "saved intelligence heading removes tenant engineering language");
expect(ux.includes('["SQLite saved", "Saved"]'), "customer status removes SQLite implementation language");
expect(ux.includes('["Tracked in SQLite", "Tracked"]'), "tracking status removes SQLite implementation language");
expect(ux.includes('"What this changes:"'), "identity boundary uses customer-safe language");
expect(ux.includes('"How this works:"'), "customer authority boundary uses customer-safe language");
expect(ux.includes('"We couldn\'t complete that request."'), "raw internal alert codes receive a customer-safe heading");
expect(ux.includes('"This intelligence view is temporarily unavailable. Try again."'), "technical diagnostics have a customer-safe error fallback");
expect(ux.includes('"Ranks your saved evaluations · Decision support only"'), "Forge Heat scope is concise and customer-safe");
expect(ux.includes("function setText"), "DOM copy writes are idempotent");
expect(ux.includes("let scheduled = false"), "mutation-driven refinement is requestAnimationFrame throttled");
expect(!ux.includes("fetch("), "refinement layer does not make API calls");
expect(!ux.includes("recommendation ="), "refinement layer does not mutate recommendation authority");
expect(!ux.includes("supportedValue ="), "refinement layer does not compute supported value");
expect(!ux.includes("heat ="), "refinement layer does not compute Forge Heat");

expect(css.includes(".consumer-state-empty"), "empty state receives dedicated visual treatment");
expect(css.includes(".consumer-state-loading"), "loading state receives dedicated visual treatment");
expect(css.includes(".consumer-state-error"), "error state receives dedicated visual treatment");
expect(css.includes("@media (prefers-reduced-motion: reduce)"), "loading treatment respects reduced motion");
expect(css.includes("@media (max-width: 640px)"), "customer states retain mobile treatment");

const failed = checks.filter(check => !check.condition);
for (const check of checks) console.log(`${check.condition ? "PASS" : "FAIL"} - ${check.label}`);
if (failed.length) {
  console.error(`Consumer UX refinement validation failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log(`Consumer UX refinement validation passed: ${checks.length} checks.`);
