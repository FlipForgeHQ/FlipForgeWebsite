import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredPages = [
  'index.html','product.html','pricing.html','faq.html','about.html','privacy.html',
  'terms.html','beta-terms.html','data-use.html','beta-application.html','beta-onboarding.html','thank-you.html'
];
const findings = [];
const pass = (id, detail) => findings.push({ id, status: 'PASS', detail });
const fail = (id, detail) => findings.push({ id, status: 'FAIL', detail });
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const missing = requiredPages.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) fail('A1', `Missing required page(s): ${missing.join(', ')}`);
else pass('A1', `All ${requiredPages.length} required public/acquisition pages exist.`);

const retiredBrand = [
  /Card Value Intelligence/i,
  /FlipForge\s*[—|-]\s*Card Intelligence/i,
  /Before you buy,\s*know why\.?/i,
  /Before You Buy,\s*Know Why\.?/,
  /Before you buy\.\s*Know why\./
];
const brandIssues = [];
for (const file of requiredPages) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const html = read(file);
  if (!/Card Decision Intelligence/i.test(html)) brandIssues.push(`${file}: missing Card Decision Intelligence`);
  if (!html.includes('Before you buy. Know Why.')) brandIssues.push(`${file}: missing locked slogan`);
  for (const pattern of retiredBrand) if (pattern.test(html)) brandIssues.push(`${file}: retired brand wording ${pattern}`);
}
if (brandIssues.length) fail('A2', brandIssues.join(' | '));
else pass('A2', 'Locked CARD DECISION INTELLIGENCE / Before you buy. Know Why. language is consistent across required pages.');

const pricing = read('pricing.html');
const terms = read('terms.html');
const beta = read('beta-application.html');
const commercialChecks = [
  ['pricing states $0 private beta', /Private Beta[^<]{0,30}\$0|Private Beta remains \$0/i.test(pricing)],
  ['pricing says no paid checkout', /No paid checkout|Paid checkout[^.]*not active/i.test(pricing)],
  ['terms says paid subscriptions are not currently offered', terms.includes('Paid subscriptions are not currently offered')],
  ['terms says paid checkout is not active', terms.includes('Paid checkout is not active')],
  ['beta application says beta is not a paid subscription', /Private beta is not a paid subscription/i.test(beta)],
  ['beta application says paid checkout remains inactive', /Paid checkout remains inactive/i.test(beta)]
];
const commercialFailures = commercialChecks.filter(([,ok]) => !ok).map(([name]) => name);
if (commercialFailures.length) fail('A3', commercialFailures.join(' | '));
else pass('A3', 'No misleading active-paid-plan/checkout claim found in the core public beta path.');

const broken = [];
const stale = [];
const localRef = /(?:href|src)=["']([^"']+)["']/g;
for (const file of requiredPages) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const html = read(file);
  for (const pattern of [/deploy-preview-[^"'\s<]+/gi,/https?:\/\/localhost[^"'\s<]*/gi,/https?:\/\/127\.0\.0\.1[^"'\s<]*/gi]) {
    for (const match of html.matchAll(pattern)) stale.push(`${file}: ${match[0]}`);
  }
  for (const match of html.matchAll(localRef)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('//')) continue;
    if (raw.startsWith('/app') || raw.startsWith('/api/') || raw.startsWith('/.netlify/')) continue;
    const clean = raw.split('#')[0].split('?')[0];
    if (!clean) continue;
    const resolved = clean.startsWith('/') ? path.join(root, clean.slice(1)) : path.resolve(path.dirname(path.join(root,file)), clean);
    if (!fs.existsSync(resolved)) broken.push(`${file} -> ${raw}`);
  }
}
if (broken.length || stale.length) fail('A4', [...broken.map(x=>`broken ${x}`), ...stale.map(x=>`stale ${x}`)].join(' | '));
else pass('A4', 'Required public pages contain no unresolved local links/assets or stale localhost/deploy-preview endpoints.');

console.log(JSON.stringify({ section: 'A', phase: 'static', findings }, null, 2));
if (findings.some(item => item.status === 'FAIL')) process.exit(1);
