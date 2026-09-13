import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const docs = JSON.parse(fs.readFileSync(path.join(root,"marketing/content/documents.json"),"utf8")).documents;
const campaigns = JSON.parse(fs.readFileSync(path.join(root,"marketing/content/campaigns.json"),"utf8")).campaigns;
const outputDir = path.join(root,"qa-artifacts/marketing-system");
fs.mkdirSync(outputDir,{recursive:true});

const mime = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml",".json":"application/json; charset=utf-8",".png":"image/png",".webp":"image/webp"};
const server = http.createServer((request,response)=>{
  const url = new URL(request.url || "/","http://127.0.0.1");
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/,"");
  if (!rel || rel.endsWith("/")) rel += "index.html";
  const target = path.resolve(root,rel);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404,{"content-type":"text/plain; charset=utf-8"}); response.end("Not found"); return;
  }
  response.writeHead(200,{"content-type":mime[path.extname(target).toLowerCase()] || "application/octet-stream"});
  fs.createReadStream(target).pipe(response);
});
await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Marketing QA server did not start.");
const base = `http://127.0.0.1:${address.port}`;

const targets = [
  {key:"preview-center",path:"/marketing-preview/",kind:"center"},
  ...docs.map(doc=>({key:doc.slug,path:`/marketing-preview/${doc.slug}/`,kind:"document"})),
  {key:"campaign-library",path:"/marketing-preview/campaigns/",kind:"center"},
  ...campaigns.map(campaign=>({key:`campaign-${campaign.key}`,path:`/marketing-preview/campaigns/${campaign.key}/`,kind:"campaign"}))
];
const viewports = [
  {name:"desktop",width:1440,height:1000},
  {name:"mobile",width:390,height:844}
];
const results = [];
const failures = [];
const browser = await chromium.launch({headless:true});
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
    for (const target of targets) {
      const page = await context.newPage();
      const response = await page.goto(`${base}${target.path}`,{waitUntil:"networkidle"});
      const state = await page.evaluate(()=>{
        const body = document.body;
        const doc = document.documentElement;
        const logo = document.querySelector(".ff-mkt-logo");
        const main = document.querySelector("main");
        const bodyText = String(body?.innerText || "").trim();
        const overflow = Math.max(body?.scrollWidth || 0,doc?.scrollWidth || 0) - Math.max(body?.clientWidth || 0,doc?.clientWidth || 0);
        const emptyRects = [...document.querySelectorAll(".ff-mkt-card,.ff-mkt-layer,.ff-mkt-preview-card")].filter(node=>{
          const rect=node.getBoundingClientRect(); return rect.width < 2 || rect.height < 2;
        }).length;
        return {
          title:document.title,
          textLength:bodyText.length,
          hasMain:Boolean(main),
          hasLogo:Boolean(logo),
          logoVisible:Boolean(logo && logo.getBoundingClientRect().width > 20 && logo.getBoundingClientRect().height > 10),
          overflow,
          emptyRects,
          hasLockedSlogan:bodyText.includes("Before you buy. Know Why."),
          hasDescriptor:bodyText.includes("CARD DECISION INTELLIGENCE"),
          hasPrivateBeta:/\bPRIVATE BETA\b/i.test(bodyText),
          hasForbiddenInternalAnalogy:/Bloomberg of sports cards/i.test(bodyText)
        };
      });
      const row = {viewport:viewport.name,target:target.key,status:response?.status() || 0,...state};
      results.push(row);
      if (row.status !== 200) failures.push(`${viewport.name}/${target.key}: HTTP ${row.status}`);
      if (!row.hasMain || row.textLength < 120) failures.push(`${viewport.name}/${target.key}: blank or incomplete render`);
      if (row.overflow > 2) failures.push(`${viewport.name}/${target.key}: horizontal overflow ${row.overflow}px`);
      if (row.emptyRects > 0) failures.push(`${viewport.name}/${target.key}: ${row.emptyRects} empty marketing blocks`);
      if (target.kind !== "center" && (!row.hasLogo || !row.logoVisible)) failures.push(`${viewport.name}/${target.key}: locked logo is not visible`);
      if (target.kind !== "center" && !row.hasLockedSlogan) failures.push(`${viewport.name}/${target.key}: locked slogan missing`);
      if (target.kind === "document" && !row.hasDescriptor) failures.push(`${viewport.name}/${target.key}: descriptor missing`);
      if (row.hasPrivateBeta) failures.push(`${viewport.name}/${target.key}: private-beta language leaked into marketing output`);
      if (row.hasForbiddenInternalAnalogy) failures.push(`${viewport.name}/${target.key}: internal strategic analogy leaked into public output`);
      if (viewport.name === "desktop" && ["product-one-pager","card-decision-intelligence","campaign-deal-or-decoy"].includes(target.key)) {
        await page.screenshot({path:path.join(outputDir,`${target.key}-desktop.png`),fullPage:true});
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}

fs.writeFileSync(path.join(outputDir,"report.json"),JSON.stringify({generatedAt:new Date().toISOString(),results,failures},null,2)+"\n");
console.log(`Marketing rendered QA: ${results.length} route/viewport checks; ${failures.length} failures.`);
if (failures.length) {
  failures.forEach(value=>console.error(`FAIL | ${value}`));
  process.exit(1);
}
