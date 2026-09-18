import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const home=read('index.html');
const page=read('decision-proof.html');
const css=read('assets/css/decision-proof-v1.css');
const js=read('assets/js/decision-proof-v1.js');
const sitemap=read('sitemap.xml');
const sw=read('sw.js');

const failures=[];
const check=(label,condition)=>{if(!condition)failures.push(label);};
const includesAll=(text,needles)=>needles.every(needle=>text.includes(needle));

check('homepage loads Decision Proof CSS',home.includes('assets/css/decision-proof-v1.css'));
check('homepage loads Decision Proof JS',home.includes('assets/js/decision-proof-v1.js'));
check('homepage navigation exposes Decision Proof',home.includes('href="decision-proof.html">Decision Proof</a>'));
check('homepage section exists',home.includes('class="ff-decision-proof" id="decision-proof" data-ff-decision-proof'));
check('homepage section uses governed snapshot date',home.includes('Proof100 checkpoint · September 18, 2026'));
check('homepage core counts are present',includesAll(home,[
  '<strong>100</strong><span>Frozen decisions</span>',
  '<strong>42</strong><span>T7 decisions measurable</span>',
  '<strong>58</strong><span>Awaiting sufficient evidence</span>',
  '<strong>17</strong><span>Raw conservative signals reviewed</span>'
]));
check('homepage economic interpretation is explicit',includesAll(home,[
  '17</b> Economically justified holds',
  'Current economically eligible non-BUY review candidates',
  'were not BUY-eligible under their authoritative Day-0 profitability state'
]));
check('homepage unresolved records are not forced',home.includes('Unresolved outcomes stay unknown instead of being forced into a result.'));
check('homepage proof CTA reaches dedicated page',home.includes('href="decision-proof.html">See the full Decision Proof</a>'));
check('homepage public boundary blocks overclaiming',home.includes('not presented as a customer-facing accuracy score'));

check('dedicated page title exists',page.includes('<title>Decision Proof | FlipForge</title>'));
check('dedicated page canonical exists',page.includes('https://goflipforge.com/decision-proof.html'));
check('dedicated page snapshot date is explicit',page.includes('Snapshot: September 18, 2026'));
check('dedicated page has T0/T7/T14/T30 method',includesAll(page,[
  '<strong>T0</strong>',
  '<strong>T7</strong>',
  '<strong>T14</strong>',
  '<strong>T30</strong>'
]));
check('dedicated page separates signal/economics/policy review',includesAll(page,[
  '01 · Raw outcome signal',
  '02 · Economic interpretation',
  '03 · Policy-review candidate'
]));
check('dedicated page exposes 17-case factors',includesAll(page,[
  '<span>15 cases</span><h3>Negative net economics</h3>',
  '<span>2 cases</span><h3>Margin of safety not met</h3>',
  '<span>16 cases</span><h3>Ask above Maximum Buy Price</h3>'
]));
check('dedicated page states coverage limitation',includesAll(page,[
  '42 measurable T7 outcomes',
  '58 unresolved outcomes',
  'T14, T30, then Proof1000'
]));
check('dedicated page blocks universal performance claim',page.includes('does not prove that FlipForge will always make the right decision, guarantee profit, or establish a universal performance percentage'));
check('dedicated page keeps beta CTA',page.includes('href="beta-application.html">Request Beta Access</a>'));

check('CSS is responsive',css.includes('@media(max-width:680px)')&&css.includes('@media(max-width:980px)'));
check('CSS honors reduced motion',css.includes('@media(prefers-reduced-motion:reduce)'));
check('progressive enhancement honors reduced motion',js.includes('prefers-reduced-motion: reduce'));
check('progressive enhancement has no browser persistence',!['localStorage','sessionStorage','indexedDB'].some(key=>js.includes(key)));
check('sitemap includes Decision Proof',sitemap.includes('https://goflipforge.com/decision-proof.html'));
check('service worker caches Decision Proof page',sw.includes("'/decision-proof.html'"));
check('service worker caches Decision Proof CSS',sw.includes("'/assets/css/decision-proof-v1.css'"));
check('service worker caches Decision Proof JS',sw.includes("'/assets/js/decision-proof-v1.js'"));

const publicCopy=(home+'\n'+page).toLowerCase();
for(const unsafe of ['guaranteed profit','100% accurate','automatic purchase','transactionauthority=true']){
  check('unsafe public claim absent: '+unsafe,!publicCopy.includes(unsafe));
}

if(failures.length){
  console.error('Decision Proof public validation failed:');
  failures.forEach(failure=>console.error('- '+failure));
  process.exit(1);
}
console.log('PASS: governed public Decision Proof section and methodology page validated.');
