import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE=(process.env.AUDIT_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const OUT='artifacts/site-composition';
fs.mkdirSync(OUT,{recursive:true});
fs.mkdirSync(path.join(OUT,'screenshots'),{recursive:true});

const rootPages=fs.readdirSync('.',{withFileTypes:true})
  .filter(entry=>entry.isFile()&&entry.name.endsWith('.html'))
  .map(entry=>`/${entry.name}`)
  .sort();
const extraPages=['/connect/'];
const appShellPages=['/saas-prototype/index.html','/saas-prototype/customer.html','/saas-prototype/production-auth.html']
  .filter(route=>fs.existsSync(`.${route}`));
const routes=[...new Set(['/index.html',...rootPages,...extraPages,...appShellPages])];

const standardViewports=[
  {name:'mobile-390',width:390,height:844},
  {name:'tablet-1024',width:1024,height:768},
  {name:'desktop-1440',width:1440,height:900}
];
const homeBreakpoints=[
  {name:'mobile-360',width:360,height:800},
  {name:'mobile-390',width:390,height:844},
  {name:'tablet-768',width:768,height:1024},
  {name:'tablet-1024',width:1024,height:768},
  {name:'nav-1119',width:1119,height:800},
  {name:'nav-1121',width:1121,height:800},
  {name:'desktop-1280',width:1280,height:800},
  {name:'desktop-1440',width:1440,height:900},
  {name:'wide-1920',width:1920,height:1080}
];

const failures=[];
const results=[];
const safeName=value=>value.replace(/^\/+|\/$/g,'').replace(/[^a-z0-9]+/gi,'-')||'home';

async function inspect(page,route,viewport){
  const staticFailures=[];
  const pageErrors=[];
  const failedAssets=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('requestfailed',request=>{
    if(['document','script','stylesheet','image','font'].includes(request.resourceType()))failedAssets.push(`${request.resourceType()} ${request.url()} ${request.failure()?.errorText||''}`);
  });
  page.on('response',response=>{
    const type=response.request().resourceType();
    if(response.status()>=400&&['document','script','stylesheet','image','font'].includes(type))failedAssets.push(`${type} HTTP ${response.status()} ${response.url()}`);
  });

  const response=await page.goto(`${BASE}${route}`,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForTimeout(300);
  if(!response||response.status()>=400)staticFailures.push(`document status ${response?.status()??'NO_RESPONSE'}`);

  const dom=await page.evaluate(()=>{
    const isVisible=el=>{
      const style=getComputedStyle(el);
      const rect=el.getBoundingClientRect();
      return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>0.01&&rect.width>0&&rect.height>0;
    };
    const routeOf=anchor=>{
      try{
        const raw=String(anchor.getAttribute('href')||'').trim();
        if(!raw||raw==='#'||/^javascript:/i.test(raw))return '';
        const url=new URL(raw,location.href);
        let route=url.pathname.replace(/\/+$/,'')||'/';
        if(route==='/index.html')route='/';
        if(url.hash&&url.hash!=='#')route+=url.hash;
        return route;
      }catch{return '';}
    };
    const idCounts={};
    document.querySelectorAll('[id]').forEach(el=>{idCounts[el.id]=(idCounts[el.id]||0)+1;});
    const duplicateIds=Object.entries(idCounts).filter(([,count])=>count>1);

    const navDuplicates=[];
    document.querySelectorAll('.decision-nav-links,.desktop-nav,.mobile-nav,nav[aria-label="Primary navigation"],nav[aria-label="Primary"]').forEach((nav,index)=>{
      const counts={};
      nav.querySelectorAll('a[href]').forEach(anchor=>{
        const route=routeOf(anchor);
        if(route)counts[route]=(counts[route]||0)+1;
      });
      Object.entries(counts).filter(([,count])=>count>1).forEach(([route,count])=>navDuplicates.push({nav:index,route,count}));
    });

    const clipped=[];
    const critical='header a, header button, .decision-brand, .decision-nav-links, .site-header .brand, .desktop-nav, main h1, .page-hero, .decision-hero-copy, .ff-deal-demo';
    document.querySelectorAll(critical).forEach(el=>{
      if(!isVisible(el))return;
      const rect=el.getBoundingClientRect();
      if(rect.left<-1||rect.right>innerWidth+1)clipped.push({tag:el.tagName,cls:String(el.className||''),text:(el.textContent||'').trim().slice(0,80),left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width)});
    });

    const headerOverlaps=[];
    const controls=[...document.querySelectorAll('header a,header button')].filter(isVisible);
    for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
      const a=controls[i],b=controls[j];
      if(a.contains(b)||b.contains(a))continue;
      const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
      const w=Math.max(0,Math.min(ar.right,br.right)-Math.max(ar.left,br.left));
      const h=Math.max(0,Math.min(ar.bottom,br.bottom)-Math.max(ar.top,br.top));
      const overlap=w*h;
      const smaller=Math.min(ar.width*ar.height,br.width*br.height);
      if(smaller>0&&overlap/smaller>.15)headerOverlaps.push({a:(a.textContent||a.getAttribute('aria-label')||'').trim().slice(0,60),b:(b.textContent||b.getAttribute('aria-label')||'').trim().slice(0,60),ratio:Number((overlap/smaller).toFixed(2))});
    }

    const badImages=[...document.images].filter(img=>isVisible(img)&&img.complete&&img.naturalWidth===0).map(img=>img.getAttribute('src'));
    const duplicateStyles=[...document.querySelectorAll('link[rel="stylesheet"][href]')].map(link=>new URL(link.href,location.href).pathname).filter((value,index,array)=>array.indexOf(value)!==index);
    const duplicateScripts=[...document.querySelectorAll('script[src]')].map(script=>new URL(script.src,location.href).pathname).filter((value,index,array)=>array.indexOf(value)!==index);

    const primaryDesktop=document.querySelector('.decision-nav-links,.desktop-nav');
    const cdiCount=primaryDesktop?[...primaryDesktop.querySelectorAll('a[href]')].filter(anchor=>['/decision-intelligence.html','/decision-intelligence'].includes(routeOf(anchor))).length:0;
    const mobileNav=document.querySelector('.mobile-nav');
    const closedMobileVisibility=mobileNav&&!mobileNav.classList.contains('open')?getComputedStyle(mobileNav).visibility:null;

    return {
      scrollWidth:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0),
      clientWidth:document.documentElement.clientWidth,
      duplicateIds,navDuplicates,clipped,headerOverlaps,badImages,duplicateStyles:[...new Set(duplicateStyles)],duplicateScripts:[...new Set(duplicateScripts)],cdiCount,closedMobileVisibility,
      title:document.title,
      mainText:(document.querySelector('main')?.innerText||'').trim().length
    };
  });

  if(dom.scrollWidth>dom.clientWidth+1)staticFailures.push(`horizontal overflow ${dom.scrollWidth}px > ${dom.clientWidth}px`);
  if(dom.duplicateIds.length)staticFailures.push(`duplicate runtime IDs ${JSON.stringify(dom.duplicateIds)}`);
  if(dom.navDuplicates.length)staticFailures.push(`duplicate nav routes ${JSON.stringify(dom.navDuplicates)}`);
  if(dom.clipped.length)staticFailures.push(`clipped critical elements ${JSON.stringify(dom.clipped.slice(0,8))}`);
  if(dom.headerOverlaps.length)staticFailures.push(`overlapping header controls ${JSON.stringify(dom.headerOverlaps.slice(0,8))}`);
  if(dom.badImages.length)staticFailures.push(`broken visible images ${JSON.stringify(dom.badImages)}`);
  if(dom.duplicateStyles.length)staticFailures.push(`duplicate runtime stylesheets ${JSON.stringify(dom.duplicateStyles)}`);
  if(dom.duplicateScripts.length)staticFailures.push(`duplicate runtime scripts ${JSON.stringify(dom.duplicateScripts)}`);
  if(!dom.title)staticFailures.push('blank document title');
  if(route!=='/404.html'&&dom.mainText<20)staticFailures.push(`main content unexpectedly sparse (${dom.mainText} chars)`);
  if(route==='/index.html'&&dom.cdiCount!==1)staticFailures.push(`homepage desktop Decision Intelligence route count is ${dom.cdiCount}, expected 1`);
  if(route==='/index.html'&&viewport.width<=1120&&dom.closedMobileVisibility!=='hidden')staticFailures.push(`closed mobile nav visibility is ${dom.closedMobileVisibility}, expected hidden`);
  if(pageErrors.length)staticFailures.push(`uncaught page errors ${JSON.stringify(pageErrors.slice(0,5))}`);
  if(failedAssets.length)staticFailures.push(`failed critical assets ${JSON.stringify(failedAssets.slice(0,8))}`);

  const shouldCapture=viewport.width===390||viewport.width===1440||staticFailures.length;
  if(shouldCapture){
    const shot=path.join(OUT,'screenshots',`${safeName(route)}--${viewport.name}.png`);
    await page.screenshot({path:shot,fullPage:true}).catch(()=>{});
  }

  return {route,viewport:viewport.name,width:viewport.width,failures:staticFailures,metrics:dom};
}

