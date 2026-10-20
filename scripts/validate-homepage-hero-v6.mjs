// Homepage hero v7 governance. File retained under its established workflow path.
// The older static WATCH panel is intentionally superseded by one illustrative interactive demo.
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),css=read('assets/css/homepage-interactive-decision-v7.css');
const js=read('assets/js/homepage-interactive-decision-v7.js');
const errors=[];
const check=(name,ok)=>{if(!ok)errors.push(name)};
check('exactly one H1',(html.match(/<h1\b/g)||[]).length===1);
check('single decision demo',(html.match(/data-ffdemo\b/g)||[]).length===1&&!html.includes('data-decision-forge'));
check('immediate demo beside hero',html.indexOf('data-ffdemo')>html.indexOf('<section class="ffdemo-hero"')&&html.indexOf('data-ffdemo')<html.indexOf('<section class="ffdemo-evidence"'));
check('premium official palette',css.includes('#D4AF37')&&css.includes('#B8860B'));
check('Geist typography',css.includes('font-family:Geist'));
check('no fake card or brochure art',!html.includes('ff-fictional-slab-v1.svg')&&!html.includes('ffdemo-hero-slab'));
check('decision-first interactive graphics',html.includes('ffdemo-spread-chart')&&html.includes('data-hero-position')&&html.includes('ffdemo-art-identity-check'));
check('visual threshold stays tied to slider',js.includes("document.querySelector('[data-hero-position]')")&&js.includes('ABOVE BUY LIMIT'));
check('premium terminal style',css.includes('.ffdemo-spread')&&css.includes('.ffdemo-check-data'));
check('visible example disclaimer',html.includes('INTERACTIVE · ILLUSTRATIVE')&&html.includes('NO REAL SALE DATA'));
check('explicit economics',html.includes('Max Buy = $500 − $60 − $15 − $65 = $360'));
check('no guaranteed profit',html.includes('NO GUARANTEED RETURN'));
check('range control and hint',html.includes('type="range"')&&html.includes('Drag the gold slider'));
check('instant updates',js.includes("input.addEventListener('input', render)"));
check('two separate prices',html.includes('ASKING PRICE')&&html.includes('FLIPFORGE MAX BUY'));
check('price gap',html.includes('PRICE GAP')&&html.includes('data-price-gap-explain'));
check('decision quality guard',js.includes("unknown ? 'VERIFY'"));
check('correct fixed threshold',js.includes('const maxBuy = 360')&&js.includes('ask - maxBuy'));
check('modeled costs and profit',js.includes('assumedResale - sellingFees - fulfillment - ask'));
check('reset and reasoning',html.includes('data-reset')&&html.includes('WHY THIS DECISION?'));
check('mobile usability',css.includes('@media(max-width:750px)')&&css.includes('.ffdemo-mobile-actions'));
check('reduced motion',css.includes('@media(prefers-reduced-motion:reduce)'));
check('official logo',html.includes('flipforge-logo-horizontal.svg'));
check('paired header actions',html.includes('class="ffdemo-nav-actions"'));
check('no trading affordance',!/checkout|buy now|place bid|add to cart/i.test(html));
check('no network data',!/(fetch\s*\(|XMLHttpRequest)/.test(js));
check('only one major sales experience',!html.includes('data-film')&&!html.includes('data-decision-forge'));
if(errors.length){errors.forEach(x=>console.error('FAIL: '+x));process.exit(1)}
console.log('PASS: '+24+' homepage hero v7 safety and experience checks.');
