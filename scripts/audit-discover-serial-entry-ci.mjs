import { chromium } from "playwright";
import assert from "node:assert/strict";

const base = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const browser = await chromium.launch({ headless:true });
const failures = [];
for (const width of [390,1440]) {
  const context = await browser.newContext({viewport:{width,height:900}});
  const page = await context.newPage();
  page.on("pageerror",err=>failures.push(width+" browser error: "+err.message));
  try {
    await page.addInitScript(() => localStorage.setItem("flipforge.privateBeta.onboarding.v1","complete"));
    await page.route("**/assets/js/flipforge-identity.js",route => route.fulfill({
      status:200, contentType:"application/javascript; charset=utf-8",
      body:'window.FlipForgeIdentity = Object.freeze({getUser:()=>({email:"qa@flipforge.test"}),getSnapshot:()=>({authenticated:true,email:"qa@flipforge.test",membershipActive:true,membershipConfigured:true,fullName:"QA"})});'
    }));
    await page.route("**/assets/js/flipforge-production-signin.js",route=>route.fulfill({
      status:200,contentType:"application/javascript",body:"(() => {})();"
    }));
    await page.route("**/api/v1/**",route => route.fulfill({
      status:200,contentType:"application/json",
      body:JSON.stringify({meta:{contractVersion:"1.0",engineVersion:"serial-ui-qa",authority:"Smart Opportunity",gradingAuthority:"Existing PSA intelligence",correlationId:"serial-ui-qa",generatedAt:"2026-10-20T00:00:00Z",evidenceFreshness:"QA_FIXTURE",limitations:[]},data:{status:"configured",items:[],results:[],candidateCount:0}})
    }));
    await page.goto(base+"/#/discover",{waitUntil:"domcontentloaded",timeout:18000});
    const form = page.locator("#main-content [data-customer-discovery-form]");
    await form.waitFor({state:"visible",timeout:15000});
    const query = form.locator('input[name="exactCardQuery"]');
    const numbered = form.locator("[data-ff-serial-status]");
    await numbered.waitFor({state:"visible",timeout:7000});
    assert.equal(await page.locator(".ff-guided-entry-grid").count(),0,"Old eight-field grid must be absent");
    assert.equal(await numbered.inputValue(),"unknown");
    assert.equal(await page.locator("#ff-guided-mode-root .ff-guide-panel").count(),0,"Guide must be opt-in");
    assert.equal(await form.locator("[data-ff-serial-denominator]").isVisible(),false,"Print run only appears when numbered");
    await numbered.selectOption("yes");
    assert.equal(await form.locator("[data-ff-serial-denominator]").isVisible(),true,"Print run appears for numbered card");
    await query.fill("2018 Topps Chrome Shohei Ohtani #150 PSA 9");
    await form.locator("[data-ff-serial-denominator]").fill("25");
    await form.locator("[data-ff-serial-ordinal]").fill("01");
    await query.evaluate(node=>{
      window.__serialObserved="";
      node.addEventListener("input",()=>window.__serialObserved=node.value);
    });
    await form.locator("[data-discovery-find-exact]").click();
    await page.waitForFunction(()=>(window.__serialObserved || "").includes("01/25"),null,{timeout:4000});
    assert.equal((await page.evaluate(()=>window.__serialObserved)).endsWith("01/25"),true);
    // Return to a fresh search so an invalid serial cannot reach the provider.
    await page.goto(base+"/#/dashboard",{waitUntil:"domcontentloaded"});
    await page.goto(base+"/#/discover",{waitUntil:"domcontentloaded"});
    const fresh = page.locator("#main-content [data-customer-discovery-form]");
    await fresh.waitFor({state:"visible",timeout:9000});
    await fresh.locator('input[name="exactCardQuery"]').fill("2018 Topps Chrome Shohei Ohtani #150");
    await fresh.locator("[data-ff-serial-status]").selectOption("yes");
    await fresh.locator("[data-ff-serial-denominator]").fill("25");
    await fresh.locator("[data-ff-serial-ordinal]").fill("26");
    await fresh.locator('button[type="submit"]').click();
    const error = fresh.locator("[data-ff-serial-error]");
    await error.waitFor({state:"visible",timeout:4000});
    assert.match(await error.textContent(),/cannot exceed/i);
    assert.equal(await fresh.locator('input[name="exactCardQuery"]').inputValue(),"2018 Topps Chrome Shohei Ohtani #150");
    console.log("PASS | "+width+"px: search-first, opt-in guide, /25 selection, 01/25, invalid serial hold");
  } catch(error) {
    failures.push(width+"px: "+error.message);
  } finally {
    await context.close();
  }
}
await browser.close();
if (failures.length) {failures.forEach(x=>console.error("FAIL | "+x));process.exit(1)}
