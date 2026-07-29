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
  {
    output: 'grading-scenario-analysis.webp',
    readBase64() {
      return fs.readFileSync(path.join(sourceRoot, 'grading-scenario-analysis.b64'), 'utf8').trim();
    },
  },
  {
    output: 'recommendation-explorer.webp',
    readBase64() {
      return fs.readFileSync(path.join(sourceRoot, 'recommendation-explorer.b64'), 'utf8').trim();
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

// The earlier Recommendation Explorer WebP can fail to render in some manual
// Netlify deployments. Use the native branded SVG for the gallery instead.
const indexPath = path.join(root, 'index.html');
if (fs.existsSync(indexPath)) {
  const original = fs.readFileSync(indexPath, 'utf8');
  const corrected = original.replaceAll(
    'assets/images/recommendation-explorer.webp',
    'assets/images/flipforge-traceback-guidance.svg',
  );

  if (corrected !== original) {
    fs.writeFileSync(indexPath, corrected, 'utf8');
    console.log('Updated homepage gallery to use flipforge-traceback-guidance.svg');
  }
}

// Keep the public website and the browser app connected without replacing the
// marketing homepage. Netlify exposes the isolated prototype at /app/ through
// _redirects; the build adds a consistent entry point across website pages.
const htmlFiles = fs.readdirSync(root)
  .filter((name) => name.endsWith('.html'))
  .map((name) => path.join(root, name));

for (const htmlPath of htmlFiles) {
  const original = fs.readFileSync(htmlPath, 'utf8');
  let updated = original.replaceAll(
    'Signal. Confidence. Advantage.',
    'Card Value Intelligence',
  );

  if (!updated.includes('data-app-preview="desktop"')) {
    updated = updated.replace(
      '<a class="nav-cta" href="beta-application.html">Request Access</a>',
      '<a data-app-preview="desktop" href="/app/#/dashboard">App Preview</a><a class="nav-cta" href="beta-application.html">Request Access</a>',
    );
  }

  if (!updated.includes('data-app-preview="mobile"')) {
    updated = updated.replace(
      '<a href="beta-application.html">Request Beta Access</a>',
      '<a data-app-preview="mobile" href="/app/#/dashboard">App Preview</a><a href="beta-application.html">Request Beta Access</a>',
    );
  }

  if (!updated.includes('data-app-preview="footer"')) {
    updated = updated.replace(
      '<a href="beta-application.html">Private Beta</a>',
      '<a data-app-preview="footer" href="/app/#/dashboard">App Preview</a><a href="beta-application.html">Private Beta</a>',
    );
  }

  if (updated !== original) {
    fs.writeFileSync(htmlPath, updated, 'utf8');
    console.log(`Updated website app entry points and brand line in ${path.basename(htmlPath)}`);
  }
}
