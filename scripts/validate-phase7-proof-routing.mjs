import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "saas-prototype/bulk-evaluation.js"), "utf8");
const checks = [
  ["normal evaluator recognizes locked Phase 7 tag", source.includes('PROOF_VERSION = "FF_25_CARD_PROOF_V1"')],
  ["normal evaluator maps proofStudy header", source.includes('proofstudy: "proofStudy"')],
  ["normal evaluator refuses Phase 7 proof CSV", source.includes('Phase 7 proof CSVs must use the governed proof Bulk Evaluate page')],
  ["normal evaluator points to governed proof endpoint", source.includes('/.netlify/functions/bulk-evaluate')],
  ["normal evaluator never adds proof identity authority", !source.includes('/api/v1/card-intelligence/search') && !source.includes('/api/v1/card-intelligence/resolve')]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}
console.log(`\nPhase 7 proof routing: ${checks.length - failed}/${checks.length} passed.`);
if (failed) process.exitCode = 1;
