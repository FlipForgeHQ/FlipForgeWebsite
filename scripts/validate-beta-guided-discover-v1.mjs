import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const src = read("saas-prototype/discover-guided-entry-v1.js");
const css = read("saas-prototype/discover-guided-entry-v1.css");
const entry = read("saas-prototype/discover-card-entry-emphasis-v1.js");
const shell = read("saas-prototype/customer-only-shell-v1.js");
const beta = read("saas-prototype/beta-session-v1.js");
const window = { location:{pathname:"/app/",hash:"#/dashboard"},addEventListener(){} };
const document = {querySelector(){return null;}};
const sandbox = { window,document,requestAnimationFrame(callback){callback();},MutationObserver:class{observe(){}}, console,Date,RegExp };
vm.runInNewContext(src,sandbox,{filename:"discover-guided-entry-v1.js"});
const compose = window.FlipForgeGuidedEntryV1?.compose;
assert.equal(typeof compose,"function","Guided composer available for deterministic tests");
const basic = {
  year:"2018",brand:"Topps",otherBrand:"",product:"Chrome",player:"Shohei Ohtani",
  cardNumber:"150",parallel:"Refractor",condition:"graded",grader:"PSA",grade:"9"
};
assert.equal(compose(basic).query,"2018 Topps Chrome Shohei Ohtani #150 Refractor PSA 9");
assert.equal(compose({...basic,condition:"raw",grade:"",grader:""}).query,"2018 Topps Chrome Shohei Ohtani #150 Refractor");
assert.equal(compose({...basic,cardNumber:""}).query,"2018 Topps Chrome Shohei Ohtani Refractor PSA 9");
assert.equal(compose({...basic,cardNumber:"US1"}).query,"2018 Topps Chrome Shohei Ohtani #US1 Refractor PSA 9");
assert.match(compose({...basic,cardNumber:"150 / 250"}).error,/card number/i);
assert.match(compose({...basic,grader:"PSA",grade:"9.5"}).error,/PSA 9.5/i);
assert.match(compose({...basic,brand:"Other",otherBrand:""}).error,/brand/i);
assert.match(compose({...basic,condition:"graded",grader:"Other"}).error,/Quick Search/i);
assert.match(compose({...basic,product:""}).error,/product\/set/i);
assert.match(compose({...basic,player:""}).error,/player/i);
assert.ok(src.includes("verify.click()")&&src.includes('input.dispatchEvent(new Event("input", {bubbles:true}))'),
  "Identity candidate search reuses existing verification and invalidates stale selections");
assert.ok(src.includes("if (!input || !verify || verify.disabled)"),
  "Unavailable verification remains fail-closed");
assert.ok(!/\/api\/v1\/evaluations|\/api\/v1\/discover|\/api\/v1\/card-intelligence\/resolve/.test(src),
  "Composer does not call listings/evaluation or resolve candidates itself");
assert.ok(!/localStorage|sessionStorage|indexedDB/.test(src),
  "Draft personal entry data is not persisted by the builder");
assert.ok(src.includes('!/^\\/(?:app|owner)\\/customer'),
  "Full customer application is left unchanged");
assert.ok(entry.includes("loadGuidedEntry()")&&entry.includes("discover-guided-entry-v1.js"),
  "Existing discover entry loads builder without removing identity checker");
assert.ok(css.includes(".ff-guided-entry-grid")&&css.includes('a[data-route="discover"]'),
  "Responsive controls and Discover prominence are styled");
assert.ok(src.includes('data-ff-guided-field="year"') === false &&
  src.includes('selectInput("year", yearOptions())') &&
  src.includes('selectInput("brand"') &&
  src.includes('selectInput("grader"') &&
  src.includes('selectInput("grade"'), "Guided menus for year, brand, grader, grade remain native selection boxes");
assert.ok(src.includes('data-ff-guided-visible') && !src.includes('data-ff-guided-details'),
  "Guide controls appear immediately and are not hidden by a collapsed details panel");
assert.ok(src.includes("removeBuilder()") && src.includes('event.target?.matches?.(ROOT + " [data-customer-discovery-form]")'),
  "Form clears guided fields at results handoff");
const guideSrc = read("saas-prototype/guided-mode-v1.js");
assert.ok(guideSrc.includes('phoneViewport() || privateBetaSurface()') &&
  guideSrc.includes('!force && privateBetaSurface() && !state.userOpened'),
  "Default Private Beta help is minimized; the welcome popup is explicit-only");

assert.ok(shell.includes('["discover", "Discover"]') &&
  shell.includes('href="#/discover">Discover a card') &&
  beta.includes('setText(pageHeading.querySelector("h1"), "Discover a Card")'),
  "Beta dashboard, navigation and Discover heading use same plain-language name");
console.log("PASS: beta Discover guided entry, naming and exact-identity safety");
