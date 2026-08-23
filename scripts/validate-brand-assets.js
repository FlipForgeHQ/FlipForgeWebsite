const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function requireFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Required brand file is missing: ${relativePath}`);
  }
  return absolutePath;
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
  'assets/images/flipforge-homepage-dashboard.svg',
  'assets/images/flipforge-grading-scenario.svg',
  'assets/images/flipforge-traceback-guidance.svg',
  'site.webmanifest',
  'index.html',
];

for (const file of requiredFiles) requireFile(file);

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const homepageFailures = [];

if (!index.includes('assets/images/flipforge-homepage-dashboard.svg')) {
  homepageFailures.push('homepage dashboard visual');
}
if (!index.includes('class="hero ff-hero-v3')) {
  homepageFailures.push('static focused hero');
}
if (!index.includes('ff-home-focused')) {
  homepageFailures.push('focused homepage class');
}
if (!index.includes('assets/css/marketing-v3.css')) {
  homepageFailures.push('static marketing stylesheet');
}
if (!index.includes('assets/css/homepage-focus-v1.css')) {
  homepageFailures.push('static homepage focus stylesheet');
}
if (!index.includes('assets/css/homepage-conversion-v2.css')) {
  homepageFailures.push('conversion homepage stylesheet');
}
if (index.includes('assets/images/grading-scenario-analysis.webp')) {
  homepageFailures.push('legacy grading WebP reference removed');
}
if (index.includes('assets/images/recommendation-explorer.webp')) {
  homepageFailures.push('legacy recommendation WebP reference removed');
}

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
  if (!svg.includes('CARD INTELLIGENCE')) failures.push('Card Intelligence descriptor');
  if (!svg.includes(cubePath)) failures.push('three-dimensional cube mark');
  if (!/font-family(?::|=")Geist/.test(svg)) failures.push('Geist typography');
  if (/Signal\. Confidence\. Advantage\.|SIGNAL\. CONFIDENCE\. ADVANTAGE\./.test(svg)) failures.push('deprecated tagline removed');
  if (/Card Value Intelligence|CARD VALUE INTELLIGENCE/.test(svg)) failures.push('retired descriptor removed');
  if (/<rect x="(?:24|28)" y="(?:24|28)" width="8" height="8"/.test(svg)) failures.push('flat center square removed');

  if (failures.length) {
    throw new Error(`${relativePath} failed embedded brand validation: ${failures.join(', ')}`);
  }
}

const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
for (const filename of htmlFiles) {
  const html = fs.readFileSync(path.join(root, filename), 'utf8');
  if (!html.includes('class="site-header"')) continue;

  const failures = [];
  if (!html.includes('assets/brand/flipforge-logo-horizontal.svg')) failures.push('approved horizontal logo lockup');
  if (!html.includes('Before you buy. Know Why.')) failures.push('official slogan lockup');
  if (!html.includes('Card Intelligence')) failures.push('Card Intelligence identity line');
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

console.log(`Brand integrity validation passed across ${htmlFiles.length} website pages.`);
