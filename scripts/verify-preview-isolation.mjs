// Verifies that a deploy preview cannot reach production administration or production data.
//
//   node scripts/verify-preview-isolation.mjs --local [--root <checkout>]
//       Runs the function modules of <checkout> (default: this repository) with preview, branch-deploy and production
//       requests. No network. Used by the build so pull requests prove the logic.
//   PREVIEW_URL=https://deploy-preview-NNN--goflipforge.netlify.app [PRODUCTION_URL=https://goflipforge.com] \
//   node scripts/verify-preview-isolation.mjs --remote
//       Sends credential-free requests to a deployed preview and to production. When the Netlify firewall blocks the
//       preview completely, the preview checks are reported as SKIP (not tested, not passed); production checks always
//       run and are always required. A block page counts only when PREVIEW_DEPLOY_STATUS (set by the manual workflow
//       from Netlify's commit status) is "success", so a typo'd, unbuilt or failed preview deploy (also a uniform
//       Netlify 404) fails.
//
// Output is limited to check names, HTTP status codes, the non-secret upstream-environment marker and PASS/FAIL/SKIP.
// No response bodies, headers or cookies are printed. Exit code 1 when any check fails.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SENTINEL_PATHS, probePreview } from "./lib/preview-block-detection.mjs";

// Privileged functions and the HTTP methods that can change state. Paths are checked against each function's
// config.path in local mode.
export const PRIVILEGED = [
  { file: "beta-operator.mjs", path: "/api/beta/operator", methods: ["GET", "POST"] },
  { file: "beta-founder-select.mjs", path: "/api/beta/founder-select", methods: ["GET", "POST"] },
  { file: "beta-terms-acceptance.mjs", path: "/api/beta/terms-acceptance", methods: ["GET", "POST"] },
  { file: "updates-subscribers.mjs", path: "/api/updates/subscribers", methods: ["GET", "DELETE"] },
];
const GATEWAY_DATA_PATHS = ["/api/v1/entitlements", "/api/v1/portfolio"];
const INTERNAL_PATHS = [
  "/docs/BETA_CDI_LEARNING_SCORECARD_V1.md",
  "/netlify/modern-functions/flipforge-api.mjs",
  "/scripts/validate-netlify-rule-budget.mjs",
  "/netlify.toml",
  "/package.json",
  "/_redirects",
];
const PREVIEW_SAFE_MARKERS = new Set(["staging", "none"]);
const MARKER = /^(staging|production|none|unlabeled)$/;

const results = [];
const skipped = [];
function record(id, label, pass, detail = "") {
  results.push({ id, label, pass });
  console.log(`${pass ? "PASS" : "FAIL"} | ${id} | ${label}${detail ? ` | ${detail}` : ""}`);
}
// A check that could not be run. It is neither a pass nor a failure and is never counted as passed.
function skip(id, label, detail = "") {
  skipped.push({ id, label });
  console.log(`SKIP | ${id} | ${label}${detail ? ` | ${detail}` : ""}`);
}
function marker(value) {
  const text = String(value || "");
  return MARKER.test(text) ? text : text ? "unrecognised" : "absent";
}

function finish(mode) {
  const failed = results.filter(item => !item.pass).length;
  const skipNote = skipped.length ? `, ${skipped.length} skipped (not tested)` : "";
  console.log(`\nPreviewIsolationVerification (${mode}): ${results.length - failed}/${results.length} passed${skipNote}`);
  if (skipped.length) console.log("Preview checks were SKIPPED: the preview is blocked by the Netlify firewall and was not tested.");
  if (failed) process.exitCode = 1;
}

