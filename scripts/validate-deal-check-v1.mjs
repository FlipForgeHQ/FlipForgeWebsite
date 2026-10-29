// Static + unit checks for Deal Check™ / Scenario Lab™ / Decision Receipt Pro™ (saas-prototype/deal-check-v1.js).
// Proves, without a browser: the renderer only mirrors saved governed values, the Max Buy explanation reproduces the
// engine exactly (or claims nothing), simulations never yield a verdict or touch the saved model, missing values are
// never shown as $0, production stays off unless explicitly opted in, and the shells load the files.
import fs from "node:fs";
import vm from "node:vm";
import { details, timeline, IDS, engineReference } from "./fixtures/deal-check/fixtures.mjs";

const read = file => fs.readFileSync(file, "utf8");
const passes = [];
const failures = [];
const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const SOURCE = read("saas-prototype/deal-check-v1.js");
const CSS = read("saas-prototype/deal-check-v1.css");

function load(location = { hostname: "example.invalid", pathname: "/", search: "", hash: "" }, extra = {}) {
  const window = { location, ...extra };
  const context = vm.createContext({ window, Intl, Date, Number, String, Object, Array, Math, JSON, console, Set });
  vm.runInContext(SOURCE, context, { filename: "deal-check-v1.js" });
  return window.FlipForgeDealCheck;
}

const api = load();
check("exports the Deal Check API", api && typeof api.dealModel === "function" && typeof api.scenario === "function");
const D = details();
const model = id => api.dealModel(D[id], timeline(id));

// 1. Mirror-only: verdict, Max Buy, supported value and profits are the saved governed values.
for (const id of Object.values(IDS)) {
  const m = model(id);
  const g = D[id].opportunity.governedDecision;
  check(`${id}: verdict is the governed verdict`, m.verdict === g.recommendation, m.verdict);
  if (id !== IDS.legacy && id !== IDS.verify) {
    check(`${id}: Max Buy is the saved Max Buy`, m.maxBuyCents === (g.maximumBuyPriceCents ?? null), String(m.maxBuyCents));
    check(`${id}: base profit is the saved profit`, m.net.expected === (g.expectedNetProfitCents ?? null));
  }
}

// 2. Engine reproduction: the browser explanation matches the engine-reference Max Buy for every governed fixture.
for (const id of [IDS.buy, IDS.watch, IDS.pass]) {
  const m = model(id);
  const reasoning = api.maxBuyReasoning(m);
  check(`${id}: Max Buy reasoning reproduces the saved Max Buy exactly`, reasoning.reproduced === true && reasoning.limits.length === 4, JSON.stringify(reasoning).slice(0, 160));
}
{
  const m = model(IDS.buy);
  const tampered = { ...m, maxBuyCents: m.maxBuyCents + 1 };
  check("tampered Max Buy: reasoning claims nothing", api.maxBuyReasoning(tampered).reproduced === false);
  const otherPolicy = { ...m, policyVersion: "profitability-margin-of-safety-v9" };
  check("different saved policy version: reasoning claims nothing", api.maxBuyReasoning(otherPolicy).reproduced === false);
}
{
  // Engine-reference sweep: for many synthetic inputs, reproduce Max Buy from saved net profits only.
  let mismatches = 0;
  for (let sv = 5000; sv <= 500000; sv += 7919) {
    for (const [confidence, risk, quality, accepted] of [[90, 20, "HIGH", 9], [76, 55, "MODERATE", 3], [60, 72, "LOW", 1], [80, 41, "HIGH", 5]]) {
      const ask = Math.round(sv * 0.7);
      const e = engineReference({ supportedValueCents: sv, allInAcquisitionCostCents: ask, confidence, risk, evidenceQuality: quality, acceptedExactEvidenceCount: accepted });
      const m = api.dealModel({ governedDecisionReadModelVersion: "governed-decision-read-model-v1", opportunity: { id: "X", governedDecision: {
        available: true, recommendation: "WATCH", allInAskCents: ask, supportedValueCents: sv, supportedValueStatus: "ESTABLISHED", ...e } } }, null);
      if (!api.maxBuyReasoning(m).reproduced) mismatches += 1;
    }
  }
  check("engine-reference sweep: Max Buy reasoning reproduces every engine Max Buy", mismatches === 0, `${mismatches} mismatches`);
}

