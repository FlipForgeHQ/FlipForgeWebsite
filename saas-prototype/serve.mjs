import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const prototypeRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const siteRoot = resolve(prototypeRoot, "..");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function contained(root, value) {
  return value === root || value.startsWith(`${root}/`);
}

function requestCandidates(urlPath) {
  const decoded = decodeURIComponent(String(urlPath || "/").split("?")[0]);
  const relative = normalize(decoded).replace(/^([/\\])+/, "");

  if (!relative) return [join(prototypeRoot, "index.html")];

  for (const prefix of ["app", "saas-prototype"]) {
    if (relative === prefix) return [join(prototypeRoot, "index.html")];
    if (relative.startsWith(`${prefix}/`)) {
      const nested = relative.slice(prefix.length + 1) || "index.html";
      const candidate = resolve(join(prototypeRoot, nested));
      return contained(prototypeRoot, candidate) ? [candidate, join(prototypeRoot, "index.html")] : [];
    }
  }

  const siteCandidate = resolve(join(siteRoot, relative));
  const prototypeCandidate = resolve(join(prototypeRoot, relative));
  return [
    ...(contained(siteRoot, siteCandidate) ? [siteCandidate] : []),
    ...(contained(prototypeRoot, prototypeCandidate) ? [prototypeCandidate] : [])
  ];
}

async function resolveFile(urlPath) {
  const candidates = requestCandidates(urlPath);
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) {
        const index = join(candidate, "index.html");
        await stat(index);
        return index;
      }
      return candidate;
    } catch {
      // Try the next safe candidate.
    }
  }
  return null;
}

const server = createServer(async (request, response) => {
  try {
    let filePath = await resolveFile(request.url || "/");
    if (!filePath) {
      const requested = String(request.url || "/").split("?")[0];
      if (requested.startsWith("/app/") || requested === "/app" || requested.startsWith("/saas-prototype/")) {
        filePath = join(prototypeRoot, "index.html");
      } else {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
        return;
      }
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Preview server error: ${error.message}`);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FlipForge SaaS preview running at http://localhost:${port}/app/#/dashboard`);
  console.log("Press Ctrl+C to stop the preview server.");
});
