import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const identitySource = path.join(root, "scripts", "lib", "flipforge-identity-client.mjs");
const identityOutput = path.join(root, "assets", "js", "flipforge-identity.js");
const probeSource = path.join(root, "scripts", "lib", "flipforge-staging-auth-probe.mjs");
const probeOutput = path.join(root, "assets", "js", "flipforge-staging-auth-probe.js");
const scriptTag = '<script src="/assets/js/flipforge-identity.js"></script>';

fs.mkdirSync(path.dirname(identityOutput), { recursive: true });

async function bundle(source, output) {
  await build({
    entryPoints: [source],
    outfile: output,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    sourcemap: false,
    legalComments: "none"
  });
}

await bundle(identitySource, identityOutput);
await bundle(probeSource, probeOutput);

function injectBefore(htmlPath, marker) {
  if (!fs.existsSync(htmlPath)) throw new Error(`Identity target missing: ${path.relative(root, htmlPath)}`);
  const original = fs.readFileSync(htmlPath, "utf8");
  if (original.includes('/assets/js/flipforge-identity.js')) return;
  if (!original.includes(marker)) throw new Error(`Identity insertion marker missing in ${path.relative(root, htmlPath)}`);
  const updated = original.replace(marker, `${scriptTag}\n  ${marker}`);
  fs.writeFileSync(htmlPath, updated, "utf8");
}

// Default Identity invite/recovery emails return to the project root, so the
// public landing page must be able to process callback hashes. The client stays
// visually dormant there unless a callback is present.
injectBefore(path.join(root, "index.html"), "</body>");

// The staging application initializes the current Identity UI before its
// read/evaluation adapters execute. Customer API authentication remains
// cookie-based; the adapters never read or forward a raw JWT.
injectBefore(path.join(root, "saas-prototype", "index.html"), '<script src="staging-browser.js"></script>');

const identityBytes = fs.statSync(identityOutput).size;
const probeBytes = fs.statSync(probeOutput).size;
console.log(`Built FlipForge Netlify Identity client (${identityBytes} bytes).`);
console.log(`Built FlipForge isolated staging auth probe (${probeBytes} bytes).`);
