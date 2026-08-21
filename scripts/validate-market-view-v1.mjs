import fs from "node:fs";

const index = fs.readFileSync("saas-prototype/index.html", "utf8");
const routeHook = fs.readFileSync("saas-prototype/staging-route-hook.js", "utf8");
const marketView = fs.readFileSync("saas-prototype/customer-market-view.js", "utf8");
const marketCss = fs.readFileSync("saas-prototype/customer-market-view.css", "utf8");
const gateway = fs.readFileSync("netlify/functions/flipforge-api.js", "utf8");
const modernGateway = fs.readFileSync("netlify/modern-functions/flipforge-api.mjs", "utf8");
const marketViewGateway = fs.readFileSync("netlify/modern-functions/market-view.mjs", "utf8");

let passed = 0;
function check(name, condition) {
  if (!condition) throw new Error(`Market View UI validation failed: ${name}`);
  passed += 1;
  console.log(`PASS | ${name}`);
}

check("Market View navigation exists", index.includes('href="#/market-view" data-route="market-view"'));
check("Market View is placed after Dashboard", index.indexOf('data-route="dashboard"') < index.indexOf('data-route="market-view"') && index.indexOf('data-route="market-view"') < index.indexOf('data-route="discover"'));
check("Market View stylesheet loads", index.includes('href="customer-market-view.css"'));
check("Market View adapter loads before route hook", index.indexOf('src="customer-market-view.js"') > 0 && index.indexOf('src="customer-market-view.js"') < index.indexOf('src="staging-route-hook.js"'));
check("Market View route delegates to customer adapter", routeHook.includes('route === "market-view"') && routeHook.includes("marketViewAdapter.render(main)"));
check("customer uses canonical Market View API route", marketView.includes('const ENDPOINT = "/api/v1/market-view"'));
check("canonical facade reuses verified identity gateway", marketViewGateway.includes('import flipForgeApi from "./flipforge-api.mjs"'));
check("canonical facade exposes exact Market View path", marketViewGateway.includes('path: "/api/v1/market-view"'));
check("canonical facade rewrites only to protected Market View resource", marketViewGateway.includes('url.pathname = "/api/v1/opportunities/__market-view-v1"'));
check("gateway permits protected opportunity-detail read path", gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/opportunities\\/[A-Za-z0-9._:-]+$/ }'));
check("wildcard gateway recognizes canonical Market View path", modernGateway.includes('const MARKET_VIEW_PATH = "/api/v1/market-view"'));
check("wildcard gateway rewrites Market View to protected resource", modernGateway.includes('const MARKET_VIEW_UPSTREAM_PATH = "/api/v1/opportunities/__market-view-v1"') && modernGateway.includes("url.pathname = MARKET_VIEW_UPSTREAM_PATH"));
check("wildcard gateway rewrites before legacy allowlist", modernGateway.includes("const effectiveRequest = gatewayRequest(request)") && modernGateway.includes("const event = await legacyEvent(effectiveRequest)"));
check("Market View validates server authority", marketView.includes('data.authority.recommendationAuthority !== "Smart Opportunity"'));
check("Market View refuses recommendation authority", marketView.includes("data.authority.marketViewRecommendationAuthority !== false"));
check("Market View refuses transaction authority", marketView.includes("data.transactionAuthority !== false"));
check("Market View requires saved-evaluated scope", marketView.includes('data.scope.code !== "SAVED_EVALUATED_UNIVERSE"'));
check("Market View refuses market-wide claim", marketView.includes("data.scope.marketWide !== false"));
check("Market View refuses continuous scanner claim", marketView.includes("data.scope.continuousMarketScannerActive !== false"));
check("customer hero hides internal Market View version token", marketView.includes('<span class="eyebrow">YOUR MARKET</span>') && !marketView.includes('YOUR MARKET · ${escapeHtml(data.marketViewVersion)}'));
check("customer summary uses action-oriented labels", marketView.includes('metric("Actionable decisions"') && marketView.includes('metric("Supported upside"') && marketView.includes('metric("Fresh evaluations"'));
check("decision distribution uses customer-facing wording", marketView.includes('>DECISION MIX</span>') && marketView.includes("Market View summarizes the decisions already made; it does not issue new ones."));
check("Market View keeps broader market scope explicit", marketView.includes("Broader market scanning is not active yet.") && marketView.includes("Broader market intelligence comes next."));
check("Market View labels value context as not profit or ROI", marketView.includes("evidence context—not profit or ROI"));
check("Market View labels follow-up coverage instead of momentum", marketView.includes("These percentages show recorded follow-up coverage. They do not imply market momentum."));
check("Market View keeps Smart Opportunity authority explicit", marketView.includes("Smart Opportunity still owns BUY/WATCH/VERIFY/PASS"));
check("Market View has responsive styling", marketCss.includes("@media (max-width: 680px)"));

console.log(`MARKET_VIEW_UI_VALIDATION_PASSED=${passed}`);
