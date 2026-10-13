// Proves the deploy-time stylesheet bundle (scripts/build-app-css-bundle.mjs) changes nothing but the request count.
// For both app shells it builds an unbundled copy and a bundled copy of saas-prototype/, loads each in Chromium with
// scripts blocked (static CSS only), and requires the browser's full ordered CSS rule list - with @import sheets
// expanded - to be identical. It also checks the bundled <head> shape and that a second run changes nothing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ff-css-bundle-"));
const plain = path.join(work, "plain");
const bundled = path.join(work, "bundled");
fs.cpSync(path.join(root, "saas-prototype"), plain, { recursive: true });
fs.cpSync(path.join(root, "saas-prototype"), bundled, { recursive: true });
for (const dir of [plain, bundled]) for (const name of fs.readdirSync(dir)) if (/^app-css-bundle-.*\.css$/.test(name)) fs.rmSync(path.join(dir, name));
if (fs.readdirSync(path.join(root, "saas-prototype")).some(name => /^app-css-bundle-.*\.css$/.test(name))) {
  console.error("FAIL saas-prototype/ is already bundled. Run this audit before scripts/build-app-css-bundle.mjs (as the workflow does).");
  process.exit(1);
}
const bundler = path.join(root, "scripts/build-app-css-bundle.mjs");
const firstRun = execFileSync(process.execPath, [bundler, "--app-dir", bundled], { encoding: "utf8" }).trim();

const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const [, variant, ...rest] = url.pathname.split("/");
  const base = variant === "plain" ? plain : variant === "bundled" ? bundled : null;
  const file = base ? path.join(base, rest.join("/")) : path.join(root, url.pathname);
  if (!file.startsWith(base || root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
async function cssRules(variant, shell) {
  const page = await browser.newPage();
  await page.route(/\.js(\?|$)|fonts\.googleapis|fonts\.gstatic/, route => route.abort());
  const sheetRequests = [];
  page.on("request", request => { if (request.resourceType() === "stylesheet") sheetRequests.push(request.url()); });
  await page.goto(`${origin}/${variant}/${shell}`, { waitUntil: "load" });
  const rules = await page.evaluate(() => {
    const out = [];
    const walk = sheet => {
      let list;
      try { list = sheet.cssRules; } catch (_) { out.push(`UNREADABLE ${sheet.href}`); return; }
      for (const rule of list) {
        if (rule.type === CSSRule.IMPORT_RULE) { if (rule.styleSheet) walk(rule.styleSheet); else out.push(`MISSING IMPORT ${rule.href}`); }
        else out.push(rule.cssText);
      }
    };
    for (const sheet of document.styleSheets) walk(sheet);
    return out;
  });
  await page.close();
  return { rules, requests: sheetRequests.length };
}

for (const shell of ["index.html", "customer.html"]) {
  const before = await cssRules("plain", shell);
  const after = await cssRules("bundled", shell);
  const firstDiff = before.rules.findIndex((rule, index) => rule !== after.rules[index]);
  check(`${shell}: identical ordered CSS rule list (${before.rules.length} rules, @import expanded)`,
    before.rules.length > 1000 && before.rules.length === after.rules.length && firstDiff === -1,
    firstDiff === -1 ? "" : `first difference at ${firstDiff}`);
  check(`${shell}: no missing or unreadable stylesheets`, !after.rules.some(rule => /^(MISSING IMPORT|UNREADABLE)/.test(rule)));
  check(`${shell}: stylesheet requests reduced (${before.requests} -> ${after.requests})`, after.requests < before.requests && after.requests <= 4);
  const html = fs.readFileSync(path.join(bundled, shell), "utf8");
  const head = html.slice(0, html.search(/<\/head>/i));
  const localLinks = [...head.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/gi)].map(match => match[1]).filter(href => !href.startsWith("/") && !/^[a-z]+:/i.test(href));
  check(`${shell}: <head> has exactly one local stylesheet, the hashed bundle`, localLinks.length === 1 && /^app-css-bundle-[0-9a-f]{12}\.css$/.test(localLinks[0]), localLinks.join(","));
  const plainHead = fs.readFileSync(path.join(plain, shell), "utf8");
  const plainLocal = [...plainHead.slice(0, plainHead.search(/<\/head>/i)).matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>/gi)].map(match => match[1].split(/[?#]/)[0]).filter(href => !href.startsWith("/") && !/^[a-z]+:/i.test(href));
  const listed = (head.match(/data-ff-css-bundle-sources="([^"]*)"/) || [])[1] || "";
  check(`${shell}: bundle link lists every bundled source in order`, listed === plainLocal.join(" ") && (shell !== "customer.html" || listed.split(" ").includes("customer-app-system-v2.css")), `${listed.split(" ").length} listed`);
  const bundleCss = fs.readFileSync(path.join(bundled, localLinks[0]), "utf8");
  check(`${shell}: bundle contains no @import (all inlined)`, !/@import\s/i.test(bundleCss.replace(/\/\*[\s\S]*?\*\//g, "")));
  const sourceBody = html.slice(html.search(/<\/head>/i));
  const plainBody = fs.readFileSync(path.join(plain, shell), "utf8");
  check(`${shell}: everything after </head> is untouched`, sourceBody === plainBody.slice(plainBody.search(/<\/head>/i)));
}
const secondRun = execFileSync(process.execPath, [bundler, "--app-dir", bundled], { encoding: "utf8" }).trim();
check("a second run changes nothing (idempotent)", /0 stylesheet links -> 0 bundles.*0 stylesheet links -> 0 bundles/.test(secondRun), secondRun);
await browser.close();
server.close();
fs.rmSync(work, { recursive: true, force: true });

console.log(firstRun);
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`App stylesheet bundle audit: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
