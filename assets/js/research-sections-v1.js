/* FlipForge research sections (v1). Counters, chart tooltips and engagement counts for the blocks rendered from
 * contracts/research-findings-v1.json. Final values are already in the HTML: this only animates them.
 * Counts, never people: events go through the existing allowlisted ff:conversion channel (event, page, placement).
 * No external media, no provider calls, no device storage. */
(() => {
  'use strict';
  const track = (event, placement) => document.dispatchEvent(new CustomEvent('ff:conversion', {detail: {event, placement}}));
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
