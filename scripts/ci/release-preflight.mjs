#!/usr/bin/env node
// Release batching preflight (docs/WEBSITE_RELEASE_BATCHING.md, "Controlled production activation").
// Proves, before batching is enabled, that:
//   P1  batching is still off and today's main-merge parity check still runs;
//   P2  production is still built from main (live deploy-meta.json);
//   P3  the release GitHub App token works and is limited to this repository;
//   P4  `release` and `release-preflight` are covered by rules that block deletion, force pushes and updates;
//   P5  the App can create, fast-forward and delete the scratch branch `release-preflight` (bypass works);
//   P6  the ordinary workflow token is refused when it tries to update `release-preflight` (updates are restricted);
//   P7  the real `release` branch was not touched.
// It never pushes to `release`, never changes a variable, never touches Netlify, and always deletes its scratch branch.
// Environment: APP_TOKEN, GITHUB_TOKEN (contents: write, used only for the P6 refusal test), GITHUB_REPOSITORY,
// BATCHING (vars.WEBSITE_RELEASE_BATCHING), LIVE_URL (default https://goflipforge.com/deploy-meta.json).
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

export const SCRATCH = "release-preflight";
const REQUIRED_RULES = ["deletion", "non_fast_forward", "update"];
// Option A (no App configured): the workflow token pushes, so `release` must NOT restrict updates.
const REQUIRED_RULES_OPTION_A = ["deletion", "non_fast_forward"];

const results = [];
const record = (id, ok, detail) => results.push({ id, ok: Boolean(ok), detail });

export function missingRules(ruleTypes, required = REQUIRED_RULES) {
  const present = new Set((ruleTypes || []).map(rule => rule?.type).filter(Boolean));
  return required.filter(type => !present.has(type));
}

/** Option A: deletion and force pushes blocked, updates NOT restricted (the workflow token must be able to fast-forward). */
export function optionAProblems(ruleTypes) {
  const problems = missingRules(ruleTypes, REQUIRED_RULES_OPTION_A).map(type => `missing: ${type}`);
  if ((ruleTypes || []).some(rule => rule?.type === "update")) problems.push("Restrict updates is on: the workflow token would be refused");
  return problems;
}

export function releasePermissionsOk(releaseWorkflow) {
  return /permissions:\s*\n\s*contents: write/.test(releaseWorkflow);
}

export function parityStillActive(parityWorkflow, batching) {
  return /if: vars\.WEBSITE_RELEASE_BATCHING != 'enabled'/.test(parityWorkflow) && batching !== "enabled";
}

async function api(token, method, url, body) {
  const response = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, json };
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function pushWith(token, repo, refspec) {
  // Credentials go in an HTTP header for this one command only; they are never written to disk or printed.
  const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  const result = spawnSync("git", ["-c", `http.https://github.com/.extraheader=${header}`, "push",
    `https://github.com/${repo}.git`, refspec], { encoding: "utf8" });
  return { ok: result.status === 0, out: `${result.stdout}${result.stderr}`.replace(/x-access-token:[^@\s]+/g, "x-access-token:***") };
}

// Option A preflight (no App configured): read-only. Nothing is pushed; the push behaviour of Option A was proven on
// 2026-10-23 with a throwaway branch (docs/WEBSITE_RELEASE_BATCHING.md).
async function optionA({ GITHUB_TOKEN, repo, BATCHING }) {
  const liveUrl = process.env.LIVE_URL || "https://goflipforge.com/deploy-meta.json";
  const parity = fs.readFileSync(".github/workflows/live-production-parity.yml", "utf8");
  record("P1 batching is off and the main-merge parity check still runs", parityStillActive(parity, BATCHING),
    `WEBSITE_RELEASE_BATCHING=${BATCHING || "(unset)"}`);
  try {
    const manifest = await (await fetch(liveUrl, { headers: { "Cache-Control": "no-cache" } })).json();
    record("P2 production is still built from main", manifest.branch === "main" && manifest.production === true,
      `branch=${manifest.branch}, commit=${String(manifest.commitRef).slice(0, 12)}`);
  } catch (error) {
    record("P2 production is still built from main", false, `deploy-meta unreadable: ${error.name}`);
  }
  record("P3 no release App is configured, so releases push with the workflow token (Option A)", true,
    "WEBSITE_RELEASE_APP_ID unset");
  const release = fs.readFileSync(".github/workflows/release-website.yml", "utf8");
  record("P5 the release workflow token may push (contents: write)", releasePermissionsOk(release), "release-website.yml permissions");
  const rules = await api(GITHUB_TOKEN, "GET", `/repos/${repo}/rules/branches/release`);
  const problems = rules.status === 200 ? optionAProblems(rules.json) : ["rules unreadable"];
  record("P4 'release' blocks deletion and force pushes, and does not restrict updates", problems.length === 0,
    problems.length ? problems.join("; ") : "deletion and force pushes blocked; updates allowed");
  const releaseRef = await api(GITHUB_TOKEN, "GET", `/repos/${repo}/git/ref/heads/release`);
  record("P7 the real release branch was not touched", true,
    releaseRef.status === 200 ? `release=${releaseRef.json.object.sha.slice(0, 12)}` : "release branch does not exist yet");
  finish("Option A (workflow token)");
}

