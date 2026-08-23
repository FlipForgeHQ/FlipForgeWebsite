import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const homepage = read('index.html');
const pricing = read('pricing.html');
const faq = read('faq.html');
const dossier = read('sample-decision-dossier.html');
const brandCss = read('assets/css/brand-v2.css');
const homepageCss = read('assets/css/homepage-focus-v1.css');
const conversionCss = read('assets/css/homepage-conversion-v2.css');
const evidenceCss = read('assets/css/homepage-evidence-v1.css');
const densityCss = read('assets/css/marketing-density-v1.css');
const dossierCss = read('assets/css/sample-dossier-v1.css');
const homepageJs = read('assets/js/homepage-v1.js');
const conversionEvents = read('assets/js/conversion-events.js');
const heroSvg = read('assets/images/flipforge-homepage-dashboard.svg');
const netlifyConfig = read('netlify.toml');
const serviceWorker = read('sw.js');
const failures = [];
const requireText = (label, text, needle) => { if (!text.includes(needle)) failures.push(`${label}: missing ${JSON.stringify(needle)}`); };
const forbidText = (label, text, needle) => { if (text.toLowerCase().includes(needle.toLowerCase())) failures.push(`${label}: forbidden ${JSON.stringify(needle)}`); };

for (const audience of ['Buyers', 'Grading planners', 'Value hunters']) requireText('homepage audience', homepage, audience);
requireText('homepage', homepage, 'Before you buy. <span>Know Why.</span>');
forbidText('homepage brand punctuation', homepage, 'Before You Buy,');
requireText('homepage', homepage, 'Try the 60-second demo');
requireText('homepage', homepage, 'id="evidence"');
requireText('homepage', homepage, 'data-ff-home-evidence="true"');
for (const evidenceNeedle of ['Evidence is the product boundary','Accepted evidence','Excluded evidence','Decision traceback','A Refractor claim cannot be supported by a Base / Unstated sale.','Supported value withheld · VERIFY']) requireText('homepage product evidence', homepage, evidenceNeedle);
requireText('homepage', homepage, 'id="sample-dossier"');
requireText('homepage', homepage, 'href="sample-decision-dossier.html"');
requireText('homepage', homepage, 'id="validation"');
for (const governedResult of ['Evidence records reviewed', 'Eligible unique sales retained', 'Records held out', 'Evidence-gate failures detected']) requireText('homepage governed audit', homepage, governedResult);
for (const governedCount of ['<strong>100</strong>', '<strong>74</strong>', '<strong>26</strong>', '<strong>18</strong>']) requireText('homepage governed audit', homepage, governedCount);
requireText('homepage governed audit', homepage, '20-case blind re-review');
requireText('homepage governed audit', homepage, '25-card prospective study');
requireText('homepage governed audit', homepage, 'Eight repeated sources were detected');
requireText('homepage governed audit boundary', homepage, 'has not authorized a public accuracy percentage');
requireText('homepage', homepage, 'A different layer of the hobby stack');
requireText('homepage', homepage, 'Illustrative · Auto preview');
requireText('homepage', homepage, 'id="demo-playback"');
requireText('homepage', homepage, 'No credit card required.');
requireText('homepage CSS', homepageCss, '.ff-audience-grid');
requireText('homepage CSS', homepageCss, '.ff-dossier-preview');
requireText('homepage CSS', homepageCss, '.ff-hero-jump-link');
requireText('homepage CSS', homepageCss, '.ff-demo-float');
forbidText('homepage CSS external font', homepageCss, 'fonts.gstatic.com');
forbidText('homepage CSS external font', homepageCss, 'font-family:Inter');
requireText('conversion CSS', conversionCss, '.ff-problem-grid');
requireText('conversion CSS', conversionCss, '.ff-validation-grid');
requireText('conversion CSS', conversionCss, '.ff-category-grid');
requireText('conversion CSS', conversionCss, '@media(prefers-reduced-motion:reduce)');
for (const evidenceStyle of ['.ff-evidence-grid','.ff-evidence-card.accepted','.ff-evidence-card.excluded','.ff-evidence-card.traceback','.ff-evidence-flow','font-size:15px']) requireText('evidence CSS', evidenceCss, evidenceStyle);

const architecture = ['id="before-after"','id="evidence"','id="sample-dossier"','id="validation"','id="try-flipforge"','id="who-its-for"','class="ff-category"','id="how-it-works"'];
let lastIndex = -1;
for (const marker of architecture) {
  const index = homepage.indexOf(marker);
  if (index < 0) failures.push(`homepage architecture: missing ${JSON.stringify(marker)}`);
  else if (index <= lastIndex) failures.push(`homepage architecture: ${JSON.stringify(marker)} is out of order`);
  lastIndex = Math.max(lastIndex,index);
}

for (const densityNeedle of ['Visual hierarchy rebalance v2','font-size:clamp(40px,4.35vw,58px)!important','font-size:clamp(37px,4vw,52px)!important','font-size:clamp(36px,3.8vw,50px)!important']) requireText('balanced marketing density', densityCss, densityNeedle);
for (const brandScaleNeedle of ['Brand-scale hierarchy v3','max-width:1600px!important','grid-template-columns:minmax(0,.52fr) minmax(720px,1.48fr)!important','width:108%!important','font-size:clamp(38px,3.7vw,52px)!important','font-size:clamp(36px,3.65vw,48px)!important','font-size:clamp(35px,3.5vw,47px)!important']) requireText('brand-scale hierarchy', brandCss, brandScaleNeedle);

