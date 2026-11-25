// Research content governance (v1): the versioned source, its arithmetic, publication gating on public pages,
// provider-rights separation, honest labelling and analytics coverage. Static; no network.
import fs from 'node:fs';
import {load, render, approved, caseMath, modeledListings} from './build-research-sections.mjs';

const read = p => fs.readFileSync(p, 'utf8');
const failures = [];
let total = 0;
const check = (name, ok, detail = '') => {
  total += 1;
  if (!ok) failures.push(`${name}${detail ? ` [${detail}]` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};
const block = (page, key) => {
  const s = page.indexOf(`<!-- ff-research:${key}:start`);
  const e = page.indexOf(`<!-- ff-research:${key}:end -->`);
  return s >= 0 && e > s ? page.slice(s, e) : null;
};

const data = load();
const home = read('index.html');
const proof = read('decision-proof.html');
const byId = new Map(data.findings.map(f => [f.id, f]));
const f = id => byId.get(id);

// ---- R: the source ------------------------------------------------------------------------------------------------
check('R01 the source is versioned and dated', /^\d{4}-\d{2}-\d{2}\.\d+$/.test(data.version) && /^\d{4}-\d{2}-\d{2}$/.test(data.asOf));
check('R02 the source references backend issue #1024 and PRs #1020-#1023', data.synchronization.backendIssue.endsWith('/issues/1024')
  && [1020, 1021, 1022, 1023].every(n => data.synchronization.relatedPullRequests.some(p => p.number === n)));
const required = ['id', 'label', 'value', 'unit', 'display', 'classification', 'source', 'sample', 'method', 'limitations', 'publication'];
check('R03 every finding states value, classification, source, sample, method, limitations and publication status',
  data.findings.every(x => required.every(k => x[k] !== undefined && x[k] !== '')));
check('R04 every classification and publication status is a known one', data.findings.every(x =>
  data.classifications[x.classification] && data.publicationStatuses[x.publication.status]));
check('R05 every finding names a recorded source', data.findings.every(x => data.sources.some(s => s.id === x.source)));
check('R06 ids are unique', new Set(data.findings.map(x => x.id)).size === data.findings.length);
check('R07 the source is never served (/contracts/* answers 404)', read('netlify/modern-functions/internal-path-guard.mjs').includes('"/contracts/*"'));
check('R08 the internal preview folder is git-ignored, answers 404 and is stripped from the publish directory', read('.gitignore').split(/\r?\n/).includes('research-preview/')
  && read('netlify/modern-functions/internal-path-guard.mjs').includes('"/research-preview/*"') && read('scripts/strip-internal-from-publish.mjs').includes('"research-preview"'));
check('R09 the research preview never writes into the published marketing preview', !read('scripts/build-research-sections.mjs').includes("'marketing-preview'"));

// ---- A: arithmetic, recomputed ---------------------------------------------------------------------------------------
const [ex, q, h, r] = ['records-examined', 'records-qualified', 'records-held', 'records-rejected'].map(id => f(id).value);
check('A01 examined = qualified + held + rejected (575 = 399 + 167 + 9)', ex === q + h + r);
check('A02 held reasons add up to the held total', f('records-held').breakdown.reduce((n, b) => n + b.value, 0) === h);
check('A03 evidence excluded = (held + rejected) / examined, one decimal', f('evidence-excluded').value === Math.round(1000 * (h + r) / ex) / 10
  && f('evidence-excluded').derivation.numerator === h + r);
check('A04 listing coverage = 38 / 40', f('listing-coverage').value === 100 * 38 / 40 && f('listings-evaluated').value === 38);
const diffs = f('valuation-diagnostic').cards.map(c => Math.abs(c.flipforge - c.reference) / c.reference).sort((a, b) => a - b);
const median = diffs.length % 2 ? diffs[(diffs.length - 1) / 2] : (diffs[diffs.length / 2 - 1] + diffs[diffs.length / 2]) / 2;
check('A05 the diagnostic median recomputes to the stated value', Math.round(10000 * median) / 100 === f('valuation-diagnostic').value, String(median));
const listings = modeledListings(f('apparent-bargains-unprofitable'));
const losing = listings.filter(l => l.result < 0);
check('A06 apparent bargains: the stated count of unprofitable listings recomputes', losing.length === f('apparent-bargains-unprofitable').value
  && listings.length === f('apparent-bargains-unprofitable').derivation.of);
const lossSum = Math.round(100 * losing.reduce((n, l) => n - l.result, 0)) / 100;
const capital = Math.round(100 * losing.reduce((n, l) => n + l.ask, 0)) / 100;
check('A07 modeled losses and capital at risk recompute', lossSum === f('modeled-losses-three').value
  && capital === f('modeled-losses-three').derivation.capitalAtRisk
  && Math.round(10000 * lossSum / capital) / 100 === f('modeled-losses-three').derivation.share, `${lossSum} ${capital}`);
const cm = caseMath(data.caseStudies[0]);
check('A08 case study: $280 discount, -$157.43 at the ask, -$137.76 at Max Buy', cm.discount === 280 && cm.loss === 157.43 && cm.lossAtMaxBuy === 137.76,
  JSON.stringify(cm));
check('A09 the case study discloses the Max Buy loss and the self-referenced discount', data.caseStudies[0].limitations.some(l => l.includes('137.76'))
  && data.caseStudies[0].limitations.some(l => l.includes("FlipForge's own earlier value")));

// ---- P: publication gating on public pages ---------------------------------------------------------------------------
const publicBlocks = [block(home, 'home-lead'), block(home, 'home-advantage'), block(proof, 'proof')];
check('P01 every research block is present on its page', publicBlocks.every(Boolean));
const pub = publicBlocks.join('\n');
const expected = render(data, {preview: false});
check('P02 the public pages are exactly the public render of the source (no hand edits)',
  block(home, 'home-lead').includes(expected.homeLead) && block(proof, 'proof').includes(expected.proofResearch)
  && (expected.homeAdvantage === '' || block(home, 'home-advantage').includes(expected.homeAdvantage)));
// Publication is checked by identity: every finding and case the generator rendered on a public page is tagged
// (data-rx-finding / data-rx-case) and must be approved. A number that merely appears inside an approved finding's own
// text (for example "Of 575 records") is not a publication of another finding.
const renderedIds = attr => [...pub.matchAll(new RegExp(`${attr}="([^"]*)"`, 'g'))].flatMap(m => m[1].split(/\s+/)).filter(Boolean);
const shownFindings = renderedIds('data-rx-finding');
const shownCases = renderedIds('data-rx-case');
const unapprovedShown = [...shownFindings.filter(id => !approved(f(id))), ...shownCases.filter(id => !approved(data.caseStudies.find(c => c.id === id)))];
check('P03 every finding and case rendered on a public page is approved', unapprovedShown.length === 0, unapprovedShown.join(', '));
const preview4 = render(data, {preview: true});
const previewTagged = (preview4.homeLead + preview4.homeAdvantage + preview4.proofResearch).match(/data-rx-finding="[^"]*"/g) || [];
check('P04 every rendered statistic, row, chart and file carries its finding identity (so P03 sees all of it)',
  previewTagged.length >= 15 && !/<li class="ff-rx-stat"><strong>[^<]*<span class="ff-rx-num"/.test(preview4.homeLead + preview4.homeAdvantage)
  && (preview4.proofResearch.match(/<tr data-rx-class="[^"]*" data-rx-finding=/g) || []).length === (preview4.proofResearch.match(/<tr data-rx-class=/g) || []).length);
check('P05 the case study is public only when approved', approved(data.caseStudies[0]) || !pub.includes(data.caseStudies[0].title));
check('P06 no "preview" marker ever reaches a public page', !/Preview · not approved|data-rx-preview|INTERNAL PREVIEW/.test(home + proof));
check('P07 UNRECONCILED and WITHDRAWN figures never appear, public or preview', data.findings
  .filter(x => ['UNRECONCILED', 'WITHDRAWN'].includes(x.publication.status))
  .every(x => !pub.includes(x.display) && !render(data, {preview: true}).homeLead.includes(x.display)));
const hciSource = id => (data.sources.find(s => s.id === id) || {}).provider === 'Hobby Card Index';
const hciUsed = [...data.findings.filter(x => approved(x) && hciSource(x.source)),
  ...data.caseStudies.filter(c => approved(c) && (c.sources || []).some(hciSource))];
check('P08 the licensed provider is named on public pages only beside an approved figure of its own', hciUsed.length > 0 || !pub.includes('Hobby Card Index'));
check('P09 an approved provider-derived figure carries its required attribution', hciUsed.length === 0 || pub.includes('Prices from Hobby Card Index'));
check('P10 an approval needs an approver, a date and no open blocker', data.findings.filter(x => x.publication.status === 'APPROVED')
  .every(x => x.publication.approvedBy && x.publication.approvedOn && x.publication.blockers.length === 0));
check('P11 the former listing-data provider is never named', !/card[\s_-]*sight/i.test(home + proof + JSON.stringify(data)));
const anchors = [...pub.matchAll(/href="decision-proof\.html#([\w-]+)"/g)].map(m => m[1]);
check('P13 every homepage link into Decision Proof lands on a section that exists on the public page', anchors.length > 0
  && anchors.every(id => proof.includes(`id="${id}"`)), anchors.join(', '));
const previewProof = render(data, {preview: true}).proofResearch;
const previewAnchors = [...(render(data, {preview: true}).homeLead + render(data, {preview: true}).homeAdvantage).matchAll(/href="decision-proof\.html#([\w-]+)"/g)].map(m => m[1]);
check('P14 in the preview, the same links land on sections the preview renders', previewAnchors.every(id => previewProof.includes(`id="${id}"`)), previewAnchors.join(', '));
check('P12 the research pages carry no inline style attributes', !/<[^>]+\sstyle="/.test(home) && !/<[^>]+\sstyle="/.test(proof));

const future = JSON.parse(JSON.stringify(data));
future.findings.push({id: 'synthetic-d7-outcome-check', label: 'SYNTHETIC CHECK: D7 independently verified outcomes', value: 12, unit: 'count',
  display: '12', classification: 'INDEPENDENTLY_VERIFIED_OUTCOME', source: data.sources[0].id, sample: 'validation fixture', method: 'fixture',
  limitations: [], publication: {status: 'APPROVED', blockers: [], approvedBy: 'validation fixture', approvedOn: '2026-11-25'}});
const futureProof = render(future, {preview: false}).proofResearch;
const approve = item => Object.assign(item.publication, {status: 'APPROVED', blockers: [], approvedBy: 'validation fixture', approvedOn: '2026-11-25'});
const oneApproved = JSON.parse(JSON.stringify(data));
approve(oneApproved.findings.find(x => x.id === 'records-qualified'));
const oneOut = render(oneApproved, {preview: false});
const oneIds = [...(oneOut.homeLead + oneOut.homeAdvantage + oneOut.proofResearch).matchAll(/data-rx-finding="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/));
check('P17 approving one finding publishes it alone (other findings in its text are not counted as published)',
  oneIds.includes('records-qualified') && oneIds.every(id => id === 'records-qualified' || approved(oneApproved.findings.find(x => x.id === id))));
const caseOnly = JSON.parse(JSON.stringify(data));
approve(caseOnly.caseStudies[0]);
const caseOut = render(caseOnly, {preview: false}).homeLead;
check('P18 an approved provider-derived case study renders with its required credit',
  caseOut.includes('data-rx-case="ohtani-280-bargain"') && caseOut.includes('Prices from Hobby Card Index'));
check('P15 a newly approved outcome added only to the source is published in the research center (no code change)',
  futureProof.includes('SYNTHETIC CHECK: D7 independently verified outcomes') && futureProof.includes('id="decision-advantage"'));
check('P16 the chart tooltip, mounted outside the research sections, has literal opaque colours',
  /\.ff-rx-tip\{[^}]*background:#FFFFFF;color:#000000/.test(read('assets/css/research-sections-v1.css')));

// ---- H: honest labelling ---------------------------------------------------------------------------------------------
const preview = render(data, {preview: true});
const previewAll = preview.homeLead + preview.homeAdvantage + preview.proofResearch;
check('H01 the diagnostic difference is never called accuracy and always says it is not', !/accuracy/i.test(f('valuation-diagnostic').label)
  && previewAll.includes('A diagnostic, not valuation accuracy'));
check('H02 modeled economics are labelled modeled and never as realized', data.findings.filter(x => x.classification === 'MODELED_ECONOMIC')
  .every(x => !/realized|avoided/i.test(x.label)) && previewAll.includes('not an avoided-loss rate'));
check('H03 the case study is labelled a historical research case with a modeled outcome', previewAll.includes('Historical research case · modeled outcome')
  && previewAll.includes('Not a realized customer loss and not an independently verified checkpoint'));
check('H04 synthetic validation is never presented as purchasing accuracy', data.classifications.SYNTHETIC_VALIDATION.includes('says nothing about market accuracy')
  && data.accountability.rule.includes('completed software testing is never shown as purchasing accuracy'));
// Pending horizons say so; the verified-outcome count agrees with the horizons (zero only while every follow-up
// horizon is pending, positive only when at least one horizon is measured). Real results need no code change.
const horizonsHonest = d => {
  const later = d.accountability.horizons.filter(x => x.key !== 'D0');
  const count = d.findings.find(x => x.id === 'independent-outcomes-measured').value;
  const pendingLabelled = later.every(x => x.status !== 'PENDING' || x.statusText === 'Validation pending');
  const anyMeasured = later.some(x => x.status !== 'PENDING');
  return pendingLabelled && (count === 0 ? !anyMeasured : anyMeasured);
};
const measuredFixture = JSON.parse(JSON.stringify(data));
measuredFixture.findings.find(x => x.id === 'independent-outcomes-measured').value = 1;
Object.assign(measuredFixture.accountability.horizons.find(x => x.key === 'D7'), {status: 'MEASURED', statusText: '1 independently verified outcome'});
const contradiction = JSON.parse(JSON.stringify(data));
contradiction.findings.find(x => x.id === 'independent-outcomes-measured').value = 3;
check('H05 pending horizons say validation is pending, and the verified-outcome count agrees with the horizons', horizonsHonest(data));
check('H05b real outcomes can be published from the source alone, and a count with every horizon pending is refused',
  horizonsHonest(measuredFixture) && !horizonsHonest(contradiction));
check('H06 Proof100 stays withdrawn and its figures stay off the pages', data.proof100.status === 'WITHDRAWN'
  && !/17\/17|42 measurable|58 unresolved|100 frozen decisions/.test(home + proof));
check('H07 the comparison disclaims judging specific products', data.comparison.note.includes('not of any specific product'));
check('H08 every Decision File states dates, sample and a beta call to action', data.decisionFiles.every(d => d.researchDates && d.sampleSize && d.cta === 'Request Beta Access'));
check('H09 no fabricated app screen: research blocks embed no images', !/<img\b/.test(previewAll));

// ---- E: analytics ----------------------------------------------------------------------------------------------------
const client = read('assets/js/conversion-events.js');
const server = read('netlify/modern-functions/conversion-event.mjs');
const js = read('assets/js/research-sections-v1.js');
const events = ['research_viewed', 'decision_proof_clicked', 'case_study_interacted', 'decision_file_opened'];
check('E01 research events are allow-listed in the browser and on the server', events.every(e => client.includes(`"${e}"`) && server.includes(`"${e}"`)));
const placements = new Set([...previewAll.matchAll(/data-rx-(?:section|proof-link)="([^"]+)"/g)].map(m => m[1])
  .concat([...previewAll.matchAll(/data-rx-file-cta="([^"]+)"/g)].map(m => `file-${m[1]}`)).concat(['case-study']));
const regex = new RegExp(client.match(/experiencePlacement=(\/\^\(.*\)\$\/);/)[1].slice(1, -1));
check('E02 every research placement is allow-listed in the browser and on the server', [...placements].every(p => regex.test(p) && server.includes(`"${p}"`)),
  [...placements].filter(p => !regex.test(p) || !server.includes(`"${p}"`)).join(', '));
check('E03 Decision Proof is a known analytics page and loads the tracker', client.includes('"/decision-proof.html":"decision-proof"')
  && server.includes('"decision-proof"') && proof.includes('assets/js/conversion-events.js'));
check('E04 the research script sends counts only, stores nothing and calls nothing', !/localStorage|sessionStorage|indexedDB|fetch\(|sendBeacon/.test(js)
  && js.includes("new CustomEvent('ff:conversion'"));
check('E05 counters keep the final value in the HTML and honour reduced motion', js.includes('prefers-reduced-motion') && /data-rx-count="575"[^>]*>575</.test(preview.homeLead));

if (failures.length) {
  console.error(`FAIL: ${failures.length} of ${total} research content checks`);
  failures.forEach(x => console.error(`- ${x}`));
  process.exit(1);
}
console.log(`PASS: ${total} research content governance checks.`);
