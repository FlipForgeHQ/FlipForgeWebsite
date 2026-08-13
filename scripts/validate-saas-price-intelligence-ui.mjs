import fs from "node:fs";

const html = fs.readFileSync("saas-prototype/index.html", "utf8");
const js = fs.readFileSync("saas-prototype/price-intelligence.js", "utf8");
const css = fs.readFileSync("saas-prototype/price-intelligence.css", "utf8");

const checks = [
  ["price intelligence stylesheet is loaded", html.includes('href="price-intelligence.css"')],
  ["price intelligence script is loaded", html.includes('src="price-intelligence.js"')],
  ["script loads before customer opportunity fetch begins", html.indexOf('src="price-intelligence.js"') < html.indexOf('src="customer-opportunities.js"')],
  ["opportunity detail API is observed", js.includes('/^\\/api\\/v1\\/opportunities\\/([^/?#]+)$/')],
  ["server sibling priceIntelligence is required", js.includes("data?.priceIntelligence") && js.includes("data?.opportunity")],
  ["normalizer receives saved opportunity and sibling intelligence", js.includes("normalizePriceIntelligence(opportunity, raw)")],
  ["WATCH threshold is displayed", js.includes("watchAtOrBelowCents") && js.includes("WATCH at or below")],
  ["BUY threshold is displayed", js.includes("buyAtOrBelowCents") && js.includes("BUY at or below")],
  ["full decision ladder is rendered", js.includes("price-intelligence-ladder") && js.includes("derivedByReevaluation")],
  ["read-only server contract is enforced", js.includes("raw.readOnly !== true") && js.includes("raw.canonicalWritesPerformed !== false")],
  ["evaluation quota isolation is enforced", js.includes("raw.evaluationQuotaConsumed !== false")],
  ["outcome and lifecycle isolation are enforced", js.includes("raw.outcomeLedgerMutation !== false") && js.includes("raw.customerLifecycleMutation !== false")],
  ["transaction authority stays false", js.includes("raw.transactionAuthority !== false")],
  ["VERIFY no-price-fix state is explained", js.includes('snapshot.currentRecommendation === "VERIFY"') && js.includes("Price alone cannot repair")],
  ["no threshold fabrication is disclosed", js.includes("FlipForge does not invent a threshold")],
  ["panel has an accessibility label", js.includes('aria-label="Counterfactual price intelligence"')],
  ["responsive price grid exists", css.includes("@media (max-width: 760px)") && css.includes("grid-template-columns: 1fr")]
];

let failed = 0;
for (const [label, passed] of checks) {
  if (passed) console.log(`PASS: ${label}`);
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log(`SaaS Price Intelligence UI validation: ${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
