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
 await page.addScriptTag({path:'saas-prototype/beta-guided-discover-v1.js'});
 return page;
}
try{
 const dashboard=await scene('<div class="ff-commercial-dashboard" data-commercial-dashboard-v2><header class="ff-dashboard-head"><h1>Home</h1></header>'+
 '<section class="ff-kpi-grid">Server values</section><div class="ff-dashboard-main-grid">Server decisions</div>'+
 '<div class="ff-dashboard-boundary">Boundary statement</div></div>');
 await dashboard.locator('[data-ffguided-home]').waitFor();
 assert.equal(await dashboard.locator('[data-ffguided-home]').count(),1);
 assert.equal(await dashboard.locator('.ffguided-home-cta').getAttribute('href'),'#/discover');
 assert.equal(await dashboard.locator('[data-ffguided-more]').getAttribute('aria-expanded'),'false');
 assert.equal(await dashboard.locator('.ff-commercial-dashboard').getAttribute('data-ffguided-focus'),'simple');
 await dashboard.locator('[data-ffguided-more]').click();
 assert.equal(await dashboard.locator('.ff-commercial-dashboard').getAttribute('data-ffguided-focus'),'full');
 await dashboard.close();


 const v3=await scene('<div class="ffv3-root" data-decision-dashboard-v3 data-ffv3-state="ready"><header class="ffv3-command-bar">Decision</header>'+
 '<div class="ffv3-layout">Actual server dossier and ledger</div><section class="ffv3-analytics">Secondary metrics</section></div>');
 await v3.locator('[data-ffguided-home]').waitFor();
 assert.equal(await v3.locator('.ffv3-root').getAttribute('data-ffguided-focus'),'simple');
 await v3.locator('[data-ffguided-more]').click();
 assert.equal(await v3.locator('.ffv3-root').getAttribute('data-ffguided-focus'),'full');
 assert.equal(await v3.locator('.ffv3-layout').count(),1,'governed dossier must remain in the DOM');
 await v3.close();

 const form='<div class="customer-discovery-page"><form data-customer-discovery-form>'+
 '<label>Card<input name="exactCardQuery" type="search" required></label>'+
 '<button type="button" data-discovery-find-exact>Find exact card</button>'+
 '<button type="submit">Search active listings</button></form></div>';
 const discover=await scene(form);
 await discover.evaluate(()=>{location.hash='#/discover';});
 await discover.locator('[data-ffguided]').waitFor();
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
 await discover.evaluate(html=>{document.querySelector('#main-content').innerHTML=html;},form);
 await discover.locator('[data-ffguided]').waitFor();
 assert.equal(await discover.locator('[data-ffguided]').count(),1);
 assert.equal(errors.length,0,'no browser exceptions: '+errors.join(', '));
 await discover.close();
 console.log('PASS: dashboard Discover first action, collapsible analytics, controlled guided inputs, and safe re-render in isolated browser.');
}finally{await browser.close();}
