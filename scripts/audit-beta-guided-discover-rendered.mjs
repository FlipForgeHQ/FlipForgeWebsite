import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE='http://127.0.0.1:4173/app/';
const browser=await chromium.launch({headless:true});
const errors=[];
const template=(inner)=>'<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>'+
'<div class="app-shell" data-ff-interface="customer"><nav class="primary-nav"><a data-route="discover" href="#/discover">Evaluate a Card</a></nav>'+
'<main id="main-content">'+inner+'</main></div></body></html>';
async function scene(fragment){
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app/**',route=>route.fulfill({status:200,contentType:'text/html',body:template(fragment)}));
 await page.goto(BASE+'#/dashboard');
 await page.addStyleTag({path:'saas-prototype/beta-guided-discover-v1.css'});
 return page;
}
try{
 // The Dashboard "Start here" panel is rendered by the Dashboard owner (commercial-dashboard-v2.js) and checked by
 // validate-beta-guided-discover-v1.mjs and the beta screen snapshot; this rehearsal covers the Discover builder.
 // The guided builder is rendered by the Discover owner on the Private Beta (customer-discovery.js, Nov 3 2026).
 const discover=await scene('');
 await discover.route('**/api/v1/health',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({meta:{contractVersion:'1.0',correlationId:route.request().headers()['x-correlation-id']},data:{status:'configured'}})}));
 await discover.evaluate(()=>{window.FlipForgePrivateBetaEntry=true;location.hash='#/discover';});
 await discover.addScriptTag({path:'saas-prototype/customer-discovery.js'});
 const renderOwner=()=>discover.evaluate(()=>window.FlipForgeCustomerDiscovery.render(document.querySelector('#main-content')));
 assert.equal(await renderOwner(),true,'Discover owner renders on the Private Beta');
 await discover.locator('[data-ffguided]').waitFor();
 const guided=discover.locator('[data-ffguided]');
 if(!await guided.evaluate(node=>node.open))await guided.locator('summary').click();
 assert.equal(await discover.locator('[data-ffguided]').count(),1);
 await discover.locator('[data-ffguided-build]').click();
 assert.match(await discover.locator('[data-ffguided-message]').textContent(),/Choose a release year/);
 assert.equal(await discover.locator('input[name="exactCardQuery"]').inputValue(),'');
 for(const [name,value] of Object.entries({year:'2018',maker:'Topps',set:'Chrome',player:'Shohei Ohtani',number:'150',grader:'PSA',grade:'9'})){
   const field=discover.locator('[data-ffguided-field="'+name+'"]');
   if(['year','maker','grader','grade'].includes(name))await field.selectOption(value);
   else await field.fill(value);
 }
 await discover.locator('[data-ffguided-build]').click();
 assert.equal(await discover.locator('input[name="exactCardQuery"]').inputValue(),'2018 Topps Chrome Shohei Ohtani #150 PSA 9');
 assert.equal(await discover.locator('[data-discovery-find-exact]').count(),1);
 assert.equal(await discover.locator('[data-ffguided]').evaluate(e=>e.open),false);
 // A new application render must create one new guided entry, never duplicate it.
 await renderOwner();
 await discover.locator('[data-ffguided]').waitFor();
 assert.equal(await discover.locator('[data-ffguided]').count(),1);
 assert.equal(errors.length,0,'no browser exceptions: '+errors.join(', '));
 await discover.close();
 console.log('PASS: controlled guided inputs and safe re-render of the Discover owner in an isolated browser.');
}finally{await browser.close();}
