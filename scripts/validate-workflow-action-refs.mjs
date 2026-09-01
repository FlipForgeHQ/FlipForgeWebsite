import fs from "node:fs";
import path from "node:path";

const workflowDir = path.resolve(".github/workflows");
const files = fs.readdirSync(workflowDir)
  .filter(name => /\.ya?ml$/i.test(name))
  .sort();

const failures = [];
const allowed = [];

function inspectUse(file, target) {
  if (target.startsWith("./")) {
    allowed.push({ file, target, reason: "local-action" });
    return;
  }

  if (target.startsWith("docker://")) {
    failures.push({ file, target, reason: "container-action-must-be-reviewed-and-immutably-pinned" });
    return;
  }

  const at = target.lastIndexOf("@");
  if (at <= 0 || at === target.length - 1) {
    failures.push({ file, target, reason: "remote-action-missing-ref" });
    return;
  }

  const action = target.slice(0, at);
  const ref = target.slice(at + 1);
  const immutableSha = /^[0-9a-f]{40}$/i.test(ref);

  if (immutableSha) {
    allowed.push({ file, target, reason: "immutable-sha" });
    return;
  }

  // Bounded repository policy: GitHub-owned actions/* may track a supported
  // semantic major/minor tag. All other remote actions, including CodeQL and
  // third-party actions, must be pinned to an immutable 40-character SHA.
  if (action.startsWith("actions/") && /^v\d+(?:\.\d+){0,2}$/.test(ref)) {
    allowed.push({ file, target, reason: "github-owned-actions-version-tag" });
    return;
  }

  failures.push({ file, target, reason: "non-actions-remote-ref-must-be-immutable-sha" });
}

for (const file of files) {
  const source = fs.readFileSync(path.join(workflowDir, file), "utf8");
  const usesPattern = /^\s*(?:-\s*)?uses:\s*["']?([^"'\s#]+)["']?/gm;
  for (const match of source.matchAll(usesPattern)) {
    inspectUse(file, match[1]);
  }
}

console.log(`Workflow action reference policy scanned ${files.length} workflow files and ${allowed.length + failures.length} action references.`);
if (failures.length) {
  console.error("Uncontrolled workflow action references detected:");
  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.target} (${failure.reason})`);
  }
  process.exit(1);
}

console.log("Workflow action reference policy passed: GitHub-owned actions/* are version-controlled; all other remote actions are immutable-SHA pinned.");
