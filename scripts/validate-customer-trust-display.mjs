// Static and unit checks for the shared customer trust display helpers (saas-prototype/customer-trust-display-v1.js)
// and the display rules built on them. Display only: nothing here may compute or change a decision value.
//
//   - Scores: a returned number is shown as returned ("35/100", a real 0 stays "0/100"); a missing one is
//     "Unavailable", never 0 or 100.
//   - Decision risk: governedDecision.risk first, then risk; never scraped from page text (the old scrape turned
//     "35/100" into 35100 and showed "High — 100/100").
//   - Legacy results: only a record carrying evidenceProvenanceStatus other than CURRENT is labelled legacy.
//   - Source codes: EBAY -> "eBay (reported sale)", SOLD_COMP* -> "Reported completed sale", provider -> "our data
//     provider"; no raw codes.
//   - Evidence rows without prices or dates render without blank, "undefined" or "$0" cells.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const checks = [];
const check = (name, ok, detail = "") => checks.push([detail && !ok ? `${name} [${detail}]` : name, Boolean(ok)]);

const sandbox = { window: { sessionStorage: { getItem: key => (key === "flipforge.trackingContext.v1" ? sandbox.active : null) } }, Intl, Number, String, Math, Object, Array, JSON };
vm.createContext(sandbox);
vm.runInContext(read("saas-prototype/customer-trust-display-v1.js"), sandbox, { filename: "customer-trust-display-v1.js" });
const T = sandbox.window.FlipForgeTrustDisplay;
check("shared helper loads and is frozen", Boolean(T) && Object.isFrozen(T));

// Scores
check("score 35 -> 35/100", T.scoreText(35) === "35/100");
check("a real 0 stays 0/100", T.scoreText(0) === "0/100");
for (const missing of [null, undefined, "", "abc", true]) check(`missing score ${JSON.stringify(missing)} -> Unavailable`, T.scoreText(missing) === "Unavailable", T.scoreText(missing));

// Risk
check("governedDecision.risk is preferred", T.riskValue({ risk: 80, governedDecision: { risk: 35 } }) === 35);
check("risk is the fallback", T.riskValue({ risk: 35, governedDecision: { available: false } }) === 35);
check("no risk at all -> null (shown as Unavailable)", T.riskValue({ risk: null, governedDecision: { risk: null } }) === null && T.scoreText(T.riskValue({})) === "Unavailable");
check("risk bands keep the existing thresholds", T.riskBand(34) === "Low" && T.riskBand(35) === "Moderate" && T.riskBand(69) === "Moderate" && T.riskBand(70) === "High" && T.riskBand(null) === "Unavailable");
check("risk 35 is Moderate, never High 100", T.riskBand(T.riskValue({ risk: 35, governedDecision: { risk: 35 } })) === "Moderate");

// Legacy
const legacy = { evidenceProvenanceStatus: "LEGACY_CARDSIGHT_DERIVED", legacyNotice: "Saved before current evidence rules. The original evidence is withheld pending data licensing review; this result is not presented as currently supported." };
check("legacy status is recognised", T.isLegacy(legacy));
check("CURRENT is not legacy", !T.isLegacy({ evidenceProvenanceStatus: "CURRENT" }) && !T.isLegacy({ evidenceProvenanceStatus: "current" }));
check("records without the field are not legacy", !T.isLegacy({}) && !T.isLegacy(null) && !T.isLegacy({ evidenceProvenanceStatus: "" }) && T.legacyMarkup({}) === "");
const markup = T.legacyMarkup(legacy);
check("legacy markup has the badge and the server's notice", markup.includes(T.LEGACY_BADGE) && markup.includes("withheld pending data licensing review") && markup.includes("data-ff-legacy-result"));
check("legacy notice never names the provider", !/card\s*_?sight/i.test(T.legacyMarkup({ ...legacy, legacyNotice: "CardSight-derived" })));

