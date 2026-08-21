const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'assets', 'source');
const imagesDir = path.join(root, 'assets', 'images');
const iconPath = path.join(root, 'assets', 'brand', 'flipforge-app-icon-dark.svg');
const brandStylesheet = 'assets/css/brand-v2.css';
const sectionNavigationScript = 'assets/js/section-navigation.js';
const appPath = '/app/';

function decodeBase64Parts(dirPath) {
  return fs.readdirSync(dirPath)
    .filter((name) => name.endsWith('.b64'))
    .sort()
    .map((name) => fs.readFileSync(path.join(dirPath, name), 'utf8').replace(/\s+/g, ''))
    .join('');
}

function decodeBase64File(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\s+/g, '');
}

async function buildWebp(source, output) {
  const raw = Buffer.from(source, 'base64');
  await sharp(raw).webp({ quality: 92 }).toFile(output);
  console.log(`Built ${path.basename(output)} (${fs.statSync(output).size} bytes)`);
}

function ensureDesktopAppLink(html) {
  if (!html.includes('class="desktop-nav"')) return html;
  if (html.includes(`href="${appPath}"`)) return html;
  return html.replace(
    /(<nav class="desktop-nav"[^>]*>)/,
    `$1<a href="${appPath}">App</a>`
  );
}

function ensureMobileAppLink(html) {
  if (!html.includes('class="mobile-nav"')) return html;
  const mobileStart = html.indexOf('class="mobile-nav"');
  const mobileEnd = html.indexOf('</nav>', mobileStart);
  if (mobileStart < 0 || mobileEnd < 0) return html;
  const mobile = html.slice(mobileStart, mobileEnd);
  if (mobile.includes(`href="${appPath}"`)) return html;
  const navOpen = html.lastIndexOf('<nav', mobileStart);
  const insertion = html.indexOf('>', navOpen) + 1;
  if (!insertion) return html;
  return `${html.slice(0, insertion)}<a href="${appPath}">App</a>${html.slice(insertion)}`;
}

function ensureFooterAppLink(html) {
  if (!html.includes('class="footer-links"')) return html;
  if (/class="footer-links"[\s\S]*?href="\/app\/"/.test(html)) return html;
  return html.replace(
    /(<div class="footer-links"><strong>Explore<\/strong>)/,
    `$1<a href="${appPath}">App</a>`
  );
}

function ensurePerfectedBrandStylesheet(html) {
  if (!html.includes('class="site-header"')) return html;
  if (html.includes(brandStylesheet)) return html;
  return html.replace(
    /(<link rel="stylesheet" href="assets\/css\/site\.css">)/,
    `$1\n<link rel="stylesheet" href="${brandStylesheet}">`
  );
}

function ensurePerfectedBrandFavicon(html) {
  if (!html.includes('class="site-header"')) return html;
  return html.replace(
    /<link rel="icon" href="[^"]+" type="image\/svg\+xml">/,
    `<link rel="icon" href="${iconPath.replace(root + path.sep, '').replaceAll(path.sep, '/')}" type="image/svg+xml">`
  );
}

function ensureSectionNavigation(html, htmlPath) {
  if (path.basename(htmlPath) !== 'index.html') return html;
  if (html.includes(sectionNavigationScript)) return html;
  return html.replace(
    /<script src="assets\/js\/site\.js" defer><\/script>/,
    `<script src="${sectionNavigationScript}" defer></script>\n<script src="assets/js/site.js" defer></script>`
  );
}

function ensurePerfectedBrandIdentity(html) {
  if (!html.includes('class="site-header"')) return html;
  return html
    .replaceAll('Signal. Confidence. Advantage.', 'Card Intelligence')
    .replaceAll('CARD VALUE INTELLIGENCE', 'CARD INTELLIGENCE')
    .replaceAll('Card Value Intelligence', 'Card Intelligence')
    .replaceAll('CARD VALUE INTELLIGENCE', 'CARD INTELLIGENCE');
}

async function main() {
  fs.mkdirSync(imagesDir, { recursive: true });

  const beforeAfterDir = path.join(sourceDir, 'before-after-flipforge');
  if (fs.existsSync(beforeAfterDir)) {
    await buildWebp(decodeBase64Parts(beforeAfterDir), path.join(imagesDir, 'before-after-flipforge.webp'));
  }

  const grading = path.join(sourceDir, 'grading-scenario-analysis.b64');
  if (fs.existsSync(grading)) {
    await buildWebp(decodeBase64File(grading), path.join(imagesDir, 'grading-scenario-analysis.webp'));
  }

  const recommendation = path.join(sourceDir, 'recommendation-explorer.b64');
  if (fs.existsSync(recommendation)) {
    await buildWebp(decodeBase64File(recommendation), path.join(imagesDir, 'recommendation-explorer.webp'));
  }

  console.log('Updated homepage decision visuals and deterministic section navigation');
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

  updated = ensurePerfectedBrandStylesheet(updated);
  updated = ensurePerfectedBrandFavicon(updated);
  updated = ensureDesktopAppLink(updated);
  updated = ensureMobileAppLink(updated);
  updated = ensureFooterAppLink(updated);
  updated = ensureSectionNavigation(updated, htmlPath);

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
  if (!html.includes('assets/brand/flipforge-mark.svg')) failures.push('approved header mark');
  if (!html.includes('Card Intelligence')) failures.push('Card Intelligence identity line');
  if (html.includes('Card Value Intelligence') || html.includes('CARD VALUE INTELLIGENCE')) failures.push('retired Card Value Intelligence descriptor removed');
  if (!html.includes('assets/css/brand-v2.css')) failures.push('perfected brand stylesheet');
  if (!html.includes('assets/brand/flipforge-app-icon-dark.svg')) failures.push('approved favicon');
  if (html.includes('Signal. Confidence. Advantage.')) failures.push('deprecated tagline removal');

  if (path.basename(htmlPath) === 'index.html') {
    if (!html.includes('assets/images/flipforge-homepage-dashboard.svg')) failures.push('homepage product visual');
    if (!html.includes('id="try-flipforge"')) failures.push('homepage guided product demo');
    if (!html.includes('href="product.html"')) failures.push('homepage deep-product route');
    if (!html.includes(sectionNavigationScript)) failures.push('deterministic section navigation');
  }

  if (path.basename(htmlPath) === 'product.html') {
    if (!html.includes('id="grading"') || !html.includes('id="grade-form"')) failures.push('native grading scenario experience');
    if (!html.includes('assets/images/flipforge-traceback-guidance.svg')) failures.push('native traceback visual');
  }

  if (failures.length) {
    throw new Error(`${path.basename(htmlPath)} failed perfected brand validation: ${failures.join(', ')}`);
  }
}

console.log(`Verified perfected FlipForge brand integration across ${htmlFiles.length} website pages.`);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
