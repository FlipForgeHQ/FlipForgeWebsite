import flipForgeApi from "./flipforge-api.mjs";

/**
 * Canonical customer-facing Market View route.
 *
 * The backend V1 projection is intentionally hosted behind the existing tenant-isolated
 * Opportunities read boundary. This exact-path facade keeps that implementation detail
 * private while reusing the same Netlify Identity verification, signed membership,
 * service token, tenant header, cache policy, and upstream error contract.
 */
export default async function marketView(request) {
  const url = new URL(request.url);
  url.pathname = "/api/v1/opportunities/__market-view-v1";
  url.search = "";
  return flipForgeApi(new Request(url, request));
}

export const config = {
  path: "/api/v1/market-view"
};
