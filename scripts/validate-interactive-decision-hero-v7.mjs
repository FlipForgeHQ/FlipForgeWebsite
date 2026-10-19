// Illustrative homepage decision demo: structural, math, disclosure and conversion invariants.
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/css/homepage-interactive-decision-v7.css','utf8');
const js=fs.readFileSync('assets/js/homepage-interactive-decision-v7.js','utf8');
const assertions=[];
const check=(msg,ok)=>assertions.push({msg,ok});
check('single hero', (html.match(/<h1\b/g)||[]).length===1);
check('signature demo appears in hero', html.indexOf('data-ffdemo')>html.indexOf('<section class="ffdemo-hero"') && html.indexOf('data-ffdemo')<html.indexOf('</section>\n<section class="ffdemo-evidence"'));
check('clearly labeled asking price, Max Buy and price gap', ['ASKING PRICE','FLIPFORGE MAX BUY','PRICE GAP','data-price-gap'].every(x=>html.includes(x)));
check('prominent visible instruction and label', html.includes('TRY IT — ADJUST THE PRICE') && html.includes('INTERACTIVE · ILLUSTRATIVE'));
check('range input usable and reset available',html.includes('type="range"') && html.includes('data-reset') && js.includes("addEventListener('input'"));
check('uncertain evidence can force VERIFY',js.includes("unknown ? 'VERIFY'") && html.includes('data-uncertainty'));
check('fixed Max Buy does not float with asking price',js.includes('const maxBuy = 360') && js.includes('ask - maxBuy'));
check('calculation source tied to disclosed economics', js.includes('assumedResale - sellingFees - fulfillment - ask') && html.includes('Max Buy = $500 − $60 − $15 − $65 = $360'));
check('visible formula and nonlive disclosure', html.includes('No real sale data'.toUpperCase()) && html.includes('No guaranteed return'.toUpperCase()));
check('profit not guaranteed',html.includes('FlipForge does not guarantee profit'));
check('CTA routes to beta application',html.includes('href="beta-application.html">Request Private Beta Access'));
check('sign-in and beta access grouped on desktop',html.includes('class="ffdemo-nav-actions"') && html.includes('class="ffdemo-mobile-actions"'));
check('sign-in routes preserved',html.includes('data-ff-marketing-sign-in') && html.includes('production-auth.html'));
check('accessible controls',html.includes('aria-pressed="false"') && html.includes('aria-describedby="ffdemo-range-help ffdemo-range-caption"'));
check('responsive and reduced motion supported',css.includes('@media(max-width:750px)') && css.includes('@media(prefers-reduced-motion:reduce)'));
check('nine-second product film has four explicit financial beats',[
 'SEE THE PRODUCT IN ACTION',
 '$425 ASKING PRICE.',
 '$360 MAX BUY.',
 '$65 TOO HIGH.',
 'PASS. KNOW WHY.',
 'CHANGE THE PRICE.'
].every(value=>html.includes(value)));
check('autoplay begins on intersection and shares decision numbers',js.includes('new IntersectionObserver(')&&js.includes("input.value = '425'")&&js.includes('root.classList.add(\'ffdemo-story-playing\')'));
check('customer input immediately cancels launch animation',js.includes("input.addEventListener('input', takeControl)")&&js.includes("root.classList.remove('ffdemo-story-playing', 'ffdemo-story-paused')"));
check('autoplay is once, resumable and replayable',js.includes('storyObserver.disconnect()')&&js.includes("storyPause.addEventListener('click'")&&js.includes("storyReplay.addEventListener('click'"));
check('reduced motion and offscreen visibility honored',js.includes("prefers-reduced-motion: reduce")&&js.includes('document.hidden')&&css.includes('prefers-reduced-motion:reduce'));
check('cinematic type entrance, gold contrast and mobile fit',css.includes('ffdemo-cine-stage')&&css.includes('@keyframes ffdemo-cine-stage')&&css.includes('.ffdemo-cine-frame strong')&&css.includes('@media(max-width:600px)'));
check('no automatic video downloads, audio, provider or storage calls',!/(audio\.play|video\.play|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB)/.test(js));
check('only one hero experience',!html.includes('data-decision-forge') && !html.includes('data-film'));
check('no data storage or provider fetch',!/(localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest)/.test(js));
const errors=assertions.filter(x=>!x.ok);
if(errors.length){for(const x of errors)console.error('FAIL: '+x.msg);process.exit(1)}
console.log('PASS: '+assertions.length+' interactive homepage structural, math, accuracy and accessibility guards.');
