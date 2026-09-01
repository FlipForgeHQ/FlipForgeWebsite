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

console.log("Injected Discover stale identity-request guard before customer-discovery.js.");
