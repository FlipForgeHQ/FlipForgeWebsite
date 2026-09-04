const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const OFFICIAL_SLOGAN = 'Before you buy. Know Why.';
const CURRENT_DESCRIPTOR = 'Card Decision Intelligence';
const CURRENT_DESCRIPTOR_DISPLAY = 'CARD DECISION INTELLIGENCE';
const RETIRED_SLOGAN_PATTERNS = [
  /Before you buy,\s*know why\./,
  /Before You Buy,\s*Know Why\.?/,
  /BEFORE YOU BUY,\s*KNOW WHY\./,
];

function requireFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Required brand file is missing: ${relativePath}`);
  }
  return absolutePath;
}

function retiredSloganVariant(content) {
  return RETIRED_SLOGAN_PATTERNS.find((pattern) => pattern.test(content));
}

function validateLockedSlogan(relativePath) {
  const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
  if (!content.includes(OFFICIAL_SLOGAN) || retiredSloganVariant(content)) {
    throw new Error(`${relativePath} must use the locked slogan exactly: ${OFFICIAL_SLOGAN}`);
  }
}

function validateWebP(relativePath) {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  const valid = bytes.length > 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!valid) throw new Error(`${relativePath} is not a browser-decodable WebP asset.`);
}

const requiredFiles = [
  'assets/brand/flipforge-mark.svg',
  'assets/brand/flipforge-logo-horizontal.svg',
  'assets/brand/flipforge-logo-stacked.svg',
  'assets/brand/flipforge-app-icon-dark.svg',
  'assets/brand/flipforge-app-icon-180.png',
  'assets/brand/flipforge-app-icon-192.png',
  'assets/brand/flipforge-app-icon-512.png',
  'assets/brand/flipforge-before-after-overlay.svg',
  'assets/fonts/geist-latin-wght-normal.woff2',
  'assets/css/brand-v2.css',
  'assets/css/homepage-decision-hero-v1.css',
  'assets/css/homepage-mobile-nav-v1.css',
  'assets/css/homepage-deal-or-decoy-v1.css',
  'assets/js/homepage-deal-or-decoy-v1.js',
  'assets/images/flipforge-homepage-hero.webp',
  'assets/images/flipforge-homepage-dashboard.svg',
  'assets/images/flipforge-grading-scenario.svg',
  'assets/images/flipforge-traceback-guidance.svg',
  'site.webmanifest',
  'index.html',
];

for (const file of requiredFiles) requireFile(file);
validateWebP('assets/images/flipforge-homepage-hero.webp');

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const homepageFailures = [];

if (!index.includes('assets/brand/flipforge-logo-horizontal.svg')) homepageFailures.push('approved horizontal logo lockup');
if (!index.includes(OFFICIAL_SLOGAN)) homepageFailures.push('locked slogan');
if (!index.includes(CURRENT_DESCRIPTOR_DISPLAY)) homepageFailures.push('Card Decision Intelligence descriptor');
if (!index.includes('<span>Before you buy.</span>') || !index.includes('<strong>Know Why.</strong>')) homepageFailures.push('immediate Know Why promise');
if (!index.includes('assets/images/flipforge-homepage-hero.webp')) homepageFailures.push('browser-decodable homepage hero');
if (!index.includes('id="deal-or-decoy"')) homepageFailures.push('interactive Deal or Decoy proof');
if (!index.includes('data-ff-choice="BUY"') || !index.includes('data-ff-choice="VERIFY"')) homepageFailures.push('decision choices');
if (index.includes('assets/images/flipforge-approved-decision-visual.webp')) homepageFailures.push('broken former decision visual removed');
if (index.includes('assets/video/flipforge-how-it-works-30s.mp4')) homepageFailures.push('mislabeled former video removed');
if (!index.includes('assets/css/homepage-decision-hero-v1.css')) homepageFailures.push('decision-first homepage stylesheet');
if (!index.includes('assets/css/homepage-mobile-nav-v1.css')) homepageFailures.push('mobile navigation stylesheet');
if (!index.includes('assets/css/homepage-deal-or-decoy-v1.css')) homepageFailures.push('Deal or Decoy stylesheet');
if (!index.includes('assets/js/homepage-deal-or-decoy-v1.js')) homepageFailures.push('Deal or Decoy behavior');
if (!index.includes('Controlled Private Beta.')) homepageFailures.push('private beta boundary');
if (!index.includes('FlipForge does not guarantee profit or authorize transactions.')) homepageFailures.push('transaction/profit boundary');
if (retiredSloganVariant(index)) homepageFailures.push('retired slogan variant removed');
if (index.includes('CARD VALUE INTELLIGENCE')) homepageFailures.push('retired Card Value Intelligence descriptor removed');
if (index.includes('FlipForge — Card Intelligence') || index.includes('FlipForge Card Intelligence')) homepageFailures.push('retired Card Intelligence brand descriptor removed');
if (['ff-decision-motion','ff-card-stage','ff-motion-console','data-replay-decision','ff-live-product-frame'].some(token=>index.includes(token))) homepageFailures.push('retired overloaded homepage theatre removed');
if (index.includes('assets/images/grading-scenario-analysis.webp')) homepageFailures.push('legacy grading WebP reference removed');
if (index.includes('assets/images/recommendation-explorer.webp')) homepageFailures.push('legacy recommendation WebP reference removed');

if (homepageFailures.length) {
  throw new Error(`Homepage brand asset validation failed: ${homepageFailures.join(', ')}`);
}

const embeddedBrandVisuals = [
  ['assets/images/flipforge-homepage-dashboard.svg', 'M28 17'],
  ['assets/images/flipforge-traceback-guidance.svg', 'M28 17'],
  ['assets/images/flipforge-grading-scenario.svg', 'M32 17'],
];

for (const [relativePath, cubePath] of embeddedBrandVisuals) {
  const svg = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const failures = [];
  if (!svg.includes(CURRENT_DESCRIPTOR_DISPLAY)) failures.push('Card Decision Intelligence descriptor');
  if (!svg.includes(cubePath)) failures.push('three-dimensional cube mark');
  if (!/font-family(?::|=")Geist/.test(svg)) failures.push('Geist typography');
  if (/Signal\. Confidence\. Advantage\.|SIGNAL\. CONFIDENCE\. ADVANTAGE\./.test(svg)) failures.push('deprecated tagline removed');
  if (/Card Value Intelligence|CARD VALUE INTELLIGENCE/.test(svg)) failures.push('retired Card Value Intelligence descriptor removed');
  if (/<rect x="(?:24|28)" y="(?:24|28)" width="8" height="8"/.test(svg)) failures.push('flat center square removed');

  if (failures.length) {
    throw new Error(`${relativePath} failed embedded brand validation: ${failures.join(', ')}`);
  }
}

validateLockedSlogan('assets/images/flipforge-traceback-guidance.svg');
validateLockedSlogan('MARKETING_VISUAL_PLAYBOOK.md');
validateLockedSlogan('saas-prototype/visual-intelligence.js');

const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
for (const filename of htmlFiles) {
  const html = fs.readFileSync(path.join(root, filename), 'utf8');
  if (!html.includes('class="site-header"')) continue;

  const failures = [];
  if (!html.includes('assets/brand/flipforge-logo-horizontal.svg')) failures.push('approved horizontal logo lockup');
  if (!html.includes(OFFICIAL_SLOGAN)) failures.push('official slogan lockup');
  if (retiredSloganVariant(html)) failures.push('retired slogan variant removed');
  if (!html.includes(CURRENT_DESCRIPTOR)) failures.push('Card Decision Intelligence identity line');
  if (html.includes('FlipForge — Card Intelligence') || html.includes('FlipForge Card Intelligence')) failures.push('retired Card Intelligence brand descriptor removed');
  if (html.includes('Card Value Intelligence') || html.includes('CARD VALUE INTELLIGENCE')) failures.push('retired Card Value Intelligence descriptor removed');
  if (!html.includes('assets/css/brand-v2.css')) failures.push('brand-v2 stylesheet');
  if (!html.includes('assets/brand/flipforge-app-icon-dark.svg')) failures.push('approved favicon');
  if (html.includes('Signal. Confidence. Advantage.')) failures.push('legacy identity line removed');
  if (html.includes('SIGNAL. CONFIDENCE. ADVANTAGE.')) failures.push('legacy uppercase identity line removed');

  if (failures.length) {
    throw new Error(`${filename} failed brand integrity validation: ${failures.join(', ')}`);
  }
}

const manifest = fs.readFileSync(path.join(root, 'site.webmanifest'), 'utf8');
for (const icon of [
  '/assets/brand/flipforge-app-icon-dark.svg',
  '/assets/brand/flipforge-app-icon-192.png',
  '/assets/brand/flipforge-app-icon-512.png',
]) {
  if (!manifest.includes(icon)) {
    throw new Error(`site.webmanifest is missing required FlipForge app icon: ${icon}`);
  }
}

const brandCss = fs.readFileSync(path.join(root, 'assets/css/brand-v2.css'), 'utf8');
if (!brandCss.includes('flipforge-before-after-overlay.svg')) {
  throw new Error('brand-v2.css is not wired to the Before/After correction overlay');
}

// Enforce the current logo descriptor in the same validation path used by Netlify.
execFileSync(process.execPath, [path.join(root, 'scripts', 'validate-card-decision-intelligence-lock.mjs')], {
  stdio: 'inherit',
});

console.log(`Brand integrity validation passed across ${htmlFiles.length} website pages.`);
