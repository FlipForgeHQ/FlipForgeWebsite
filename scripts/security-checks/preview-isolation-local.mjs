// Local mode of the preview-isolation verification (function modules only, no network). The deployed mode is run
// manually by the "Preview Isolation Verification (manual)" workflow.
import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/verify-preview-isolation.mjs", "--local"], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
