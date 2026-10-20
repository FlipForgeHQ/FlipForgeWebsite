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
    const heroAsk = document.querySelector('[data-hero-ask]');
    const heroGap = document.querySelector('[data-hero-gap]');
    if (heroAsk) heroAsk.textContent = simple(ask);
    if (heroGap) heroGap.textContent = (outcome.gap>0 ? '+' : outcome.gap<0 ? '−' : '') + simple(Math.abs(outcome.gap));
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

  // A single, silent nine-second product story plays only after the hero enters view.
  // This is not a media file or a real evaluation. Input always takes precedence.
  const storyPause = get('[data-story-pause]');
  const storyReplay = get('[data-story-replay]');
  const storyTry = get('[data-story-try]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let storyObserver = null;
  let storyInterrupted = false;
  let storyAutoPaused = false;
  function launchStory() {
    if (reducedMotion.matches) return;
    if (storyObserver) { storyObserver.disconnect(); storyObserver = null; }
    storyInterrupted = false;
    storyAutoPaused = false;
    root.classList.remove('ffdemo-story-manual', 'ffdemo-story-paused', 'ffdemo-story-playing');
    // Restart CSS choreography and sync the real decision numbers to the visual story.
    void root.offsetWidth;
    input.value = '425';
    unresolved = false;
    render();
    root.classList.add('ffdemo-story-playing');
    storyPause.disabled = false;
    storyPause.textContent = 'Pause';
    storyPause.setAttribute('aria-label', 'Pause the guided example');
  }
  function takeControl() {
    storyInterrupted = true;
    storyAutoPaused = false;
    if (storyObserver) { storyObserver.disconnect(); storyObserver = null; }
    root.classList.remove('ffdemo-story-playing', 'ffdemo-story-paused');
    root.classList.add('ffdemo-story-manual');
    storyPause.disabled = true;
  }
  storyPause.addEventListener('click', () => {
    if (!root.classList.contains('ffdemo-story-playing')) return;
    const paused = root.classList.toggle('ffdemo-story-paused');
    storyPause.textContent = paused ? 'Play' : 'Pause';
    storyPause.setAttribute('aria-label', paused ? 'Resume the guided example' : 'Pause the guided example');
    storyAutoPaused = false;
  });
  storyReplay.addEventListener('click', () => {
    if (reducedMotion.matches) {
      takeControl();
      input.value = String(initial);
      unresolved = false;
      render();
    } else launchStory();
  });
  storyTry.addEventListener('click', () => {
    takeControl();
    input.focus();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && root.classList.contains('ffdemo-story-playing') && !root.classList.contains('ffdemo-story-paused')) {
      root.classList.add('ffdemo-story-paused');
      storyPause.textContent = 'Play';
      storyAutoPaused = true;
    } else if (!document.hidden && storyAutoPaused && !storyInterrupted) {
      root.classList.remove('ffdemo-story-paused');
      storyPause.textContent = 'Pause';
      storyAutoPaused = false;
    }
  });
  reducedMotion.addEventListener?.('change', () => {
    if (reducedMotion.matches) takeControl();
  });
  storyPause.disabled = true;
  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    storyObserver = new IntersectionObserver(entries => {
      if (!storyInterrupted && !document.hidden && entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .2)) {
        launchStory();
      }
    }, {threshold: [.2]});
    storyObserver.observe(root);
  }

  input.addEventListener('input', takeControl);
  input.addEventListener('input', render);
  uncertainty.addEventListener('click', () => { takeControl(); unresolved = !unresolved; render(); });
  reset.addEventListener('click', () => { takeControl(); input.value = String(initial); unresolved = false; render(); input.focus({preventScroll: true}); });
  render();
})();
