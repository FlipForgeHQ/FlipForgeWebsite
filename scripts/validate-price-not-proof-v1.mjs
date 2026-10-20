import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
const home = read('index.html');
const lab = read('learn.html');
const decision = read('decision-intelligence.html');
const css = read('assets/css/price-not-proof-v1.css');
const app = read('saas-prototype/index.html');

const expectations = [
  ['homepage message', home.includes('<strong>Price is not proof.</strong>')],
  ['homepage links to existing Evidence Lab', home.includes('href="learn.html#busted-comp">Why price alone can mislead')],
  ['homepage existing hero stays', home.includes('Start deciding with <em>evidence.</em>')],
  ['homepage existing film stays', home.includes('id="film" data-reveal')],
  ['homepage existing decision forge stays', home.includes('id="decision-forge" data-decision-forge')],
  ['decision page example intact', decision.includes('data-ff-dic-demo')],
  ['decision page educational link', decision.includes('href="learn.html#busted-comp">Evidence Lab')],
  ['six evidence case expanders', (lab.match(/class="ff-pnp-case-review"/g) || []).length === 6],
  ['all six exact case identifiers', ['case-wrong-parallel','case-thin-sale','case-grade','case-stale','case-asking','case-scarcity'].every(id => lab.includes('id="' + id + '"'))],
  ['native keyboard details and summaries', (lab.match(/<details class="ff-pnp-case-review"/g)||[]).length === (lab.match(/<summary>/g)||[]).length],
  ['sourced identity', lab.includes('https://upperdeck.com/checklist/2024-25-ud-series-1-hockey-checklist/')],
  ['sourced pricing and recency', lab.includes('https://www.psacard.com/articles/articleview/3546/a-note-about-sportscard-pricing')],
  ['sourced grading', lab.includes('https://www.psacard.com/gradingstandards')],
  ['sourced eBay', lab.includes('https://www.ebay.com/help/selling/selling-tools/terapeak-research-and-SEO?id=4853')],
  ['sourced population', lab.includes('https://www.psacard.com/articles/articleview/3631/market-report-population-perspective')],
  ['explicit illustrative amount disclosure', lab.includes('The $900 and $850 amounts above are fictional teaching figures')],
  ['source limitations explained', lab.includes('They do not endorse FlipForge')],
  ['existing source-of-truth decision proof separated', lab.includes('FlipForge\'s own Decision Proof methodology is separately documented.')],
  ['sources reachable from learning directory', lab.includes('href="#sources">05 · Sources</a>')],
  ['no third-party network runtime or scraping', !/fetch\(|XMLHttpRequest|iframe src=/.test(lab)],
  ['CSS honors reduced motion', css.includes('@media(prefers-reduced-motion:reduce)')],
  ['CSS retains mobile single-column layout', css.includes('.ff-pnp-source-grid{grid-template-columns:1fr}')],
  ['customer app left as live app entry', app.includes('FlipForgePrivateBetaEntry') && !app.includes('src="mock-data.js"')]
];
let passed = 0;
for (const [label, ok] of expectations) {
  if (ok) passed++;
  else console.error('FAIL: ' + label);
}
assert.equal(passed, expectations.length, passed + '/' + expectations.length + ' checks passed');
console.log('PASS: Price Is Not Proof integration: '+passed+'/'+expectations.length+'; no layout replacement or customer-app mutation.');
