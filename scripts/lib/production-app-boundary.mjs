const PRODUCTION_CONTEXT = "production";

const STAGING_DIAGNOSTIC_TOKENS = Object.freeze([
  '<link rel="stylesheet" href="staging-browser.css">',
  'data-route="staging"',
  'data-route="staging-evaluate"',
  '<script src="staging-browser.js"></script>'
]);

export function applyProductionAppBoundary(html, context = "") {
  const source = String(html ?? "");
  if (String(context || "").toLowerCase() !== PRODUCTION_CONTEXT) return source;

  return source
    .replace(/\n?\s*<link rel="stylesheet" href="staging-browser\.css">\s*/g, "\n")
    .replace(/\n?\s*<a href="#\/staging"[^>]*data-route="staging"[^>]*>.*?<\/a>\s*/g, "\n")
    .replace(/\n?\s*<a href="#\/staging-evaluate"[^>]*data-route="staging-evaluate"[^>]*>.*?<\/a>\s*/g, "\n")
    .replace(/\n?\s*<script src="staging-browser\.js"><\/script>\s*/g, "\n");
}

export function assertProductionAppBoundary(sourceHtml, transformedHtml) {
  const source = String(sourceHtml ?? "");
  const production = String(transformedHtml ?? "");

  for (const token of STAGING_DIAGNOSTIC_TOKENS) {
    if (production.includes(token)) {
      throw new Error(`Production app boundary retained preview-only staging token: ${token}`);
    }
  }

  const requiredProductionTokens = [
    '<script src="production-dashboard-guard.js"></script>',
    '<script src="staging-evaluation.js"></script>',
    '<script src="staging-route-hook.js"></script>',
    '<script src="customer-opportunities.js"></script>',
    '<script src="customer-opportunities-bridge.js"></script>'
  ];
  for (const token of requiredProductionTokens) {
    if (!production.includes(token)) {
      throw new Error(`Production app boundary removed required customer runtime token: ${token}`);
    }
  }

  if (!source.includes('<script src="staging-browser.js"></script>')) {
    throw new Error("Source app no longer carries the preview staging adapter contract expected by the production boundary transform.");
  }
  if (!source.includes('data-route="staging"') || !source.includes('data-route="staging-evaluate"')) {
    throw new Error("Source app no longer carries the preview staging navigation contract expected by the production boundary transform.");
  }

  return true;
}
