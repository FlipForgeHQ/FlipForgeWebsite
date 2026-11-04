import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('saas-prototype/index.html','utf8');
// Since Nov 3 2026 the Discover guided builder is rendered by the Discover owner (customer-discovery.js) and the Dashboard
// "Start here" panel by the Dashboard owner (commercial-dashboard-v2.js); beta-guided-discover-v1.js is retired.
const home=fs.readFileSync('saas-prototype/commercial-dashboard-v2.js','utf8');
assert.ok(!fs.existsSync('saas-prototype/beta-guided-discover-v1.js'),'the retired guided-discover layer must not return');
const discovery=fs.readFileSync('saas-prototype/customer-discovery.js','utf8');
const builder=discovery.slice(discovery.indexOf('function guidedBuilderMarkup()'),discovery.indexOf('function serialEntryAvailable()'));
const helpers=discovery.slice(discovery.indexOf('Private Beta card-entry helpers'),discovery.indexOf('  function validHttpUrl(value) {'));
const css=fs.readFileSync('saas-prototype/beta-guided-discover-v1.css','utf8');
assert.match(html,/href="beta-guided-discover-v1.css"/);
assert.ok(!html.includes('src="beta-guided-discover-v1.js"'));
const panel=home.slice(home.indexOf('function guidedHomePanel()'),home.indexOf('function firstUsePanel()'));
assert.ok(panel.includes('data-ffguided-home') && panel.includes('href="#/discover"') && panel.includes('data-ffguided-more aria-expanded="false"'),'Dashboard owner renders the beta Start here panel with a Discover first action and a collapsed full dashboard');
assert.ok(home.includes('root.dataset.ffguidedFocus = open ? "simple" : "full";') && home.includes('more.setAttribute("aria-expanded", String(!open));'),'Show full dashboard toggles the analytics and its expanded state');
assert.match(css,/data-ffguided-focus="simple"/);
assert.match(css,/primary-nav a\[data-route="discover"\]/);
for(const banned of ['fetch(', 'localStorage', 'sessionStorage','indexedDB','selectionToken','window.open(', 'confirm(']){
 assert.ok(!panel.includes(banned), 'guided entry cannot call providers, persist customer data or claim selection: '+banned);
 assert.ok(!helpers.includes(banned), 'guided entry cannot call providers, persist customer data or claim selection: '+banned);
}
assert.ok(builder.includes('if (!betaSurface()) return "";') && discovery.includes('<form data-customer-discovery-form class="customer-discovery-form">${guidedBuilderMarkup()}'),'guided builder is offered on the Private Beta only, at the top of the search form');
const ownerContext={window:{location:{pathname:'/app/beta/',hash:'#/discover',hostname:'goflipforge.com'}},Date,Intl,BigInt};
vm.createContext(ownerContext);vm.runInContext(discovery,ownerContext);
const compose=ownerContext.window.FlipForgeCustomerDiscovery.guidedEntry.compose;
assert.equal(typeof compose,'function');
const valid={year:'2018',maker:'Topps',other:'',set:'Chrome',player:'Shohei Ohtani',number:'No. 150',parallel:'',grader:'PSA',grade:'9'};
assert.equal(compose(valid).query,'2018 Topps Chrome Shohei Ohtani #150 PSA 9');
assert.equal(compose({...valid,number:'PC-19',maker:'Other',other:'Upper Deck',grader:'',grade:'',parallel:'Silver'}).query,'2018 Upper Deck Chrome Shohei Ohtani #PC-19 Silver');
assert.equal(compose({...valid,year:'2025-26',maker:'Panini',set:'Prizm',player:'Cooper Flagg',number:'1',grade:'10'}).query,'2025-26 Panini Prizm Cooper Flagg #1 PSA 10');
for(const overrides of [{year:''},{year:'198A'},{year:'2025-27'},{year:'1700'},{maker:''},{set:''},{player:''},{number:'?'},{grader:'PSA',grade:''},{grader:'',grade:'9'}]){
 assert.ok(compose({...valid,...overrides}).error,'invalid composition must fail without guessing: '+JSON.stringify(overrides));
}
assert.ok(!builder.includes('type="submit" data-ffguided-build') && builder.includes('<button type="button" class="button button-primary" data-ffguided-build>'),'guided builder must not auto-search or evaluate');
console.log('PASS: customer Beta guided form connects to the existing source-truth search, composes exact-card text deterministically, fails closed on omissions, and does not call providers.');
