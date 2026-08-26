import fs from 'node:fs';

const html = fs.readFileSync('saas-prototype/index.html', 'utf8');
const js = fs.readFileSync('saas-prototype/decision-intelligence-v1.js', 'utf8');
const css = fs.readFileSync('saas-prototype/customer-ui-system-v1.css', 'utf8');
const serverCss = fs.readFileSync('saas-prototype/decision-intelligence-server-v1.css', 'utf8');

const requiredServerPaths = [
  '/api/v1/opportunities',
  '/api/v1/evidence/',
  '/api/v1/psa-advisor/',
  '/api/v1/compare?ids='
];

const checks = [
  ['Decision Intelligence nav route is customer-visible', html.includes('href="#/decision-intelligence"') && html.includes('data-route="decision-intelligence"')],
  ['customer UI system is loaded', html.includes('customer-ui-system-v1.css')],
  ['server-owned Decision Intelligence states are loaded', html.includes('decision-intelligence-server-v1.css')],
  ['Decision Intelligence runtime is loaded last', html.includes('decision-intelligence-v1.js')],
  ['Ask vs Supported Value visual exists', js.includes('Ask vs Supported Value')],
  ['Decision Factors visual exists', js.includes('Decision Factors')],
  ['Evidence Readiness visual exists', js.includes('Evidence Readiness')],
  ['PSA Population Context visual exists', js.includes('PSA Population Context')],
  ['Direct Comparison visual exists', js.includes('Direct Comparison')],
  ['Smart Opportunity remains recommendation authority', js.includes('Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority')],
  ['PSA intelligence remains grading authority', js.includes('Existing PSA intelligence remains the sole grading-guidance authority')],
  ['browser explicitly performs no recommendation recalculation', js.includes('recalculate a recommendation')],
  ['browser explicitly performs no transaction action', js.includes('bid, checkout, buy, sell, or authorize any transaction')],
  ['population refuses cross-card borrowing', js.includes('instead of borrowing population from another card')],
  ['server datasource validates the authority envelope', js.includes('meta.authority === "Smart Opportunity"') && js.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ['server datasource correlates responses', js.includes('meta.correlationId === expectedCorrelationId') && js.includes('"X-Correlation-Id": requestCorrelationId')],
  ['server datasource is same-origin credentialed read-only', js.includes('credentials: "same-origin"') && js.includes('method: "GET"') && js.includes('cache: "no-store"')],
  ['all canonical read-only projection paths are allowlisted', requiredServerPaths.every(path => js.includes(path))],
  ['production fails closed instead of substituting prototype data', js.includes('if (productionHost())') && js.includes('state.source = "error"') && js.includes('No mock record, browser-generated recommendation, population estimate, or substitute evidence was shown.')],
  ['prototype fallback is restricted to non-production visual QA', js.includes('PREVIEW_HOST') && js.includes('state.source = "prototype"') && js.includes('Production never falls back to these records.')],
  ['page is responsive', css.includes('@media (max-width: 1050px)') && css.includes('@media (max-width: 720px)') && serverCss.includes('@media (max-width: 720px)')],
  ['reduced motion boundary is present', css.includes('prefers-reduced-motion: reduce')],
  ['central customer design tokens exist', css.includes('--ff-ui-bg:') && css.includes('--ff-ui-panel:') && css.includes('--ff-ui-gold:')],
  ['server-owned source is visibly labeled', serverCss.includes('.ff-di-source-server') && js.includes('SERVER-OWNED · READ ONLY')],
  ['Decision Intelligence runtime has no mutating HTTP methods', !/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i.test(js)],
  ['Decision Intelligence runtime does not write browser storage', !/localStorage|sessionStorage|indexedDB/i.test(js)],
  ['Decision Intelligence does not expose provider credentials', !/api[_-]?key|authorization:\s*["']bearer|providerCredential|serviceToken/i.test(js)],
  ['comparison remains non-ranking', js.includes('does not rerank, rescore, select a winner, or change either recommendation')],
  ['missing supported value is withheld', js.includes('Withheld · exact evidence required')],
  ['missing population stays missing', js.includes('No saved exact-card PSA population snapshot is attached to this opportunity')]
];

const failures = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
}

if (failures.length) {
  console.error(`\nDecision Intelligence validation failed: ${failures.length} check(s).`);
  process.exit(1);
}

console.log(`\nDecision Intelligence validation passed: ${checks.length}/${checks.length}.`);
