import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const homepage = read('index.html');
const product = read('product.html');
const learn = read('learn.html');
const beta = read('beta-application.html');
const pricing = read('pricing.html');
const faq = read('faq.html');
const dossier = read('sample-decision-dossier.html');
const homepageCss = read('assets/css/homepage-focus-v1.css');
const evidenceCss = read('assets/css/homepage-evidence-v1.css');
const contenderCss = read('assets/css/homepage-contender-v1.css');
const homepageJs = read('assets/js/homepage-v1.js');
const contenderJs = read('assets/js/homepage-contender-v1.js');
const conversionEvents = read('assets/js/conversion-events.js');
const netlifyConfig = read('netlify.toml');
const serviceWorker = read('sw.js');
const dossierCss = read('assets/css/sample-dossier-v1.css');
const failures = [];
const requireText = (label, text, needle) => { if (!text.includes(needle)) failures.push(`${label}: missing ${JSON.stringify(needle)}`); };
const forbidText = (label, text, needle) => { if (text.toLowerCase().includes(needle.toLowerCase())) failures.push(`${label}: forbidden ${JSON.stringify(needle)}`); };

requireText('brand', homepage, 'Before you buy. <span>Know Why.</span>');
requireText('brand category', homepage, '<div class="eyebrow">CARD INTELLIGENCE</div>');
forbidText('brand category', homepage, 'CARD VALUE INTELLIGENCE');
forbidText('brand punctuation', homepage, 'Before You Buy,');
if (homepage.includes('Before you buy. Know why.')) failures.push('brand case: lowercase why is forbidden');

for (const customerNeedle of [
  'You are the one putting money on the line.',
  'Easy buy — or is it?',
  'Know the card',
  'Know the evidence',
  'Know the next move',
  'THE ENEMY IS FALSE CONFIDENCE',
  'Does the evidence support your decision?',
  'Bring us the card you are actually thinking about buying.'
]) requireText('customer-first homepage', homepage, customerNeedle);

for (const falseConfidence of ['FALSE CONFIDENCE 01','FALSE CONFIDENCE 02','FALSE CONFIDENCE 03','FALSE CONFIDENCE 04','Wrong parallel','Stale comp','Thin evidence','Grade assumption']) requireText('False Confidence framework', homepage, falseConfidence);

requireText('hero scenario', homepage, '<small>Last comp</small><strong>$900</strong>');
requireText('hero scenario', homepage, '<small>Listed at</small><strong>$850</strong>');
requireText('hero scenario boundary', homepage, 'Illustrative decision · not live market data');
requireText('hero outcome', homepage, 'VERIFY before buying');
requireText('hero lesson', homepage, 'The listing price did not. Your confidence should.');
requireText('hero replay', homepage, 'data-replay-decision');
requireText('hero CTA', homepage, '<a class="btn primary" href="beta-application.html">Request Beta Access</a>');
requireText('hero CTA', homepage, '<a class="btn" data-demo-cta="hero" href="#try-flipforge">Challenge a decision</a>');

const primaryButtons = (homepage.match(/class="btn primary"/g)||[]).length;
if (primaryButtons !== 2) failures.push(`CTA hierarchy: expected exactly 2 homepage primary buttons, found ${primaryButtons}`);

for (const evidenceNeedle of ['id="evidence"','Evidence is the product boundary','Accepted evidence','Excluded evidence','Decision traceback','Supported value withheld · VERIFY']) requireText('homepage evidence', homepage, evidenceNeedle);
requireText('homepage dossier', homepage, 'id="sample-dossier"');
requireText('homepage dossier', homepage, 'View Sample Dossier');
forbidText('dossier CTA hierarchy', homepage, '<a class="btn primary" href="sample-decision-dossier.html">');
for (const governedResult of ['Evidence records reviewed','Eligible unique sales retained','Records held out','Evidence-gate failures detected','20-case blind re-review','25-card prospective study','has not authorized a public accuracy percentage']) requireText('governed audit', homepage, governedResult);
for (const governedCount of ['<strong>100</strong>','<strong>74</strong>','<strong>26</strong>','<strong>18</strong>']) requireText('governed audit', homepage, governedCount);

for (const demoNeedle of ['id="try-flipforge"','See one decision change when the assumptions change.','Illustrative grading scenario','2020 Panini Prizm Joe Burrow #307 · Raw','DEFINE INPUTS','id="demo-playback"']) requireText('grading demo', homepage, demoNeedle);
for (const behaviorNeedle of ['A PSA 10 cannot be the default assumption.','SCENARIO READY','MARGIN THIN','KEEP RAW','No grade guarantee']) requireText('grading behavior', homepageJs, behaviorNeedle);

requireText('beta wedge', homepage, 'Modern football rookie autos + scarce parallels');
requireText('beta wedge', homepage, 'FlipForge remains Card Intelligence for sports cards broadly');
requireText('beta page focus', beta, 'Current recruiting focus: modern football rookie autos + scarce parallels.');
requireText('beta page customer job', beta, 'Bring the card decisions that actually make you hesitate.');
requireText('beta payment boundary', beta, 'Private beta is not a paid subscription.');

requireText('product customer question', product, 'Is the premium actually supported?');
requireText('product identity', product, 'Is this the exact card?');
requireText('product evidence', product, 'Do these comps belong?');
requireText('product premium', product, 'Grade-premium intelligence');
requireText('product customer authority', product, 'You should be able to challenge the recommendation too.');

