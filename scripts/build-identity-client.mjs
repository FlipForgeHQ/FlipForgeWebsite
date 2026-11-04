import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { applyProductionAppBoundary, assertProductionAppBoundary } from "./lib/production-app-boundary.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const identitySource = path.join(root, "scripts", "lib", "flipforge-identity-client.mjs");
const identityOutput = path.join(root, "assets", "js", "flipforge-identity.js");
const productionSignInSource = path.join(root, "scripts", "lib", "flipforge-production-signin.mjs");
const productionSignInOutput = path.join(root, "assets", "js", "flipforge-production-signin.js");
const productionAuthProbeSource = path.join(root, "scripts", "lib", "flipforge-production-auth-probe.mjs");
const productionAuthProbeOutput = path.join(root, "assets", "js", "flipforge-production-auth-probe.js");
const probeSource = path.join(root, "scripts", "lib", "flipforge-staging-auth-probe.mjs");
const probeOutput = path.join(root, "assets", "js", "flipforge-staging-auth-probe.js");
const scriptTag = '<script src="/assets/js/flipforge-identity.js"></script>';
const productionSignInScriptTag = '<script src="/assets/js/flipforge-production-signin.js"></script>';
const productionEntitlementsScriptTag = '<script src="production-customer-entitlements.js"></script>';
const commercialDashboardStylesheetTag = '<link rel="stylesheet" href="commercial-dashboard-v2.css">';
const commercialDashboardScriptTag = '<script src="commercial-dashboard-v2.js"></script>';
const dashboardV3StylesheetTag = '<link rel="stylesheet" href="decision-dashboard-v3.css">';
const dashboardV3ScriptTag = '<script src="decision-dashboard-v3.js"></script>';
const commercialAppPolishStylesheetTag = '<link rel="stylesheet" href="commercial-app-polish-v2.css">';
const readabilityStylesheetTag = '<link rel="stylesheet" href="customer-readability.css">';

fs.mkdirSync(path.dirname(identityOutput), { recursive: true });

async function bundle(source, output) {
  await build({
    entryPoints: [source],
    outfile: output,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    sourcemap: false,
    legalComments: "none"
  });
}

await bundle(identitySource, identityOutput);
await bundle(productionSignInSource, productionSignInOutput);
await bundle(productionAuthProbeSource, productionAuthProbeOutput);
await bundle(probeSource, probeOutput);

function injectBefore(htmlPath, marker) {
  if (!fs.existsSync(htmlPath)) throw new Error(`Identity target missing: ${path.relative(root, htmlPath)}`);
  const original = fs.readFileSync(htmlPath, "utf8");
  if (original.includes('/assets/js/flipforge-identity.js')) return;
  if (!original.includes(marker)) throw new Error(`Identity insertion marker missing in ${path.relative(root, htmlPath)}`);
  const updated = original.replace(marker, `${scriptTag}\n  ${marker}`);
  fs.writeFileSync(htmlPath, updated, "utf8");
}

function injectProductionSignInBefore(htmlPath, marker) {
  if (!fs.existsSync(htmlPath)) throw new Error(`Production Identity target missing: ${path.relative(root, htmlPath)}`);
  const original = fs.readFileSync(htmlPath, "utf8");
  if (original.includes('/assets/js/flipforge-production-signin.js')) return;
  if (!original.includes(marker)) throw new Error(`Production Identity insertion marker missing in ${path.relative(root, htmlPath)}`);
  const updated = original.replace(marker, `${productionSignInScriptTag}\n  ${marker}`);
  fs.writeFileSync(htmlPath, updated, "utf8");
}

function injectProductionEntitlementsBefore(htmlPath, marker) {
  if (!fs.existsSync(htmlPath)) throw new Error(`Production entitlement target missing: ${path.relative(root, htmlPath)}`);
  const original = fs.readFileSync(htmlPath, "utf8");
  if (original.includes('production-customer-entitlements.js')) return;
  if (!original.includes(marker)) throw new Error(`Production entitlement insertion marker missing in ${path.relative(root, htmlPath)}`);
  const updated = original.replace(marker, `${productionEntitlementsScriptTag}\n  ${marker}`);
  fs.writeFileSync(htmlPath, updated, "utf8");
}

function injectStylesheetBeforeReadability(html, stylesheetTag, label, htmlPath) {
  if (html.includes(stylesheetTag)) return html;
  if (!html.includes(readabilityStylesheetTag)) {
    throw new Error(`${label} readability marker missing in ${path.relative(root, htmlPath)}`);
  }
  return html.replace(readabilityStylesheetTag, `${stylesheetTag}\n  ${readabilityStylesheetTag}`);
}

