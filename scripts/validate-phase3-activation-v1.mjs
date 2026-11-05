import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const index = read("saas-prototype/index.html");
const customer = read("saas-prototype/customer.html");
const js = read("saas-prototype/phase3-first-decision-activation-v1.js");
const css = read("saas-prototype/phase3-first-decision-activation-v1.css");
const publicIndex = read("index.html");

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

// The public Phase 3 sender duplicated beta_cta_clicked under names /api/conversion-event never allowed (400).
// Public funnel measurement is assets/js/conversion-events.js only (scripts/validate-conversion-event-contract.mjs).
check("002 retired public Phase 3 sender stays removed", !fs.existsSync("assets/js/phase3-activation-events-v1.js"));

check("003 app shell loads Phase 3 stylesheet", index.includes('href="phase3-first-decision-activation-v1.css"'));
check("004 app shell loads Phase 3 runtime", index.includes('src="phase3-first-decision-activation-v1.js"'));
check("005 full customer shell loads Phase 3 stylesheet", customer.includes('href="phase3-first-decision-activation-v1.css"'));
check("006 full customer shell loads Phase 3 runtime", customer.includes('src="phase3-first-decision-activation-v1.js"'));
check("007 public landing does not load the retired Phase 3 sender", !publicIndex.includes('phase3-activation-events-v1.js'));

// The Home first-use / returning panels are rendered by the Dashboard owner from the authoritative count.
const home = read("saas-prototype/commercial-dashboard-v2.js");
check("008 first-use onboarding derives from authoritative dashboard count", home.includes("const firstUse = tracked <= 0;") && home.includes("firstUse ? firstUsePanel() : returningPanel(tracked)") && !js.includes("function firstUseActivation"));
check("009 first-use onboarding has one exact-card activation CTA", home.includes('data-ff-p3-first-evaluate') && home.includes('href="#/discover"'));
check("010 returning home is server-state dependent", home.includes("function returningPanel(tracked)") && home.includes("${tracked} saved decision"));
check("011 returning home exposes saved decisions", home.includes('href="#/opportunities" data-ff-p3-return="saved"'));
check("012 returning home exposes Outcome Intelligence", home.includes('href="#/tracking" data-ff-p3-return="outcomes"'));
check("013 returning home exposes Forge Heat", home.includes('href="#/forge-heat" data-ff-p3-return="heat"'));
check("014 returning home exposes Portfolio", home.includes('href="#/portfolio" data-ff-p3-return="portfolio"'));
check("014a zero-decision Home receives explicit simplified state", home.includes('firstUse ? "ff-p3-zero-dashboard" : "ff-p3-returning-dashboard"') && home.includes("Evaluate your first card."));
check("014b zero-decision Home hides empty analytics", css.includes(".ff-commercial-dashboard.ff-p3-zero-dashboard .ff-kpi-grid") && css.includes(".ff-commercial-dashboard.ff-p3-zero-dashboard .ff-dashboard-main-grid") && css.includes("display:none!important"));
check("014c first-session Home explains why advanced tools come later", home.includes("Saved-decision analytics, Outcome Intelligence, Portfolio, and other tools become useful after you have real decisions to work with."));
check("014d first-session Home teaches the same four customer checks", ["Confirm the exact card","Check matched sales","Compare price + uncertainty","Read the decision + receipt"].every(item => home.includes(item)));
check("014f legacy result education yields to the integrated CDI Signal Stack", js.includes('root.querySelector("[data-ff-cdi-stack-host]")') && js.includes("existingGuide.remove()"));


// The saved verdict comes from the Card Intelligence hero (rendered from the saved record) only - never the injected
// summary pill, which once scraped "BUY" from a legend while a saved WATCH loaded (2026-10-13).
// Discover has no Phase 3 layer since Nov 3 2026: its step guidance is the owner's workflow strip and its telemetry is
// beta-session-v1.js (evaluation_started). The phase3_* Discover events were never accepted by /api/conversion-event.
check("015 Phase 3 adds nothing to the Discover page", !js.includes("enhanceEvaluate") && !js.includes("ff-p3-evaluate-shell") && !js.includes("data-ff-p3-evaluate") && !css.includes(".ff-p3-evaluate"));
check("018 Phase 3 sends no Discover events", !js.includes("phase3_governed_evaluation_started") && !js.includes("phase3_card_search_submitted") && !js.includes("phase3_identity_selected"));
check("019 saved result education reads the saved decision from the hero only", js.includes("function decisionFrom(root)")
  && js.includes('root.querySelector(".customer-intelligence-hero")') && !js.includes(".ff-decision-summary-pill"));
