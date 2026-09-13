import fs from "node:fs";
import path from "node:path";
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

const outputDir = path.join(root,"marketing/exports");
fs.mkdirSync(outputDir,{recursive:true});
const browser = await playwright.chromium.launch({headless:true});
try {
  for (const doc of docs) {
    const page = await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
    const file = path.join(root,"marketing/generated",`${doc.slug}.html`);
    await page.goto(`file://${file}`,{waitUntil:"load"});
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
}