// Source wording
const sources = {
  CARDSIGHT_EBAYSOLD_COMP: "eBay (reported sale)", CARDSIGHT_EBAY: "eBay (reported sale)", EBAY: "eBay (reported sale)", eBay: "eBay (reported sale)",
  SOLD_COMP: "Reported completed sale", SOLD_COMP_AUCTION: "Reported completed sale", CardSight: "our data provider", CARDSIGHT: "our data provider", GOLDIN: "Goldin"
};
for (const [code, label] of Object.entries(sources)) check(`source ${code} -> ${label}`, T.sourceLabel(code) === label, T.sourceLabel(code));
check("price-status label is read from the API", T.priceStatusLabel(null, { priceStatusLabel: "Reported sale prices, matched to the exact card" }) === "Reported sale prices, matched to the exact card");

// Evidence rows without prices or dates
const withheld = T.evidenceTable([{ sourceName: "CardSight", type: "CARDSIGHT_EBAYSOLD_COMP", authorityEligible: true }, { sourceName: "CARDSIGHT_EBAY", type: "SOLD_COMP" }], { identityCell: () => "Exact match", statusCell: () => "Counted now" });
check("withheld prices: no Amount or Sale date column", !withheld.includes("<th>Amount</th>") && !withheld.includes("<th>Sale date</th>"));
check("withheld prices: no blank, $0, undefined or provider name", !/\$0\b|undefined|NaN|<td><\/td>|card\s*_?sight/i.test(withheld), withheld);
check("withheld prices: a note says counts and categories are shown", withheld.includes("Individual sale prices and dates are not shown"));
const priced = T.evidenceTable([{ sourceName: "eBay", type: "SOLD_COMP", amount: 1650, soldAt: "2026-10-01T00:00:00Z" }]);
check("returned prices and dates are shown", priced.includes("<th>Amount</th>") && priced.includes("$1,650") && priced.includes("2026-10-01"));

// Active card
sandbox.active = "qa-b";
check("remembered active card is used when the tenant has it", T.activeCardId(["qa-a", "qa-b"]) === "qa-b");
check("remembered active card the tenant does not have is ignored", T.activeCardId(["qa-a"]) === "");
sandbox.window.sessionStorage.getItem = () => { throw new Error("blocked"); };
check("unavailable session storage never throws", T.activeCardId(["qa-a"]) === "");

// Display rules built on the helper
const clarity = read("saas-prototype/customer-decision-clarity-v1.js");
const firstValue = read("saas-prototype/customer-first-value-v1.js");
const passport = read("saas-prototype/decision-card-evidence-v1.js");
const prototypeFiles = fs.readdirSync(path.join(root, "saas-prototype")).filter(file => file.endsWith(".js"));
const scrapers = prototypeFiles.filter(file => /replace\(\/\[\^0-9\.\]\/g, ""\)/.test(read(`saas-prototype/${file}`)));
check("no customer page builds a score by deleting every non-digit from page text", scrapers.length === 0, scrapers.join(", "));
check("card detail reads decision risk from the saved record", clarity.includes("window.FlipForgeTrustDisplay.riskValue(record)"));
check("card detail never calls the decision risk \"final\"", !/final saved decision risk/i.test(clarity));
check("evaluation result reads only a whole N/100 risk score", firstValue.includes("\\s*\\/\\s*100\\s*$"));
check("evidence passport accepts the renamed labels and reads the saved record", passport.includes('["Listing price", "Current ask"]') && passport.includes('["Decision risk", "Risk"]') && passport.includes("scoreFromRecord(record"));
for (const shell of ["saas-prototype/index.html", "saas-prototype/customer.html"]) {
  const html = read(shell);
  check(`${shell} loads the shared helper before the renderers`, html.includes('src="customer-trust-display-v1.js"')
    && html.indexOf('src="customer-trust-display-v1.js"') < html.indexOf('src="customer-opportunities.js"')
    && html.includes('href="customer-trust-display-v1.css"'));
}
const css = read("saas-prototype/customer-trust-display-v1.css");
check("disabled buttons look unavailable", /\.button:disabled,\s*\.button\[disabled\]\s*\{[^}]*opacity:\s*\.55;[^}]*cursor:\s*not-allowed;/.test(css));

