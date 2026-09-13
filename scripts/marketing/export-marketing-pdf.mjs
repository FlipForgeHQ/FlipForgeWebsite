import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const content = JSON.parse(fs.readFileSync(path.join(root,"marketing/content/documents.json"),"utf8"));
const requested = process.argv.slice(2).filter(Boolean);
const wanted = requested.length && !requested.includes("all") ? new Set(requested) : null;
const docs = content.documents.filter(doc => !wanted || wanted.has(doc.slug));
if (!docs.length) throw new Error("No matching marketing documents. Use a document slug or 'all'.");

const build = spawnSync(process.execPath,[path.join(root,"scripts/marketing/build-marketing.mjs")],{cwd:root,stdio:"inherit"});
if (build.status !== 0) process.exit(build.status || 1);

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.error("Playwright is required for PDF/PNG export. Run: npm install --no-save playwright@1.55.0 && npx playwright install chromium");
  process.exit(1);
}

const contentTypes = {
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".svg":"image/svg+xml",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".webp":"image/webp"
};

const server = http.createServer((request,response)=>{
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (!relative || relative.endsWith("/")) relative += "index.html";
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      response.writeHead(404,{"content-type":"text/plain; charset=utf-8"});
      response.end("Not found");
      return;
    }
    response.writeHead(200,{"content-type":contentTypes[path.extname(target).toLowerCase()] || "application/octet-stream"});
    fs.createReadStream(target).pipe(response);
  } catch {
    response.writeHead(500,{"content-type":"text/plain; charset=utf-8"});
    response.end("Export server error");
  }
});

await new Promise((resolve,reject)=>{
  server.once("error",reject);
  server.listen(0,"127.0.0.1",resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start local marketing export server.");
const baseUrl = `http://127.0.0.1:${address.port}`;

const outputDir = path.join(root,"marketing/exports");
fs.mkdirSync(outputDir,{recursive:true});
const browser = await playwright.chromium.launch({headless:true});
try {
  for (const doc of docs) {
    const page = await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
    await page.goto(`${baseUrl}/marketing-preview/${encodeURIComponent(doc.slug)}/`,{waitUntil:"networkidle"});
    await page.emulateMedia({media:"print"});
    await page.pdf({
      path:path.join(outputDir,`${doc.slug}.pdf`),
      format:"Letter",
      printBackground:true,
      margin:{top:"0.35in",right:"0.35in",bottom:"0.35in",left:"0.35in"}
    });
    await page.emulateMedia({media:"screen"});
    await page.screenshot({path:path.join(outputDir,`${doc.slug}.png`),fullPage:true});
    await page.close();
    console.log(`Exported ${doc.slug}.pdf and ${doc.slug}.png`);
  }
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
