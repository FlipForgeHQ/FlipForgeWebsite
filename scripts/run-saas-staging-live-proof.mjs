import fs from "node:fs";
import path from "node:path";
import { runStagingLiveProof } from "./lib/saas-staging-live-proof.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  if (index + 1 >= process.argv.length) throw new Error(`${name} requires a value.`);
  return process.argv[index + 1];
}

try {
  const proof = await runStagingLiveProof();
  const json = JSON.stringify(proof, null, 2) + "\n";
  const output = argValue("--output");
  if (output) {
    const resolved = path.resolve(output);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, json, { encoding: "utf8", mode: 0o600 });
    console.log(`Staging live proof completed successfully. Redacted proof written to ${resolved}`);
  } else {
    process.stdout.write(json);
  }
} catch (error) {
  console.error(`Staging live proof failed: ${error.message}`);
  process.exitCode = 1;
}
