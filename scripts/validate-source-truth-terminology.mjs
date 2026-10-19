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
import { extractStringFragments } from "./lib/js-string-fragments.mjs";

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

// 4. The data provider is never named to customers, and no customer-readable string (including runtime text
//    replacement tables) calls reported sales or saved evidence verified, confirmed or trusted.
//    JS: only string literals and template text are customer text; comments, identifiers, regular expressions, CSS
//    classes, data attributes and all-caps enum codes compared against API data are internal. HTML: comments,
//    scripts, styles and non-visible attributes are internal; text and visible attributes (alt, title, aria-label,
//    placeholder, meta content) are customer text.
const PROVIDER_WORD = /[A-Za-z0-9_-]*card[\s_-]?sight[A-Za-z0-9_-]*/gi;
export function providerNameIn(fragment) {
  const text = String(fragment ?? "");
  for (const match of text.matchAll(PROVIDER_WORD)) {
    const token = match[0];
    // Internal: a CSS class, data attribute or selector (cardsight-evidence-panel), an enum code (CARDSIGHT_EBAY),
    // or a string that is nothing but a lookup key ("CARDSIGHT").
    if (/[-_]/.test(token.replace(/card[\s_-]?sight/i, "")) || /^card[_-]sight/i.test(token) && /[-_]/.test(token)) continue;
    if (text.trim() === token && /^[A-Z0-9_]+$/.test(token)) continue;
    return token;
  }
  return "";
}

const TRUST_LABEL = /^(?:Verified|VERIFIED|Trusted|TRUSTED|TRUSTED NOW|Trusted now|Verified evidence|Server-verified)$/;
const TRUST_WORDING = [
  /\bverified\s+(?:evidence|exact\s+identity|exact\s+card)\b/i,
  /\btrusted\s+now\b/i,
  /\bwhat\s+flipforge\s+trusted\b/i
];
export function trustWordingIn(fragment) {
  const text = String(fragment ?? "").trim();
  if (TRUST_LABEL.test(text)) return text;
  const claim = firstProhibitedClaim(text);
  if (claim) return claim;
  for (const pattern of TRUST_WORDING) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return "";
}

// A runtime replacement (a pair in a *REPLACEMENTS table, a .replace/.replaceAll/replaceText target) must not
// introduce the words. Pairs are read only inside replacement tables; other two-string arrays are data, not rewrites.
const INTRODUCED = /\b(?:verified|confirmed|trusted|trustworthy)\b/i;
const STRING = String.raw`(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\x60(?:[^\x60\\]|\\.)*\x60)`;
const PAIR = new RegExp(String.raw`\[\s*(${STRING})\s*,\s*(${STRING})\s*\]`, "g");
const REPLACE_CALL = new RegExp(String.raw`\b(?:replace|replaceAll|replaceText)\s*\(([^;]*?),\s*(${STRING})\s*\)`, "g");
const unquote = literal => literal.slice(1, -1);
export function introducedTrustWords(source) {
  const found = [];
  const tables = [...String(source).matchAll(/\b(?:const|let|var)\s+[A-Za-z_$]*(?:REPLACEMENTS|Replacements|replacements)\s*=\s*\[([\s\S]*?)\n\s*\];/g)].map(match => match[1]).join("\n");
  for (const match of tables.matchAll(PAIR)) {
    const from = unquote(match[1]);
    const to = unquote(match[2]);
    if (INTRODUCED.test(to) && !INTRODUCED.test(from)) found.push(`["${from}", "${to}"]`);
  }
  for (const match of String(source).matchAll(REPLACE_CALL)) {
    const to = unquote(match[2]);
    if (!INTRODUCED.test(to)) continue;
    const from = match[1].match(new RegExp(STRING, "g"))?.map(unquote).join(" ") || match[1];
    if (!INTRODUCED.test(from)) found.push(`replace(..., "${to}")`);
  }
  return found;
}

function htmlCustomerText(html) {
  const visible = [];
  const stripped = String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, code) => { for (const fragment of extractStringFragments(code)) visible.push(fragment.text); return " "; })
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, tag => {
      for (const attr of tag.matchAll(/\s(?:alt|title|aria-label|placeholder|content|value)\s*=\s*("([^"]*)"|'([^']*)')/gi)) visible.push(attr[2] ?? attr[3] ?? "");
      return " ";
    });
  return [stripped, ...visible];
}

// 4a. The fragment rules keep internal names legal and catch customer wording.
for (const internal of ["CARDSIGHT", "CARDSIGHT_EBAY", "cardsight-evidence-panel", '<section class="panel cardsight-evidence-panel" data-cardsight-evidence-panel>', "[data-cardsight-evidence-panel]"]) {
  check(`internal provider identifier stays legal: ${internal}`, providerNameIn(internal) === "");
}
for (const visible of ["CardSight sold evidence", "Saved CardSight accepted sales", "No CardSight matches were returned.", "Card Sight", "cardsight", "CARDSIGHT returned rows"]) {
  check(`customer provider name is caught: ${visible}`, providerNameIn(visible) !== "");
}
for (const label of ["Verified", "Verified evidence", "TRUSTED NOW", "What FlipForge trusted", "Verified exact identity"]) {
  check(`trust label is caught: ${label}`, trustWordingIn(label) !== "");
}
check("replacement pair introducing \"Verified\" is caught", introducedTrustWords('const COPY_REPLACEMENTS = [\n  ["Server-owned", "Verified"]\n];').length === 1);
check("replacement call introducing \"verified\" is caught", introducedTrustWords('x.replace(/server-owned/g, "verified");').length === 1);
check("replacement keeping an existing word is legal", introducedTrustWords('["Not confirmed", "Identity not confirmed"]').length === 0);

// 4b. Scan every customer-visible source.
const providerViolations = [];
const trustViolations = [];
const replacementViolations = [];
for (const rel of files) {
  const source = read(rel);
  const ext = path.extname(rel);
  if (ext === ".js") {
    const legacy = LEGACY_LOOKUP_LABELS[rel] || [];
    for (const fragment of extractStringFragments(source)) {
      const provider = providerNameIn(fragment.text);
      if (provider) providerViolations.push(`${rel}:${fragment.line} names "${provider}"`);
      if (legacy.includes(fragment.text)) continue; // read-only lookup labels, checked in 2b
      const trust = trustWordingIn(fragment.text);
      if (trust) trustViolations.push(`${rel}:${fragment.line} says "${trust}"`);
    }
    for (const pair of introducedTrustWords(source)) replacementViolations.push(`${rel}: ${pair}`);
  } else if (ext === ".html") {
    for (const text of htmlCustomerText(source)) {
      const provider = providerNameIn(text);
      if (provider) providerViolations.push(`${rel} names "${provider}"`);
    }
  } else {
    const provider = providerNameIn(source);
    if (provider) providerViolations.push(`${rel} names "${provider}"`);
  }
}
check("no customer-readable text names the data provider (CardSight)", providerViolations.length === 0);
check("no customer-readable string labels identity, evidence or sales as verified or trusted", trustViolations.length === 0);
check("no runtime text replacement introduces verified, confirmed or trusted wording", replacementViolations.length === 0);
violations.push(...providerViolations, ...trustViolations, ...replacementViolations);

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
for (const violation of violations) console.log(`  - ${violation}`);
console.log(`validate-source-truth-terminology: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
