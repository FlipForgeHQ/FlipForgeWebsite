import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prototypeRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(prototypeRoot, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

const files = {
  index: read("saas-prototype/index.html"),
  app: read("saas-prototype/app.js"),
  data: read("saas-prototype/mock-data.js"),
  featureData: read("saas-prototype/feature-data.js"),
  featurePages: read("saas-prototype/feature-pages.js"),
  guard: read("saas-prototype/route-guard.js"),
  styles: read("saas-prototype/styles.css"),
  brand: read("saas-prototype/brand.css"),
  shell: read("saas-prototype/shell-fixes.css"),
  featureStyles: read("saas-prototype/feature-pages.css"),
  foundation: read("docs/SAAS_UI_FOUNDATION.md"),
  redirects: read("_redirects"),
  websiteBuild: read("scripts/build-assets.js")
};

const results = [];

function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
}

const routes = [
  "dashboard",
  "discover",
  "evaluate",
  "opportunities",
  "compare",
  "psa-advisor",
  "evidence",
  "portfolio",
  "sell",
  "alerts",
  "account"
];

check("001 prototype banner is explicit", files.index.includes("NON-PRODUCTION PROTOTYPE"));
check("002 mock-response boundary is visible", files.index.includes("Mock responses only"));
check("003 purchase authority is excluded in shell", files.index.includes("No purchase authority"));
check("004 customer brand identity is present", files.index.includes("CARD VALUE INTELLIGENCE"));
check("005 primary navigation has an accessible target", files.index.includes('id="primary-navigation"'));
check("006 mobile menu controls primary navigation", files.index.includes('aria-controls="primary-navigation"'));
check("007 skip link targets main content", files.index.includes('href="#main-content"'));
check("008 main content is focusable", files.index.includes('id="main-content" tabindex="-1"'));
check("009 search has a programmatic label", files.index.includes('for="global-search"'));
check("010 toast region is polite", files.index.includes('class="toast-region" aria-live="polite"'));

for (const route of routes) {
  check(`route navigation exists: ${route}`, files.index.includes(`data-route="${route}"`));
}

check("022 dashboard renderer exists", files.app.includes("function renderDashboard()"));
check("023 opportunity list renderer exists", files.app.includes("function renderOpportunities()"));
check("024 opportunity detail renderer exists", files.app.includes("function renderOpportunityDetail(id)"));
check("025 direct comparison renderer exists", files.app.includes("function renderCompare()"));
check("026 PSA Advisor renderer exists", files.app.includes("function renderPsaAdvisor()"));
check("027 evidence readiness renderer exists", files.app.includes("function renderEvidence()"));
check("028 evaluate intake does not calculate locally", files.app.includes("opening an existing saved opportunity instead of calculating a new recommendation"));
check("029 Smart Opportunity authority is explicit", files.app.includes("Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority"));
check("030 PSA authority is explicit", files.app.includes("Existing PSA intelligence remains the sole grading-guidance authority"));
check("031 comparison cannot override decisions", files.app.includes("does not declare a new winner or override either saved decision"));
check("032 active listings remain separate from sold evidence", files.app.includes("Active listings and fixed-price asks never become completed-sale evidence"));
check("033 browser uses en-US USD formatting", files.app.includes('new Intl.NumberFormat("en-US"') && files.app.includes('currency: "USD"'));

check("034 mock data declares non-production mode", files.data.includes('mode: "NON_PRODUCTION_PROTOTYPE"'));
check("035 mock data names Smart Opportunity authority", files.data.includes('authority: "Smart Opportunity"'));
check("036 mock data names PSA authority", files.data.includes('gradingAuthority: "Existing PSA intelligence"'));
check("037 every core recommendation type is represented", ["BUY", "WATCH", "VERIFY"].every(value => files.data.includes(`recommendation: "${value}"`)));
check("038 accepted sales are clearly modeled", files.data.includes("acceptedSales"));
check("039 population context is represented", files.data.includes("population:"));

check("040 compare query guard is loaded after app", files.index.indexOf('src="route-guard.js"') > files.index.indexOf('src="app.js"'));
check("041 compare query guard recognizes hash query", files.guard.includes('a[href^="#/compare?"]'));
check("042 compare query guard normalizes route", files.guard.includes('window.location.hash === "#/compare"'));
check("043 compare query guard restores selected card", files.guard.includes('selector.value = pendingLeftId'));
check("044 compare query guard stores nothing persistently", !/localStorage|sessionStorage|indexedDB/i.test(files.guard));

check("045 desktop-to-tablet breakpoint exists", files.styles.includes("@media (max-width: 1180px)"));
check("046 mobile navigation breakpoint exists", files.styles.includes("@media (max-width: 900px)"));
check("047 narrow-mobile breakpoint exists", files.styles.includes("@media (max-width: 640px)"));
check("048 reduced-motion support exists", files.styles.includes("@media (prefers-reduced-motion: reduce)"));
check("049 visible keyboard focus is defined", files.styles.includes(":focus-visible"));
check("050 tables can scroll horizontally", files.styles.includes(".table-wrap { overflow-x: auto; }"));

