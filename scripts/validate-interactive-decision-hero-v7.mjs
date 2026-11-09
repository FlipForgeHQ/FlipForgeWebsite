// Premium homepage + evidence integrity, v10 (file retained under its established workflow path).
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),css=read('assets/css/homepage-v10.css'),js=read('assets/js/homepage-v10.js');
const sw=read('sw.js'),site=read('assets/js/site.js');
const out=[];
const check=(label,ok)=>out.push({label,ok});
const has=(s,t)=>s.includes(t);
const at=t=>html.indexOf(t);
check('one semantic H1',(html.match(/<h1\b/g)||[]).length===1);
check('approved slogan headline',has(html,'<h1 id="ff10-hero-title"')&&has(html,'<span>Know Why.</span>'));
check('one orchestrated hero moment',has(js,"hero.classList.add('ff10-armed')")&&has(js,'io.disconnect()')&&has(css,'.ff10-armed.ff10-locked'));
// Founder decision Nov 5 2026: six sections, each story told once (hero, Difference, Challenge, Inside the App, Who It's For, final).
check('hero first, Difference second, interactive demo kept',at('ff10-hero')<at('id="difference"')&&at('id="difference"')<at('data-ffdemo')&&at('data-ffdemo')<at('class="ff10-final"'));
check('large card imagery and real decision UI',has(html,'class="ff10-slab"')&&has(html,'ff10-hero@2x.webp')&&has(css,'.ff10-panel{'));
check('light dark page rhythm',(o=>o.every(c=>has(html,'class="'+c+'"'))&&o.every((c,i)=>i===0||at('class="'+o[i-1]+'"')<at('class="'+c+'"')))(['ff10-hero','ff10-diff','ff10-demo ff10-light','ff10-app','ff10-aud','ff10-final']));
check('large financial proof readout',has(html,'class="ff10-readout"')&&has(css,'.ff10-read strong{font-size:clamp(40px'));
check('four actually visual steps',['ff10-sv-identity','ff10-sv-evidence','ff10-sv-max','ff10-sv-verdict'].every(v=>has(html,v)));
// The wrong-parallel and wrong-grade points are made once, inside the Decision Challenge findings.
check('exact-card identity explained in the Challenge',has(html,'a $140 sale is the base card, not the Silver /99')&&has(html,'A different grade is a different card')&&!has(html,'id="identity"'));
check('evidence findings explained in the Challenge',(html.match(/data-chal-finding/g)||[]).length>=4&&has(html,'asking prices, not evidence')&&has(html,'Only 3 of 8 prices count.')&&!has(html,'id="evidence"'));
check('Request Beta Access in the header and Beta Sign In in the menu at every width',has(html,'class="site-header-actions"')&&has(html,'class="site-menu-sign-in"'));
check('private beta CTA',has(html,'href="beta-application.html">Request Beta Access')&&has(html,'Controlled Private Beta.'));
check('functional price slider and reset',has(html,'data-asking')&&has(html,'data-reset')&&has(js,"input.addEventListener('input', render)"));
check('fixed maxbuy threshold',has(js,'const MAX_BUY = MODEL.resale - MODEL.fees - MODEL.shipping - MODEL.margin; // 360'));
check('dollar margin math',has(html,'<span>Your target margin</span><b>−$65</b>')&&has(js,'const gap = ask - MAX_BUY;'));
check('cost and ROI formula',has(js,'const roi = 100 * profit / ask;')&&has(html,'data-roi'));
check('uncertainty forces Verify',has(js,"verdict = 'VERIFY'")&&has(html,'data-uncertainty'));
check('no claim of sold data',has(html,'NO REAL SALE DATA')&&has(html,'Not a live evaluation')&&has(html,'Fictional card and illustrative numbers.'));
check('no provider calls',!/(fetch\s*\(|XMLHttpRequest)/.test(js));
check('no browser storage',!/(localStorage|sessionStorage|indexedDB)/.test(js));
check('no risk-free promises',has(html,'NO GUARANTEED RETURN')&&has(html,'FlipForge does not guarantee profit'));
check('autoplay respects reduced motion',has(js,'IntersectionObserver')&&has(js,'prefers-reduced-motion: reduce'));
check('clear focus route',has(html,'aria-describedby="ff10-range-help"')&&has(html,'aria-pressed="false"'));
check('responsive phone and section design',has(css,'@media(max-width:760px)')&&has(css,'@media(max-width:1100px)'));
check('legally cautious imagery',has(html,'Invented for illustration; not a real card, player, set or grading company.')&&!has(html,'images.unsplash.com'));
check('no prohibited stock-looking original slab',!has(html,'ff-fictional-slab-v1.svg'));
check('frozen proof lineage retained (Proof100 count withdrawn 2026-10-20)',has(html,'<strong>Frozen decisions</strong>')&&has(html,'decision-proof.html')&&!has(html,'100 frozen decisions'));
const failed=out.filter(x=>!x.ok);
if(failed.length){failed.forEach(x=>console.error('FAIL: '+x.label));process.exit(1)}
console.log('PASS: '+out.length+' premium homepage + evidence integrity checks.');
