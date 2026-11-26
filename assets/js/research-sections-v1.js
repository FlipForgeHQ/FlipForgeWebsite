/* FlipForge research sections (v1). Counters, chart tooltips and engagement counts for the blocks rendered from
 * contracts/research-findings-v1.json. Final values are already in the HTML: this only animates them.
 * Counts, never people: events go through the existing allowlisted ff:conversion channel (event, page, placement).
 * No external media, no provider calls, no device storage. */
(() => {
  'use strict';
  const track = (event, placement) => document.dispatchEvent(new CustomEvent('ff:conversion', {detail: {event, placement}}));
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Research illustrations mirror only the approved values already rendered by the contract.
  // The existing visible text remains authoritative; graphics are decorative, never a second data source.
  const svgNode = (tag, attrs = {}) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  };
  const art = (viewBox, cls) => svgNode('svg', {viewBox, class: cls, 'aria-hidden': 'true', focusable: 'false'});
  const slab = (x, y, lost) => {
    const g = svgNode('g', {transform: 'translate(' + x + ' ' + y + ')', class: lost ? 'ff-rx-art-loss' : 'ff-rx-art-other'});
    g.append(svgNode('rect', {x:0,y:0,width:62,height:94,rx:5,class:'ff-rx-art-frame'}),
      svgNode('rect', {x:6,y:6,width:50,height:16,rx:2,class:'ff-rx-art-label'}),
      svgNode('path', {d:'M12 12h27m-27 5h19',class:'ff-rx-art-detail'}),
      svgNode('rect', {x:6,y:28,width:50,height:60,rx:2,class:'ff-rx-art-image'}),
      svgNode('path', {d:'M9 76 50 35M9 86 53 42',class:'ff-rx-art-detail'}),
      svgNode('circle', {cx:31,cy:59,r:14,class:'ff-rx-art-medallion'}),
      svgNode('path', {d:lost?'M25 53l12 12m0-12L25 65':'M25 59h12',class:'ff-rx-art-mark'}));
    return g;
  };
  const bargain = document.querySelector('.ff-rx-strip .ff-rx-stat[data-rx-finding="apparent-bargains-unprofitable"]');
  const count = bargain && bargain.querySelector('[data-rx-count]');
  if (count) {
    const suffix = /^\s*of\s+(\d+)\s*$/.exec(count.dataset.rxSuffix || '');
    const losses = Number(count.dataset.rxCount);
    const total = suffix ? Number(suffix[1]) : 0;
    if (Number.isInteger(losses) && losses >= 0 && total >= 1 && total <= 12 && losses <= total) {
      const cols = Math.min(total, 4);
      const graphic = art('0 0 ' + (cols * 76) + ' ' + (Math.ceil(total / cols) * 108), 'ff-rx-art ff-rx-art-slabs');
      for (let i = 0; i < total; i++) graphic.append(slab(7 + (i % cols) * 76, 5 + Math.floor(i / cols) * 108, i < losses));
      bargain.prepend(graphic);
    }
  }
  const economics = document.querySelector('.ff-rx-strip .ff-rx-stat[data-rx-finding="modeled-losses-three"]');
  if (economics) {
    const value = economics.querySelector('[data-rx-count]');
    const basis = economics.querySelector('small');
    const match = basis && /\$([\d,]+(?:\.\d+)?)\s+of asking prices/.exec(basis.textContent);
    const loss = value ? Number(value.dataset.rxCount) : NaN;
    const ask = match ? Number(match[1].replace(/,/g, '')) : NaN;
    if (Number.isFinite(loss) && Number.isFinite(ask) && ask > 0 && loss >= 0 && loss <= ask) {
      const graphic = art('0 0 304 108', 'ff-rx-art ff-rx-art-economics');
      graphic.append(svgNode('path',{d:'M12 15h280M12 41h280M12 67h280M12 93h280',class:'ff-rx-art-grid'}),
        svgNode('rect',{x:12,y:20,width:280,height:18,rx:3,class:'ff-rx-art-ask'}),
        svgNode('rect',{x:12,y:70,width:280,height:18,rx:3,class:'ff-rx-art-track'}),
        svgNode('rect',{x:12,y:70,width:280*loss/ask,height:18,rx:3,class:'ff-rx-art-lossbar'}));
      economics.prepend(graphic);
    }
  }
  // Editorial case-file illustrations: abstract icons, not card identities or outcome claims.
  document.querySelectorAll('.ff-rx-file').forEach(file => {
    const number = file.dataset.rxFile;
    if (number !== '03' && number !== '04') return;
    const graphic = art('0 0 320 96', 'ff-rx-art ff-rx-art-file');
    graphic.append(svgNode('path',{d:'M12 16h296M12 40h296M12 64h296M12 88h296',class:'ff-rx-art-grid'}));
    if (number === '03') {
      graphic.append(svgNode('rect',{x:110,y:10,width:100,height:76,rx:6,class:'ff-rx-art-frame'}),
        svgNode('path',{d:'M124 25h72M124 37h45M124 49h60M124 61h31',class:'ff-rx-art-detail'}),
        svgNode('circle',{cx:203,cy:65,r:17,class:'ff-rx-art-medallion'}),
        svgNode('path',{d:'M197 65h12',class:'ff-rx-art-mark'}));
    } else {
      graphic.append(svgNode('path',{d:'M46 48h228',class:'ff-rx-art-connector'}));
      [46,122,198,274].forEach(x=>graphic.append(svgNode('circle',{cx:x,cy:48,r:10,class:'ff-rx-art-frame'})));
    }
    file.prepend(graphic);
  });

  // Counters: animate from zero to the value already printed, once, when 60% visible. Reduced motion: no animation.
  const format = (el, n) => {
    const decimals = Number(el.dataset.rxDecimals || 0);
    const text = n.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
    return `${el.dataset.rxPrefix || ''}${text}${el.dataset.rxSuffix || ''}`;
  };
  const counters = [...document.querySelectorAll('[data-rx-count]')];
  if (counters.length && !reduce && 'IntersectionObserver' in window) {
    const finals = new Map(counters.map(el => [el, el.textContent]));
    const run = el => {
      const target = Number(el.dataset.rxCount);
      if (!Number.isFinite(target)) return;
      const start = performance.now();
      const duration = 1100;
      const step = now => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = t < 1 ? format(el, target * eased) : finals.get(el);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.6) return;
      io.unobserve(entry.target);
      run(entry.target);
    }), {threshold: 0.6});
    counters.forEach(el => io.observe(el));
  }

  // Chart tooltips: hover or keyboard focus on a mark's hit target shows its value.
  let tip = null;
  const show = target => {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'ff-rx-tip';
      tip.setAttribute('role', 'status');
      document.body.append(tip);
    }
    tip.textContent = target.dataset.rxTip;
    const r = target.getBoundingClientRect();
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 10)}px`;
  };
  const hide = () => { if (tip) tip.hidden = true; };
  document.querySelectorAll('[data-rx-tip]').forEach(el => {
    el.addEventListener('mouseenter', () => show(el));
    el.addEventListener('focus', () => show(el));
    el.addEventListener('mouseleave', hide);
    el.addEventListener('blur', hide);
  });
  window.addEventListener('scroll', hide, {passive: true});

  // Engagement: a section is counted as reached once its heading is at least 35% visible.
  const sections = [...document.querySelectorAll('[data-rx-section]')];
  if (sections.length && 'IntersectionObserver' in window) {
    const seen = new Set();
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.35) return;
      const placement = entry.target.dataset.rxPlacement;
      io.unobserve(entry.target);
      if (seen.has(placement)) return;
      seen.add(placement);
      track('research_viewed', placement);
    }), {threshold: 0.35});
    sections.forEach(section => {
      const heading = section.querySelector('h2');
      if (!heading) return;
      heading.dataset.rxPlacement = section.dataset.rxSection;
      io.observe(heading);
    });
  }
  document.querySelectorAll('[data-rx-proof-link]').forEach(link => {
    link.addEventListener('click', () => track('decision_proof_clicked', link.dataset.rxProofLink));
  });
  document.querySelectorAll('[data-rx-case-math]').forEach(details => {
    details.addEventListener('toggle', () => { if (details.open) track('case_study_interacted', 'case-study'); });
  });
  document.querySelectorAll('[data-rx-file-cta]').forEach(link => {
    link.addEventListener('click', () => track('decision_file_opened', `file-${link.dataset.rxFileCta}`));
  });
})();
