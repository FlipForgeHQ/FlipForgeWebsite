import fs from "node:fs";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function requireText(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

const page = read("checkout/index.html");
const config = read("checkout/paddle-config.js");
const client = read("checkout/paddle-live.js");
const builder = read("scripts/build-paddle-live-config.mjs");
const packageJson = read("package.json");
const netlify = read("netlify.toml");
const combined = [page, config, client, builder].join("\n");

requireText(page, "https://goflipforge.com/checkout/", "Checkout page must pin the production canonical URL.");
requireText(page, "https://cdn.paddle.com/paddle/v2/paddle.js", "Checkout page must load Paddle.js v2 from Paddle CDN.");
requireText(page, "paddle-config.js", "Checkout page must load generated client-side configuration.");
requireText(page, "paddle-live.js", "Checkout page must load the Paddle initialization boundary.");
requireText(client, "Paddle.Initialize", "Checkout client must initialize Paddle.js.");
requireText(client, 'startsWith("live_")', "Checkout client must reject non-Live tokens.");
requireText(client, 'get("_ptxn")', "Checkout client must recognize Paddle transaction payment links.");
requireText(builder, "FLIPFORGE_PADDLE_CLIENT_TOKEN", "Build must read the dedicated Paddle client-side token variable.");
requireText(packageJson, '"build:paddle-live"', "package.json must expose the Paddle config build command.");
requireText(packageJson, '"validate:paddle-live-payment-link"', "package.json must expose the payment-link validator.");
requireText(netlify, "npm run build:paddle-live", "Netlify build must generate the Paddle browser config.");
requireText(netlify, "npm run validate:paddle-live-payment-link", "Netlify build must validate the Paddle payment-link boundary.");

if (/FLIPFORGE_PADDLE_(?:API_KEY|WEBHOOK_SECRET)/.test(combined)) {
  throw new Error("Server-side Paddle secrets must not appear in the payment-link page or build boundary.");
}
if (/pdl_(?:live|sdbx)_apikey_/.test(combined)) {
  throw new Error("A Paddle server API key must never be present in browser payment-link assets.");
}
if (/Paddle\.Checkout\.open\s*\(/.test(client)) {
  throw new Error("Default payment-link flow must let Paddle.js consume _ptxn rather than overriding it with Checkout.open().");
}
if (!config.includes('window.FLIPFORGE_PADDLE_CLIENT_TOKEN = "";')) {
  throw new Error("Committed Paddle client config must remain fail-closed with no token value.");
}

console.log("Paddle Live payment-link validation passed.");
