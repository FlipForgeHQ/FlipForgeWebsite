import fs from "node:fs";
import path from "node:path";

const requested = process.argv[2] || "results";

function sarifFiles(input) {
  if (fs.existsSync(input) && fs.statSync(input).isFile()) return [input];
  if (!fs.existsSync(input)) return [];
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".sarif")) found.push(full);
    }
  };
  walk(input);
  return found;
}

const files = sarifFiles(requested);
if (!files.length) {
  console.error(`CodeQL security gate could not find SARIF output at ${requested}`);
  process.exit(2);
}

let total = 0;
const blocking = [];

for (const file of files) {
  const sarif = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const run of sarif.runs || []) {
    const rules = new Map();
    for (const rule of run.tool?.driver?.rules || []) rules.set(rule.id, rule);
    for (const result of run.results || []) {
      total += 1;
      const rule = rules.get(result.ruleId) || {};
      const rawSeverity = result.properties?.["security-severity"] ?? rule.properties?.["security-severity"];
      const securitySeverity = Number(rawSeverity);
      const level = String(result.level || rule.defaultConfiguration?.level || "warning").toLowerCase();
      const blocks = level === "error" || (Number.isFinite(securitySeverity) && securitySeverity >= 7.0);
      if (!blocks) continue;
      const location = result.locations?.[0]?.physicalLocation;
      blocking.push({
        ruleId: result.ruleId || "unknown-rule",
        level,
        securitySeverity: Number.isFinite(securitySeverity) ? securitySeverity : null,
        file: location?.artifactLocation?.uri || "unknown-file",
        line: location?.region?.startLine || null,
        message: result.message?.text || "CodeQL security finding"
      });
    }
  }
}

console.log(`CodeQL SARIF security gate inspected ${total} result(s) across ${files.length} file(s).`);
if (!blocking.length) {
  console.log("No high/critical or error-level CodeQL findings detected.");
  process.exit(0);
}

console.error(`Blocking ${blocking.length} CodeQL security finding(s):`);
for (const finding of blocking) console.error(JSON.stringify(finding));
process.exit(1);
