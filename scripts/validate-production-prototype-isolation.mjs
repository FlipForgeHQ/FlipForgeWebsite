import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { applyProductionAppBoundary, assertProductionAppBoundary } from "./lib/production-app-boundary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const index = read("saas-prototype/index.html");
const loader = read("saas-prototype/prototype-visual-loader.js");
const decision = read("saas-prototype/decision-intelligence-v1.js");
const stagingBrowser = read("saas-prototype/staging-browser.js");
const stagingEvaluation = read("saas-prototype/staging-evaluation.js");
const buildIdentity = read("scripts/build-identity-client.mjs");
const productionBuild = String(process.env.CONTEXT || "").toLowerCase() === "production";
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

function executeLoader(hostname) {
  const appended = [];
  const consoleErrors = [];
  const document = {
    head: {
      appendChild(node) {
        appended.push(node);
      }
    },
    createElement(tagName) {
      const listeners = {};
      return {
        tagName,
        src: "",
        async: true,
        dataset: {},
        listeners,
        addEventListener(type, handler) {
          listeners[type] = handler;
        }
      };
    }
  };
  const window = { location: { hostname } };
  const sandbox = {
    window,
    document,
    console: { error: message => consoleErrors.push(String(message)) },
    Object,
    String
  };

  vm.runInNewContext(loader, sandbox, { filename: "prototype-visual-loader.js" });
  return { window, appended, consoleErrors };
}

let syntaxValid = true;
try {
  new Function(loader);
} catch (error) {
  syntaxValid = false;
  console.error(error.message);
}

check("001 prototype visual loader is wired", index.includes('src="prototype-visual-loader.js"'));
check("002 visual intelligence is not a direct script dependency", !index.includes('<script src="visual-intelligence.js"></script>'));
check("003 cockpit expansion is not a direct script dependency", !index.includes('<script src="cockpit-expansion.js"></script>'));
check("004 loader follows base route renderers", index.indexOf('src="prototype-visual-loader.js"') > index.indexOf('src="feature-pages.js"'));
check("005 downstream cockpit observers remain after loader", index.indexOf('src="cockpit-layout-fix.js"') > index.indexOf('src="prototype-visual-loader.js"'));
check("006 loader JavaScript parses", syntaxValid);
check("007 production hostname is explicitly allow-blocked", loader.includes('/^(?:www\\.)?goflipforge\\.com$/i'));
check("008 production runtime is labeled server-owned", loader.includes('PRODUCTION_SERVER_OWNED'));
check("009 non-production runtime remains explicitly prototype", loader.includes('NON_PRODUCTION_PROTOTYPE'));
check("010 loader only names the intended mock visual entry points", loader.includes('"visual-intelligence.js"') && loader.includes('"cockpit-expansion.js"'));
check("011 production branch returns before loading prototype visuals", loader.includes('if (production) return;'));
check("012 server-owned Decision Intelligence retains production host gate", decision.includes('const PRODUCTION_HOST = /^(?:www\\.)?goflipforge\\.com$/i'));
check("013 server-owned Decision Intelligence retains Smart Opportunity contract authority", decision.includes('meta.authority === "Smart Opportunity"'));
check("014 server-owned Decision Intelligence retains PSA authority contract", decision.includes('meta.gradingAuthority === "Existing PSA intelligence"'));
check("015 browser authority remains read-only", !/auto-buy|authorize purchase|execute purchase/i.test(decision));

const production = executeLoader("goflipforge.com");
check("016 production loads zero prototype visual scripts", production.appended.length === 0);
check("017 production runtime reports prototype visuals disabled", production.window.FlipForgePrototypeVisualRuntime?.prototypeVisualsAllowed === false);
check("018 production runtime reports server-owned mode", production.window.FlipForgePrototypeVisualRuntime?.mode === "PRODUCTION_SERVER_OWNED");

const productionWww = executeLoader("www.goflipforge.com");
check("019 www production host also loads zero prototype visual scripts", productionWww.appended.length === 0);

const preview = executeLoader("deploy-preview-173--goflipforge.netlify.app");
check("020 preview initially loads visual intelligence only", preview.appended.length === 1 && preview.appended[0].src === "visual-intelligence.js");
preview.appended[0]?.listeners?.load?.();
check("021 preview loads cockpit expansion second", preview.appended.length === 2 && preview.appended[1].src === "cockpit-expansion.js");
preview.appended[1]?.listeners?.load?.();
check("022 preview runtime records sequential visual modules", JSON.stringify(preview.window.FlipForgePrototypeVisualRuntime?.loaded) === JSON.stringify(["visual-intelligence.js", "cockpit-expansion.js"]));
check("023 preview runtime keeps prototype visuals enabled", preview.window.FlipForgePrototypeVisualRuntime?.prototypeVisualsAllowed === true);

const localhost = executeLoader("localhost");
check("024 localhost keeps prototype visual QA enabled", localhost.appended.length === 1 && localhost.window.FlipForgePrototypeVisualRuntime?.prototypeVisualsAllowed === true);

