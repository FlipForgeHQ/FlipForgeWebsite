const SAFE_CONTEXTS = new Set(["production", "deploy-preview", "branch-deploy", "dev", "local", "unknown"]);
const SHA = /^[0-9a-f]{7,64}$/i;
const SAFE_TEXT = /^[A-Za-z0-9._/-]{0,200}$/;

function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return SAFE_TEXT.test(text) ? text : fallback;
}

export function createDeployManifest(env = {}) {
  const rawContext = String(env.CONTEXT || "local").trim().toLowerCase();
  const context = SAFE_CONTEXTS.has(rawContext) ? rawContext : "unknown";
  const rawCommit = String(env.COMMIT_REF || "").trim();
  const commitRef = SHA.test(rawCommit) ? rawCommit.toLowerCase() : "local";
  const branch = safeText(env.BRANCH, context === "production" ? "main" : "");

  return Object.freeze({
    schemaVersion: "1.0",
    product: "FlipForge",
    repository: "FlipForgeHQ/FlipForgeWebsite",
    context,
    branch,
    commitRef,
    production: context === "production",
    appBoundary: context === "production" ? "PRODUCTION_SERVER_OWNED_FAIL_CLOSED" : "NON_PRODUCTION_REVIEW",
    productionDiagnosticsSeparated: context === "production",
    recommendationAuthority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence",
    browserRecommendationAuthority: false,
    transactionAuthority: false
  });
}

export function validateDeployManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Deploy manifest must be an object.");
  const expectedKeys = [
    "schemaVersion",
    "product",
    "repository",
    "context",
    "branch",
    "commitRef",
    "production",
    "appBoundary",
    "productionDiagnosticsSeparated",
    "recommendationAuthority",
    "gradingAuthority",
    "browserRecommendationAuthority",
    "transactionAuthority"
  ].sort();
  const actualKeys = Object.keys(manifest).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) throw new Error("Deploy manifest field allowlist changed.");
  if (manifest.schemaVersion !== "1.0") throw new Error("Unexpected deploy manifest schema version.");
  if (manifest.product !== "FlipForge" || manifest.repository !== "FlipForgeHQ/FlipForgeWebsite") throw new Error("Unexpected deploy manifest identity.");
  if (!SAFE_CONTEXTS.has(manifest.context)) throw new Error("Invalid deploy context.");
  if (!(manifest.commitRef === "local" || SHA.test(manifest.commitRef))) throw new Error("Invalid deploy commit reference.");
  if (!SAFE_TEXT.test(String(manifest.branch || ""))) throw new Error("Invalid deploy branch.");
  if (manifest.recommendationAuthority !== "Smart Opportunity") throw new Error("Recommendation authority drifted.");
  if (manifest.gradingAuthority !== "Existing PSA intelligence") throw new Error("Grading authority drifted.");
  if (manifest.browserRecommendationAuthority !== false || manifest.transactionAuthority !== false) throw new Error("Deploy manifest authority boundary drifted.");
  if (manifest.production) {
    if (manifest.context !== "production") throw new Error("Production flag/context mismatch.");
    if (manifest.appBoundary !== "PRODUCTION_SERVER_OWNED_FAIL_CLOSED") throw new Error("Production app boundary marker missing.");
    if (manifest.productionDiagnosticsSeparated !== true) throw new Error("Production diagnostics separation marker missing.");
    if (manifest.commitRef === "local") throw new Error("Production deploy must expose a real commit reference.");
  }
  return true;
}
