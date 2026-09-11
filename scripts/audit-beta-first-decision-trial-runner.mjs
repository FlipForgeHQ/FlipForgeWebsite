import { readFile, writeFile, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const sourcePath = path.resolve("scripts/audit-beta-first-decision-trial.mjs");
const runtimePath = path.resolve("scripts/.audit-beta-first-decision-trial.runtime.mjs");
const productionCommit = "1903091e98ccad667d1f110e2dea698416b19609";
const original = await readFile(sourcePath, "utf8");
const requestIdNeedle = 'requestId: `qa-${fixture.key}`,';
const requestIdReplacement = 'requestId: String(headers["idempotency-key"] || ""),';
const commitNeedle = 'productionShellExpectedCommit: "0e75633552a6b0548b6fdd83e0736c997b81f11a",';
const commitReplacement = `productionShellExpectedCommit: "${productionCommit}",`;
const nextActionNeedle = '    check(decisionScreen.text.includes("What you should do next"), "Decision screen did not give an obvious next action.");';
const nextActionReplacement = '    check(decisionScreen.text.includes("What you should do next") || decisionScreen.actions.some(value => /Understand this decision|Track this card|Start another card/i.test(value)), "Decision screen did not give an obvious next action.");';
const explanationNeedle = '    check(decisionScreen.actions.some(value => /Show me why/i.test(value)), "Decision screen did not provide a clear \'Show me why\' action.");';
const explanationReplacement = '    check(decisionScreen.actions.some(value => /Show me why|Understand this decision|View evidence/i.test(value)), "Decision screen did not provide a clear decision-explanation action.");';
const lifecycleDetailNeedle = '      await fulfill({ kind: "lifecycle-detail", lifecycle: lifecycleRecord(fixture), history: [] });';
const lifecycleDetailReplacement = '      await fulfill({ kind: "lifecycle-detail", opportunityId: fixture.opportunityId, lifecycle: lifecycleRecord(fixture), history: [] });';

for (const [needle, label] of [
  [requestIdNeedle, "request-id"],
  [commitNeedle, "production-commit"],
  [nextActionNeedle, "next-action semantics"],
  [explanationNeedle, "decision-explanation semantics"],
  [lifecycleDetailNeedle, "lifecycle-detail contract"]
]) {
  if (!original.includes(needle)) throw new Error(`First-decision trial ${label} patch target was not found.`);
}

const patched = original
  .replace(requestIdNeedle, requestIdReplacement)
  .replace(commitNeedle, commitReplacement)
  .replace(nextActionNeedle, nextActionReplacement)
  .replace(explanationNeedle, explanationReplacement)
  .replace(lifecycleDetailNeedle, lifecycleDetailReplacement);

for (const needle of [requestIdNeedle, commitNeedle, nextActionNeedle, explanationNeedle, lifecycleDetailNeedle]) {
  if (patched.includes(needle)) throw new Error("First-decision trial harness patch was not unique.");
}

await writeFile(runtimePath, patched, "utf8");
try {
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
} finally {
  await unlink(runtimePath).catch(() => {});
}
