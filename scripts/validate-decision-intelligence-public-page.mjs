import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const page = read('decision-intelligence.html');
const connect = read('connect/index.html');
const conversion = read('assets/js/conversion-events.js');
const pageCss = read('assets/css/decision-intelligence-page-v1.css');
const sitemap = read('sitemap.xml');

const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });

check('dedicated Decision Intelligence page exists', page.includes('<title>What Is Decision Intelligence? | FlipForge</title>'));
check('current Card Decision Intelligence descriptor is used', page.includes('CARD DECISION INTELLIGENCE'));
check('core decision-problem framing is present', page.includes('More data does not automatically create a better decision.'));
check('manual era is explained', page.includes('MANUAL ERA'));
check('tracking era is explained', page.includes('TRACKING ERA'));
check('Decision Intelligence era is explained', page.includes('DECISION INTELLIGENCE ERA'));
check('exact identity is part of the decision chain', page.includes('Exact identity'));
check('qualified evidence is part of the decision chain', page.includes('Qualified evidence'));
check('supported value is part of the decision chain', page.includes('Supported value'));
check('risk and liquidity are part of the decision chain', page.includes('Risk and liquidity'));
check('grading economics are part of the decision chain', page.includes('Grading economics'));
check('BUY WATCH VERIFY PASS language is explicit', /BUY\s*\/\s*WATCH\s*\/\s*VERIFY\s*\/\s*PASS/.test(page));
check('Smart Opportunity remains sole decision authority', page.includes('Smart Opportunity remains the sole decision authority'));
check('active asks are not represented as completed-sale evidence', page.includes('Active asks remain context, not completed-sale evidence.'));
check('future-price prediction is disclaimed', page.includes('does not predict future prices'));
check('grade prediction is disclaimed', page.includes('does not predict future prices or guarantee grades'));
check('collector retains final judgment', page.includes('The goal is not to replace your judgment.'));
check('Decision Intelligence page is included in sitemap', sitemap.includes('https://goflipforge.com/decision-intelligence.html'));
check('Connect hub exposes Decision Intelligence marquee link', connect.includes('What is Decision Intelligence?') && connect.includes('/decision-intelligence.html'));
check('public navigation exposes Decision Intelligence without expanding page bodies', conversion.includes("link.textContent='Decision Intelligence'") && conversion.includes("link.href='/decision-intelligence.html'"));
check('Decision Intelligence click tracking is wired', conversion.includes('decision_intelligence_clicked'));
check('homepage and product keep compact vertical structure', !conversion.includes('ff-di-teaser') && !conversion.includes('homeDecisionIntelligenceMarkup') && !conversion.includes('productDecisionIntelligenceMarkup'));
check('dedicated page CSS exists and is responsive', pageCss.includes('.ff-di-hero') && /@media\(max-width:/.test(pageCss));

const passed = checks.filter(item => item.passed).length;
const failed = checks.filter(item => !item.passed);
console.log('FlipForge Decision Intelligence Public Page Assurance');
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed.length}`);
for (const item of failed) console.error(`FAIL | ${item.name}`);
if (failed.length) process.exit(1);
