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
