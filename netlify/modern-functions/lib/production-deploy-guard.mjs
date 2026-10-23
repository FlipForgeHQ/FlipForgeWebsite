// Production-only guard for privileged functions.
//
// Deploy previews and branch deploys run the same function code against the same Netlify Identity instance as
// production, and every deploy's functions receive an Identity admin token at runtime. Functions that use that
// token, change roles or account metadata, or export applicant and subscriber data therefore answer 404 everywhere
// except on the production custom domain. A preview or an older deploy URL can no longer reach them.
//
// This is defence in depth only: it does not replace the Netlify deploy-preview and environment-variable settings,
// because a pull request can change any code it builds.

export const PRODUCTION_HOSTS = Object.freeze(["goflipforge.com", "www.goflipforge.com"]);

// Local validators construct requests without the Netlify runtime. They may opt in with this exact value. The
// override is ignored whenever a Netlify deploy context is present, so it has no effect in any Netlify deploy.
export const LOCAL_OVERRIDE_ENV = "FLIPFORGE_LOCAL_PRIVILEGED_FUNCTION_OVERRIDE";
export const LOCAL_OVERRIDE_VALUE = "local-validator-only";

function deployContext(context) {
  const value = context?.deploy?.context ?? globalThis.Netlify?.context?.deploy?.context;
  return value === undefined || value === null || value === "" ? null : String(value).toLowerCase();
}

export function privilegedFunctionAllowed(request, context, env = process.env) {
  const runtimeContext = deployContext(context);
  if (runtimeContext === null && env?.[LOCAL_OVERRIDE_ENV] === LOCAL_OVERRIDE_VALUE) return true;

  let hostname = "";
  try {
    hostname = new URL(request.url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!PRODUCTION_HOSTS.includes(hostname)) return false;
  return runtimeContext === null || runtimeContext === "production";
}

export function productionOnly(handler) {
  return async function productionOnlyFunction(request, context) {
    if (!privilegedFunctionAllowed(request, context)) {
      return new Response("Not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex",
        },
      });
    }
    return handler(request, context);
  };
}
