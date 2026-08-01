import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const source = path.join(root, "scripts", "lib", "flipforge-identity-client.mjs");
const output = path.join(root, "assets", "js", "flipforge-identity.js");
const scriptTag = '<script src="/assets/js/flipforge-identity.js"></script>';

fs.mkdirSync(path.dirname(output), { recursive: true });

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

// The staging application needs the compatibility surface established before
// its read/evaluation adapters execute. Authentication itself remains cookie-
// based; the shim never exposes a raw JWT to browser code.
injectBefore(path.join(root, "saas-prototype", "index.html"), '<script src="staging-browser.js"></script>');

const bytes = fs.statSync(output).size;
console.log(`Built FlipForge Netlify Identity client (${bytes} bytes).`);
