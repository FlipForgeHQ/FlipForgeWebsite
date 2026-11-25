// Renders every research block on the website from contracts/research-findings-v1.json (the one versioned source).
//
//   node scripts/build-research-sections.mjs            public build: writes the blocks into index.html and
//                                                       decision-proof.html. Only APPROVED findings with no open
//                                                       blocker appear; everything else is left out.
//   node scripts/build-research-sections.mjs --check    fails when either page has drifted from the source.
//   node scripts/build-research-sections.mjs --preview  internal preview: writes marketing-preview/index.html and
//                                                       marketing-preview/decision-proof.html with every reconciled
//                                                       finding, each marked with its publication status. The folder
//                                                       is git-ignored and never deployed.
//
// Nothing else on the site may hard-code a research statistic: change the JSON, then rebuild.
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = 'contracts/research-findings-v1.json';
const HOME = 'index.html';
const PROOF = 'decision-proof.html';
const PREVIEW_DIR = 'marketing-preview';
const BLOCKS = {
  homeLead: ['<!-- ff-research:home-lead:start (generated from contracts/research-findings-v1.json by scripts/build-research-sections.mjs; edit the JSON, not this block) -->', '<!-- ff-research:home-lead:end -->'],
  homeAdvantage: ['<!-- ff-research:home-advantage:start (generated from contracts/research-findings-v1.json by scripts/build-research-sections.mjs; edit the JSON, not this block) -->', '<!-- ff-research:home-advantage:end -->'],
  proofResearch: ['<!-- ff-research:proof:start (generated from contracts/research-findings-v1.json by scripts/build-research-sections.mjs; edit the JSON, not this block) -->', '<!-- ff-research:proof:end -->']
};

const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n, digits = 2) => '$' + Number(n).toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
const wholeMoney = n => Number.isInteger(n) ? money(n, 0) : money(n);
const pct = (n, digits = 1) => `${Number(n).toFixed(digits)}%`;
const round2 = n => Math.round(n * 100) / 100;

