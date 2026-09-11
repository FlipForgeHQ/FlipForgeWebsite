import { readFile, writeFile, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const sourcePath = path.resolve("scripts/audit-beta-first-decision-trial.mjs");
const runtimePath = path.resolve("scripts/.audit-beta-first-decision-trial.runtime.mjs");
const productionCommit = "11a6adac119da95c826b6798c66a24979f6fd4e6";
const original = await readFile(sourcePath, "utf8");
const requestIdNeedle = 'requestId: `qa-${fixture.key}`,';
const requestIdReplacement = 'requestId: String(headers["idempotency-key"] || ""),';
const commitNeedle = 'productionShellExpectedCommit: "0e75633552a6b0548b6fdd83e0736c997b81f11a",';
const commitReplacement = `productionShellExpectedCommit: "${productionCommit}",`;

if (!original.includes(requestIdNeedle)) {
  throw new Error("First-decision trial request-id patch target was not found.");
}
if (!original.includes(commitNeedle)) {
  throw new Error("First-decision trial production-commit patch target was not found.");
}

const patched = original
  .replace(requestIdNeedle, requestIdReplacement)
  .replace(commitNeedle, commitReplacement);

if (patched.includes(requestIdNeedle) || patched.includes(commitNeedle)) {
  throw new Error("First-decision trial harness patch was not unique.");
}

await writeFile(runtimePath, patched, "utf8");
try {
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
} finally {
  await unlink(runtimePath).catch(() => {});
}