// 3. Break-even = saved all-in ask + saved base profit (engine net proceeds).
{
  const m = model(IDS.watch);
  const g = D[IDS.watch].opportunity.governedDecision;
  check("break-even buy price is exact snapshot arithmetic", m.breakEvenCents === g.allInAskCents + g.expectedNetProfitCents, String(m.breakEvenCents));
  check("break-even is never presented as Max Buy", m.breakEvenCents > m.maxBuyCents);
}

// 4. VERIFY / no supported value: the server sends Max Buy 0 and profit = −ask (value modelled as $0); none of it is shown.
{
  const g = D[IDS.verify].opportunity.governedDecision;
  check("VERIFY fixture is server-shaped (Max Buy 0, profit −ask)", g.maximumBuyPriceCents === 0 && g.expectedNetProfitCents === -g.allInAskCents);
  const m = model(IDS.verify);
  check("VERIFY: no Max Buy", m.maxBuyCents === null && m.supportedCents === null && m.breakEvenCents === null);
  check("VERIFY: no profit, ROI or net proceeds", ["expected", "conservative", "stress"].every(k => m.net[k] === null && m.roi[k] === null && m.netExit[k] === null));
  check("VERIFY: Max Buy reasoning claims nothing", api.maxBuyReasoning(m).reproduced === false);
  const sim = api.scenario(m, { itemCents: 30000 });
  check("VERIFY: Scenario Lab is blocked and never substitutes the ask as value", sim.available === false && /never substitutes an asking price/.test(sim.blocked));
  const html = api.dealCheckMarkup(m);
  check("VERIFY: markup never shows $0.00 for missing values", !/\$0\.00/.test(html));
  check("VERIFY: markup says a lower price alone will not change the decision", /lower price alone will not change this decision/.test(html));
}

// 5. Legacy: no Max Buy, value, profit or break-even presented even if the server sent them; lab blocked.
{
  const m = model(IDS.legacy);
  check("legacy: Max Buy and supported value withheld", m.maxBuyCents === null && m.supportedCents === null && m.legacy === true);
  check("legacy: profit, ROI and break-even withheld", m.breakEvenCents === null && ["expected", "conservative", "stress"].every(k => m.net[k] === null && m.roi[k] === null));
  const html = api.dealCheckMarkup(m);
  check("legacy: markup has no economics panel and no dollar profit", !/data-ffdc-economics-panel/.test(html) && !/\+\$/.test(html));
  check("legacy: Scenario Lab blocked", api.scenario(m, {}).available === false);
}

// 4b. VERIFY with an established value (2 exact sales): Max Buy shown for reference, never as a pass.
{
  const m = model(IDS.verifyThin);
  check("thin VERIFY: Max Buy is the saved positive Max Buy", m.maxBuyCents === D[IDS.verifyThin].opportunity.governedDecision.maximumBuyPriceCents && m.maxBuyCents > 0);
  check("thin VERIFY: headline says reference only", /for reference until the evidence clears/.test(api.headline(m)));
  const econ = api.checks(m).find(r => r.key === "economics");
  check("thin VERIFY: economics check is a warning, not a pass", econ.status === "warn" && /Reference only/.test(econ.note));
  check("thin VERIFY: price alone does not change it", /lower price alone will not change this decision/.test(api.dealCheckMarkup(m)));
}

// 4c. Decision history: an older entry without profitability shows Max Buy as not set, never $0.
{
  const m = model(IDS.buy);
  const old = m.timeline.find(e => e.decision === "VERIFY");
  check("history: profitability-unavailable entry has no Max Buy", old && old.maximumBuyPriceCents === null);
  check("history markup never shows Max Buy $0.00", !/Max Buy \$0\.00/.test(api.dealCheckMarkup(m)));
}

// 4c2. History that failed to load is not described as "no earlier evaluations".
{
  const m = model(IDS.watch);
  const html = api.dealCheckMarkup(m);
  check("history unavailable with several receipts: says it could not be loaded", m.snapshotCount > 1 && /could not be loaded/.test(html) && !/No earlier saved evaluations/.test(html));
}

// 4d. Capped wording follows the gate status.
{
  const base = model(IDS.pass);
  const negative = api.risks({ ...base, profitabilityCappedBuy: true, gateStatus: "NEGATIVE_NET_ECONOMICS" }).join(" ");
  check("capped + negative economics: no 'profit scenarios were positive' claim", !/were positive/.test(negative) && /negative/.test(negative));
  const margin = api.risks({ ...base, profitabilityCappedBuy: true, gateStatus: "MARGIN_OF_SAFETY_NOT_MET" }).join(" ");
  check("capped + margin of safety: cushion wording", /cushion/.test(margin));
}

