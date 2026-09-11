import { readFile, writeFile, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const sourcePath = path.resolve("scripts/audit-beta-first-decision-trial.mjs");
const runtimePath = path.resolve("scripts/.audit-beta-first-decision-trial.runtime.mjs");
const original = await readFile(sourcePath, "utf8");
const needle = 'requestId: `qa-${fixture.key}`,';
const replacement = 'requestId: String(headers["idempotency-key"] || ""),';

if (!original.includes(needle)) {
  throw new Error("First-decision trial harness patch target was not found.");
}

const patched = original.replace(needle, replacement);
if (patched.includes(needle)) {
  throw new Error("First-decision trial harness patch was not unique.");
}

await writeFile(runtimePath, patched, "utf8");
try {
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
} finally {
  await unlink(runtimePath).catch(() => {});
}
