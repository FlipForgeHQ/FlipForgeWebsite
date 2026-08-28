import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDeployManifest, validateDeployManifest } from "./lib/deploy-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "deploy-meta.json");
const manifest = createDeployManifest(process.env);
validateDeployManifest(manifest);
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote deploy-meta.json for ${manifest.context} @ ${manifest.commitRef}.`);
