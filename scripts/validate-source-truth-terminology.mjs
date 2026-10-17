// Source-truth terminology guard.
//
// FlipForge's sale evidence is made of reported sale records (eBay auction closes supplied by our data provider,
// and sales recorded by Goldin, 130point, Card Ladder, other marketplaces, or entered by users). FlipForge matches
// each record to the exact card, but no source confirms that the buyer paid or that the sale settled.
//
// Three concepts:
//   Reported sale record           a source represents an event as a sale
//   Exact-card matched record      the reported event matches the required card, grade and parallel
//   Payment-confirmed transaction  independent evidence confirms settlement (FlipForge does NOT establish this)
//
// This guard fails if public pages, the customer app or customer marketing content claim or imply verified,
// confirmed, trusted or payment-confirmed sales, and checks the required payment-limitation disclosures exist.
// Wording only: internal field names (exactTrustedSales, VERIFIED enum values, CSS classes) are not text and are
// not scanned as claims.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

export const PROHIBITED_CLAIMS = [
  /\bverified\s+(?:exact[- ]card\s+|exact\s+)?(?:completed\s+)?(?:sales?|sold|comps?|transactions?|market\s+evidence|grade[- ]lane\s+evidence|grading\s+evidence)\b/i,
  /(?<!not\s)(?<!not\sa\s)(?<!never\s)(?<!never\sa\s)\bconfirmed\s+(?:sales?|sold\s+comps?|transactions?)\b/i,
  /\b(?:trusted|trustworthy)\s+(?:exact\s+)?(?:completed[- ]?|sold[- ]?)?(?:sales?|sold|comps?|price\s+evidence|evidence|support)\b/i,
  /\bexact\s+trusted\b/i,
  /(?<!not\s)\bpayment[- ](?:verified|confirmed)\b/i,
  /\b(?:real|actual)\s+sale\s+price\b/i,
  /\bwhat\s+it\s+actually\s+sold\s+for\b/i,
  /\bproven\s+sales?\b/i,
  /\bmarket\s+evidence\s+supplies\s+truth\b/i,
];

// The category name itself may appear where FlipForge defines it or says it does NOT establish it.
// Each phrase is removed before scanning; the guard below checks each one still appears only in that negating context.
export const DEFINITION_PHRASES = [
  "<strong>Payment-confirmed transaction:</strong> independent evidence that the buyer paid and the sale settled. FlipForge does not currently establish this.",
  "is never presented as a payment-confirmed transaction",
];

export function firstProhibitedClaim(text) {
  for (const phrase of DEFINITION_PHRASES) text = String(text ?? "").split(phrase).join(" ");
  for (const pattern of PROHIBITED_CLAIMS) {
    const match = String(text ?? "").match(pattern);
    if (match) return match[0];
  }
  return "";
}

// Customer-visible sources: public pages, public scripts, the customer app and marketing content.
// Developer/operator-only tooling, CI scripts and test fixtures are not customer surfaces.
const EXCLUDED_DIRS = new Set(["node_modules", ".git", ".github", "scripts", "tests", "test", "docs", "netlify", "marketing/dist", "output", "artifacts"]);
const SCANNED_EXT = new Set([".html", ".js", ".json", ".md"]);
const EXCLUDED_FILES = [
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)deploy-manifest.*\.json$/,
  /\.min\.js$/,
  /(^|\/)(README|CHANGELOG|BRAND_LANGUAGE_LOCKED|AGENTS|CLAUDE)\.md$/i,
  /(^|\/)docs?\//,
];
// Only marketing content markdown/json is customer copy; other .md/.json are repo notes or data.
const JSON_MD_ALLOWED = [/^marketing\/content\//];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name) || EXCLUDED_DIRS.has(rel) || entry.name.startsWith(".")) continue;
      walk(abs, out);
    } else {
      const ext = path.extname(entry.name);
      if (!SCANNED_EXT.has(ext)) continue;
      if (EXCLUDED_FILES.some(re => re.test(rel))) continue;
      if ((ext === ".json" || ext === ".md") && !JSON_MD_ALLOWED.some(re => re.test(rel))) continue;
      out.push(rel);
    }
  }
  return out;
}

