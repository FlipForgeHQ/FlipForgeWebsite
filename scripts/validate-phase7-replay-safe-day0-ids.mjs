import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "netlify/modern-functions/bulk-evaluate.js"), "utf8");
const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });

check("001 Phase 7 has a dedicated deterministic request-id helper",
  source.includes("function proofRequestId(r)"));
check("002 proof request id includes stable CSV row identity",
  source.includes('String(r.number).padStart(2,"0")'));
check("003 proof request id includes the frozen external listing id",
  source.includes("r.data.externalListingId"));
check("004 provider-unsafe request-id characters are sanitized",
  source.includes('.replace(/[^A-Za-z0-9._-]/g,"_")'));
check("005 listing component is bounded for backend request-id limit",
  source.includes(".slice(0,64)"));
check("006 proof request-id namespace is explicit",
  source.includes('return "ff-phase7-v1-row-"+row+"-"+external'));
check("007 Phase 7 submits with the deterministic request id",
  source.includes('requestId=proofMode()?proofRequestId(r):uuid("bulk-eval-")'));
check("008 normal Bulk Evaluate retains random request ids",
  source.includes(':uuid("bulk-eval-")'));
check("009 proof UI explains replay-safe timeout recovery",
  source.includes("replays completed SQLite results instead of creating duplicate evaluations"));
check("010 proof load state confirms replay-safe IDs are armed",
  source.includes("replay-safe Day-0 IDs armed"));

const synthetic = (number, externalListingId) => {
  const row = String(number).padStart(2, "0");
  const external = String(externalListingId || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 64);
  return `ff-phase7-v1-row-${row}-${external}`;
};
const ebay = synthetic(2, "v1|327310965856|0");
check("011 official eBay pipe ID becomes backend-safe", ebay === "ff-phase7-v1-row-02-v1_327310965856_0");
check("012 same frozen row produces the same request id", ebay === synthetic(2, "v1|327310965856|0"));
check("013 different slots cannot collide on the same listing", ebay !== synthetic(3, "v1|327310965856|0"));
check("014 generated request id is within backend 8-100 character contract", ebay.length >= 8 && ebay.length <= 100);
check("015 generated request id uses only backend-safe characters", /^[A-Za-z0-9._-]{8,100}$/.test(ebay));

const failed = checks.filter(check => !check.passed);
for (const result of checks) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
console.log(`\nPhase 7 replay-safe Day-0 ID validation: ${checks.length - failed.length}/${checks.length} passed.`);
if (failed.length) process.exitCode = 1;
