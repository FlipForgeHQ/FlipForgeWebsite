import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const index = read("saas-prototype/index.html");
const customer = read("saas-prototype/customer.html");
const js = read("saas-prototype/phase3-first-decision-activation-v1.js");
const css = read("saas-prototype/phase3-first-decision-activation-v1.css");
const publicIndex = read("index.html");
const publicEvents = read("assets/js/phase3-activation-events-v1.js");

let passed = 0;
const failures = [];
const check = (label, condition) => {
  if (condition) {
    passed += 1;
    console.log("PASS | " + label);
  } else {
    failures.push(label);
    console.error("FAIL | " + label);
  }
};

try { new Function(js); check("001 Phase 3 app JavaScript parses", true); }
catch (error) { check("001 Phase 3 app JavaScript parses: " + error.message, false); }

try { new Function(publicEvents); check("002 Phase 3 public measurement JavaScript parses", true); }
catch (error) { check("002 Phase 3 public measurement JavaScript parses: " + error.message, false); }

check("003 app shell loads Phase 3 stylesheet", index.includes('href="phase3-first-decision-activation-v1.css"'));
check("004 app shell loads Phase 3 runtime", index.includes('src="phase3-first-decision-activation-v1.js"'));
check("005 full customer shell loads Phase 3 stylesheet", customer.includes('href="phase3-first-decision-activation-v1.css"'));
check("006 full customer shell loads Phase 3 runtime", customer.includes('src="phase3-first-decision-activation-v1.js"'));
check("007 public landing loads activation measurement", publicIndex.includes('assets/js/phase3-activation-events-v1.js'));

check("008 first-use onboarding derives from authoritative dashboard count", js.includes("trackedCount(dashboard)") && js.includes("if (tracked <= 0)") && js.includes("if (!first) firstUseActivation(dashboard)"));
check("009 first-use onboarding has one exact-card activation CTA", js.includes('data-ff-p3-first-evaluate') && js.includes('href="#/discover"'));
check("010 returning home is server-state dependent", js.includes("returningHome(dashboard, tracked)") && js.includes("tracked > 0"));
check("011 returning home exposes saved decisions", js.includes('href="#/opportunities"'));
check("012 returning home exposes Outcome Intelligence", js.includes('href="#/tracking"'));
check("013 returning home exposes Forge Heat", js.includes('href="#/forge-heat"'));
check("014 returning home exposes Portfolio", js.includes('href="#/portfolio"'));

check("015 real connected Discover form is the animated evaluate entry", js.includes('[data-customer-discovery-form]') && js.includes('routeName() !== "discover"'));
check("016 evaluate flow visibly stages identity", js.includes('data-stage="identity"') && js.includes("identity-review"));
check("017 evaluate flow visibly stages evidence", js.includes('data-p3-step="evidence"') && js.includes('return "evidence"'));
check("018 governed evaluation starts only from native candidate control", js.includes("[data-discovery-evaluate]") && js.includes("phase3_governed_evaluation_started"));

check("019 saved result education reads existing decision", js.includes("function decisionFrom(root)") && js.includes(".ff-decision-summary-pill"));
check("020 saved result education does not assign recommendation authority", !/recommendation\s*=|authorityEligible\s*=\s*true/i.test(js));
check("021 result education routes to native Evidence", js.includes("data-ff-p3-open-evidence") && js.includes("#/evidence/"));
check("022 Decision Receipt proxy opens existing governed receipt", js.includes("[data-ff-open-decision-receipt]") && js.includes("native.click()"));
check("023 result education explicitly distinguishes decision from transaction authority", js.includes("not a prediction or transaction authorization"));

check("024 app runtime uses no browser persistence", !/localStorage|sessionStorage|indexedDB/i.test(js));
check("025 public measurement uses no browser persistence", !/localStorage|sessionStorage|indexedDB/i.test(publicEvents));
check("026 app conversion writes only to approved conversion endpoint", js.includes('"/api/conversion-event"') && !/\/api\/v1\/(?:evaluations|opportunities|evidence)[^"']*["']\s*,\s*\{\s*method\s*:\s*"POST"/i.test(js));
check("027 landing-to-evaluate funnel event exists", publicEvents.includes("phase3_landing_to_evaluate"));
check("028 app tracks first evaluate click", js.includes("phase3_first_evaluate_clicked"));
check("029 app tracks search submission", js.includes("phase3_card_search_submitted"));
check("030 app tracks identity selection", js.includes("phase3_identity_selected"));
check("031 app tracks evaluation completion", js.includes("phase3_evaluation_completed"));
check("032 app tracks evidence inspection", js.includes("phase3_evidence_opened"));
check("033 app tracks Decision Receipt opening", js.includes("phase3_decision_receipt_opened"));

check("034 premium activation visual exists", css.includes(".ff-p3-activation"));
check("035 returning user visual exists", css.includes(".ff-p3-returning"));
check("036 animated evaluate visual exists", css.includes(".ff-p3-evaluate-intro"));
check("037 first-result education visual exists", css.includes(".ff-p3-result-guide"));
check("038 mobile responsiveness exists", css.includes("@media(max-width:680px)"));
check("039 reduced motion fallback exists", css.includes("@media(prefers-reduced-motion:reduce)"));
check("040 customer text stays at readable sizes", !/font-size\s*:\s*(?:[0-9]|1[0-3])px/i.test(css));
check("041 Phase 3 uses dedicated owned-node markers", js.includes("data-flipforge-phase3-owned") && js.includes("OWNED_SELECTOR"));
check("042 enhanced surfaces use a stable dedicated marker", js.includes("data-flipforge-phase3-enhanced") && js.includes("ENHANCED_ATTRIBUTE"));
check("043 observer callback filters irrelevant or self-owned mutations", js.includes("function mutationMatters(record)") && js.includes("nodeIsPhase3Owned(record.target)") && js.includes("records.some(mutationMatters)"));
check("044 Phase 3 disconnects observer around its own synchronous DOM writes", js.includes("observer.disconnect()") && js.includes("applyWithoutSelfObservation") && js.includes("observeMain()"));
check("045 observer no longer unconditionally schedules every mutation", !js.includes("new MutationObserver(schedule)") && js.includes("new MutationObserver(onObservedMutations)"));

console.log("PASSED: " + passed);
console.log("FAILED: " + failures.length);
if (failures.length) process.exit(1);