// Legacy headings that compatibility lookups READ from pages rendered by an earlier build. They are never shown:
// each may appear only on a `*_LABELS = [...]` lookup-constant line in the named file.
export const LEGACY_LOOKUP_LABELS = {
  "saas-prototype/decision-card-evidence-v1.js": ["Trusted sales", "Trusted completed sales"],
  "saas-prototype/customer-cdi-signal-stack-v1.js": ["Trusted completed sales"],
};
const LOOKUP_CONSTANT_LINE = /^\s*const [A-Z_]+_LABELS = \[.*\];\s*$/;

const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// 1. The policy keeps accurate negations legal and catches misleading wording.
for (const accurate of [
  "Sale prices are reported by our data sources and matched to the exact card. FlipForge does not confirm payment or settlement.",
  "Sale prices are provider-reported and not independently confirmed.",
  "They are not confirmed sold comps until reviewed.",
  "Exact card verified.",
  "Know the Card. Trust the Evidence.",
  ...DEFINITION_PHRASES,
]) check(`accurate wording stays legal: ${accurate}`, firstProhibitedClaim(accurate) === "");
for (const misleading of [
  "Verified sales support this value.", "verified market evidence", "Trusted completed sales", "Check trustworthy sales",
  "3 exact trusted sales", "payment-confirmed sale", "This is a payment-confirmed transaction.", "the actual sale price", "Market evidence supplies truth.",
]) check(`misleading wording is caught: ${misleading}`, firstProhibitedClaim(misleading) !== "");

// 2. No customer-visible source makes a prohibited claim.
const files = walk(ROOT, []);
check(`scanned customer-visible sources (${files.length} files)`, files.length > 50);
const violations = [];
for (const rel of files) {
  const lines = read(rel).split(/\r?\n/);
  const legacy = LEGACY_LOOKUP_LABELS[rel] || [];
  lines.forEach((line, index) => {
    let scanned = line;
    if (legacy.length && LOOKUP_CONSTANT_LINE.test(line)) {
      for (const label of legacy) scanned = scanned.split(JSON.stringify(label)).join('""');
    }
    const claim = firstProhibitedClaim(scanned);
    if (claim) violations.push(`${rel}:${index + 1} claims "${claim}"`);
  });
}
check("no customer-visible text claims verified, confirmed, trusted or payment-confirmed sales", violations.length === 0);

// 2b. Every legacy lookup label is still used (no stale allowance) and only on a lookup-constant line.
for (const [rel, labels] of Object.entries(LEGACY_LOOKUP_LABELS)) {
  const lines = read(rel).split(/\r?\n/);
  for (const label of labels) {
    const hits = lines.filter(line => line.includes(JSON.stringify(label)));
    check(`legacy lookup label "${label}" in ${rel} is read only through a lookup constant`,
      hits.length > 0 && hits.every(line => LOOKUP_CONSTANT_LINE.test(line)));
  }
}

// 3. Payment limitation is disclosed where customers see sale-based evidence.
const disclosure = /does not confirm payment or settlement|not confirm that the buyer paid/i;
check("public data-use page defines the three concepts",
  /Reported sale record/.test(read("data-use.html")) && /Exact-card matched record/.test(read("data-use.html"))
  && /Payment-confirmed transaction/.test(read("data-use.html")) && /does not currently establish this/.test(read("data-use.html")));
check("FAQ names sources and the payment limitation", disclosure.test(read("faq.html")) && /eBay auction closing prices/.test(read("faq.html")));
check("Decision Intelligence states the payment limitation", disclosure.test(read("saas-prototype/decision-intelligence-ux-v2.js")));
check("evidence details state the payment limitation", disclosure.test(read("saas-prototype/evidence-authority-split-v1.js")));
check("evaluation evidence panel states the payment limitation", disclosure.test(read("saas-prototype/staging-browser.js")));
check("Collection alerts state the payment limitation", disclosure.test(read("saas-prototype/collection-intelligence-alerts-v1.js")));
check("Collection alerts never show the stored VERIFIED state as a claim",
  read("saas-prototype/collection-intelligence-alerts-v1.js").includes('replace(/\\bVERIFIED\\b/g, "Strong (reported sales)")'));

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
for (const violation of violations) console.log(`  - ${violation}`);
console.log(`validate-source-truth-terminology: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
