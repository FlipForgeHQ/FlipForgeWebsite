// Internal path guard.
//
// The site publishes the repository root (publish = "."), so source folders that must stay in the repository for the
// build and the function bundler (netlify/, scripts/, contracts/) would otherwise be served as static files.
// scripts/strip-internal-from-publish.mjs deletes everything that can be deleted after the build; this function
// answers 404 for the folders that cannot be deleted and for any internal file the strip step might miss.
// Function paths take precedence over static files (preferStatic is not set), and this uses no redirect rule.
export default async function internalPathGuard() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex"
    }
  });
}

export const config = {
  path: [
    "/netlify/*",
    "/scripts/*",
    "/contracts/*",
    "/saas-prototype/validate*",
    "/app/beta/validate*",
    "/owner/customer/validate*",
    "/docs/*",
    "/deploy-triggers/*",
    "/legal/*",
    "/*.md",
    "/package.json",
    "/package-lock.json",
    "/netlify.toml",
    "/_redirects"
  ]
};
