// Renders the homepage "Different goals. Same need for proof." section from marketing/content/audience-messaging.json
// into index.html between the ff-audiences markers. `--check` fails when index.html has drifted from the JSON.
import fs from 'node:fs';

const SOURCE = 'marketing/content/audience-messaging.json';
const PAGE = 'index.html';
const START = '<!-- ff-audiences:start (generated from marketing/content/audience-messaging.json by scripts/build-homepage-audiences.mjs; edit the JSON, not this block) -->';
const END = '<!-- ff-audiences:end -->';

const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function render(data) {
  const home = data.homepage;
  const byKey = new Map(data.audiences.map(a => [a.key, a]));
  const audiences = home.order.map(key => {
    const audience = byKey.get(key);
    if (!audience || !audience.homepage) throw new Error(`Audience ${key} has no homepage content.`);
    return audience;
  });
  const stageKeys = home.framework.map(stage => stage.key);
  const [lead, ...rest] = home.title.split('. ');
  const title = rest.length ? `${esc(lead)}. <span>${esc(rest.join('. '))}</span>` : esc(home.title);

  const tabs = audiences.map((a, i) => {
    const h = a.homepage;
    return `      <button type="button" class="ff10-aud-tab" role="tab" id="ff10-aud-tab-${a.key}" aria-controls="ff10-aud-panel-${a.key}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-aud-tab="${a.key}"><span class="ff10-aud-tab-n">${String(i + 1).padStart(2, '0')}</span><strong>${esc(h.label)}</strong><small>${esc(h.goal)}</small></button>`;
  }).join('\n');

  const panels = audiences.map(a => {
    const h = a.homepage;
    for (const key of stageKeys) if (!h.signals[key]) throw new Error(`Audience ${a.key} is missing the ${key} signal.`);
    for (const key of h.focus) if (!stageKeys.includes(key)) throw new Error(`Audience ${a.key} focuses on unknown stage ${key}.`);
    const signals = home.framework.map((stage, i) => {
      const focus = h.focus.includes(stage.key);
      return `            <li class="ff10-aud-signal${focus ? ' ff10-aud-focus' : ''}" data-stage="${stage.key}"><span class="ff10-step-n">${i + 1}</span><div><strong>${esc(stage.name)}${focus ? ' <em class="ff10-aud-key">Key signal</em>' : ''}</strong><p>${esc(h.signals[stage.key])}</p></div></li>`;
    }).join('\n');
    return `      <article class="ff10-aud-panel" role="tabpanel" id="ff10-aud-panel-${a.key}" aria-labelledby="ff10-aud-tab-${a.key}" tabindex="0" data-aud-panel="${a.key}">
        <div class="ff10-aud-lead">
          <p class="ff10-aud-eyebrow">${esc(h.label)} · ${esc(h.goal)}</p>
          <h3 class="ff10-aud-headline">${esc(h.headline)}</h3>
          <div class="ff10-aud-question"><span>The decision</span><p>“${esc(h.question)}”</p></div>
          <div class="ff10-aud-problem"><span>The problem</span><p>${esc(a.pain)}</p></div>
        </div>
        <div class="ff10-aud-frame">
          <p class="ff10-aud-frame-label">The FlipForge framework <em>Decision signals for ${esc(h.label.toLowerCase())}</em></p>
          <ol class="ff10-aud-signals">
${signals}
          </ol>
          <div class="ff10-aud-why"><span>Why it matters</span><p>${esc(h.why)}</p></div>
        </div>
      </article>`;
  }).join('\n');

  return `${START}
<section class="ff10-aud" id="who-its-for" aria-labelledby="ff10-aud-title" data-ff-aud>
  <div class="ff10-wrap">
    <div class="ff10-aud-head">
      <h2 id="ff10-aud-title" class="ff10-display ff10-display-md">${title}</h2>
      <p class="ff10-lede">${esc(home.lede)}</p>
    </div>
    <div class="ff10-aud-tabs" role="tablist" aria-label="Choose how you approach cards">
${tabs}
    </div>
    <div class="ff10-aud-panels">
${panels}
    </div>
    <p class="ff10-aud-note">${esc(home.disclosure)}</p>
  </div>
</section>
${END}`;
}

export function expected() {
  return render(JSON.parse(fs.readFileSync(SOURCE, 'utf8')));
}

export function current(page) {
  const a = page.indexOf(START.slice(0, 24));
  const b = page.indexOf(END);
  return a < 0 || b < 0 ? null : page.slice(a, b + END.length);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const page = fs.readFileSync(PAGE, 'utf8');
  const block = expected();
  const existing = current(page);
  if (process.argv.includes('--check')) {
    if (existing !== block) {
      console.error('index.html audience section is out of date: run node scripts/build-homepage-audiences.mjs');
      process.exit(1);
    }
    console.log('Homepage audience section matches marketing/content/audience-messaging.json.');
  } else {
    if (existing === null) throw new Error('Audience markers not found in index.html.');
    fs.writeFileSync(PAGE, page.replace(existing, block));
    console.log('Homepage audience section rendered.');
  }
}
