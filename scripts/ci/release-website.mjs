// Moves the `release` branch (Netlify's production branch under release batching) forward to a tested
// commit on `main`. See docs/WEBSITE_RELEASE_BATCHING.md.
//
// Guarantees:
// - only commits already on main are released (the target must be an ancestor of, or equal to, origin/main);
// - release only moves forward. History is never rewritten and nothing is force-pushed. Normally release fast-forwards
//   to the target. When release holds commits main does not have (a backport made straight onto release), the script
//   reconciles instead: it proves release currently serves exactly the files of a commit on main, then pushes one
//   merge commit (parents: release, target) whose tree is exactly the target's tree. Any real release-only change is
//   refused: land it on main first;
// - the four required checks must have succeeded on the target commit;
// - nothing happens when release already equals the target (no Netlify build, no credits).
//
// Environment: GITHUB_TOKEN, GITHUB_REPOSITORY, RELEASE_REF (default "main"), RELEASE_REASON, RELEASE_KIND
// ("scheduled" | "manual" | "emergency"), RELEASE_DRY_RUN ("true" to stop before pushing).
// Writes outputs released=true|false and sha=<commit> to $GITHUB_OUTPUT.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

export const REQUIRED_CHECKS = [
  "Pre-Beta Security gate",
  "Independent Audit C-L gate",
  "Validate core SaaS Beta Complete static gate",
  "Validate workflow action references",
];

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const tryGit = (...args) => {
  try { return { ok: true, out: git(...args) }; } catch { return { ok: false, out: "" }; }
};
const output = (key, value) => {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
};
const summary = lines => {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
};
const fail = message => {
  console.log(`::error title=Website release refused::${message}`);
  summary(["### Website release refused", "", message]);
  output("released", "false");
  process.exit(1);
};

