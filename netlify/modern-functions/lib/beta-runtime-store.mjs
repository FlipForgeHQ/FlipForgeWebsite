import { getDeployStore, getStore } from "@netlify/blobs";

const PRODUCTION_HOSTS = new Set(["goflipforge.com", "www.goflipforge.com"]);

export function betaRuntimeStore(name, request) {
  let hostname = "";
  try { hostname = new URL(request.url).hostname.toLowerCase(); } catch { /* fail to isolated storage */ }
  const production = PRODUCTION_HOSTS.has(hostname) || String(process.env.CONTEXT || "").toLowerCase() === "production";
  return production
    ? getStore({ name, consistency: "strong" })
    : getDeployStore(name);
}
