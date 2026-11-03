/* FlipForge homepage audience selector (v1). Shows one audience at a time inside the same FlipForge framework.
 * Accessible tabs: arrow keys, Home and End move between audiences. Without this script every audience is shown.
 * No external media, no provider calls, no device storage. */
(() => {
  'use strict';
  const root = document.querySelector('[data-ff-aud]');
  if (!root) return;
  const tabs = Array.from(root.querySelectorAll('[data-aud-tab]'));
  const panels = Array.from(root.querySelectorAll('[data-aud-panel]'));
  if (!tabs.length || tabs.length !== panels.length) return;

  function select(index, focus) {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
      panels[i].classList.toggle('ff10-aud-enter', on);
    });
    if (focus) tabs[index].focus();
    // On narrow screens the selector scrolls sideways: keep the chosen audience in view without moving the page.
    const strip = tabs[index].parentElement;
    if (strip.scrollWidth > strip.clientWidth) {
      const left = tabs[index].offsetLeft - strip.offsetLeft;
      if (left < strip.scrollLeft || left + tabs[index].offsetWidth > strip.scrollLeft + strip.clientWidth) {
        strip.scrollTo({left: Math.max(0, left - 20), behavior: 'smooth'});
      }
    }
  }

  const track = (event, placement) => document.dispatchEvent(new CustomEvent('ff:conversion', {detail: {event, placement}}));

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      select(i, false);
      track('audience_selected', `audience-${tab.dataset.audTab}`);
    });
    tab.addEventListener('keydown', event => {
      const last = tabs.length - 1;
      const next = {ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last}[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(next, true);
      track('audience_selected', `audience-${tabs[next].dataset.audTab}`);
    });
  });

  // The hero's visual strategy console updates the decision focus on hover or keyboard focus.
  // Its links still use ordinary anchors, and only click opens the matching existing panel.
  const consoleRoot = document.querySelector('[data-ff-persona-console]');
  const personaPreview = consoleRoot && consoleRoot.querySelector('[data-ff-persona-preview]');
  const personaLinks = consoleRoot ? Array.from(consoleRoot.querySelectorAll('[data-ff-audience-target]')) : [];
  function spotlight(link) {
    if (!personaPreview || !link) return;
    personaPreview.textContent = link.dataset.ffPersonaSummary || '';
    personaLinks.forEach(item => item.dataset.ffPersonaEmphasis = item === link ? 'true' : 'false');
  }
  personaLinks.forEach(link => {
    link.addEventListener('mouseenter', () => spotlight(link));
    link.addEventListener('focus', () => spotlight(link));
  });

  // The native #who-its-for anchor still works without JavaScript.
  document.querySelectorAll('[data-ff-audience-target]').forEach(link => {
    link.addEventListener('click', () => {
      spotlight(link);
      const index = tabs.findIndex(tab => tab.dataset.audTab === link.dataset.ffAudienceTarget);
      if (index < 0) return;
      select(index, false);
      track('audience_selected', `audience-${tabs[index].dataset.audTab}`);
    });
  });

  root.querySelectorAll('[data-aud-cta]').forEach(link => {
    link.addEventListener('click', () => track('beta_cta_clicked', `audience-${link.dataset.audCta}`));
  });

  root.classList.add('ff10-aud-ready');
  select(Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true')), false);
})();
