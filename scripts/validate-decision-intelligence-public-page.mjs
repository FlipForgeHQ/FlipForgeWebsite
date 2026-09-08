import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const page = read('decision-intelligence.html');
const exhibitJs = read('assets/js/decision-intelligence-interactives-v1.js');
const exhibitCss = read('assets/css/decision-intelligence-interactives-v1.css');
const conversion = read('assets/js/conversion-events.js');
const conversionServer = read('netlify/modern-functions/conversion-event.mjs');
const product = read('product.html');
const connect = read('connect/index.html');
const customerShell = read('saas-prototype/customer-only-shell-v1.js');
const sitemap = read('sitemap.xml');

const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });
const sectionCount = text => (text.match(/<section\b/g) || []).length;
const publicText = page.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
const forbiddenImplementationLanguage = /\b(?:SQLite|CardSight|Netlify|Render|JavaScript|source code|database|engineVersion|correlationId|provider credential|service credential)\b/i;
const forbiddenPublicClaims = [
  /\baccuracy rate\b/i,
  /\bguaranteed profit\b/i,
  /\bguaranteed return\b/i,
  /\bguaranteed outcome\b/i,
  /\btrue value\b/i,
  /\bobjective value\b/i,
  /\b\d{1,3}(?:\.\d+)?%\s+accurate\b/i
];
const exhibitContract = `${page}\n${exhibitJs}`;
const measurementEvents = [
  'di_choice_recorded','di_world_entered','di_evidence_started','di_evidence_completed',
  'di_decision_changed','di_decision_kept','di_identity_started','di_identity_completed',
  'di_challenge_started','di_challenge_completed','di_world_completed'
];

check('dedicated Decision Intelligence page exists', page.includes('<title>Decision Intelligence | FlipForge</title>'));
check('current Card Decision Intelligence descriptor is used', page.includes('CARD DECISION INTELLIGENCE'));
check('current shared brand stylesheet is used', page.includes('assets/css/brand-v2.css'));
check('immersive world stylesheet is loaded', page.includes('assets/css/decision-intelligence-interactives-v1.css'));
check('immersive world behavior is loaded', page.includes('assets/js/decision-intelligence-interactives-v1.js'));

check('first viewport starts with a concrete customer decision', page.includes('Would you buy this card for <span>$349?</span>') && page.includes('Make your call before FlipForge does.'));
check('all four customer decisions are available', ['BUY','WATCH','VERIFY','PASS'].every(choice => page.includes(`data-world-choice="${choice}"`)));
check('the experience is organized as one world journey', ['claim','evidence','identity','decision'].every(stage => page.includes(`data-world-stage="${stage}"`)));
check('persistent proof rail exposes the four journey stages', ['YOUR CALL','EVIDENCE','IDENTITY','DECISION'].every(label => page.includes(label)));

check('evidence starts neutral instead of spoiling the result', page.includes('data-reason="Wrong grade"') && page.includes('data-reason="Exact match"') && page.includes('<em></em>'));
check('evidence reasons are revealed programmatically', exhibitJs.includes('q("em", row).textContent = row.dataset.reason'));
check('evidence collapse demonstrates five rejected and two surviving comparisons', exhibitJs.includes('const rejected = evidenceRows.filter') && exhibitJs.includes('const accepted = evidenceRows.filter') && exhibitJs.includes('2 EXACT SURVIVE'));
check('apparent-versus-supported shift is demonstrated', exhibitContract.includes('24.0%') && exhibitContract.includes('2.3%'));
check('evidence decision lands on VERIFY', exhibitJs.includes('q("strong", evidenceVerdict).textContent = "VERIFY"'));
check('visitor is asked whether evidence changed the call', page.includes('Would the evidence change your call?') && exhibitJs.includes('di_decision_changed'));

check('identity chapter uses a public Same Card question', page.includes('<h2 id="identity-title">Same card?</h2>'));
check('parallel mismatch is the visible identity failure', page.includes('data-world-check="fail"><span>PARALLEL</span>') && exhibitJs.includes('BASE ≠ SILVER'));
check('wrong identity visibly disconnects', exhibitJs.includes('base.dataset.state = "disconnect"') && exhibitCss.includes('[data-state="disconnect"]'));
check('identity resolves with exact-card market language', exhibitJs.includes('NOT THE SAME MARKET'));

