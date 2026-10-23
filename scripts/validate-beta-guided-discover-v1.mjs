import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('saas-prototype/index.html','utf8');
const js=fs.readFileSync('saas-prototype/beta-guided-discover-v1.js','utf8');
const css=fs.readFileSync('saas-prototype/beta-guided-discover-v1.css','utf8');
assert.match(html,/href="beta-guided-discover-v1.css"/);
assert.match(html,/src="beta-guided-discover-v1.js"/);
assert.ok(html.indexOf('src="beta-guided-discover-v1.js"')>html.indexOf('src="phase3-first-decision-activation-v1.js"'));
assert.match(css,/data-ffguided-focus="simple"/);
assert.match(css,/primary-nav a\[data-route="discover"\]/);
for(const banned of ['fetch(', 'localStorage', 'sessionStorage','indexedDB','selectionToken','window.open(', 'confirm(']){
 assert.ok(!js.includes(banned), 'guided entry cannot call providers, persist customer data or claim selection: '+banned);
}
let init=null;
const context={window:{addEventListener(){}},document:{readyState:'loading',addEventListener(name,cb){if(name==='DOMContentLoaded')init=cb;}},location:{pathname:'/app/',hash:'#/discover'},Date,MutationObserver:class{},requestAnimationFrame(){}};
vm.createContext(context);vm.runInContext(js,context);
assert.equal(typeof init,'function');
const compose=context.window.FlipForgeGuidedEntryV1.compose;
assert.equal(typeof compose,'function');
const valid={year:'2018',maker:'Topps',other:'',set:'Chrome',player:'Shohei Ohtani',number:'No. 150',parallel:'',grader:'PSA',grade:'9'};
assert.equal(compose(valid).query,'2018 Topps Chrome Shohei Ohtani #150 PSA 9');
assert.equal(compose({...valid,number:'PC-19',maker:'Other',other:'Upper Deck',grader:'',grade:'',parallel:'Silver'}).query,'2018 Upper Deck Chrome Shohei Ohtani #PC-19 Silver');
assert.equal(compose({...valid,year:'2025-26',maker:'Panini',set:'Prizm',player:'Cooper Flagg',number:'1',grade:'10'}).query,'2025-26 Panini Prizm Cooper Flagg #1 PSA 10');
for(const overrides of [{year:''},{year:'198A'},{year:'2025-27'},{year:'1700'},{maker:''},{set:''},{player:''},{number:'?'},{grader:'PSA',grade:''},{grader:'',grade:'9'}]){
 assert.ok(compose({...valid,...overrides}).error,'invalid composition must fail without guessing: '+JSON.stringify(overrides));
}
assert.ok(!js.includes('type="submit" data-ffguided-build'),'guided builder must not auto-search or evaluate');
console.log('PASS: customer Beta guided form connects to the existing source-truth search, composes exact-card text deterministically, fails closed on omissions, and does not call providers.');
