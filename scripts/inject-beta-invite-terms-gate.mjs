import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptTag = '<script src="/assets/js/beta-invite-terms-gate.js"></script>';
const identityTag = '<script src="/assets/js/flipforge-identity.js"></script>';

function inject(relativePath) {
  const target = path.join(root, relativePath);
  if (!fs.existsSync(target)) throw new Error(`Terms-gate target missing: ${relativePath}`);
  const original = fs.readFileSync(target, "utf8");
  if (original.includes('beta-invite-terms-gate.js')) return;
  if (!original.includes(identityTag)) throw new Error(`Identity marker missing in ${relativePath}`);
  const updated = original.replace(identityTag, `${identityTag}\n  ${scriptTag}`);
  fs.writeFileSync(target, updated, "utf8");
}

inject("index.html");
inject(path.join("saas-prototype", "index.html"));

console.log("Injected FlipForge beta invitation Terms gate on public callback and app surfaces.");
