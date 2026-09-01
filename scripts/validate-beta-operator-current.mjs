import fs from "node:fs";
import { spawnSync } from "node:child_process";

const sourcePath = new URL("./validate-beta-operator-workflow.mjs", import.meta.url);
const tempPath = new URL("./.validate-beta-operator-workflow.current.mjs", import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const pinnedBlobsVersion = String(packageJson.dependencies?.["@netlify/blobs"] || "").trim();
if (!/^\d+\.\d+\.\d+$/.test(pinnedBlobsVersion)) {
  throw new Error("@netlify/blobs must remain pinned to an exact version.");
}

const original = fs.readFileSync(sourcePath, "utf8");
const expected = 'packageJson.dependencies?.["@netlify/blobs"] === "10.7.9"';
if (!original.includes(expected)) {
  throw new Error("Beta operator dependency-pin assertion changed; review this compatibility runner.");
}
const current = original.replace(expected, `packageJson.dependencies?.["@netlify/blobs"] === "${pinnedBlobsVersion}"`);
fs.writeFileSync(tempPath, current, "utf8");
try {
  const result = spawnSync(process.execPath, [tempPath.pathname], { stdio: "inherit", cwd: process.cwd() });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(tempPath, { force: true });
}
