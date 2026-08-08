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
  if (!isWebP) throw new Error(`Decoded asset is not a valid WebP file: ${asset.output}`);
  fs.writeFileSync(path.join(outputRoot, asset.output), buffer);
  console.log(`Built ${asset.output} (${buffer.length} bytes)`);
}

const requiredBrandAssets = [
  path.join(root, 'assets', 'brand', 'flipforge-mark.svg'),
  path.join(root, 'assets', 'brand', 'flipforge-app-icon-dark.svg'),
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

// Normalize legacy visual references when they still appear, but do not force
// deep product visuals onto the marketing homepage. Product owns that depth.
const indexPath = path.join(root, 'index.html');
if (fs.existsSync(indexPath)) {
  const original = fs.readFileSync(indexPath, 'utf8');
  const navigationScript = '<script src="assets/js/section-navigation.js" defer></script>';
  let corrected = original
    .replaceAll('assets/images/grading-scenario-analysis.webp', 'assets/images/flipforge-grading-scenario.svg')
    .replaceAll('assets/images/recommendation-explorer.webp', 'assets/images/flipforge-traceback-guidance.svg')
    .replaceAll('product.html#grading', 'product.html#deep-dive');

  if (!corrected.includes('assets/js/section-navigation.js')) {
    corrected = corrected.replace(/<\/body>/i, `${navigationScript}\n</body>`);
  }
  if (corrected !== original) {
    fs.writeFileSync(indexPath, corrected, 'utf8');
    console.log('Updated homepage visual references and deterministic section navigation');
  }
}

function ensureDesktopAppLink(html) {
  if (html.includes('data-app-preview="desktop"')) return html;
  return html.replace(
    /(<nav\b[^>]*class="[^"]*\bdesktop-nav\b[^"]*"[^>]*>)([\s\S]*?)(<\/nav>)/i,
    (match, open, inner, close) => {
      const link = '<a data-app-preview="desktop" href="/app/#/dashboard">App Preview</a>';
      const cta = /(<a\b[^>]*class="[^"]*\bnav-cta\b[^"]*"[^>]*>)/i;
      const updatedInner = cta.test(inner) ? inner.replace(cta, `${link}$1`) : `${inner}${link}`;
      return `${open}${updatedInner}${close}`;
    },
  );
}

function ensureMobileAppLink(html) {
  if (html.includes('data-app-preview="mobile"')) return html;
  return html.replace(
    /(<nav\b[^>]*id="mobile-navigation"[^>]*>)([\s\S]*?)(<\/nav>)/i,
    (match, open, inner, close) => `${open}${inner}<a data-app-preview="mobile" href="/app/#/dashboard">App Preview</a>${close}`,
  );
}

function ensureFooterAppLink(html) {
  if (html.includes('data-app-preview="footer"')) return html;
  const link = '<a data-app-preview="footer" href="/app/#/dashboard">App Preview</a>';
  const exploreGroup = /(<div\b[^>]*class="[^"]*\bfooter-links\b[^"]*"[^>]*>\s*<strong>Explore<\/strong>)([\s\S]*?)(<\/div>)/i;
  const withExploreLink = html.replace(exploreGroup, (match, open, inner, close) => `${open}${inner}${link}${close}`);
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
  if (/<link\b[^>]*rel="icon"[^>]*>/i.test(html)) return html.replace(/<link\b[^>]*rel="icon"[^>]*>/i, favicon);
  return html.replace(/<\/head>/i, `${favicon}\n</head>`);
}

function ensurePerfectedBrandIdentity(html) {
  return html
    .replaceAll('Signal. Confidence. Advantage.', 'Card Value Intelligence')
    .replaceAll('SIGNAL. CONFIDENCE. ADVANTAGE.', 'CARD VALUE INTELLIGENCE')
    .replace(/<span class="wordmark">\s*FLIPFORGE™?\s*<\/span>/g, '<span class="wordmark"><span class="word-flip">FLIP</span><span class="word-forge">FORGE</span>™</span>');
}

function ensurePerfectedBrandMark(html) {
  return html
    .replaceAll('brand/v2/master/FlipForge_Icon_Transparent_DarkBG.svg', 'assets/brand/flipforge-mark.svg')
    .replaceAll('brand/v2/master/FlipForge_Icon_Transparent_LightBG.svg', 'assets/brand/flipforge-mark.svg');
}

function ensureGeistTypography(html) {
  if (html.includes('family=Geist')) return html;
  const geist = '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">';
  const inter = /<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter[^\"]*"[^>]*>/i;
  if (inter.test(html)) return html.replace(inter, geist);
  return html.replace(/<\/head>/i, `${geist}\n</head>`);
}

const htmlFiles = fs.readdirSync(root)
  .filter((name) => name.endsWith('.html'))
  .map((name) => path.join(root, name));

for (const htmlPath of htmlFiles) {
  const original = fs.readFileSync(htmlPath, 'utf8');
  let updated = ensurePerfectedBrandIdentity(original);
  updated = ensurePerfectedBrandMark(updated);
  updated = ensureGeistTypography(updated);
  updated = ensurePerfectedBrandStylesheet(updated);
  updated = ensurePerfectedBrandFavicon(updated);
  updated = ensureDesktopAppLink(updated);
  updated = ensureMobileAppLink(updated);
  updated = ensureFooterAppLink(updated);
  if (updated !== original) {
    fs.writeFileSync(htmlPath, updated, 'utf8');
    console.log(`Updated website app entry points and Brand v2 layer in ${path.basename(htmlPath)}`);
  }
}

for (const htmlPath of htmlFiles) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const page = path.basename(htmlPath);
  const hasHeader = html.includes('class="site-header"');
  if (!hasHeader) continue;

  const failures = [];
  if (!html.includes('assets/brand/flipforge-mark.svg')) failures.push('approved header mark');
  if (!html.includes('Card Value Intelligence')) failures.push('Card Value Intelligence identity line');
  if (!html.includes('assets/css/brand-v2.css')) failures.push('Brand v2 stylesheet');
  if (!html.includes('assets/brand/flipforge-app-icon-dark.svg')) failures.push('approved favicon');
  if (html.includes('Signal. Confidence. Advantage.')) failures.push('deprecated tagline removal');

  if (page === 'index.html') {
    if (!html.includes('id="see-it-work"')) failures.push('guided workflow section');
    if (!html.includes('id="why-flipforge"')) failures.push('positioning section');
    if (!html.includes('id="pricing"')) failures.push('pricing section');
    if (!html.includes('assets/js/section-navigation.js')) failures.push('deterministic section navigation');
  }

  if (page === 'product.html') {
    if (!html.includes('class="product-nav"')) failures.push('product section navigation');
    if (!html.includes('id="how-it-works"')) failures.push('product workflow');
    if (!html.includes('id="deep-dive"')) failures.push('progressive product deep dive');
    if (!html.includes('assets/images/flipforge-grading-scenario.svg')) failures.push('native grading scenario visual');
    if (!html.includes('assets/images/flipforge-traceback-guidance.svg')) failures.push('native traceback visual');
  }

  if (failures.length) throw new Error(`${page} failed Brand v2 validation: ${failures.join(', ')}`);
}

console.log(`Verified FlipForge Brand v2 integration across ${htmlFiles.length} website pages.`);
