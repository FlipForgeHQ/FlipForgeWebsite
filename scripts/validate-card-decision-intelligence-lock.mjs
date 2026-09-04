import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const DISPLAY_DESCRIPTOR = 'CARD DECISION INTELLIGENCE';
const PROSE_DESCRIPTOR = 'Card Decision Intelligence';

const required = [
  'BRAND_VISUAL_LOCKED.md',
  'brand/README.md',
  'brand/v2/manifest.json',
  'assets/brand/flipforge-logo-horizontal.svg',
  'assets/brand/flipforge-logo-stacked.svg',
];

for (const relativePath of required) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Brand descriptor lock missing required file: ${relativePath}`);
  }
  const content = fs.readFileSync(absolutePath, 'utf8');
  if (!content.includes(DISPLAY_DESCRIPTOR) && !content.includes(PROSE_DESCRIPTOR)) {
    throw new Error(`${relativePath} does not contain the locked Card Decision Intelligence descriptor.`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'brand/v2/manifest.json'), 'utf8'));
if (manifest?.status !== 'APPROVED_LOCKED') {
  throw new Error('Brand manifest must remain APPROVED_LOCKED.');
}
if (manifest?.identity?.descriptor !== PROSE_DESCRIPTOR) {
  throw new Error(`Brand manifest identity descriptor must be exactly: ${PROSE_DESCRIPTOR}`);
}
if (manifest?.identity?.websiteHeader?.descriptor !== DISPLAY_DESCRIPTOR) {
  throw new Error(`Brand manifest website header descriptor must be exactly: ${DISPLAY_DESCRIPTOR}`);
}

for (const relativePath of [
  'assets/brand/flipforge-logo-horizontal.svg',
  'assets/brand/flipforge-logo-stacked.svg',
]) {
  const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
  if (!content.includes(`aria-label="${DISPLAY_DESCRIPTOR}"`)) {
    throw new Error(`${relativePath} must render the locked descriptor as accessible SVG text.`);
  }
  if (!content.includes('Before you buy. Know Why.')) {
    throw new Error(`${relativePath} must retain the locked tagline.`);
  }
}

// These are current customer/operator/marketing surfaces, not historical records or
// internal product-module names. The deploy build must leave every one on the current
// brand descriptor. This intentionally does not ban generic product uses of the phrase
// "Card Intelligence" elsewhere in the codebase.
const currentSurfaces = [
  ['index.html', DISPLAY_DESCRIPTOR],
  ['operator-beta.html', PROSE_DESCRIPTOR],
  ['saas-prototype/index.html', DISPLAY_DESCRIPTOR],
  ['assets/js/marketing-v3.js', DISPLAY_DESCRIPTOR],
  ['saas-prototype/consumer-ux-refinement.js', DISPLAY_DESCRIPTOR],
  ['saas-prototype/commercial-app-polish-v2.js', DISPLAY_DESCRIPTOR],
  ['identity-emails/invitation.html', PROSE_DESCRIPTOR],
  ['assets/interactive/flipforge-know-why.html', DISPLAY_DESCRIPTOR],
  ['assets/images/flipforge-homepage-dashboard.svg', DISPLAY_DESCRIPTOR],
  ['assets/images/flipforge-traceback-guidance.svg', DISPLAY_DESCRIPTOR],
  ['assets/images/flipforge-grading-scenario.svg', DISPLAY_DESCRIPTOR],
  ['docs/BRAND_SYSTEM_V2.md', DISPLAY_DESCRIPTOR],
];

for (const [relativePath, expected] of currentSurfaces) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Current brand surface is missing: ${relativePath}`);
  const content = fs.readFileSync(absolutePath, 'utf8');
  if (!content.includes(expected)) {
    throw new Error(`${relativePath} is missing current brand descriptor: ${expected}`);
  }
}

const retiredBrandPatterns = [
  'FlipForge — Card Intelligence',
  'FlipForge Card Intelligence',
  'FlipForge | Card Intelligence',
  '<span class="brand-subtitle">CARD INTELLIGENCE</span>',
  '<div class="descriptor">CARD INTELLIGENCE</div>',
  "node.textContent='CARD INTELLIGENCE'",
  'node.textContent="CARD INTELLIGENCE"',
  'subtitle.textContent = "CARD INTELLIGENCE"',
];

for (const [relativePath] of currentSurfaces) {
  const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
  for (const retired of retiredBrandPatterns) {
    if (content.includes(retired)) {
      throw new Error(`${relativePath} still contains retired brand context: ${retired}`);
    }
  }
}

console.log(`Brand descriptor lock passed across current surfaces: ${DISPLAY_DESCRIPTOR}`);