const browser=await chromium.launch({headless:true});
try{
  for(const route of routes){
    const viewports=route==='/index.html'?homeBreakpoints:standardViewports;
    for(const viewport of viewports){
      const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},reducedMotion:'reduce'});
      const page=await context.newPage();
      const result=await inspect(page,route,viewport);
      results.push(result);
      result.failures.forEach(failure=>failures.push(`${route} @ ${viewport.name}: ${failure}`));
      await context.close();
    }
  }

  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto(`${BASE}/index.html`,{waitUntil:'domcontentloaded'});
  // v10: the hero is one orchestrated lock-on (corner brackets, identity, decision panel). With reduced
  // motion it must render in its final state immediately, with the illustrative $425 PASS scenario.
  const heroState=await page.evaluate(()=>{
    const hero=document.querySelector('[data-ff10-hero]');
    return {locked:hero?.classList.contains('ff10-locked'),
            verdict:hero?.querySelector('[data-ff10-sync="verdict"]')?.textContent?.trim(),
            ask:hero?.querySelector('[data-ff10-sync="ask"]')?.textContent?.trim(),
            panelOpacity:hero?getComputedStyle(hero.querySelector('.ff10-panel')).opacity:null};
  });
  if(!heroState.locked)failures.push('homepage hero: reduced motion must show the final locked state immediately '+JSON.stringify(heroState));
  if(heroState.verdict!=='PASS'||heroState.ask!=='$425')failures.push('homepage hero: illustrative scenario must open at $425 PASS '+JSON.stringify(heroState));
  if(heroState.panelOpacity!=='1')failures.push('homepage hero: decision panel must be visible with reduced motion '+JSON.stringify(heroState));
  const demo=page.locator('[data-ffdemo]');
  const slider=page.locator('[data-asking]');
  if(await demo.count() && await slider.count()){
    await slider.evaluate(el=>{el.value='310';el.dispatchEvent(new Event('input',{bubbles:true}));});
    if((await page.locator('[data-ffdemo] .ff10-verdict[data-verdict]').textContent())?.trim()!=='BUY')failures.push('homepage: a $310 asking price must yield illustrative BUY');
    if((await page.locator('[data-ff10-hero] [data-ff10-sync="verdict"]').textContent())?.trim()!=='BUY')failures.push('homepage: hero decision panel must mirror the demo');
    if((await page.locator('[data-price-gap]').textContent())?.trim()!=='−$50')failures.push('homepage: $310 must be $50 below $360 Max Buy');
    await slider.evaluate(el=>{el.value='395';el.dispatchEvent(new Event('input',{bubbles:true}));});
    if((await page.locator('[data-ffdemo] .ff10-verdict[data-verdict]').textContent())?.trim()!=='PASS')failures.push('homepage: $395 exceeds illustrative Max Buy by more than $20');
    await page.locator('[data-uncertainty]').click();
    if((await page.locator('[data-ffdemo] .ff10-verdict[data-verdict]').textContent())?.trim()!=='VERIFY')failures.push('homepage: unresolved evidence must force VERIFY');
    await page.locator('[data-reset]').click();
    if((await page.locator('[data-ffdemo] .ff10-verdict[data-verdict]').textContent())?.trim()!=='PASS'||(await page.locator('[data-ask-value]').textContent())?.trim()!=='$425')failures.push('homepage: reset restores the illustrative $425 PASS');
    await page.locator('.ff10-math summary').click();
    if(!await page.locator('.ff10-math').evaluate(el=>el.open))failures.push('homepage: Max Buy calculation must be expandable');
    const navStatus=await page.evaluate(()=>{
      const nav=document.querySelector('.site-header nav.desktop-nav');
      const sign=nav?.querySelector('a[data-ff-marketing-sign-in]');
      const beta=nav?.querySelector('a.nav-cta[href*="beta-application"]');
      const a=sign?.getBoundingClientRect(), b=beta?.getBoundingClientRect();
      return {
        adjacent:Boolean(sign&&beta&&sign.nextElementSibling===beta),
        gap:a&&b?Number((b.left-a.right).toFixed(1)):null,
        labels:[sign?.textContent?.trim(),beta?.textContent?.trim()],
        header:document.querySelector('.site-header')?.outerHTML?.slice(0,950)
      };
    });
    if(!navStatus.adjacent||navStatus.gap==null||navStatus.gap<0||navStatus.gap>24){
      failures.push('homepage desktop: Sign In and Beta Access must be adjacent and close '+JSON.stringify(navStatus));
    }
  }else failures.push('homepage: interactive Max Buy demo or slider missing');
  await context.close();


  // In normal motion the hero lock-on plays once when visible and settles on the decision panel.
  const cinematicContext=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  const cinematicPage=await cinematicContext.newPage();
  await cinematicPage.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'});
  await cinematicPage.waitForFunction(()=>document.querySelector('[data-ff10-hero]')?.classList.contains('ff10-locked'),null,{timeout:3500})
    .catch(()=>failures.push('homepage cinematic: hero lock-on must start automatically when visible'));
  await cinematicPage.waitForTimeout(2600);
  const settled=await cinematicPage.evaluate(()=>{
    const hero=document.querySelector('[data-ff10-hero]');
    const panel=hero?.querySelector('.ff10-panel');
    return {armed:hero?.classList.contains('ff10-armed'),opacity:panel?getComputedStyle(panel).opacity:null,
            verdict:hero?.querySelector('[data-ff10-sync="verdict"]')?.textContent?.trim()};
  });
  if(!settled.armed||settled.opacity!=='1'||settled.verdict!=='PASS')failures.push('homepage cinematic: lock-on must settle on the visible $425 PASS panel '+JSON.stringify(settled));
  await cinematicContext.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const mobilePage=await mobile.newPage();
  await mobilePage.goto(`${BASE}/index.html`,{waitUntil:'domcontentloaded'});
  const toggle=mobilePage.locator('.menu-toggle');
  if(await toggle.count()){
    await toggle.click();
    const open=await mobilePage.locator('.mobile-nav').evaluate(el=>getComputedStyle(el).visibility==='visible'&&el.classList.contains('open')).catch(()=>false);
    if(!open)failures.push('homepage mobile nav: menu did not become visible');
    await mobilePage.keyboard.press('Escape');
    const closed=await mobilePage.locator('.mobile-nav').evaluate(el=>getComputedStyle(el).visibility==='hidden'&&!el.classList.contains('open')).catch(()=>false);
    if(!closed)failures.push('homepage mobile nav: menu did not close cleanly with Escape');
  }else failures.push('homepage mobile nav: toggle missing');
  await mobile.close();
}finally{
  await browser.close();
}

const report={generatedAt:new Date().toISOString(),baseUrl:BASE,routes,results,failures};
fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
console.log(`Rendered composition audit checked ${results.length} route/viewport combinations across ${routes.length} routes.`);
if(failures.length){
  console.error(`FAILED: ${failures.length}`);
  failures.slice(0,200).forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log('PASS: no duplicate navigation, horizontal overflow, critical clipping, header overlap, broken critical assets, duplicate runtime IDs/resources, or homepage interaction regressions detected.');
