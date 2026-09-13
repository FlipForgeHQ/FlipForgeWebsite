import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const readJson = relative => JSON.parse(read(relative));
const exists = relative => fs.existsSync(path.join(root, relative));

const brand = readJson("marketing/content/brand.json");
const cdi = readJson("marketing/content/decision-intelligence.json");
const docs = readJson("marketing/content/documents.json").documents;
const campaigns = readJson("marketing/content/campaigns.json").campaigns;
const disclaimers = readJson("marketing/content/disclaimers.json");
const positioning = readJson("marketing/content/positioning.json");
const proof = readJson("marketing/content/proof-points.json");

const failures = [];
const pass = [];
const check = (name, condition) => (condition ? pass : failures).push(name);

check("brand name lock", brand.brandName === "FLIPFORGE");
check("descriptor lock", brand.descriptor === "CARD DECISION INTELLIGENCE");
check("category lock", brand.category === "Card Decision Intelligence™");
check("slogan lock", brand.slogan === "Before you buy. Know Why.");
check("decision-state lock", JSON.stringify(brand.decisionStates) === JSON.stringify(["BUY","WATCH","VERIFY","PASS"]));
check("internal analogy is not approved for public use", brand.publicUseOfInternalAnalogy === false);
check("seven CDI layers exist", cdi.layers.length === 7);
check("seven CDI layer names locked", JSON.stringify(cdi.layers.map(item=>item.name)) === JSON.stringify([
  "Identity Intelligence",
  "Evidence Intelligence",
  "Economic Intelligence",
  "Risk + Uncertainty Intelligence",
  "Decision Intelligence",
  "Decision Traceback / Decision Receipt",
  "Outcome Intelligence"
]));
check("T0/T7/T14/T30 outcome language exists", cdi.layers.at(-1)?.publicCopy.includes("T0") && cdi.layers.at(-1)?.publicCopy.includes("T7") && cdi.layers.at(-1)?.publicCopy.includes("T14") && cdi.layers.at(-1)?.publicCopy.includes("T30"));
check("positioning preserves decision-engine category", positioning.categoryStatement.includes("Card Decision Intelligence™"));
check("positioning rejects price-guide framing", positioning.notA.includes("price guide"));
check("proof-point policy blocks premature accuracy claims", proof.claimPolicy.toLowerCase().includes("accuracy") && proof.claimPolicy.toLowerCase().includes("authorization"));
check("seven required documents defined", docs.length === 7);
check("five governed campaigns defined", campaigns.length === 5);

const requiredSlugs = [
  "product-one-pager",
  "card-decision-intelligence",
  "why-flipforge-exists",
  "how-a-decision-is-built",
  "dealer-flipper-sell-sheet",
  "collector-investor-sell-sheet",
  "sample-decision-dossier"
];
for (const slug of requiredSlugs) check(`document defined: ${slug}`, docs.some(doc=>doc.slug === slug));

const requiredCampaigns = ["deal-or-decoy","wrong-comp","more-data","decision-receipt","what-happened-next"];
for (const key of requiredCampaigns) check(`campaign defined: ${key}`, campaigns.some(campaign=>campaign.key === key));

const publicSources = [
  "marketing/content/positioning.json",
  "marketing/content/decision-intelligence.json",
  "marketing/content/product-messaging.json",
  "marketing/content/audience-messaging.json",
  "marketing/content/proof-points.json",
  "marketing/content/campaigns.json",
  "marketing/content/documents.json"
];
const publicText = publicSources.map(read).join("\n");
for (const claim of disclaimers.forbiddenClaims) {
  check(`forbidden claim absent: ${claim}`, !publicText.toLowerCase().includes(String(claim).toLowerCase()));
}
for (const phrase of disclaimers.restrictedPublicPhrases) {
  check(`restricted public phrase absent: ${phrase}`, !publicText.toLowerCase().includes(String(phrase).toLowerCase()));
}

for (const doc of docs) {
  const generated = `marketing/generated/${doc.slug}.html`;
  const preview = `marketing-preview/${doc.slug}/index.html`;
  check(`generated document exists: ${doc.slug}`, exists(generated));
  check(`preview document exists: ${doc.slug}`, exists(preview));
  if (exists(generated)) {
    const html = read(generated);
    check(`generated document keeps descriptor: ${doc.slug}`, html.includes("CARD DECISION INTELLIGENCE"));
    check(`generated document keeps slogan: ${doc.slug}`, html.includes("Before you buy. Know Why."));
    check(`generated document includes decision boundary: ${doc.slug}`, html.includes(disclaimers.compact));
    for (const claim of disclaimers.forbiddenClaims) check(`generated ${doc.slug} excludes ${claim}`, !html.toLowerCase().includes(String(claim).toLowerCase()));
    for (const phrase of disclaimers.restrictedPublicPhrases) check(`generated ${doc.slug} excludes ${phrase}`, !html.toLowerCase().includes(String(phrase).toLowerCase()));
  }
}

for (const campaign of campaigns) {
  const generated = `marketing/generated/campaigns/${campaign.key}.html`;
  const preview = `marketing-preview/campaigns/${campaign.key}/index.html`;
  check(`generated campaign exists: ${campaign.key}`, exists(generated));
  check(`preview campaign exists: ${campaign.key}`, exists(preview));
  if (exists(generated)) {
    const html = read(generated);
    check(`campaign keeps slogan: ${campaign.key}`, html.includes("Before you buy. Know Why."));
    check(`campaign keeps decision boundary: ${campaign.key}`, html.includes(disclaimers.compact));
    for (const claim of disclaimers.forbiddenClaims) check(`campaign ${campaign.key} excludes ${claim}`, !html.toLowerCase().includes(String(claim).toLowerCase()));
    for (const phrase of disclaimers.restrictedPublicPhrases) check(`campaign ${campaign.key} excludes ${phrase}`, !html.toLowerCase().includes(String(phrase).toLowerCase()));
  }
}

check("preview center exists", exists("marketing-preview/index.html"));
check("campaign preview center exists", exists("marketing-preview/campaigns/index.html"));
check("generated manifest exists", exists("marketing/generated/manifest.json"));
check("generated campaign manifest exists", exists("marketing/generated/campaigns/manifest.json"));
check("locked primary logo exists", exists(brand.primaryLogo.replace(/^\//, "")));
check("locked stacked logo exists", exists(brand.stackedLogo.replace(/^\//, "")));
check("locked mark exists", exists(brand.mark.replace(/^\//, "")));

console.log("FlipForgeMarketingValidation");
console.log(`PASSED: ${pass.length}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL | ${failure}`);
  process.exit(1);
}
for (const item of pass) console.log(`PASS | ${item}`);
