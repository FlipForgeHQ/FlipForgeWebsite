import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const index = read("saas-prototype/index.html");
const loader = read("saas-prototype/prototype-visual-loader.js");
const decision = read("saas-prototype/decision-intelligence-v1.js");
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

const failures = results.filter(result => !result.passed);
console.log("ProductionPrototypeIsolationValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
