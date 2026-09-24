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
  const forge=page.locator('[data-decision-forge]');
  const forgeSteps=page.locator('[data-forge-step]');
  if(await forge.count() && await forgeSteps.count()===5){
    await forgeSteps.nth(2).click();
    await page.waitForFunction(()=>document.querySelector('[data-decision-forge]')?.dataset.step==='2',null,{timeout:3000})
      .catch(()=>failures.push('homepage interaction: Decision Forge qualify stage did not render'));
    const qualifyStatus=(await page.locator('[data-forge-status]').textContent().catch(()=>''))||'';
    if(!/5 rejected/i.test(qualifyStatus)||!/2 qualified/i.test(qualifyStatus))failures.push('homepage interaction: Decision Forge qualification evidence summary missing');

    await forgeSteps.nth(4).click();
    await page.waitForFunction(()=>document.querySelector('[data-decision-forge]')?.dataset.step==='4',null,{timeout:3000})
      .catch(()=>failures.push('homepage interaction: Decision Forge reveal stage did not render'));
    const whyButton=page.locator('[data-forge-why-button]');
    if(await whyButton.count()){
      await whyButton.click();
      const expanded=await whyButton.getAttribute('aria-expanded');
      const open=await page.locator('[data-forge-why]').evaluate(el=>el.classList.contains('is-open')).catch(()=>false);
      if(expanded!=='true'||!open)failures.push('homepage interaction: Decision Forge reason trail did not open');
    }else failures.push('homepage interaction: Decision Forge reason-trail control missing');
  }else failures.push('homepage interaction: Decision Forge stage controls missing');
  await context.close();

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