requireText('homepage JavaScript', homepageJs, 'IntersectionObserver');
requireText('homepage JavaScript', homepageJs, 'prefers-reduced-motion: reduce');
requireText('homepage JavaScript', homepageJs, 'Pause preview');
requireText('homepage JavaScript', homepageJs, 'Restart demo');
requireText('homepage JavaScript', homepageJs, 'Illustrative · Final verdict');
requireText('homepage JavaScript', homepageJs, 'Decision support only. FlipForge does not authorize transactions or guarantee outcomes.');
requireText('homepage JavaScript', homepageJs, 'Confirm the parallel → replace mismatched evidence → rerun analysis.');
requireText('homepage JavaScript', homepageJs, 'finishPreview');
requireText('homepage JavaScript', homepageJs, 'promoteTryFlipForge');
requireText('homepage JavaScript', homepageJs, 'ff-mobile-demo-cta');
forbidText('homepage JavaScript layout ownership', homepageJs, 'stabilizeHeroLayout');
forbidText('homepage JavaScript layout ownership', homepageJs, 'hero.style.gridTemplateColumns');
for (const demoDiscoveryNeedle of ['See FlipForge catch a bad decision ↓','Jump to demo','Try FlipForge ↓','Try FlipForge — 60-second demo']) requireText('homepage demo discovery', homepageJs, demoDiscoveryNeedle);

for (const shellNeedle of ['normalizeMarketingShell','Launch Plans','Evidence Lab','sample_dossier_clicked','evidence_lab_clicked']) requireText('marketing shell', conversionEvents, shellNeedle);

for (const heroNeedle of ['FlipForge decision spotlight motion loop','ONE BAD CLAIM CAN CHANGE THE WHOLE DECISION.','CLAIMED: REFRACTOR','FLIPFORGE VERDICT','VERIFY','VERIFY BEFORE YOU BUY.','Before you buy. Know Why.','CARD INTELLIGENCE','M28 17','font-size:48px','font-size:16px','Hold the decision until the evidence is fixed.','Use exact verified comps only.']) requireText('hero decision spotlight', heroSvg, heroNeedle);
for (const motionNeedle of ['@keyframes claimLoop','@keyframes goodLoop','@keyframes warn1Loop','@keyframes warn2Loop','@keyframes arrowLoop','@keyframes verdictLoop','motion-res1','motion-res2','motion-res3','@media(prefers-reduced-motion:reduce)']) requireText('hero motion loop', heroSvg, motionNeedle);
requireText('hero fixed verdict panel', heroSvg, 'transform="translate(666 260)" class="font"');
forbidText('hero fixed verdict panel', heroSvg, 'class="font motion-verdict"');
forbidText('hero verdict motion', heroSvg, 'transform:scale(');
forbidText('hero readability', heroSvg, '$675');
forbidText('hero readability', heroSvg, 'ILLUSTRATIVE ASK');
forbidText('hero language', heroSvg, 'DO NOT BUY THE STORY.');
forbidText('hero brand punctuation', heroSvg, 'BEFORE YOU BUY, KNOW WHY.');

for (const pricingNeedle of ['Launch Plans','Pricing to be announced','Final package pricing has not been published.','No paid checkout and no public package pricing during private beta.']) requireText('launch plan pricing boundary', pricing, pricingNeedle);
for (const unpublishedAmount of ['$14.99','$29.99','$149','$299','Planned annual option']) {
  forbidText('unpublished package pricing', pricing, unpublishedAmount);
  forbidText('FAQ unpublished package pricing', faq, unpublishedAmount);
}
requireText('FAQ launch boundary', faq, 'Final package pricing has not been published.');
requireText('FAQ navigation', faq, '>Launch Plans</a>');

forbidText('homepage CSP', netlifyConfig, "require-trusted-types-for 'script'");
forbidText('homepage CSP', netlifyConfig, 'trusted-types default');
requireText('homepage CSP', netlifyConfig, "script-src 'self' 'sha256-wumeeI6dx0xNlGWRJpiV3jOhf8VPtf+yhn+75h8OlvI='");

requireText('service worker', serviceWorker, "const CACHE='flipforge-shell-v8'");
requireText('service worker', serviceWorker, "'/assets/css/brand-v2.css'");
requireText('service worker', serviceWorker, "'/assets/css/marketing-density-v1.css'");
requireText('service worker', serviceWorker, "'/assets/css/homepage-conversion-v2.css'");
requireText('service worker', serviceWorker, "'/assets/css/homepage-evidence-v1.css'");
requireText('service worker', serviceWorker, "'/assets/js/homepage-v1.js'");
requireText('service worker', serviceWorker, "'/assets/images/flipforge-homepage-dashboard.svg'");

for (const section of ['Identity resolution', 'Evidence chain', 'Decision output', 'Required next checks']) requireText('sample dossier', dossier, section);
for (const boundary of ['Illustrative sample', 'Not live market data', 'No transaction authority', 'Supported value', 'Withheld', 'VERIFY']) requireText('sample dossier', dossier, boundary);
requireText('sample dossier', dossier, 'not a live card evaluation');
requireText('sample dossier CSS', dossierCss, '@media print');
requireText('sample dossier CSS', dossierCss, '@media(max-width:700px)');

for (const unsafe of ['accuracy rate','guaranteed profit','trained on historical auction data','private beta spots granted weekly','automatic purchase','True Market Value','Smart Buy Indicator','Card Health Check']) forbidText('public progression', `${homepage}\n${dossier}`, unsafe);
for (const unsafeData of ['localStorage','sessionStorage','indexedDB','transactionAuthority=true']) forbidText('public progression', `${homepage}\n${dossier}\n${homepageJs}`, unsafeData);

if (failures.length) {
  console.error('Homepage proof progression validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: Evidence-first homepage architecture, CSS-owned hero layout, locked brand language, readable proof, customer-safe Decision Dossier, separate governed validation, consistent Launch Plans/Evidence Lab shell, unpublished pricing boundary, and decision-support safeguards remain complete and professional.');
