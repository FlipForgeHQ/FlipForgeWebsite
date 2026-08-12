import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const jsPath = path.join(root, "saas-prototype", "cardsight-evidence-visibility.js");
const cssPath = path.join(root, "saas-prototype", "cardsight-evidence-visibility.css");
const indexPath = path.join(root, "saas-prototype", "index.html");

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${path.relative(root, file)}`);
  return fs.readFileSync(file, "utf8");
}

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`CardSight evidence visibility validation failed: ${label}`);
}

function reject(text, pattern, label) {
  if (pattern.test(text)) throw new Error(`CardSight evidence visibility validation failed: ${label}`);
}

const js = read(jsPath);
const css = read(cssPath);
const index = read(indexPath);

// Syntax must be valid in the Node parser before browser QA runs.
new Function(js);

requireText(index, 'href="cardsight-evidence-visibility.css"', "visibility stylesheet is not loaded");
requireText(index, 'src="cardsight-evidence-visibility.js"', "visibility script is not loaded");
requireText(js, 'url.pathname === "/api/v1/evaluations"', "evaluation response is not observed");
requireText(js, '/^\\/api\\/v1\\/evidence\\/([^/?#]+)$/', "current evidence response is not observed");
requireText(js, 'String(summary.provider || "").toUpperCase() !== "CARDSIGHT"', "provider identity is not constrained to CardSight");
requireText(js, 'summary.fixedPriceRowsCanSupportValue !== false', "fixed-price evidence boundary is not enforced");
requireText(js, 'summary.activeListingsCanSupportValue !== false', "active-listing evidence boundary is not enforced");
requireText(js, 'summary.automaticOutlierAcceptance !== false', "automatic outlier boundary is not enforced");
requireText(js, 'summary.transactionAuthority !== false', "transaction-authority boundary is not enforced");
requireText(js, 'Smart Opportunity remains the sole decision authority', "Smart Opportunity authority disclosure is missing");
requireText(js, 'data-cardsight-evidence-signature', "stable render signature is missing");
requireText(css, '.cardsight-evidence-grid', "responsive evidence metrics styling is missing");

// This layer is display-only. It must not persist tenant intelligence or submit writes.
reject(js, /\blocalStorage\b|\bsessionStorage\b/, "browser persistence was introduced");
reject(js, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i, "a write request was introduced");
reject(js, /recommendation\s*=|supportedValue\s*=|confidence\s*=|risk\s*=/, "browser-side decision mutation was introduced");

console.log("CardSight evidence visibility validation passed.");