function finish(mode) {
  const lines = ["### Release batching preflight", "", `Mode: ${mode}`, "", "| Check | Result | Detail |", "| --- | --- | --- |",
    ...results.map(r => `| ${r.id} | ${r.ok ? "PASS" : "**FAIL**"} | ${r.detail} |`), "",
    "Nothing was enabled: batching, the parity check, Netlify and the `release` branch are unchanged."];
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  for (const r of results) console.log(`${r.ok ? "::notice" : "::error"} title=${r.id.split(" ")[0]}::${r.ok ? "PASS" : "FAIL"}: ${r.id} (${r.detail})`);
  if (results.some(r => !r.ok)) process.exitCode = 1;
}

async function main() {
  const { APP_TOKEN, GITHUB_TOKEN, GITHUB_REPOSITORY: repo, BATCHING = "", APP_ID = "" } = process.env;
  if (!APP_ID.trim()) return optionA({ GITHUB_TOKEN, repo, BATCHING });
  const liveUrl = process.env.LIVE_URL || "https://goflipforge.com/deploy-meta.json";
  if (!repo || !GITHUB_TOKEN) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required.");

  // P1: batching off, parity check unchanged.
  const parity = fs.readFileSync(".github/workflows/live-production-parity.yml", "utf8");
  record("P1 batching is off and the main-merge parity check still runs", parityStillActive(parity, BATCHING),
    `WEBSITE_RELEASE_BATCHING=${BATCHING || "(unset)"}`);

  // P2: production still built from main.
  try {
    const manifest = await (await fetch(liveUrl, { headers: { "Cache-Control": "no-cache" } })).json();
    record("P2 production is still built from main", manifest.branch === "main" && manifest.production === true,
      `branch=${manifest.branch}, commit=${String(manifest.commitRef).slice(0, 12)}`);
  } catch (error) {
    record("P2 production is still built from main", false, `deploy-meta unreadable: ${error.name}`);
  }

  // P3: App token works and is limited to this repository.
  if (!APP_TOKEN) {
    record("P3 release App token was created", false, "WEBSITE_RELEASE_APP_ID / WEBSITE_RELEASE_APP_PRIVATE_KEY missing or invalid");
  } else {
    const installed = await api(APP_TOKEN, "GET", "/installation/repositories?per_page=100");
    const names = (installed.json?.repositories || []).map(r => r.full_name.toLowerCase());
    record("P3 release App token works and reaches only this repository",
      installed.status === 200 && names.length === 1 && names[0] === repo.toLowerCase(), `repositories=${names.length}`);
  }

  // P4: rules on release and the scratch branch.
  for (const branch of ["release", SCRATCH]) {
    const rules = await api(GITHUB_TOKEN, "GET", `/repos/${repo}/rules/branches/${branch}`);
    const missing = rules.status === 200 ? missingRules(rules.json) : REQUIRED_RULES;
    record(`P4 '${branch}' blocks deletion, force pushes and updates`, rules.status === 200 && missing.length === 0,
      missing.length ? `missing: ${missing.join(", ")}` : "all three rules active");
  }

  // P5 / P6 / P7: empirical bypass test on the scratch branch only.
  const releaseBefore = await api(GITHUB_TOKEN, "GET", `/repos/${repo}/git/ref/heads/release`);
  const releaseSha = releaseBefore.status === 200 ? releaseBefore.json.object.sha : "";
  const head = git("rev-parse", "origin/main");
  const parent = git("rev-parse", "origin/main~1");
  let scratchCreated = false;
  if (APP_TOKEN) {
    const create = pushWith(APP_TOKEN, repo, `${parent}:refs/heads/${SCRATCH}`);
    scratchCreated = create.ok;
    const refused = pushWith(GITHUB_TOKEN, repo, `${head}:refs/heads/${SCRATCH}`);
    record("P6 the ordinary workflow token is refused an update (Restrict updates is enforced)",
      create.ok && !refused.ok && /rule|GH013|protected|declined/i.test(refused.out),
      create.ok ? (refused.ok ? "update was ALLOWED" : "update refused by repository rules") : "scratch branch not created");
    const forward = pushWith(APP_TOKEN, repo, `${head}:refs/heads/${SCRATCH}`);
    record("P5 the release App can fast-forward a protected branch (bypass works)", create.ok && forward.ok,
      forward.ok ? "fast-forward accepted" : forward.out.split("\n").find(line => /rule|denied|error/i.test(line)) || "push failed");
  } else {
    record("P5 the release App can fast-forward a protected branch (bypass works)", false, "no App token");
  }
  if (scratchCreated) {
    const removed = pushWith(APP_TOKEN, repo, `:refs/heads/${SCRATCH}`);
    record(`cleanup: scratch branch '${SCRATCH}' deleted`, removed.ok, removed.ok ? "deleted" : "DELETE MANUALLY");
  }
  const releaseAfter = await api(GITHUB_TOKEN, "GET", `/repos/${repo}/git/ref/heads/release`);
  const afterSha = releaseAfter.status === 200 ? releaseAfter.json.object.sha : "";
  record("P7 the real release branch was not touched", afterSha === releaseSha,
    releaseSha ? `release=${releaseSha.slice(0, 12)}` : "release branch does not exist yet");

  finish("Option B (GitHub App)");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.log(`::error title=preflight::${error.message}`);
    process.exitCode = 1;
  });
}
