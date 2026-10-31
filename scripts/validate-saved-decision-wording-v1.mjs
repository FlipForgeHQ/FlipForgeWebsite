// Unit checks for the customer wording helpers in customer-trust-display-v1.js (PR #604). No browser needed.
// A missing number must never become 0 or $0.00; dates are shown in UTC as recorded; internal codes are never shown.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const source = fs.readFileSync(path.join(root, "saas-prototype/customer-trust-display-v1.js"), "utf8");
const noop = () => {};
const documentStub = { querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, readyState: "complete" };
const window = { addEventListener: noop, location: { hash: "", pathname: "/app/beta/", hostname: "goflipforge.com" } };
const context = vm.createContext({ window, document: documentStub, Intl, Math, Date, Object, Array, String, Number, Boolean, RegExp, Set, Map, JSON, Error,
  console, setTimeout, clearTimeout, MutationObserver: class { observe() {} disconnect() {} }, sessionStorage: { getItem: () => null, setItem: noop } });
vm.runInContext(source, context, { filename: "customer-trust-display-v1.js" });
const T = window.FlipForgeTrustDisplay;

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });
check("W00 helpers exported", T && ["readableDateTime", "centsText", "countText", "customerChangeLines", "customerErrorText"].every(k => typeof T[k] === "function"));

// Counts and money: missing stays missing.
check("W01 countText(null) is unavailable", T.countText(null) === "unavailable");
check("W02 countText(undefined) is unavailable", T.countText(undefined) === "unavailable");
check("W03 countText(\"\") is unavailable", T.countText("") === "unavailable");
check("W04 countText(0) is 0", T.countText(0) === "0");
check("W05 countText(8) is 8", T.countText(8) === "8");
check("W06 centsText(null) is empty, not $0.00", T.centsText(null) === "");
check("W07 centsText(undefined) is empty", T.centsText(undefined) === "");
check("W08 centsText(0) is $0.00", T.centsText(0) === "$0.00");
check("W09 centsText(-244) uses a minus sign", T.centsText(-244) === "−$2.44", T.centsText(-244));
check("W10 centsText(17791) is $177.91", T.centsText(17791) === "$177.91");

// Change lines.
const lines = T.customerChangeLines({ changes: [
  { code: "ACCEPTED_EVIDENCE_CHANGED", before: null, after: 8 },
  { code: "ASK_CHANGED", before: null, after: 17791 },
  { code: "CONFIDENCE_CHANGED", before: 70, after: null },
  { code: "WORKFLOW_STATUS_CHANGED", before: "ACTIVE_WATCHLIST", after: "READY_FOR_OPERATOR_REVIEW" },
  { code: "DECISION_CHANGED", before: "WATCH", after: "BUY" },
  { code: "PROFITABILITY_GATE_CHANGED", before: "MARGIN_OF_SAFETY_NOT_MET", after: "BUY_ELIGIBLE" },
  { code: "NEW_UNMAPPED_CHANGED", description: "Thing changed from FOO_BAR to BAZ_QUX." }
] });
check("W11 unknown earlier count reads unavailable", lines.includes("Accepted exact sales changed from unavailable to 8."), JSON.stringify(lines));
check("W12 unknown earlier ask is not shown as $0.00", lines.includes("All-in ask changed.") && !lines.some(l => /\$0\.00/.test(l)), JSON.stringify(lines));
check("W13 unknown later score reads unavailable", lines.includes("Confidence changed from 70 to unavailable."), JSON.stringify(lines));
check("W14 workflow states hidden", !lines.some(l => /workflow|ACTIVE_WATCHLIST|READY_FOR/i.test(l)));
check("W15 verdict change in words", lines.includes("Decision changed from WATCH to BUY."));
check("W16 profit check in words", lines.includes('Profit check changed from "below the safety margin" to "meets the buying standard".'));
check("W17 unmapped codes put into words", lines.includes("Thing changed from foo bar to baz qux."), JSON.stringify(lines));
const legacyLines = T.customerChangeLines({ whatChanged: ["Decision changed from VERIFY to WATCH.", "Workflow status changed from A_B to C_D."] });
check("W18 sentence-only history kept, workflow sentence dropped", legacyLines.length === 1 && legacyLines[0] === "Decision changed from VERIFY to WATCH.", JSON.stringify(legacyLines));

// Review on #604: a structured entry without before/after keeps the server's sentence, and recorded sentences the
// structured entries do not cover are kept (fixture from scripts/fixtures/deal-check/fixtures.mjs).
const partial = T.customerChangeLines({ changes: [{ code: "ASK_CHANGED", description: "All-in ask fell from $680.00 to $599.95" }],
  whatChanged: ["All-in ask fell from $680.00 to $599.95", "Decision changed from WATCH to BUY"] });
check("W25 description-only structured change keeps the recorded amounts", partial.includes("All-in ask fell from $680.00 to $599.95."), JSON.stringify(partial));
check("W26 uncovered recorded sentence is kept", partial.includes("Decision changed from WATCH to BUY."), JSON.stringify(partial));
check("W27 the same change is never listed twice", partial.length === 2, JSON.stringify(partial));
const mixed = T.customerChangeLines({ changes: [{ code: "DECISION_CHANGED", before: "WATCH", after: "BUY" }],
  whatChanged: ["Decision changed from WATCH to BUY.", "Workflow status changed from A_B to C_D.", "Population context changed."] });
check("W28 covered sentence dropped, workflow dropped, new detail kept", JSON.stringify(mixed) === JSON.stringify(["Decision changed from WATCH to BUY.", "Population context changed."]), JSON.stringify(mixed));

// Dates.
check("W19 ISO date-time to readable UTC", T.readableDateTime("2026-10-31T13:55:33.866282507Z") === "Oct 31, 2026, 1:55 PM UTC", T.readableDateTime("2026-10-31T13:55:33.866282507Z"));
check("W20 date only", T.readableDateTime("2026-10-08T17:55:16Z", { dateOnly: true }) === "Oct 8, 2026");
check("W21 midnight UTC is 12:00 AM", T.readableDateTime("2026-10-08T00:05:00Z") === "Oct 8, 2026, 12:05 AM UTC");
check("W22 non-ISO text unchanged", T.readableDateTime("Saved observation") === "Saved observation");

// Errors.
const notFound = T.customerErrorText({ code: "RESOURCE_NOT_FOUND", status: 404 }, "reported sales on this card");
check("W23 not-found is plain words with no code", notFound.title === "Nothing saved for reported sales on this card yet." && !notFound.reference);
const contract = T.customerErrorText({ code: "SALES_CONTRACT_INVALID", status: 502, message: "SALES_CONTRACT_INVALID" }, "reported sales");
check("W24 other failures keep the code only as a reference", contract.title === "Couldn't load reported sales right now." && contract.reference === "SALES_CONTRACT_INVALID" && !/SALES_CONTRACT_INVALID/.test(contract.detail));

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.ok || !r.detail ? "" : ` [${r.detail}]`}`);
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
