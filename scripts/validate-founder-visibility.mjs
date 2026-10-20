import fs from 'node:fs';
import assert from 'node:assert/strict';

const about = fs.readFileSync('about.html', 'utf8');
const css = fs.readFileSync('assets/css/about-editorial-v1.css', 'utf8');
const checks = [
  ['founder name appears once', (about.match(/<strong>Todd Holbein<\/strong>/g)||[]).length === 1],
  ['founder section is unique', (about.match(/id="founder-heading"/g)||[]).length === 1],
  ['quick link appears in hero', about.indexOf('href="#founder">Meet the founder') > about.indexOf('class="lead ab-lead"') && about.indexOf('href="#founder">Meet the founder') < about.indexOf('</section>')],
  ['founder appears after approved cinematic feature', about.indexOf('id="founder"') > about.indexOf('ff10-about-feature')],
  ['founder appears before principles', about.indexOf('id="founder"') < about.indexOf('class="ab-principle"')],
  ['founder appears before long commitments', about.indexOf('id="founder"') < about.indexOf('id="priorities-heading"')],
  ['founder left rail is semantic aside', about.includes('<aside class="ab-founder-panel" aria-label="Founder introduction">')],
  ['founder story retains its words', about.includes('My connection to sports cards goes back to the 1990s.') && about.includes('When I returned to collecting in 2023') && about.includes('Drawing from my teaching experience') && about.includes('That trust has to be earned through transparency, accuracy, and accountability')],
  ['founder story retains slogan', about.includes('<p class="ab-founder-close"><strong>Before you buy. Know Why.</strong></p>')],
  ['existing trust feature is preserved', about.includes('THE FLIPFORGE STANDARD · 01—04') && about.includes('class="ff10-graphic ff10-trust-graphic"')],
  ['left-side panel inherits existing grid', css.includes('.ab-founder-feature{padding-top:68px;scroll-margin-top:105px;align-items:start}')],
  ['panel stays legible on mobile', css.includes('@media (max-width:860px){') && css.includes('.ab-founder-panel{position:static')],
  ['no extra graphics or animation', !about.includes('founder-portrait') && !about.includes('founder-motion')],
  ['keyboard link focus provided', css.includes('.ff-about-editorial a:focus-visible')],
  ['print panel remains readable', css.includes('.ab-founder-panel{position:static;background:#fff!important')]
];
for(const [name,ok] of checks) { if(!ok) console.error('FAIL: '+name); }
const failed=checks.filter(([,ok])=>!ok);
assert.equal(failed.length,0,failed.length+' founder layout checks failed');
console.log('PASS: '+checks.length+' founder visibility, content preservation, accessibility and responsive layout checks.');
