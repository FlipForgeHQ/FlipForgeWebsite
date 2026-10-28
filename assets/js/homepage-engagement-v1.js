/* FlipForge homepage engagement counts (v1). Counts, never people: how often the hero links to the Decision Challenge
 * and Inside FlipForge are used, and how often each of those sections is actually reached on screen.
 * Sent through the existing allowlisted ff:conversion channel (event, page, placement only). No storage, no identifiers. */
(() => {
  'use strict';
  const track = (event, placement) => document.dispatchEvent(new CustomEvent('ff:conversion', {detail: {event, placement}}));

  document.querySelectorAll('[data-ff-hero-jump]').forEach(link => {
    link.addEventListener('click', () => track('hero_jump_clicked', `hero-${link.dataset.ffHeroJump}`));
  });

  // A section counts as reached once per page view, when at least 35% of it has been on screen.
  const sections = [['[data-ff-challenge]', 'challenge'], ['#inside-the-app', 'inside-app']]
    .map(([selector, placement]) => [document.querySelector(selector), placement])
    .filter(([element]) => element);
  if (!sections.length || !('IntersectionObserver' in window)) return;
  const seen = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const placement = entry.target.dataset.ffEngagement;
      if (seen.has(placement)) return;
      seen.add(placement);
      observer.unobserve(entry.target);
      track('section_viewed', placement);
    });
  }, {threshold: 0.35});
  sections.forEach(([element, placement]) => { element.dataset.ffEngagement = placement; observer.observe(element); });
})();