function injectCommercialDashboard(htmlPath) {
  if (!fs.existsSync(htmlPath)) throw new Error(`Commercial dashboard target missing: ${path.relative(root, htmlPath)}`);
  let html = fs.readFileSync(htmlPath, "utf8");
  html = injectStylesheetBeforeReadability(html, commercialDashboardStylesheetTag, "Commercial dashboard", htmlPath);
  if (!html.includes('commercial-dashboard-v2.js')) {
    if (!html.includes("</body>")) throw new Error(`Commercial dashboard body marker missing in ${path.relative(root, htmlPath)}`);
    html = html.replace("</body>", `  ${commercialDashboardScriptTag}\n</body>`);
  }
  fs.writeFileSync(htmlPath, html, "utf8");
}

// Dashboard V3 (Slice 2) renders only behind its flag. Its script must evaluate before
// commercial-dashboard-v2.js so it can claim the Dashboard route; V2 stays the default.
function injectDashboardV3(htmlPath) {
  if (!fs.existsSync(htmlPath)) throw new Error(`Dashboard V3 target missing: ${path.relative(root, htmlPath)}`);
  let html = fs.readFileSync(htmlPath, "utf8");
  html = injectStylesheetBeforeReadability(html, dashboardV3StylesheetTag, "Dashboard V3", htmlPath);
  if (!html.includes('decision-dashboard-v3.js')) {
    if (html.includes(commercialDashboardScriptTag)) {
      html = html.replace(commercialDashboardScriptTag, `${dashboardV3ScriptTag}\n  ${commercialDashboardScriptTag}`);
    } else {
      if (!html.includes("</body>")) throw new Error(`Dashboard V3 body marker missing in ${path.relative(root, htmlPath)}`);
      html = html.replace("</body>", `  ${dashboardV3ScriptTag}\n</body>`);
    }
  }
  fs.writeFileSync(htmlPath, html, "utf8");
}

// The commercial app polish stylesheet only: the Discover source-listing link it used to add with a script is rendered
// by the Discover owner (customer-discovery.js) since Nov 3 2026.
function injectCommercialAppPolish(htmlPath) {
  if (!fs.existsSync(htmlPath)) throw new Error(`Commercial app polish target missing: ${path.relative(root, htmlPath)}`);
  let html = fs.readFileSync(htmlPath, "utf8");
  html = injectStylesheetBeforeReadability(html, commercialAppPolishStylesheetTag, "Commercial app polish", htmlPath);
  fs.writeFileSync(htmlPath, html, "utf8");
}

function enforceProductionAppBoundary(htmlPath) {
  if (!fs.existsSync(htmlPath)) throw new Error(`Production app boundary target missing: ${path.relative(root, htmlPath)}`);
  const current = fs.readFileSync(htmlPath, "utf8");
  const productionProbe = applyProductionAppBoundary(current, "production");
  assertProductionAppBoundary(current, productionProbe);

  const context = String(process.env.CONTEXT || "").toLowerCase();
  if (context !== "production") return;

  fs.writeFileSync(htmlPath, productionProbe, "utf8");
}

injectBefore(path.join(root, "index.html"), "</body>");

const appIndex = path.join(root, "saas-prototype", "index.html");
injectBefore(appIndex, '<script src="staging-browser.js"></script>');
injectProductionSignInBefore(appIndex, '<script src="staging-browser.js"></script>');
injectProductionEntitlementsBefore(appIndex, '<script src="customer-billing-portal.js"></script>');

injectDashboardV3(appIndex);
injectCommercialDashboard(appIndex);
injectCommercialAppPolish(appIndex);
// The Private Beta navigation is final in saas-prototype/index.html at every width: no mobile navigation script is added.
// The 14px customer typography floor is CSS (saas-prototype/customer-typography.css, linked by both app pages);
// no typography script is injected.
enforceProductionAppBoundary(appIndex);

const identityBytes = fs.statSync(identityOutput).size;
const productionSignInBytes = fs.statSync(productionSignInOutput).size;
const productionAuthProbeBytes = fs.statSync(productionAuthProbeOutput).size;
const probeBytes = fs.statSync(probeOutput).size;
console.log(`Built FlipForge Netlify Identity client (${identityBytes} bytes).`);
console.log(`Built FlipForge production Identity sign-in (${productionSignInBytes} bytes).`);
console.log(`Built FlipForge isolated production auth probe (${productionAuthProbeBytes} bytes).`);
console.log(`Built FlipForge isolated staging auth probe (${probeBytes} bytes).`);
console.log("Injected FlipForge Dashboard V3 (flagged) assets before commercial dashboard v2.");
console.log("Injected FlipForge commercial dashboard v2 assets before customer readability.");
console.log("Injected FlipForge commercial app polish v2 assets before customer readability.");
console.log(`Applied FlipForge production/preview app boundary for CONTEXT=${process.env.CONTEXT || "local"}.`);
