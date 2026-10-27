// Homepage audience selector: "Different goals. Same need for proof."
// One FlipForge framework, five audiences, generated from marketing/content/audience-messaging.json.
import fs from 'node:fs';
import { expected, current } from './build-homepage-audiences.mjs';

const page = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('assets/css/homepage-audiences-v1.css', 'utf8');
const js = fs.readFileSync('assets/js/homepage-audiences-v1.js', 'utf8');
const data = JSON.parse(fs.readFileSync('marketing/content/audience-messaging.json', 'utf8'));
let passed = 0;
const failures = [];
const check = (label, ok) => { if (ok) passed++; else failures.push(label); };

const block = current(page) || '';
const text = block.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

check('A01 section matches the audience messaging source (no hand edits)', block === expected());
check('A02 title and core message', text.includes('Different goals. Same need for proof.')
  && text.includes('Everyone approaches cards differently. FlipForge gives them a disciplined way to understand their decisions.'));
const order = ['flipper', 'investor', 'collector', 'dealer', 'grading'];
check('A03 five audiences in the requested order', JSON.stringify(data.homepage.order) === JSON.stringify(order)
  && order.every((key, i) => block.indexOf(`data-aud-tab="${key}"`) > (i ? block.indexOf(`data-aud-tab="${order[i - 1]}"`) : -1)));
check('A04 labels: Flippers, Investors, Collectors, Dealers, Grading-focused buyers',
  ['Flippers', 'Investors', 'Collectors', 'Dealers', 'Grading-focused buyers'].every(label => block.includes(`<strong>${label}</strong>`)));
check('A05 every audience states the decision, the problem, the signals and why it matters',
  (block.match(/<span>The decision<\/span>/g) || []).length === 5 && (block.match(/<span>The problem<\/span>/g) || []).length === 5
  && (block.match(/<span>Why it matters<\/span>/g) || []).length === 5);
const stages = data.homepage.framework.map(stage => stage.name);
check('A06 one framework: the same four stages, in order, for every audience, matching How it works',
  JSON.stringify(stages) === JSON.stringify(['Lock the exact card', 'Keep the prices that count', 'Know your Max Buy', 'Get the decision, and the why'])
  && stages.every(name => (block.match(new RegExp(`<strong>${name.replace(/[.,]/g, '\\$&')}`, 'g')) || []).length === 5)
  && stages.every(name => page.includes(`</span> ${name}</h3>`)));
check('A07 existing audience messaging reused (problem and headline come from the shared source)',
  data.audiences.every(a => block.includes(a.pain.replace(/’/g, '’')) && a.homepage.headline === a.cta));
check('A08 accessible tabs', (block.match(/role="tab"/g) || []).length === 5 && (block.match(/role="tabpanel"/g) || []).length === 5
  && block.includes('role="tablist"') && (block.match(/aria-selected="true"/g) || []).length === 1
  && order.every(k => block.includes(`aria-controls="ff10-aud-panel-${k}"`) && block.includes(`aria-labelledby="ff10-aud-tab-${k}"`)));
check('A09 keyboard support and no-script fallback', js.includes("ArrowRight") && js.includes("ArrowLeft") && js.includes('Home')
  && js.includes('End') && css.includes('.ff10-aud:not(.ff10-aud-ready) .ff10-aud-tabs{display:none}') && !block.includes(' hidden'));
check('A10 placed after How it works and before the price demo, once',
  page.indexOf('id="how-it-works"') < page.indexOf('id="who-its-for"') && page.indexOf('id="who-its-for"') < page.indexOf('id="demo"')
  && (page.match(/id="who-its-for"/g) || []).length === 1);
check('A11 stylesheet and script loaded', page.includes('assets/css/homepage-audiences-v1.css') && page.includes('assets/js/homepage-audiences-v1.js" defer'));

// Claims stay inside what the product does today.
const forbidden = [/guaranteed?\b(?! profit, investment returns or a grade)/i, /\bROI\b/, /\breturns? of\b/i, /\bwill (sell|appreciate|grade|go up)\b/i,
  /\b(make|earn) money\b/i, /beat the market/i, /\bverified\b/i, /\btrusted\b/i, /card ?sight/i, /\bpredicts?\b(?! the grade a raw card)/i,
  /population report/i, /\bbulk\b/i, /\bfastest\b/i, /\bbest\b/i];
for (const pattern of forbidden) check(`C01 no unsupported claim: ${pattern}`, !pattern.test(text));
check('C02 disclosure: decision support, no profit, investment return or grade guarantee',
  text.includes('FlipForge is decision support: it does not guarantee profit, investment returns or a grade.'));
check('C03 investors: no forecast, frozen decision reviews only', text.includes('FlipForge does not forecast returns.')
  && text.includes('can be reviewed at Days 7, 14 and 30'));
check('C04 dealers: no dealer-specific workflow promised', text.includes('Dealer-specific workflows are not offered yet.'));
check('C05 grading: no grade prediction', text.includes('FlipForge does not predict the grade a raw card will receive.'));
check('C06 one major slogan: the locked slogan is not repeated in this section', !text.includes('Know Why'));

// Brand and runtime boundaries.
const hexes = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0].toUpperCase());
check('B01 locked palette only (colours through the v10 tokens or gold/white alpha)', hexes.length === 0
  && [...css.matchAll(/rgba\(([^)]+)\)/g)].every(m => /^(212,175,55|255,255,255|139,143,152|0,0,0),/.test(m[1].replace(/\s/g, ''))));
check('B02 reduced motion and mobile layout', css.includes('prefers-reduced-motion:reduce') && css.includes('@media(max-width:760px)'));
check('B03 no device storage, network calls or external media in the selector',
  !/localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|https?:\/\//.test(js.replace(/^\s*(\/\*|\*|\/\/).*$/gm, '')));
check('B04 no inline styles in the section', !block.includes('style="'));

if (failures.length) {
  console.error(`FAIL: ${failures.length} homepage audience check(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`PASS: ${passed} homepage audience selector checks.`);
