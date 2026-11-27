// Research content governance (v1): the versioned source, its arithmetic, publication gating on public pages,
// provider-rights separation, honest labelling and analytics coverage. Static; no network.
import fs from 'node:fs';
import {load, render, approved, caseMath, modeledListings} from './build-research-sections.mjs';

const read = p => fs.readFileSync(p, 'utf8');
const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money2 = n => '$' + Number(n).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
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
check('R10 every case study and Decision File has its own publication status', [...data.caseStudies, ...data.decisionFiles]
  .every(x => x.publication && data.publicationStatuses[x.publication.status] && Array.isArray(x.publication.blockers)));
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
const shownFiles = renderedIds('data-rx-file');
const unapprovedShown = [...shownFindings.filter(id => !approved(f(id))), ...shownCases.filter(id => !approved(data.caseStudies.find(c => c.id === id))),
  ...shownFiles.filter(n => !approved(data.decisionFiles.find(d => d.number === n))).map(n => `file ${n}`)];
check('P03 every finding, case and Decision File rendered on a public page is approved', unapprovedShown.length === 0, unapprovedShown.join(', '));
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
const oneIds = [...(oneOut.homeLead + oneOut.homeAdvantage + oneOut.proofResearch).matchAll(/data-rx-finding="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean);
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

// ---- G: Group A publication (founder approval Nov 25, 2026) --------------------------------------------------------
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const pubText = text(pub);
const previewHome = render(data, {preview: true});
// Per-listing detail of an AGGREGATE_ONLY finding (card, ask, value, modeled result) never reaches a public page.
const aggregateOnly = data.findings.filter(x => x.publicDetail === 'AGGREGATE_ONLY' && x.listings);
const listingStrings = aggregateOnly.flatMap(x => modeledListings(x).flatMap(l => [l.card, l.ask.toFixed(2), l.value.toFixed(2), Math.abs(l.result).toFixed(2)]));
check('G01 aggregate-only findings publish counts and totals only: no listing card, ask, value or modeled result on a public page',
  aggregateOnly.length > 0 && listingStrings.every(s => !pubText.includes(s)) && listingStrings.some(s => text(previewHome.proofResearch).includes(s)),
  listingStrings.filter(s => pubText.includes(s)).join(', '));
// A methodology-only finding appears only inside the methodology section, never as a headline or dashboard metric.
const methodologyOnly = data.findings.filter(x => x.placement === 'methodology');
const methodBlock = (pub.match(/<section[^>]*id="methodology"[\s\S]*?<\/section>/) || [''])[0];
const outsideMethod = pub.replace(methodBlock, '');
check('G02 methodology-only findings (software testing) render only in the methodology section',
  methodologyOnly.length > 0 && methodologyOnly.every(x => !approved(x) || (methodBlock.includes(`data-rx-finding="${x.id}"`) && !outsideMethod.includes(x.id) && !text(outsideMethod).includes(x.display))));
check('G03 the diagnostic valuation difference is never on the homepage, public or preview', ![home, previewHome.homeLead, previewHome.homeAdvantage]
  .some(h => h.includes('valuation-diagnostic') || text(h).includes(f('valuation-diagnostic').display)));
// No figure that is not approved appears in public text, whatever element carries it (tile, chart, table, metadata).
// Approved content is checked by identity, not by number: the approved items' own words (label, sample, method,
// limitations, summaries) are removed first, so "Of 575 target-grade records" inside an approved finding is not read as
// a publication of the unapproved 575; the same figure anywhere else still is.
const leaksIn = (d, html) => {
  const restricted = [...d.findings.filter(x => !approved(x)).map(x => x.display),
    ...d.caseStudies.filter(c => !approved(c)).flatMap(c => [c.facts.ask, c.facts.earlierValue, c.facts.reference, c.facts.secondReference, c.facts.maxBuy]
      .map(n => Number.isInteger(n) ? '$' + n.toLocaleString('en-US') : money2(n)).concat([money2(caseMath(c).loss), money2(caseMath(c).lossAtMaxBuy), '$' + caseMath(c).discount]))]
    .filter(s => s.length >= 3 || /[%$]/.test(s));
  const ownWords = [...d.findings.filter(approved).flatMap(x => [x.label, x.sample, x.method, ...(x.limitations || [])]),
    ...d.decisionFiles.filter(approved).flatMap(x => [x.title, x.summary, x.sampleSize, x.method, ...(x.limitations || [])]),
    ...d.caseStudies.filter(approved).flatMap(c => [c.title, c.card, ...(c.limitations || [])])].filter(Boolean).map(s => text(esc(s)).trim()).filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let pageText = text(html) + ' ' + [...html.matchAll(/<meta[^>]+content="([^"]*)"/g)].map(m => m[1]).join(' ');
  ownWords.forEach(w => { pageText = pageText.split(w).join(' '); });
  return {restricted, leaks: restricted.filter(s => new RegExp(`(^|[^\\d.,])${s.replace(/[$.*+?^()|[\]\\]/g, '\\$&')}(?![\\d])`).test(pageText))};
};
const live = leaksIn(data, home + proof);
const qualifiedOnly = JSON.parse(JSON.stringify(data));
approve(qualifiedOnly.findings.find(x => x.id === 'records-qualified'));
const qOut = render(qualifiedOnly, {preview: false});
const qHtml = qOut.homeLead + qOut.homeAdvantage + qOut.proofResearch;
const planted = leaksIn(data, home + proof + '<p>Evidence excluded: ' + f('evidence-excluded').display + '</p>');
check('G04 no unapproved figure appears anywhere on the public pages (text, charts, tables, meta tags); an approved finding\'s own text is not a leak',
  live.restricted.length > 5 && live.leaks.length === 0
  && qHtml.includes('data-rx-finding="records-qualified"') && leaksIn(qualifiedOnly, qHtml).leaks.length === 0
  && planted.leaks.includes(f('evidence-excluded').display), live.leaks.join(', ') + ' | ' + leaksIn(qualifiedOnly, qHtml).leaks.join(', '));
const strip0 = render(data, {preview: false}).homeLead;
check('G05 the leading modeled finding states its sample, assumptions and limitations beside it', !approved(f('apparent-bargains-unprofitable'))
  || (strip0.includes('class="ff-rx-lead"') && strip0.includes('How it was modeled') && strip0.includes('13% selling fees') && strip0.includes(f('apparent-bargains-unprofitable').sample)
    && strip0.includes('Modeled, not realized') && strip0.includes('avoided loss') && !strip0.includes('Issue #')));
check('G06 the methodology section labels every classification on the public page', Object.keys(data.classifications).length > 0
  && methodBlock.includes('id="methodology"') && ['Measured research', 'Modeled economics', 'Synthetic validation', 'Independently verified outcome'].every(l => methodBlock.includes(l)));

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
  // Only MEASURED is independently verified; PROVIDER_REPORTED horizons may be published with a zero verified count.
  const anyMeasured = later.some(x => x.status === 'MEASURED');
  if (later.some(x => !['PENDING', 'MEASURED', 'PROVIDER_REPORTED'].includes(x.status))) return false;
  return pendingLabelled && (count === 0 ? !anyMeasured : anyMeasured);
};
const measuredFixture = JSON.parse(JSON.stringify(data));
Object.assign(measuredFixture.findings.find(x => x.id === 'independent-outcomes-measured'), {value: 1, display: '1'});
measuredFixture.accountability.horizons.filter(x => x.key !== 'D0').forEach(x => Object.assign(x, {status: 'PENDING', statusText: 'Validation pending'}));
Object.assign(measuredFixture.accountability.horizons.find(x => x.key === 'D7'), {status: 'MEASURED', statusText: '1 independently verified outcome'});
const contradiction = JSON.parse(JSON.stringify(data));
Object.assign(contradiction.findings.find(x => x.id === 'independent-outcomes-measured'), {value: 3, display: '3'});
// Built explicitly (not inherited from the live data): every follow-up horizon pending, yet a positive count.
contradiction.accountability.horizons.filter(x => x.key !== 'D0').forEach(x => Object.assign(x, {status: 'PENDING', statusText: 'Validation pending'}));
check('H05 pending horizons say validation is pending, and the verified-outcome count agrees with the horizons', horizonsHonest(data));
const providerFixture = JSON.parse(JSON.stringify(data));
Object.assign(providerFixture.findings.find(x => x.id === 'independent-outcomes-measured'), {value: 0, display: '0'});
providerFixture.accountability.horizons.filter(x => x.key !== 'D0').forEach(x => Object.assign(x, {status: 'PENDING', statusText: 'Validation pending'}));
Object.assign(providerFixture.accountability.horizons.find(x => x.key === 'D7'), {status: 'PROVIDER_REPORTED', statusText: 'Provider-reported, not independently verified'});
check('H05c provider-reported horizons may be published with zero independently verified outcomes', horizonsHonest(providerFixture));
check('H05b real outcomes can be published from the source alone, and a count with every horizon pending is refused',
  horizonsHonest(measuredFixture) && !horizonsHonest(contradiction));
// Fixtures are built explicitly, never inherited from the live data, so the checks hold however the data moves on.
const pendingFixture = JSON.parse(JSON.stringify(data));
Object.assign(pendingFixture.findings.find(x => x.id === 'independent-outcomes-measured'), {value: 0, display: '0'});
pendingFixture.accountability.horizons.filter(x => x.key !== 'D0').forEach(x => Object.assign(x, {status: 'PENDING', statusText: 'Validation pending'}));
approve(pendingFixture.findings.find(x => x.id === 'records-qualified'));
const outcomeFixture = JSON.parse(JSON.stringify(measuredFixture));
approve(outcomeFixture.findings.find(x => x.id === 'records-qualified'));
const outcomeHome = render(outcomeFixture, {preview: false}).homeAdvantage;
check('P19 the homepage outcome sentence follows the source (no "validation pending" once outcomes are measured)',
  outcomeHome.includes('Independently verified purchasing outcomes: 1 (Day 7)') && !outcomeHome.includes('validation pending')
  && render(pendingFixture, {preview: false}).homeAdvantage.includes('validation pending'));
check('H06 Proof100 stays withdrawn and its figures stay off the pages', data.proof100.status === 'WITHDRAWN'
  && !/17\/17|42 measurable|58 unresolved|100 frozen decisions/.test(home + proof));
check('H07 the comparison disclaims judging specific products', data.comparison.note.includes('not of any specific product'));
check('H08 every Decision File states dates, sample and a beta call to action', data.decisionFiles.every(d => d.researchDates && d.sampleSize && d.cta === 'Request Beta Access'));
// Founder approval Nov 27, 2026: the seven-layer CDI framework brand graphic sits in "More than a price" (the one
// documented exception). Every other image, and any app screen, is still refused in research blocks.
const APPROVED_RESEARCH_GRAPHIC = /<img\b[^>]*\bsrc="assets\/images\/ff-cdi-framework-7-layer-v1-836\.webp"[^>]*>/g;
check('H09 no fabricated app screen: research blocks embed no images except the approved CDI framework graphic',
  !/<img\b/.test(previewAll.replace(APPROVED_RESEARCH_GRAPHIC, '')));
check('H11 the approved framework graphic appears once, only in "More than a price", with its phone crop and a full alt text',
  (previewAll.match(APPROVED_RESEARCH_GRAPHIC) || []).length === 1
  && /id="beyond-price"[\s\S]*ff-gfx-framework[\s\S]*ff-cdi-framework-7-layer-m-v1\.webp[\s\S]*alt="The seven-layer Card Decision Intelligence framework\.[^"]{200,}"[\s\S]*<\/section>/.test(previewAll)
  && !/\bproven\b/i.test((previewAll.match(/alt="The seven-layer[^"]*"/) || [''])[0]));

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
