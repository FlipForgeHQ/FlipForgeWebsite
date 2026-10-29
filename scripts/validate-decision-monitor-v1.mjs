// Unit + static checks for Decision Change Monitor™ and Collection Intelligence™ (saas-prototype/decision-monitor-v1.js).
// Proves: signals come only from saved decisions, re-evaluation changes, saved counts and time; no verdict, Max Buy or
// value is computed; nothing claims live monitoring; card order is the server's; missing values are never $0.
import fs from "node:fs";
import vm from "node:vm";
import { details } from "./fixtures/deal-check/fixtures.mjs";
import { IDS, NOW, UNLINKED_ID, timelines, lifecycleRecords, lifecycleDetail, opportunitiesList, portfolio } from "./fixtures/decision-monitor/fixtures.mjs";

const read = f => fs.readFileSync(f, "utf8");
const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);
const SOURCE = read("saas-prototype/decision-monitor-v1.js");
const CSS = read("saas-prototype/decision-monitor-v1.css");

const window = { location: { hostname: "example.invalid", pathname: "/", search: "", hash: "" } };
const context = vm.createContext({ window, Intl, Date, Number, String, Object, Array, Math, JSON, Map, Set, console });
vm.runInContext(read("saas-prototype/deal-check-v1.js"), context, { filename: "deal-check-v1.js" });
vm.runInContext(SOURCE, context, { filename: "decision-monitor-v1.js" });
const M = window.FlipForgeDecisionMonitor;
check("exports the monitor API", M && typeof M.monitor === "function" && typeof M.collection === "function");

const D = details();
const cardResult = id => {
  const detail = lifecycleDetail(id);
  const timeline = M.timelineOf(detail);
  return M.monitor(M.dealModelOf(D[id].opportunity, timeline), timeline, detail.lifecycle, NOW);
};
const keys = r => r.signals.map(s => s.key);
const sig = (r, key) => r.signals.find(s => s.key === key);

// Re-evaluated BUY: decision change, ask crossing Max Buy, more evidence, owned below Max Buy.
{
  const r = cardResult(IDS.buy);
  const maxBuy = D[IDS.buy].opportunity.governedDecision.maximumBuyPriceCents;
  check("BUY: decision change from the timeline", sig(r, "decision")?.level === "review" && /WATCH → BUY/.test(sig(r, "decision").title));
  check("BUY: ask change shown against the saved Max Buy", sig(r, "price")?.level === "review" && sig(r, "price").detail.includes("$680.00") && sig(r, "price").detail.includes("$599.95") && /inside the Max Buy/.test(sig(r, "price").detail), sig(r, "price")?.detail);
  check("BUY: no 'not re-checked' note when a re-evaluation observed the price", !keys(r).includes("price-unmonitored"));
  check("BUY: accepted-evidence change from the timeline", Boolean(sig(r, "evidence-reeval")));
  check("BUY: risk fell, so no risk-rose signal", !keys(r).includes("risk"));
  check("BUY: decision age 33 days → re-check", sig(r, "age")?.level === "review" && /33 days/.test(sig(r, "age").title), sig(r, "age")?.title);
  check("BUY: paid vs Max Buy uses the customer cost and the saved Max Buy", sig(r, "paid")?.level === "ok" && sig(r, "paid").title.includes(`$${((maxBuy - 61000) / 100).toFixed(2)} under`), sig(r, "paid")?.title);
  check("BUY: verdict is the governed verdict", r.verdict === "BUY" && r.reEvaluations === 1);
}

// Single-snapshot WATCH: price not re-checked, identity, age.
{
  const r = cardResult(IDS.watch);
  check("WATCH: price not re-checked is stated, not invented", sig(r, "price-unmonitored")?.level === "info" && /does not watch live listings/.test(sig(r, "price-unmonitored").detail));
  check("WATCH: card match not confirmed → review", sig(r, "identity")?.level === "review");
  check("WATCH: no decision-change or ask-change without a re-evaluation", !keys(r).includes("decision") && !keys(r).includes("price"));
}

// VERIFY: renewed verification; no paid-vs-Max-Buy (no Max Buy).
{
  const r = cardResult(IDS.verify);
  check("VERIFY: still needs verification", sig(r, "verify")?.level === "review");
  check("VERIFY: no paid-vs-Max-Buy without a Max Buy", !keys(r).includes("paid"));
}

