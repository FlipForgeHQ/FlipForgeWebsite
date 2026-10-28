// Blocked deploy previews (Netlify Firewall Traffic Rule on unpublished deploys) are reported as skipped, never as
// tested or passed, never mistaken for a reachable preview, and a partially reachable preview is never reported as
// blocked. Production checks stay required, and an unbuilt or failed preview deploy still fails.
// Local only: every HTTP answer below comes from a stubbed fetch; nothing is sent over the network.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { SENTINEL_PATHS, classifyPreviewProbe, normalizeBlockBody, probePreview } from "../lib/preview-block-detection.mjs";

const failures = [];
const passes = [];
const check = (condition, message) => (condition ? passes : failures).push(message);

const BLOCK_PAGE = id => `<!DOCTYPE html><html><head><title>Page not found</title></head><body><h1>Page not found</h1>`
  + `<p>Looks like you've followed a broken link or entered a URL that doesn't exist on this site.</p>`
  + `<p>Netlify Request ID: ${id}</p><p>${new Date(Date.UTC(2026, 9, 22, 1, 2, id.length)).toISOString()}</p></body></html>`;
const requestId = n => `01JB${String(n).padStart(4, "0")}X9K7Q2M4ZT8WAVN3`;
const blocked = (status = 404) => SENTINEL_PATHS.map((p, i) => ({ path: p, status, body: BLOCK_PAGE(requestId(i)), headers: { "content-type": "text/html" } }));

// ---------------------------------------------------------------- classifier
check(classifyPreviewProbe(blocked(404)).state === "blocked", "same 404 block page on every sentinel path -> blocked");
check(classifyPreviewProbe(blocked(403)).state === "blocked", "same 403 block page on every sentinel path -> blocked");
check(classifyPreviewProbe(blocked(404)).status === 404, "blocked result reports the block status");
check(normalizeBlockBody(BLOCK_PAGE(requestId(1))) === normalizeBlockBody(BLOCK_PAGE(requestId(7))), "request IDs and timestamps are ignored");
const withPath = blocked().map(item => ({ ...item, body: `${item.body}<p>Path: ${item.path}</p>` }));
check(classifyPreviewProbe(withPath).state === "blocked", "a block page that echoes the requested path is still one block page");

const partial = (index, change) => blocked().map((item, i) => (i === index ? { ...item, ...change } : item));
check(classifyPreviewProbe(partial(0, { status: 200, body: "<html>home</html>" })).state === "reachable", "root served while others blocked -> reachable");
check(classifyPreviewProbe(partial(1, { status: 200, body: '{"commitRef":"abc"}' })).state === "reachable", "deploy-meta served -> reachable");
check(classifyPreviewProbe(partial(4, { status: 401, body: '{"error":{"code":"UNAUTHENTICATED","correlationId":"x"}}' })).state === "reachable", "FlipForge API error JSON on one path -> reachable");
check(classifyPreviewProbe(partial(3, { body: "<title>FlipForge</title> not found" })).state === "reachable", "FlipForge 404 page on one path -> reachable");
check(classifyPreviewProbe(partial(2, { headers: { "x-flipforge-upstream-env": "staging" } })).state === "reachable", "FlipForge gateway header on one path -> reachable");
check(classifyPreviewProbe(partial(2, { headers: { "x-correlation-id": "abc" } })).state === "reachable", "correlation header on one path -> reachable");
check(classifyPreviewProbe(partial(0, { status: 302, body: "" })).state === "reachable", "redirect on one path -> reachable");
check(classifyPreviewProbe(partial(2, { body: "<html>a different error page</html>" })).state !== "blocked", "different body on one path -> not blocked");
check(classifyPreviewProbe(partial(2, { status: 403 })).state !== "blocked", "mixed 403/404 -> not blocked");
check(classifyPreviewProbe(blocked(500)).state !== "blocked", "uniform 500 -> not blocked");
check(classifyPreviewProbe(blocked(401)).state !== "blocked", "uniform 401 -> not blocked");
check(classifyPreviewProbe(partial(3, { status: 0, error: "TimeoutError" })).state === "unreachable", "timeout on one path -> unreachable");
check(classifyPreviewProbe(blocked().slice(0, 3)).state === "unreachable", "incomplete probe -> unreachable");
check(classifyPreviewProbe([]).state === "unreachable", "no answers -> unreachable");

