import fs from "node:fs";

const indexUrl = new URL("../saas-prototype/index.html", import.meta.url);
const marker = '  <script src="customer-discovery.js"></script>';
const guard = '  <script src="customer-discovery-request-guard.js"></script>';
let source = fs.readFileSync(indexUrl, "utf8");

if (!source.includes(marker)) {
  throw new Error("customer-discovery.js script marker is missing from the SaaS app shell.");
}
if (!source.includes(guard)) {
  source = source.replace(marker, `${guard}\n${marker}`);
  fs.writeFileSync(indexUrl, source, "utf8");
}

// No route-ownership repair script is injected into either app page: each route owner drops responses that
// arrive after the customer left its route (generation and route checks in the owner), and the route race stress
// test passes without a repair layer (consolidation, Nov 3 2026).

// beta-customer-flow-v2.js renders no HTML any more (every route owner renders its own strip and the saved decision
// page renders its own summary and save confirmation), so it is not patched at build time.

console.log("Injected Discover request guard.");
