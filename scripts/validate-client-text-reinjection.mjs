// Regression guard: text read back from the rendered page must be escaped before it is put into new markup.
//
// Some app enhancements read values from the DOM with textContent (which decodes the escaping the original
// renderer applied to server data) and then build new markup from them. Without re-escaping, a server value such
// as an evaluation reason or a source label would run as HTML. This validator checks every interpolation in those
// markup templates goes through escapeHtml(), and that escapeHtml() itself escapes all five HTML-significant characters.
import fs from "node:fs";
import vm from "node:vm";

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

function interpolations(template) {
  const found = [];
  for (let i = 0; i < template.length; i += 1) {
    if (template[i] !== "$" || template[i + 1] !== "{") continue;
    let depth = 1;
    let j = i + 2;
    while (j < template.length && depth > 0) {
      if (template[j] === "{") depth += 1;
      else if (template[j] === "}") depth -= 1;
      j += 1;
    }
    found.push(template.slice(i + 2, j - 1).trim());
    i = j - 1;
  }
  return found;
}

function block(source, start, end, label) {
  const from = source.indexOf(start);
  const to = from >= 0 ? source.indexOf(end, from) : -1;
  check(from >= 0 && to > from, `${label}: markup block not found`);
  return from >= 0 && to > from ? source.slice(from, to) : "";
}

function escapeHelperWorks(source, label) {
  const match = source.match(/function escapeHtml\(value\) \{[\s\S]*?\n  \}/);
  check(Boolean(match), `${label}: escapeHtml helper missing`);
  if (!match) return;
  const escapeHtml = vm.runInNewContext(`(${match[0]})`);
  check(escapeHtml(`<img src=x onerror="a('b')">&`) === "&lt;img src=x onerror=&quot;a(&#039;b&#039;)&quot;&gt;&amp;",
    `${label}: escapeHtml must escape < > " ' &`);
}

const targets = [
  {
    file: "saas-prototype/customer-first-value-v1.js",
    blocks: [["const missingMarkup =", "summary.innerHTML", "evaluate summary missing-requirement markup"],
      ["summary.innerHTML =", "const body = panel.querySelector", "evaluate summary markup"]],
    allowed: new Set(["missingMarkup"])
  },
  {
    file: "saas-prototype/commercial-app-polish-v2.js",
    blocks: [["strip.innerHTML =", "actions.before(strip)", "discovery source strip markup"]],
    allowed: new Set()
  }
];

let checked = 0;
for (const target of targets) {
  const source = fs.readFileSync(target.file, "utf8");
  escapeHelperWorks(source, target.file);
  for (const [start, end, label] of target.blocks) {
    for (const expression of interpolations(block(source, start, end, `${target.file} ${label}`))) {
      checked += 1;
      check(expression.startsWith("escapeHtml(") || target.allowed.has(expression),
        `${target.file} ${label}: \${${expression}} is not escaped`);
    }
  }
}
check(checked >= 10, `expected at least 10 checked interpolations, found ${checked}`);

console.log("ClientTextReinjectionValidation");
console.log(`INTERPOLATIONS_CHECKED: ${checked}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure}`);
if (failures.length) process.exitCode = 1;