// probePreview: credential-free GETs of every sentinel path, no redirects followed, cache-bust only when asked.
const seen = [];
const stubFetch = async (url, init) => {
  seen.push({ url: String(url), init });
  return new Response(BLOCK_PAGE(requestId(seen.length)), { status: 404, headers: { "content-type": "text/html" } });
};
const probed = await probePreview("https://deploy-preview-1--goflipforge.netlify.app", { fetchImpl: stubFetch });
check(probed.state === "blocked", "probePreview classifies a stubbed block page as blocked");
check(seen.length === SENTINEL_PATHS.length && seen.every(item => item.init.method === "GET" && item.init.redirect === "manual" && item.init.credentials === "omit"), "probePreview sends credential-free GETs without following redirects");
check(seen.every(item => !("authorization" in Object.fromEntries(Object.entries(item.init.headers).map(([k, v]) => [k.toLowerCase(), v])))), "probePreview sends no Authorization header");
seen.length = 0;
await probePreview("https://deploy-preview-1--goflipforge.netlify.app", { fetchImpl: stubFetch, cacheBust: true });
check(seen.every(item => /\?ci=\d+$/.test(item.url)), "cacheBust adds ?ci=<n> to every probe");

// ---------------------------------------------------------------- scenarios through the real scripts (stubbed fetch)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ff-preview-block-"));
const stubFile = path.join(tmp, "fetch-stub.mjs");
fs.writeFileSync(stubFile, `
const PREVIEW = "deploy-preview-1--goflipforge.netlify.app";
const PRODUCTION = new Set(["goflipforge.com", "www.goflipforge.com"]);
const scenario = process.env.FF_STUB_SCENARIO || "";
const [previewMode, productionMode] = scenario.split("+");
const privileged = ["/api/beta/operator", "/api/beta/founder-select", "/api/beta/terms-acceptance", "/api/updates/subscribers"];
const dataPaths = ["/api/v1/entitlements", "/api/v1/portfolio"];
let n = 0;
const json = (status, body, env) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-correlation-id": "c" + n, ...(env ? { "x-flipforge-upstream-env": env } : {}) } });
const block = () => new Response(${JSON.stringify(BLOCK_PAGE("REQ"))}.replace("REQ", "01JB" + String(++n).padStart(4, "0") + "X9K7Q2M4ZT8WAVN3"), { status: 404, headers: { "content-type": "text/html" } });
function site(pathname, method, env, overrides) {
  if (overrides[method + " " + pathname]) return overrides[method + " " + pathname]();
  if (pathname === "/" ) return new Response("<!doctype html><title>FlipForge</title>", { status: 200, headers: { "content-type": "text/html" } });
  if (pathname === "/robots.txt") return new Response("User-agent: *\\nAllow: /\\n# FlipForge", { status: 200 });
  if (pathname === "/deploy-meta.json") return json(200, { commitRef: process.env.FF_STUB_COMMIT || "0000000" });
  if (pathname === "/api/v1/health") return json(200, { data: { authenticationRequired: true, upstreamEnvironment: env } }, env);
  if (dataPaths.includes(pathname)) return json(401, { error: { code: "UNAUTHENTICATED", correlationId: "c" } }, env);
  if (privileged.includes(pathname)) return env === "production" ? json(401, { error: { code: "UNAUTHENTICATED" } }) : new Response("<title>FlipForge</title> Not found", { status: 404 });
  return new Response("<!doctype html><title>FlipForge</title> Page not found", { status: 404, headers: { "content-type": "text/html" } });
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  if (url.hostname === PREVIEW) {
    if (previewMode === "blocked") return block();
    if (previewMode === "reachable") return site(url.pathname, method, "staging", {});
    // Blocked everywhere except one privileged endpoint that answers like the site: partially reachable.
    if (previewMode === "partial") return url.pathname === "/api/beta/operator" ? json(200, { data: { operator: true } }) : block();
    // The root is blocked but the gateway still answers: partially reachable, and wired to production.
    if (previewMode === "partial-gateway") return url.pathname.startsWith("/api/v1/") ? site(url.pathname, method, "production", {}) : block();
    throw new TypeError("fetch failed");
  }
  if (PRODUCTION.has(url.hostname)) {
    if (productionMode === "broken") return site(url.pathname, method, "production", { "GET /api/beta/operator": () => json(200, { data: { operator: true } }) });
    return site(url.pathname, method, "production", {});
  }
  throw new Error("unexpected host in local test: " + url.hostname);
};
`);
const stubImport = pathToFileURL(stubFile).href;

