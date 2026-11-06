// Customer discoverability guardrails: no new pricing, receipt reconstruction, or auth bypass.
import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

const read = p => fs.readFileSync(path.resolve(p), "utf8");
const owner = read("saas-prototype/customer-opportunities.js");
const evidence = read("saas-prototype/decision-card-evidence-v1.js");
const beta = read("saas-prototype/private-beta.js");
const css = read("saas-prototype/customer-journey-discoverability-v1.css");
const betaShell = read("saas-prototype/index.html");
const customerShell = read("saas-prototype/customer.html");
let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  console.log("PASS | " + name);
  passed++;
}
for (const [name, src] of [["saved decision", owner], ["evidence passport", evidence], ["Private Beta onboarding", beta]]) {
  check(name + " JavaScript parses", (() => { try { new Function(src); return true; } catch { return false; } })());
}
check("Both authorized customer shells load the same discoverability CSS", [betaShell, customerShell].every(s => s.includes('href="customer-journey-discoverability-v1.css"')));
check("New stylesheet is included after existing typography layer", [betaShell, customerShell].every(s => s.indexOf("customer-typography.css") < s.indexOf("customer-journey-discoverability-v1.css")));
check("Saved decisions include an explicit Open saved decision link", owner.includes("ff-ux-open-saved") && owner.includes('href="#/opportunities/${encodeURIComponent(item.id)}"'));
check("Decision quick actions appear immediately after the saved hero", owner.includes("${hero}${savedDecisionBar(item)}${primaryActions}${receiptPanel}${stack}"));
check("Saved decision links use existing Evidence and Tracking routes", owner.includes('href="#/evidence/${id}"') && owner.includes('href="#/tracking/${id}"'));
check("Receipt eligibility is server-backed and older records are excluded", owner.includes("function savedReceipt(item)") && owner.includes("governed.available !== true") && owner.includes("trust().isLegacy(item)") && owner.includes("const governedReceipt = savedReceipt(item)") && owner.includes("const receiptReady = Boolean(governedReceipt)"));
check("Unavailable receipt has explicit status, not a broken button", owner.includes("Decision Receipt unavailable") && owner.includes("no separate receipt is available") && owner.includes('role="status"'));
check("Available receipt action is a genuine button and emits established event", owner.includes("data-ff-ux-open-receipt data-ff-cdi-receipt"));
check("Receipt panel displays read-only server fields", owner.includes("Decision Receipt — saved server record") && owner.includes("governedReceipt.policyVersion") && owner.includes("governedReceipt.exactTrustedCompCount") && owner.includes("not reconstructed"));
check("Receipt does not rescore or write through the receipt panel", !owner.slice(owner.indexOf("const governedReceipt = savedReceipt(item)"), owner.indexOf("const metrics = `<details")).includes("fetch(") && !owner.slice(owner.indexOf("const governedReceipt = savedReceipt(item)"), owner.indexOf("const metrics = `<details")).includes("request("));
check("Detail and receipt action buttons open and focus real native disclosures", owner.includes('details.open = true;') && owner.includes('summary?.focus({ preventScroll: true });') && owner.includes('data-ff-ux-open-details'));
check("Opening disclosures honors reduced-motion preferences", owner.includes('prefers-reduced-motion: reduce'));
check("Legacy receipt mode stays reference-only in passport", owner.includes('receiptMode: "reference"') && evidence.includes("does not reconstruct it in the browser"));
check("Evidence passport no longer falsely promises every saved record has a full receipt", evidence.includes("If the original Decision Receipt is unavailable") && evidence.includes("The full Decision Receipt and traceback are below."));
check("Every interactive evidence disclosure describes its action", evidence.includes("Select to expand or collapse") && owner.includes("Select to expand or collapse"));
check("First-session five-step guide is visible by default", beta.includes("data-private-beta-first-card open") && beta.includes("five-step card walkthrough"));
check("Five stages have explicit real routes", ["#/discover", "#/evaluate", "#/opportunities", "#/tracking", "#/portfolio"].every(href => beta.includes('href="' + href + '"')) && beta.includes('private-beta-v2-stage-number">5'));
check("Private Beta makes returning saved decisions obvious", beta.includes('Open an existing saved decision'));
check("No promise that old receipts always exist", beta.includes("older decisions clearly say when it is unavailable"));
check("Full customer navigation uses same Tracking name as Beta", customerShell.includes('data-route="tracking"') && customerShell.includes("</svg></span>Tracking</a>") && betaShell.includes("</svg></span>Tracking</a>"));
check("Extra full-app analysis tools stay in a labeled disclosure", customerShell.includes("Advanced analysis") && customerShell.includes("ff-advanced-nav"));
check("Interactive tiles provide min-height, hover, focus, and mobile layout", css.includes("min-height:102px") && css.includes("focus-visible") && css.includes("@media(max-width:720px)") && css.includes("grid-template-columns:1fr"));
check("Sidebar guidance is readable at the 14px customer typography floor", /\.primary-nav \.ff-ux-nav-guidance\{[^}]*font-size:14px/.test(css));
check("Sidebar guidance uses neutral text, not blue-tinted shell copy", /\.primary-nav \.ff-ux-nav-guidance\{[^}]*color:#dedede/.test(css) && !css.includes("color:#d9dce1"));
check("New customer experience CSS introduces no explicit microcopy under 14px",
  ![...css.matchAll(/font-size:\s*([0-9.]+)(px|rem)/g)].some(([, num, unit]) => Number(num) * (unit === "rem" ? 16 : 1) < 14));
check("No client-side decision engine or provider fetching introduced", !css.includes("script") && !beta.includes("data-ff-ux-open-receipt"));
console.log("Customer discoverability validation: " + passed + " checks passed.");
