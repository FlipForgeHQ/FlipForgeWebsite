/* Homepage illustrative-only deterministic financial scenario, no provider calls or storage. */
(() => {
  'use strict';
  const root = document.querySelector('[data-ffdemo]');
  if (!root) return;
  const input = root.querySelector('[data-asking]');
  const uncertainty = root.querySelector('[data-uncertainty]');
  const reset = root.querySelector('[data-reset]');
  const maxBuy = 360, assumedResale = 500, sellingFees = 60, fulfillment = 15, targetProfit = 65;
  const min = Number(input.min), max = Number(input.max), initial = Number(input.value);
  let unresolved = false;
  const get = sel => root.querySelector(sel);
  const money = value => (value < 0 ? '-' : '') + '$' + Math.abs(value).toFixed(2);
  const simple = value => '$' + Number(value).toLocaleString('en-US', {maximumFractionDigits: 0});
  function calculation(ask, unknown) {
    const gap = ask - maxBuy;
    const profit = assumedResale - sellingFees - fulfillment - ask;
    const roi = 100 * profit / ask;
    const decision = unknown ? 'VERIFY' : ask <= maxBuy - 25 ? 'BUY' : ask <= maxBuy + 20 ? 'WATCH' : 'PASS';
    const explanation = unknown
      ? 'Identity or evidence is unresolved. Even an attractive price is not enough to support a buy.'
      : decision === 'BUY'
        ? 'Below Max Buy with sufficient illustrative evidence and room for the target margin.'
        : decision === 'WATCH'
          ? 'Near the supported threshold. Margin is sensitive to costs and uncertainty.'
          : 'Asking price exceeds the scenario’s Max Buy by more than $20; the target margin is not supported.';
    return {gap, profit, roi, decision, explanation};
  }
  function render() {
    const ask = Number(input.value);
    const outcome = calculation(ask, unresolved);
    get('[data-ask-value]').textContent = simple(ask);
    get('[data-price-gap]').textContent = (outcome.gap > 0 ? '+' : outcome.gap < 0 ? '−' : '') + simple(Math.abs(outcome.gap));
    get('[data-price-gap-explain]').textContent = outcome.gap > 0 ? 'Asking price above Max Buy' : outcome.gap < 0 ? 'Asking price below Max Buy' : 'Asking price meets Max Buy';
    get('[data-profit]').textContent = money(outcome.profit);
    get('[data-roi]').textContent = (outcome.roi >= 0 ? '+' : '−') + Math.abs(outcome.roi).toFixed(1) + '%';
    get('[data-verdict]').textContent = outcome.decision;
    get('[data-decision-explanation]').textContent = outcome.explanation;
    root.dataset.verdict = outcome.decision;
    const pct = ((ask - min) / (max - min) * 100).toFixed(3) + '%';
    input.style.setProperty('--ffdemo-fill', pct);
    get('.ffdemo-price-track').style.setProperty('--ffdemo-fill', pct);
    uncertainty.setAttribute('aria-pressed', String(unresolved));
    uncertainty.textContent = unresolved ? 'Evidence unresolved — VERIFY' : 'Test unresolved evidence';
  }
  input.addEventListener('input', render);
  uncertainty.addEventListener('click', () => { unresolved = !unresolved; render(); });
  reset.addEventListener('click', () => { input.value = String(initial); unresolved = false; render(); input.focus({preventScroll: true}); });
  render();
})();
