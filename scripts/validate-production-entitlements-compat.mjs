import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "saas-prototype/production-customer-entitlements.js"), "utf8");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

check("001 compatibility shim never assigns isEligible", !/\.isEligible\s*=/.test(source));
check("002 compatibility shim never replaces entitlement adapter", !/window\.FlipForgeCustomerEntitlements\s*=/.test(source));
check("003 production account bridge remains declared owner", source.includes("customer-account-bridge.js"));
check("004 compatibility shim is redirect-only", source.includes("/production-auth.html?return=") && source.includes("staging-auth.html"));

const frozenAdapter = Object.freeze({
  isEligible() { return true; },
  render() {}
});
let clickHandler = null;
let assignedUrl = null;

const context = {
  window: {
    FlipForgeCustomerEntitlements: frozenAdapter,
    location: {
      hostname: "goflipforge.com",
      pathname: "/app/",
      search: "",
      hash: "#/account",
      assign(value) { assignedUrl = String(value); }
    }
  },
  document: {
    addEventListener(type, handler, capture) {
      if (type === "click" && capture === true) clickHandler = handler;
    }
  },
  console
};

let executionError = null;
try {
  vm.runInNewContext(source, context, { filename: "production-customer-entitlements.js" });
} catch (error) {
  executionError = error;
}

check("005 frozen entitlement adapter causes no execution error", executionError === null);
check("006 frozen entitlement adapter identity is preserved", context.window.FlipForgeCustomerEntitlements === frozenAdapter);
check("007 frozen entitlement adapter remains frozen", Object.isFrozen(context.window.FlipForgeCustomerEntitlements));
check("008 click redirect handler is registered", typeof clickHandler === "function");

if (typeof clickHandler === "function") {
  let prevented = false;
  let stopped = false;
  clickHandler({
    target: {
      closest(selector) {
        return selector === 'a[href^="/staging-auth.html"]' ? { href: "/staging-auth.html" } : null;
      }
    },
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; }
  });
  check("009 production legacy sign-in link redirects to production auth", String(assignedUrl || "").startsWith("/production-auth.html?return="));
  check("010 production legacy redirect prevents old navigation", prevented && stopped);
}

const failures = results.filter(result => !result.passed);
console.log("Production entitlement compatibility validation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (executionError) console.error(executionError.stack || executionError.message || executionError);
if (failures.length) process.exitCode = 1;