// New API shape (FlipForge2#885)
check("CURRENT_EVIDENCE_RULES is current, not legacy", !T.isLegacy({ evidenceProvenanceStatus: "CURRENT_EVIDENCE_RULES", legacyNotice: null }));
check("LEGACY_PROVIDER_DERIVED is legacy", T.isLegacy({ evidenceProvenanceStatus: "LEGACY_PROVIDER_DERIVED" }));
check("currentlySupported:false or LEGACY_NOT_CURRENTLY_SUPPORTED without a status is legacy", T.isLegacy({ currentlySupported: false }) && T.isLegacy({ supportedValueStatus: "LEGACY_NOT_CURRENTLY_SUPPORTED" }));
const newLegacy = { evidenceProvenanceStatus: "LEGACY_PROVIDER_DERIVED", supportedValue: null, legacySavedValues: { supportedValue: 1675 }, governedDecision: { legacySavedValues: { maximumBuyPriceCents: 140000 } } };
check("legacy saved values are labelled as at the time (legacy)", T.legacySavedValuesText(newLegacy) === "Saved value at the time (legacy): $1,675 · Max Buy at the time (legacy): $1,400", T.legacySavedValuesText(newLegacy));
check("decisionTime.legacySavedValues is read", T.legacySavedValues({ decisionTime: { legacySavedValues: { supportedValue: 900 } } }).supported === 900);
check("a null value is Unavailable, never $0", T.moneyOrUnavailable(null) === "Unavailable" && T.moneyOrUnavailable(1215) === "$1,215");
const providerEvidence = { providerEvidenceSummary: { label: "Reported completed sale (data provider)", storedRowsLinked: 39, storedRowsAdmittedNow: 9, storedRowReasons: { PROVIDER_STORED_HISTORY_NOT_RETAINED: 30 }, liveAvailable: false, liveQualifiedSales: 0, liveExpiresAt: null } };
const providerMarkup = T.providerSummaryMarkup(providerEvidence);
check("provider evidence summary renders from counts and reasons", providerMarkup.includes("9 counted now · 30 not counted") && providerMarkup.includes("Past sale records from our data provider are not kept") && !/<table|\$|card\s*_?sight/i.test(providerMarkup), providerMarkup);
check("no summary when the API sends none (old shape)", T.providerSummaryMarkup({ linkedEvidence: [] }) === "");
check("neutral source codes map to customer wording", T.sourceLabel("DATA_PROVIDER") === "our data provider" && T.sourceLabel("Reported completed sale (data provider)") === "Reported completed sale (data provider)");
const split = read("saas-prototype/evidence-authority-split-v1.js");
check("evidence split checks listed rows against counts without the unlisted provider rows", split.includes("const listedTrustedCount = trustedCount - providerAdmitted") && split.includes("const listedExcludedCount = excludedCount - providerNotCounted"));
const cardIntelligence = read("saas-prototype/customer-card-intelligence.js");
const discovery = read("saas-prototype/customer-discovery.js");
check("identity assist shows a neutral unavailable state when the provider is suspended (Evaluate)", cardIntelligence.includes("Provider evidence is currently unavailable") && cardIntelligence.includes("if (providerUnavailable(error)) state.message = PROVIDER_UNAVAILABLE_MESSAGE;"));
check("identity assist shows a neutral unavailable state when the provider is suspended (Discover)", discovery.includes("Provider evidence is currently unavailable") && discovery.includes("Number(error?.status) === 503"));
const visibility = read("saas-prototype/provider-evidence-visibility.js");
check("evidence visibility reads the neutral provider code and the provider summary", visibility.includes('"DATA_PROVIDER"') && visibility.includes("data.providerEvidenceSummary"));
const price = read("saas-prototype/price-intelligence.js");
check("price intelligence shows a legacy result as not currently supported (no safety-contract error)", price.includes('"LEGACY_NOT_CURRENTLY_SUPPORTED"') && price.includes("Price thresholds are not shown for a result saved before current evidence rules"));

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
console.log(`validate-customer-trust-display: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
