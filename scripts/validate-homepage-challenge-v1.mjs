// Homepage Decision Challenge (opening of the existing price demo), privacy-safe experience counts, and the
// Beta application pre-selection from a homepage audience. Static contract; the rendered walkthrough is
// scripts/audit-homepage-experiences-rendered.mjs.
import fs from 'node:fs';

const page = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('assets/css/homepage-challenge-v1.css', 'utf8');
const js = fs.readFileSync('assets/js/homepage-challenge-v1.js', 'utf8');
const demoJs = fs.readFileSync('assets/js/homepage-v10.js', 'utf8');
const tracker = fs.readFileSync('assets/js/conversion-events.js', 'utf8');
const server = fs.readFileSync('netlify/modern-functions/conversion-event.mjs', 'utf8');
const betaJs = fs.readFileSync('assets/js/beta-application.js', 'utf8');
const betaCore = fs.readFileSync('netlify/modern-functions/lib/beta-operations-core.mjs', 'utf8');
const betaPage = fs.readFileSync('beta-application.html', 'utf8');
let passed = 0;
const failures = [];
const check = (label, ok) => { if (ok) passed++; else failures.push(label); };

const demo = page.slice(page.indexOf('id="demo"'), page.indexOf('<!-- 7. Final call to action'));
const chal = demo.slice(demo.indexOf('data-ff-challenge'), demo.indexOf('id="what-would-change"'));
const text = chal.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

check('D01 the challenge opens the existing demo; the price meter and its controls remain after it',
  demo.indexOf('data-ff-challenge') > 0 && demo.indexOf('data-ff-challenge') < demo.indexOf('id="what-would-change"')
  && demo.indexOf('id="what-would-change"') < demo.indexOf('data-asking') && demo.includes('data-uncertainty') && demo.includes('data-reset'));
check('D02 one demo section, not a competing tool', (page.match(/data-ffdemo/g) || []).length === 1 && (page.match(/data-ff-challenge/g) || []).length === 1);
check('D03 three calls: Buy it, Investigate first, Pass', ['buy', 'investigate', 'pass'].every(k => chal.includes(`data-chal-choice="${k}"`))
  && (chal.match(/data-chal-choice=/g) || []).length === 3);
check('D04 four findings revealed one at a time: grade, listings, thin evidence, costs',
  (chal.match(/data-chal-finding/g) || []).length === 4 && text.includes('The $780 comp was a Grade 10.')
  && text.includes('asking prices, not evidence') && text.includes('Only 3 of 8 prices count.') && text.includes('leaves a Max Buy of $360'));

// The challenge uses the same model as the interactive demo; drift would contradict the page.
const model = demoJs.match(/MODEL = \{resale: (\d+), fees: (\d+), shipping: (\d+), margin: (\d+)\}/);
const [resale, fees, shipping, margin] = model ? model.slice(1).map(Number) : [0, 0, 0, 0];
const maxBuy = resale - fees - shipping - margin;
check('D05 numbers match the demo model (resale, fees, shipping, margin, Max Buy)', maxBuy === 360
  && text.includes(`$${resale} resale − $${fees} fees − $${shipping} shipping − your $${margin} margin`));
check('D06 decision matches the demo rule at $425 (PASS, $65 over)', /gap <= -25[\s\S]*'BUY'/.test(demoJs) && 425 - maxBuy === 65
  && chal.includes('data-verdict-state="PASS"') && text.includes('$65 above Max Buy'));
check('D07 the stated BUY threshold matches the demo rule', js.includes('At $335 or less') && maxBuy - 25 === 335);
check('D08 fictional and illustrative, kept next to the challenge', text.includes('Fictional card and illustrative numbers. NO REAL SALE DATA. Not a live evaluation.')
  && chal.includes('Fictional listing'));
check('D09 no profit or return promise in the challenge', !/guarantee|\bROI\b|profit of|will sell/i.test(text));
check('D10 works without script: every stage shown, calls hidden', css.includes('.ff10-chal:not(.ff10-chal-ready) .ff10-chal-choices'));
check('D11 accessible: live region, pressed state, focus moves to the next control',
  chal.includes('aria-live="polite"') && js.includes("aria-pressed") && js.includes('next.focus('));
check('D12 reduced motion and mobile layout', css.includes('prefers-reduced-motion:reduce') && css.includes('@media(max-width:760px)'));
check('D13 locked palette only', ![...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length
  && [...css.matchAll(/rgba\(([^)]+)\)/g)].every(m => /^(212,175,55|255,255,255|139,143,152|0,0,0),/.test(m[1].replace(/\s/g, ''))));
const code = s => s.replace(/^\s*(\/\*|\*|\/\/).*$/gm, '');
check('D14 no device storage or network calls in the challenge', !/localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|https?:\/\//.test(code(js)));

// Experience counts: event names and placements only, sent through the existing allowlisted endpoint.
const events = ['audience_selected', 'challenge_answered', 'challenge_completed', 'demo_interacted'];
const placements = ['audience-flipper', 'audience-investor', 'audience-collector', 'audience-dealer', 'audience-grading',
  'challenge', 'challenge-buy', 'challenge-investigate', 'challenge-pass', 'demo'];
check('E01 server allowlists every new event and placement', events.every(e => server.includes(`"${e}"`)) && placements.every(p => server.includes(`"${p}"`)));
check('E02 browser tracker accepts only those events and placements', events.every(e => tracker.includes(`"${e}"`))
  && tracker.includes('experiencePlacement') && tracker.includes('"ff:conversion"'));
check('E03 counts only: no personal data in experience events', !/email|name|value|price/i.test(
  tracker.slice(tracker.indexOf('experienceEvents'), tracker.indexOf('const placementFor'))));

// Beta application: homepage audience pre-selects only answers the form and the server already accept.
const allowedTypes = betaCore.match(/collectorType: new Set\(\[([^\]]+)\]\)/)[1];
const allowedFocus = betaCore.match(/testingFocus: new Set\(\[([^\]]+)\]\)/)[1];
const goals = [...betaJs.matchAll(/(\w+):\{label:"[^"]+",type:"([^"]*)",focus:"([^"]+)"/g)];
check('B01 five homepage audiences map to the Beta form', goals.length === 5);
check('B02 only existing allowed answers are pre-selected (no new fields, no backend change)',
  goals.every(g => (!g[2] || allowedTypes.includes(`"${g[2]}"`)) && allowedFocus.includes(`"${g[3]}"`))
  && goals.every(g => !g[2] || betaPage.includes(`<option>${g[2]}</option>`)));
check('B03 pre-selection never overrides an answer and never submits', betaJs.includes('select.value)return') && !/\.submit\(|requestSubmit/.test(betaJs));
check('B04 homepage audience buttons lead to the application', ['flipper', 'investor', 'collector', 'dealer', 'grading']
  .every(k => page.includes(`href="beta-application.html?goal=${k}#apply-heading"`)) && betaPage.includes('id="apply-heading"'));

if (failures.length) {
  console.error(`FAIL: ${failures.length} homepage challenge check(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`PASS: ${passed} homepage Decision Challenge, experience-count and Beta pre-selection checks.`);