// Exercise the boundary transform against a stable source fixture. The real production
// build mutates saas-prototype/index.html before validators run, so using the built file
// as both source and output would incorrectly require preview-only staging tokens to
// reappear in production.
const boundarySourceFixture = `<!doctype html>
<html>
<head>
<link rel="stylesheet" href="staging-browser.css">
</head>
<body>
<a href="#/staging" data-route="staging" class="staging-only-nav" hidden>Staging Data</a>
<a href="#/staging-evaluate" data-route="staging-evaluate" class="staging-only-nav" hidden>Staging Evaluate</a>
<script src="production-dashboard-guard.js"></script>
<script src="staging-browser.js"></script>
<script src="staging-evaluation.js"></script>
<script src="customer-opportunities.js"></script>
<script src="customer-opportunities-bridge.js"></script>
<script src="staging-route-hook.js"></script>
</body>
</html>`;

const fixtureProduction = applyProductionAppBoundary(boundarySourceFixture, "production");
let productionBoundaryValid = true;
try {
  assertProductionAppBoundary(boundarySourceFixture, fixtureProduction);
} catch (error) {
  productionBoundaryValid = false;
  console.error(error.message);
}
const fixturePreview = applyProductionAppBoundary(boundarySourceFixture, "deploy-preview");
const fixtureLocal = applyProductionAppBoundary(boundarySourceFixture, "");

check("025 production app boundary contract validates", productionBoundaryValid);
check("026 production transform strips staging read adapter", !fixtureProduction.includes('<script src="staging-browser.js"></script>'));
check("027 production transform strips staging browser stylesheet", !fixtureProduction.includes('href="staging-browser.css"'));
check("028 production transform strips staging diagnostic navigation", !fixtureProduction.includes('data-route="staging"') && !fixtureProduction.includes('data-route="staging-evaluate"'));
check("029 production transform retains shared customer evaluation module", fixtureProduction.includes('<script src="staging-evaluation.js"></script>') && stagingEvaluation.includes("renderCustomer"));
check("030 production transform retains shared customer route hook", fixtureProduction.includes('<script src="staging-route-hook.js"></script>'));
check("031 production transform retains Dashboard fail-closed guard", fixtureProduction.includes('<script src="production-dashboard-guard.js"></script>'));
check("032 production transform retains server-owned opportunity modules", fixtureProduction.includes('<script src="customer-opportunities.js"></script>') && fixtureProduction.includes('<script src="customer-opportunities-bridge.js"></script>'));
check("033 deploy preview keeps staging diagnostics", fixturePreview === boundarySourceFixture && fixturePreview.includes('<script src="staging-browser.js"></script>'));
check("034 local build keeps staging diagnostics", fixtureLocal === boundarySourceFixture);
check("035 production transform is idempotent", applyProductionAppBoundary(fixtureProduction, "production") === fixtureProduction);
check("036 source staging adapter remains preview-host constrained", stagingBrowser.includes('ALLOWED_HOST = /^(?:deploy-preview-') && !stagingBrowser.includes("goflipforge.com"));
check("037 build imports production boundary helper", buildIdentity.includes('from "./lib/production-app-boundary.mjs"'));
check("038 build self-tests production boundary on every build", buildIdentity.includes('const productionProbe = applyProductionAppBoundary(current, "production")') && buildIdentity.includes("assertProductionAppBoundary(current, productionProbe)"));
check("039 build writes stripped app only for production context", buildIdentity.includes('if (context !== "production") return;') && buildIdentity.includes('fs.writeFileSync(htmlPath, productionProbe, "utf8")'));
check("040 production boundary runs after Identity and commercial injections", buildIdentity.indexOf("injectCommercialAppPolish(appIndex)") < buildIdentity.indexOf("enforceProductionAppBoundary(appIndex)"));

const realStagingTokensAbsent = !index.includes('<script src="staging-browser.js"></script>')
  && !index.includes('href="staging-browser.css"')
  && !index.includes('data-route="staging"')
  && !index.includes('data-route="staging-evaluate"');
const realRequiredCustomerRuntimePresent = index.includes('<script src="production-dashboard-guard.js"></script>')
  && index.includes('<script src="staging-evaluation.js"></script>')
  && index.includes('<script src="staging-route-hook.js"></script>')
  && index.includes('<script src="customer-opportunities.js"></script>')
  && index.includes('<script src="customer-opportunities-bridge.js"></script>');
const realPreviewDiagnosticsPresent = index.includes('<script src="staging-browser.js"></script>')
  && index.includes('href="staging-browser.css"')
  && index.includes('data-route="staging"')
  && index.includes('data-route="staging-evaluate"');

check("041 real built app matches current deployment context", productionBuild
  ? realStagingTokensAbsent && realRequiredCustomerRuntimePresent
  : realPreviewDiagnosticsPresent);
check("042 production built app retains customer evaluation/router authority path", !productionBuild || (index.includes('<script src="staging-evaluation.js"></script>') && index.includes('<script src="staging-route-hook.js"></script>')));

const failures = results.filter(result => !result.passed);
console.log("ProductionPrototypeIsolationValidation");
console.log(`CONTEXT: ${process.env.CONTEXT || "local"}`);
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
