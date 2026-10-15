// Runs the card-switching audit across a configuration matrix and enforces that every required run actually executed.
//
//   FLIPFORGE_BASE_URL     server origin (default http://127.0.0.1:4173)
//   FF_MATRIX_PATHS        comma list of app paths or absolute URLs (default "/app/beta,/app,https://goflipforge.com/app/beta").
//                          An absolute https://goflipforge.com URL runs the page as the real production hostname, served from
//                          the local checkout, so every production-only branch of the app executes.
//   FF_MATRIX_NAV_MODES    comma list of "api" and/or "fallback" (default "api,fallback"); fallback = Navigation API disabled
//   FF_MATRIX_REPS         repetitions of every path x mode   (default 1)
//   FF_AUDIT_ENGINE / FF_AUDIT_DEVICE are passed through to the audit.
//
// Nothing is weakened here: every run is the full audit with its real 3-6 s and 10.5 s response delays, and any failing
// run fails the matrix. The driver also fails if the number of runs executed is not exactly paths x modes x reps, and it
// writes the per-run results to artifacts/card-switching/<label>.json so CI can show that the coverage really ran.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const base = (process.env.FLIPFORGE_BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const paths = (process.env.FF_MATRIX_PATHS || "/app/beta,/app,https://goflipforge.com/app/beta").split(",").map(value => value.trim()).filter(Boolean);
const modes = (process.env.FF_MATRIX_NAV_MODES || "api,fallback").split(",").map(value => value.trim()).filter(Boolean);
const reps = Number.parseInt(process.env.FF_MATRIX_REPS || "1", 10);
const engine = process.env.FF_AUDIT_ENGINE || "chromium";
const device = process.env.FF_AUDIT_DEVICE || "";
const label = `${engine}${device ? `-${device.replace(/\s+/g, "")}` : "-desktop"}`;

if (!paths.length || !modes.length || !(reps >= 1) || modes.some(mode => !["api", "fallback"].includes(mode))) {
  console.error("Invalid matrix configuration.");
  process.exit(2);
}

const expected = paths.length * modes.length * reps;
const results = [];
const started = Date.now();
for (let rep = 1; rep <= reps; rep += 1) {
  for (const path of paths) {
    for (const mode of modes) {
      const runStarted = Date.now();
      const child = spawnSync(process.execPath, ["scripts/audit-card-switching-ci.mjs"], {
        env: { ...process.env, FLIPFORGE_LAYOUT_AUDIT_URL: /^https?:\/\//.test(path) ? path : `${base}${path}`, FF_AUDIT_LOCAL_ORIGIN: base, FF_AUDIT_NO_NAVIGATION_API: mode === "fallback" ? "1" : "0" },
        encoding: "utf8",
        timeout: 420_000,
        maxBuffer: 32 * 1024 * 1024
      });
      const output = `${child.stdout || ""}${child.stderr || ""}`;
      const summary = output.match(/Card switching audit \[([^\]]*)\]: (\d+)\/(\d+) passed\./);
      const failLines = output.split("\n").filter(line => line.startsWith("FAIL ")).map(line => line.slice(0, 2600));
      const limitation = output.split("\n").find(line => line.startsWith("LIMITATION ")) || "";
      const record = {
        rep, path, mode, label,
        configuration: summary ? summary[1] : "unknown",
        passed: summary ? Number(summary[2]) : 0,
        total: summary ? Number(summary[3]) : 0,
        exitCode: child.status,
        seconds: Math.round((Date.now() - runStarted) / 1000),
        limitation,
        failures: failLines
      };
      record.ok = child.status === 0 && Boolean(summary) && record.passed === record.total && record.total > 0 && failLines.length === 0;
      results.push(record);
      console.log(`${record.ok ? "PASS" : "FAIL"} rep ${rep}/${reps} ${path} nav=${mode} [${record.configuration}] ${record.passed}/${record.total} in ${record.seconds}s${limitation ? ` | ${limitation}` : ""}`);
      for (const line of failLines) console.log(`  ${line}`);
      if (process.env.GITHUB_ACTIONS) for (const line of failLines.slice(0, 6)) console.log(`::error title=Card switching ${label} rep ${rep} ${path} nav=${mode}::${line.replace(/[\r\n%]/g, " ").slice(0, 2600)}`);
      if (!summary) console.log(`  audit produced no summary (exit ${child.status}): ${output.slice(-500).replace(/\n/g, " | ")}`);
    }
  }
}

const failed = results.filter(record => !record.ok);
const coverageOk = results.length === expected;
mkdirSync("artifacts/card-switching", { recursive: true });
writeFileSync(`artifacts/card-switching/${label}.json`, JSON.stringify({ label, base, paths, modes, reps, expectedRuns: expected, executedRuns: results.length, failedRuns: failed.length, seconds: Math.round((Date.now() - started) / 1000), results }, null, 2));
console.log(`MATRIX ${label}: executed ${results.length}/${expected} runs (${paths.length} paths x ${modes.length} navigation modes x ${reps} repetitions), ${failed.length} failed, ${Math.round((Date.now() - started) / 1000)}s.`);
if (process.env.GITHUB_ACTIONS) {
  const kinds = [...new Set(results.map(record => record.configuration))].join("; ");
  console.log(`::${failed.length || !coverageOk ? "error" : "notice"} title=Card switching coverage ${label}::executed ${results.length}/${expected} runs (${paths.length} paths x ${modes.length} modes x ${reps} reps), ${failed.length} failed, ${results.reduce((sum, record) => sum + record.passed, 0)}/${results.reduce((sum, record) => sum + record.total, 0)} checks passed. Configurations: ${kinds}`);
}
if (!coverageOk) console.log(`FAIL coverage: expected ${expected} runs, executed ${results.length}.`);
process.exit(failed.length || !coverageOk ? 1 : 0);
