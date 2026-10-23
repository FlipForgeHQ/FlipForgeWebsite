/* FlipForge homepage brand film. Same-origin video only; no provider calls, no device storage.
 * Plays once, muted, when the film is mostly in view and holds on the closing lockup.
 * Reduced motion, or a browser that blocks muted autoplay, shows the final lockup with a play button. */
(() => {
  'use strict';

  const video = document.querySelector('[data-ff10-film]');
  if (!video) return;
  const button = document.querySelector('[data-ff10-film-replay]');
  const START = 'assets/images/ff10-film-start.webp';
  const END = 'assets/images/ff10-film-end.webp';

  const offer = label => {
    if (!button) return;
    button.textContent = label;
    button.hidden = false;
  };

  const warm = () => {
    if (video.preload === 'auto') return;
    video.preload = 'auto';
    video.load();
  };

  async function play({ sound }) {
    warm();
    video.muted = !sound;
    try { video.currentTime = 0; } catch (_) { /* metadata not loaded yet: starts at 0 anyway */ }
    try {
      await video.play();
      if (button) button.hidden = true;
    } catch (_) {
      // Low-power modes can refuse even muted autoplay. Show the finished lockup instead of a dark first frame.
      video.poster = END;
      offer('Play with sound');
    }
  }

  button?.addEventListener('click', () => play({ sound: true }));
  video.addEventListener('ended', () => offer('Replay with sound'));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    offer('Play with sound');
    return;
  }

  // The film opens on a near-black frame, so start from it rather than flashing the finished lockup first.
  video.poster = START;

  const nearby = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) {
      nearby.disconnect();
      warm();
    }
  }, { rootMargin: '600px 0px' });
  nearby.observe(video);

  const inView = new IntersectionObserver(entries => {
    if (entries.some(e => e.intersectionRatio >= 0.6)) {
      inView.disconnect();
      play({ sound: false });
    }
  }, { threshold: [0.6] });
  inView.observe(video);
})();
