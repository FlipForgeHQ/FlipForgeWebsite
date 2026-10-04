import fs from 'node:fs';

const read = p => fs.readFileSync(p,'utf8');
const html = read('index.html');
const css = read('assets/css/homepage-decision-story-v1.css');
const js = read('assets/js/homepage-decision-story-v1.js');
const failures = [];
const ensure = (label, pass) => { if (!pass) failures.push(label); };
const contains = x => html.includes(x);

ensure('Information → Trust → Decisions are all present',
  ['01 · INFORMATION','02 · TRUST','03 · DECISIONS'].every(contains));
ensure('Homepage shows origin and evidence inspection',
  contains('See where the numbers come from') && contains('ff-ds-audit-grid')
    && ['SOURCE','IDENTITY','FILTER','UNCERTAINTY'].every(contains));
ensure('Contrasting price workflow is explicitly illustrative',
  contains('Five illustrative price references') && contains('not live market results')
    && contains('any named competitor'));
ensure('Evidence can be inspected without a JavaScript dependency',
  contains('<details class="ff-ds-audit"') && contains('<summary>See why the evidence counts'));
ensure('Existing website film and interactive demo remain intact',
  contains('id="film"') && contains('data-film') && contains('id="decision-forge"')
    && contains('data-decision-forge'));
ensure('Order introduces film, contrast, then guided process',
  html.indexOf('id="film"') < html.indexOf('id="information-trust-decisions"')
    && html.indexOf('id="information-trust-decisions"') < html.indexOf('id="decision-forge"'));
ensure('Comparison has a real replay control',
  contains('data-ff-ds-replay') && js.includes("replay?.addEventListener('click', play)"));
ensure('Reduced motion and tab-key access remain available',
  css.includes('@media(prefers-reduced-motion:no-preference)')
    && js.includes("prefers-reduced-motion: reduce")
    && css.includes('.ff-ds-replay:focus-visible'));
ensure('Revised story loads scoped assets',
  contains('assets/css/homepage-decision-story-v1.css')
    && contains('assets/js/homepage-decision-story-v1.js')
    && css.includes('html body.ff-home-visual-review'));
ensure('No forbidden inline styling',
  !/\sstyle\s*=/.test(html));
ensure('Approved CTA and slogan remain intact',
  contains('Before you buy. Know Why.')
    && contains('href="beta-application.html">Request Beta Access</a>')
    && contains('data-ff-marketing-sign-in'));
ensure('No invented comparative superiority statistics',
  !/\b(?:[0-9]+(?:\.[0-9]+)?%\s*(?:more\s+accurate|better|faster)|outperforms\s+all\s+competitors)\b/i.test(html));

if (failures.length) {
  console.error('FlipForge decision story validation failed:');
  failures.forEach(failure => console.error('- ' + failure));
  process.exitCode = 1;
} else {
  console.log('PASS: 12 homepage decision-story checks.');
}