// Legacy: re-evaluate under current rules.
check("legacy: renewed verification under current rules", sig(cardResult(IDS.legacy), "legacy")?.level === "review");

// Evidence count drift under containment (fewer saved now) is informational, never alarming.
{
  const opp = JSON.parse(JSON.stringify(D[IDS.watch].opportunity));
  opp.evidence.acceptedSales = 0;
  const r = M.monitor(M.dealModelOf(opp, null), null, null, NOW);
  check("fewer saved sales now: info only, decision unchanged", sig(r, "evidence-count")?.level === "info" && /decision itself is unchanged/.test(sig(r, "evidence-count").detail));
  const more = JSON.parse(JSON.stringify(D[IDS.watch].opportunity));
  more.evidence.acceptedSales = 70;
  const r2 = M.monitor(M.dealModelOf(more, null), null, null, NOW);
  check("more saved sales now: review, not rescored", sig(r2, "evidence-count")?.level === "review" && /not rescored/.test(sig(r2, "evidence-count").detail));
}

// Old newest sale.
{
  const opp = JSON.parse(JSON.stringify(D[IDS.buy].opportunity));
  opp.evidence.latestSaleDate = "2026-09-01T00:00:00Z";
  const r = M.monitor(M.dealModelOf(opp, null), null, null, NOW);
  check("newest saved sale over 30 days → review", sig(r, "evidence-age")?.level === "review");
}

// Risk rose / confidence fell at re-evaluation.
{
  const tl = { entries: [{ evaluatedAt: "2026-10-20T00:00:00Z", decision: "WATCH" }, { evaluatedAt: "2026-10-27T00:00:00Z", decision: "WATCH",
    changes: [{ code: "RISK_CHANGED", before: 40, after: 72 }, { code: "CONFIDENCE_CHANGED", before: 80, after: 61 }, { code: "IDENTITY_ELIGIBILITY_CHANGED", before: true, after: false }] }] };
  const r = M.monitor(M.dealModelOf(D[IDS.buy].opportunity, tl), tl, null, NOW);
  check("risk rose → review", sig(r, "risk")?.level === "review" && /40 → 72/.test(sig(r, "risk").title));
  check("confidence fell → review", sig(r, "confidence")?.level === "review");
  check("identity eligibility lost → review", sig(r, "identity")?.level === "review" && /no longer confirmed/.test(sig(r, "identity").title));
}

// No model → unavailable, nothing guessed.
check("no saved decision: unavailable, no signals", M.monitor(null, null, null, NOW).available === false && M.monitor(null, null, null, NOW).signals.length === 0);

// Monitor never computes or changes a verdict, Max Buy or value; saved model is not mutated.
{
  const model = M.dealModelOf(D[IDS.buy].opportunity, M.timelineOf(lifecycleDetail(IDS.buy)));
  const before = JSON.stringify(model);
  M.monitor(model, M.timelineOf(lifecycleDetail(IDS.buy)), lifecycleRecords()[IDS.buy], NOW);
  check("saved decision model is not mutated", JSON.stringify(model) === before);
  check("source never assigns a verdict or Max Buy", !/\.(recommendation|maximumBuyPriceCents|maxBuyCents|verdict)\s*=[^=]/.test(SOURCE));
}

