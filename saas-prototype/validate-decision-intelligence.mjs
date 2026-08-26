import fs from 'node:fs';

const html = fs.readFileSync('saas-prototype/index.html', 'utf8');
const js = fs.readFileSync('saas-prototype/decision-intelligence-v1.js', 'utf8');
const css = fs.readFileSync('saas-prototype/customer-ui-system-v1.css', 'utf8');

const checks = [
  ['Decision Intelligence nav route is customer-visible', html.includes('href="#/decision-intelligence"') && html.includes('data-route="decision-intelligence"')],
  ['customer UI system is loaded', html.includes('customer-ui-system-v1.css')],
  ['Decision Intelligence runtime is loaded last', html.includes('decision-intelligence-v1.js')],
  ['Ask vs Supported Value visual exists', js.includes('Ask vs Supported Value')],
  ['Decision Factors visual exists', js.includes('Decision Factors')],
  ['Evidence Readiness visual exists', js.includes('Evidence Readiness')],
  ['PSA Population Context visual exists', js.includes('PSA Population Context')],
  ['Direct Comparison visual exists', js.includes('Direct Comparison')],
  ['Smart Opportunity remains recommendation authority', js.includes('Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority')],
  ['PSA intelligence remains grading authority', js.includes('Existing PSA intelligence remains the sole grading-guidance authority')],
  ['browser explicitly performs no recommendation recalculation', js.includes('recommendation recalculation')],
  ['browser explicitly performs no transaction action', js.includes('transaction, bid, checkout or purchase action')],
  ['population refuses cross-card borrowing', js.includes('instead of borrowing population from another card')],
  ['page is responsive', css.includes('@media (max-width: 1050px)') && css.includes('@media (max-width: 720px)')],
  ['reduced motion boundary is present', css.includes('prefers-reduced-motion: reduce')],
  ['central customer design tokens exist', css.includes('--ff-ui-bg:') && css.includes('--ff-ui-panel:') && css.includes('--ff-ui-gold:')],
  ['Decision Intelligence runtime makes no provider request', !/\bfetch\s*\(/.test(js)],
  ['Decision Intelligence runtime does not write browser storage', !/localStorage|sessionStorage|indexedDB/i.test(js)]
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