export async function requiredCheckStates(sha, { repository, token, fetchImpl = fetch } = {}) {
  const states = Object.fromEntries(REQUIRED_CHECKS.map(name => [name, "missing"]));
  const newest = {};
  for (let page = 1; page <= 5; page++) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}/commits/${sha}/check-runs?per_page=100&page=${page}`,
      { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } },
    );
    if (!response.ok) throw new Error(`GitHub check-runs lookup failed: HTTP ${response.status}`);
    const body = await response.json();
    for (const run of body.check_runs || []) {
      if (!(run.name in states)) continue;
      // A re-run check counts by its newest attempt only: a later failure is never hidden by an older success.
      const at = Date.parse(run.started_at || run.completed_at || 0) || 0;
      if (newest[run.name] !== undefined && newest[run.name] >= at) continue;
      newest[run.name] = at;
      states[run.name] = run.status !== "completed" ? "pending" : run.conclusion || "unknown";
    }
    if ((body.check_runs || []).length < 100) break;
  }
  return states;
}

/**
 * release is not an ancestor of the target: commits were made straight onto release (a backport such as #594 / #597,
 * or this script's own earlier reconciling commits). Moving release forward is safe only if release currently serves
 * exactly the files of a commit on main (the target or one of its first-parent ancestors): then nothing exists on
 * release that main lacks, and the release ships exactly the target's files. Anything else is refused.
 */
export const RECONCILE_HISTORY_DEPTH = 500;
export function reconcilePlan(release, target, run = tryGit) {
  const targetTree = run("rev-parse", `${target}^{tree}`).out;
  const releaseTree = run("rev-parse", `${release}^{tree}`).out;
  const releaseOnly = run("log", "--format=%h %s", `${target}..${release}`, "--max-count=50").out.split("\n").filter(Boolean);
  if (!targetTree || !releaseTree) return { refusal: "Cannot read the release or target tree." };
  if (releaseTree === targetTree) return { sameContent: true, targetTree, releaseOnly };
  const history = run("log", "--first-parent", `--max-count=${RECONCILE_HISTORY_DEPTH}`, "--format=%H %T", target).out
    .split("\n").filter(Boolean).map(line => line.split(" "));
  const match = history.find(([, tree]) => tree === releaseTree);
  if (!match) {
    return { refusal: `release (${release.slice(0, 12)}) serves files that match no commit on main `
      + `(release-only commits: ${releaseOnly.join("; ") || "none listed"}). Releasing would drop or ship changes main does not have. `
      + "Land those changes on main first, then release." };
  }
  return { targetTree, releaseOnly, servedMainCommit: match[0] };
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const ref = String(process.env.RELEASE_REF || "main").trim();
  const kind = String(process.env.RELEASE_KIND || "manual").trim();
  const reason = String(process.env.RELEASE_REASON || "").trim().slice(0, 200);
  const dryRun = String(process.env.RELEASE_DRY_RUN || "") === "true";
  if (!repository || !token) fail("GITHUB_REPOSITORY and GITHUB_TOKEN are required.");
  if (!["scheduled", "manual", "emergency"].includes(kind)) fail(`Unknown release kind ${kind}.`);
  if (kind !== "scheduled" && !reason) fail("A reason is required for manual and emergency releases.");

  git("fetch", "--quiet", "origin", "+refs/heads/main:refs/remotes/origin/main");
  const resolved = tryGit("rev-parse", "--verify", `${ref === "main" ? "origin/main" : ref}^{commit}`);
  if (!resolved.ok) fail(`Cannot resolve ${ref} to a commit.`);
  const target = resolved.out;
  if (!tryGit("merge-base", "--is-ancestor", target, "origin/main").ok) {
    fail(`${target.slice(0, 12)} is not on main. Only merged, tested commits can be released.`);
  }

  const remoteRelease = tryGit("ls-remote", "--heads", "origin", "release").out.split(/\s+/)[0] || "";
  let reconcile = null;
  if (remoteRelease) {
    git("fetch", "--quiet", "origin", "+refs/heads/release:refs/remotes/origin/release");
    if (remoteRelease === target) {
      console.log(`Nothing to release: release is already at ${target.slice(0, 12)}.`);
      summary(["### Nothing to release", "", `\`release\` is already at \`${target.slice(0, 12)}\`. No Netlify build was started.`]);
      output("released", "false");
      output("sha", target);
      return;
    }
    if (tryGit("merge-base", "--is-ancestor", target, remoteRelease).ok) {
      fail(`release (${remoteRelease.slice(0, 12)}) is not an ancestor of ${target.slice(0, 12)}. `
        + "Releases only move forward; use the rollback procedure instead of rewinding release.");
    }
    if (!tryGit("merge-base", "--is-ancestor", remoteRelease, target).ok) {
      reconcile = reconcilePlan(remoteRelease, target);
      if (reconcile.refusal) fail(reconcile.refusal);
      if (reconcile.sameContent) {
        console.log(`Nothing to release: release (${remoteRelease.slice(0, 12)}) already serves exactly the files of ${target.slice(0, 12)}.`);
        summary(["### Nothing to release", "", `\`release\` already serves exactly the files of \`${target.slice(0, 12)}\`. No Netlify build was started.`]);
        output("released", "false");
        output("sha", remoteRelease);
        output("content_sha", target);
        return;
      }
    }
  }

  const states = await requiredCheckStates(target, { repository, token });
  const notPassing = Object.entries(states).filter(([, state]) => state !== "success");
  if (notPassing.length) {
    fail(`Required checks have not all passed on ${target.slice(0, 12)}: `
      + notPassing.map(([name, state]) => `${name}=${state}`).join(", "));
  }

  const range = remoteRelease ? `${remoteRelease}..${target}` : target;
  const merges = tryGit("log", "--first-parent", "--format=%h %s", range, "--max-count=50").out
    .split("\n").filter(Boolean);
  const batched = remoteRelease ? merges.length : 1;
  console.log(`Releasing ${target.slice(0, 12)} (${kind}) with ${batched} merge(s) since the last release.`);

  if (reconcile) {
    console.log(`release has ${reconcile.releaseOnly.length} commit(s) that main does not have; release serves exactly the files of main `
      + `${reconcile.servedMainCommit.slice(0, 12)}, so they add nothing main lacks:`);
    for (const line of reconcile.releaseOnly) console.log(`  ${line}`);
  }

  if (dryRun) {
    summary(["### Dry run: release not pushed", "",
      `Would release \`${target.slice(0, 12)}\` (${kind})${reconcile ? " with a reconciling merge commit (tree identical to the target)" : ""}.`]);
    output("released", "false");
    output("sha", target);
    output("content_sha", target);
    return;
  }

  let pushSha = target;
  if (reconcile) {
    const message = `Release ${target.slice(0, 12)} (reconcile release with main)\n\n`
      + `Tree is exactly ${target.slice(0, 12)}'s tree. These release-only commits add nothing main lacks:\n`
      + reconcile.releaseOnly.map(line => `- ${line}`).join("\n");
    pushSha = git("commit-tree", reconcile.targetTree, "-p", remoteRelease, "-p", target, "-m", message);
    if (git("rev-parse", `${pushSha}^{tree}`) !== reconcile.targetTree) fail("Reconciling commit does not carry the target tree.");
  }

  const pushVia = (process.env.RELEASE_PUSH_CREDENTIAL || "workflow token (Option A)").trim();
  console.log(`Pushing with: ${pushVia}`);
  // Fast-forward push (to the target, or to the reconciling commit whose first parent is release). No --force: the
  // remote refuses anything that would rewrite release.
  git("push", "origin", `${pushSha}:refs/heads/release`);
  output("released", "true");
  output("sha", pushSha);
  output("content_sha", target);
  summary([
    `### Website release: \`${target.slice(0, 12)}\` (${kind})`,
    "",
    reason ? `Reason: ${reason}` : "Scheduled daily release.",
    ...(reconcile ? ["", `Reconciled: release had ${reconcile.releaseOnly.length} commit(s) not on main that add nothing main lacks. `
      + `Pushed merge commit \`${pushSha.slice(0, 12)}\` whose files are exactly \`${target.slice(0, 12)}\`.`] : []),
    "",
    `Pushed with: ${pushVia}.`,
    "",
    `Merges in this release: ${batched}. One production deploy instead of ${batched} (about ${Math.max(0, batched - 1) * 15} credits saved).`,
    "",
    ...merges.map(line => `- ${line}`),
  ]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => fail(error.message || String(error)));
}
