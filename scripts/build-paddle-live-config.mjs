import fs from "node:fs";
import path from "node:path";

const token = String(process.env.FLIPFORGE_PADDLE_CLIENT_TOKEN || "").trim();

if (token && (!token.startsWith("live_") || /\s/.test(token) || token.length > 512)) {
  throw new Error("FLIPFORGE_PADDLE_CLIENT_TOKEN must be a valid Paddle Live client-side token.");
}

const outputPath = path.resolve("checkout", "paddle-config.js");
const content = `window.FLIPFORGE_PADDLE_CLIENT_TOKEN = ${JSON.stringify(token)};\n`;
fs.writeFileSync(outputPath, content, "utf8");

console.log(`Paddle Live browser config: ${token ? "configured" : "not configured (fail-closed)"}`);
