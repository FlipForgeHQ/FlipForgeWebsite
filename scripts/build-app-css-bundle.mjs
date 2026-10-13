#!/usr/bin/env node
// Deploy-time stylesheet bundle for the customer app shells (mobile first-render performance).
//
// The app shells load ~60 separate stylesheets in <head>. Each one blocks first paint, and three of them start
// further @import downloads one after another. On a slow phone that request count, not the bytes, delays the first
// meaningful paint.
//
// This step runs at the END of the Netlify build (after every validator, before the deploy manifest). For each app
// shell it replaces every run of consecutive same-folder <link rel="stylesheet"> tags in <head> with ONE link to a
// content-hashed bundle containing exactly the same CSS, in the same order. @import url(...) rules are inlined in place,
// which is where the browser applies them. Absolute (/assets/...) and external stylesheets, stylesheets added at
// runtime, inline <style> blocks and all scripts are left untouched. Source files in git are never modified;
// only the build output is.
//
// Rollback: remove this step from the Netlify command.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dirFlag = args.indexOf("--app-dir");
const appDir = dirFlag >= 0 ? path.resolve(args[dirFlag + 1]) : path.join(root, "saas-prototype");
const named = args.filter((value, index) => !value.startsWith("--") && args[index - 1] !== "--app-dir");
const shells = named.length ? named : ["index.html", "customer.html"];
const LINK = /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/i; // plain tags only: links with extra attributes are left alone
const IMPORT = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?\s*;/g;

function localHref(href) {
  return !/^(?:[a-z]+:)?\/\//i.test(href) && !href.startsWith("/") && !href.startsWith("data:") && /\.css(?:\?|$)/i.test(href);
}

function readCss(href, seen = []) {
  const clean = href.split(/[?#]/)[0];
  const file = path.join(appDir, clean);
  if (path.dirname(file) !== appDir) throw new Error(`Stylesheet outside the app folder: ${href}`);
  if (seen.includes(clean)) throw new Error(`Circular @import: ${[...seen, clean].join(" -> ")}`);
  let css = fs.readFileSync(file, "utf8").replace(/^﻿/, "").replace(/@charset\s+"[^"]*"\s*;/gi, "");
  // Inline each @import where it stands; nested imports keep their own order.
  css = css.replace(IMPORT, (_, target) => {
    if (!localHref(target)) throw new Error(`Non-local @import in ${clean}: ${target}`);
    return `\n/* @import ${target} (inlined) */\n${readCss(target, [...seen, clean])}\n`;
  });
  return css;
}

const results = [];
for (const shell of shells) {
  const htmlPath = path.join(appDir, shell);
  const html = fs.readFileSync(htmlPath, "utf8");
  const headEnd = html.search(/<\/head>/i);
  if (headEnd < 0) throw new Error(`${shell}: no </head>`);
  const head = html.slice(0, headEnd);
  const lines = head.split("\n");
  const out = [];
  let run = [];
  let bundles = 0;
  let linksReplaced = 0;
  const flush = () => {
    if (run.length < 2) { out.push(...run.map(entry => entry.line)); run = []; return; }
    const css = run.map(entry => `/* ${entry.href} */\n${readCss(entry.href)}\n`).join("");
    const hash = crypto.createHash("sha256").update(css).digest("hex").slice(0, 12);
    const name = `app-css-bundle-${hash}.css`;
    fs.writeFileSync(path.join(appDir, name), `/* FlipForge app stylesheet bundle: ${run.length} files, same order as the source <head>. Generated at deploy. */\n${css}`);
    const indent = run[0].line.match(/^\s*/)[0];
    // The source list keeps "is stylesheet X loaded?" checks answerable without a separate request.
    const sources = run.map(entry => entry.href.split(/[?#]/)[0]).join(" ");
    out.push(`${indent}<link rel="stylesheet" href="${name}" data-ff-css-bundle="${run.length}" data-ff-css-bundle-sources="${sources}">`);
    bundles += 1;
    linksReplaced += run.length;
    run = [];
  };
  for (const line of lines) {
    const match = line.trim().match(LINK);
    if (match && line.trim() === match[0] && localHref(match[1])) { run.push({ line, href: match[1] }); continue; }
    if (run.length && !line.trim()) continue; // blank lines inside a run of links
    flush();
    out.push(line);
  }
  flush();
  fs.writeFileSync(htmlPath, out.join("\n") + html.slice(headEnd));
  results.push(`${shell}: ${linksReplaced} stylesheet links -> ${bundles} bundle${bundles === 1 ? "" : "s"}`);
}
console.log(`App stylesheet bundle: ${results.join("; ")}`);
