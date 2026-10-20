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
check('homepage uses concise Decision Proof teaser',home.includes('class="ff10-proof"'));
// Founder review 2026-10-20: Proof100 results are withdrawn for re-audit (frozen on a build later found to have a data-quality defect).
check('homepage teaser names frozen decisions without the withdrawn count',home.includes('<strong>Frozen decisions</strong>')&&!home.includes('100 frozen decisions'));
check('homepage teaser explains frozen-call methodology',home.includes('Every saved decision stays frozen and is checked against later evidence at 7, 14 and 30 days.'));
check('homepage proof CTA reaches dedicated page',home.includes('href="decision-proof.html">How proof works</a>'));
check('homepage does not duplicate detailed proof metrics',!home.includes('<strong>42</strong><span>Measurable at T7</span>')&&!home.includes('<strong>17</strong><span>Conservative signals reviewed</span>'));
check('homepage intentionally defers methodology detail',!home.includes('Proof100 checkpoint · September 18, 2026')&&!home.includes('Current economically eligible non-BUY review candidates'));

check('dedicated page title exists',page.includes('<title>Decision Proof | FlipForge</title>'));
check('dedicated page canonical exists',page.includes('https://goflipforge.com/decision-proof.html'));
check('dedicated page states Proof100 results are withdrawn for re-audit',page.includes('Proof100 results are withdrawn while we re-audit them.')&&page.includes('Status: October 20, 2026'))
check('withdrawn Proof100 figures are not published',!/17\/17|42 measurable|58 unresolved|Economically justified holds|Snapshot: September 18, 2026/.test(page));
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
check('dedicated page states the next-cohort plan',includesAll(page,['Freeze a new cohort','T7, T14 and T30 checkpoints','Unknown outcomes are never counted as wins or losses']));
check('dedicated page blocks universal performance claim',page.includes('does not prove that FlipForge will always make the right decision, guarantee profit, or establish a universal performance percentage'));
check('dedicated page keeps beta CTA',page.includes('href="beta-application.html">Request Beta Access</a>'));

check('FlipForge premium brand tokens are present',includesAll(css,[
  '--ff-proof-black:#05070a',
  '--ff-proof-gold:#d7b56d',
  '--ff-proof-gold-bright:#f0d79c',
  'background:linear-gradient(180deg,var(--ff-proof-gold-bright),var(--ff-proof-gold))'
]));
check('generic blue-green analytics tokens are retired',!css.includes('--ff-proof-blue')&&!css.includes('--ff-proof-green'));
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
console.log('PASS: concise homepage Decision Proof teaser and governed methodology page validated.');
