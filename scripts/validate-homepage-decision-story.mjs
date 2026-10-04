import fs from 'node:fs';

/* Signature homepage governance. The old floating-price template and its
 * one-off CSS contract are intentionally retired; essential safety, proof,
 * navigation, accessibility and motion contracts remain enforceable. */
const read = p => fs.readFileSync(p, 'utf8');
const html = read('index.html');
const css = read('assets/css/homepage-signature-v1.css');
const js = read('assets/js/homepage-signature-v1.js');
const slab = read('assets/images/ff-signature-slab-v1.svg');
const failures = [];
const check = (label, condition) => { if (!condition) failures.push(label); };
const has = needle => html.includes(needle);
const inOrder = tokens => tokens.every((token, i) =>
  i === 0 || html.indexOf(tokens[i - 1]) < html.indexOf(token));

check('Approved Information → Trust → Decisions pillars are explicitly visible',
  has('INFORMATION <span') && has('TRUST <span') && has('DECISIONS</p>'));
check('Opening preserves original FlipForge product promise and brand lock',
  has('CARD DECISION INTELLIGENCE™') &&
  has('A decision you can not only trust, but understand.') &&
  has('Before you buy. Know Why.') &&
  has('assets/brand/flipforge-logo-horizontal.svg'));
check('A bespoke original illustrative asset replaces miniature dashboard artwork',
  has('ff-signature-stage') &&
  has('assets/images/ff-signature-slab-v1.svg') &&
  slab.includes('ILLUSTRATIVE CARD') &&
  slab.includes('IDENTITY FIRST') &&
  slab.includes('Not a real graded or marketed card'));
check('Card animation teaches identity, filtering and decision rather than generic chart movement',
  has('ff-sig-scan') && has('ff-sig-evidence--a') &&
  has('ff-sig-evidence--c is-invalid') &&
  has('DECISION WITH REASONS') &&
  has('Uncertainty visible.') &&
  js.includes('Wrong matches and duplicates do not get a vote.'));
check('The cinematic hero is not a two-column bordered pricing template',
  !has('ff-ds-stage') && !has('ff-ds-prices') &&
  !has('id="information-trust-decisions"'));
check('The homepage maintains the original film and five-stage decision explainer',
  has('id="film"') && has('data-film') &&
  has('id="decision-forge"') && has('data-decision-forge') &&
  (html.match(/data-forge-step/g) || []).length === 5);
check('Hero precedes introduction film and guided process',
  inOrder(['ff-signature-hero', 'id="film"', 'id="decision-forge"']));
check('Illustrative numbers and limitations remain visible without JavaScript',
  has('ff-approved-data-summary') &&
  has('7 CANDIDATES → 2 QUALIFIED') &&
  has('2.3% supported gap') &&
  has('EXACT CARD VERIFIED') &&
  has('<noscript>') && has('Illustrative outcome: VERIFY.'));
check('Replay button has an actual event handler',
  has('data-ff-sig-replay') &&
  js.includes("replay?.addEventListener('click'") &&
  js.includes('sequence(0)'));
check('Motion respects reduced-motion preferences, tab navigation and page visibility',
  css.includes('@media(prefers-reduced-motion:reduce)') &&
  js.includes('prefers-reduced-motion: reduce') &&
  js.includes("visibilitychange") &&
  has('aria-label="Replay the FlipForge intelligence demonstration"'));
check('Animations use no background provider calls or browser storage',
  !/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/.test(js) &&
  !/localStorage|sessionStorage|indexedDB|scrollIntoView/.test(js));
check('All preview-specific rules are scoped to public homepage only',
  css.includes('html body.ff-home-visual-review') &&
  has('class="ff-home-visual-review"') &&
  !html.includes('homepage-decision-story-v1.css') &&
  has('assets/css/homepage-signature-v1.css') &&
  has('assets/js/homepage-signature-v1.js'));
check('Core CTA, beta sign-in and product navigation survive',
  has('href="beta-application.html">Request Beta Access</a>') &&
  has('data-ff-marketing-sign-in') &&
  has('href="decision-intelligence.html"') &&
  has('href="learn.html"'));
check('No forbidden inline styles in the new composition', !/\sstyle\s*=/.test(html));
check('Marketing does not claim verified competition wins, accuracy or trading authority',
  !/outperforms\s+all\s+competitors|\b\d+%\s+(?:more accurate|better|faster)\b/i.test(html) &&
  has('FlipForge does not guarantee profit or authorize transactions.'));
check('No athlete name, real brand impersonation or real-looking exact sale evidence in slab',
  !/(Michael Jordan|Mahomes|Ohtani|Burrow|Topps|Panini|Fleer|PSA)/i.test(slab) &&
  !/verified exact sales|actual sale|live price/.test(slab));

if (failures.length) {
  console.error('FlipForge signature decision-story validation failed:');
  failures.forEach(failure => console.error('- ' + failure));
  process.exitCode = 1;
} else {
  console.log('PASS: 16 signature-homepage governance checks.');
}
