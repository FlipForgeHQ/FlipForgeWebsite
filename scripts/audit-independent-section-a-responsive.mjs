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
const observations=[];
for (const viewport of viewports) {
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
  await context.route('**/api/conversion-event',route=>route.fulfill({status:204,body:''}));
  for (const route of routes) {
    const page=await context.newPage();
    const consoleErrors=[];
    page.on('console',msg=>{ if(msg.type()==='error') consoleErrors.push(msg.text()); });
    page.on('pageerror',err=>consoleErrors.push(String(err)));
    const response=await page.goto(base+route,{waitUntil:'networkidle'});
    if (!response || !response.ok()) failures.push(`${viewport.name} ${route}: HTTP ${response?.status()}`);
    const metrics=await page.evaluate(()=>{
      const visible=[...document.querySelectorAll('main p, main li, main label, main button, main input, main select')]
        .filter(el=>{const s=getComputedStyle(el); const r=el.getBoundingClientRect(); return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;})
        .map(el=>({
          tag:el.tagName.toLowerCase(),
          cls:typeof el.className==='string'?el.className:'',
          id:el.id||'',
          text:(el.textContent||el.value||el.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,120),
          font:parseFloat(getComputedStyle(el).fontSize)||999
        }))
        .sort((a,b)=>a.font-b.font);
      return {
        scrollWidth:document.documentElement.scrollWidth,
        innerWidth:window.innerWidth,
        bodyText:(document.body?.innerText||'').trim().length,
        smallest:visible[0]||null,
        under12:visible.filter(item=>item.font<12).slice(0,12)
      };
    });
    observations.push({viewport:viewport.name,route,smallest:metrics.smallest,under12:metrics.under12});
    if (metrics.scrollWidth > metrics.innerWidth + 2) failures.push(`${viewport.name} ${route}: horizontal overflow ${metrics.scrollWidth}>${metrics.innerWidth}`);
    if (metrics.bodyText < 80) failures.push(`${viewport.name} ${route}: insufficient rendered content`);
    if (metrics.smallest?.font < 12) failures.push(`${viewport.name} ${route}: visible main text below 12px (${metrics.smallest.font}px) ${metrics.smallest.tag}.${metrics.smallest.cls} “${metrics.smallest.text}”`);
    if (consoleErrors.length) failures.push(`${viewport.name} ${route}: console/page errors: ${consoleErrors.join(' || ')}`);

    const toggle=page.locator('.menu-toggle');
    if (viewport.name==='mobile' && await toggle.count()) {
      await toggle.click();
      await page.waitForTimeout(350);
      const navState=await page.evaluate(()=>{
        const toggle=document.querySelector('.menu-toggle');
        const menu=document.querySelector('.mobile-nav');
        if(!toggle||!menu)return null;
        const style=getComputedStyle(menu);
        const rect=menu.getBoundingClientRect();
        const links=[...menu.querySelectorAll('a')];
        return {
          expanded:toggle.getAttribute('aria-expanded'),
          classOpen:menu.classList.contains('open'),
          display:style.display,
          visibility:style.visibility,
          opacity:style.opacity,
          rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
          linkCount:links.length,
          visibleLinkCount:links.filter(link=>{const s=getComputedStyle(link),r=link.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&parseFloat(s.opacity||'1')>0&&r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;}).length
        };
      });
      observations.push({viewport:viewport.name,route,navState});
      if (!navState || navState.expanded!=='true' || !navState.classOpen || navState.visibleLinkCount<1) failures.push(`mobile ${route}: mobile navigation did not open accessibly ${JSON.stringify(navState)}`);
    }
    if (viewport.name==='desktop') {
      const desktopLinks=await page.locator('.desktop-nav a:visible, .decision-nav-links a:visible, header.site-header a:visible, header.decision-header a:visible').count();
      if (desktopLinks<1) failures.push(`desktop ${route}: desktop navigation unavailable`);
    }
    await page.close();
  }
  await context.close();
}
await browser.close();
console.log(JSON.stringify({section:'A',phase:'responsive',failureCount:failures.length,failures,observations},null,2));
if (failures.length) process.exit(1);