check('decision chapter labels BUY as a price-only assumption', page.includes('PRICE-ONLY ASSUMPTION') && page.includes('LOOKS LIKE BUY'));
check('decision challenge includes evidence, liquidity and volatility context', ['THIN EVIDENCE','LOW LIQUIDITY','VOLATILITY'].every(label => page.includes(label)));
check('challenge lands on VERIFY with a simple conclusion', exhibitJs.includes('q("strong", final).textContent = "VERIFY"') && exhibitJs.includes('Cheap isn’t enough.'));
check('finale reflects the visitor journey', page.includes('Now you know what the price didn’t tell you.') && page.includes('data-world-finale-choice'));
check('finale carries locked brand close', page.includes('CARD DECISION INTELLIGENCE™') && page.includes('Before you buy. Know Why.'));

check('illustrative and decision-support boundary remains visible', page.includes('Illustrative scenario · not live market data.') && page.includes('FlipForge does not authorize transactions or guarantee outcomes or profit.'));
check('public page exposes no implementation vocabulary', !forbiddenImplementationLanguage.test(publicText));
check('public page contains no unauthorized accuracy, guarantee, or true-value claim', forbiddenPublicClaims.every(pattern => !pattern.test(publicText)));
check('no browser persistence is used for visitor choices', !/localStorage|sessionStorage|indexedDB/.test(exhibitJs));

check('modern view transitions enhance state changes when available', exhibitJs.includes('document.startViewTransition'));
check('IntersectionObserver drives journey progress without polling', exhibitJs.includes('IntersectionObserver'));
check('Web Animations API supplies purposeful micro-motion', exhibitJs.includes('.animate('));
check('scroll choreography remains user-triggered and native', exhibitJs.includes('scrollIntoView'));
check('reduced motion is honored in both behavior and styling', exhibitJs.includes('prefers-reduced-motion') && exhibitCss.includes('prefers-reduced-motion'));
check('no continuous loop or timer animation is introduced', !/setInterval\s*\(/.test(exhibitJs) && !/animation[^;]*infinite/i.test(exhibitCss));

check('interactive regions announce busy and status changes', page.includes('role="status"') && page.includes('aria-live="polite"') && exhibitJs.includes('aria-busy'));
check('visible keyboard focus treatment exists', exhibitCss.includes(':focus-visible') && exhibitCss.includes('outline:3px solid'));
check('choice controls are grouped and expose pressed state', page.includes('role="group" aria-label="Choose what you would do"') && exhibitJs.includes('aria-pressed'));
check('interaction controls use native buttons', ['data-world-enter','data-world-evidence-run','data-world-identity-run','data-world-decision-run'].every(token => page.includes(`<button`) && page.includes(token)));

check('all immersive journey measurement events are browser-allowlisted', measurementEvents.every(event => conversion.includes(event)));
check('all immersive journey measurement events are server-allowlisted', measurementEvents.every(event => conversionServer.includes(`"${event}"`)));
check('Decision Intelligence page is server-allowlisted for measurement', conversionServer.includes('"decision-intelligence"'));
check('Decision Intelligence beta CTA is measured', page.includes('data-ff-di-beta-cta') && conversion.includes('di_beta_cta_clicked') && conversionServer.includes('"di_beta_cta_clicked"'));

check('Decision Intelligence page stays narratively focused', sectionCount(page) <= 5);
check('Product page stays compact', sectionCount(product) <= 5);
check('Product uses current Card Decision Intelligence branding', product.includes('CARD DECISION INTELLIGENCE') && product.includes('Card Decision Intelligence'));
check('Decision Intelligence page is included in sitemap', sitemap.includes('https://goflipforge.com/decision-intelligence.html'));
check('Connect hub exposes Decision Intelligence', connect.includes('What is Decision Intelligence?') && connect.includes('/decision-intelligence.html'));
check('public navigation receives Decision Intelligence link', conversion.includes("link.textContent='Decision Intelligence'") && conversion.includes("link.href='/decision-intelligence.html'"));
check('Decision Intelligence click tracking is wired', conversion.includes('decision_intelligence_clicked'));
check('customer app exposes public Decision Intelligence exhibit', customerShell.includes('data.ffPublicDecisionIntelligence') || customerShell.includes('data-ff-public-decision-intelligence') || customerShell.includes('ffPublicDecisionIntelligence'));
check('customer app points public Decision Intelligence to the public page', customerShell.includes('publicLink.href = "/decision-intelligence.html"'));
check('private saved-data view is distinctly labeled', customerShell.includes('replaceTextNode(privateLink, "Saved Intelligence")'));

const passed = checks.filter(item => item.passed).length;
const failed = checks.filter(item => !item.passed);
console.log('FlipForge Immersive Decision Intelligence Preview Assurance');
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed.length}`);
for (const item of failed) console.error(`FAIL | ${item.name}`);
if (failed.length) process.exit(1);
