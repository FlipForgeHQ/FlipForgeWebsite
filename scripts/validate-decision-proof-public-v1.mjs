import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const home=read('index.html');
const page=read('decision-proof.html');
const css=read('assets/css/decision-proof-v1.css');
const sitemap=read('sitemap.xml');
const sw=read('sw.js');

const failures=[];
const check=(label,condition)=>{if(!condition)failures.push(label);};
const includesAll=(text,needles)=>needles.every(needle=>text.includes(needle));

check('homepage keeps Decision Proof discoverable',home.includes('href="decision-proof.html"'));
check('homepage compact Decision Proof section exists',home.includes('class="proof" id="decision-proof"'));
check('homepage compact proof keeps frozen count',home.includes('<strong>100</strong><span>Frozen decisions</span>'));
check('homepage compact proof keeps T7 count',home.includes('<strong>42</strong><span>Measurable at T7</span>'));
check('homepage compact proof keeps conservative review count',home.includes('<strong>17</strong><span>Conservative signals reviewed</span>'));
check('homepage proof CTA reaches dedicated page',home.includes('href="decision-proof.html">See the full Decision Proof →</a>'));
check('homepage intentionally defers methodology detail',!home.includes('Proof100 checkpoint · September 18, 2026')&&!home.includes('Current economically eligible non-BUY review candidates'));

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

check('FlipForge premium brand tokens are present',includesAll(css,[
  '--ff-proof-black:#05070a',
  '--ff-proof-gold:#d7b56d',
  '--ff-proof-gold-bright:#f0d79c',
  'background:linear-gradient(180deg,var(--ff-proof-gold-bright),var(--ff-proof-gold))'
]));
check('generic blue-green analytics tokens are retired',!css.includes('--ff-proof-blue')&&!css.includes('--ff-proof-green'));
check('dedicated page progress is semantically exposed',page.includes('role="progressbar"')&&page.includes('aria-valuenow="42"'));
check('premium proof page hero is present',page.includes('Proof, not hindsight.<strong>Freeze the decision before the outcome is known.</strong>'));
check('CSS is responsive',css.includes('@media(max-width:680px)')&&css.includes('@media(max-width:980px)'));
check('CSS honors reduced motion',css.includes('@media(prefers-reduced-motion:reduce)'));
check('Decision Proof homepage has no inline style attributes',!home.match(/<[^>]+style="/));
check('Decision Proof page has no inline style attributes',!page.match(/<[^>]+style="/));
check('Decision Proof homepage does not load retired runtime JS',!home.includes('assets/js/decision-proof-v1.js'));
check('Decision Proof page does not load retired runtime JS',!page.includes('assets/js/decision-proof-v1.js'));
check('service worker does not cache retired Decision Proof JS',!sw.includes("'/assets/js/decision-proof-v1.js'"));
check('sitemap includes Decision Proof',sitemap.includes('https://goflipforge.com/decision-proof.html'));
check('service worker caches Decision Proof page',sw.includes("'/decision-proof.html'"));
check('service worker caches Decision Proof CSS',sw.includes("'/assets/css/decision-proof-v1.css'"));

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
