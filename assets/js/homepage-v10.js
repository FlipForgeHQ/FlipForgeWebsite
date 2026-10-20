/* FlipForge homepage v10. Illustrative-only, deterministic decision scenario for a fictional card.
 * No external media, no provider calls, no device storage. Every number below is an assumption shown on the page. */
(() => {
  'use strict';

  const MODEL = {resale: 500, fees: 60, shipping: 15, margin: 65};
  const MAX_BUY = MODEL.resale - MODEL.fees - MODEL.shipping - MODEL.margin; // 360
  const dollars = n => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');

  function decide(ask, unresolved) {
    const gap = ask - MAX_BUY;
    const profit = MODEL.resale - MODEL.fees - MODEL.shipping - ask;
    const roi = 100 * profit / ask;
    let verdict, reason;
    if (unresolved) {
      verdict = 'VERIFY';
      reason = 'The evidence is unresolved. No price is safe to pay until it’s checked.';
    } else if (gap <= -25) {
      verdict = 'BUY';
      reason = `${dollars(-gap)} below Max Buy, backed by qualifying sales. Your margin is covered.`;
    } else if (gap < 0) {
      verdict = 'WATCH';
      reason = `Only ${dollars(-gap)} below Max Buy. A thin cushion, so wait for a better price.`;
    } else if (gap === 0) {
      verdict = 'WATCH';
      reason = 'Right at Max Buy. Any extra cost erases your margin.';
    } else if (gap <= 20) {
      verdict = 'WATCH';
      reason = `${dollars(gap)} above Max Buy. Close, but your margin isn’t there yet.`;
    } else {
      verdict = 'PASS';
      reason = `The asking price is ${dollars(gap)} above Max Buy. Your margin isn’t there.`;
    }
    return {gap, profit, roi, verdict, reason};
  }

  /* ---------- Interactive demo ---------- */
  const demo = document.querySelector('[data-ffdemo]');
  if (demo) {
    const input = demo.querySelector('[data-asking]');
    const uncertainty = demo.querySelector('[data-uncertainty]');
    const reset = demo.querySelector('[data-reset]');
    const marker = demo.querySelector('[data-max-marker]');
    const buyZone = demo.querySelector('[data-zone="buy"]');
    const min = Number(input.min), max = Number(input.max), initial = Number(input.value);
    const pct = v => ((v - min) / (max - min) * 100).toFixed(3) + '%';
    const q = sel => demo.querySelector(sel);
    let unresolved = false;

    marker.style.left = pct(MAX_BUY);
    buyZone.style.width = pct(MAX_BUY);

    const sync = (key, text) => document.querySelectorAll(`[data-ff10-sync="${key}"]`).forEach(el => { el.textContent = text; });

    function render() {
      const ask = Number(input.value);
      const r = decide(ask, unresolved);
      q('[data-ask-value]').textContent = dollars(ask);
      q('[data-price-gap]').textContent = signed(r.gap);
      q('[data-price-gap-explain]').textContent = r.gap > 0 ? 'Above Max Buy' : r.gap < 0 ? 'Below Max Buy' : 'At Max Buy';
      q('[data-profit]').textContent = dollars(r.profit);
      q('[data-roi]').textContent = (r.roi < 0 ? '−' : '') + Math.abs(r.roi).toFixed(1) + '%';
      const verdict = q('[data-verdict]');
      verdict.textContent = r.verdict;
      verdict.dataset.verdictState = r.verdict;
      q('[data-decision-explanation]').textContent = r.reason;
      input.style.setProperty('--ff10-fill', pct(ask));
      input.setAttribute('aria-valuetext', `${dollars(ask)} asking price. Decision ${r.verdict}.`);
      demo.dataset.verdict = r.verdict;
      uncertainty.setAttribute('aria-pressed', String(unresolved));
      uncertainty.textContent = unresolved ? 'Evidence unresolved. Resolve it' : 'Make the evidence unresolved';
      reset.textContent = `Reset to ${dollars(initial)}`;

      // The hero decision panel shows the same scenario.
      sync('ask', dollars(ask));
      sync('gap', signed(r.gap));
      sync('profit', dollars(r.profit));
      sync('roi', (r.roi < 0 ? '−' : '') + Math.abs(r.roi).toFixed(1) + '% ROI');
      sync('verdict', r.verdict);
      sync('reason', r.reason);
      document.querySelectorAll('[data-ff10-sync="verdict"]').forEach(el => { el.dataset.verdict = r.verdict; });
    }

    input.addEventListener('input', render);
    uncertainty.addEventListener('click', () => { unresolved = !unresolved; render(); });
    reset.addEventListener('click', () => { input.value = String(initial); unresolved = false; render(); input.focus({preventScroll: true}); });
    render();
  }

  /* ---------- Hero: one orchestrated lock-on, played once ---------- */
  const hero = document.querySelector('[data-ff10-hero]');
  if (hero) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      hero.classList.add('ff10-locked');
    } else {
      hero.classList.add('ff10-armed');
      const io = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) {
          io.disconnect();
          requestAnimationFrame(() => hero.classList.add('ff10-locked'));
        }
      }, {threshold: 0.25});
      io.observe(hero);
    }
  }
})();
