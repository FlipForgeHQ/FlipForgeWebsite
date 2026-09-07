import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const page = read('decision-intelligence.html');
const product = read('product.html');
const connect = read('connect/index.html');
const conversion = read('assets/js/conversion-events.js');
const sitemap = read('sitemap.xml');

const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });
const sectionCount = text => (text.match(/<section\b/g) || []).length;

check('dedicated Decision Intelligence page exists', page.includes('<title>What Is Decision Intelligence? | FlipForge</title>'));
check('current Card Decision Intelligence descriptor is used', page.includes('CARD DECISION INTELLIGENCE'));
check('current shared brand stylesheet is used', page.includes('assets/css/brand-v2.css'));
check('current internal marketing system is used', page.includes('assets/css/marketing-pages-v3.css') && page.includes('assets/css/award-winning-v1.css'));
check('old standalone Decision Intelligence visual system is not used', !page.includes('decision-intelligence-page-v1.css'));
check('customer-first thesis is present', page.includes('More data is not the answer. A clearer decision is.'));
check('price tracking distinction is clear', page.includes('Price tracking tells you what happened.'));
check('three-step Data Context Decision explanation is present', page.includes('01 · Data') && page.includes('02 · Context') && page.includes('03 · Decision'));
check('exact identity remains explicit', page.includes('Exact identity'));
check('decision context remains explicit', page.includes('Value, evidence, risk, liquidity and grading economics'));
check('BUY WATCH VERIFY PASS language is explicit', /BUY\s*\/\s*WATCH\s*\/\s*VERIFY\s*\/\s*PASS/.test(page));
check('future-price prediction is disclaimed', page.includes('does not predict future prices'));
check('grade prediction is disclaimed', page.includes('or guarantee grades'));
check('collector retains final judgment', page.includes('The final decision remains yours.'));
check('Decision Intelligence page stays compact', sectionCount(page) <= 5);
check('Product page stays compact', sectionCount(product) <= 5);
check('Product uses current Card Decision Intelligence branding', product.includes('CARD DECISION INTELLIGENCE') && product.includes('Card Decision Intelligence'));
check('Product keeps one visible interactive proof', product.includes('id="identity-simulator"'));
check('Product removes old long-form grading calculator', !product.includes('id="grade-form"'));
check('Product removes old long-form decision receipt', !product.includes('Decision receipt'));
check('Decision Intelligence page is included in sitemap', sitemap.includes('https://goflipforge.com/decision-intelligence.html'));
check('Connect hub exposes Decision Intelligence marquee link', connect.includes('What is Decision Intelligence?') && connect.includes('/decision-intelligence.html'));
check('public navigation receives Decision Intelligence link', conversion.includes("link.textContent='Decision Intelligence'") && conversion.includes("link.href='/decision-intelligence.html'"));
check('Decision Intelligence click tracking is wired', conversion.includes('decision_intelligence_clicked'));
check('oversized homepage and product teaser injection is removed', !conversion.includes('homeDecisionIntelligenceMarkup') && !conversion.includes('productDecisionIntelligenceMarkup'));

const passed = checks.filter(item => item.passed).length;
const failed = checks.filter(item => !item.passed);
console.log('FlipForge Decision Intelligence Public Page Assurance');
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed.length}`);
for (const item of failed) console.error(`FAIL | ${item.name}`);
if (failed.length) process.exit(1);