// 4e. No snapshot all-in ask: no headroom claim from a bare listing price.
{
  const d = JSON.parse(JSON.stringify(D[IDS.buy]));
  d.opportunity.governedDecision.allInAskCents = null;
  const m = api.dealModel(d, null);
  check("no snapshot ask: no headroom or 'all-in' claim", m.headroomCents === null && !/all-in price is/.test(api.headline(m)));
}

// 6. Scenario Lab: hypothetical only.
{
  const m = model(IDS.watch);
  const before = JSON.stringify(m);
  const sim = api.scenario(m, { itemCents: 60000 });
  check("scenario never returns a verdict", sim.verdict === null && sim.simulation === true && !("recommendation" in sim));
  check("scenario does not mutate the saved model", JSON.stringify(m) === before);
  const base = sim.cases.find(c => c.key === "expected");
  check("reserves mode: simulated profit = saved net proceeds − simulated cost", base.profitCents === m.netExit.expected - 60000, String(base.profitCents));
  const same = api.scenario(m, {});
  check("default simulation reproduces the saved receipt profits", same.cases.every(c => c.profitCents === c.savedProfitCents), JSON.stringify(same.cases.map(c => [c.profitCents, c.savedProfitCents])));
  check("vs Max Buy uses the saved Max Buy", sim.vsMaxBuyCents === 60000 - m.maxBuyCents);
  const custom = api.scenario(m, { itemCents: 60000, costMode: "custom", feeBps: 1000, outboundShippingCents: 400, otherCostsCents: 100 });
  const expectedNet = 85000 - 8500 - 400 - 100;
  check("custom costs: base case only, applied to the saved supported value", custom.cases.length === 1 && custom.cases[0].netExitCents === expectedNet && custom.cases[0].profitCents === expectedNet - 60000);
  const target = api.scenario(m, { itemCents: 60000, targetProfitCents: 5000, targetRoiBps: 2000 });
  check("target limit is the lower of target profit and target ROI limits", target.targetLimitCents === Math.min(m.netExit.expected - 5000, Math.floor(m.netExit.expected * 10000 / 12000)));
  const huge = api.scenario(m, { itemCents: 9e15 });
  check("inputs are bounded", huge.purchaseCents <= 100_000_000);
  check("zero purchase is refused", api.scenario(m, { itemCents: 0 }).available === false);
  check("empty or invalid price is refused, not replaced by the saved ask", api.scenario(m, { itemCents: "invalid" }).available === false && api.scenario(m, { itemCents: null }).available === false);
  const empty = api.scenario(m, { itemCents: 60000, costMode: "custom" });
  check("custom costs: empty fields are $0, never a hidden FlipForge default", empty.cases[0].sellingCostsCents === 0);
  const out = api.labOutputMarkup(m, sim);
  check("simulation output is labelled a simulation", /SIMULATION · not a FlipForge decision · nothing is saved/.test(out));
  check("simulation output never prints a verdict word as a result", !/>(BUY|WATCH|VERIFY|PASS)</.test(out));
}

