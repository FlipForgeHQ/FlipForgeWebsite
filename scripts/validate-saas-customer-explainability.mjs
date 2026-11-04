import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const index = read("saas-prototype/index.html");
// The saved decision page's explanations are rendered by its owner (customer-explainability.js retired, Nov 3 2026).
// "js" is the owner's explanation code: the metric help, the supported-value note and the explainer panel.
const ownerSource = read("saas-prototype/customer-opportunities.js");
const between = (start, end) => { const from = ownerSource.indexOf(start); const to = ownerSource.indexOf(end, from); return from >= 0 && to > from ? ownerSource.slice(from, to) : ""; };
const js = [
  between("  const METRIC_HELP = Object.freeze({", "  // The saved, server-returned verdict"),
  between('<div class="customer-supported-value-note" data-supported-value-note="true">', "</div></div></div></section>`;"),
  between("  // Full customer app: how to read each part of the decision", "  function tracebackStep(")
].join("\n");
const css = read("saas-prototype/customer-explainability.css");
const opportunities = read("saas-prototype/customer-opportunities.js");
const gateway = read("netlify/functions/flipforge-api.js");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

check("001 explainability stylesheet loads", index.includes('href="customer-explainability.css"'));
check("002 explanations are rendered by the saved decision owner, with no separate script", !index.includes("customer-explainability.js") && !fs.existsSync(path.join(root, "saas-prototype/customer-explainability.js")) && js.length > 0);
check("003 metric help is rendered with each metric", opportunities.includes('<small class="customer-metric-help">${help}</small>') && ["Confidence", "Liquidity", "Decision risk", "Rank"].every(label => opportunities.includes(`["${label}", `)));
check("004 supported value note is rendered in the value summary", opportunities.includes('<div class="customer-supported-value-note" data-supported-value-note="true">'));
check("005 explainer panel is offered in the full customer app only, before the deeper detail", opportunities.includes('${metrics}${betaSurface() ? "" : decisionExplainer()}<details class="ff-cdi-deep'));
check("006 explanations require the saved decision record", opportunities.includes("function detailView()") && opportunities.includes("decisionExplainer()"));
check("007 explanations are part of the saved decision render, not added afterwards", !/MutationObserver/.test(opportunities));
check("008 no page watcher is introduced", !/MutationObserver/.test(js));
check("009 route changes re-render through the router", !/addEventListener\("hashchange"/.test(js));
check("010 explainer has its own marker", js.includes("data-intelligence-explainer") && js.includes("data-supported-value-note"));
check("011 supported value avoids guarantee language", js.includes("not a guaranteed sale price"));
check("012 supported value avoids purchase instruction", js.includes("not a guaranteed sale price or an instruction to buy"));
check("013 confidence is explicitly not certainty", js.includes("It is not certainty"));
check("014 liquidity does not erase risk", js.includes("does not remove risk") || js.includes("does not eliminate risk"));
check("015 risk is not a forecast", js.includes("not a price forecast") || js.includes("not a prediction of future price movement"));
check("016 rank is not a price prediction", js.includes("not a price prediction") || js.includes("not a price target"));
check("017 PSA remains context not grade prediction", js.includes("does not predict a grade"));
check("018 active listings remain discovery inputs", js.includes("Active marketplace listings remain discovery inputs"));
check("019 completed-sale eligibility remains explicit", js.includes("Only eligible completed-sale evidence"));
check("020 Smart Opportunity metrics are identified as returned state", ["Liquidity", "Risk", "Rank"].every(label => js.includes(`${label}:`)) && js.includes("returned by Smart Opportunity"));
check("021 no fetch is introduced", !/\bfetch\s*\(/.test(js));
check("022 no browser persistence is introduced", !/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(js));
check("023 no trusted tenant identity header is introduced", !/X-FlipForge-(?:Tenant|User)-Id/i.test(js));
check("024 no service token is introduced", !/FLIPFORGE_API_SERVICE_TOKEN|Authorization\s*:/i.test(js));
check("025 no transaction execution control is introduced", !/Place bid|Buy now|Checkout|Pay now|Accept offer|Create listing/i.test(js));
check("026 no recommendation authority is computed", !/recommendation\s*=|decision\s*=|BUY_READY_CANDIDATE/.test(js));
check("027 underlying Card Intelligence still uses Smart Opportunity authority", opportunities.includes('meta.authority === "Smart Opportunity"'));
check("028 underlying Card Intelligence still uses existing PSA authority", opportunities.includes('meta.gradingAuthority === "Existing PSA intelligence"'));
check("029 underlying Card Intelligence still uses same-origin credentials", opportunities.includes('credentials: "same-origin"'));
check("030 underlying Card Intelligence still disables cache", opportunities.includes('cache: "no-store"'));
check("031 underlying Card Intelligence still rejects redirects", opportunities.includes('redirect: "error"'));
check("032 underlying evidence contract remains tenant-protected", opportunities.includes("async function loadDetailDirect(serial, route)") && !/X-FlipForge-(?:Tenant|User)-Id/i.test(opportunities) && gateway.includes("[TENANT_HEADER]: tenant.tenantId") && gateway.includes("CLIENT_IDENTITY_HEADER_FORBIDDEN"));
check("033 metric help text is visibly styled", css.includes(".customer-metric-help"));
check("034 supported value note is visibly styled", css.includes(".customer-supported-value-note"));
check("035 explainer panel has dedicated styling", css.includes(".customer-intelligence-explainer"));
check("036 explainer grid has desktop layout", css.includes("grid-template-columns: repeat(3"));
check("037 explainer grid has tablet breakpoint", css.includes("@media (max-width: 980px)"));
check("038 explainer grid has mobile breakpoint", css.includes("@media (max-width: 620px)"));
check("039 reduced motion is respected", css.includes("prefers-reduced-motion"));
check("040 no external assets or remote scripts are added", !/https?:\/\//i.test(js) && !/@import/i.test(css));

const failures = results.filter(result => !result.passed);
console.log("SaaS customer intelligence explainability validation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