// ---------------------------------------------------------------- remote
function validatedUrl(raw, kind) {
  let url;
  try { url = new URL(String(raw || "").trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || !/^\/?$/.test(url.pathname)) return null;
  const host = url.hostname.toLowerCase();
  if (kind === "preview" && !/^[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(host)) return null;
  if (kind === "production" && !["goflipforge.com", "www.goflipforge.com"].includes(host)) return null;
  return url.origin;
}

async function probe(origin, pathname, method = "GET") {
  try {
    const response = await fetch(`${origin}${pathname}`, {
      method,
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      headers: { "User-Agent": "flipforge-preview-isolation-check", Accept: "application/json", ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
      body: method === "POST" ? "{}" : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    let healthMarker = "";
    if (pathname === "/api/v1/health" && response.ok) {
      const payload = await response.json().catch(() => null);
      healthMarker = payload?.data?.upstreamEnvironment || "";
      const requiresAuth = payload?.data?.authenticationRequired === true;
      return { status: response.status, header: response.headers.get("x-flipforge-upstream-env"), healthMarker, requiresAuth };
    }
    await response.arrayBuffer().catch(() => null);
    return { status: response.status, header: response.headers.get("x-flipforge-upstream-env") };
  } catch (error) {
    return { status: 0, error: error?.name === "TimeoutError" ? "timeout" : "network" };
  }
}

async function remote() {
  const preview = validatedUrl(process.env.PREVIEW_URL, "preview");
  const production = validatedUrl(process.env.PRODUCTION_URL || "https://goflipforge.com", "production");
  if (!preview || !production) {
    console.log("FAIL | input | PREVIEW_URL must be https://<name>--<site>.netlify.app and PRODUCTION_URL https://goflipforge.com or https://www.goflipforge.com");
    process.exitCode = 1;
    return;
  }

  // A preview that Netlify's firewall blocks answers every path with the same non-FlipForge block page. Its checks
  // cannot run, so they are reported as SKIP, never PASS. Any FlipForge content on any sentinel path means the
  // preview is reachable, and then every strict preview check below runs.
  const block = await probePreview(preview);
  const previewBlocked = block.state === "blocked";
  console.log(`INFO | preview | state=${block.state} | ${block.reason}`);

  const deployStatus = String(process.env.PREVIEW_DEPLOY_STATUS || "").trim();
  if (previewBlocked) {
    const detail = `status=${block.status} on ${SENTINEL_PATHS.length} sentinel paths`;
    // Required: an unbuilt, failed or mistyped preview also answers with a uniform Netlify 404.
    record("0", "blocked preview is a successful deploy (Netlify reports the deploy preview ready)", deployStatus === "success", `deploy-status=${/^[a-z]{1,20}$/.test(deployStatus) ? deployStatus : deployStatus ? "unrecognised" : "not supplied"}`);
    skip("1", "preview privileged endpoints not tested: preview blocked by the Netlify firewall", detail);
    skip("2", "preview gateway not tested: preview blocked by the Netlify firewall", detail);
  } else {
    // 1. Privileged endpoints are absent on the preview.
    for (const fn of PRIVILEGED) {
      for (const method of fn.methods) {
        const r = await probe(preview, fn.path, method);
        record("1", `preview ${method} ${fn.path} is not served`, r.status === 404, `status=${r.status || r.error}`);
      }
    }

    // 2. The preview gateway has no unauthenticated bypass and is not wired to production.
    const health = await probe(preview, "/api/v1/health");
    const previewMarker = marker(health.header || health.healthMarker);
    record("2a", "preview gateway health reachable", health.status === 200, `status=${health.status || health.error}`);
    record("2b", "preview gateway requires authentication (no preview bypass)", health.status === 200 && health.requiresAuth === true, `status=${health.status || health.error}`);
    record("2c", "preview gateway upstream is staging or none (never production)", PREVIEW_SAFE_MARKERS.has(previewMarker), `marker=${previewMarker}`);
    for (const pathname of GATEWAY_DATA_PATHS) {
      const r = await probe(preview, pathname);
      record("2d", `preview unauthenticated GET ${pathname} is rejected`, r.status === 401, `status=${r.status || r.error} marker=${marker(r.header)}`);
    }
  }

  // 3. Production administration still requires authentication.
  for (const fn of PRIVILEGED) {
    for (const method of fn.methods) {
      const r = await probe(production, fn.path, method);
      record("3", `production ${method} ${fn.path} requires authentication`, r.status === 401 || r.status === 403, `status=${r.status || r.error}`);
    }
  }
  const prodHealth = await probe(production, "/api/v1/health");
  const prodMarker = marker(prodHealth.header || prodHealth.healthMarker);
  record("3b", "production gateway requires authentication", prodHealth.status === 200 && prodHealth.requiresAuth === true, `status=${prodHealth.status || prodHealth.error}`);
  record("3c", "production gateway is not labelled staging", prodMarker !== "staging", `marker=${prodMarker}`);
  for (const pathname of GATEWAY_DATA_PATHS) {
    const r = await probe(production, pathname);
    record("3d", `production unauthenticated GET ${pathname} is rejected`, r.status === 401, `status=${r.status || r.error}`);
  }

  // 4. Internal files are not served on either deploy (a blocked preview cannot be tested; production always is).
  if (previewBlocked) skip("4", "preview internal paths not tested: preview blocked by the Netlify firewall", `status=${block.status}`);
  for (const [name, origin] of previewBlocked ? [["production", production]] : [["preview", preview], ["production", production]]) {
    for (const pathname of INTERNAL_PATHS) {
      const r = await probe(origin, pathname);
      record("4", `${name} internal path ${pathname} is not served`, r.status === 404, `status=${r.status || r.error}`);
    }
  }
  finish("remote");
}

// ---------------------------------------------------------------- local
function globMatch(pattern, pathname) {
  const regex = new RegExp(`^${pattern.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  return regex.test(pathname);
}

async function local(root) {
  const fnDir = path.join(root, "netlify", "modern-functions");
  const load = async file => import(pathToFileURL(path.join(fnDir, file)).href);
  delete process.env.FLIPFORGE_LOCAL_PRIVILEGED_FUNCTION_OVERRIDE;
  delete process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW;
  const upstreamCalls = [];
  globalThis.fetch = async url => {
    upstreamCalls.push(String(url));
    return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
  };
  globalThis.netlifyIdentityContext = { url: "https://identity.invalid/.netlify/identity" };
  const ctx = value => ({ deploy: { context: value } });
  const request = (host, pathname, method) => new Request(`https://${host}${pathname}`, {
    method, headers: { "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined,
  });
  const status = async (fn, req, context) => {
    try { return (await fn(req, context)).status; } catch (error) { return `threw:${error?.name || "Error"}`; }
  };

  // 1. Privileged endpoints are absent on previews and branch deploys.
  const modules = {};
  for (const fn of PRIVILEGED) {
    modules[fn.file] = await load(fn.file);
    const configured = [].concat(modules[fn.file].config?.path || []);
    record("L1", `${fn.file} serves ${fn.path}`, configured.includes(fn.path), `config.path=${configured.join(",")}`);
    for (const [host, context] of [["deploy-preview-9--goflipforge.netlify.app", "deploy-preview"], ["main--goflipforge.netlify.app", "branch-deploy"]]) {
      for (const method of fn.methods) {
        const s = await status(modules[fn.file].default, request(host, fn.path, method), ctx(context));
        record("L1", `${context} ${method} ${fn.path} is not served`, s === 404, `status=${s}`);
      }
    }
  }

  // 2. Preview gateway: no unauthenticated bypass and a non-production upstream marker.
  const gateway = (await load("flipforge-api.mjs")).default;
  Object.assign(process.env, {
    FLIPFORGE_API_BRIDGE_ENABLED: "true",
    FLIPFORGE_API_BASE_URL: "https://staging-backend.invalid",
    FLIPFORGE_API_SERVICE_TOKEN: "local-verification-token-0000000000",
    FLIPFORGE_API_UPSTREAM_ENVIRONMENT: "staging",
    CONTEXT: "deploy-preview",
  });
  const previewHost = "deploy-preview-9--goflipforge.netlify.app";
  upstreamCalls.length = 0;
  const healthResponse = await gateway(new Request(`https://${previewHost}/api/v1/health`), ctx("deploy-preview"));
  const healthPayload = await healthResponse.json().catch(() => null);
  const localMarker = marker(healthResponse.headers.get("x-flipforge-upstream-env"));
  record("L2", "preview gateway health requires authentication", healthResponse.status === 200 && healthPayload?.data?.authenticationRequired === true, `status=${healthResponse.status}`);
  record("L2", "preview gateway publishes the upstream marker", localMarker === "staging", `marker=${localMarker}`);
  for (const pathname of GATEWAY_DATA_PATHS) {
    const response = await gateway(new Request(`https://${previewHost}${pathname}`), ctx("deploy-preview"));
    record("L2", `preview unauthenticated GET ${pathname} is rejected`, response.status === 401, `status=${response.status}`);
  }
  process.env.FLIPFORGE_API_UPSTREAM_ENVIRONMENT = "production";
  const mismatch = await gateway(new Request(`https://${previewHost}/api/v1/entitlements`), ctx("deploy-preview"));
  record("L2", "a preview labelled production refuses to call the backend", mismatch.status === 503, `status=${mismatch.status}`);
  record("L2", "no upstream call was made by any preview request", upstreamCalls.length === 0, `upstream_calls=${upstreamCalls.length}`);

  // 3. Production administration still requires authentication.
  process.env.CONTEXT = "production";
  for (const fn of PRIVILEGED) {
    for (const method of fn.methods) {
      const s = await status(modules[fn.file].default, request("goflipforge.com", fn.path, method), ctx("production"));
      record("L3", `production ${method} ${fn.path} requires authentication`, s === 401 || s === 403, `status=${s}`);
    }
  }

  // 4. Internal paths are answered 404 by the internal-path guard.
  const guard = await load("internal-path-guard.mjs");
  const patterns = [].concat(guard.config?.path || []);
  for (const pathname of INTERNAL_PATHS) {
    const covered = patterns.some(pattern => globMatch(pattern, pathname));
    const s = covered ? (await guard.default(new Request(`https://${previewHost}${pathname}`))).status : "not-routed";
    record("L4", `internal path ${pathname} is answered 404`, covered && s === 404, `status=${s}`);
  }
  finish("local");
}

const args = process.argv.slice(2);
if (args.includes("--remote")) {
  await remote();
} else if (args.includes("--local")) {
  const rootIndex = args.indexOf("--root");
  await local(path.resolve(rootIndex >= 0 ? args[rootIndex + 1] : "."));
} else {
  console.log("usage: verify-preview-isolation.mjs --local [--root <checkout>] | --remote (PREVIEW_URL, PRODUCTION_URL)");
  process.exitCode = 2;
}
