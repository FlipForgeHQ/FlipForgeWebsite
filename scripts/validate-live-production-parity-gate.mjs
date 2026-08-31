import fs from "node:fs";

const required = [
  ["scripts/verify-live-production-parity.mjs", [
    "https://goflipforge.com/deploy-meta.json",
    "EXPECTED_COMMIT_REF",
    "PRODUCTION_SERVER_OWNED_FAIL_CLOSED",
    "Smart Opportunity",
    "Existing PSA intelligence",
    "browserRecommendationAuthority",
    "transactionAuthority"
  ]],
  [".github/workflows/live-production-parity.yml", [
    "push:",
    "main",
    "workflow_dispatch:",
    "EXPECTED_COMMIT_REF: ${{ github.sha }}",
    "verify-live-production-parity.mjs"
  ]],
  ["package.json", ["verify:live-production-parity"]],
  ["DEPLOYMENT_CHECKLIST.md", ["Live Production Parity"]],
  ["docs/LIVE_PRODUCTION_PARITY_GATE.md", ["source/deployment parity"]]
];

for (const [file, markers] of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing live production parity gate file: ${file}`);
  const text = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!text.includes(marker)) throw new Error(`Missing live production parity marker in ${file}: ${marker}`);
  }
}

console.log("Live production parity gate is fully wired.");
