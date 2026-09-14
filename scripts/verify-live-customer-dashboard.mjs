import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = new URL("https://goflipforge.com/app/customer/");
const runtimeAssets = [
  "commercial-dashboard-v2.js",
  "commercial-app-polish-v2.js",
  "commercial-dashboard-v2.css",
  "commercial-app-polish-v2.css"
];

async function fetchText(url, mime) {
  const response = await fetch(url, {
    headers: { "cache-control": "no-cache" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000)
  });
  assert(response.ok, `${url.pathname}: HTTP ${response.status}`);
  assert(mime.test(response.headers.get("content-type") || ""), `${url.pathname}: incorrect asset content type`);
  return response.text();
}

const html = await fetchText(base, /text\/html/i);
for (const asset of runtimeAssets) {
  const attribute = asset.endsWith(".js") ? "src" : "href";
  assert.equal(html.split(`${attribute}="${asset}"`).length, 2, `Customer page must load exactly one ${asset}`);
  const actual = await fetchText(new URL(asset, base), asset.endsWith(".js") ? /javascript/i : /text\/css/i);
  const expected = await readFile(new URL(`../saas-prototype/${asset}`, import.meta.url), "utf8");
  assert.equal(actual, expected, `Live customer asset differs from the deployed commit: ${asset}`);
}
console.log("PASS: live customer document includes dashboard runtime; all four public assets match the release.");
