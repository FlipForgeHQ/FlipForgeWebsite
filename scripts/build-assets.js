const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'assets', 'source');
const outputRoot = path.join(root, 'assets', 'images');

const assets = [
  {
    output: 'before-after-flipforge.webp',
    readBase64() {
      const chunkDir = path.join(sourceRoot, 'before-after-flipforge');
      return fs.readdirSync(chunkDir)
        .filter((name) => name.endsWith('.b64'))
        .sort()
        .map((name) => fs.readFileSync(path.join(chunkDir, name), 'utf8').trim())
        .join('');
    },
  },
];

fs.mkdirSync(outputRoot, { recursive: true });

for (const asset of assets) {
  const buffer = Buffer.from(asset.readBase64(), 'base64');
  const isWebP =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if (!isWebP) {
    throw new Error(`Decoded asset is not a valid WebP file: ${asset.output}`);
  }

  fs.writeFileSync(path.join(outputRoot, asset.output), buffer);
  console.log(`Built ${asset.output} (${buffer.length} bytes)`);
}

const requiredBrandAssets = [
  path.join(root, 'assets', 'brand', 'flipforge-mark.svg'),
  path.join(root, 'assets', 'brand', 'flipforge-logo-horizontal.svg'),
  path.join(root, 'assets', 'brand', 'flipforge-logo-stacked.svg'),
  path.join(root, 'assets', 'brand', 'flipforge-app-icon-dark.svg'),
  path.join(root, 'assets', 'fonts', 'geist-latin-wght-normal.woff2'),
  path.join(root, 'assets', 'css', 'brand-v2.css'),
  path.join(root, 'assets', 'js', 'section-navigation.js'),
  path.join(root, 'assets', 'images', 'flipforge-grading-scenario.svg'),
  path.join(root, 'assets', 'images', 'flipforge-traceback-guidance.svg'),
];

for (const brandAsset of requiredBrandAssets) {
  if (!fs.existsSync(brandAsset)) {
    throw new Error(`Required perfected brand asset is missing: ${path.relative(root, brandAsset)}`);
  }
}

// Earlier generated WebP visuals can decode successfully but still fail to paint
// in some browser/Netlify combinations. Use native branded SVGs for the grading
// and traceback panels wherever those legacy homepage references still exist.
// Also install deterministic fragment navigation so direct #section URLs and
// homepage section links align beneath the sticky header after layout completes.
const indexPath = path.join(root, 'index.html');
if (fs.existsSync(indexPath)) {
  const original = fs.readFileSync(indexPath, 'utf8');
  const navigationScript = '<script src="assets/js/section-navigation.js" defer></script>';
  let corrected = original
    .replaceAll(
      'assets/images/grading-scenario-analysis.webp',
      'assets/images/flipforge-grading-scenario.svg',
    )
    .replaceAll(
      'assets/images/recommendation-explorer.webp',
      'assets/images/flipforge-traceback-guidance.svg',
    );

  if (!corrected.includes('assets/js/section-navigation.js')) {
    corrected = corrected.replace(/<\/body>/i, `${navigationScript}\n</body>`);
  }

  if (corrected !== original) {
    fs.writeFileSync(indexPath, corrected, 'utf8');
    console.log('Updated homepage decision visuals and deterministic section navigation');
  }
}

function ensureDesktopAppLink(html) {
  if (html.includes('data-app-preview="desktop"')) return html;

  return html.replace(
    /(<nav\b[^>]*class="[^"]*\bdesktop-nav\b[^"]*"[^>]*>)([\s\S]*?)(<\/nav>)/i,
    (match, open, inner, close) => {
      const link = '<a data-app-preview="desktop" href="/app/#/dashboard">App Preview</a>';
      const cta = /(<a\b[^>]*class="[^"]*\bnav-cta\b[^"]*"[^>]*>)/i;
      const updatedInner = cta.test(inner)
        ? inner.replace(cta, `${link}$1`)
        : `${inner}${link}`;
      return `${open}${updatedInner}${close}`;
    },
  );
}

function ensureMobileAppLink(html) {
  if (html.includes('data-app-preview="mobile"')) return html;

  return html.replace(
    /(<nav\b[^>]*id="mobile-navigation"[^>]*>)([\s\S]*?)(<\/nav>)/i,
    (match, open, inner, close) =>
      `${open}${inner}<a data-app-preview="mobile" href="/app/#/dashboard">App Preview</a>${close}`,
  );
}

