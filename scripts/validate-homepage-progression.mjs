import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const homepage = read('index.html');
const dossier = read('sample-decision-dossier.html');
const homepageCss = read('assets/css/homepage-focus-v1.css');
const conversionCss = read('assets/css/homepage-conversion-v2.css');
const dossierCss = read('assets/css/sample-dossier-v1.css');
const homepageJs = read('assets/js/homepage-v1.js');
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
requireText('homepage', homepage, '100-case');
requireText('homepage', homepage, '20-case');
requireText('homepage', homepage, 'No invented claims');
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

// Hero engagement and Try FlipForge discovery are deliberate conversion controls.
for (const heroNeedle of [
  'See FlipForge catch a bad decision ↓',
  'Jump to demo',
  'Try FlipForge ↓',
  'Decision spotlight',
  'One bad claim can change the whole decision.',
  'Claimed: Refractor',
  'FlipForge verdict · VERIFY',
  'Do not buy the story.',
  'Try this decision flow ↓',
  'See FlipForge catch a bad decision in four steps.'
]) requireText('homepage hero refresh', homepageJs, heroNeedle);

// Production homepage hardening must remain compatible with the current Netlify Identity client.
forbidText('homepage CSP', netlifyConfig, "require-trusted-types-for 'script'");
forbidText('homepage CSP', netlifyConfig, 'trusted-types default');
requireText('homepage CSP', netlifyConfig, "script-src 'self' 'sha256-wumeeI6dx0xNlGWRJpiV3jOhf8VPtf+yhn+75h8OlvI='");

// The installable shell must cache the rebuilt homepage, not the pre-conversion asset set.
requireText('service worker', serviceWorker, "const CACHE='flipforge-shell-v2'");
requireText('service worker', serviceWorker, "'/assets/css/homepage-conversion-v2.css'");
requireText('service worker', serviceWorker, "'/assets/js/homepage-v1.js'");

for (const section of ['Identity resolution', 'Evidence chain', 'Decision output', 'Required next checks']) requireText('sample dossier', dossier, section);
for (const boundary of ['Illustrative sample', 'Not live market data', 'No transaction authority', 'Supported value', 'Withheld', 'VERIFY']) requireText('sample dossier', dossier, boundary);
requireText('sample dossier', dossier, 'not a live card evaluation');
requireText('sample dossier CSS', dossierCss, '@media print');
requireText('sample dossier CSS', dossierCss, '@media(max-width:700px)');

for (const unsafe of ['accuracy rate', 'guaranteed profit', 'trained on historical auction data', 'private beta spots granted weekly', 'automatic purchase']) {
  forbidText('public progression', `${homepage}\n${dossier}`, unsafe);
}
for (const unsafeData of ['localStorage', 'sessionStorage', 'indexedDB', 'transactionAuthority=true']) {
  forbidText('public progression', `${homepage}\n${dossier}\n${homepageJs}`, unsafeData);
}

if (failures.length) {
  console.error('Homepage proof progression validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: Conversion-led homepage, stronger hero engagement, easy Try FlipForge discovery, verdict-stop demo behavior, local decision boundaries, Identity-compatible CSP, current PWA shell, and customer-safe Decision Dossier remain complete and evidence-safe.');
