import fs from "node:fs";

const source = fs.readFileSync("saas-prototype/customer-card-intelligence.js", "utf8");
const css = fs.readFileSync("saas-prototype/customer-card-intelligence.css", "utf8");
const results = [];
const check = (condition, label) => {
  results.push(Boolean(condition));
  console.log(`${condition ? "PASS" : "FAIL"}: ${label}`);
};

check(source.includes("/api/v1/card-intelligence/search"), "Card Finder uses FlipForge search route");
check(source.includes("/api/v1/card-intelligence/detect"), "photo preflight uses FlipForge detect route");
check(source.includes("/api/v1/card-intelligence/identify"), "photo identification uses FlipForge identify route");
check(source.includes("/api/v1/card-intelligence/resolve"), "identity resolution uses FlipForge resolve route");
check(!source.includes("https://api.cardsight.ai"), "browser never calls CardSight directly");
check(!source.includes("X-API-Key"), "browser contains no CardSight API-key header");
check(source.includes("MAX_IMAGE_BYTES = 4_000_000"), "browser enforces four-megabyte image cap");
check(source.includes("image/jpeg") && source.includes("image/png") && source.includes("image/webp"),
  "browser limits photos to JPEG PNG and WebP");
check(source.includes("deploy-preview-\\d+--goflipforge\\.netlify\\.app"), "feature is deploy-preview gated");
check(source.includes('meta.authority === "Smart Opportunity"'), "Smart Opportunity authority required");
check(source.includes('meta.gradingAuthority === "Existing PSA intelligence"'), "PSA grading authority required");
check(source.includes("data.transactionAuthority === false"), "transaction authority must be false");
check(source.includes("data.providerIdentifierExposed === false"), "provider identifiers must stay server-side");
check(source.includes("data.rawProviderPayloadExposed === false"), "raw provider payload must stay server-side");
check(source.includes("data.soldEvidenceAccepted === false"), "identity assist cannot accept sold evidence");
check(source.includes("data.smartOpportunityRecalculated === false"), "identity assist cannot recalculate Smart Opportunity");
check(source.includes('[name="cardIdentity"]'), "resolved identity targets existing evaluation identity field");
check(!source.includes("/api/v1/evaluations"), "identity assist does not submit an evaluation");
check(source.includes('dispatchEvent(new Event("input"') && source.includes('dispatchEvent(new Event("change"'),
  "resolved identity uses normal form events");
check(source.includes("Provider IDs and raw CardSight responses stay server-side"), "customer identity boundary is visible");
check(css.includes("@media (max-width: 720px)"), "mobile layout is defined");
check(css.includes(".card-intelligence-result"), "identity-result styling exists");


const shell = fs.readFileSync("saas-prototype/index.html", "utf8");
const routeHook = fs.readFileSync("saas-prototype/staging-route-hook.js", "utf8");
const gateway = fs.readFileSync("netlify/functions/flipforge-api.js", "utf8");
check(shell.includes('href="customer-card-intelligence.css"'), "customer Card Intelligence stylesheet is loaded");
check(shell.includes('src="customer-card-intelligence.js"'), "customer Card Intelligence script is loaded");
check(routeHook.includes("FlipForgeCustomerCardIntelligence"), "route hook discovers Card Intelligence adapter");
check(routeHook.includes("cardIntelligenceAdapter.mount(main)"), "Evaluate route mounts Card Intelligence assistant");
check(gateway.includes("/api\\/v1\\/card-intelligence\\/search"), "gateway allows Card Intelligence search");
check(gateway.includes("/api\\/v1\\/card-intelligence\\/detect"), "gateway allows Card Intelligence detection");
check(gateway.includes("/api\\/v1\\/card-intelligence\\/identify"), "gateway allows Card Intelligence identification");
check(gateway.includes("/api\\/v1\\/card-intelligence\\/resolve"), "gateway allows Card Intelligence resolution");
check(gateway.includes("CARD_INTELLIGENCE_IMAGE_REQUEST_BYTES = 5_750_000"), "gateway has bounded photo-route request allowance");
check(gateway.includes("cardIntelligenceImagePath(path)"), "larger request allowance is limited to photo routes");

const failed = results.filter(value => !value).length;
console.log(`CardSight customer-intelligence static assurance: ${results.length - failed} passed, ${failed} failed.`);
if (failed) process.exit(1);
