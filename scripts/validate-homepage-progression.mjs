import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const homepage = read('index.html');
const pricing = read('pricing.html');
const dossier = read('sample-decision-dossier.html');
const homepageCss = read('assets/css/homepage-focus-v1.css');
const conversionCss = read('assets/css/homepage-conversion-v2.css');
const dossierCss = read('assets/css/sample-dossier-v1.css');
const homepageJs = read('assets/js/homepage-v1.js');
const heroSvg = read('assets/images/flipforge-homepage-dashboard.svg');
const netlifyConfig = read('netlify.toml');
const serviceWorker = read('sw.js');
const failures = [];
const requireText = (label, text, needle) => { if (!text.includes(needle)) failures.push(`${label}: missing ${JSON.stringify(needle)}`); };
const forbidText = (label, text, needle) => { if (text.toLowerCase().includes(needle.toLowerCase())) failures.push(`${label}: forbidden ${JSON.stringify(needle)}`); };

for (const audience of ['Collectors', 'Grading planners', 'Value-conscious buyers']) requireText('homepage audience', homepage, audience);
requireText('homepage', homepage, 'Before you buy. <span>Know Why.</span>');
forbidText('homepage brand punctuation', homepage, 'Before You Buy,');
requireText('homepage', homepage, 'Try the 60-second demo');
requireText('homepage', homepage, 'id="sample-dossier"');
requireText('homepage', homepage, 'href="sample-decision-dossier.html"');
requireText('homepage', homepage, 'id="validation"');
for (const governedResult of ['Evidence records reviewed', 'Eligible unique sales retained', 'Records held out', 'Evidence-gate failures detected']) requireText('homepage governed audit', homepage, governedResult);
for (const governedCount of ['<strong>100</strong>', '<strong>74</strong>', '<strong>26</strong>', '<strong>18</strong>']) requireText('homepage governed audit', homepage, governedCount);
requireText('homepage governed audit', homepage, '20-case blind re-review');
requireText('homepage governed audit', homepage, '25-card prospective study');
requireText('homepage governed audit', homepage, '8 repeated sources were detected');
requireText('homepage governed audit boundary', homepage, 'has not authorized a public accuracy percentage');
requireText('homepage', homepage, 'A different layer of the hobby stack');
requireText('homepage', homepage, 'Illustrative · Auto preview');
requireText('homepage', homepage, 'id="demo-playback"');
requireText('homepage CSS', homepageCss, '.ff-audience-grid');
requireText('homepage CSS', homepageCss, '.ff-dossier-preview');
requireText('conversion CSS', conversionCss, '.ff-problem-grid');
requireText('conversion CSS', conversionCss, '.ff-validation-grid');
requireText('conversion CSS', conversionCss, '.ff-category-grid');
requireText('conversion CSS', conversionCss, '@media(prefers-reduced-motion:reduce)');

requireText('homepage JavaScript', homepageJs, 'IntersectionObserver');
requireText('homepage JavaScript', homepageJs, 'prefers-reduced-motion: reduce');
requireText('homepage JavaScript', homepageJs, 'Pause preview');
requireText('homepage JavaScript', homepageJs, 'Restart demo');
requireText('homepage JavaScript', homepageJs, 'Illustrative · Final verdict');
requireText('homepage JavaScript', homepageJs, 'Decision support only. FlipForge does not authorize transactions or guarantee outcomes.');
requireText('homepage JavaScript', homepageJs, 'Confirm the parallel → replace mismatched evidence → rerun analysis.');
requireText('homepage JavaScript', homepageJs, 'finishPreview');
requireText('homepage JavaScript', homepageJs, 'stabilizeHeroLayout');
requireText('homepage JavaScript', homepageJs, 'window.innerWidth<=1320');
for (const demoDiscoveryNeedle of ['See FlipForge catch a bad decision ↓','Jump to demo','Try FlipForge ↓','See FlipForge catch a bad decision in four steps.','Try FlipForge — 60-second demo']) requireText('homepage demo discovery', homepageJs, demoDiscoveryNeedle);

for (const heroNeedle of ['FlipForge decision spotlight motion loop','ONE BAD CLAIM CAN CHANGE THE WHOLE DECISION.','CLAIMED: REFRACTOR','FLIPFORGE VERDICT','VERIFY','VERIFY BEFORE YOU BUY.','Before you buy. Know Why.','CARD INTELLIGENCE','M28 17']) requireText('hero decision spotlight', heroSvg, heroNeedle);
for (const motionNeedle of ['@keyframes claimLoop','@keyframes goodLoop','@keyframes warn1Loop','@keyframes warn2Loop','@keyframes arrowLoop','@keyframes verdictLoop','motion-res1','motion-res2','motion-res3','@media(prefers-reduced-motion:reduce)']) requireText('hero motion loop', heroSvg, motionNeedle);
requireText('hero fixed verdict panel', heroSvg, 'transform="translate(666 260)" class="font"');
forbidText('hero fixed verdict panel', heroSvg, 'class="font motion-verdict"');
forbidText('hero verdict motion', heroSvg, 'transform:scale(');
forbidText('hero language', heroSvg, 'DO NOT BUY THE STORY.');
forbidText('hero brand punctuation', heroSvg, 'BEFORE YOU BUY, KNOW WHY.');

for (const pricingNeedle of ['Launch Plans','Pricing to be announced','Final package pricing has not been published.','No paid checkout and no public package pricing during private beta.']) requireText('launch plan pricing boundary', pricing, pricingNeedle);
for (const unpublishedAmount of ['$14.99','$29.99','$149','$299','Planned annual option']) forbidText('unpublished package pricing', pricing, unpublishedAmount);

forbidText('homepage CSP', netlifyConfig, "require-trusted-types-for 'script'");
forbidText('homepage CSP', netlifyConfig, 'trusted-types default');
requireText('homepage CSP', netlifyConfig, "script-src 'self' 'sha256-wumeeI6dx0xNlGWRJpiV3jOhf8VPtf+yhn+75h8OlvI='");

requireText('service worker', serviceWorker, "const CACHE='flipforge-shell-v5'");
requireText('service worker', serviceWorker, "'/assets/css/homepage-conversion-v2.css'");
requireText('service worker', serviceWorker, "'/assets/js/homepage-v1.js'");
requireText('service worker', serviceWorker, "'/assets/images/flipforge-homepage-dashboard.svg'");

for (const section of ['Identity resolution', 'Evidence chain', 'Decision output', 'Required next checks']) requireText('sample dossier', dossier, section);
for (const boundary of ['Illustrative sample', 'Not live market data', 'No transaction authority', 'Supported value', 'Withheld', 'VERIFY']) requireText('sample dossier', dossier, boundary);
requireText('sample dossier', dossier, 'not a live card evaluation');
requireText('sample dossier CSS', dossierCss, '@media print');
requireText('sample dossier CSS', dossierCss, '@media(max-width:700px)');

for (const unsafe of ['accuracy rate', 'guaranteed profit', 'trained on historical auction data', 'private beta spots granted weekly', 'automatic purchase']) forbidText('public progression', `${homepage}\n${dossier}`, unsafe);
for (const unsafeData of ['localStorage', 'sessionStorage', 'indexedDB', 'transactionAuthority=true']) forbidText('public progression', `${homepage}\n${dossier}\n${homepageJs}`, unsafeData);

if (failures.length) {
  console.error('Homepage proof progression validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: Homepage brand language, responsive hero containment, position-safe looping decision spotlight, easy Try FlipForge discovery, unpublished package-pricing boundary, verdict-stop demo behavior, governed validation framing, and customer-safe Decision Dossier remain complete and evidence-safe.');