/* FlipForge homepage engagement counts (v1). Counts, never people: how often the hero links to the Decision Challenge
 * and Inside FlipForge are used, and how often each of those sections is actually reached on screen.
 * Sent through the existing allowlisted ff:conversion channel (event, page, placement only). No storage, no identifiers. */
(() => {
  'use strict';
  const track = (event, placement) => document.dispatchEvent(new CustomEvent('ff:conversion', {detail: {event, placement}}));

  document.querySelectorAll('[data-ff-hero-jump]').forEach(link => {
    link.addEventListener('click', () => track('hero_jump_clicked', `hero-${link.dataset.ffHeroJump}`));
  });

  // A whole section may be taller than a phone's viewport, making 35% visibility
  // geometrically impossible. Observe a small meaningful landmark *inside* each
  // section instead: the challenge card heading or the Inside-the-app heading.
  // A reach is counted only after at least 35% of that landmark is visible.
  const threshold = 0.35;
  const sections = [['[data-ff-challenge] h3', 'challenge'], ['#ff10-app-title', 'inside-app']]
    .map(([selector, placement]) => [document.querySelector(selector), placement])
    .filter(([element]) => element);
  if (!sections.length || !('IntersectionObserver' in window)) return;
  const seen = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      // isIntersecting alone is insufficient: browsers can notify on initial
      // 1-pixel entry even when the specified threshold has not been crossed.
      if (!entry.isIntersecting || entry.intersectionRatio < threshold) return;
      const placement = entry.target.dataset.ffEngagement;
      if (!placement || seen.has(placement)) return;
      seen.add(placement);
      observer.unobserve(entry.target);
      track('section_viewed', placement);
    });
  }, {threshold});
  sections.forEach(([element, placement]) => { element.dataset.ffEngagement = placement; observer.observe(element); });
})();
