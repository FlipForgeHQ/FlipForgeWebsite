import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const index = read("saas-prototype/index.html");
const loader = read("saas-prototype/decision-intelligence-final-polish-v1.js");
const js = read("saas-prototype/decision-card-evidence-v1.js");
const css = read("saas-prototype/decision-card-evidence-v1.css");
const clarity = read("saas-prototype/customer-decision-clarity-v1.js");

let passed = 0;
const failures = [];
const check = (label, condition) => {
  if (condition) {
    passed += 1;
    console.log(`PASS | ${label}`);
  } else {
    failures.push(label);
    console.error(`FAIL | ${label}`);
  }
};

try {
  new Function(js);
  check("001 Decision Card evidence JavaScript parses", true);
} catch (error) {
  check(`001 Decision Card evidence JavaScript parses (${error.message})`, false);
}

try {
  new Function(loader);
  check("002 Decision Intelligence polish loader parses", true);
} catch (error) {
  check(`002 Decision Intelligence polish loader parses (${error.message})`, false);
}

check("003 existing polish runtime is loaded by app shell", index.includes('src="decision-intelligence-final-polish-v1.js"'));
check("004 loader mounts Decision Card stylesheet", loader.includes('decision-card-evidence-v1.css?v=20260922-signal-1') && loader.includes("data-ff-decision-card-evidence"));
check("005 loader mounts Decision Card runtime", loader.includes('decision-card-evidence-v1.js?v=20260922-signal-1') && loader.includes("FlipForgeDecisionCardEvidenceV1"));
check("006 loader runs through existing apply lifecycle", loader.includes("ensureDecisionCardEvidenceAssets();"));
check("007 saved-decision detail remains a first-class source", js.includes('parts[0] !== "opportunities"') && js.includes('[data-ff-decision-summary]'));
check("008 standalone Decision Intelligence remains supported", js.includes('routeName() !== "decision-intelligence"') && js.includes('[data-ff-di-v2-command]'));

for (const [number, label] of [
  ["009", "Identity Intelligence"],
  ["010", "Evidence Intelligence"],
  ["011", "Economic Intelligence"],
  ["012", "Risk + Uncertainty Intelligence"],
  ["013", "Decision Intelligence"],
  ["014", "Decision Traceback / Decision Receipt"],
  ["015", "Outcome Intelligence"]
]) {
  check(`${number} ${label} remains available in progressive disclosure`, js.includes(label));
}

check("016 plain-language first-time CTA is present", js.includes("New to FlipForge? You do not need to know the terminology.") && js.includes("Show me why FlipForge said"));
check("017 reasoning stays hidden until the customer asks for it", js.includes('data-ff-dce-reasoning hidden'));
check("018 four reason-trail signals are present", ["identity","evidence","economics","risk"].every(value => js.includes(`key: "${value}"`)));
check("019 signal stack uses returned card identity", js.includes("model.exactIdentity") && js.includes("model.identity"));
check("020 signal stack uses returned evidence counts", js.includes("model.accepted") && js.includes("model.excluded") && js.includes("evidencePlain(model)"));
check("021 signal stack uses returned ask and supported value", js.includes("model.ask") && js.includes("model.supportedValue") && js.includes("pricePlain(model)"));
check("022 signal stack uses returned confidence and risk", js.includes("model.confidence") && js.includes("model.risk") && js.includes("uncertaintyVisual(model)"));
check("023 guided build uses 340ms stagger", js.includes("index * 340") && js.includes("Check ${index + 1} of ${rows.length}"));
check("024 replay is presentation-only", js.includes("data-ff-dce-replay") && js.includes("playSignalBuild(panel)"));
check("025 identity uses an animated check stack", js.includes("ff-dce-check-stack") && css.includes("ffDceCheckPop"));
check("026 evidence uses visual accepted/rejected marks", js.includes("ff-dce-evidence-dots") && css.includes(".ff-dce-evidence-dots i.is-kept") && css.includes(".ff-dce-evidence-dots i.is-out"));
check("027 economics visual is derived from returned ask/support only", js.includes("function priceVisual(model)") && js.includes("ask / max") && js.includes("supported / max") && css.includes("ffDcePriceGrow"));
check("028 uncertainty uses a confidence ring and risk bar", js.includes("ff-dce-mini-ring") && js.includes("ff-dce-risk-bar") && css.includes("ffDceRingFill") && css.includes("ffDceRiskFill"));
check("029 full evidence remains collapsed by default", js.includes('<details class="ff-dce-layers">') && !js.includes('<details open class="ff-dce-layers">'));
check("030 attached native Decision Receipt can still be opened", js.includes("data-ff-open-decision-receipt") && js.includes(".ff-di-v2-receipt"));
check("031 beta saved-decision view never reconstructs a receipt", js.includes('receiptMode: "reference"') && js.includes("native server-backed surface"));
check("032 outcome layer routes to governed Tracking", js.includes("trackingHref") && js.includes("Continue to Tracking"));
check("033 economics copy forbids inferred profit", js.includes("does not infer profit or recompute value"));
check("034 legacy duplicate Why panel is removed from the rendered customer result", clarity.includes('root.querySelector("[data-ff-decision-why]")?.remove();') && !clarity.includes("createWhyPanel(root, decision, facts, risk);"));
check("035 presentation layer performs no network activity", !/fetch\s*\(|XMLHttpRequest/i.test(js));
check("036 presentation layer introduces no browser persistence", !/localStorage|sessionStorage|indexedDB/i.test(js));
check("037 presentation layer does not assign recommendation authority", !/recommendation\s*=|authorityEligible\s*=\s*true/i.test(js));
check("038 customer-visible text floor is 14px or larger", !/font-size\s*:\s*(?:[0-9]|1[0-3])px/i.test(css));
check("039 tablet responsiveness exists", css.includes("@media (max-width:1020px)"));
check("040 phone responsiveness exists", css.includes("@media (max-width:640px)"));
check("041 reduced-motion users receive a complete reason trail", js.includes("prefers-reduced-motion: reduce") && js.includes("finishSignalBuild(panel)") && css.includes("@media(prefers-reduced-motion:reduce)"));

console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) {
  failures.forEach(failure => console.error(`  - ${failure}`));
  process.exit(1);
}
