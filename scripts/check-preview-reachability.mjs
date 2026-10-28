// One probe of a deploy preview for CI: prints "state=<blocked|reachable|unreachable>", "serving=<true|false>"
// (deploy-meta.json reports the expected commit) and a short reason. Credential-free; prints no bodies or headers.
//   node scripts/check-preview-reachability.mjs https://deploy-preview-123--goflipforge.netlify.app <head-sha>
import { probePreview } from "./lib/preview-block-detection.mjs";

const [origin, expectedSha = ""] = process.argv.slice(2);
let url;
try { url = new URL(String(origin || "")); } catch { url = null; }
if (!url || url.protocol !== "https:" || !/^[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(url.hostname) || url.pathname !== "/" || url.search) {
  console.log("state=invalid");
  console.log("serving=false");
  console.log("reason=preview URL must be https://<name>--<site>.netlify.app");
  process.exit(2);
}

const result = await probePreview(url.origin, { cacheBust: true });
let commit = "";
const meta = result.responses.find(item => item.path === "/deploy-meta.json");
if (result.state === "reachable" && meta?.status === 200) {
  try { commit = String(JSON.parse(meta.body).commitRef || ""); } catch { commit = ""; }
}
console.log(`state=${result.state}`);
console.log(`serving=${Boolean(expectedSha) && commit === expectedSha}`);
console.log(`commit=${/^[0-9a-f]{7,40}$/.test(commit) ? commit : "none"}`);
console.log(`reason=${result.reason}`);
