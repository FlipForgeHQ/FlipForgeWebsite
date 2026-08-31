import { validateDeployManifest } from "./lib/deploy-manifest.mjs";

const DEFAULT_URL = "https://goflipforge.com/deploy-meta.json";
const SHA = /^[0-9a-f]{7,64}$/i;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expectedCommit() {
  const value = String(process.env.EXPECTED_COMMIT_REF || process.env.GITHUB_SHA || process.argv[2] || "")
    .trim()
    .toLowerCase();
  if (!SHA.test(value)) {
    throw new Error("EXPECTED_COMMIT_REF (or GITHUB_SHA / argv[2]) must be a real Git commit SHA.");
  }
  return value;
}

function manifestUrl(expected) {
  const configured = String(process.env.FLIPFORGE_PRODUCTION_MANIFEST_URL || DEFAULT_URL).trim();
  const url = new URL(configured);
  // Avoid stale CDN/browser cache without changing the deployed resource identity.
  url.searchParams.set("parity", expected.slice(0, 12));
  return url;
}

async function fetchManifest(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "cache-control": "no-cache"
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new Error(`Production deploy manifest returned HTTP ${response.status}.`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.includes("json")) {
    throw new Error(`Production deploy manifest returned unexpected content type: ${contentType}.`);
  }

  return response.json();
}

function assertProductionParity(manifest, expected) {
  validateDeployManifest(manifest);

  if (manifest.context !== "production" || manifest.production !== true) {
    throw new Error("Live manifest is not a production deployment.");
  }
  if (manifest.branch !== "main") {
    throw new Error(`Live production branch is ${manifest.branch || "<empty>"}; expected main.`);
  }
  if (String(manifest.commitRef).toLowerCase() !== expected) {
    const error = new Error(`Live production is ${manifest.commitRef}; expected ${expected}.`);
    error.code = "STALE_COMMIT";
    throw error;
  }
  if (manifest.appBoundary !== "PRODUCTION_SERVER_OWNED_FAIL_CLOSED") {
    throw new Error("Production app boundary marker drifted.");
  }
  if (manifest.productionDiagnosticsSeparated !== true) {
    throw new Error("Production diagnostics are not marked separated.");
  }
  if (manifest.recommendationAuthority !== "Smart Opportunity") {
    throw new Error("Recommendation authority drifted.");
  }
  if (manifest.gradingAuthority !== "Existing PSA intelligence") {
    throw new Error("Grading authority drifted.");
  }
  if (manifest.browserRecommendationAuthority !== false || manifest.transactionAuthority !== false) {
    throw new Error("Production authority boundary drifted.");
  }

  return true;
}

const expected = expectedCommit();
const url = manifestUrl(expected);
const attempts = positiveInteger(process.env.LIVE_PARITY_MAX_ATTEMPTS, 1);
const retryMs = positiveInteger(process.env.LIVE_PARITY_RETRY_MS, 20_000);

let lastError = null;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const manifest = await fetchManifest(url);
    assertProductionParity(manifest, expected);
    console.log(JSON.stringify({
      status: "PASS",
      checkedUrl: DEFAULT_URL,
      context: manifest.context,
      branch: manifest.branch,
      commitRef: manifest.commitRef,
      appBoundary: manifest.appBoundary,
      recommendationAuthority: manifest.recommendationAuthority,
      gradingAuthority: manifest.gradingAuthority,
      browserRecommendationAuthority: manifest.browserRecommendationAuthority,
      transactionAuthority: manifest.transactionAuthority
    }, null, 2));
    process.exit(0);
  } catch (error) {
    lastError = error;
    const message = error instanceof Error ? error.message : String(error);
    if (attempt < attempts) {
      console.log(`Production parity attempt ${attempt}/${attempts} not ready: ${message}`);
      await sleep(retryMs);
      continue;
    }
  }
}

throw new Error(`Live production parity verification failed after ${attempts} attempt(s): ${lastError?.message || "unknown error"}`);
