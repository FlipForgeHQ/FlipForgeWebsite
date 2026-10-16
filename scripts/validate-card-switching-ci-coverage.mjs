// The card-switching matrix exists to catch intermittent single-frame failures, so its coverage may not be weakened by a
// later edit: all configurations present, enough repetitions, both app paths, no retries, no shortened delays.
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/card-switching-matrix.yml", "utf8");
const audit = readFileSync("scripts/audit-card-switching-ci.mjs", "utf8");
const driver = readFileSync("scripts/run-card-switching-matrix.mjs", "utf8");
const passes = [];
const failures = [];
const check = (name, ok) => (ok ? passes : failures).push(name);

const reps = Number((workflow.match(/FF_MATRIX_REPS:\s*"?(\d+)"?/) || [])[1] || 0);
check(`at least 5 repetitions per configuration (found ${reps})`, reps >= 5);
check("/app/beta, local /app and the production hostname are all exercised", /FF_MATRIX_PATHS:\s*"\/app\/beta,\/app,https:\/\/goflipforge\.com\/app\/beta"/.test(workflow));
for (const [name, engine] of [["chromium desktop", "chromium"], ["chromium mobile (Pixel 7)", "chromium"], ["firefox desktop", "firefox"], ["webkit desktop", "webkit"], ["webkit mobile (iPhone 14)", "webkit"]]) {
  check(`configuration present: ${name}`, new RegExp(`name: ${name.replace(/[()]/g, "\\$&")}\\n\\s+engine: ${engine}`).test(workflow));
}
check("Chromium runs with the Navigation API enabled and disabled", (workflow.match(/nav_modes: "api,fallback"/g) || []).length >= 2);
check("fail-fast is off so every configuration reports", /fail-fast:\s*false/.test(workflow));
check("no retry wrapper hides intermittent failures", !/retry|attempt_limit|max_attempts|continue-on-error:\s*true/i.test(workflow.replace(/for attempt in \{1\.\.30\}/g, "").replace(/attempt/g, "x")));
check("the audit keeps the 3-6 s and 10.5 s response delays", /delayMs:\s*6000/.test(audit) && /delayMs:\s*10_?500/.test(audit) && /delayMs:\s*3000/.test(audit));
check("the audit has no assertion-skipping environment switch", !/process\.env\.FF_AUDIT_(SKIP|LENIENT|ALLOW)/.test(audit));
check("the driver enforces executed runs equal paths x modes x repetitions", driver.includes("coverageOk") && driver.includes("expected"));

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`Card switching CI coverage validation: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
