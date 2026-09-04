import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname, '..');
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

console.log(`Brand descriptor lock passed: ${DISPLAY_DESCRIPTOR}`);