export function load(file = SOURCE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---- publication ------------------------------------------------------------------------------------------------

export function approved(item) {
  const p = item && item.publication;
  return Boolean(p && p.status === 'APPROVED' && Array.isArray(p.blockers) && p.blockers.length === 0 && p.approvedBy && p.approvedOn);
}
const showable = (item, preview) => approved(item) || (preview && item.publication && item.publication.status === 'INTERNAL_PREVIEW');

function context(data, preview) {
  const findings = new Map(data.findings.map(f => [f.id, f]));
  const cases = new Map(data.caseStudies.map(c => [c.id, c]));
  const get = id => {
    const f = findings.get(id);
    if (!f) throw new Error(`Unknown finding ${id}`);
    return f;
  };
  const can = id => showable(get(id), preview);
  const chip = item => (preview && !approved(item))
    ? ` <span class="ff-rx-chip" data-rx-status="${esc(item.publication.status)}">Preview · not approved</span>` : '';
  const label = cls => ({
    MEASURED_RESEARCH: 'Measured research', DIAGNOSTIC_COMPARISON: 'Diagnostic comparison', MODELED_ECONOMIC: 'Modeled economics',
    SYNTHETIC_VALIDATION: 'Synthetic validation', INDEPENDENTLY_VERIFIED_OUTCOME: 'Independently verified outcome',
    PROVIDER_REPORTED_OUTCOME: 'Provider-reported outcome'
  })[cls] || cls;
  const sourceOf = f => data.sources.find(s => s.id === f.source);
  const attribution = items => {
    const credits = new Set();
    items.forEach(f => { const s = sourceOf(f); if (s && s.attribution) credits.add(s.attribution); });
    return [...credits].map(c => `<p class="ff-rx-credit">${esc(c)}</p>`).join('');
  };
  return {data, preview, get, can, chip, label, sourceOf, cases, attribution};
}

// A counter keeps the final value in the HTML (no-JS, print and screen readers read it); the script only animates it.
function counter(f) {
  const decimals = f.unit === 'percent' ? (String(f.value).split('.')[1] || '').length : (f.unit === 'usd' ? 2 : 0);
  const prefix = f.unit === 'usd' ? '$' : '';
  const suffix = f.unit === 'percent' ? '%' : (f.display.includes(' of ') ? f.display.slice(String(f.value).length) : '');
  return `<span class="ff-rx-num" data-rx-count="${f.value}" data-rx-decimals="${decimals}" data-rx-prefix="${esc(prefix)}" data-rx-suffix="${esc(suffix)}">${esc(f.display)}</span>`;
}

// ---- homepage: research strip, case study, difference --------------------------------------------------------------

function strip(cx) {
  const ids = ['records-examined', 'evidence-excluded', 'listing-coverage'];
  const shown = ids.filter(cx.can).map(cx.get);
  const head = `    <div class="ff-rx-strip-head">
      <p class="ff-rx-eyebrow">FlipForge research · November 2026</p>
      <h2 id="ff-rx-strip-title" class="ff-rx-title">Built on evidence. <span>Not assumptions.</span></h2>
      <p class="ff-rx-sub">Real market data. Disciplined analysis. Accountable decisions.</p>
    </div>`;
  let body;
  if (shown.length) {
    const tiles = shown.map(f => `      <li class="ff-rx-stat">
        <strong>${counter(f)}</strong>
        <span>${esc(f.label)}${cx.chip(f)}</span>
        <small>${esc(f.sample)}</small>
      </li>`).join('\n');
    body = `    <ul class="ff-rx-stats" aria-label="November 2026 research findings">
${tiles}
    </ul>
    <p class="ff-rx-method">${esc(cx.label(shown[0].classification))}. ${esc(shown.map(f => cx.sourceOf(f).title + ', ' + cx.sourceOf(f).date).filter((v, i, a) => a.indexOf(v) === i).join('; '))}. Research findings, not a performance guarantee.</p>
    ${cx.attribution(shown)}`;
  } else {
    body = `    <ul class="ff-rx-stats ff-rx-pillars" aria-label="How FlipForge research works">
      <li class="ff-rx-stat"><strong class="ff-rx-word">Real</strong><span>Live listings and completed sales of the exact card</span></li>
      <li class="ff-rx-stat"><strong class="ff-rx-word">Disciplined</strong><span>Every price qualified, every decision priced after costs</span></li>
      <li class="ff-rx-stat"><strong class="ff-rx-word">Accountable</strong><span>Every decision frozen at Day 0 and reviewed at Days 7, 14 and 30</span></li>
    </ul>`;
  }
  return `<section class="ff-rx ff-rx-strip" id="research" aria-labelledby="ff-rx-strip-title" data-rx-section="research-strip">
  <div class="ff10-wrap">
${head}
${body}
    <a class="ff-rx-link" href="decision-proof.html#decision-advantage" data-rx-proof-link="research-strip">See the research in Decision Proof <span aria-hidden="true">→</span></a>
  </div>
</section>`;
}

export function caseMath(c) {
  const f = c.facts;
  const a = c.assumptions;
  const fees = round2(f.reference * a.feeRate);
  const net = round2(f.reference - fees - a.fulfilmentUsd);
  return {
    discount: round2(f.earlierValue - f.ask),
    fees,
    net,
    loss: round2(f.ask - net),
    lossAtMaxBuy: round2(f.maxBuy - net)
  };
}

function caseStudy(cx) {
  const c = cx.data.caseStudies[0];
  if (!showable(c, cx.preview)) return '';
  const f = c.facts;
  const m = caseMath(c);
  const feePct = Math.round(c.assumptions.feeRate * 100);
  return `<section class="ff-rx ff-rx-case ff10-light" id="decision-file-01" aria-labelledby="ff-rx-case-title" data-rx-section="case-study">
  <div class="ff10-wrap">
    <div class="ff-rx-case-head">
      <p class="ff-rx-eyebrow">FlipForge Decision File 01 · ${esc(c.kind)}${cx.chip(c)}</p>
      <h2 id="ff-rx-case-title" class="ff-rx-title">${esc(c.title)}</h2>
      <p class="ff-rx-case-card">${esc(c.card)}</p>
    </div>
    <ol class="ff-rx-ledger">
      <li><span>Asking price</span><strong>${wholeMoney(f.ask)}</strong><small>Live listing, ${esc(c.dates.evaluated)}</small></li>
      <li><span>Earlier FlipForge value</span><strong>${wholeMoney(f.earlierValue)}</strong><small>${f.earlierValueSales} exact sales, 90 days</small></li>
      <li class="ff-rx-ledger-gap"><span>Apparent discount</span><strong>${wholeMoney(m.discount)}</strong><small>What made it look like a bargain</small></li>
      <li><span>Original decision</span><strong class="ff-rx-verdict">${esc(f.verdict)}</strong><small>Max Buy ${money(f.maxBuy)}: wait, don’t buy at ${wholeMoney(f.ask)}</small></li>
      <li><span>Newer benchmark</span><strong>${wholeMoney(f.reference)}</strong><small>${f.referenceSales} qualified sales, ${esc(c.dates.reference)}</small></li>
      <li class="ff-rx-ledger-out"><span>Modeled outcome at ${wholeMoney(f.ask)}</span><strong>−${money(m.loss)}</strong><small>Modeled net loss</small></li>
    </ol>
    <details class="ff-rx-math" data-rx-case-math>
      <summary>See the modeled calculation</summary>
      <ol class="ff-rx-waterfall">
        <li><span>Resale at the newer benchmark</span><b>${money(f.reference)}</b></li>
        <li><span>Selling fees, ${feePct}%</span><b>−${money(m.fees)}</b></li>
        <li><span>Fulfilment</span><b>−${money(c.assumptions.fulfilmentUsd)}</b></li>
        <li class="ff-rx-waterfall-sub"><span>Modeled net proceeds</span><b>${money(m.net)}</b></li>
        <li><span>Paid at the asking price</span><b>−${money(f.ask)}</b></li>
        <li class="ff-rx-waterfall-total"><span>Modeled net result</span><b>−${money(m.loss)}</b></li>
      </ol>
      <p>Assumes ${feePct}% selling fees and ${money(c.assumptions.fulfilmentUsd)} fulfilment. A second provider’s qualified median was ${wholeMoney(f.secondReference)} (${esc(f.secondReferenceLabel)}).</p>
    </details>
    <p class="ff-rx-closing">${esc(c.closing)}</p>
    <ul class="ff-rx-limits" aria-label="Limitations">
${c.limitations.map(l => `      <li>${esc(l)}</li>`).join('\n')}
    </ul>
    ${cx.attribution([{source: 'hci-pilot-2026-11-24'}])}
    <div class="ff10-actions ff-rx-actions">
      <a class="ff10-btn ff10-btn-black" href="beta-application.html">Request Beta Access</a>
      <a class="ff10-btn ff10-btn-line-dark" href="decision-proof.html#decision-files" data-rx-proof-link="case-study">Read the Decision Files</a>
    </div>
  </div>
</section>`;
}

function difference(cx) {
  const d = cx.data.comparison;
  const rows = d.rows.map(([a, b]) => `        <tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('\n');
  return `<section class="ff-rx ff-rx-diff" id="beyond-price" aria-labelledby="ff-rx-diff-title" data-rx-section="difference">
  <div class="ff10-wrap ff-rx-diff-grid">
    <div>
      <p class="ff-rx-eyebrow">The difference</p>
      <h2 id="ff-rx-diff-title" class="ff-rx-title">${esc(d.title)}</h2>
      <p class="ff-rx-sub">Anyone can show you a price. FlipForge shows you whether the evidence justifies the purchase.</p>
    </div>
    <table class="ff-rx-compare">
      <caption class="ff10-sr">Price-based analysis compared with the FlipForge approach</caption>
      <thead><tr><th scope="col">Price-based analysis</th><th scope="col">FlipForge</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
    <p class="ff-rx-note">${esc(d.note)}</p>
  </div>
</section>`;
}

function homeAdvantage(cx) {
  const ids = ['records-qualified', 'valuation-diagnostic', 'apparent-bargains-unprofitable'];
  const shown = ids.filter(cx.can).map(cx.get);
  if (!shown.length) return '';
  const tiles = shown.map(f => `      <li class="ff-rx-stat"><strong>${counter(f)}</strong><span>${esc(f.label)}${cx.chip(f)}</span><small>${esc(cx.label(f.classification))} · ${esc(f.sample)}</small></li>`).join('\n');
  return `<section class="ff-rx ff-rx-adv ff10-light" id="decision-advantage-teaser" aria-labelledby="ff-rx-adv-title" data-rx-section="advantage">
  <div class="ff10-wrap">
    <p class="ff-rx-eyebrow">Research center</p>
    <h2 id="ff-rx-adv-title" class="ff-rx-title">The FlipForge Decision Advantage</h2>
    <ul class="ff-rx-stats ff-rx-stats-light" aria-label="Decision Advantage research highlights">
${tiles}
    </ul>
    <p class="ff-rx-method">Measured research, diagnostic comparisons and modeled economics are labelled separately. Independently verified purchasing outcomes: validation pending.</p>
    ${cx.attribution(shown)}
    <a class="ff-rx-link ff-rx-link-dark" href="decision-proof.html#decision-advantage" data-rx-proof-link="advantage">Open the research center <span aria-hidden="true">→</span></a>
  </div>
</section>`;
}

// ---- Decision Proof: dashboard, charts, accountability, Decision Files -------------------------------------------

function tableView(caption, head, rows) {
  return `<details class="ff-rx-table"><summary>Table view</summary><table><caption class="ff10-sr">${esc(caption)}</caption><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
}

// Bars are SVG geometry (widths are attributes, never inline styles: the pages forbid style="" and keep a strict CSP).
// Each mark has a bigger transparent hit target carrying its tooltip; every chart also has a table view.
const f2 = n => Number(n).toFixed(2);
function hbar(width, cls, tip, {height = 14, offset = 0} = {}) {
  return `<svg class="ff-rx-svgbar" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="ff-rx-track" x="0" y="0" width="100" height="${height}"></rect><rect class="${cls}" x="${f2(offset)}" y="0" width="${f2(Math.max(width, 0.6))}" height="${height}" rx="2"></rect></svg><button type="button" class="ff-rx-hit" data-rx-tip="${esc(tip)}"><span class="ff10-sr">${esc(tip)}</span></button>`;
}

function qualificationChart(cx) {
  const ids = ['records-examined', 'records-qualified', 'records-held', 'records-rejected'];
  if (!ids.every(cx.can)) return '';
  const [total, q, h, r] = ids.map(cx.get);
  // One stacked bar: qualified (gold, the emphasis), held (silver), rejected (outlined, hatched). 2px surface gaps.
  let x = 0;
  const parts = [[q, 'ff-rx-q'], [h, 'ff-rx-h'], [r, 'ff-rx-r']].map(([f, cls]) => {
    const w = 100 * f.value / total.value;
    const rect = `<rect class="${cls}" x="${f2(x)}" y="0" width="${f2(Math.max(w - 0.4, 0.6))}" height="18" rx="2"></rect>`;
    x += w;
    return rect;
  }).join('');
  const legend = [[q, 'q'], [h, 'h'], [r, 'r']].map(([f, k]) => `<li class="ff-rx-key-${k}"><i aria-hidden="true"></i>${esc(f.label)} <b>${f.value}</b></li>`).join('');
  const max = Math.max(...h.breakdown.map(b => b.value));
  const causes = h.breakdown.map(b => `<li><span>${esc(b.label)}</span><div class="ff-rx-barcell">${hbar(100 * b.value / max, 'ff-rx-h', `${b.label}: ${b.value} records`)}</div><b>${b.value}</b></li>`).join('');
  return `<figure class="ff-rx-chart" aria-labelledby="ff-rx-q-cap">
        <figcaption id="ff-rx-q-cap"><strong>Evidence qualification</strong> ${total.value} target-grade sale records${cx.chip(total)}</figcaption>
        <div class="ff-rx-stack"><svg class="ff-rx-svgbar ff-rx-svgstack" viewBox="0 0 100 18" preserveAspectRatio="none" role="img" aria-label="${esc(`${q.value} qualified, ${h.value} held, ${r.value} rejected, of ${total.value}`)}"><defs><pattern id="ff-rx-hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1" height="2" class="ff-rx-hatchline"></rect></pattern></defs>${parts}</svg></div>
        <ul class="ff-rx-keys">${legend}</ul>
        <p class="ff-rx-chart-sub">Why ${h.value} records were held</p>
        <ul class="ff-rx-hbars">${causes}</ul>
        ${tableView('Evidence qualification', ['Category', 'Records'], [[q.label, q.value], [h.label, h.value], ...h.breakdown.map(b => ['Held: ' + b.label, b.value]), [r.label, r.value], [total.label, total.value]])}
      </figure>`;
}

function diagnosticChart(cx) {
  if (!cx.can('valuation-diagnostic')) return '';
  const f = cx.get('valuation-diagnostic');
  const rows = f.cards.map(c => ({card: c.card, ff: c.flipforge, ref: c.reference, diff: 100 * Math.abs(c.flipforge - c.reference) / c.reference}))
    .sort((a, b) => a.diff - b.diff);
  const max = Math.max(...rows.map(r => r.diff));
  const bars = rows.map(r => `<li><span>${esc(r.card)}</span><div class="ff-rx-barcell">${hbar(100 * r.diff / max, 'ff-rx-q', `FlipForge ${wholeMoney(r.ff)} vs reference ${wholeMoney(r.ref)}: ${pct(r.diff)}`)}</div><b>${pct(r.diff)}</b></li>`).join('');
  return `<figure class="ff-rx-chart" aria-labelledby="ff-rx-d-cap">
        <figcaption id="ff-rx-d-cap"><strong>Diagnostic valuation difference</strong> FlipForge value vs a licensed provider’s qualified median, ${f.cards.length} cards. Median ${esc(f.display)}${cx.chip(f)}</figcaption>
        <ul class="ff-rx-hbars">${bars}</ul>
        <p class="ff-rx-chart-note">A diagnostic, not valuation accuracy: neither value is an independently verified later outcome.</p>
        ${tableView('Diagnostic valuation difference', ['Card', 'FlipForge', 'Reference', 'Difference'], rows.map(r => [r.card, wholeMoney(r.ff), wholeMoney(r.ref), pct(r.diff)]))}
      </figure>`;
}

export function modeledListings(f) {
  return f.listings.map(l => {
    const net = round2(l.value * (1 - f.assumptions.feeRate) - f.assumptions.fulfilmentUsd);
    return {...l, net, result: round2(net - l.ask)};
  });
}

function economicsChart(cx) {
  if (!cx.can('apparent-bargains-unprofitable')) return '';
  const f = cx.get('apparent-bargains-unprofitable');
  const rows = modeledListings(f);
  const max = Math.max(...rows.map(r => Math.abs(r.result)));
  // Diverging around a centre baseline: gains extend right in gold, losses extend left in hatched silver; signed labels.
  const bars = rows.map(r => {
    const w = 50 * Math.abs(r.result) / max;
    const neg = r.result < 0;
    const label = `${neg ? '−' : '+'}${money(Math.abs(r.result))}`;
    return `<li class="${neg ? 'ff-rx-neg' : 'ff-rx-pos'}"><span>${esc(r.card)}<em>Ask ${money(r.ask)} · ${esc(r.verdict)}</em></span><div class="ff-rx-barcell">${hbar(w, neg ? 'ff-rx-loss' : 'ff-rx-q', `Modeled net proceeds ${money(r.net)} vs ask ${money(r.ask)}: ${label}`, {offset: neg ? 50 - w : 50})}<i class="ff-rx-zero" aria-hidden="true"></i></div><b>${label}</b></li>`;
  }).join('');
  const feePct = Math.round(f.assumptions.feeRate * 100);
  return `<figure class="ff-rx-chart" aria-labelledby="ff-rx-e-cap">
        <figcaption id="ff-rx-e-cap"><strong>Apparent bargains, after costs</strong> ${esc(f.display)} modeled as unprofitable at their asking price${cx.chip(f)}</figcaption>
        <ul class="ff-rx-hbars ff-rx-diverge">${bars}</ul>
        <p class="ff-rx-chart-note">Modeled with FlipForge’s own value as the resale price, ${feePct}% fees and ${money(f.assumptions.fulfilmentUsd)} fulfilment. Selected listings; not an avoided-loss rate. None received BUY.</p>
        ${tableView('Apparent bargains after costs', ['Listing', 'Ask', 'FlipForge value', 'Modeled net', 'Modeled result', 'Decision'], rows.map(r => [r.card, money(r.ask), money(r.value), money(r.net), (r.result < 0 ? '−' : '+') + money(Math.abs(r.result)), r.verdict]))}
      </figure>`;
}

function dashboard(cx) {
  const order = ['listings-evaluated', 'records-examined', 'records-qualified', 'records-held', 'records-rejected', 'evidence-excluded',
    'valuation-diagnostic', 'modeled-losses-three', 'apparent-bargains-unprofitable', 'synthetic-acceptance', 'independent-outcomes-measured'];
  const metrics = order.filter(id => cx.can(id) && id !== 'independent-outcomes-measured').map(cx.get);
  if (!metrics.length) return '';
  const verified = cx.get('independent-outcomes-measured');
  const rows = [...metrics, verified].map(f => `          <tr data-rx-class="${esc(f.classification)}"><th scope="row">${esc(f.label)}${cx.chip(f)}</th><td>${esc(f.display)}</td><td><span class="ff-rx-class">${esc(cx.label(f.classification))}</span></td><td>${esc(f.sample)}</td></tr>`).join('\n');
  const unreconciled = cx.preview ? cx.data.findings.filter(f => f.publication.status === 'UNRECONCILED') : [];
  const recon = unreconciled.length ? `
      <div class="ff-rx-recon" role="note">
        <p class="ff-rx-chip" data-rx-status="UNRECONCILED">Preview only · not shown as figures</p>
        <ul>${unreconciled.map(f => `<li><strong>${esc(f.label)}:</strong> requested ${esc(f.display)}. ${esc(f.method)}</li>`).join('')}</ul>
      </div>` : '';
  const legend = Object.entries(cx.data.classifications).map(([k, v]) => `<li><span class="ff-rx-class">${esc(cx.label(k))}</span> ${esc(v)}</li>`).join('');
  return `<section class="ff-rx ff-rx-dash" id="decision-advantage" aria-labelledby="ff-rx-dash-title" data-rx-section="proof-dashboard">
    <div class="ff-proof-page-wrap ff-rx-wide">
      <p class="ff-rx-eyebrow">Research center · as of ${esc(cx.data.asOf)}</p>
      <h2 id="ff-rx-dash-title" class="ff-rx-title">The FlipForge Decision Advantage</h2>
      <p class="ff-rx-sub">What our November 2026 research measured, what it modeled, and what is still pending. Each figure carries its own label.</p>
      <div class="ff-rx-table-wrap" tabindex="0" role="region" aria-label="Research findings table">
        <table class="ff-rx-metrics">
          <caption class="ff10-sr">FlipForge Decision Advantage research findings</caption>
          <thead><tr><th scope="col">Research metric</th><th scope="col">Result</th><th scope="col">Type</th><th scope="col">Sample</th></tr></thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>${recon}
      <div class="ff-rx-charts">
      ${qualificationChart(cx)}
      ${diagnosticChart(cx)}
      ${economicsChart(cx)}
      </div>
      ${cx.attribution(metrics)}
      <ul class="ff-rx-legend" aria-label="How to read these findings">${legend}</ul>
    </div>
  </section>`;
}

function accountability(cx) {
  const a = cx.data.accountability;
  const verified = cx.get('independent-outcomes-measured');
  const steps = a.horizons.map(h => `        <li class="ff-rx-step" data-rx-horizon="${esc(h.key)}" data-rx-state="${esc(h.status)}">
          <span class="ff-rx-step-day">${esc(h.label)}</span>
          <strong>${esc(h.title)}</strong>
          <p>${esc(h.copy)}</p>
          <em class="ff-rx-state">${esc(h.statusText)}</em>${h.due ? `<small>${esc(h.due)}</small>` : ''}
        </li>`).join('\n');
  return `<section class="ff-rx ff-rx-acct" id="accountability" aria-labelledby="ff-rx-acct-title" data-rx-section="accountability">
    <div class="ff-proof-page-wrap ff-rx-wide">
      <p class="ff-rx-eyebrow">Day 0 · 7 · 14 · 30</p>
      <h2 id="ff-rx-acct-title" class="ff-rx-title">A decision you can hold accountable.</h2>
      <ol class="ff-rx-timeline">
${steps}
      </ol>
      <p class="ff-rx-method"><strong>${esc(verified.label)}: ${esc(verified.display)}.</strong> ${esc(a.rule)}</p>
    </div>
  </section>`;
}

function files(cx) {
  const fileOk = file => {
    const pub = file.publication || {status: 'INTERNAL_PREVIEW', blockers: ['Founder publication approval']};
    const parts = [...file.findings.map(cx.get), ...(file.caseStudy ? [cx.cases.get(file.caseStudy)] : [])];
    return (approved({publication: pub}) && parts.every(approved)) || (cx.preview && parts.every(p => showable(p, true)));
  };
  const list = cx.data.decisionFiles.filter(fileOk);
  if (!list.length) return '';
  const cards = list.map(f => `        <article class="ff-rx-file" data-rx-file="${esc(f.number)}">
          <p class="ff-rx-file-n">Decision File ${esc(f.number)}${cx.preview && !approved(f) ? ' <span class="ff-rx-chip">Preview · not approved</span>' : ''}</p>
          <h3>${esc(f.title)}</h3>
          <p>${esc(f.summary)}</p>
          <dl><div><dt>Research dates</dt><dd>${esc(f.researchDates)}</dd></div><div><dt>Sample</dt><dd>${esc(f.sampleSize)}</dd></div></dl>
          <a class="ff-rx-file-cta" href="beta-application.html" data-rx-file-cta="${esc(f.number)}">${esc(f.cta)} <span aria-hidden="true">→</span></a>
        </article>`).join('\n');
  return `<section class="ff-rx ff-rx-files" id="decision-files" aria-labelledby="ff-rx-files-title" data-rx-section="decision-files">
    <div class="ff-proof-page-wrap ff-rx-wide">
      <p class="ff-rx-eyebrow">FlipForge Decision Files</p>
      <h2 id="ff-rx-files-title" class="ff-rx-title">Research you can check.</h2>
      <p class="ff-rx-sub">Each file states its dates, sample, method and limitations. Historical cases are labelled as modeled, never as realized results.</p>
      <div class="ff-rx-file-grid">
${cards}
      </div>
    </div>
  </section>`;
}

// ---- assembly ---------------------------------------------------------------------------------------------------

export function render(data, {preview = false} = {}) {
  const cx = context(data, preview);
  return {
    homeLead: [strip(cx), caseStudy(cx), difference(cx)].filter(Boolean).join('\n\n'),
    homeAdvantage: homeAdvantage(cx),
    proofResearch: [dashboard(cx), accountability(cx), files(cx)].filter(Boolean).join('\n\n')
  };
}

export function inject(page, key, html) {
  const [start, end] = BLOCKS[key];
  const i = page.indexOf(start);
  const j = page.indexOf(end);
  if (i < 0 || j < i) throw new Error(`Markers for ${key} are missing or out of order`);
  return page.slice(0, i + start.length) + (html ? '\n' + html + '\n' : '\n') + page.slice(j);
}

function pages(data, preview) {
  const blocks = render(data, {preview});
  let home = fs.readFileSync(HOME, 'utf8');
  home = inject(home, 'homeLead', blocks.homeLead);
  home = inject(home, 'homeAdvantage', blocks.homeAdvantage);
  let proof = fs.readFileSync(PROOF, 'utf8');
  proof = inject(proof, 'proofResearch', blocks.proofResearch);
  return {home, proof};
}

function previewWrap(html, data) {
  const banner = `<div class="ff-rx-preview-banner" role="note"><strong>INTERNAL PREVIEW</strong> Research content v${esc(data.version)} · not approved for publication · never deployed</div>`;
  return html
    .replace('<head>', '<head>\n<base href="/">\n<meta name="robots" content="noindex,nofollow">')
    .replace(/<body([^>]*)>/, (m, attrs) => `<body${attrs} data-rx-preview>\n${banner}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const data = load();
  const args = new Set(process.argv.slice(2));
  if (args.has('--preview')) {
    const {home, proof} = pages(data, true);
    fs.mkdirSync(PREVIEW_DIR, {recursive: true});
    fs.writeFileSync(path.join(PREVIEW_DIR, 'index.html'), previewWrap(home, data));
    fs.writeFileSync(path.join(PREVIEW_DIR, 'decision-proof.html'), previewWrap(proof, data));
    console.log(`research preview written to ${PREVIEW_DIR}/ (git-ignored; never deployed)`);
  } else {
    const {home, proof} = pages(data, false);
    if (args.has('--check')) {
      const drift = [[HOME, home], [PROOF, proof]].filter(([file, next]) => fs.readFileSync(file, 'utf8') !== next).map(([file]) => file);
      if (drift.length) {
        console.error(`Research blocks drifted from ${SOURCE}: ${drift.join(', ')}. Run node scripts/build-research-sections.mjs`);
        process.exit(1);
      }
      console.log('PASS: research blocks match contracts/research-findings-v1.json');
    } else {
      fs.writeFileSync(HOME, home);
      fs.writeFileSync(PROOF, proof);
      console.log('research blocks written to index.html and decision-proof.html (public: approved findings only)');
    }
  }
}
