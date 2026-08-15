import fs from "node:fs";

const path = "phase7-day0-template.csv";
const text = fs.readFileSync(path, "utf8").trim();
const lines = text.split(/\r?\n/);
const header = lines.shift().split(",");
const expectedHeader = [
  "proofStudy","sport","externalListingId","marketplace","cardIdentity","listingUrl",
  "itemPrice","shipping","buyerPremium","tax","seller","listingFormat","endsAt"
];

const expectedTargets = [
  ["MLB", "2018 Topps Chrome #150 Shohei Ohtani PSA 10"],
  ["MLB", "2022 Topps Update #US44 Julio Rodriguez PSA 10"],
  ["MLB", "2022 Topps Chrome Update #USC35 Bobby Witt Jr. PSA 10"],
  ["MLB", "2024 Topps Update #US288 Paul Skenes PSA 10"],
  ["MLB", "2024 Topps Chrome Update #USC30 Jackson Chourio PSA 10"],
  ["MLB", "2024 Topps Chrome Update #USC57 Jackson Merrill X-Fractor PSA 10"],
  ["MLB", "2022 Topps Update #US44 Julio Rodriguez SSP PSA 10"],
  ["NFL", "2018 Panini Prizm #205 Josh Allen PSA 10"],
  ["NFL", "2024 Panini Prizm #347 Jayden Daniels PSA 10"],
  ["NFL", "2024 Panini Prizm #301 Caleb Williams PSA 10"],
  ["NFL", "2024 Panini Prizm #329 Drake Maye PSA 10"],
  ["NFL", "2024 Panini Prizm #309 Bo Nix PSA 10"],
  ["NFL", "2024 Panini Prizm #347 Jayden Daniels Silver Prizm PSA 10"],
  ["NBA", "2023 Panini Prizm #136 Victor Wembanyama PSA 10"],
  ["NBA", "2020 Panini Prizm #258 Anthony Edwards PSA 10"],
  ["NBA", "2022 Panini Prizm #249 Paolo Banchero PSA 10"],
  ["NBA", "2018 Panini Prizm #280 Luka Doncic Silver Prizm PSA 10"],
  ["NBA", "2022 Panini Prizm #266 Chet Holmgren Red Ice PSA 10"],
  ["NBA", "2023 Panini Prizm #152 Brandon Miller Red Prizm PSA 10"],
  ["NHL", "2023 Upper Deck #451 Connor Bedard PSA 10"],
  ["NHL", "2024 Upper Deck #451 Macklin Celebrini PSA 10"],
  ["NHL", "2024 Upper Deck #492 Matvei Michkov PSA 10"],
  ["NHL", "2019 Upper Deck #493 Cale Makar PSA 10"],
  ["NHL", "2019 Upper Deck #201 Jack Hughes PSA 10"],
  ["NHL", "2023 Upper Deck #451 Connor Bedard Clear Cut PSA 10"]
];

const checks = [];
const check = (label, condition) => checks.push({ label, condition: Boolean(condition) });
check("header matches Bulk Evaluate proof contract", JSON.stringify(header) === JSON.stringify(expectedHeader));
check("exactly 25 frozen rows", lines.length === 25);

const indexes = Object.fromEntries(header.map((name, index) => [name, index]));
const rows = lines.map(line => line.split(","));
check("all rows have the exact column count", rows.every(row => row.length === header.length));
check("all rows are explicitly Phase 7 proof mode", rows.every(row => row[indexes.proofStudy] === "FF_25_CARD_PROOF_V1"));
check("all rows remain eBay targets", rows.every(row => row[indexes.marketplace] === "EBAY"));

const actualTargets = rows.map(row => [row[indexes.sport], row[indexes.cardIdentity]]);
check("website template exactly mirrors the frozen backend target order", JSON.stringify(actualTargets) === JSON.stringify(expectedTargets));
check("all 25 target identities are unique", new Set(rows.map(row => row[indexes.cardIdentity])).size === 25);

const sportCounts = rows.reduce((out, row) => {
  out[row[indexes.sport]] = (out[row[indexes.sport]] || 0) + 1;
  return out;
}, {});
check("sport allocation remains 7 MLB / 6 NFL / 6 NBA / 6 NHL",
  sportCounts.MLB === 7 && sportCounts.NFL === 6 && sportCounts.NBA === 6 && sportCounts.NHL === 6);

check("live listing IDs are intentionally blank", rows.every(row => row[indexes.externalListingId] === ""));
check("live listing URLs are intentionally blank", rows.every(row => row[indexes.listingUrl] === ""));
check("live item prices are intentionally blank", rows.every(row => row[indexes.itemPrice] === ""));
check("shipping defaults to zero but remains editable at Day 0", rows.every(row => row[indexes.shipping] === "0"));
check("buyer premium defaults to zero but remains editable at Day 0", rows.every(row => row[indexes.buyerPremium] === "0"));
check("tax defaults to zero but remains editable at Day 0", rows.every(row => row[indexes.tax] === "0"));

const forbidden = /\b(BUY|WATCH|VERIFY|PASS|WHITE HOT|FORGE HEAT|supported value|outcome)\b/i;
check("template contains no recommendation, Heat, supported value, or outcome", !forbidden.test(text));

const failures = checks.filter(row => !row.condition);
for (const row of checks) console.log(`${row.condition ? "PASS" : "FAIL"} - ${row.label}`);
console.log(`Phase 7 frozen template validation: ${checks.length - failures.length}/${checks.length} passed.`);
if (failures.length) process.exitCode = 1;
