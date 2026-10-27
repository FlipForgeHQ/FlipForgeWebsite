// Homepage Focus v10: cinematic, product-led rebuild (supersedes v7 film + demo).
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),css=read('assets/css/homepage-v10.css'),js=read('assets/js/homepage-v10.js');
const sw=read('sw.js'),site=read('assets/js/site.js');
const out=[];
const check=(label,ok)=>out.push({label,ok});
const has=(s,t)=>s.includes(t);
const at=t=>html.indexOf(t);
check('one homepage headline',(html.match(/<h1\b/g)||[]).length===1);
check('official logo and descriptor',has(html,'assets/brand/flipforge-logo-horizontal.svg')&&has(html,'CARD DECISION INTELLIGENCE'));
// Founder decision 2026-10-20: "Price is not proof." is the headline; the locked slogan sits directly beneath it.
check('positioning headline with the locked slogan directly beneath',/<h1 id="ff10-hero-title"[^>]*><span>Price is<\/span> <span>not proof\.<\/span><\/h1>\s*<p class="ff10-hero-brand"><span>Before<\/span> <span>you buy\.<\/span> <span>Know Why\.<\/span><\/p>/.test(html)&&has(html,'Before you buy. Know Why.'));
check('price question vs FlipForge question',['id="price-vs-proof"','“It sold for $500.”','“What does the evidence support, and what should I pay?”','Genuine sale prices are important evidence.','Decision intelligence decides what to do with it.'].every(t=>has(html,t)));
check('five things a price tool cannot easily copy',(m=>m&&(m[0].match(/<li>/g)||[]).length===5&&['decision-proof.html','#evidence','#identity','#demo'].every(t=>m[0].includes('href="'+t+'"')))(html.match(/<div class="ff10-moat">[\s\S]*?<\/ol>/)));
check('no unsupported confirmed-sale label claim',!/confirmed sale/i.test(html));
// Internal audit details stay off the public page. Rather than list the internal figures here (this file is public),
// every number of three or more digits the homepage shows (text and readable attributes) must be an approved public
// figure, and no internal finding label (a letter plus digits such as an audit defect ID) may appear. A new number
// on the homepage needs a deliberate addition to this list.
// 355: the Decision Challenge's illustrative "$355 under the comp" ($780 − $425) for the same fictional card.
// 100: the 0-100 scale of the confidence and risk scores on the "Inside the app" screens ("15/100 confidence").
const PUBLIC_HOMEPAGE_NUMBERS=new Set(['024','100','140','240','355','360','425','460','490','500','505','512','520','610','630','780','1200','2019','2026']);
const readable=(src=>{const body=src.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,' ');
  const attrs=[...body.matchAll(/\s(?:content|alt|title|aria-label|placeholder|value)="([^"]*)"/gi)].map(m=>m[1]).join(' ');
  return (body.replace(/<[^>]+>/g,' ')+' '+attrs).replace(/&[a-z#0-9]+;/gi,' ').replace(/#[0-9a-f]{3,8}\b/gi,' ');})(html);
const unapprovedNumbers=[...new Set(readable.match(/\b\d{3,}\b/g)||[])].filter(n=>!PUBLIC_HOMEPAGE_NUMBERS.has(n));
check('internal audit details stay off the public page (only approved public figures; no internal finding labels)',
  unapprovedNumbers.length===0&&!/\b[A-Z]\d{1,3}\b/.test(readable.replace(/\b(?:H[1-6]|T(?:7|14|30)|Q[1-4])\b/g,'')));
if(unapprovedNumbers.length)console.log('  unapproved homepage numbers:',unapprovedNumbers.join(', '));
check('primary supporting statement',has(html,'A price tells you what someone asked or paid. FlipForge shows what it actually proves, and what you should pay.'));
check('link previews carry the positioning',has(html,'<meta property="og:title" content="Price is not proof. | FlipForge™">')&&has(html,'name="twitter:card" content="summary_large_image"')&&has(html,'assets/images/flipforge-share-price-is-not-proof.jpg'));
check('product shown in the hero',has(html,'class="ff10-panel"')&&has(html,'Max Buy')&&has(html,'Price gap')&&has(html,'data-ff10-sync="verdict"'));
check('hero interaction route',has(html,'href="#demo">Try the price demo')&&has(html,'id="demo"')&&has(html,'data-ffdemo'));
check('slider label and hint',has(html,'<label for="ff10-ask">Asking price</label>')&&has(html,'Drag the handle or use your arrow keys.'));
check('max buy emphasis',has(html,'Max Buy $360')&&has(html,'<strong>$360</strong>'));
check('price-gap visual',has(html,'data-price-gap')&&has(html,'data-max-marker'));
check('decision output',has(html,'data-verdict')&&has(html,'data-decision-explanation'));
check('profit ROI math',has(html,'data-profit')&&has(html,'data-roi'));
check('evidence uncertainty guard',has(html,'data-uncertainty')&&has(js,"verdict = 'VERIFY'"));
check('transparent reasoning',has(html,'How Max Buy is calculated')&&['Supported resale','Selling fees, 12%','Shipping and supplies','Your target margin'].every(t=>has(html,t)));
check('reset control',has(html,'data-reset')&&has(js,"reset.addEventListener('click'"));
check('input listener',has(js,"input.addEventListener('input', render)"));
check('fixed threshold',has(js,'const MODEL = {resale: 500, fees: 60, shipping: 15, margin: 65};')&&has(js,'const gap = ask - MAX_BUY;'));
check('no live API/storage',!/(fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB)/.test(js));
check('mock data disclosure',has(html,'NO REAL SALE DATA')&&has(html,'NO GUARANTEED RETURN'));
check('strong CTA',has(html,'href="beta-application.html">Request Beta Access')&&(html.match(/href="beta-application\.html">Request Beta Access/g)||[]).length>=3);
check('paired login join desktop',has(html,'class="ffdemo-nav-actions"')&&has(html,'class="ffdemo-sign-in"'));
check('paired login join mobile',has(html,'class="ffdemo-mobile-actions"'));
check('production beta sign-in',has(html,'/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start'));
check('proof methodology preserved',has(html,'<strong>Frozen decisions</strong>')&&has(html,'href="decision-proof.html">How proof works'));
check('marketable decision assets visible',['Max Buy','Price gap','Profit at this price','BUY','WATCH','VERIFY','PASS','Not every price counts.','One wrong parallel can ruin the entire comp.'].every(t=>has(html,t)));
check('one unmistakable interactive demo',(html.match(/data-ffdemo\b/g)||[]).length===1&&!has(html,'data-film')&&!has(html,'data-decision-forge')&&!has(html,'data-ff9-film'));
check('responsive CSS',has(css,'@media(max-width:760px)')&&has(css,'@media(min-width:761px) and (max-width:1100px)'));
check('reduced motion CSS',has(css,'@media(prefers-reduced-motion:reduce)')&&has(js,"matchMedia('(prefers-reduced-motion: reduce)')"));
check('keyboard/focus states',has(html,'aria-describedby="ff10-range-help"')&&has(html,'aria-pressed="false"')&&has(css,':focus-visible'));
check('navigation mobile Escape key',has(site,"e.key==='Escape'"));
check('new service worker cache',has(sw,"const CACHE='flipforge-shell-v26'")&&has(sw,"'/assets/js/homepage-v10.js'"));
check('no old duplicate interaction loaded',!has(html,'homepage-decision-forge-v1.js')&&!has(html,'homepage-v5.js')&&!has(html,'homepage-interactive-decision-v7.js'));
check('no public sales provider exposure',!has(html,'CardSight'));
check('official transactions boundary',has(html,'FlipForge does not guarantee profit or authorize transactions.'));
const failed=out.filter(x=>!x.ok);
if(failed.length){failed.forEach(x=>console.error('FAIL: '+x.label));process.exit(1)}
console.log('PASS: '+out.length+' Homepage Focus v10 checks.');
