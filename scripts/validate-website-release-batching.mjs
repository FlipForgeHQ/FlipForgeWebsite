// Offline validation of release batching (docs/WEBSITE_RELEASE_BATCHING.md). Builds a throw-away Git
// repository with a bare "origin", stubs the GitHub check-runs API, and runs scripts/ci/release-website.mjs
// through every refusal path and a real fast-forward release. No network, no production.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const script = path.join(root, "scripts/ci/release-website.mjs");
const passes = [];
const failures = [];
const check = (ok, name) => (ok ? passes : failures).push(name);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ff-release-"));
const sh = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const origin = path.join(tmp, "origin.git");
const work = path.join(tmp, "work");
sh(tmp, "init", "--quiet", "--bare", "--initial-branch=main", origin);
sh(tmp, "clone", "--quiet", origin, work);
sh(work, "config", "user.email", "ci@example.com");
sh(work, "config", "user.name", "ci");
const commit = message => {
  fs.appendFileSync(path.join(work, "site.txt"), `${message}\n`);
  sh(work, "add", "site.txt");
  sh(work, "commit", "--quiet", "-m", message);
  return sh(work, "rev-parse", "HEAD");
};
const a = commit("a");
sh(work, "push", "--quiet", "origin", "HEAD:main");

// Stub GitHub check-runs: FF_CHECKS = "all-success" | "one-failed" | "rerun-failed" | "pending".
const stub = path.join(tmp, "stub.mjs");
fs.writeFileSync(stub, `
const REQUIRED = ["Pre-Beta Security gate","Independent Audit C-L gate","Validate core SaaS Beta Complete static gate","Validate workflow action references"];
globalThis.fetch = async () => {
  const mode = process.env.FF_CHECKS || "all-success";
  const runs = REQUIRED.map((name, i) => ({ name, status: "completed", conclusion: "success", started_at: "2026-10-23T10:00:0" + i + "Z" }));
  if (mode === "one-failed") runs[0].conclusion = "failure";
  if (mode === "pending") { runs[1].status = "in_progress"; runs[1].conclusion = null; }
  if (mode === "rerun-failed") runs.push({ name: REQUIRED[2], status: "completed", conclusion: "failure", started_at: "2026-10-23T11:00:00Z" });
  if (mode === "missing") runs.pop();
  return new Response(JSON.stringify({ check_runs: runs }), { status: 200, headers: { "content-type": "application/json" } });
};
`);

function release(env = {}) {
  const out = path.join(tmp, `out-${Math.random().toString(16).slice(2)}`);
  fs.writeFileSync(out, "");
  const result = spawnSync(process.execPath, ["--import", pathToFileURL(stub).href, script], {
    cwd: work,
    encoding: "utf8",
    env: { ...process.env, GITHUB_TOKEN: "test", GITHUB_REPOSITORY: "example/site", GITHUB_OUTPUT: out,
      GITHUB_STEP_SUMMARY: "", RELEASE_KIND: "scheduled", ...env },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}`, outputs: fs.readFileSync(out, "utf8") };
}
const releaseHead = () => sh(work, "ls-remote", "--heads", "origin", "release").split(/\s+/)[0] || "";

let r = release({ FF_CHECKS: "one-failed" });
check(r.status === 1 && /Required checks have not all passed/.test(r.out) && !releaseHead(), "R01 a failed required check blocks the release");
r = release({ FF_CHECKS: "pending" });
check(r.status === 1 && /=pending/.test(r.out) && !releaseHead(), "R02 a pending required check blocks the release");
r = release({ FF_CHECKS: "missing" });
check(r.status === 1 && /=missing/.test(r.out) && !releaseHead(), "R03 a missing required check blocks the release");
r = release({ FF_CHECKS: "rerun-failed" });
check(r.status === 1 && /static gate=failure/.test(r.out), "R04 a failed re-run is not hidden by an older success");
r = release({ RELEASE_KIND: "manual" });
check(r.status === 1 && /reason is required/.test(r.out), "R05 manual and emergency releases need a reason");
r = release({ RELEASE_DRY_RUN: "true", RELEASE_KIND: "manual", RELEASE_REASON: "dry run" });
check(r.status === 0 && /released=false/.test(r.outputs) && !releaseHead(), "R06 dry run does not move release");

r = release();
check(r.status === 0 && /released=true/.test(r.outputs) && releaseHead() === a, "R07 first release creates release at main");
r = release();
check(r.status === 0 && /Nothing to release/.test(r.out) && /released=false/.test(r.outputs), "R08 nothing to release: no push, no build");

const b = commit("b");
const c = commit("c");
sh(work, "push", "--quiet", "origin", "HEAD:main");
r = release();
check(r.status === 0 && releaseHead() === c && /2 merge\(s\)/.test(r.out), "R09 batched release fast-forwards release over two merges");

r = release({ RELEASE_KIND: "emergency", RELEASE_REASON: "test", RELEASE_REF: b });
check(r.status === 1 && /not an ancestor/.test(r.out) && releaseHead() === c, "R10 release never moves backwards (no rewind, no force)");

sh(work, "checkout", "--quiet", "-b", "feature");
const unmerged = commit("unmerged");
sh(work, "push", "--quiet", "origin", "feature");
r = release({ RELEASE_KIND: "emergency", RELEASE_REASON: "test", RELEASE_REF: unmerged });
check(r.status === 1 && /is not on main/.test(r.out) && releaseHead() === c, "R11 an unmerged commit can never be released");

const source = fs.readFileSync(script, "utf8");
const pushCalls = source.split("\n").filter(line => /git\("push"/.test(line));
check(pushCalls.length === 1 && pushCalls.every(line => !/--force|"-f"|"\+/.test(line) && /:refs\/heads\/release`\)/.test(line)),
  "R12 the release script has one push, fast-forward only (no force, no + refspec)");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/release-website.yml"), "utf8");
check(/WEBSITE_RELEASE_BATCHING/.test(workflow) && /enabled=false/.test(workflow) && /if: steps\.gate\.outputs\.enabled == 'true'/.test(workflow), "R13 the workflow is inert unless WEBSITE_RELEASE_BATCHING is enabled");
check(/EXPECTED_PRODUCTION_BRANCH: release/.test(workflow) && /verify-live-production-parity\.mjs/.test(workflow), "R14 each release is verified live on the release branch");
const parity = fs.readFileSync(path.join(root, ".github/workflows/live-production-parity.yml"), "utf8");
check(/if: vars\.WEBSITE_RELEASE_BATCHING != 'enabled'/.test(parity), "R15 the main-merge parity check keeps running until batching is enabled");
const verifier = fs.readFileSync(path.join(root, "scripts/verify-live-production-parity.mjs"), "utf8");
check(/\["main", "release"\]\.includes\(expectedBranch\)/.test(verifier), "R16 the live verifier accepts only main or release as the production branch");

fs.rmSync(tmp, { recursive: true, force: true });
for (const failure of failures) console.error(`FAIL | ${failure}`);
console.log(`WebsiteReleaseBatching: ${passes.length}/${passes.length + failures.length} checks passed`);
if (failures.length) process.exitCode = 1;
