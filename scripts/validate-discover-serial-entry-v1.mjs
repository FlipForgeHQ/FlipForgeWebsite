import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const src = read("saas-prototype/discover-guided-entry-v1.js");
const css = read("saas-prototype/discover-guided-entry-v1.css");
const loader = read("saas-prototype/discover-card-entry-emphasis-v1.js");
const shell = read("saas-prototype/customer-only-shell-v1.js");
const beta = read("saas-prototype/beta-session-v1.js");
const guide = read("saas-prototype/guided-mode-v1.js");
const window = { location:{pathname:"/app/beta/",hash:"#/dashboard"},addEventListener(){} };
const document = {querySelector(){return null;},documentElement:{classList:{toggle(){}}}};
const sandbox = { window,document,requestAnimationFrame(cb){cb()},MutationObserver:class{observe(){}},console,Date,RegExp };
vm.runInNewContext(src,sandbox,{filename:"discover-guided-entry-v1.js"});
const {compose,parseNumbering} = window.FlipForgeSerialEntryV1 || {};
assert.equal(typeof compose,"function");
assert.equal(typeof parseNumbering,"function");
const card = "2018 Topps Chrome Shohei Ohtani #150 PSA 9";
assert.equal(compose(card).query,card);
assert.equal(compose(card,{numbered:"unknown"}).needsVerification,false);
assert.equal(compose(card+" /25",{numbered:"unknown"}).needsVerification,true,"Typed serial run must be verified even if menu was not changed");
assert.equal(compose(card,{numbered:"no"}).query,card);
assert.equal(compose(card,{numbered:"yes",denominator:"25",serial:"01"}).query,card+" 01/25", JSON.stringify(compose(card,{numbered:"yes",denominator:"25",serial:"01"})));
assert.equal(compose(card,{numbered:"yes",denominator:"50",serial:""}).query,card+" /50");
assert.equal(compose(card,{numbered:"yes",denominator:"1",serial:"1"}).query,card+" 1/1");
assert.equal(compose(card+" /25",{numbered:"yes",denominator:"25",serial:""}).query,card+" /25");
assert.equal(compose(card+" /25",{numbered:"yes",denominator:"25",serial:"01"}).query,card+" 01/25");
assert.equal(compose(card+" 1/25",{numbered:"yes",denominator:"25",serial:"1"}).query,card+" 1/25");
assert.equal(compose(card+" numbered to 25",{numbered:"yes",denominator:"25",serial:""}).query,card+" numbered to 25");
assert.match(compose(card+" /50",{numbered:"yes",denominator:"25",serial:""}).error,/conflicts/);
assert.match(compose(card+" 4/25",{numbered:"yes",denominator:"25",serial:"1"}).error,/conflicts/);
assert.match(compose(card+" /25",{numbered:"no"}).error,/contains serial/);
assert.match(compose(card,{numbered:"yes",denominator:"25",serial:"26"}).error,/cannot exceed/);
assert.match(compose(card,{numbered:"yes",denominator:"",serial:""}).error,/print run/);
assert.match(compose(card,{numbered:"yes",denominator:"0",serial:""}).error,/positive whole number/);
assert.match(compose(card,{numbered:"yes",denominator:"25",serial:"0"}).error,/positive whole number/);
assert.match(compose(card,{numbered:"yes",denominator:"25.5",serial:""}).error,/positive whole number/);
assert.match(compose("",{numbered:"yes",denominator:"25"}).error,/enter the card/i);
assert.equal(parseNumbering("2018/19 Upper Deck #100"),null,"Season is not serial number");
assert.equal(parseNumbering(card+" /25").serial,"","PSA 9 before /25 must not be misread as individual serial 9");
assert.equal(parseNumbering(card+" 01/25").serial,"1","Adjacent ordinal identifies individual serial");
assert.equal(parseNumbering("Numbered to 99").denominator,"99");
assert.equal(parseNumbering("1/1").serial,"1");
assert.equal(parseNumbering("1/25").denominator,"25");
assert.equal(parseNumbering("/50").denominator,"50");
assert.ok(src.includes("data-ff-serial-refinement") && src.includes("data-ff-serial-status") &&
  src.includes("data-ff-serial-denominator") && src.includes("data-ff-serial-ordinal"),"Serial controls mount beside search");
assert.ok(src.includes('input.closest("label")?.insertAdjacentElement("afterend",section)'),
  "Search input remains the primary entry surface");