// 7. Copy and safety.
{
  const all = Object.values(IDS).map(id => api.dealCheckMarkup(model(id))).join("\n");
  check("no provider name in customer copy", !/card[\s_-]*sight/i.test(SOURCE) && !/card[\s_-]*sight/i.test(all));
  check("no 'verified/confirmed/trusted sales' claims", !/\b(verified|trusted)\s+(exact\s+)?(completed\s+)?sales?\b/i.test(all) && !/\bconfirmed\s+sales?\b/i.test(all));
  check("no guarantee or instruction language", !/\bguarantee(d)?\s+profit|\byou should buy\b|\bmust buy\b|\bact now\b|\bhurry\b/i.test(all));
  check("financial-advice disclosure present", /Not financial advice/.test(all));
  check("no individual sale prices, dates or links rendered", !/soldAt|saleDate|listingUrl|sourceUrl/.test(SOURCE.replace(/\/\*[\s\S]*?\*\//g, "")));
  check("renderer issues GET requests only", !/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(SOURCE));
  check("renderer fetches only allow-listed read routes", (SOURCE.match(/`\/api\/v1\/[a-z-]+\//g) || []).every(path => ["`/api/v1/opportunities/", "`/api/v1/lifecycle/"].includes(path)));
  check("no browser storage of simulations", !/localStorage\.setItem|sessionStorage\.setItem|indexedDB/.test(SOURCE));
  check("all money fields in markup come from money() (no raw cents)", !/\d{5,}¢/.test(all));
}

// 8. Typography floor: no font-size below 14px in Deal Check CSS.
{
  const sizes = [...CSS.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
  check("Deal Check CSS keeps every font-size at or above 14px", sizes.length > 0 && sizes.every(size => size >= 14), sizes.filter(size => size < 14).join(","));
  check("verdict uses 40/44 Black", /\.ffdc-verdict\s*\{[^}]*font-size:\s*40px;[^}]*line-height:\s*44px;[^}]*font-weight:\s*900/.test(CSS));
  check("figures use tabular numerals", /\.ffdc-figure > strong \{[^}]*tabular-nums/.test(CSS));
  check("reduced motion respected", /prefers-reduced-motion: reduce/.test(CSS));
  check("no blue or neon colours introduced", !/#(?:00f|0000ff|00bfff|39ff14|ff00ff)\b/i.test(CSS));
}

// 9. Activation: preview on, production off unless ?dealcheck=1, kill switch.
{
  const en = (hostname, pathname = "/app/beta/", search = "", disabled = false) => api.enabledFor({ hostname, pathname, search }, disabled);
  check("localhost on", en("127.0.0.1") === true && en("localhost") === true);
  check("deploy preview on", en("deploy-preview-601--goflipforge.netlify.app") === true);
  check("production app path off by default", en("goflipforge.com") === false && en("www.goflipforge.com") === false);
  check("production app path on only with ?dealcheck=1", en("goflipforge.com", "/app/beta/", "?dealcheck=1") === true && en("goflipforge.com", "/app/beta/", "?x=1&dealcheck=1") === true && en("goflipforge.com", "/app/beta/", "?dealcheck=10") === false);
  check("production non-app path stays off even with ?dealcheck=1", en("goflipforge.com", "/pricing.html", "?dealcheck=1") === false);
  check("unknown hosts off", en("evil.example") === false && en("goflipforge.com.evil.example", "/app/", "?dealcheck=1") === false);
  check("kill switch wins everywhere", en("127.0.0.1", "/app/", "", true) === false && en("goflipforge.com", "/app/", "?dealcheck=1", true) === false);
  check("runtime uses the same rule", /enabledFor\(window\.location, window\.FlipForgeDealCheckDisabled\)/.test(SOURCE));
  check("loads without a DOM (no side effects at import)", Boolean(load({ hostname: "goflipforge.com", pathname: "/app/beta/", search: "", hash: "" })));
}

// 10. Feature gating architecture: same decision for every tier; nothing withheld unless the server says false.
{
  check("feature registry maps Deal Check, Scenario Lab and receipt history", api.featureTiers.dealCheck === "SCOUT" && api.featureTiers.scenarioLab === "COLLECTOR" && api.featureTiers.receiptHistory === "PRO");
  check("no plan flags: every feature available (no entitlement change)", api.featureAvailable("scenarioLab", null) && api.featureAvailable("scenarioLab", { code: "SCOUT" }));
  check("explicit server false withholds only that workflow feature", api.featureAvailable("scenarioLab", { scenarioLab: false }) === false);
  const m = model(IDS.buy);
  check("tier never changes the verdict or Max Buy", api.dealModel(D[IDS.buy], null).verdict === m.verdict && api.dealModel(D[IDS.buy], null).maxBuyCents === m.maxBuyCents);
}

// 11. Shell wiring.
for (const shell of ["saas-prototype/index.html", "saas-prototype/customer.html"]) {
  const html = read(shell);
  check(`${shell} loads deal-check-v1.css`, html.includes('href="deal-check-v1.css"'));
  check(`${shell} loads deal-check-v1.js after the saved-decision renderer`, html.includes('src="deal-check-v1.js"') && html.indexOf('src="deal-check-v1.js"') > html.indexOf('src="customer-opportunities.js"'));
}

console.log("DealCheckV1Validation");
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.log(`FAIL: ${failure}`);
if (failures.length) process.exit(1);