// Collection Intelligence.
{
  const view = M.collection(portfolio(), opportunitiesList().items, NOW);
  const order = portfolio().items.map(i => i.opportunityId);
  check("collection keeps the server's card order", JSON.stringify(view.rows.map(r => r.id)) === JSON.stringify(order));
  check("attention is a filtered subset in server order", JSON.stringify(view.attention.map(r => r.id)) === JSON.stringify(order.filter(id => view.attention.some(a => a.id === id))));
  check("cost basis is the server total", view.totalCostBasisCents === portfolio().totalCostBasisCents);
  const verifyCost = lifecycleRecords()[IDS.verify].acquisitionCostCents;
  const unlinkedCost = lifecycleRecords()[UNLINKED_ID].acquisitionCostCents;
  check("cost without supported value = VERIFY + unlinked", view.unsupportedCostCents === verifyCost + unlinkedCost && view.unsupportedCount === 2, String(view.unsupportedCostCents));
  check("paid above Max Buy counted from saved Max Buy (WATCH only)", view.overMaxBuyCount === 1 && view.rows.find(r => r.id === IDS.watch).paidVsMaxBuyCents > 0, String(view.overMaxBuyCount));
  check("unlinked card is reported, not guessed", view.unlinkedCount === 1 && view.rows.find(r => r.id === UNLINKED_ID).linked === false);
  check("unlinked card is in the review list", view.attention.some(r => r.id === UNLINKED_ID && r.review.some(s => s.key === "unlinked")));
  check("aged cost basis uses decision age ≥ 30 days (unlinked card has no decision age)", view.agedCount === 3 && view.rows.find(r => r.id === UNLINKED_ID).ageDays === null, String(view.agedCount));
  const html = M.collectionMarkup(view);
  check("collection markup shows no market value claim", !/market value of|worth \$|current value \$/i.test(html) && /No current market value is shown/.test(html));
  check("collection links each card to its Decision receipt and Monitor", (html.match(/href="#\/opportunities\//g) || []).length >= view.rows.length);
  check("collection markup never shows Max Buy $0.00", !/Max Buy \$0\.00/.test(html));
}

// Markup safety and copy.
{
  const all = [IDS.buy, IDS.watch, IDS.verify, IDS.legacy].map(id => M.monitorMarkup(id, cardResult(id), { compact: id === IDS.buy, trackingHref: "#/tracking/x" })).join("\n")
    + M.collectionMarkup(M.collection(portfolio(), opportunitiesList().items, NOW));
  check("states what is not monitored yet", /What FlipForge is not monitoring yet/.test(all) && /Live asking prices/.test(all));
  check("no live/real-time monitoring claims", !/real[- ]time|live monitoring|we watch|monitoring the market|continuously/i.test(all));
  check("no provider name", !/card[\s_-]*sight/i.test(SOURCE + all));
  check("no 'verified/confirmed/trusted sales' wording", !/\b(verified|trusted)\s+(exact\s+)?(completed\s+)?sales?\b/i.test(all) && !/\bconfirmed\s+sales?\b/i.test(all));
  check("no instruction language", !/\byou should (buy|sell)\b|\bsell now\b|\bbuy now\b|\bact now\b/i.test(all));
  check("escapes server text", M.monitorMarkup("x", { available: true, signals: [{ key: "k", level: "review", title: "<img src=x>", detail: "d", source: "s" }], scope: [], verdict: "BUY" }).includes("&lt;img"));
  check("GET only, allow-listed routes", !/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(SOURCE)
    && (SOURCE.match(/["`]\/api\/v1\/[a-z-]+/g) || []).every(p => ["/api/v1/opportunities", "/api/v1/lifecycle", "/api/v1/portfolio"].includes(p.slice(1))), (SOURCE.match(/["`]\/api\/v1\/[a-z-]+/g) || []).join(","));
  check("no browser storage", !/localStorage|sessionStorage|indexedDB/.test(SOURCE));
  check("no browser sorting", !/\.sort\(|\.toSorted\(/.test(SOURCE));
  check("activation reuses the Deal Check rule + own kill switch", /deal\.enabledFor\(window\.location/.test(SOURCE) && /FlipForgeDecisionMonitorDisabled === true/.test(SOURCE));
}

// CSS floor.
{
  const sizes = [...CSS.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
  check("no font-size below 14px", sizes.length > 0 && sizes.every(s => s >= 14), sizes.filter(s => s < 14).join(","));
}

// Shell wiring: monitor loads after Deal Check in both shells.
for (const shell of ["saas-prototype/index.html", "saas-prototype/customer.html"]) {
  const html = read(shell);
  check(`${shell} loads decision-monitor after deal-check`, html.includes('href="decision-monitor-v1.css"') && html.indexOf('src="decision-monitor-v1.js"') > html.indexOf('src="deal-check-v1.js"') && html.includes('src="deal-check-v1.js"'));
}

console.log("DecisionMonitorV1Validation");
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
for (const f of failures) console.log(`FAIL: ${f}`);
if (failures.length) process.exit(1);