function runVerifier(scenario, extraEnv = {}) {
  const result = spawnSync(process.execPath, ["--import", stubImport, "scripts/verify-preview-isolation.mjs", "--remote"], {
    encoding: "utf8",
    env: { ...process.env, PREVIEW_URL: "https://deploy-preview-1--goflipforge.netlify.app", PRODUCTION_URL: "https://goflipforge.com", PREVIEW_DEPLOY_STATUS: "", FF_STUB_SCENARIO: scenario, ...extraEnv },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

let r = runVerifier("blocked+good", { PREVIEW_DEPLOY_STATUS: "success" });
check(r.status === 0 && /state=blocked/.test(r.out) && /PASS \| 0 \|/.test(r.out), "verify --remote: blocked preview + Netlify status success + healthy production -> exit 0");
check(/SKIP \| 1 \| preview privileged endpoints not tested/.test(r.out) && /SKIP \| 2 \| preview gateway not tested/.test(r.out) && /SKIP \| 4 \| preview internal paths not tested/.test(r.out), "verify --remote: blocked preview checks are reported as SKIP");
check(!/PASS \| (1|2|2[a-d]) \|/.test(r.out) && !/PASS \| 4 \| preview/.test(r.out), "verify --remote: no preview check is reported as PASS when the preview is blocked");
check(/skipped \(not tested\)/.test(r.out) && /Preview checks were SKIPPED/.test(r.out), "verify --remote: summary states the preview checks were skipped and not tested");
check(/PASS \| 3 \| production GET \/api\/beta\/operator requires authentication/.test(r.out) && /PASS \| 3b \|/.test(r.out) && /PASS \| 3d \|/.test(r.out) && /PASS \| 4 \| production internal path/.test(r.out), "verify --remote: production checks still run when the preview is blocked");
check(!/FAIL/.test(r.out), "verify --remote: no FAIL lines for blocked preview + successful deploy + healthy production");

r = runVerifier("blocked+good");
check(r.status === 1 && /FAIL \| 0 \|.*deploy-status=not supplied/.test(r.out), "verify --remote: blocked page without a Netlify deploy status -> FAIL (could be a failed or unbuilt deploy)");
for (const status of ["missing", "pending", "failure"]) {
  r = runVerifier("blocked+good", { PREVIEW_DEPLOY_STATUS: status });
  check(r.status === 1 && /FAIL \| 0 \|/.test(r.out), `verify --remote: blocked page with Netlify status ${status} -> FAIL (could be an unbuilt preview)`);
}

r = runVerifier("blocked+broken", { PREVIEW_DEPLOY_STATUS: "success" });
check(r.status === 1 && /FAIL \| 3 \| production GET \/api\/beta\/operator/.test(r.out), "verify --remote: blocked preview + broken production -> FAIL");

r = runVerifier("partial+good");
check(r.status === 1 && !/state=blocked/.test(r.out) && /FAIL \| 1 \| preview GET \/api\/beta\/operator is not served/.test(r.out), "verify --remote: partially reachable preview is never treated as blocked (strict FAIL)");

r = runVerifier("partial-gateway+good");
check(r.status === 1 && !/state=blocked/.test(r.out) && /FAIL \| 2c \|/.test(r.out), "verify --remote: preview gateway reachable behind a blocked root -> strict checks run and FAIL");

r = runVerifier("reachable+good");
check(r.status === 0 && /state=reachable/.test(r.out) && /PASS \| 1 \| preview POST \/api\/beta\/operator is not served/.test(r.out) && /PASS \| 2c \|/.test(r.out) && /PASS \| 4 \| preview internal path/.test(r.out), "verify --remote: reachable, isolated preview -> original strict checks run and PASS");

r = runVerifier("down+good");
check(r.status === 1 && /state=unreachable/.test(r.out) && /FAIL \| 2a \|/.test(r.out), "verify --remote: preview network failure -> strict FAIL, not blocked");

// ---------------------------------------------------------------- check-preview-reachability CLI
function runCli(args, scenario, extraEnv = {}) {
  const result = spawnSync(process.execPath, ["--import", stubImport, "scripts/check-preview-reachability.mjs", ...args], {
    encoding: "utf8",
    env: { ...process.env, FF_STUB_SCENARIO: scenario, ...extraEnv },
  });
  return { status: result.status, out: result.stdout };
}
const SHA = "0123456789abcdef0123456789abcdef01234567";
r = runCli(["https://deploy-preview-1--goflipforge.netlify.app", SHA], "blocked+good");
check(r.status === 0 && /^state=blocked$/m.test(r.out) && /^serving=false$/m.test(r.out), "CLI: blocked preview -> state=blocked serving=false");
r = runCli(["https://deploy-preview-1--goflipforge.netlify.app", SHA], "reachable+good", { FF_STUB_COMMIT: SHA });
check(r.status === 0 && /^state=reachable$/m.test(r.out) && /^serving=true$/m.test(r.out) && new RegExp(`^commit=${SHA}$`, "m").test(r.out), "CLI: preview serving the head commit -> serving=true");
r = runCli(["https://deploy-preview-1--goflipforge.netlify.app", SHA], "reachable+good", { FF_STUB_COMMIT: "fedcba9" });
check(/^serving=false$/m.test(r.out) && /^commit=fedcba9$/m.test(r.out), "CLI: preview serving an older commit -> serving=false");
r = runCli(["https://deploy-preview-1--goflipforge.netlify.app", SHA], "partial+good");
check(/^state=reachable$/m.test(r.out), "CLI: partially reachable preview -> reachable, never blocked");
for (const bad of ["https://goflipforge.com", "http://deploy-preview-1--goflipforge.netlify.app", "https://deploy-preview-1--goflipforge.netlify.app/x", "https://evil.example/--x.netlify.app", ""]) {
  r = runCli([bad, SHA], "blocked+good");
  check(r.status === 2 && /^state=invalid$/m.test(r.out), `CLI: rejects preview URL ${JSON.stringify(bad)}`);
}

// ---------------------------------------------------------------- the CI wait step itself
// Runs the workflow's own "Wait for this commit's deploy preview" script with stubbed fetch, a stub gh (Netlify's
// commit status) and a no-op sleep.
const workflow = fs.readFileSync(".github/workflows/invite-activation-assurance.yml", "utf8").split("\n");
const stepIndex = workflow.findIndex(line => /- name: Wait for this commit's deploy preview\s*$/.test(line));
const runIndex = workflow.findIndex((line, i) => i > stepIndex && /^\s+run: \|\s*$/.test(line));
const runIndent = workflow[runIndex].search(/\S/);
const body = [];
for (let i = runIndex + 1; i < workflow.length; i++) {
  const line = workflow[i];
  if (line.trim() && line.search(/\S/) <= runIndent) break;
  body.push(line);
}
const bodyIndent = Math.min(...body.filter(line => line.trim()).map(line => line.search(/\S/)));
const waitScript = path.join(tmp, "wait.sh");
// Five attempts instead of sixty keep the test fast; every decision is reached within three.
const waitText = body.map(line => line.slice(bodyIndent)).join("\n");
fs.writeFileSync(waitScript, waitText.replace("$(seq 1 60)", "$(seq 1 5)"));
const bin = path.join(tmp, "bin");
fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, "gh"), "#!/bin/sh\nprintf '%s\\n' \"$FF_STUB_DEPLOY_STATUS\"\n", { mode: 0o755 });
fs.writeFileSync(path.join(bin, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
const workflowReadable = stepIndex >= 0 && runIndex > stepIndex && body.length > 5 && waitText.includes("$(seq 1 60)");
check(workflowReadable, "workflow wait step found");
check(workflow.some(line => /^\s+name: Invite activation on the Netlify deploy preview\s*$/.test(line)), "deploy-preview job name unchanged");
const inviteJobAt = workflow.findIndex(line => /^\s+name: Invite activation on the Netlify deploy preview\s*$/.test(line));
const inviteJob = workflow.slice(inviteJobAt, inviteJobAt + 8).join("\n");
check(/needs: deploy-preview-reachability/.test(inviteJob) && /if: github\.event_name == 'pull_request' && needs\.deploy-preview-reachability\.outputs\.blocked == 'false'/.test(inviteJob), "invite activation job runs only when the reachability job reports blocked=false (a blocked preview shows the job as Skipped)");
check(!workflow.some(line => /steps\.preview\.outputs\.blocked/.test(line) && /^\s+if:/.test(line)), "no step-level skip: the invite activation job is either fully run or skipped as a whole");
check(workflow.some(line => /^\s+blocked: \$\{\{ steps\.preview\.outputs\.blocked \}\}\s*$/.test(line)) && stepIndex < inviteJobAt, "reachability job exports the blocked output from the wait step");
check(workflow.some(line => /^\s+name: Invite activation under production host and CSP\s*$/.test(line)) && !workflow.slice(0, stepIndex).some(line => /needs: deploy-preview-reachability/.test(line)), "production-simulation job is unchanged and does not depend on the preview");

function runWait(scenario, deployStatus, extraEnv = {}) {
  const output = path.join(tmp, `out-${Math.random().toString(16).slice(2)}`);
  fs.writeFileSync(output, "");
  const result = spawnSync("bash", ["-e", waitScript], {
    encoding: "utf8",
    timeout: 120_000,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      NODE_OPTIONS: `--import=${stubImport}`,
      PREVIEW_URL: "https://deploy-preview-1--goflipforge.netlify.app",
      HEAD_SHA: SHA,
      REPOSITORY: "example/example",
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: `${output}.summary`,
      FF_STUB_SCENARIO: scenario,
      FF_STUB_DEPLOY_STATUS: deployStatus,
      ...extraEnv,
    },
  });
  const summaryFile = `${output}.summary`;
  return { status: result.status, out: `${result.stdout}${result.stderr}`, outputs: fs.readFileSync(output, "utf8"), summary: fs.existsSync(summaryFile) ? fs.readFileSync(summaryFile, "utf8") : "" };
}
if (workflowReadable) {
  const notice = "::notice title=Deploy preview blocked::Deploy preview blocked by Netlify firewall — preview checks skipped; production-simulation job still runs";
  r = runWait("blocked+good", "success");
  check(r.status === 0 && r.out.includes(notice) && /^blocked=true$/m.test(r.outputs), "CI wait: blocked preview + Netlify ready -> exit 0 with the skip notice");
  check(/SKIPPED \(not tested\)/.test(r.summary) && /did not pass/.test(r.summary), "CI wait: blocked preview writes an explicit 'skipped, not tested' job summary");
  r = runWait("reachable+good", "success", { FF_STUB_COMMIT: SHA });
  check(r.status === 0 && !r.out.includes("::notice") && /^blocked=false$/m.test(r.outputs), "CI wait: reachable preview serving the commit -> browser checks run");
  r = runWait("blocked+good", "failure");
  check(r.status === 1 && !r.out.includes("::notice") && !/blocked=true/.test(r.outputs), "CI wait: uniform 404 with a failed Netlify deploy -> fails, not a skip");
  r = runWait("down+good", "success");
  check(r.status === 1 && !r.out.includes("::notice") && !/blocked=true/.test(r.outputs), "CI wait: network failure -> fails, not a skip");
  r = runWait("blocked+good", "pending");
  check(r.status === 1 && !r.out.includes("::notice") && !/blocked=true/.test(r.outputs), "CI wait: uniform 404 while Netlify has not reported the preview ready -> not a skip (fails as before)");
  r = runWait("partial+good", "success");
  check(r.status === 1 && !r.out.includes("::notice") && !/blocked=true/.test(r.outputs), "CI wait: partially reachable preview -> never a skip");
  r = runWait("reachable+good", "success", { FF_STUB_COMMIT: "fedcba9" });
  check(r.status === 1 && !/blocked=true/.test(r.outputs), "CI wait: reachable preview on an older commit -> fails as before");
}

fs.rmSync(tmp, { recursive: true, force: true });
for (const message of failures) console.error(`FAIL | ${message}`);
console.log(`PreviewBlockDetection: ${passes.length}/${passes.length + failures.length} checks passed`);
if (failures.length) process.exitCode = 1;
