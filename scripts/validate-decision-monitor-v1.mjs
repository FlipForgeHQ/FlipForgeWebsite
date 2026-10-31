// Unit + static checks for Decision Change Monitor™ and Collection Intelligence™ (saas-prototype/decision-monitor-v1.js).
// Proves: signals come only from saved decisions, re-evaluation changes, saved counts and time; no verdict, Max Buy or
// value is computed; nothing claims live monitoring; card order is the server's; missing values are never $0.
import fs from "node:fs";
import vm from "node:vm";
import { details } from "./fixtures/deal-check/fixtures.mjs";
import { IDS, NOW, UNLINKED_ID, timelines, lifecycleRecords, lifecycleDetail, opportunitiesList, portfolio, alertsData } from "./fixtures/decision-monitor/fixtures.mjs";

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
  check("WATCH: provider catalog mapping alone never raises a card-match warning", !keys(r).includes("identity"));
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
  check("collection links each linked card to its Decision receipt", (html.match(/href="#\/opportunities\//g) || []).length >= view.rows.filter(r => r.linked).length);
  check("unlinked card has no Decision receipt link", !html.includes(`href="#/opportunities/${UNLINKED_ID}"`));
  check("collection markup never shows Max Buy $0.00", !/Max Buy \$0\.00/.test(html));
}

// Integration with backend Decision Review Signals (FlipForge2 #935 contract on /api/v1/alerts).
{
  const integrated = (id, feed, lifecycle = lifecycleRecords()[id]) => {
    const detail = lifecycleDetail(id);
    const timeline = M.timelineOf(detail);
    const model = M.dealModelOf(D[id].opportunity, timeline);
    return M.integrate(M.monitor(model, timeline, lifecycle, NOW), feed, { id, lifecycle, model });
  };
  const available = M.reviewSignalFeed(alertsData("available"));
  check("feed: backend contract recognised", available.status === "available" && available.signals.length > 0);
  check("feed: older backend without review signals → unsupported", M.reviewSignalFeed(alertsData("unsupported")).status === "unsupported");
  check("feed: failed request → unavailable", M.reviewSignalFeed(null, true).status === "unavailable");

  const buy = integrated(IDS.buy, available);
  const buyKeys = buy.signals.map(x => x.key);
  check("BUY: server MAX_BUY_CROSSED shown once, from the backend", buyKeys.filter(k => k === "srv-MAX_BUY_CROSSED").length === 1 && buy.signals.find(x => x.key === "srv-MAX_BUY_CROSSED").source === "FlipForge review signal");
  check("BUY: no separate ask-change note when the backend crossing states it", !buy.signals.some(x => x.key === "price"));
  const noCross = JSON.parse(JSON.stringify(alertsData("available")));
  noCross.decisionReviewSignals = noCross.decisionReviewSignals.filter(x => x.kind !== "MAX_BUY_CROSSED");
  check("ask change without a backend crossing stays information only", integrated(IDS.buy, M.reviewSignalFeed(noCross)).signals.find(x => x.key === "price")?.level === "info");
  check("BUY: server re-check replaces the website 30-day prompt (no duplicate)", buyKeys.includes("srv-DECISION_RECHECK_DUE") && !buy.signals.some(x => x.key === "age" && x.level === "review"));
  check("BUY: website-only explanations kept", buyKeys.includes("decision") && buyKeys.includes("evidence-reeval") && buyKeys.includes("paid"));
  check("BUY: verdict unchanged by integration", buy.verdict === "BUY");

  const verify = integrated(IDS.verify, available);
  check("VERIFY: pending verification comes from the backend, once", verify.signals.filter(x => x.key === "srv-VERIFICATION_PENDING").length === 1 && !verify.signals.some(x => x.key === "verify"));

  const down = integrated(IDS.verify, M.reviewSignalFeed(null, true));
  check("backend unavailable: says so, invents nothing", down.reviewSignalStatus === "unavailable" && down.signals.some(x => x.key === "review-signals-status" && /temporarily unavailable/.test(x.title))
    && !down.signals.some(x => ["verify", "legacy", "srv-VERIFICATION_PENDING"].includes(x.key)) && !down.signals.some(x => x.key === "age" && x.level === "review"));
  const old = integrated(IDS.watch, M.reviewSignalFeed(alertsData("unsupported")));
  check("older backend: review signals not available yet", old.reviewSignalStatus === "unsupported" && old.signals.some(x => /not available yet/.test(x.title)));
  const untracked = integrated(IDS.buy, available, { opportunityId: IDS.buy, trackingStatus: "WATCHING", version: 0 });
  check("untracked card: asks to track, shows no server prompts", untracked.reviewSignalStatus === "untracked" && !untracked.signals.some(x => x.key.startsWith("srv-")));

  // Contradictions: a server signal that disagrees with the saved decision is dropped and the drop is stated.
  const bad = JSON.parse(JSON.stringify(alertsData("available")));
  bad.decisionReviewSignals.push({ ...bad.decisionReviewSignals.find(x => x.kind === "VERIFICATION_PENDING"), opportunityId: IDS.buy, decision: "VERIFY" });
  const contra = integrated(IDS.buy, M.reviewSignalFeed(bad));
  check("contradiction: VERIFY signal for a BUY decision is not shown", !contra.signals.some(x => x.key === "srv-VERIFICATION_PENDING") && contra.signals.some(x => x.key === "review-signals-mismatch"));
  const authority = JSON.parse(JSON.stringify(alertsData("available")));
  authority.decisionReviewSignals.forEach(x => { if (x.opportunityId === IDS.watch) x.transactionAuthority = true; });
  check("signal claiming authority is rejected", !integrated(IDS.watch, M.reviewSignalFeed(authority)).signals.some(x => x.key.startsWith("srv-")));
  const dup = JSON.parse(JSON.stringify(alertsData("available")));
  dup.decisionReviewSignals.push(...dup.decisionReviewSignals.filter(x => x.opportunityId === IDS.watch));
  check("duplicate backend signals collapse to one", integrated(IDS.watch, M.reviewSignalFeed(dup)).signals.filter(x => x.key === "srv-DECISION_RECHECK_DUE").length === 1);
  check("other cards' signals are not shown", !integrated(IDS.pass, available).signals.some(x => x.key === "srv-MAX_BUY_CROSSED"));

  const view = M.collection(portfolio(), opportunitiesList().items, NOW, available);
  check("collection: need-another-look counts backend prompts", view.reviewSignalStatus === "available" && view.reverifyCount === 3, String(view.reverifyCount));
  check("collection: harder exits from saved exact-sale counts", view.hardExitCount === 1, String(view.hardExitCount));
  check("collection: unlinked card has no exit estimate", view.rows.find(r => r.id === UNLINKED_ID).exit === null);
  const downView = M.collection(portfolio(), opportunitiesList().items, NOW, M.reviewSignalFeed(null, true));
  check("collection: backend down → need-another-look shown as unavailable", /Review signals unavailable right now/.test(M.collectionMarkup(downView)));
}

// Markup safety and copy.
{
  const all = [IDS.buy, IDS.watch, IDS.verify, IDS.legacy].map(id => M.monitorMarkup(id, cardResult(id), { compact: id === IDS.buy, trackingHref: "#/tracking/x" })).join("\n")
    + M.collectionMarkup(M.collection(portfolio(), opportunitiesList().items, NOW));
  check("states what is not re-checked", /Not re-checked since the decision/.test(all) && /Live asking prices/.test(all) && /does not watch prices between re-evaluations/.test(all));
  check("no live/real-time monitoring claims", !/real[- ]time|live monitoring|we watch|monitoring the market|continuously/i.test(all));
  check("no provider name", !/card[\s_-]*sight/i.test(SOURCE + all));
  check("no 'verified/confirmed/trusted sales' wording", !/\b(verified|trusted)\s+(exact\s+)?(completed\s+)?sales?\b/i.test(all) && !/\bconfirmed\s+sales?\b/i.test(all));
  check("no instruction language", !/\byou should (buy|sell)\b|\bsell now\b|\bbuy now\b|\bact now\b/i.test(all));
  check("escapes server text", M.monitorMarkup("x", { available: true, signals: [{ key: "k", level: "review", title: "<img src=x>", detail: "d", source: "s" }], scope: [], verdict: "BUY" }).includes("&lt;img"));
  check("GET only, allow-listed routes", !/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(SOURCE)
    && (SOURCE.match(/["`]\/api\/v1\/[a-z-]+/g) || []).every(p => ["/api/v1/opportunities", "/api/v1/lifecycle", "/api/v1/portfolio", "/api/v1/alerts"].includes(p.slice(1))), (SOURCE.match(/["`]\/api\/v1\/[a-z-]+/g) || []).join(","));
  check("no browser storage", !/localStorage|sessionStorage|indexedDB/.test(SOURCE));
  check("no browser sorting", !/\.sort\(|\.toSorted\(/.test(SOURCE));
  check("activation reuses the Deal Check rule + own kill switch", /deal\.enabledFor\(window\.location/.test(SOURCE) && /FlipForgeDecisionMonitorDisabled === true/.test(SOURCE));
}

// v1.1: four explicit groups — needs attention / what changed / as saved (historical) / not re-checked.
{
  const CATS = ["changed", "historical", "not-rechecked"];
  const results = [IDS.buy, IDS.watch, IDS.verify, IDS.legacy].map(cardResult);
  check("v1.1: every monitor signal has a category", results.every(r => r.signals.every(x => CATS.includes(x.category))),
    results.flatMap(r => r.signals.filter(x => !CATS.includes(x.category)).map(x => x.key)).join(","));
  const buyHtml = M.monitorMarkup(IDS.buy, cardResult(IDS.buy));
  check("v1.1: BUY shows attention, changed, historical and not-re-checked groups in that order",
    ["attention", "changed", "historical", "not-rechecked"].map(g => buyHtml.indexOf(`data-ffdm-group="${g}"`)).every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1])));
  check("v1.1: a recorded decision change needing review is labelled as a change", /data-ffdm-signal="decision" data-ffdm-category="changed"/.test(buyHtml) && /Changed · Re-evaluation/.test(buyHtml));
  const watch = cardResult(IDS.watch);
  const watchHtml = M.monitorMarkup(IDS.watch, watch);
  check("v1.1: never re-evaluated → 'changed' says nothing was recorded and why",
    /data-ffdm-empty="changed"/.test(watchHtml) && /has not been re-evaluated since the decision/.test(watchHtml) && /not re-evaluated since/.test(watchHtml));
  check("v1.1: 'asking price not re-checked' sits in the not-re-checked group",
    watch.signals.find(x => x.key === "price-unmonitored")?.category === "not-rechecked"
    && watchHtml.indexOf('data-ffdm-signal="price-unmonitored"') > watchHtml.indexOf('data-ffdm-group="not-rechecked"'));
  check("v1.1: what is not monitored is always visible (not collapsed)", /<ul class="ffdm-scope-list" data-ffdm-scope>/.test(watchHtml) && !/<details[^>]*data-ffdm-scope/.test(watchHtml));

  // Earlier-rules disclosure (FlipForge2 #950 governed decisionRules; #935 v1.1 signal field).
  const disclosure = "Decided on Oct 1, 2026 under earlier rules. This saved decision, its Max Buy and its receipt are kept exactly as they were made.";
  const earlierOpp = JSON.parse(JSON.stringify(D[IDS.buy].opportunity));
  earlierOpp.governedDecision.decisionRules = { decidedUnderEarlierRules: true, savedPolicyVersion: "profitability-margin-of-safety-v1.1", disclosure, savedDecisionRescored: false };
  const earlierModel = M.dealModelOf(earlierOpp, null);
  const earlier = M.monitor(earlierModel, null, null, NOW);
  const er = earlier.signals.find(x => x.key === "earlier-rules");
  check("v1.1: decision under earlier rules → historical note with the server's disclosure, not a review item",
    er && er.category === "historical" && er.level === "info" && er.detail === disclosure && earlierModel.maxBuyCents === M.dealModelOf(D[IDS.buy].opportunity, null).maxBuyCents);
  check("v1.1: today's-rules decision has no earlier-rules note", !cardResult(IDS.buy).signals.some(x => x.key === "earlier-rules"));
  const flagged = JSON.parse(JSON.stringify(alertsData("available")));
  flagged.decisionReviewSignals.forEach(x => { if (x.opportunityId === IDS.buy) x.decidedUnderEarlierRules = true; });
  const viaServer = (() => {
    const detail = lifecycleDetail(IDS.buy); const timeline = M.timelineOf(detail);
    const model = M.dealModelOf(D[IDS.buy].opportunity, timeline);
    return M.integrate(M.monitor(model, timeline, lifecycleRecords()[IDS.buy], NOW), M.reviewSignalFeed(flagged), { id: IDS.buy, lifecycle: lifecycleRecords()[IDS.buy], model });
  })();
  check("v1.1: server flag adds the earlier-rules note once when the saved model lacks it",
    viaServer.signals.filter(x => x.key === "earlier-rules").length === 1 && viaServer.signals.find(x => x.key === "earlier-rules").category === "historical");
  const both = M.integrate(earlier, M.reviewSignalFeed(flagged), { id: IDS.buy, lifecycle: lifecycleRecords()[IDS.buy], model: earlierModel });
  check("v1.1: model and server both say earlier rules → still one note", both.signals.filter(x => x.key === "earlier-rules").length === 1);
  check("v1.1: verdict and Max Buy unchanged by the rules note", both.verdict === earlier.verdict && viaServer.verdict === "BUY");

  const legacy = cardResult(IDS.legacy).signals.find(x => x.key === "legacy");
  check("v1.1: legacy wording describes evidence no longer accepted, never 'earlier rules'",
    /sale evidence FlipForge no longer accepts/.test(legacy.title) && !/earlier rules|current evidence rules/i.test(legacy.title + legacy.detail));
  const serverLegacy = M.integrate(cardResult(IDS.legacy), { status: "available", signals: [{ opportunityId: IDS.legacy, kind: "LEGACY_DECISION", decision: cardResult(IDS.legacy).verdict, transactionAuthority: false, historicalRescoring: false }] },
    { id: IDS.legacy, lifecycle: { opportunityId: IDS.legacy, trackingStatus: "WATCHING", version: 1 }, model: M.dealModelOf(D[IDS.legacy].opportunity, null) });
  const sl = serverLegacy.signals.find(x => x.key === "srv-LEGACY_DECISION");
  check("v1.1: server legacy signal uses the same wording and is historical", sl && /no longer accepts/.test(sl.title) && sl.category === "historical");
  const buyIntegrated = viaServer.signals.find(x => x.key === "srv-MAX_BUY_CROSSED");
  check("v1.1: Max Buy crossing is a recorded change; re-check due is historical",
    buyIntegrated?.category === "changed" && viaServer.signals.find(x => x.key === "srv-DECISION_RECHECK_DUE")?.category === "historical");
  const statusOnly = M.integrate(cardResult(IDS.verify), M.reviewSignalFeed(null, true), { id: IDS.verify, lifecycle: lifecycleRecords()[IDS.verify], model: M.dealModelOf(D[IDS.verify].opportunity, null) });
  check("v1.1: review-signal outage is listed under not re-checked", statusOnly.signals.find(x => x.key === "review-signals-status")?.category === "not-rechecked");
  check("v1.1: Portfolio tile no longer says 'old rules'", !/old rules/.test(M.collectionMarkup(M.collection(portfolio(), opportunitiesList().items, NOW, M.reviewSignalFeed(alertsData("available"))))));
}

// v1.1.1: no false changes from the containment-era data shape; identity from FlipForge's own governed checks only.
{
  const live = JSON.parse(JSON.stringify(D[IDS.buy].opportunity));
  live.evidence = { ...live.evidence, acceptedSales: 0, priceStatus: "LIVE_PRICING_ONLY" };
  const model = M.dealModelOf(live, null);
  const r = M.monitor(model, null, null, NOW);
  check("v1.1.1: live-only pricing (no sale records kept) → saved-sales count not applicable, no 'fewer sales' change",
    model.currentSavedSales === null && !keys(r).includes("evidence-count"));
  const flagged = JSON.parse(JSON.stringify(D[IDS.watch].opportunity));
  flagged.governedDecision.verificationChecklist = { items: [{ code: "LISTING_NOT_CONFIRMED", category: "IDENTITY", issue: "FlipForge couldn't confirm that this listing is this exact card." }] };
  const fr = M.monitor(M.dealModelOf(flagged, null), null, null, NOW);
  check("v1.1.1: a governed identity issue on a non-VERIFY decision → 'Card match needs checking' with the server's reason",
    sig(fr, "identity")?.title === "Card match needs checking" && /couldn't confirm/.test(sig(fr, "identity").detail));
  const unmapped = JSON.parse(JSON.stringify(D[IDS.buy].opportunity));
  unmapped.mappingState = "NOT_CONFIRMED";
  check("v1.1.1: provider mapping NOT_CONFIRMED on a governed BUY raises nothing",
    !keys(M.monitor(M.dealModelOf(unmapped, null), null, null, NOW)).includes("identity"));
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
