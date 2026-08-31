import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const scriptPath = "saas-prototype/customer-lifecycle-validation.js";
const displayPath = "saas-prototype/customer-lifecycle-display.js";
const indexPath = "saas-prototype/index.html";
const source = fs.readFileSync(scriptPath, "utf8");
const displaySource = fs.readFileSync(displayPath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");

const listeners = [];
const windowListeners = [];
const document = {
  addEventListener(type, listener, capture) {
    listeners.push({ type, listener, capture });
  },
  getElementById() { return null; },
  querySelectorAll() { return []; }
};
const window = {
  addEventListener(type, listener) {
    windowListeners.push({ type, listener });
  }
};
vm.runInNewContext(source, { document, window, Object, String, Number, Boolean, console });

assert.ok(window.FlipForgeLifecycleValidation, "validator export should be available");
assert.equal(typeof window.FlipForgeLifecycleValidation.validate, "function");

function control(value = "", checked = false) {
  return {
    value,
    checked,
    setAttribute() {},
    removeAttribute() {},
    focus() {}
  };
}

function form(values = {}) {
  const controls = new Map([
    ["trackingStatus", control(values.trackingStatus || "REVIEW")],
    ["outcomeStatus", control(values.outcomeStatus || "NONE")],
    ["reviewAt", control(values.reviewAt || "")],
    ["alertEnabled", control("", Boolean(values.alertEnabled))],
    ["acquisitionCost", control(values.acquisitionCost ?? "")],
    ["acquiredAt", control(values.acquiredAt || "")],
    ["dispositionProceeds", control(values.dispositionProceeds ?? "")],
    ["disposedAt", control(values.disposedAt || "")]
  ]);
  return { elements: { namedItem: name => controls.get(name) || null } };
}

const validate = window.FlipForgeLifecycleValidation.validate;

let result = validate(form({ trackingStatus: "OWNED", outcomeStatus: "NONE" }));
assert.equal(result.ok, false);
assert.match(result.message, /purchase cost/i);
assert.match(result.message, /purchase date/i);
assert.match(result.message, /records the matching result automatically/i);
assert.doesNotMatch(result.message, /set Outcome/i);
assert.deepEqual(Array.from(result.fields), ["outcomeStatus", "acquisitionCost", "acquiredAt"]);

result = validate(form({
  trackingStatus: "OWNED",
  outcomeStatus: "ACQUIRED",
  acquisitionCost: "1961.00",
  acquiredAt: "2026-08-11"
}));
assert.equal(result.ok, true);

result = validate(form({ trackingStatus: "SOLD", outcomeStatus: "SOLD" }));
assert.equal(result.ok, false);
assert.match(result.message, /purchase cost/i);
assert.match(result.message, /sale proceeds/i);
assert.match(result.message, /records the matching result automatically/i);
assert.doesNotMatch(result.message, /set Outcome/i);
assert.ok(result.fields.includes("dispositionProceeds"));
assert.ok(result.fields.includes("disposedAt"));

result = validate(form({ trackingStatus: "PASSED", outcomeStatus: "NONE" }));
assert.equal(result.ok, false);
assert.match(result.message, /choose Passed again/i);
assert.doesNotMatch(result.message, /set Outcome/i);
assert.deepEqual(Array.from(result.fields), ["trackingStatus"]);

result = validate(form({ trackingStatus: "REVIEW", alertEnabled: true }));
assert.equal(result.ok, false);
assert.match(result.message, /choose a review date/i);
assert.match(result.message, /Remind me in FlipForge/i);

result = validate(form({
  trackingStatus: "REVIEW",
  outcomeStatus: "NONE",
  reviewAt: "2026-08-30T09:00",
  alertEnabled: true
}));
assert.equal(result.ok, true);

assert.ok(
  listeners.some(listener => listener.type === "submit" && listener.capture === true),
  "submit guard must run in capture phase before the lifecycle save handler"
);
assert.ok(
  windowListeners.some(listener => listener.type === "pageshow"),
  "lifecycle validation should initialize again on pageshow"
);
assert.match(source, /event\.preventDefault\(\)/);
assert.match(source, /event\.stopImmediatePropagation\(\)/);
assert.match(source, /Nothing was saved/);
assert.match(source, /aria-invalid/);
assert.doesNotMatch(source, /set Outcome to ACQUIRED/i);
assert.doesNotMatch(source, /set Outcome to SOLD/i);
assert.doesNotMatch(source, /set Outcome to PASSED/i);

const displayDocument = {
  querySelector() { return null; },
  getElementById() { return null; },
  addEventListener() {}
};
const displayWindow = {};
vm.runInNewContext(displaySource, {
  document: displayDocument,
  window: displayWindow,
  MutationObserver: undefined,
  String,
  console
});
assert.ok(displayWindow.FlipForgeLifecycleDisplay, "lifecycle display normalizer should be available");
assert.equal(
  displayWindow.FlipForgeLifecycleDisplay.normalizeCardDisplay("2018 Topps Chrome Shohei Ohtani %150 PSA 10"),
  "2018 Topps Chrome Shohei Ohtani #150 PSA 10"
);
assert.equal(
  displayWindow.FlipForgeLifecycleDisplay.normalizeCardDisplay("2018 Topps Chrome Shohei Ohtani #150 PSA 10"),
  "2018 Topps Chrome Shohei Ohtani #150 PSA 10"
);

assert.match(index, /customer-lifecycle-validation\.css/);
assert.match(index, /customer-lifecycle\.js[\s\S]*customer-lifecycle-validation\.js/);
assert.match(index, /customer-lifecycle-validation\.js[\s\S]*customer-lifecycle-display\.js/);

console.log("Lifecycle validation UX PASS");