assert.ok(!src.includes("BRANDS =") && !src.includes("Choose your card details"),
  "Eight-field builder has been removed");
assert.ok(src.includes("verify.click()") && src.includes('event.stopImmediatePropagation()'),
  "Numbered search invokes existing identity gate and blocks unsafe submit");
assert.ok(src.includes('input.dispatchEvent(new Event("input",{bubbles:true}))'),
  "New composed query invalidates stale identity selection");
assert.ok(!/\/api\/v1\/evaluations|\/api\/v1\/discover|\/api\/v1\/card-intelligence\/resolve/.test(src),
  "No new data, pricing, evaluation, or resolver authority");
assert.ok(!/localStorage|sessionStorage|indexedDB/.test(src),"No user entry is persisted by helper");
assert.ok(css.includes(".ff-serial-refinement")&&css.includes('a[data-route="discover"]'),
  "Compact styling and Discover prominence");
assert.ok(loader.includes("loadGuidedEntry()")&&loader.includes("discover-guided-entry-v1.js"),
  "Discover integration kept");
assert.ok(guide.includes('phoneViewport() || privateBetaSurface()') &&
  guide.includes('!force && privateBetaSurface() && !state.userOpened'),
  "Private Beta popup remains optional");
assert.ok(shell.includes('["discover", "Discover"]') &&
  shell.includes('href="#/discover">Discover a card') &&
  beta.includes('setText(pageHeading.querySelector("h1"), "Discover a Card")'),
  "Dashboard and Discover naming agree");

// Identity-safety: impossible or contradictory numbering fails closed however it was entered and whichever selector is set.
for (const numbered of ["unknown","yes","no"]) {
  for (const bad of ["26/25","0/25","1/0","/0","01/25 and 02/50","/25 /50","1/25 2/25"]) {
    const sel = numbered === "yes" ? {numbered,denominator:"25",serial:""} : {numbered,denominator:"",serial:""};
    const result = compose(card+" "+bad,sel);
    assert.ok(result.error,"must fail closed ("+numbered+"): "+bad);
    assert.equal(result.query,undefined,"no query is produced for: "+bad);
  }
}
assert.match(compose(card+" 26/25",{numbered:"unknown"}).error,/not possible/);
assert.match(compose(card+" 26/25",{numbered:"yes",denominator:"25",serial:""}).error,/not possible/);
assert.match(compose(card+" 26/25",{numbered:"no"}).error,/not possible/);
assert.match(compose(card+" 26/25",{numbered:"unknown"}).error,/26\/25/);
assert.match(compose(card+" 1/25 2/25",{numbered:"unknown"}).error,/more than one individual serial/);
assert.match(compose(card+" /25 /50",{numbered:"unknown"}).error,/more than one print run/);
// Legitimate searches are preserved.
assert.equal(compose("2018 Topps Chrome Shohei Ohtani #150 PSA 9 /25",{numbered:"unknown"}).query,"2018 Topps Chrome Shohei Ohtani #150 PSA 9 /25");
assert.equal(compose("2018 Topps Chrome Shohei Ohtani #150 PSA 9 /25",{numbered:"unknown"}).needsVerification,true);
assert.equal(compose(card+" 01/25",{numbered:"unknown"}).needsVerification,true);
assert.equal(compose(card+" 1/1",{numbered:"unknown"}).needsVerification,true);
assert.equal(compose(card+" 1/1",{numbered:"yes",denominator:"1",serial:"1"}).query,card+" 1/1");
assert.equal(compose("2018/19 Upper Deck #100",{numbered:"unknown"}).needsVerification,false);
assert.equal(compose("2018/19 Upper Deck #100",{numbered:"no"}).query,"2018/19 Upper Deck #100");
assert.equal(compose("2018/19 Upper Deck #100",{numbered:"yes",denominator:"25",serial:""}).query,"2018/19 Upper Deck #100 /25");
assert.equal(compose("2019/20 Upper Deck #100 PSA 9",{numbered:"unknown"}).needsVerification,false);
assert.equal(compose(card+" 25/25",{numbered:"unknown"}).needsVerification,true);
assert.ok(!compose(card+" 01/25",{numbered:"no"}).query,"No + numbered text is still refused");
assert.ok(src.includes("refuseWithoutSection"),"Invalid numbering is refused even when the refinement box is not mounted");
console.log("PASS: search-first serial-number refinement and governed identity handoff");