check("020 saved result education does not assign recommendation authority", !/recommendation\s*=|authorityEligible\s*=\s*true/i.test(js));
check("021 result education routes to native Evidence", js.includes("data-ff-p3-open-evidence") && js.includes("#/evidence/"));
check("022 Decision Receipt proxy opens existing governed receipt", js.includes("[data-ff-open-decision-receipt]") && js.includes("native.click()"));
check("023 result education explicitly distinguishes decision from transaction authority", js.includes("not a prediction or transaction authorization"));

check("024 app runtime uses no browser persistence", !/localStorage|sessionStorage|indexedDB/i.test(js));
check("026 app conversion writes only to approved conversion endpoint", js.includes('"/api/conversion-event"') && !/\/api\/v1\/(?:evaluations|opportunities|evidence)[^"']*["']\s*,\s*\{\s*method\s*:\s*"POST"/i.test(js));
check("028 app tracks first evaluate click", home.includes("phase3_first_evaluate_clicked") && home.includes('"/api/conversion-event"') && !/localStorage|sessionStorage|indexedDB/i.test(home));
check("031 app tracks evaluation completion", js.includes("phase3_evaluation_completed"));
check("032 app tracks evidence inspection", js.includes("phase3_evidence_opened"));
check("033 app tracks Decision Receipt opening", js.includes("phase3_decision_receipt_opened"));

// /api/conversion-event rejected every in-app event with 400 EVENT_NOT_ALLOWED until Nov 2026: the names were not
// allowlisted and the page was the raw window.location.pathname. Fixed page, fixed placements, allowlisted names.
const backend = read("netlify/modern-functions/conversion-event.mjs");
const allow = name => new Set([...(backend.match(new RegExp("const " + name + " = new Set\\(\\[([\\s\\S]*?)\\]\\)"))?.[1] || "").matchAll(/"([^"]+)"/g)].map(m => m[1]));
const serverEvents = allow("EVENT_NAMES");
const serverPlacements = allow("PLACEMENTS");
const NINE = ["phase3_first_use_shown", "phase3_returning_home_shown", "phase3_first_evaluate_clicked", "phase3_returning_action_clicked",
  "phase3_first_result_education_viewed", "phase3_evaluation_completed", "phase3_evidence_opened", "phase3_evaluate_another_clicked", "phase3_decision_receipt_opened"];
check("046 the server allowlists all nine in-app activation events", NINE.every(name => serverEvents.has(name)) && allow("PAGE_NAMES").has("beta-app"));
check("047 app events send the fixed page beta-app, never the raw path or route", [js, home].every(source => source.includes('const EVENT_PAGE = "beta-app";')
  && source.includes("JSON.stringify({ event, page: EVENT_PAGE, placement })") && !/page:\s*String\(window\.location/.test(source) && !/route:\s*(?:routeName\(\)|"dashboard")/.test(source)));
check("048 result education does not send the saved verdict", js.includes('emit("phase3_first_result_education_viewed", "result_education")') && !js.includes("decision.toLowerCase()"));
check("049 every in-app placement is allowlisted", ["dashboard_zero_saved", "dashboard_saved", "dashboard", "returning_saved", "returning_outcomes", "returning_heat",
  "returning_portfolio", "result_education", "saved_decision_detail"].every(value => serverPlacements.has(value)) && !["buy", "watch", "verify", "pass"].some(value => serverPlacements.has(value)));

check("034 premium activation visual exists", css.includes(".ff-p3-activation"));
check("035 returning user visual exists", css.includes(".ff-p3-returning"));
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
