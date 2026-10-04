/* FlipForge original signature homepage demonstration.
   Visual-only fictional card and evidence. No API calls, no market claims,
   no persistent state, no audio, no customer-auth or evaluation authority. */
(() => {
  'use strict';
  const stage = document.querySelector('[data-ff-signature-stage]');
  if (!stage) return;
  const replay = stage.querySelector('[data-ff-sig-replay]');
  const status = stage.querySelector('[data-ff-sig-status]');
  const count = stage.querySelector('[data-ff-sig-count]');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const phases = [
    { count: '01 / INFORMATION', status: 'A listing enters. A price is just a claim.' },
    { count: '02 / EXACT IDENTITY', status: 'Know precisely which card is being considered.' },
    { count: '03 / EVIDENCE FILTERING', status: 'Wrong matches and duplicates do not get a vote.' },
    { count: '04 / DECISION INTELLIGENCE', status: 'An explainable decision, with uncertainty intact.' }
  ];
  let timer = null;
  let entered = false;

  function render(index) {
    const safe = Math.max(0, Math.min(phases.length - 1, index));
    stage.dataset.phase = String(safe);
    if (count) count.textContent = phases[safe].count;
    if (status) status.textContent = phases[safe].status;
  }

  function stop() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  }

  function sequence(index) {
    stop();
    if (motion.matches || document.hidden) {
      render(phases.length - 1);
      return;
    }
    render(index);
    if (index < phases.length - 1) {
      timer = window.setTimeout(() => sequence(index + 1), 2250);
    }
  }

  if (motion.matches) {
    render(phases.length - 1);
    if (replay) {
      replay.disabled = true;
      replay.textContent = 'Animation disabled';
    }
  } else {
    render(0);
  }

  replay?.addEventListener('click', () => {
    if (!motion.matches) sequence(0);
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entered || !entries.some(entry => entry.isIntersecting)) return;
      entered = true;
      observer.disconnect();
      if (!motion.matches) sequence(0);
    }, { threshold: 0.17 });
    observer.observe(stage);
  } else if (!motion.matches) {
    sequence(0);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
    } else if (entered && !motion.matches && Number(stage.dataset.phase) < 3) {
      sequence(Number(stage.dataset.phase));
    }
  });

  motion.addEventListener?.('change', event => {
    stop();
    if (event.matches) {
      render(phases.length - 1);
      if (replay) {
        replay.disabled = true;
        replay.textContent = 'Animation disabled';
      }
    } else {
      if (replay) {
        replay.disabled = false;
        replay.textContent = '↻ Replay';
      }
      if (entered) sequence(0);
    }
  });
})();