function ensureFooterAppLink(html) {
  if (html.includes('data-app-preview="footer"')) return html;

  const link = '<a data-app-preview="footer" href="/app/#/dashboard">App Preview</a>';
  const exploreGroup = /(<div\b[^>]*class="[^"]*\bfooter-links\b[^"]*"[^>]*>\s*<strong>Explore<\/strong>)([\s\S]*?)(<\/div>)/i;
  const withExploreLink = html.replace(
    exploreGroup,
    (match, open, inner, close) => `${open}${inner}${link}${close}`,
  );

  if (withExploreLink !== html) return withExploreLink;

  return html.replace(
    /(<div\b[^>]*class="[^"]*\bfooter-links\b[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/i,
    (match, open, inner, close) => `${open}${inner}${link}${close}`,
  );
}

function ensurePerfectedBrandStylesheet(html) {
  if (html.includes('assets/css/brand-v2.css')) return html;

  return html.replace(
    /(<link\b[^>]*href="assets\/css\/site\.css"[^>]*>)/i,
    '$1\n<link rel="stylesheet" href="assets/css/brand-v2.css">',
  );
}

function ensurePerfectedBrandFavicon(html) {
  const favicon = '<link rel="icon" href="assets/brand/flipforge-app-icon-dark.svg" type="image/svg+xml">';
  if (html.includes('href="assets/brand/flipforge-app-icon-dark.svg"')) return html;

  if (/<link\b[^>]*rel="icon"[^>]*>/i.test(html)) {
    return html.replace(/<link\b[^>]*rel="icon"[^>]*>/i, favicon);
  }

  return html.replace(/<\/head>/i, `${favicon}\n</head>`);
}

function ensurePerfectedBrandIdentity(html) {
  return html
    .replaceAll('Signal. Confidence. Advantage.', 'Card Intelligence')
    .replaceAll('SIGNAL. CONFIDENCE. ADVANTAGE.', 'CARD INTELLIGENCE')
    .replaceAll('Card Value Intelligence', 'Card Intelligence')
    .replaceAll('CARD VALUE INTELLIGENCE', 'CARD INTELLIGENCE')
    .replaceAll('Before you buy, know why.', 'Before you buy. Know Why.')
    .replaceAll('Before You Buy, Know Why', 'Before you buy. Know Why.');
}

function removeRetiredRemoteFontImports(html) {
  return html.replace(
    /\s*<link\b[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/gi,
    '\n',
  );
}

function ensureApprovedBrandLockups(html) {
  const lockup = '<img class="brand-lockup" src="assets/brand/flipforge-logo-horizontal.svg" alt="FlipForge — Card Intelligence — Before you buy. Know Why.">';
  return html.replace(
    /(<a\b[^>]*class="[^"]*\bbrand\b[^"]*"[^>]*>)[\s\S]*?(<\/a>)/gi,
    (match, open, close) => `${open}${lockup}${close}`,
  );
}

// Keep the public website and the browser app connected without replacing the
// marketing homepage. Netlify exposes the isolated prototype at /app/ through
// _redirects; the build adds a consistent entry point and approved brand layer
// across every root website page.
const htmlFiles = fs.readdirSync(root)
  .filter((name) => name.endsWith('.html'))
  .map((name) => path.join(root, name));

for (const htmlPath of htmlFiles) {
  const original = fs.readFileSync(htmlPath, 'utf8');
  let updated = ensurePerfectedBrandIdentity(original);

  if (path.basename(htmlPath) !== 'font-options.html') {
    updated = removeRetiredRemoteFontImports(updated);
  }
  updated = ensureApprovedBrandLockups(updated);
  updated = ensurePerfectedBrandStylesheet(updated);
  updated = ensurePerfectedBrandFavicon(updated);
  updated = ensureDesktopAppLink(updated);
  updated = ensureMobileAppLink(updated);
  updated = ensureFooterAppLink(updated);

  if (updated !== original) {
    fs.writeFileSync(htmlPath, updated, 'utf8');
    console.log(`Updated website app entry points and perfected brand layer in ${path.basename(htmlPath)}`);
  }
}

for (const htmlPath of htmlFiles) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const hasHeader = html.includes('class="site-header"');

  if (!hasHeader) continue;

  const failures = [];
  if (!html.includes('assets/brand/flipforge-logo-horizontal.svg')) failures.push('approved horizontal logo lockup');
  if (!html.includes('Before you buy. Know Why.')) failures.push('official slogan lockup');
  if (!html.includes('Card Intelligence')) failures.push('Card Intelligence identity line');
  if (html.includes('Card Value Intelligence') || html.includes('CARD VALUE INTELLIGENCE')) failures.push('retired Card Value Intelligence descriptor removed');
  if (!html.includes('assets/css/brand-v2.css')) failures.push('perfected brand stylesheet');
  if (!html.includes('assets/brand/flipforge-app-icon-dark.svg')) failures.push('approved favicon');
  if (html.includes('Signal. Confidence. Advantage.')) failures.push('deprecated tagline removal');

  if (path.basename(htmlPath) === 'index.html') {
    if (!html.includes('assets/images/flipforge-homepage-dashboard.svg')) failures.push('homepage dashboard visual');
    if (!html.includes('ff-home-focused')) failures.push('focused homepage class');
    if (!html.includes('assets/css/marketing-v3.css')) failures.push('static marketing stylesheet');
    if (!html.includes('assets/css/homepage-focus-v1.css')) failures.push('static homepage focus stylesheet');
    if (!html.includes('assets/js/section-navigation.js')) failures.push('deterministic section navigation');
  }

  if (failures.length) {
    throw new Error(`${path.basename(htmlPath)} failed perfected brand validation: ${failures.join(', ')}`);
  }
}

console.log(`Verified perfected FlipForge brand integration across ${htmlFiles.length} website pages.`);
