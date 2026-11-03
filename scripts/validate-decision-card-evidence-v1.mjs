import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const index = read("saas-prototype/index.html");
const loader = read("saas-prototype/decision-intelligence-final-polish-v1.js");
const js = read("saas-prototype/decision-card-evidence-v1.js");
const css = read("saas-prototype/decision-card-evidence-v1.css");

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

// Legacy results and saved chips (2026-10-31, founder report on a legacy BUY):
// a legacy result never gets current-support copy, its withheld evidence is not shown as 0, and "Saved BUY" chips are read.
// On the saved decision page the passport is composed by its owner from the saved record (Nov 3 2026).
const owner = read("saas-prototype/customer-opportunities.js");
check("L01 legacy result detected from the server's legacy status", js.includes('querySelector("[data-ff-legacy-result]")') && owner.includes("const isLegacy = Boolean(trust()?.isLegacy && trust().isLegacy(item));") && owner.includes("legacy: isLegacy,"));
check("L02 legacy result gets historical copy, not 'Evidence supports considering this purchase'", /model\.legacy \? legacyImpact\(model\.decision\)/.test(js) && js.includes("Saved before current evidence rules · not currently supported"));
check("L03 legacy evidence tile says withheld, not 0", js.includes('evidence.trusted = "Withheld"'));
check("L04 legacy confidence is labelled as at the time", js.includes('"Confidence at the time"'));
// The saved verdict comes from the saved record, so a "Saved BUY" chip can never hide it.
check("L05 decision card verdict is the saved record's recommendation", owner.includes("function savedVerdict(item)") && owner.includes("const decision = savedVerdict(item);") && owner.includes("passportModule.markup({\n      decision,"));
check("L06 decision meaning is read from the saved record (no false 'has not returned a customer-facing decision')", owner.includes("(DECISION_COPY[decision] || UNKNOWN_DECISION_COPY)"));
// The saved date is rendered by the saved-decision owner (customer-opportunities.js) since 2026-11-03.
const savedDecisionOwner = fs.readFileSync(new URL("../saas-prototype/customer-opportunities.js", import.meta.url), "utf8");
check("L07 saved date is shown as a date, not a raw ISO timestamp", savedDecisionOwner.includes("function readableDate(") && savedDecisionOwner.includes("readableDate(item.observedAt)") && !savedDecisionOwner.includes("Tenant-owned saved record ·"));

try {
  new Function(loader);
  check("002 Decision Intelligence polish loader parses", true);
} catch (error) {
  check(`002 Decision Intelligence polish loader parses (${error.message})`, false);
}

check("003 existing polish runtime is loaded by app shell", index.includes('src="decision-intelligence-final-polish-v1.js"'));
// Both app pages list the Decision Card files; no script loads them (Nov 3 2026).
const customerPage = read("saas-prototype/customer.html");
check("004 loader mounts Decision Card stylesheet", [index, customerPage].every(page => page.includes('href="decision-card-evidence-v1.css"')));
check("005 loader mounts Decision Card runtime", [index, customerPage].every(page => page.includes('<script src="decision-card-evidence-v1.js"></script>')));
check("006 loader runs through existing apply lifecycle", !loader.includes("decision-card-evidence-v1"));
check("007 beta result route is first-class", js.includes("Object.freeze({ markup,") && owner.includes("const passportModule = betaSurface() ? window.FlipForgeDecisionCardEvidenceV1 : null;") && !js.includes('"opportunities"'));
check("008 standalone Decision Intelligence remains supported", js.includes('routeName() !== "decision-intelligence"') && js.includes('[data-ff-di-v2-command]'));

for (const [number, label] of [
  ["009", "Identity Intelligence"],
  ["010", "Evidence Intelligence"],
  ["011", "Economic Intelligence"],
  ["012", "Risk + Uncertainty Intelligence"],
  ["013", "Decision Intelligence"],
  ["014", "Traceback Intelligence"],
  ["015", "Outcome Intelligence"]
]) {
  check(`${number} ${label} is present`, js.includes(label));
}

check("016 decision remains above the evidence layer", js.includes('model.anchor.insertAdjacentElement("afterend", panel)') && js.includes("The decision stays first"));
check("017 full evidence trail stays native", js.includes("Open full evidence trail") && owner.includes("evidenceHref: `#/evidence/${id}`"));
check("018 receipt is never reconstructed on the beta result screen", js.includes("does not reconstruct it in the browser") && owner.includes('receiptMode: "reference"'));
check("019 attached server receipt can still be opened", js.includes("data-ff-open-decision-receipt") && js.includes(".ff-di-v2-receipt"));
check("020 outcome layer routes to governed Tracking", js.includes("trackingHref") && js.includes("Continue to Tracking"));
check("021 economics copy forbids inferred profit", js.includes("does not infer profit or recompute value"));
check("022 presentation layer performs no network activity", !/fetch\s*\(|XMLHttpRequest/i.test(js));
check("023 presentation layer introduces no browser persistence", !/localStorage|sessionStorage|indexedDB/i.test(js));
check("024 presentation layer does not assign recommendation authority", !/recommendation\s*=|authorityEligible\s*=\s*true/i.test(js));
check("025 customer-visible text floor is 14px or larger", !/font-size\s*:\s*(?:[0-9]|1[0-3])px/i.test(css));
check("026 tablet responsiveness exists", css.includes("@media (max-width:1020px)"));
check("027 phone responsiveness exists", css.includes("@media (max-width:640px)"));
check("028 receipt open respects reduced-motion preference", js.includes("prefers-reduced-motion: reduce") && js.includes('behavior: reduceMotion ? "auto" : "smooth"'));

console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) {
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
