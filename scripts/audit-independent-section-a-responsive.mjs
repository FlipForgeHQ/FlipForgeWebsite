import { chromium } from 'playwright';

const base='http://127.0.0.1:4173';
const routes=['/','/product.html','/pricing.html','/faq.html','/about.html','/privacy.html','/terms.html','/beta-terms.html','/data-use.html','/beta-application.html','/beta-onboarding.html'];
const viewports=[
  {name:'desktop',width:1440,height:900},
  {name:'tablet',width:1024,height:900},
  {name:'mobile',width:390,height:844}
];
const browser=await chromium.launch({headless:true});
const failures=[];
const passes=[];
for (const viewport of viewports) {
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
  for (const route of routes) {
    const page=await context.newPage();
    const consoleErrors=[];
    page.on('console',msg=>{ if(msg.type()==='error') consoleErrors.push(msg.text()); });
    page.on('pageerror',err=>consoleErrors.push(String(err)));
    const response=await page.goto(base+route,{waitUntil:'networkidle'});
    if (!response || !response.ok()) failures.push(`${viewport.name} ${route}: HTTP ${response?.status()}`);
    const metrics=await page.evaluate(()=>({
      scrollWidth:document.documentElement.scrollWidth,
      innerWidth:window.innerWidth,
      bodyText:(document.body?.innerText||'').trim().length,
      smallestMainFont:[...document.querySelectorAll('main p, main li, main label, main button, main input, main select')]
        .filter(el=>{const s=getComputedStyle(el); const r=el.getBoundingClientRect(); return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;})
        .map(el=>parseFloat(getComputedStyle(el).fontSize)||999)
        .reduce((a,b)=>Math.min(a,b),999)
    }));
    if (metrics.scrollWidth > metrics.innerWidth + 2) failures.push(`${viewport.name} ${route}: horizontal overflow ${metrics.scrollWidth}>${metrics.innerWidth}`);
    if (metrics.bodyText < 80) failures.push(`${viewport.name} ${route}: insufficient rendered content`);
    if (metrics.smallestMainFont < 12) failures.push(`${viewport.name} ${route}: visible main text below 12px (${metrics.smallestMainFont}px)`);
    if (consoleErrors.length) failures.push(`${viewport.name} ${route}: console/page errors: ${consoleErrors.join(' || ')}`);

    const toggle=page.locator('.menu-toggle');
    if (viewport.name==='mobile' && await toggle.count()) {
      await toggle.click();
      const expanded=await toggle.getAttribute('aria-expanded');
      const visibleLinks=await page.locator('.mobile-nav a:visible').count();
      if (expanded!=='true' || visibleLinks<1) failures.push(`mobile ${route}: mobile navigation did not open accessibly`);
    }
    if (viewport.name==='desktop') {
      const desktopLinks=await page.locator('.desktop-nav a:visible').count();
      if (desktopLinks<1) failures.push(`desktop ${route}: desktop navigation unavailable`);
    }
    if (!failures.some(x=>x.includes(`${viewport.name} ${route}:`))) passes.push(`${viewport.name} ${route}`);
    await page.close();
  }
  await context.close();
}
await browser.close();
console.log(JSON.stringify({section:'A',phase:'responsive',passCount:passes.length,failureCount:failures.length,failures},null,2));
if (failures.length) process.exit(1);
