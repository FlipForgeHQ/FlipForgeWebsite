import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  inspectStagingEnvironment,
  redactedReadinessReport,
  validateSignedMembership
} from "./lib/saas-staging-readiness.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const argumentsList = process.argv.slice(2);

function optionValue(name) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : null;
}

function usage() {
  console.log(`Usage:
  node scripts/check-saas-staging-readiness.mjs [--membership <json-file>] [--require-complete] [--json]

Behavior:
  - Never prints FLIPFORGE_API_SERVICE_TOKEN or any raw environment value.
  - Validates proposed signed app_metadata membership JSON when supplied.
  - Exits nonzero for unsafe configuration or invalid membership.
  - --require-complete also requires a non-production staging context, upstream pair, and disabled bridge.`);
}

if (argumentsList.includes("--help") || argumentsList.includes("-h")) {
  usage();
  process.exit(0);
}

const membershipPath = optionValue("--membership");
const requireComplete = argumentsList.includes("--require-complete");
const jsonOutput = argumentsList.includes("--json");
let membershipResult = null;

if (membershipPath) {
  const resolved = path.resolve(repositoryRoot, membershipPath);
  try {
    const document = JSON.parse(fs.readFileSync(resolved, "utf8"));
    membershipResult = validateSignedMembership(document);
  } catch (error) {
    membershipResult = {
      ok: false,
      code: "MEMBERSHIP_FILE_INVALID",
      message: error instanceof Error ? error.message : "The membership file could not be read."
    };
  }
}

const environment = inspectStagingEnvironment(process.env);
const report = {
  environment: redactedReadinessReport(process.env),
  ...(membershipResult ? { membership: membershipResult } : {})
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("FlipForge SaaS Staging Readiness");
  console.log(`Environment safe: ${environment.safe ? "YES" : "NO"}`);
  console.log(`Ready to activate staging: ${environment.readyToActivateStaging ? "YES" : "NO"}`);
  console.log(`Staging currently active: ${environment.stagingActive ? "YES" : "NO"}`);
  console.log(`Production disabled: ${environment.productionDisabled ? "YES" : "NO"}`);
  console.log(`Context: ${environment.summary.context}`);
  console.log(`Bridge enabled: ${environment.summary.bridgeEnabled ? "YES" : "NO"}`);
  console.log(`Upstream URL configured: ${environment.summary.upstreamBaseUrlConfigured ? "YES" : "NO"}`);
  console.log(`Service token configured: ${environment.summary.serviceTokenConfigured ? "YES" : "NO"}`);
  console.log(`Allowed origin count: ${environment.summary.allowedOriginCount}`);
  console.log(`Preview bypass: ${environment.summary.previewBypass ? "YES" : "NO"}`);

  if (environment.findings.length) {
    console.log("Findings:");
    for (const finding of environment.findings) {
      console.log(`- ${finding.level.toUpperCase()} ${finding.code}: ${finding.message}`);
    }
  }

  if (membershipResult) {
    console.log(`Membership valid: ${membershipResult.ok ? "YES" : "NO"}`);
    console.log(`Membership result: ${membershipResult.code}`);
    if (!membershipResult.ok) console.log(`Membership guidance: ${membershipResult.message}`);
  }
}

const unsafe = !environment.safe || (membershipResult && !membershipResult.ok);
const incomplete = requireComplete && !environment.readyToActivateStaging;
process.exitCode = unsafe || incomplete ? 1 : 0;