requireText('Evidence Lab positioning', learn, 'Learn to spot False Confidence before it costs you.');
requireText('Evidence Lab Busted Comp', learn, 'Busted Comp');
requireText('Evidence Lab premium', learn, 'Grade-premium decisions');
requireText('Evidence Lab outcomes', learn, 'Do not trust a decision engine because it sounds confident. Measure how its calls age.');

const architecture = [
  'class="hero ff-hero-v3 ff-conversion-hero ff-hero-customer"',
  'class="ff-customer-outcomes"',
  'class="ff-problem-band ff-false-confidence"',
  'id="before-after"',
  'id="evidence"',
  'id="sample-dossier"',
  'id="validation"',
  'id="try-flipforge"',
  'id="who-its-for"',
  'class="ff-beta-wedge"',
  'class="ff-category"',
  'id="how-it-works"',
  'id="decision-accountability"',
  'class="section home-section ff-final-cta"'
];
let lastIndex = -1;
for (const marker of architecture) {
  const index = homepage.indexOf(marker);
  if (index < 0) failures.push(`homepage architecture: missing ${JSON.stringify(marker)}`);
  else if (index <= lastIndex) failures.push(`homepage architecture: ${JSON.stringify(marker)} is out of order`);
  lastIndex = Math.max(lastIndex,index);
}

requireText('accountability', homepage, 'Day 0');
requireText('accountability', homepage, 'Day 7');
requireText('accountability', homepage, 'Day 14');
requireText('accountability', homepage, 'Day 30');
requireText('accountability', homepage, 'Did the decision age well?');
requireText('accountability boundary', homepage, 'FlipForge has not authorized a public accuracy percentage.');

requireText('customer-first CSS', contenderCss, '.ff-customer-outcomes-grid');
requireText('decision theatre CSS', contenderCss, '.ff-decision-motion');
requireText('finite staged motion', contenderCss, '@keyframes ff-stage-focus');
forbidText('finite staged motion', contenderCss, 'infinite');
requireText('reduced motion CSS', contenderCss, '@media(prefers-reduced-motion:reduce)');
requireText('reduced motion JS', contenderJs, 'prefers-reduced-motion: reduce');
requireText('replay behavior', contenderJs, "replay?.addEventListener('click',restart)");
requireText('progressive enhancement', contenderCss, '[data-reveal]{opacity:1;transform:none}');
requireText('mobile contender layout', contenderCss, '@media(max-width:520px)');
requireText('mobile hero contract', evidenceCss, 'Final homepage mobile layout contract');
requireText('mobile word wrapping', evidenceCss, 'word-break:normal');
requireText('mobile floating CTA protection', evidenceCss, '.ff-demo-float{display:none!important}');
requireText('focused hero height', homepageCss, 'min-height:auto');

for (const shellNeedle of ['normalizeMarketingShell','normalizedPath','Launch Plans','Evidence Lab','Request Beta Access']) requireText('marketing shell', conversionEvents, shellNeedle);

for (const pricingNeedle of ['Launch Plans','Pricing to be announced','Final package pricing has not been published.','No paid checkout and no public package pricing during private beta.']) requireText('launch plan pricing boundary', pricing, pricingNeedle);
for (const unpublishedAmount of ['$14.99','$29.99','$149','$299','Planned annual option']) {
  forbidText('unpublished package pricing', pricing, unpublishedAmount);
  forbidText('FAQ unpublished package pricing', faq, unpublishedAmount);
}
requireText('FAQ launch boundary', faq, 'Final package pricing has not been published.');

forbidText('homepage CSP', netlifyConfig, "require-trusted-types-for 'script'");
forbidText('homepage CSP', netlifyConfig, 'trusted-types default');
requireText('homepage CSP', netlifyConfig, "script-src 'self' 'sha256-wumeeI6dx0xNlGWRJpiV3jOhf8VPtf+yhn+75h8OlvI='");

requireText('service worker', serviceWorker, "const CACHE='flipforge-shell-v13'");
requireText('service worker contender CSS', serviceWorker, "'/assets/css/homepage-contender-v1.css'");
requireText('service worker contender JS', serviceWorker, "'/assets/js/homepage-contender-v1.js'");
requireText('service worker mobile CSS', serviceWorker, "'/assets/css/homepage-evidence-v1.css'");
requireText('service worker homepage JS', serviceWorker, "'/assets/js/homepage-v1.js'");

for (const section of ['Identity resolution','Evidence chain','Decision output','Required next checks']) requireText('sample dossier', dossier, section);
for (const boundary of ['Illustrative sample','Not live market data','No transaction authority','Supported value','Withheld','VERIFY']) requireText('sample dossier', dossier, boundary);
requireText('sample dossier', dossier, 'not a live card evaluation');
requireText('sample dossier CSS', dossierCss, '@media print');
requireText('sample dossier CSS', dossierCss, '@media(max-width:700px)');

const publicCopy = `${homepage}\n${product}\n${learn}\n${beta}\n${dossier}`;
for (const unsafe of ['accuracy rate','guaranteed profit','trained on historical auction data','private beta spots granted weekly','automatic purchase','True Market Value','Smart Buy Indicator','Card Health Check']) forbidText('public progression', publicCopy, unsafe);
for (const unsafeData of ['localStorage','sessionStorage','indexedDB','transactionAuthority=true']) forbidText('public progression', `${publicCopy}\n${homepageJs}\n${contenderJs}`, unsafeData);

if (failures.length) {
  console.error('Homepage proof progression validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: FlipForge leads with the collector decision, teaches False Confidence, demonstrates evidence qualification with finite accessible motion, keeps the football beta wedge narrow without narrowing the category, preserves governed proof and claims discipline, and keeps pricing and transaction authority bounded.');
