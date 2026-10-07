/* Homepage-only, illustrative explanation of information → trust → decisions.
   Animation is entirely optional: content stays readable without JavaScript. */
(() => {
  'use strict';
  const section = document.querySelector('.ff-decision-story');
  if (!section) return;
  const replay = section.querySelector('[data-ff-ds-replay]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let played = false;

  function play() {
    if (reduced.matches || document.hidden) return;
    section.classList.remove('is-playing');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (!document.hidden && !reduced.matches) section.classList.add('is-playing');
    }));
  }

  if (reduced.matches && replay) {
    replay.textContent = 'Animation disabled for reduced-motion preference';
    replay.disabled = true;
    replay.setAttribute('aria-disabled','true');
  }

  replay?.addEventListener('click', play);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!played && entries.some(entry => entry.isIntersecting)) {
        played = true;
        play();
        observer.disconnect();
      }
    }, { threshold: 0.22 });
    observer.observe(section);
  } else {
    play();
  }

  reduced.addEventListener?.('change', event => {
    if (event.matches) {
      section.classList.remove('is-playing');
      if (replay) {
        replay.textContent = 'Animation disabled for reduced-motion preference';
        replay.disabled = true;
        replay.setAttribute('aria-disabled','true');
      }
    } else if (replay) {
      replay.textContent = '↻ Replay animation';
      replay.disabled = false;
      replay.removeAttribute('aria-disabled');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) section.classList.remove('is-playing');
  });
})();