const browserCode = `${files.index}\n${files.app}\n${files.data}\n${files.featureData}\n${files.featurePages}\n${files.guard}`;
check("051 no password field exists", !/<input[^>]+type=["']password["']/i.test(browserCode));
check("052 no direct network fetch exists", !/\bfetch\s*\(/.test(browserCode));
check("053 no XMLHttpRequest exists", !/XMLHttpRequest/.test(browserCode));
check("054 no WebSocket exists", !/\bWebSocket\b/.test(browserCode));
check("055 no browser-stored secrets exist", !/localStorage|sessionStorage|indexedDB/i.test(browserCode));
check("056 no CardSight key variable exists", !/CARDSIGHT(?:AI)?_API_KEY/i.test(browserCode));
check("057 no authorization header exists", !/Authorization\s*:/i.test(browserCode));
check("058 no external script or stylesheet dependency exists", !/<(?:script|link)[^>]+https?:\/\//i.test(files.index));

check("059 foundation separates public marketing from SaaS", files.foundation.includes("Public marketing graphics remain separate from operational SaaS components"));
check("060 foundation requires server-side credentials", files.foundation.includes("Provider credentials remain server-side"));
check("061 foundation blocks recommendation recalculation", files.foundation.includes("recommendation recalculation"));
check("062 foundation blocks transaction authority", files.foundation.includes("auto-buy, bidding, checkout, or purchase authorization"));
check("063 foundation forbids unapproved deployment", files.foundation.includes("must not replace the public homepage or deploy without a separate explicit approval"));

check("064 approved brand stylesheet loads after base styles", files.index.indexOf('href="brand.css"') > files.index.indexOf('href="styles.css"'));
check("065 approved four-corner mark is present", ["brand-corner-tl", "brand-corner-tr", "brand-corner-bl", "brand-corner-br"].every(value => files.index.includes(value)));
check("066 approved gold center is present", files.index.includes('class="brand-center"'));
check("067 Card Value Intelligence is the visible identity line", files.index.includes('<span class="brand-subtitle">CARD VALUE INTELLIGENCE</span>'));
check("068 deprecated Signal Confidence Advantage tagline is absent", !/SIGNAL\s*[.·-]\s*CONFIDENCE\s*[.·-]\s*ADVANTAGE/i.test(browserCode));
check("069 Söhne typography stack is declared", /font-family:\s*"Söhne",\s*"Sohne"/i.test(files.brand));
check("070 approved silver charcoal gold palette is declared", ["#f2f2f2", "#8b928f", "#d4af37"].every(value => files.brand.toLowerCase().includes(value)));

check("071 shell fixes load after approved brand layer", files.index.indexOf('href="shell-fixes.css"') > files.index.indexOf('href="brand.css"'));
check("072 desktop shell clips horizontal overflow without creating a scroll container", files.shell.includes("overflow-x: clip") && !files.shell.includes("html,\nbody {\n  max-width: 100%;\n  overflow-x: hidden"));
check("073 topbar uses shrink-safe grid columns", files.shell.includes("grid-template-columns: minmax(0, 1fr) auto"));
check("074 narrow desktop profile collapses before clipping", files.shell.includes("@media (max-width: 1320px)") && files.shell.includes(".profile-copy"));

check("075 Netlify exposes the app root", files.redirects.includes("/app /saas-prototype/index.html 200"));
check("076 Netlify exposes the trailing-slash app root", files.redirects.includes("/app/ /saas-prototype/index.html 200"));
check("077 Netlify rewrites app assets to the isolated prototype", files.redirects.includes("/app/* /saas-prototype/:splat 200"));
check("078 website build replaces the deprecated tagline", files.websiteBuild.includes("'Signal. Confidence. Advantage.'") && files.websiteBuild.includes("'Card Value Intelligence'"));
check("079 website build adds desktop and mobile App Preview links", files.websiteBuild.includes('data-app-preview=\"desktop\"') && files.websiteBuild.includes('data-app-preview=\"mobile\"'));
check("080 website build adds a footer App Preview link", files.websiteBuild.includes('data-app-preview=\"footer\"'));
check("081 sidebar remains sticky during long dashboard pages", files.shell.includes(".sidebar,\n.topbar") && files.shell.includes("position: sticky") && files.shell.includes("align-self: start"));
check("082 sidebar navigation retains its own vertical scroll area", files.shell.includes(".primary-nav") && files.shell.includes("flex: 1 1 auto") && files.shell.includes("min-height: 0"));

check("083 feature stylesheet loads after shell fixes", files.index.indexOf('href="feature-pages.css"') > files.index.indexOf('href="shell-fixes.css"'));
check("084 feature data loads after core mock data", files.index.indexOf('src="feature-data.js"') > files.index.indexOf('src="mock-data.js"'));
check("085 feature data loads before the base router", files.index.indexOf('src="feature-data.js"') < files.index.indexOf('src="app.js"'));
check("086 feature route renderer loads after the base router", files.index.indexOf('src="feature-pages.js"') > files.index.indexOf('src="app.js"'));
check("087 compare guard remains last", files.index.indexOf('src="route-guard.js"') > files.index.indexOf('src="feature-pages.js"'));

check("088 feature data declares non-production mode", files.featureData.includes('mode: "NON_PRODUCTION_PROTOTYPE"'));
check("089 feature data declares in-memory persistence", files.featureData.includes('persistence: "IN_MEMORY_ONLY"'));
check("090 discovery market trend is modeled", files.featureData.includes("marketTrend:"));
check("091 discovery saved searches are modeled", files.featureData.includes("savedSearches:"));
check("092 discovery listings are modeled", files.featureData.includes("listings:"));
check("093 portfolio allocation is modeled", files.featureData.includes("allocation:"));
check("094 portfolio performance history is modeled", files.featureData.includes("history:"));
check("095 sell assumptions and candidates are modeled", files.featureData.includes("assumptions:") && files.featureData.includes("candidates:"));
check("096 alert rules and recent events are modeled", files.featureData.includes("rules:") && files.featureData.includes("recent:"));
check("097 account usage, entitlements and security are modeled", ["usage:", "entitlements:", "security:"].every(value => files.featureData.includes(value)));

check("098 complete Discover renderer exists", files.featurePages.includes("function renderDiscoverFull()"));
check("099 complete Portfolio renderer exists", files.featurePages.includes("function renderPortfolio()"));
check("100 complete Sell renderer exists", files.featurePages.includes("function renderSell()"));
check("101 complete Alerts renderer exists", files.featurePages.includes("function renderAlerts()"));
check("102 complete Account renderer exists", files.featurePages.includes("function renderAccount()"));
check("103 feature router covers all formerly placeholder routes", ["discover", "portfolio", "sell", "alerts", "account"].every(route => files.featurePages.includes(`case "${route}"`)));
check("104 market demand and liquidity chart exists", files.featurePages.includes("function renderMarketTrendChart()"));
check("105 portfolio value chart exists", files.featurePages.includes("function renderPortfolioChart()"));
check("106 discovery filters have programmatic labels", ["discover-query", "discover-sport", "discover-status"].every(id => files.featurePages.includes(`for=\"${id}\"`)));
check("107 sell controls have programmatic labels", ["sell-card", "sell-fee", "sell-shipping", "sell-insurance"].every(id => files.featurePages.includes(`for=\"${id}\"`)));
check("108 alert toggles expose pressed state", files.featurePages.includes('aria-pressed=\"${active}\"'));
check("109 feature routes restore focus and scroll position", files.featurePages.includes("main.focus({ preventScroll: true })") && files.featurePages.includes("window.scrollTo"));

check("110 feature pages make no direct network calls", !/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b/.test(files.featurePages));
check("111 feature pages persist nothing in browser storage", !/localStorage|sessionStorage|indexedDB/i.test(`${files.featurePages}\n${files.featureData}`));
check("112 feature pages contain no secret or authorization field", !/API_KEY|Authorization\s*:|type=["']password["']/i.test(`${files.featurePages}\n${files.featureData}`));
check("113 Discover explicitly preserves active-ask separation", files.featurePages.includes("active asks as sold evidence") && files.featurePages.includes("no scraping"));
check("114 Portfolio explicitly rejects guaranteed liquidation value", files.featurePages.includes("guaranteed liquidation value") && files.featurePages.includes("cannot guarantee sale proceeds"));
check("115 Sell explicitly excludes transaction authority", files.featurePages.includes("cannot list, sell, accept an offer, collect payment or authorize any transaction"));
check("116 Account explicitly excludes credentials and payment storage", files.featurePages.includes("No password, payment method, secret or production account is stored"));

check("117 feature layouts include tablet breakpoint", files.featureStyles.includes("@media (max-width: 1180px)"));
check("118 feature layouts include compact breakpoint", files.featureStyles.includes("@media (max-width: 760px)"));
check("119 feature layouts include narrow mobile breakpoint", files.featureStyles.includes("@media (max-width: 480px)"));
check("120 feature tables and cards use responsive grids", files.featureStyles.includes(".feature-grid") && files.featureStyles.includes(".listing-grid") && files.featureStyles.includes(".account-grid"));

const mobileShellStart = files.shell.indexOf("@media (max-width: 900px)");
const mobileShellRules = mobileShellStart >= 0 ? files.shell.slice(mobileShellStart) : "";
check("121 final mobile cascade restores fixed off-canvas sidebar", mobileShellRules.includes(".sidebar") && mobileShellRules.includes("position: fixed") && mobileShellRules.includes("top: 32px"));
check("122 mobile sidebar is removed from normal grid flow", mobileShellRules.includes("align-self: auto") && files.styles.includes(".app-shell { grid-template-columns: 1fr; }"));

const failures = results.filter(result => !result.passed);

console.log("SaaSPrototypeValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);

for (const failure of failures) {
  console.error(`FAIL | ${failure.name}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
